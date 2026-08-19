import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { runBillingEnforcement } from '../services/billingEnforcementService.js';

const router = Router();

const STATUS_VALUES = ['active', 'trial', 'past_due', 'suspended', 'blocked', 'cancelled'];
const BLOCK_MODE_VALUES = ['auto', 'write', 'hard'];
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const ADMIN_TTL = process.env.PLATFORM_ADMIN_SESSION_TTL || '12h';
const PLATFORM_INVOICE_EVENT = 'platform_invoice_issued';
const PLATFORM_RECEIPT_EVENT = 'platform_receipt_issued';

function parseReminderDays(value, fallback = [7, 3, 1]) {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= 0)
      .sort((a, b) => b - a);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item >= 0)
      .sort((a, b) => b - a);
  }

  return fallback;
}

function getDefaultBillingPolicy() {
  return {
    blockMode: process.env.BILLING_BLOCK_MODE || 'auto',
    graceDays: Number(process.env.BILLING_GRACE_DAYS || 5),
    reminderDays: parseReminderDays(process.env.BILLING_REMINDER_DAYS || '7,3,1'),
  };
}

function getBillingPolicyFromSettings(settings) {
  const defaults = getDefaultBillingPolicy();
  const billingPolicy = settings && typeof settings === 'object' ? settings.billingPolicy : null;

  if (!billingPolicy || typeof billingPolicy !== 'object') {
    return defaults;
  }

  const graceDays = Number.isFinite(Number(billingPolicy.graceDays))
    ? Number(billingPolicy.graceDays)
    : defaults.graceDays;

  return {
    blockMode: BLOCK_MODE_VALUES.includes(billingPolicy.blockMode) ? billingPolicy.blockMode : defaults.blockMode,
    graceDays,
    reminderDays: parseReminderDays(billingPolicy.reminderDays, defaults.reminderDays),
  };
}

