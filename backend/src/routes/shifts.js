import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Cobros hechos dentro del turno, del desglose de pagos de cada factura (el POS crea la factura con
// amountPaid 0 y el cobro llega luego en payments). Misma regla que src/utils/shiftCash.js.
const VOID_STATUSES = ['Anulado', 'Cancelado'];
const round2 = (n) => Math.round(n * 100) / 100;
// Un cobro con shiftId cuenta solo en ese turno; los anteriores a ese dato, por fecha.
function shiftPayments(invoices, from, shiftId, to = new Date()) {
  const totals = { efectivo: 0, tarjeta: 0, chequeTransferencia: 0, credito: 0 };
  for (const inv of invoices) {
    if (VOID_STATUSES.includes(inv.status)) continue;
    for (const p of Array.isArray(inv.payments) ? inv.payments : []) {
      const t = new Date(p?.date || inv.billedDate || inv.date);
      if (p?.shiftId ? p.shiftId !== shiftId : !(t >= from && t <= to)) continue;
      for (const k in totals) totals[k] += Number(p[k]) || 0;
    }
  }
  return totals;
}
// Un cobro dentro del turno actualiza la factura, así que basta con las tocadas desde la apertura
const shiftInvoices = (companyId, from) => prisma.invoice.findMany({
  where: { companyId, updatedAt: { gte: from }, status: { notIn: VOID_STATUSES } },
  select: { id: true, orderNumber: true, invoiceNumber: true, customerName: true, total: true, paymentMethod: true, amountPaid: true, status: true, date: true, billedDate: true, payments: true }
});

/**
 * GET /api/shifts
 * Listar turnos de caja
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, registerId, from, to } = req.query;
    
    const where = { companyId: req.companyId };
    if (status) where.status = status;
    if (registerId) where.registerId = registerId;
    if (from || to) {
      where.openedAt = {};
      if (from) where.openedAt.gte = new Date(from);
      if (to) where.openedAt.lte = new Date(to);
    }

    const shifts = await prisma.cashShift.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true } },
        movements: true
      },
      orderBy: { openedAt: 'desc' }
    });

    res.json({ data: shifts });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shifts/current
 * Obtener turno abierto actual
 */
router.get('/current', async (req, res, next) => {
  try {
    const { registerId } = req.query;
    
    const where = { 
      companyId: req.companyId,
      status: 'open'
    };
    if (registerId) where.registerId = registerId;

    const shift = await prisma.cashShift.findFirst({
      where,
      include: {
        user: { select: { firstName: true, lastName: true } },
        movements: true
      }
    });

    res.json(shift);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shifts/open
 * Abrir nuevo turno
 */
router.post('/open', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { openingAmount, registerId, notes } = req.body;

    // Verificar que no haya turno abierto en esa caja
    const existingOpen = await prisma.cashShift.findFirst({
      where: {
        companyId: req.companyId,
        registerId: registerId || null,
        status: 'open'
      }
    });

    if (existingOpen) {
      return res.status(400).json({ error: 'Ya hay un turno abierto en esta caja' });
    }

    const shift = await prisma.cashShift.create({
      data: {
        companyId: req.companyId,
        userId: req.user.id,
        registerId,
        openingAmount: openingAmount || 0,
        notes,
        status: 'open'
      },
      include: {
        user: { select: { firstName: true, lastName: true } }
      }
    });

    res.status(201).json(shift);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shifts/:id/close
 * Cerrar turno
 */
router.post('/:id/close', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { closingAmount, notes } = req.body;

    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!shift) {
      return res.status(404).json({ error: 'Turno no encontrado' });
    }

    if (shift.status !== 'open') {
      return res.status(400).json({ error: 'El turno ya está cerrado' });
    }

    // Calcular monto esperado basado en ventas y movimientos
    const movements = await prisma.cashMovement.findMany({
      where: { shiftId: shift.id }
    });

    const movementTotal = movements.reduce((acc, m) => {
      return m.type === 'entrada' ? acc + Number(m.amount) : acc - Number(m.amount);
    }, 0);

    // Efectivo cobrado durante el turno (Prisma devuelve Decimal: todo pasa por Number para no concatenar texto)
    const { efectivo } = shiftPayments(await shiftInvoices(req.companyId, shift.openedAt), shift.openedAt, shift.id);
    const counted = Number(closingAmount) || 0;
    const expectedAmount = round2(Number(shift.openingAmount) + efectivo + movementTotal);
    const difference = round2(counted - expectedAmount);

    const updatedShift = await prisma.cashShift.update({
      where: { id: req.params.id },
      data: {
        closingAmount: counted,
        expectedAmount,
        difference,
        status: 'closed',
        closedAt: new Date(),
        notes: notes ? `${shift.notes || ''}\n${notes}`.trim() : shift.notes
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        movements: true
      }
    });

    res.json(updatedShift);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shifts/:id/movement
 * Registrar movimiento de caja (entrada/salida)
 */
router.post('/:id/movement', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { type, amount, reason } = req.body;

    if (!type || !amount) {
      return res.status(400).json({ error: 'type y amount son requeridos' });
    }

    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!shift) {
      return res.status(404).json({ error: 'Turno no encontrado' });
    }

    if (shift.status !== 'open') {
      return res.status(400).json({ error: 'El turno está cerrado' });
    }

    const movement = await prisma.cashMovement.create({
      data: {
        shiftId: shift.id,
        userId: req.user.id,
        type,
        amount,
        reason
      }
    });

    res.status(201).json(movement);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/shifts/:id
 * Eliminar turno (solo admin, solo turnos cerrados)
 */
router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!shift) {
      return res.status(404).json({ error: 'Turno no encontrado' });
    }

    if (shift.status === 'open') {
      return res.status(400).json({ error: 'No se puede eliminar un turno abierto' });
    }

    await prisma.cashShift.delete({ where: { id: req.params.id } });
    res.json({ message: 'Turno eliminado' });
  } catch (error) {
    next(error);
  }
});

// =============================================
// CIERRES DE CAJA (usando shifts cerrados como base)
// =============================================

/**
 * GET /api/shifts/closings
 * Listar cierres de caja (shifts cerrados con datos de cierre)
 */
router.get('/closings', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    
    const where = { 
      companyId: req.companyId,
      status: 'closed'
    };
    
    if (from || to) {
      where.closedAt = {};
      if (from) where.closedAt.gte = new Date(from);
      if (to) where.closedAt.lte = new Date(to);
    }

    const closings = await prisma.cashShift.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true } },
        movements: true
      },
      orderBy: { closedAt: 'desc' }
    });

    // Calcular datos adicionales para cada cierre
    const closingsWithData = await Promise.all(closings.map(async (shift) => {
      // Obtener facturas del período del turno
      const end = shift.closedAt || new Date();
      const touched = await shiftInvoices(req.companyId, shift.openedAt);
      const { efectivo: totalEfectivo, tarjeta: totalTarjeta } = shiftPayments(touched, shift.openedAt, shift.id, end);
      const invoices = touched.filter(i => i.date >= shift.openedAt && i.date <= end);

      const totalMovimientos = shift.movements.reduce((sum, m) => {
        return m.type === 'entrada' ? sum + Number(m.amount) : sum - Number(m.amount);
      }, 0);

      return {
        id: shift.id,
        createdAt: shift.closedAt,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        registerId: shift.registerId,
        notes: shift.notes,
        user: shift.user,
        totals: {
          totalEfectivo,
          totalTarjeta,
          totalEgresos: shift.movements.filter(m => m.type === 'salida').reduce((s, m) => s + Number(m.amount), 0),
          efectivoEsperado: Number(shift.expectedAmount || 0),
          contado: Number(shift.closingAmount || 0),
          diferencia: Number(shift.difference || 0)
        },
        invoices: invoices.map(i => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber || i.orderNumber,
          customerName: i.customerName,
          total: Number(i.total)
        })),
        egresos: shift.movements.filter(m => m.type === 'salida').map(m => ({
          id: m.id,
          description: m.reason,
          amount: Number(m.amount)
        })),
        managerSignature: shift.notes?.includes('Firmado por:') ? {
          name: shift.notes.split('Firmado por:')[1]?.trim().split('\n')[0] || ''
        } : null
      };
    }));

    res.json({ data: closingsWithData });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shifts/:id/sign
 * Firmar un cierre de caja
 */
