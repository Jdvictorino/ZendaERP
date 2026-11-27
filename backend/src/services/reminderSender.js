// Envío de recordatorios de cobro por correo: lo usan la ruta manual y (tarea 4) el automático con userId null.
import defaultPrisma from '../db.js';
import { sendCompanyMail } from './emailService.js';
import { remindersDue, renderReminder, remindersOf } from './collectionReminders.js';
import { todayRD } from './tax.js';

const STALE_MS = 10 * 60 * 1000; // un 'sending' más viejo se considera interrumpido
const EXCLUDED = ['Anulado', 'Cancelado', 'Pagado'];

// Día en RD (UTC-4 fijo) de una marca de tiempo.
export const rdDay = (ts) => new Date(new Date(ts).getTime() - 4 * 3600e3).toISOString().slice(0, 10);

export const reservationPlan = (existing, { now = new Date() } = {}) => {
  if (!existing) return 'create';
  if (existing.status === 'failed') return 'retry';
  if (existing.status === 'sending' && now - new Date(existing.updatedAt) > STALE_MS) return 'retry';
  return 'skip';
};

export const smtpReady = (company) => {
  const s = company?.settings?.smtp;
  return !!(s?.host && s?.user && s?.pass);
};

const escapeHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (text) => escapeHtml(text).replace(/\r?\n/g, '<br>');

// Facturas con saldo posible y los recordatorios de email de esas facturas.
const load = async (prisma, companyId, invoiceIds) => {
  const invoices = await prisma.invoice.findMany({
    where: { companyId, isBilled: true, ...(invoiceIds ? { id: { in: invoiceIds } } : { status: { notIn: EXCLUDED }, customerId: { not: null } }) },
    include: { customer: true },
  });
  const sent = invoices.length
    ? await prisma.collectionReminder.findMany({ where: { invoiceId: { in: invoices.map((i) => i.id) }, channel: 'email' } })
    : [];
  return { invoices, sent };
};

export const dueRows = async ({ prisma = defaultPrisma, company, now = new Date() }) => {
  const { invoices, sent } = await load(prisma, company.id);
  return remindersDue(invoices, { today: todayRD(now), rules: remindersOf(company.settings), sent });
};

export async function sendReminders({ prisma = defaultPrisma, sendMail = sendCompanyMail, company, items, userId = null, now = new Date() }) {
  const today = todayRD(now);
  const rules = remindersOf(company.settings);
  const { invoices, sent } = await load(prisma, company.id, [...new Set(items.map((i) => i.invoiceId))]);
  const rows = remindersDue(invoices, { today, rules, sent });
  const results = [];
  for (const it of items) {
    const base = { invoiceId: it.invoiceId, dueDate: it.dueDate, stage: it.stage };
    const row = rows.find((r) => r.invoiceId === it.invoiceId && r.dueDate === it.dueDate && r.stage === it.stage);
    if (!row) { results.push({ ...base, status: 'skipped', error: 'Ya no corresponde enviarlo' }); continue; }
    if (row.emailStatus !== 'ok') { results.push({ ...base, status: 'skipped', error: 'El cliente no tiene un correo válido' }); continue; }

    const existing = sent.find((x) => x.invoiceId === row.invoiceId && x.stage === row.stage && x.channel === 'email'
      && new Date(x.dueDate).toISOString().slice(0, 10) === row.dueDate);
    const plan = reservationPlan(existing, { now });
    if (plan === 'skip') { results.push({ ...base, status: 'skipped' }); continue; }
    let id;
    if (plan === 'create') {
      try {
        ({ id } = await prisma.collectionReminder.create({
          data: { companyId: company.id, invoiceId: row.invoiceId, customerId: row.customerId, dueDate: new Date(row.dueDate), stage: row.stage, channel: 'email', status: 'sending', to: row.email, sentById: userId },
        }));
      } catch (e) {
        if (e.code === 'P2002') results.push({ ...base, status: 'skipped' });
        else results.push({ ...base, status: 'failed', error: String(e?.message || e).slice(0, 500) });
        continue;
      }
    } else {
      const { count } = await prisma.collectionReminder.updateMany({
        where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt },
        data: { status: 'sending', sentById: userId, to: row.email, error: null, updatedAt: new Date() },
      });
      if (!count) { results.push({ ...base, status: 'skipped' }); continue; }
      id = existing.id;
    }

    // Cada llamada reserva antes de comprobar: si otra reservó o envió esta factura hoy, no salen los dos correos.
    const other = await prisma.collectionReminder.findFirst({
      where: {
        invoiceId: row.invoiceId, channel: 'email', id: { not: id },
        OR: [
          { status: 'sent', updatedAt: { gte: new Date(`${today}T04:00:00Z`) } },
          { status: 'sending', updatedAt: { gte: new Date(now.getTime() - STALE_MS) } },
        ],
      },
      select: { id: true },
    });
    if (other) {
      await save(prisma, id, { status: 'failed', error: 'Ya salió otro recordatorio de esta factura hoy' });
      results.push({ ...base, status: 'skipped' });
      continue;
    }

    let outcome = { status: 'sent' };
    try {
      const { subject, text } = renderReminder(rules, row, company, today);
      await sendMail(company, { to: row.email, subject, text, html: toHtml(text) });
    } catch (e) {
      outcome = { status: 'failed', error: String(e?.message || e).slice(0, 500) };
    }
    await save(prisma, id, { status: outcome.status, error: outcome.error ?? null });
    results.push({ ...base, ...outcome });
  }
  return results;
}

export const autoItems = (rows) => rows.filter((r) => r.emailStatus === 'ok' && !r.failed);

// Hora RD (UTC-4 fijo) de now >= autoHour.
export const shouldRunAuto = (rules, company, now = new Date()) =>
  !!rules.auto && smtpReady(company) && new Date(now.getTime() - 4 * 3600e3).getUTCHours() >= rules.autoHour;

export async function runAutoReminders({ prisma = defaultPrisma, now = new Date(), sendMail } = {}) {
  // shortcut: carga todas las empresas y filtra en memoria; con muchas empresas, pasar a un filtro JSON de Prisma.
  const all = await prisma.company.findMany({ where: { billingStatus: { notIn: ['suspended', 'blocked', 'cancelled'] } } });
  const companies = all.filter((c) => remindersOf(c.settings).auto === true);
  let sent = 0, failed = 0;
  for (const company of companies) {
    try {
      if (!shouldRunAuto(remindersOf(company.settings), company, now)) continue;
      // Máximo 100 ítems por llamada; lo que falte sale en la próxima corrida horaria.
      const items = autoItems(await dueRows({ prisma, company, now })).slice(0, 100)
        .map(({ invoiceId, dueDate, stage }) => ({ invoiceId, dueDate, stage }));
      if (!items.length) continue;
      const res = await sendReminders({ prisma, company, items, userId: null, now, ...(sendMail && { sendMail }) });
      sent += res.filter((r) => r.status === 'sent').length;
      failed += res.filter((r) => r.status === 'failed').length;
    } catch (e) {
      console.error('[reminderSender] error en el envío automático de', company.id, e.message);
    }
  }
  return { companies: companies.length, sent, failed };
}

// Si el update final falla, se registra y la llamada sigue con el siguiente ítem.
async function save(prisma, id, data) {
  try { await prisma.collectionReminder.update({ where: { id }, data }); }
  catch (e) { console.error('[reminderSender] no se pudo guardar el recordatorio', id, e.message); }
}
