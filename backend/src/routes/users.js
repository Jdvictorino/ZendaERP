import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { normalizeEmail } from '../services/authService.js';

const router = Router();
router.use(authenticate);
router.use(authorize('admin')); // Solo admin puede gestionar usuarios

const ALLOWED_ROLES = ['admin', 'manager', 'supervisor', 'cashier', 'driver', 'accountant', 'warehouse', 'viewer'];

// Helper para convertir strings vacíos a undefined
const emptyToUndefined = (val) => (val === '' || val === null) ? undefined : val;

const userSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.preprocess(emptyToUndefined, z.string().min(6).optional()),
  firstName: z.preprocess(emptyToUndefined, z.string().optional()),
  lastName: z.preprocess(emptyToUndefined, z.string().optional()),
  employeeId: z.preprocess(emptyToUndefined, z.string().optional()),
  cargo: z.preprocess(emptyToUndefined, z.string().optional()),
  role: z.enum(ALLOWED_ROLES).default('cashier'),
  phone: z.preprocess(emptyToUndefined, z.string().optional()),
  cellphone: z.preprocess(emptyToUndefined, z.string().optional()),
  photoURL: z.preprocess(emptyToUndefined, z.string().optional()),
  gender: z.preprocess(emptyToUndefined, z.string().optional()),
  idNumber: z.preprocess(emptyToUndefined, z.string().optional()),
  pinHash: z.preprocess(emptyToUndefined, z.string().optional()),
  address: z.any().optional(),
  status: z.enum(['active', 'inactive']).default('active')
});

/**
 * GET /api/users
 * Listar usuarios del equipo
 */
router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { companyId: req.companyId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        cargo: true,
        role: true,
        phone: true,
        cellphone: true,
        photoUrl: true,
        gender: true,
        idNumber: true,
        address: true,
        isAdmin: true,
        status: true,
        lastLogin: true,
        createdAt: true
      },
      orderBy: [
        { isAdmin: 'desc' },
        { firstName: 'asc' }
      ]
    });

    // Mapear photoUrl -> photoURL para el frontend
    const mappedUsers = users.map(u => ({ ...u, photoURL: u.photoUrl }));
    res.json({ data: mappedUsers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        cargo: true,
        role: true,
        phone: true,
        cellphone: true,
        photoUrl: true,
        gender: true,
        idNumber: true,
        address: true,
        isAdmin: true,
        status: true,
        lastLogin: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Mapear photoUrl -> photoURL para el frontend
    res.json({ ...user, photoURL: user.photoUrl });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users
 * Crear nuevo empleado
 */
router.post('/', async (req, res, next) => {
  try {
    const data = userSchema.parse(req.body);
    const normalizedEmail = normalizeEmail(data.email);
    
    // Verificar si el email ya existe
    const existing = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive'
        }
      }
    });
    if (existing) {
      return res.status(409).json({ error: 'El correo electrónico ya está registrado' });
    }

    // Si no hay contraseña, generar una temporal
    const password = data.password || Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(password, 12);

    // Preparar datos para Prisma (mapear photoURL -> photoUrl)
    const { password: _, photoURL, ...rest } = data;
    const createData = {
      ...rest,
      email: normalizedEmail,
      photoUrl: photoURL, // DB usa photoUrl (lowercase)
      passwordHash: hashedPassword,
      companyId: req.companyId
    };

    const user = await prisma.user.create({
      data: createData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        cargo: true,
        role: true,
        status: true
      }
    });

    res.status(201).json({
      user,
      temporaryPassword: data.password ? undefined : password,
      message: data.password 
        ? 'Usuario creado exitosamente' 
        : `Usuario creado. Contraseña temporal: ${password}`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/users/:id
 */
router.put('/:id', async (req, res, next) => {
  try {
    const data = userSchema.partial().parse(req.body);
    
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // No permitir cambiar rol del admin principal
    if (existing.isAdmin && data.role && data.role !== 'admin') {
      return res.status(400).json({ error: 'No se puede cambiar el rol del administrador principal' });
    }

    // Mapear campos del frontend a la base de datos
    const updateData = {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      cellphone: data.cellphone,
      cargo: data.cargo,
      role: data.role,
      employeeId: data.employeeId,
      status: data.status,
      gender: data.gender,
      idNumber: data.idNumber,
      address: data.address,
    };

    // Mapear photoURL -> photoUrl
    if (data.photoURL !== undefined) {
      updateData.photoUrl = data.photoURL;
    }

    // Si hay pinHash, guardarlo
    if (data.pinHash !== undefined) {
      updateData.pinHash = data.pinHash;
    }

    // Eliminar campos undefined
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Si hay nueva contraseña, hashearla
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        cargo: true,
        role: true,
        phone: true,
        cellphone: true,
        photoUrl: true,
        gender: true,
        idNumber: true,
        address: true,
        status: true,
        isAdmin: true
      }
    });

    // Mapear photoUrl -> photoURL para el frontend
    res.json({
      ...user,
      photoURL: user.photoUrl
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/users/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.isAdmin) {
      return res.status(400).json({ error: 'No se puede eliminar al administrador principal' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/users/:id/status
 */
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.isAdmin) {
      return res.status(400).json({ error: 'No se puede desactivar al administrador principal' });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, email: true, status: true }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
