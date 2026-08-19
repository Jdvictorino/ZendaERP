import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

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

    // Obtener ventas en efectivo durante el turno
    const cashSales = await prisma.invoice.aggregate({
      where: {
        companyId: req.companyId,
        paymentMethod: 'efectivo',
        status: { not: 'Anulado' },
        date: {
          gte: shift.openedAt
        }
      },
      _sum: { amountPaid: true }
    });

    const expectedAmount = Number(shift.openingAmount) + 
      (cashSales._sum.amountPaid || 0) + 
      movementTotal;

    const difference = closingAmount - expectedAmount;

    const updatedShift = await prisma.cashShift.update({
      where: { id: req.params.id },
      data: {
        closingAmount,
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
      const invoices = await prisma.invoice.findMany({
        where: {
          companyId: req.companyId,
          date: {
            gte: shift.openedAt,
            lte: shift.closedAt || new Date()
          },
          status: { not: 'Anulado' }
        },
        select: {
          id: true,
          orderNumber: true,
          invoiceNumber: true,
          customerName: true,
          total: true,
          paymentMethod: true,
          amountPaid: true
        }
      });

      const totalEfectivo = invoices
        .filter(i => i.paymentMethod === 'efectivo')
        .reduce((sum, i) => sum + Number(i.amountPaid || 0), 0);
      
      const totalTarjeta = invoices
        .filter(i => i.paymentMethod === 'tarjeta')
        .reduce((sum, i) => sum + Number(i.amountPaid || 0), 0);

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
