import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { normalizeEmail } from '../services/authService.js';
import { nextEmployeeId } from '../services/employeeNumber.js';

const router = Router();
router.use(authenticate);
router.use(authorize('admin')); // Solo admin puede gestionar usuarios

// Los mismos roles que ofrece la app (ROLE_OPTIONS en src/utils/permissions.js)
const ALLOWED_ROLES = ['admin', 'manager', 'supervisor', 'cashier', 'driver', 'accountant', 'viewer'];

const hasOtherActiveAdmin = async (companyId, userId) =>
  (await prisma.user.count({ where: { companyId, role: 'admin', status: 'active', id: { not: userId } } })) > 0;

// Helper para convertir strings vacíos a undefined
const emptyToUndefined = (val) => (val === '' || val === null) ? undefined : val;

const userSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.preprocess(emptyToUndefined, z.string().min(6).optional()),
  firstName: z.preprocess(emptyToUndefined, z.string().optional()),
  lastName: z.preprocess(emptyToUndefined, z.string().optional()),
  // employeeId no se acepta del cliente: lo asigna el servidor al crear (EMP-00001)
  cargo: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
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

    const user = await prisma.$transaction(async (tx) => tx.user.create({
      data: { ...createData, employeeId: await nextEmployeeId(tx, req.companyId) },
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
    }));

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

    // Un administrador solo deja de serlo (o se desactiva) si queda otro administrador activo
    const losesAdmin = existing.role === 'admin' && ((data.role && data.role !== 'admin') || data.status === 'inactive');
    if (losesAdmin && !(await hasOtherActiveAdmin(req.companyId, existing.id))) {
      return res.status(400).json({ error: 'Es el único administrador. Asigna otro administrador antes de cambiar su rol.' });
    }

    // Mapear campos del frontend a la base de datos
    const updateData = {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      cellphone: data.cellphone,
      cargo: data.cargo,
      role: data.role,
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

    // Sin esto conservaría el acceso total del administrador principal aunque cambie de rol
    if (existing.isAdmin && data.role && data.role !== 'admin') updateData.isAdmin = false;

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
    if (user.role === 'admin' && !(await hasOtherActiveAdmin(req.companyId, user.id))) {
      return res.status(400).json({ error: 'Es el único administrador. Asigna otro administrador antes de eliminarlo.' });
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
    if (user.role === 'admin' && status === 'inactive' && !(await hasOtherActiveAdmin(req.companyId, user.id))) {
      return res.status(400).json({ error: 'Es el único administrador. Asigna otro administrador antes de desactivarlo.' });
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