function parseMoney(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoney(value) {
  return Math.round(parseMoney(value, 0) * 100) / 100;
}

function buildDocumentCode(prefix) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const sec = String(now.getSeconds()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${prefix}-${yyyy}${mm}${dd}-${hh}${min}${sec}${rand}`;
}

function normalizeInvoiceEvent(event) {
  const metadata = (event.metadata && typeof event.metadata === 'object') ? event.metadata : {};
  const subtotal = toMoney(metadata.subtotal);
  const taxAmount = toMoney(metadata.taxAmount);
  const totalAmount = toMoney(metadata.totalAmount || subtotal + taxAmount);
  const paidAmount = toMoney(metadata.paidAmount);
  const balance = toMoney(Math.max(0, totalAmount - paidAmount));

  return {
    id: event.id,
    invoiceNumber: metadata.invoiceNumber || `INV-${event.id.slice(0, 8).toUpperCase()}`,
    companyId: event.companyId,
    periodStart: metadata.periodStart || null,
    periodEnd: metadata.periodEnd || null,
    dueDate: metadata.dueDate || null,
    currency: metadata.currency || 'DOP',
    subtotal,
    taxRate: parseMoney(metadata.taxRate, 0),
    taxAmount,
    totalAmount,
    paidAmount,
    balance,
    status: metadata.status || (balance <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'pending'),
    notes: event.notes || metadata.notes || null,
    actor: event.actor || null,
    createdAt: event.createdAt,
    updatedAt: metadata.updatedAt || null,
  };
}

function normalizeReceiptEvent(event) {
  const metadata = (event.metadata && typeof event.metadata === 'object') ? event.metadata : {};
  return {
    id: event.id,
    companyId: event.companyId,
    receiptNumber: metadata.receiptNumber || `REC-${event.id.slice(0, 8).toUpperCase()}`,
    invoiceEventId: metadata.invoiceEventId || null,
    invoiceNumber: metadata.invoiceNumber || null,
    amount: toMoney(event.amount ?? metadata.amount),
    paymentMethod: metadata.paymentMethod || 'manual',
    reference: metadata.reference || null,
    paidAt: metadata.paidAt || event.createdAt,
    notes: event.notes || metadata.notes || null,
    actor: event.actor || null,
    createdAt: event.createdAt,
  };
}

function requirePlatformAdmin(req, res, next) {
  const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL || process.env.FIREBASE_MASTER_EMAIL || '').toLowerCase();
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!ownerEmail) {
    return res.status(503).json({ error: 'PLATFORM_OWNER_EMAIL no esta configurado' });
  }

  if (!token) {
    return res.status(401).json({ error: 'No autorizado para panel administrativo' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.scope !== 'platform_admin') {
      return res.status(403).json({ error: 'Token sin permisos de administrador de plataforma' });
    }
    if ((decoded.email || '').toLowerCase() !== ownerEmail) {
      return res.status(403).json({ error: 'Token no corresponde al propietario autorizado' });
    }
    req.platformOwner = { email: decoded.email };
  } catch (error) {
    return res.status(401).json({ error: 'Token de sesión inválido o expirado' });
  }

  next();
}

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

router.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL || process.env.FIREBASE_MASTER_EMAIL || '').toLowerCase();
    const passwordHash = process.env.PLATFORM_OWNER_PASSWORD_HASH || '';
    const fallbackPassword = process.env.PLATFORM_OWNER_PASSWORD || process.env.FIREBASE_MASTER_PASSWORD || '';

    if (!ownerEmail) {
      return res.status(503).json({ error: 'PLATFORM_OWNER_EMAIL no esta configurado' });
    }

    if (data.email.toLowerCase() !== ownerEmail) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    let isValidPassword = false;
    if (passwordHash) {
      isValidPassword = await bcrypt.compare(data.password, passwordHash);
    } else if (fallbackPassword) {
      isValidPassword = data.password === fallbackPassword;
    }

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { email: ownerEmail, scope: 'platform_admin' },
      JWT_SECRET,
      { expiresIn: ADMIN_TTL }
    );

    res.json({
      message: 'Login administrativo exitoso',
      token,
      owner: { email: ownerEmail },
    });
  } catch (error) {
    next(error);
  }
});

router.use(requirePlatformAdmin);

router.get('/session', (req, res) => {
  res.json({
    owner: req.platformOwner,
    valid: true,
  });
});

const updateStatusSchema = z.object({
  status: z.enum(STATUS_VALUES),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  graceUntil: z.string().datetime().optional().nullable(),
  billingPolicy: z.object({
    blockMode: z.enum(BLOCK_MODE_VALUES).optional().nullable(),
    graceDays: z.number().int().min(0).max(365).optional().nullable(),
    reminderDays: z.array(z.number().int().min(0).max(365)).max(15).optional().nullable(),
  }).optional().nullable(),
  actor: z.string().optional().default('owner-session:platform-admin'),
});

const registerPaymentSchema = z.object({
  amount: z.number().positive().optional(),
  invoiceEventId: z.string().uuid().optional().nullable(),
  paymentMethod: z.string().min(2).max(40).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
  receiptNumber: z.string().max(50).optional().nullable(),
  notes: z.string().optional().nullable(),
  paidAt: z.string().datetime().optional().nullable(),
  actor: z.string().optional().default('owner-session:platform-admin'),
});

const issueInvoiceSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  dueDate: z.string().datetime(),
  subtotal: z.number().nonnegative(),
  taxRate: z.number().min(0).max(100).optional().default(0),
  currency: z.string().min(3).max(5).optional().default('DOP'),
  notes: z.string().optional().nullable(),
  actor: z.string().optional().default('owner-session:platform-admin'),
});

/**
 * GET /api/admin/billing/tenants
 * Listado de empresas para panel de control.
 */
router.get('/tenants', async (req, res, next) => {
  try {
    const { status, search } = req.query;

    const where = {};

    if (status && STATUS_VALUES.includes(String(status))) {
      where.billingStatus = String(status);
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { email: { contains: String(search), mode: 'insensitive' } },
        { rnc: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const tenants = await prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        logoUrl: true,
        rnc: true,
        phone: true,
        billingStatus: true,
        billingDueDate: true,
        billingGraceUntil: true,
        billingBlockedAt: true,
        billingBlockedReason: true,
        lastPaymentAt: true,
        settings: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
          }
        }
      },
      orderBy: [
        { billingStatus: 'asc' },
        { name: 'asc' }
      ]
    });

    const withPolicy = tenants.map((tenant) => ({
      ...tenant,
      billingPolicy: getBillingPolicyFromSettings(tenant.settings),
      orderMode: (tenant.settings && typeof tenant.settings === 'object') ? tenant.settings.orderMode : 'craft',
      availableOrderModes: (tenant.settings && typeof tenant.settings === 'object') ? tenant.settings.availableOrderModes : ['craft'],
      settings: undefined,
    }));

    res.json({ data: withPolicy });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/billing/summary
 * Resumen operativo para monitoreo del panel.
 */
router.get('/summary', async (req, res, next) => {
  try {
    const statuses = ['active', 'trial', 'past_due', 'suspended', 'blocked', 'cancelled'];

    const counters = await Promise.all(
      statuses.map(async (status) => ({
        status,
        count: await prisma.company.count({ where: { billingStatus: status } }),
      }))
    );

    const dueSoon = await prisma.company.findMany({
      where: {
        billingStatus: { in: ['active', 'trial', 'past_due'] },
        billingDueDate: { not: null },
      },
      select: {
        id: true,
        name: true,
        billingStatus: true,
        billingDueDate: true,
        billingGraceUntil: true,
      },
      orderBy: { billingDueDate: 'asc' },
      take: 20,
    });

    res.json({
      counters,
      dueSoon,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/billing/tenants/:companyId/status
 * Cambia el estado de facturacion y bloqueo del tenant.
 */
router.patch('/tenants/:companyId/status', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const hasDueDate = Object.prototype.hasOwnProperty.call(req.body || {}, 'dueDate');
    const hasGraceUntil = Object.prototype.hasOwnProperty.call(req.body || {}, 'graceUntil');
    const hasBillingPolicy = Object.prototype.hasOwnProperty.call(req.body || {}, 'billingPolicy');
    const data = updateStatusSchema.parse(req.body);

    const existing = await prisma.company.findUnique({ where: { id: companyId } });
    if (!existing) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const blockedStatuses = ['suspended', 'blocked', 'cancelled'];
    const isBlocked = blockedStatuses.includes(data.status);
    const nextSettings = (existing.settings && typeof existing.settings === 'object')
      ? { ...existing.settings }
      : {};

    if (hasBillingPolicy) {
      if (!data.billingPolicy) {
        delete nextSettings.billingPolicy;
      } else {
        const current = getBillingPolicyFromSettings(existing.settings);
        nextSettings.billingPolicy = {
          blockMode: data.billingPolicy.blockMode || current.blockMode,
          graceDays: data.billingPolicy.graceDays ?? current.graceDays,
          reminderDays: Array.isArray(data.billingPolicy.reminderDays)
            ? parseReminderDays(data.billingPolicy.reminderDays, current.reminderDays)
            : current.reminderDays,
        };
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id: companyId },
        data: {
          billingStatus: data.status,
          billingDueDate: hasDueDate ? (data.dueDate ? new Date(data.dueDate) : null) : existing.billingDueDate,
          billingGraceUntil: hasGraceUntil ? (data.graceUntil ? new Date(data.graceUntil) : null) : existing.billingGraceUntil,
          billingBlockedAt: isBlocked ? new Date() : null,
          billingBlockedReason: isBlocked ? (data.reason || 'Bloqueo administrativo') : null,
          settings: hasBillingPolicy ? nextSettings : existing.settings,
        },
        select: {
          id: true,
          name: true,
          billingStatus: true,
          billingDueDate: true,
          billingGraceUntil: true,
          billingBlockedAt: true,
          billingBlockedReason: true,
          settings: true,
        }
      });

      await tx.companyBillingEvent.create({
        data: {
          companyId,
          eventType: 'status_changed',
          fromStatus: existing.billingStatus,
          toStatus: data.status,
          reason: data.reason || null,
          notes: data.notes || null,
          actor: data.actor,
          metadata: {
            source: 'admin-billing-route',
            blocked: isBlocked,
            billingPolicy: hasBillingPolicy ? nextSettings.billingPolicy || null : null,
          }
        }
      });

      return company;
    });

    res.json({
      message: 'Estado de facturacion actualizado',
      company: {
        ...updated,
        billingPolicy: getBillingPolicyFromSettings(updated.settings),
        settings: undefined,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/billing/tenants/:companyId/payment
 * Registra pago y reactiva tenant.
 */
router.post('/tenants/:companyId/payment', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const data = registerPaymentSchema.parse(req.body);

    const existing = await prisma.company.findUnique({ where: { id: companyId } });
    if (!existing) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const paymentDate = data.paidAt ? new Date(data.paidAt) : new Date();

    const updated = await prisma.$transaction(async (tx) => {
      let invoice = null;

      if (data.invoiceEventId) {
        const invoiceEvent = await tx.companyBillingEvent.findFirst({
          where: {
            id: data.invoiceEventId,
            companyId,
            eventType: PLATFORM_INVOICE_EVENT,
          }
        });

        if (!invoiceEvent) {
          throw new Error('La factura asociada no existe para esta empresa');
        }

        const invoiceMetadata = (invoiceEvent.metadata && typeof invoiceEvent.metadata === 'object')
          ? { ...invoiceEvent.metadata }
          : {};
        const previousPaid = toMoney(invoiceMetadata.paidAmount);
        const totalAmount = toMoney(invoiceMetadata.totalAmount || invoiceMetadata.subtotal);
        const nextPaid = toMoney(previousPaid + (data.amount || 0));
        const balance = toMoney(Math.max(0, totalAmount - nextPaid));
        const nextStatus = balance <= 0 ? 'paid' : nextPaid > 0 ? 'partial' : 'pending';

        const updatedInvoiceEvent = await tx.companyBillingEvent.update({
          where: { id: data.invoiceEventId },
          data: {
            metadata: {
              ...invoiceMetadata,
              paidAmount: nextPaid,
              status: nextStatus,
              updatedAt: paymentDate.toISOString(),
            }
          }
        });

        invoice = normalizeInvoiceEvent(updatedInvoiceEvent);
      }

      const company = await tx.company.update({
        where: { id: companyId },
        data: {
          billingStatus: 'active',
          billingBlockedAt: null,
          billingBlockedReason: null,
          billingGraceUntil: null,
          lastPaymentAt: paymentDate,
        },
        select: {
          id: true,
          name: true,
          billingStatus: true,
          lastPaymentAt: true,
        }
      });

      const paymentEvent = await tx.companyBillingEvent.create({
        data: {
          companyId,
          eventType: 'payment_registered',
          fromStatus: existing.billingStatus,
          toStatus: 'active',
          amount: data.amount,
          notes: data.notes || null,
          actor: data.actor,
          metadata: {
            source: 'admin-billing-route',
            paidAt: paymentDate.toISOString(),
            invoiceEventId: data.invoiceEventId || null,
            paymentMethod: data.paymentMethod || 'manual',
            reference: data.reference || null,
          }
        }
      });

      const receiptEvent = await tx.companyBillingEvent.create({
        data: {
          companyId,
          eventType: PLATFORM_RECEIPT_EVENT,
          amount: data.amount,
          notes: data.notes || null,
          actor: data.actor,
          metadata: {
            source: 'admin-billing-route',
            receiptNumber: data.receiptNumber || buildDocumentCode('REC'),
            paidAt: paymentDate.toISOString(),
            paymentMethod: data.paymentMethod || 'manual',
            reference: data.reference || null,
            invoiceEventId: data.invoiceEventId || null,
            invoiceNumber: invoice?.invoiceNumber || null,
            paymentEventId: paymentEvent.id,
          }
        }
      });

      return {
        company,
        invoice,
        receipt: normalizeReceiptEvent(receiptEvent),
      };
    });

    res.json({
      message: 'Pago registrado y acceso restaurado',
      company: updated.company,
      invoice: updated.invoice,
      receipt: updated.receipt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/billing/tenants/:companyId/invoices
 * Emite una factura de suscripción para una empresa.
 */
router.post('/tenants/:companyId/invoices', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const data = issueInvoiceSchema.parse(req.body);

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const subtotal = toMoney(data.subtotal);
    const taxRate = parseMoney(data.taxRate, 0);
    const taxAmount = toMoney(subtotal * (taxRate / 100));
    const totalAmount = toMoney(subtotal + taxAmount);

    const event = await prisma.companyBillingEvent.create({
      data: {
        companyId,
        eventType: PLATFORM_INVOICE_EVENT,
        amount: totalAmount,
        notes: data.notes || null,
        actor: data.actor,
        metadata: {
          source: 'admin-billing-route',
          invoiceNumber: buildDocumentCode('INV'),
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          dueDate: data.dueDate,
          currency: (data.currency || 'DOP').toUpperCase(),
          subtotal,
          taxRate,
          taxAmount,
          totalAmount,
          paidAmount: 0,
          status: 'pending',
          updatedAt: new Date().toISOString(),
        }
      }
    });

    res.status(201).json({
      message: 'Factura de suscripción emitida',
      invoice: normalizeInvoiceEvent(event),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/billing/tenants/:companyId/documents
 * Lista facturas y recibos de plataforma por empresa.
 */
router.get('/tenants/:companyId/documents', async (req, res, next) => {
  try {
    const { companyId } = req.params;

    const events = await prisma.companyBillingEvent.findMany({
      where: {
        companyId,
        eventType: {
          in: [PLATFORM_INVOICE_EVENT, PLATFORM_RECEIPT_EVENT],
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const invoices = events
      .filter((event) => event.eventType === PLATFORM_INVOICE_EVENT)
      .map(normalizeInvoiceEvent)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const receipts = events
      .filter((event) => event.eventType === PLATFORM_RECEIPT_EVENT)
      .map(normalizeReceiptEvent)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      data: {
        invoices,
        receipts,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/billing/tenants/:companyId/events
 * Historial de eventos de billing por empresa.
 */
router.get('/tenants/:companyId/events', async (req, res, next) => {
  try {
    const { companyId } = req.params;

    const events = await prisma.companyBillingEvent.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ data: events });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/billing/enforce
 * Ejecuta enforcement manual (útil para operación y troubleshooting).
 */
router.post('/enforce', async (req, res, next) => {
  try {
    const actor = req.body?.actor || 'api-key:platform-admin';
    const summary = await runBillingEnforcement(actor);
    res.json({
      message: 'Billing enforcement ejecutado',
      summary,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/billing/tenants/:companyId/order-modes
 * Controla qué modos de pedido están disponibles para una empresa.
 * Solo el propietario de la plataforma puede modificar esto.
 */
router.patch('/tenants/:companyId/order-modes', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { availableOrderModes } = req.body;

    const VALID_MODES = ['craft', 'distributor'];
    if (!Array.isArray(availableOrderModes) || availableOrderModes.length === 0 ||
        !availableOrderModes.every(m => VALID_MODES.includes(m))) {
      return res.status(400).json({ error: 'availableOrderModes debe ser un arreglo con al menos un modo válido: craft, distributor' });
    }

    const existing = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, settings: true } });
    if (!existing) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const currentSettings = (existing.settings && typeof existing.settings === 'object') ? existing.settings : {};
    const currentMode = currentSettings.orderMode || 'craft';

    // Si el modo activo ya no está disponible, cambiarlo al primero disponible
    const newActiveMode = availableOrderModes.includes(currentMode) ? currentMode : availableOrderModes[0];

    const updatedSettings = {
      ...currentSettings,
      availableOrderModes,
      orderMode: newActiveMode,
    };

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { settings: updatedSettings },
      select: { id: true, name: true, settings: true },
    });

    const s = updated.settings || {};
    res.json({
      message: 'Modos de pedido actualizados',
      company: {
        id: updated.id,
        name: updated.name,
        orderMode: s.orderMode || 'craft',
        availableOrderModes: s.availableOrderModes || ['craft'],
      },
    });
  } catch (error) {
    next(error);
  }
});

const sendPlatformEmailSchema = z.object({
  to: z.string().email('Email de destino inválido'),
  subject: z.string().min(1, 'El asunto es requerido'),
  html: z.string().min(1, 'El contenido HTML es requerido'),
  text: z.string().optional()
});

router.post('/send-email', async (req, res, next) => {
  try {
    const data = sendPlatformEmailSchema.parse(req.body);
    const { sendMail } = await import('../services/emailService.js');
    const result = await sendMail({
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text || ''
    });
    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
});

export default router;
