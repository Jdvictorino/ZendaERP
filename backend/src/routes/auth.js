import { Router } from 'express';
import { z } from 'zod';
import authService from '../services/authService.js';
import { authenticate } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import prisma from '../db.js';
import { PASSWORD_MIN } from '../services/security.js';
import { verifyPin } from '../services/pin.js';
import { APPROVERS, issueApproval } from '../services/approvals.js';

const router = Router();

// Schemas de validación
const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(PASSWORD_MIN, 'La contraseña debe tener al menos 8 caracteres'),
  firstName: z.string().min(1, 'Nombre requerido'),
  lastName: z.string().min(1, 'Apellido requerido'),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  photoUrl: z.string().optional(),
  companyLogo: z.string().optional(),
  cellphone: z.string().optional(),
  idNumber: z.string().optional(),
  gender: z.string().optional(),
  cargo: z.string().trim().max(60).optional(),
  businessType: z.string().optional(),
  address: z.union([
    z.object({
      street: z.string().optional(),
      sector: z.string().optional(),
      city: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional()
    }).passthrough(),
    z.string()
  ]).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida')
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual requerida'),
  newPassword: z.string().min(PASSWORD_MIN, 'La contraseña debe tener al menos 8 caracteres')
});

/**
 * POST /api/auth/register
 * Registrar nueva empresa y usuario administrador
 */
router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data);
    
    res.status(201).json({
      message: 'Registro exitoso',
      ...result
    });
  } catch (error) {
    if (error.message === 'El correo electrónico ya está registrado') {
      return res.status(409).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Iniciar sesión
 */
router.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data.email, data.password);
    
    res.json({
      message: 'Login exitoso',
      ...result
    });
  } catch (error) {
    if (error.message === 'Credenciales inválidas' || 
        error.message.includes('desactivada')) {
      return res.status(401).json({ error: error.message });
    }
    if (error.message.includes('suspendida por pagos pendientes')) {
      return res.status(402).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * POST /api/auth/refresh
 * Refrescar access token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token requerido' });
    }
    
    const result = await authService.refreshToken(refreshToken);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: 'No se pudo refrescar el token' });
  }
});

/**
 * POST /api/auth/logout
 * Cerrar sesión
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(req.user.id, refreshToken);
    res.json({ message: 'Sesión cerrada exitosamente' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Obtener perfil del usuario actual
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await authService.getProfile(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/auth/me
 * Actualizar perfil del usuario actual
 */
router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const result = await authService.updateProfile(req.user.id, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});


/**
 * POST /api/auth/forgot-password
 * Solicitar recuperación de contraseña
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    // Llama al servicio (dummy, solo responde 200)
    await authService.forgotPassword(email);
    res.json({ message: 'Si el correo existe, se ha enviado un enlace de recuperación.' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/change-password
 * Cambiar contraseña
 */
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const data = changePasswordSchema.parse(req.body);
    await authService.changePassword(
      req.user.id,
      data.currentPassword,
      data.newPassword
    );
    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    if (error.message === 'La contraseña actual es incorrecta') {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

// 5 PIN fallidos cada 15 min por usuario; va después de authenticate para tener req.user
const approveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Demasiados intentos de PIN, intenta en 15 minutos.' }
});

/**
 * POST /api/auth/approve
 * Un gerente/administrador teclea su PIN y recibe un permiso de un solo uso para una acción
 */
router.post('/approve', authenticate, approveLimiter, async (req, res, next) => {
  try {
    const { pin, action } = req.body || {};
    if (!Object.hasOwn(APPROVERS, action)) return res.status(400).json({ error: 'Acción no válida' });
    if (typeof pin !== 'string') return res.status(400).json({ error: 'PIN requerido' });
    const candidates = await prisma.user.findMany({
      where: { companyId: req.companyId, status: 'active', role: { in: APPROVERS[action] }, pinHash: { not: null } },
      select: { id: true, firstName: true, lastName: true, pinHash: true }
    });
    for (const u of candidates) {
      const { ok, rehash } = await verifyPin(pin, u.pinHash);
      if (!ok) continue;
      if (rehash) await prisma.user.update({ where: { id: u.id }, data: { pinHash: rehash } });
      return res.json({
        approvalToken: issueApproval({ action, companyId: req.companyId, approverId: u.id }),
        approver: { id: u.id, name: `${u.firstName} ${u.lastName}`.trim() }
      });
    }
    res.status(401).json({ error: 'PIN incorrecto' });
  } catch (error) {
    next(error);
  }
});

export default router;