router.post('/:id/sign', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { managerName } = req.body;
    
    if (!managerName) {
      return res.status(400).json({ error: 'Nombre del gerente requerido' });
    }

    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!shift) {
      return res.status(404).json({ error: 'Cierre no encontrado' });
    }

    if (shift.status !== 'closed') {
      return res.status(400).json({ error: 'Solo se pueden firmar cierres completados' });
    }

    const updatedNotes = `${shift.notes || ''}\nFirmado por: ${managerName} el ${new Date().toLocaleString()}`.trim();

    const updated = await prisma.cashShift.update({
      where: { id: req.params.id },
      data: { notes: updatedNotes }
    });

    res.json({ message: 'Cierre firmado', shift: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/shifts/daily-close
 * Crear cierre diario de caja (marca facturas y gastos)
 */
router.post('/daily-close', authorize('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { totals, invoiceIds, movementData, manualCashCount, lastMinuteExpenses } = req.body;

    // Crear el cierre como un shift cerrado con datos adicionales
    const closingShift = await prisma.$transaction(async (tx) => {
      // Crear el shift de cierre
      const shift = await tx.cashShift.create({
        data: {
          companyId: req.companyId,
          userId: req.user.id,
          status: 'closed',
          openingAmount: 0,
          closingAmount: manualCashCount || 0,
          expectedAmount: totals?.efectivoEsperado || 0,
          difference: (manualCashCount || 0) - (totals?.efectivoEsperado || 0),
          notes: JSON.stringify({
            type: 'daily_close',
            totals,
            invoiceCount: invoiceIds?.length || 0,
            lastMinuteExpenses
          }),
          closedAt: new Date()
        }
      });

      // Registrar gastos de última hora como movimientos
      if (lastMinuteExpenses?.length) {
        for (const expense of lastMinuteExpenses) {
          await tx.cashMovement.create({
            data: {
              shiftId: shift.id,
              userId: req.user.id,
              type: 'salida',
              amount: expense.amount || 0,
              reason: expense.description || 'Egreso de última hora'
            }
          });
        }
      }

      return shift;
    });

    res.status(201).json(closingShift);
  } catch (error) {
    next(error);
  }
});

export default router;
