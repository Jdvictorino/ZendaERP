import prisma from '../db.js';

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function plusDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getReminderDays() {
  const envValue = process.env.BILLING_REMINDER_DAYS || '7,3,1';
  return envValue
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .sort((a, b) => b - a);
}

function getCompanyPolicy(settings, defaults) {
  const billingPolicy = settings && typeof settings === 'object' ? settings.billingPolicy : null;
  if (!billingPolicy || typeof billingPolicy !== 'object') {
    return defaults;
  }

  const graceDays = Number.isFinite(Number(billingPolicy.graceDays))
    ? Number(billingPolicy.graceDays)
    : defaults.graceDays;

  const reminderDays = Array.isArray(billingPolicy.reminderDays)
    ? billingPolicy.reminderDays
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= 0)
      .sort((a, b) => b - a)
    : defaults.reminderDays;

  return {
    graceDays,
    reminderDays,
  };
}

async function createAlertIfMissingToday(companyId, type, title, message) {
  const now = new Date();
  const existing = await prisma.alert.findFirst({
    where: {
      companyId,
      type,
      title,
      createdAt: {
        gte: startOfDay(now),
        lte: endOfDay(now),
      },
    },
  });

  if (existing) return;

  await prisma.alert.create({
    data: {
      companyId,
      type,
      title,
      message,
      targetRoles: ['admin', 'manager'],
      data: {
        source: 'billing-enforcement',
      },
    },
  });
}

export async function runBillingEnforcement(actor = 'system') {
  const now = new Date();
  const defaultGraceDays = toInt(process.env.BILLING_GRACE_DAYS, 5);
  const defaultReminderDays = getReminderDays();
  const defaults = {
    graceDays: defaultGraceDays,
    reminderDays: defaultReminderDays,
  };

  const summary = {
    markedPastDue: 0,
    suspended: 0,
    reminders: 0,
  };

  // 1) Empresas vencidas pasan a past_due y reciben periodo de gracia.
  const overdueCandidates = await prisma.company.findMany({
    where: {
      billingDueDate: { lt: now },
      billingStatus: { in: ['active', 'trial'] },
    },
    select: {
      id: true,
      name: true,
      billingStatus: true,
      billingDueDate: true,
      settings: true,
    },
  });

  for (const company of overdueCandidates) {
    const companyPolicy = getCompanyPolicy(company.settings, defaults);
    const graceDays = companyPolicy.graceDays;
    const graceUntil = plusDays(company.billingDueDate || now, graceDays);

    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: company.id },
        data: {
          billingStatus: 'past_due',
          billingGraceUntil: graceUntil,
          billingBlockedReason: 'Factura vencida',
        },
      });

      await tx.companyBillingEvent.create({
        data: {
          companyId: company.id,
          eventType: 'status_changed',
          fromStatus: company.billingStatus,
          toStatus: 'past_due',
          reason: 'Factura vencida. Periodo de gracia aplicado.',
          actor,
          metadata: {
            graceDays,
            graceUntil: graceUntil.toISOString(),
          },
        },
      });
    });

    await createAlertIfMissingToday(
      company.id,
      'billing_past_due',
      'Factura vencida',
      `Tu empresa entró en estado past_due. Tienes hasta ${graceUntil.toLocaleDateString()} para regularizar el pago.`
    );

    summary.markedPastDue += 1;
  }

  // 2) Empresas en past_due sin gracia pasan a suspended (bloqueo total recomendado).
  const suspendCandidates = await prisma.company.findMany({
    where: {
      billingStatus: 'past_due',
      billingGraceUntil: { not: null, lt: now },
    },
    select: {
      id: true,
      name: true,
      billingStatus: true,
      billingGraceUntil: true,
    },
  });

  for (const company of suspendCandidates) {
    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: company.id },
        data: {
          billingStatus: 'suspended',
          billingBlockedAt: now,
          billingBlockedReason: 'Periodo de gracia vencido',
        },
      });

      await tx.companyBillingEvent.create({
        data: {
          companyId: company.id,
          eventType: 'access_blocked',
          fromStatus: 'past_due',
          toStatus: 'suspended',
          reason: 'Periodo de gracia vencido',
          actor,
          metadata: {
            graceUntil: company.billingGraceUntil,
          },
        },
      });
    });

    await createAlertIfMissingToday(
      company.id,
      'billing_suspended',
      'Acceso suspendido por mora',
      'El acceso de tu empresa fue suspendido por falta de pago. Contacta a administración para reactivar la cuenta.'
    );

    summary.suspended += 1;
  }

  // 3) Recordatorios preventivos de vencimiento (7/3/1 días por defecto).
  const activeCompanies = await prisma.company.findMany({
    where: {
      billingStatus: { in: ['active', 'trial', 'past_due'] },
      billingDueDate: { not: null, gte: now },
    },
    select: {
      id: true,
      name: true,
      billingDueDate: true,
      billingStatus: true,
      settings: true,
    },
  });

  for (const company of activeCompanies) {
    const companyPolicy = getCompanyPolicy(company.settings, defaults);
    const reminderDays = companyPolicy.reminderDays;
    const dueDate = new Date(company.billingDueDate);
    const msDiff = dueDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

    if (!reminderDays.includes(daysLeft)) {
      continue;
    }

    await createAlertIfMissingToday(
      company.id,
      'billing_reminder',
      `Vencimiento en ${daysLeft} día(s)`,
      `La suscripción de tu empresa vence en ${daysLeft} día(s). Evita bloqueo manteniendo el pago al día.`
    );

    await prisma.companyBillingEvent.create({
      data: {
        companyId: company.id,
        eventType: 'reminder_sent',
        fromStatus: company.billingStatus,
        toStatus: company.billingStatus,
        reason: `Recordatorio de vencimiento en ${daysLeft} día(s)`,
        actor,
        metadata: {
          daysLeft,
          dueDate: dueDate.toISOString(),
        },
      },
    });

    summary.reminders += 1;
  }

  return {
    ...summary,
    processedAt: now.toISOString(),
    graceDays: defaultGraceDays,
    reminderDays: defaultReminderDays,
  };
}

export default {
  runBillingEnforcement,
};
