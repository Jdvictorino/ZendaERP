import jwt from 'jsonwebtoken';
import prisma from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const BILLING_ENFORCEMENT_ENABLED = process.env.BILLING_ENFORCEMENT_ENABLED !== 'false';
const BILLING_BLOCK_MODE = process.env.BILLING_BLOCK_MODE || 'auto'; // auto | write | hard
const VALID_BLOCK_MODES = new Set(['auto', 'write', 'hard']);

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isCompanyBlocked(company) {
  if (!company) return false;

  const now = new Date();
  const hasGrace = company.billingGraceUntil && new Date(company.billingGraceUntil) > now;

  if (['suspended', 'blocked', 'cancelled'].includes(company.billingStatus)) {
    return true;
  }

  if (company.billingStatus === 'past_due' && !hasGrace) {
    return true;
  }

  return false;
}

function getEffectiveBlockMode(company) {
  const mode = company?.settings?.billingPolicy?.blockMode;
  return VALID_BLOCK_MODES.has(mode) ? mode : BILLING_BLOCK_MODE;
}

function shouldBlockRequest(req, company) {
  if (!isCompanyBlocked(company)) return false;

  const method = req.method.toUpperCase();
  const status = company?.billingStatus;
  const effectiveMode = getEffectiveBlockMode(company);
  const now = new Date();
  const hasGrace = company?.billingGraceUntil && new Date(company.billingGraceUntil) > now;
  const pastDueWithoutGrace = status === 'past_due' && !hasGrace;
  const hardStatuses = ['suspended', 'blocked', 'cancelled'];

  if (effectiveMode === 'hard') {
    return true;
  }

  if (effectiveMode === 'write') {
    return WRITE_METHODS.has(method);
  }

  // auto: bloqueo escalonado
  // - past_due (sin gracia): solo lectura
  // - suspended/blocked/cancelled: bloqueo total
  if (pastDueWithoutGrace) {
    return WRITE_METHODS.has(method);
  }

  if (hardStatuses.includes(status)) {
    return true;
  }

  return false;
}

/**
 * Middleware de autenticación - Solo JWT
 * Verifica el token y añade el usuario al request
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    const token = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expirado' });
      }
      return res.status(401).json({ error: 'Token inválido' });
    }
    
    // Buscar usuario en la base de datos
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
        isAdmin: true,
        status: true,
        company: {
          select: {
            id: true,
            name: true,
            billingStatus: true,
            billingDueDate: true,
            billingGraceUntil: true,
            billingBlockedAt: true,
            billingBlockedReason: true,
            lastPaymentAt: true,
            settings: true,
          }
        }
      }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Usuario inactivo' });
    }

    if (BILLING_ENFORCEMENT_ENABLED && shouldBlockRequest(req, user.company)) {
      return res.status(402).json({
        error: 'Acceso bloqueado por estado de pago de la empresa',
        billing: {
          status: user.company?.billingStatus || 'unknown',
          dueDate: user.company?.billingDueDate || null,
          graceUntil: user.company?.billingGraceUntil || null,
          blockedAt: user.company?.billingBlockedAt || null,
          reason: user.company?.billingBlockedReason || 'Pago atrasado'
        },
        mode: getEffectiveBlockMode(user.company),
      });
    }
    
    // Añadir usuario y compañía al request
    req.user = user;
    req.companyId = user.companyId;
    req.company = user.company;
    
    next();
  } catch (error) {
    console.error('Error en autenticación:', error);
    next(error);
  }
};

/**
 * Middleware de autorización por roles
 * Verifica que el usuario tenga uno de los roles permitidos
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    
    // Los administradores siempre tienen acceso
    if (req.user.isAdmin) {
      return next();
    }
    
    // Verificar si el rol del usuario está en los roles permitidos
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'No tienes permiso para realizar esta acción',
        required: allowedRoles,
        current: req.user.role
      });
    }
    
    next();
  };
};

/**
 * Middleware opcional de autenticación
 * No falla si no hay token, pero añade el usuario si existe
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          companyId: true,
          isAdmin: true,
          status: true,
          company: {
            select: {
              id: true,
              name: true,
              billingStatus: true,
              billingDueDate: true,
              billingGraceUntil: true,
              billingBlockedAt: true,
              billingBlockedReason: true,
              lastPaymentAt: true,
              settings: true,
            }
          }
        }
      });
      
      if (user && user.status === 'active') {
        req.user = user;
        req.companyId = user.companyId;
        req.company = user.company;
      }
    } catch (err) {
      // Token inválido, continuar sin usuario
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

export default { authenticate, authorize, optionalAuth };
