import { describe, it, expect, vi } from 'vitest';
import { rdDay, reservationPlan, smtpReady, sendReminders } from '../backend/src/services/reminderSender.js';

const now = new Date('2026-12-10T15:00:00Z'); // 11:00 en RD
const ago = (min) => new Date(now.getTime() - min * 60000);
const company = { name: 'Zenda', settings: { smtp: { host: 'h', user: 'u', pass: 'p' } } };
const invoice = (o = {}) => ({
  id: 'i1', ncfNumber: 'B0100000001', status: 'Pendiente', total: 1000, amountPaid: 0, customerId: 'c1',
  paymentTerm: { schedule: [{ dueDate: '2026-12-03', amount: 1000 }] },
  customer: { id: 'c1', name: 'Juan', email: 'juan@correo.com', remindersOff: false }, ...o,
});
const item = { invoiceId: 'i1', dueDate: '2026-12-03', stage: 7 };

const fakePrisma = ({ invoices = [invoice()], reminders = [], createError, other = null, count = 1 } = {}) => {
  const calls = { create: [], update: [], updateMany: [] };
  return {
    calls,
    invoice: { findMany: async () => invoices },
    collectionReminder: {
      findMany: async () => reminders,
      findFirst: async (a) => { calls.findFirst = a; return other; },
      create: async ({ data }) => { calls.create.push(data); if (createError) throw createError; return { id: 'r1', ...data }; },
      update: async (a) => { calls.update.push(a); return {}; },
      updateMany: async (a) => { calls.updateMany.push(a); return { count }; },
    },
  };
};
const run = (prisma, sendMail, items = [item]) => sendReminders({ prisma, sendMail, company, items, userId: 'u1', now });

describe('reminderSender', () => {
  it('rdDay usa UTC-4', () => expect(rdDay('2026-12-11T03:30:00Z')).toBe('2026-12-10'));

  it('reservationPlan', () => {
    expect(reservationPlan(null, { now })).toBe('create');
    expect(reservationPlan({ status: 'failed', updatedAt: ago(1) }, { now })).toBe('retry');
    expect(reservationPlan({ status: 'sending', updatedAt: ago(11) }, { now })).toBe('retry');
    expect(reservationPlan({ status: 'sending', updatedAt: ago(9) }, { now })).toBe('skip');
    expect(reservationPlan({ status: 'sent', updatedAt: ago(99) }, { now })).toBe('skip');
  });

  it('smtpReady', () => {
    expect(smtpReady(company)).toBe(true);
    expect(smtpReady({ settings: { smtp: { host: 'h', user: 'u' } } })).toBe(false);
    expect(smtpReady({})).toBe(false);
  });

  it('envía y marca sent', async () => {
    const p = fakePrisma(); const sendMail = vi.fn(async () => {});
    const r = await run(p, sendMail);
    expect(r).toEqual([{ invoiceId: 'i1', dueDate: '2026-12-03', stage: 7, status: 'sent' }]);
    expect(p.calls.create[0]).toMatchObject({ status: 'sending', channel: 'email', to: 'juan@correo.com', sentById: 'u1', dueDate: new Date('2026-12-03') });
    expect(p.calls.update[0].data).toMatchObject({ status: 'sent' });
    expect(sendMail.mock.calls[0][1]).toMatchObject({ to: 'juan@correo.com', subject: expect.stringContaining('B0100000001') });
  });

  it('si el envío lanza, queda failed con el mensaje', async () => {
    const p = fakePrisma();
    const r = await run(p, async () => { throw new Error('SMTP caído'); });
    expect(r[0]).toMatchObject({ status: 'failed', error: 'SMTP caído' });
    expect(p.calls.update[0].data).toMatchObject({ status: 'failed', error: 'SMTP caído' });
  });

  it('un ítem que ya no toca se omite sin enviar', async () => {
    const sendMail = vi.fn();
    const r = await run(fakePrisma({ invoices: [invoice({ amountPaid: 1000, status: 'Pagado' })] }), sendMail);
    expect(r[0].status).toBe('skipped'); expect(sendMail).not.toHaveBeenCalled();
  });

  it('P2002 en create se omite sin enviar', async () => {
    const sendMail = vi.fn();
    const r = await run(fakePrisma({ createError: Object.assign(new Error('dup'), { code: 'P2002' }) }), sendMail);
    expect(r[0].status).toBe('skipped'); expect(sendMail).not.toHaveBeenCalled();
  });

  it('reintenta una fila failed con updateMany sobre status y updatedAt leídos', async () => {
    const old = { invoiceId: 'i1', dueDate: new Date('2026-12-03'), stage: 7, channel: 'email', status: 'failed', createdAt: ago(300), updatedAt: ago(200) };
    const p = fakePrisma({ reminders: [old] }); const sendMail = vi.fn(async () => {});
    const r = await run(p, sendMail);
    expect(r[0].status).toBe('sent');
    expect(p.calls.updateMany[0]).toMatchObject({ where: { status: 'failed', updatedAt: old.updatedAt }, data: { status: 'sending', sentById: 'u1', error: null } });
  });

  it('si ya salió otro recordatorio de la factura hoy, pasa a failed y no envía', async () => {
    const p = fakePrisma({ other: { id: 'x' } }); const sendMail = vi.fn();
    const r = await run(p, sendMail);
    expect(r[0].status).toBe('skipped'); expect(sendMail).not.toHaveBeenCalled();
    expect(p.calls.findFirst.where).toMatchObject({ invoiceId: 'i1', channel: 'email', id: { not: 'r1' } });
    expect(p.calls.update[0]).toMatchObject({ where: { id: 'r1' }, data: { status: 'failed', error: 'Ya salió otro recordatorio de esta factura hoy' } });
  });

  it('un sending reciente se omite sin enviar', async () => {
    const rec = { invoiceId: 'i1', dueDate: new Date('2026-12-03'), stage: 7, channel: 'email', status: 'sending', createdAt: ago(5), updatedAt: ago(5) };
    const sendMail = vi.fn();
    expect((await run(fakePrisma({ reminders: [rec] }), sendMail))[0].status).toBe('skipped');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('updateMany con count 0 se omite', async () => {
    const old = { invoiceId: 'i1', dueDate: new Date('2026-12-03'), stage: 7, channel: 'email', status: 'failed', createdAt: ago(300), updatedAt: ago(200) };
    const sendMail = vi.fn();
    expect((await run(fakePrisma({ reminders: [old], count: 0 }), sendMail))[0].status).toBe('skipped');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('un ítem con otra etapa se omite', async () => {
    const sendMail = vi.fn();
    expect((await run(fakePrisma(), sendMail, [{ ...item, stage: 15 }]))[0].status).toBe('skipped');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('error de BD distinto de P2002 en create: failed y sigue', async () => {
    const r = await run(fakePrisma({ createError: new Error('BD caída') }), vi.fn());
    expect(r[0]).toMatchObject({ status: 'failed', error: 'BD caída' });
  });

  it('el reintento escribe updatedAt explícito', async () => {
    const old = { invoiceId: 'i1', dueDate: new Date('2026-12-03'), stage: 7, channel: 'email', status: 'failed', createdAt: ago(300), updatedAt: ago(200) };
    const p = fakePrisma({ reminders: [old] });
    await run(p, async () => {});
    expect(p.calls.updateMany[0].data.updatedAt).toEqual(now);
  });
});
