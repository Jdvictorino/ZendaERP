import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../db.js';
import { sendMail } from './emailService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const BILLING_BLOCK_MODE = process.env.BILLING_BLOCK_MODE || 'auto';
const VALID_BLOCK_MODES = new Set(['auto', 'write', 'hard']);

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function getEmailWhere(email) {
  return {
    equals: email,
    mode: 'insensitive'
  };
}

function getEffectiveBlockMode(company) {
  const mode = company?.settings?.billingPolicy?.blockMode;
  return VALID_BLOCK_MODES.has(mode) ? mode : BILLING_BLOCK_MODE;
}

/**
 * Servicio de autenticación
 * Maneja registro, login, tokens y recuperación de contraseña
 */
export const authService = {
    /**
     * Solicitar recuperación de contraseña
     */
    async forgotPassword(email) {
        const normalizedEmail = normalizeEmail(email);

        if (!normalizedEmail) {
          return true;
        }

      // Buscar usuario
        const user = await prisma.user.findFirst({ where: { email: getEmailWhere(normalizedEmail) } });
      if (!user) {
        // No revelar si existe o no
        return true;
      }

      // Generar token seguro
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hora

      // Guardar token en BD (tabla passwordResetToken)
      await prisma.passwordResetToken?.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken?.create({
        data: {
          userId: user.id,
          token,
          expiresAt: expires
        }
      });

      // Construir enlace de recuperación
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      // Enviar email
      await sendMail({
        to: normalizedEmail,
        subject: 'Recupera tu contraseña',
        html: `<p>Hola,</p><p>Solicitaste restablecer tu contraseña. Haz clic en el siguiente enlace para continuar:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si no solicitaste este cambio, ignora este correo.</p>`,
        text: `Solicitaste restablecer tu contraseña. Enlace: ${resetUrl}`
      });
      return true;
    },
  /**
   * Registrar nueva empresa y usuario administrador
   */
  async register({ email, password, firstName, lastName, companyName, phone, photoUrl, companyLogo, cellphone, idNumber, gender, address, businessType }) {
    const normalizedEmail = normalizeEmail(email);

    // Verificar si el email ya existe
    const existingUser = await prisma.user.findFirst({ where: { email: getEmailWhere(normalizedEmail) } });
    if (existingUser) {
      throw new Error('El correo electrónico ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Determinar modo de pedido según tipo de actividad comercial
    const CRAFT_BUSINESS_TYPES = new Set([
      'restaurante', 'comida_rapida', 'food_truck', 'cafeteria', 'reposteria',
      'tienda_regalos', 'tienda_personalizada', 'libreria', 'floristeria'
    ]);
    const resolvedBusinessType = businessType || 'otro';
    const initialOrderMode = CRAFT_BUSINESS_TYPES.has(resolvedBusinessType) ? 'craft' : 'distributor';

    // Crear empresa y usuario admin en transacción
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName || `Empresa de ${firstName}`,
          email: normalizedEmail,
          phone,
          logoUrl: companyLogo || null,
          billingStatus: 'trial',
          billingDueDate: (() => {
            const date = new Date();
            date.setDate(date.getDate() + 14);
            return date;
          })(),
          settings: {
            orderMode: initialOrderMode,
            availableOrderModes: [initialOrderMode],
            businessType: resolvedBusinessType,
          },
        }
      });

      const user = await tx.user.create({
        data: {
          companyId: company.id,
          email: normalizedEmail,
          passwordHash: hashedPassword,
          firstName,
          lastName,
          phone,
          photoUrl: photoUrl || null,
          isAdmin: true,
          role: 'admin',
          status: 'active',
          cellphone: cellphone || null,
          idNumber: idNumber || null,
          gender: gender || null,
          address: address ? address : {},
        }
      });

      return { company, user };
    });

    // Generar tokens
    const tokens = this.generateTokens(result.user);

    // Guardar refresh token
    await this.saveRefreshToken(result.user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(result.user),
      company: result.company,
      ...tokens
    };
  },

  /**
   * Iniciar sesión
   */
  async login(email, password) {
    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findFirst({
      where: { email: getEmailWhere(normalizedEmail) },
      include: { company: true }
    });

    if (!user) {
      throw new Error('Credenciales inválidas');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Credenciales inválidas');
    }

    if (user.status !== 'active') {
      throw new Error('Tu cuenta está desactivada. Contacta al administrador.');
    }

    const now = new Date();
    const hasGrace = user.company?.billingGraceUntil && new Date(user.company.billingGraceUntil) > now;
    const status = user.company?.billingStatus;
    const mode = getEffectiveBlockMode(user.company);
    const tenantBlocked =
      ['suspended', 'blocked', 'cancelled'].includes(status) ||
      (status === 'past_due' && !hasGrace && mode === 'hard');

    if (tenantBlocked) {
      throw new Error('La cuenta de tu empresa está suspendida por pagos pendientes. Contacta a soporte administrativo.');
    }

    // Actualizar último login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Generar tokens
    const tokens = this.generateTokens(user);

    // Guardar refresh token
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      company: user.company,
      ...tokens
    };
  },

  /**
   * Refrescar access token usando refresh token
   */
  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      
      // Verificar que el refresh token existe en la base de datos
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const storedToken = await prisma.refreshToken.findFirst({
        where: {
          userId: decoded.userId,
          tokenHash,
          expiresAt: { gt: new Date() }
        }
      });

      if (!storedToken) {
        throw new Error('Refresh token inválido o expirado');
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { company: true }
      });

      if (!user || user.status !== 'active') {
        throw new Error('Usuario no encontrado o inactivo');
      }

      // Generar nuevos tokens
      const tokens = this.generateTokens(user);

      // Eliminar token antiguo y guardar nuevo
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      await this.saveRefreshToken(user.id, tokens.refreshToken);

      return {
        user: this.sanitizeUser(user),
        company: user.company,
        ...tokens
      };
    } catch (error) {
      throw new Error('No se pudo refrescar el token');
    }
  },

  /**
   * Cerrar sesión (invalidar refresh token)
   */
  async logout(userId, refreshToken) {
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await prisma.refreshToken.deleteMany({
        where: { userId, tokenHash }
      });
    } else {
      // Si no hay refresh token, eliminar todos los tokens del usuario
      await prisma.refreshToken.deleteMany({
        where: { userId }
      });
    }
    return { success: true };
  },

  /**
   * Cambiar contraseña
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('La contraseña actual es incorrecta');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword }
    });

    // Invalidar todos los refresh tokens (forzar re-login en otros dispositivos)
    await prisma.refreshToken.deleteMany({ where: { userId } });

    return { success: true };
  },

  /**
   * Obtener perfil del usuario actual
   */
  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true }
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    return {
      user: this.sanitizeUser(user),
      company: user.company,
      billing: {
        status: user.company?.billingStatus || 'active',
        dueDate: user.company?.billingDueDate || null,
        graceUntil: user.company?.billingGraceUntil || null,
        blockedReason: user.company?.billingBlockedReason || null,
        lastPaymentAt: user.company?.lastPaymentAt || null,
      }
    };
  },

  /**
   * Actualizar perfil del usuario
   */
  async updateProfile(userId, data) {
    const allowedFields = ['firstName', 'lastName', 'phone', 'photoUrl'];
    const updateData = {};
    
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { company: true }
    });

    return {
      user: this.sanitizeUser(user),
      company: user.company
    };
  },

  // ==================== HELPERS ====================

  /**
   * Generar access y refresh tokens
   */
  generateTokens(user) {
    const accessToken = jwt.sign(
      {
        userId: user.id,
        companyId: user.companyId,
        role: user.role,
        isAdmin: user.isAdmin
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    return { accessToken, refreshToken };
  },

  /**
   * Guardar refresh token en la base de datos
   */
  async saveRefreshToken(userId, refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    // Calcular fecha de expiración
    const expiresAt = new Date();
    const days = parseInt(REFRESH_TOKEN_EXPIRES_IN) || 7;
    expiresAt.setDate(expiresAt.getDate() + days);

    // Limpiar tokens expirados del usuario
    await prisma.refreshToken.deleteMany({
      where: {
        userId,
        expiresAt: { lt: new Date() }
      }
    });

    // Guardar nuevo token
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt
      }
    });
  },

  /**
   * Sanitizar datos del usuario (remover campos sensibles)
   */
  sanitizeUser(user) {
    const { passwordHash, photoUrl, ...safeUser } = user;
    // Mapear photoUrl -> photoURL para el frontend
    return {
      ...safeUser,
      photoURL: photoUrl || null
    };
  }
};

export default authService;
