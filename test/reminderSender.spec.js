import { describe, it, expect, vi } from 'vitest';
import { dueRows, rdDay, reservationPlan, smtpReady, sendReminders, registerWhatsapp, autoItems, shouldRunAuto, runAutoReminders } from '../backend/src/services/reminderSender.js';

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
    invoice: { findMany: async (a) => { calls.invoiceWhere = a.where; return invoices.filter((i) => i.isBilled !== false); } },
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
    expect(p.calls.findFirst.where).toMatchObject({ invoiceId: 'i1', id: { not: 'r1' } });
    expect(p.calls.findFirst.where).not.toHaveProperty('channel');
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

  it('solo se recuerdan facturas facturadas (isBilled: true en el where)', async () => {
    const p = fakePrisma({ invoices: [invoice({ isBilled: false })] }); const sendMail = vi.fn();
    expect(await dueRows({ prisma: p, company, now })).toEqual([]);
    expect(p.calls.invoiceWhere.isBilled).toBe(true);
    expect((await run(p, sendMail))[0].status).toBe('skipped');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('el reintento escribe updatedAt explícito', async () => {
    const old = { invoiceId: 'i1', dueDate: new Date('2026-12-03'), stage: 7, channel: 'email', status: 'failed', createdAt: ago(300), updatedAt: ago(200) };
    const p = fakePrisma({ reminders: [old] });
    await run(p, async () => {});
    expect(p.calls.updateMany[0].data.updatedAt).toBeInstanceOf(Date); // la hora real, no el inicio de la llamada
  });

  describe('registerWhatsapp', () => {
    const withPhone = (phone = '809-555-1234') => invoice({ customer: { ...invoice().customer, phone } });
    const reg = (p) => registerWhatsapp({ prisma: p, company, item, userId: 'u1', now });
    it('reserva la fila whatsapp en sending, la pasa a sent y devuelve la url', async () => {
      const p = fakePrisma({ invoices: [withPhone()] });
      const r = await reg(p);
      expect(r.status).toBe('sent'); expect(r.url.startsWith('https://wa.me/1809')).toBe(true);
      expect(p.calls.create[0]).toMatchObject({ channel: 'whatsapp', status: 'sending', to: '18095551234', sentById: 'u1', dueDate: new Date('2026-12-03') });
      expect(p.calls.update).toEqual([{ where: { id: 'r1' }, data: { status: 'sent' } }]);
    });
    it('si el update final a sent falla, lanza y no hay url (la fila no queda sent)', async () => {
      const p = fakePrisma({ invoices: [withPhone()] });
      p.collectionReminder.update = async () => { throw new Error('BD caída'); };
      await expect(reg(p)).rejects.toThrow('BD caída');
    });
    it('P2002 devuelve skipped', async () => {
      const r = await reg(fakePrisma({ invoices: [withPhone()], createError: Object.assign(new Error('dup'), { code: 'P2002' }) }));
      expect(r.status).toBe('skipped'); expect(r.url).toBeUndefined();
    });
    it('si hoy ya salió otro envío, queda failed y no hay url', async () => {
      const p = fakePrisma({ invoices: [withPhone()], other: { id: 'x' } });
      const r = await reg(p);
      expect(r.status).toBe('skipped'); expect(r.url).toBeUndefined();
      expect(p.calls.findFirst.where).not.toHaveProperty('channel');
      expect(p.calls.update[0]).toMatchObject({ where: { id: 'r1' }, data: { status: 'failed', error: 'Ya salió otro recordatorio de esta factura hoy' } });
    });
    it('sin teléfono válido devuelve skipped', async () => {
      const p = fakePrisma({ invoices: [withPhone('12345')] });
      expect(await reg(p)).toMatchObject({ status: 'skipped', error: 'Sin teléfono válido' });
      expect(p.calls.create).toEqual([]);
    });
    it('un ítem que ya no toca devuelve skipped', async () => {
      expect((await reg(fakePrisma({ invoices: [withPhone()].map((i) => ({ ...i, status: 'Pagado', amountPaid: 1000 })) }))).status).toBe('skipped');
    });
    it('reintenta una fila whatsapp failed con updateMany y devuelve la url', async () => {
      const old = { invoiceId: 'i1', dueDate: new Date('2026-12-03'), stage: 7, channel: 'whatsapp', status: 'failed', createdAt: ago(300), updatedAt: ago(200) };
      const p = fakePrisma({ invoices: [withPhone()], reminders: [old] });
      const r = await reg(p);
      expect(r.status).toBe('sent'); expect(r.url.startsWith('https://wa.me/1809')).toBe(true);
      expect(p.calls.create).toEqual([]);
      expect(p.calls.updateMany[0]).toMatchObject({ where: { status: 'failed', updatedAt: old.updatedAt }, data: { status: 'sending', sentById: 'u1', to: '18095551234', error: null } });
    });
    it('reintento con count 0 devuelve skipped', async () => {
      const old = { invoiceId: 'i1', dueDate: new Date('2026-12-03'), stage: 7, channel: 'whatsapp', status: 'failed', createdAt: ago(300), updatedAt: ago(200) };
      expect((await reg(fakePrisma({ invoices: [withPhone()], reminders: [old], count: 0 }))).status).toBe('skipped');
    });
    it('si otherToday lanza, se relanza y la fila queda sending (nunca sent)', async () => {
      const p = fakePrisma({ invoices: [withPhone()] });
      p.collectionReminder.findFirst = async () => { throw new Error('BD caída'); };
      await expect(reg(p)).rejects.toThrow('BD caída');
      expect(p.calls.update).toEqual([]);
    });
    it('sendReminders: un sent por whatsapp hoy deja el correo en skipped', async () => {
      const wa = { invoiceId: 'i1', dueDate: new Date('2026-12-03'), stage: 7, channel: 'whatsapp', status: 'sent', createdAt: ago(5), updatedAt: ago(5) };
      const sendMail = vi.fn();
      expect((await run(fakePrisma({ reminders: [wa] }), sendMail))[0].status).toBe('skipped');
      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  describe('automático', () => {
    const at9 = new Date('2026-12-10T13:00:00Z'); // 9:00 RD
    const rules = { auto: true, autoHour: 9 };
    it('autoItems omite failed y los sin correo válido', () => {
      const rows = [
        { invoiceId: 'a', emailStatus: 'ok' },
        { invoiceId: 'b', emailStatus: 'ok', failed: true },
        { invoiceId: 'c', emailStatus: 'missing' },
      ];
      expect(autoItems(rows).map((r) => r.invoiceId)).toEqual(['a']);
    });
    it('autoItems: un failed de WhatsApp no bloquea el correo automático', () => {
      const rows = [
        { invoiceId: 'w', emailStatus: 'ok', failed: { channel: 'whatsapp', error: '' } },
        { invoiceId: 'e', emailStatus: 'ok', failed: { channel: 'email', error: 'x' } },
      ];
      expect(autoItems(rows).map((r) => r.invoiceId)).toEqual(['w']);
    });
    it('shouldRunAuto', () => {
      expect(shouldRunAuto({ ...rules, auto: false }, company, at9)).toBe(false);
      expect(shouldRunAuto(rules, { settings: {} }, at9)).toBe(false);
      expect(shouldRunAuto(rules, company, new Date('2026-12-10T12:59:00Z'))).toBe(false);
      expect(shouldRunAuto(rules, company, at9)).toBe(true);
    });
    it('runAutoReminders: un error en una empresa no detiene las demás', async () => {
      const cos = [
        { id: 'x', name: 'X', settings: { ...company.settings, collectionReminders: { auto: true } } },
        { id: 'y', name: 'Y', settings: { ...company.settings, collectionReminders: { auto: true } } },
        { id: 'z', name: 'Z', settings: { collectionReminders: { auto: false } } },
      ];
      let where;
      const prisma = {
        ...fakePrisma(),
        company: { findMany: async (a) => { where = a?.where; return cos; } },
      };
      let n = 0;
      prisma.invoice.findMany = async () => { if (n++ === 0) throw new Error('boom'); return [invoice()]; };
      const sendMail = vi.fn(async () => {});
      const r = await runAutoReminders({ prisma, now: at9, sendMail });
      expect(where).toEqual({ billingStatus: { notIn: ['suspended', 'blocked', 'cancelled'] } });
      expect(r).toEqual({ companies: 2, sent: 1, failed: 0 });
      expect(sendMail).toHaveBeenCalledTimes(1);
    });
  });
});
