import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';

// Carpeta con los archivos que genera electron-builder: latest.yml, instalador .exe y .blockmap
const UPDATES_DIR = path.resolve(process.env.UPDATES_DIR || 'updates');

const router = Router();

/** Versión publicada en el servidor, leída de latest.yml (null si no hay ninguna). */
export function readPublishedRelease() {
  try {
    const yml = fs.readFileSync(path.join(UPDATES_DIR, 'latest.yml'), 'utf8');
    return {
      version: yml.match(/^version:\s*(.+)$/m)?.[1].trim() || null,
      releaseDate: yml.match(/^releaseDate:\s*'?([^'\n]+)/m)?.[1] || null,
    };
  } catch {
    return null;
  }
}

/** Mezcla claves en companies.settings sin pisar cambios hechos en paralelo. */
export function mergeCompanySettings(companyId, patch) {
  return prisma.$executeRaw`UPDATE "companies" SET "settings" = COALESCE("settings", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb WHERE "id" = ${companyId}`;
}

/**
 * GET /api/updates/:file
 * Feed "generic" de electron-updater. Solo lo reciben las empresas con otaUpdates activo
 * en el panel de plataforma; al resto se responde 404 y la app sigue sin actualizarse.
 */
router.get('/:file', authenticate, async (req, res) => {
  const file = path.basename(req.params.file);

  if (file === 'latest.yml') {
    const appVersion = String(req.get('x-app-version') || '').slice(0, 32) || null;
    await mergeCompanySettings(req.companyId, { appVersion, appCheckedAt: new Date().toISOString() })
      .catch((error) => console.error('No se pudo registrar la versión de la app:', error.message));
  }

  if (req.company?.settings?.otaUpdates !== true) {
    return res.status(404).json({ error: 'Actualizaciones no habilitadas para esta empresa' });
  }

  res.sendFile(file, { root: UPDATES_DIR, maxAge: 0 }, (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: 'Archivo de actualización no encontrado' });
  });
});

export default router;
