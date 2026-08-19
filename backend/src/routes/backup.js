import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import backupService from '../services/backupService.js';

const router = Router();
router.use(authenticate);
router.use(authorize('admin')); // Solo admin puede hacer backups

/**
 * GET /api/backup/export
 * Exportar todos los datos de la empresa en JSON
 */
router.get('/export', async (req, res, next) => {
  try {
    const data = await backupService.exportCompanyData(req.companyId);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 
      `attachment; filename="backup_${data.company.name.replace(/\s+/g, '_')}_${Date.now()}.json"`
    );
    
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/backup/export/partial
 * Exportar tablas específicas
 */
router.get('/export/partial', async (req, res, next) => {
  try {
    const { tables } = req.query;
    
    if (!tables) {
      return res.status(400).json({ 
        error: 'Especifica las tablas a exportar',
        availableTables: [
          'products', 'categories', 'customers', 'suppliers',
          'invoices', 'expenses', 'creditNotes', 'debitNotes',
          'cashShifts', 'shipments', 'offers'
        ]
      });
    }

    const tableList = tables.split(',').map(t => t.trim());
    const data = await backupService.exportPartial(req.companyId, tableList);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 
      `attachment; filename="backup_partial_${Date.now()}.json"`
    );
    
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/backup/export/sql
 * Exportar datos en formato SQL
 */
router.get('/export/sql', async (req, res, next) => {
  try {
    const sql = await backupService.exportToSQL(req.companyId);
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 
      `attachment; filename="backup_${Date.now()}.sql"`
    );
    
    res.send(sql);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/backup/summary
 * Obtener resumen de datos de la empresa
 */
router.get('/summary', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const report = await backupService.generateSummaryReport(req.companyId, from, to);
    res.json(report);
  } catch (error) {
    next(error);
  }
});

export default router;
