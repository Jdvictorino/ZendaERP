import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as app from '../src/utils/collectionReminders.js';
import * as srv from '../backend/src/services/collectionReminders.js';

const today = '2026-12-10';
const cust = { id: 'c1', name: 'Juan Pérez', email: 'juan@correo.com', remindersOff: false };
const inv = (o = {}) => ({
  id: 'i1', ncfNumber: 'B0100000001', status: 'Pendiente', total: 1000, amountPaid: 0,
  paymentTerm: { schedule: [{ dueDate: '2026-12-03', amount: 1000 }] }, customerId: 'c1', customer: cust, ...o,
});
const sentRow = (o = {}) => ({ invoiceId: 'i1', dueDate: '2026-12-03', stage: 7, channel: 'email', status: 'sent', createdAt: '2026-12-08T15:00:00Z', ...o });

describe.each([['app', app], ['backend', srv]])('collectionReminders (%s)', (_n, m) => {
  const rules = m.DEFAULT_REMINDERS;
  const due = (invoices, sent = []) => m.remindersDue(invoices, { today, rules, sent });

  it('valores iniciales y validación', () => {
    expect(rules).toMatchObject({ auto: false, autoHour: 9, stages: [-3, 0, 7, 15] });
    expect(m.remindersOf(undefined)).toEqual(rules);
    expect(m.remindersOf({ collectionReminders: { auto: true } })).toEqual({ ...rules, auto: true });
    expect(m.validateReminders(rules)).toBeNull();
    for (const bad of [{ stages: [0, 0] }, { stages: [400] }, { stages: [] }, { stages: [1.5] }, { stages: [-61] }, { autoHour: 24 }, { auto: 'si' }, { subject: ' ' }, { body: '' }])
      expect(typeof m.validateReminders({ ...rules, ...bad })).toBe('string');
  });

  it('correo y etiquetas', () => {
    expect(m.isValidEmail('juan@correo.com')).toBe(true);
    expect(m.isValidEmail('juan@')).toBe(false);
    expect(m.stageLabel(-3)).toBe('3 días antes');
    expect(m.stageLabel(0)).toBe('vence hoy');
    expect(m.stageLabel(7)).toBe('7 días de atraso');
    expect(m.stageLabel(-1)).toBe('1 día antes');
    expect(m.stageLabel(1)).toBe('1 día de atraso');
  });

  it('cuota vencida hace 7 días: solo la etapa vigente', () => {
    const [r] = due([inv()]);
    expect(r).toMatchObject({ invoiceId: 'i1', customerId: 'c1', customerName: 'Juan Pérez', email: 'juan@correo.com', emailStatus: 'ok', invoiceNumber: 'B0100000001', dueDate: '2026-12-03', stage: 7, amount: 1000, overdueTotal: 1000, balance: 1000, lastSentAt: null, failed: null });
    expect(due([inv()], [sentRow({ createdAt: '2026-12-05T15:00:00Z' })])).toEqual([]);
    expect(due([inv()], [sentRow({ stage: 0, createdAt: '2026-12-03T15:00:00Z' })])[0].stage).toBe(7);
  });

  it('antes del vencimiento', () => {
    const at = (d) => inv({ paymentTerm: { schedule: [{ dueDate: d, amount: 1000 }] } });
    expect(due([at('2026-12-13')])[0].stage).toBe(-3);
    expect(due([at('2026-12-20')])).toEqual([]);
  });

  it('una sola fila por factura, con el total atrasado', () => {
    const two = inv({ total: 1000, paymentTerm: { schedule: [{ dueDate: '2026-11-20', amount: 500 }, { dueDate: '2026-12-03', amount: 500 }] } });
    const rows = due([two]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dueDate: '2026-11-20', stage: 15, amount: 500, overdueTotal: 1000, balance: 1000 });
  });

  it('un recordatorio enviado el mismo día RD bloquea la factura', () => {
    const two = inv({ paymentTerm: { schedule: [{ dueDate: '2026-11-20', amount: 500 }, { dueDate: '2026-12-03', amount: 500 }] } });
    const other = sentRow({ dueDate: '2026-12-03', stage: 7, createdAt: '2026-12-11T03:30:00Z' });
    expect(due([two], [other])).toEqual([]);
    expect(due([two], [{ ...other, createdAt: '2026-12-11T04:30:00Z' }])).toHaveLength(1);
    expect(due([two], [{ ...other, status: 'failed' }])).toHaveLength(1);
  });

  it('si la cuota más vieja ya envió su etapa, sale la siguiente', () => {
    const two = inv({ paymentTerm: { schedule: [{ dueDate: '2026-11-20', amount: 500 }, { dueDate: '2026-12-03', amount: 500 }] } });
    const old = sentRow({ dueDate: '2026-11-20', stage: 15, createdAt: '2026-12-01T15:00:00Z' });
    const rows = due([two], [old]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dueDate: '2026-12-03', stage: 7, amount: 500, overdueTotal: 1000 });
  });

  it('el servidor entrega fechas Date', () => {
    const d = (s) => new Date(s);
    const s1 = sentRow({ dueDate: d('2026-12-03T12:00:00Z'), createdAt: d('2026-12-05T15:00:00Z'), updatedAt: d('2026-12-05T15:00:01Z') });
    expect(due([inv()], [s1])).toEqual([]);
    // reservada ayer y enviada hoy: cuenta el día RD de updatedAt
    const s2 = sentRow({ dueDate: d('2026-11-20T12:00:00Z'), stage: 15, createdAt: d('2026-12-09T20:00:00Z'), updatedAt: d('2026-12-10T14:00:00Z') });
    expect(due([inv()], [s2])).toEqual([]);
    const a = sentRow({ dueDate: d('2026-11-01T12:00:00Z'), stage: 15, createdAt: d('2026-12-02T15:00:00Z'), updatedAt: d('2026-12-02T15:00:00Z') });
    const b = { ...a, createdAt: d('2026-12-04T15:00:00Z'), updatedAt: d('2026-12-04T15:00:00Z') };
    expect(due([inv()], [b, a])[0].lastSentAt).toEqual(b.createdAt);
  });

  it('un envío en curso cuenta como fallido', () => {
    expect(due([inv()], [sentRow({ status: 'sending' })])[0].failed).toEqual({ error: 'Envío en curso o interrumpido' });
  });

  it('exclusiones', () => {
    expect(due([inv({ customer: null })])).toEqual([]);
    expect(due([inv({ status: 'Anulado' })])).toEqual([]);
    expect(due([inv({ status: 'Cancelado' })])).toEqual([]);
    expect(due([inv({ amountPaid: 1000 })])).toEqual([]);
    expect(due([inv({ customer: { ...cust, remindersOff: true } })])).toEqual([]);
  });

  it('factura vieja sin calendario', () => {
    const old = { id: 'i2', status: 'Pendiente', total: 300, amountPaid: 0, dueDate: '2026-12-10', customer: cust, customerId: 'c1', invoiceNumber: 'F-9' };
    expect(due([old])[0]).toMatchObject({ stage: 0, amount: 300, invoiceNumber: 'F-9' });
  });

  it('estado del correo', () => {
    expect(due([inv({ customer: { ...cust, email: '' } })])[0].emailStatus).toBe('missing');
    expect(due([inv({ customer: { ...cust, email: null } })])[0].emailStatus).toBe('missing');
    expect(due([inv({ customer: { ...cust, email: 'juan@' } })])[0].emailStatus).toBe('invalid');
  });

  it('fallido previo, cobro parcial y último envío', () => {
    const f = sentRow({ status: 'failed', error: 'SMTP caído' });
    expect(due([inv()], [f])[0].failed).toEqual({ error: 'SMTP caído' });
    expect(due([inv({ amountPaid: 400 })])[0]).toMatchObject({ amount: 600, balance: 600 });
    expect(due([inv()], [sentRow({ dueDate: '2026-11-01', stage: 15, createdAt: '2026-12-01T15:00:00Z' })])[0].lastSentAt).toBe('2026-12-01T15:00:00Z');
  });

  it('renderReminder reemplaza todos los marcadores', () => {
    const body = '{cliente}|{empresa}|{factura}|{monto}|{vence}|{dias}|{saldo}|{vencido}|{telefono}|{correo}';
    const r = { ...rules, subject: 'Pago {factura}', body };
    const row = due([inv()])[0];
    const co = { name: 'Mi Empresa', phone: '809-555-0000', email: 'info@mi.com' };
    const out = m.renderReminder(r, row, co, today);
    expect(out.subject).toBe('Pago B0100000001');
    expect(out.text).toBe('Juan Pérez|Mi Empresa|B0100000001|RD$1,000.00|03/12/2026|hace 7 días|RD$1,000.00|RD$1,000.00|809-555-0000|info@mi.com');
    expect(m.renderReminder(r, { ...row, dueDate: '2026-12-10' }, co, today).text).toContain('|hoy|');
    expect(m.renderReminder(r, { ...row, dueDate: '2026-12-13' }, co, today).text).toContain('|en 3 días|');
    expect(m.renderReminder(r, row, { ...co, currency: 'USD' }, today).text).toContain('US$');
    expect(m.renderReminder(r, row, { ...co, currency: 'XX' }, today).text).toContain('RD$');
    expect(m.renderReminder(rules, row, co, today).text).toContain('Saldo vencido: RD$1,000.00');
    expect(m.renderReminder(rules, row, co, today).text).not.toMatch(/\{\w+\}/);
  });
});

it('las dos copias son idénticas desde la línea 2', () => {
  const body = (f) => readFileSync(f, 'utf8').replace(/\r/g, '').split('\n').slice(1).join('\n');
  expect(body('src/utils/collectionReminders.js')).toBe(body('backend/src/services/collectionReminders.js'));
});
