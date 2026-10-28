import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
config();
import rateLimit from 'express-rate-limit';

// Rutas
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import customersRoutes from './routes/customers.js';
import suppliersRoutes from './routes/suppliers.js';
import invoicesRoutes from './routes/invoices.js';
import expensesRoutes from './routes/expenses.js';
import categoriesRoutes from './routes/categories.js';
import usersRoutes from './routes/users.js';
import backupRoutes from './routes/backup.js';
import shiftsRoutes from './routes/shifts.js';
import shipmentsRoutes from './routes/shipments.js';
import offersRoutes from './routes/offers.js';
import settingsRoutes from './routes/settings.js';
import alertsRoutes from './routes/alerts.js';
import scannerRoutes from './routes/scanner.js';
import billingRoutes from './routes/billing.js';
import adminBillingRoutes from './routes/adminBilling.js';
import monitoringRoutes from './routes/monitoring.js';
import ecfRoutes from './routes/ecf.js';
import emailRoutes from './routes/email.js';
import adminObservabilityRoutes from './routes/adminObservability.js';
import { observabilityMiddleware, observabilityErrorCapture, log } from './middleware/observability.js';
import { runBillingEnforcement } from './services/billingEnforcementService.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares de seguridad
app.use(helmet({
  contentSecurityPolicy: false // Si usas CSP personalizado, configúralo aquí
}));

// Lista blanca de orígenes permitidos
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://admin.zendaerp.online',
  'https://api.zendaerp.online',
  'https://zendaerp.online',
  'https://www.zendaerp.online',
  'https://app.zendaerp.online',
  'https://localhost:5177',
  'http://localhost:5177',
  'https://localhost:5173',
  'http://localhost:5173',
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // Permite herramientas locales (Postman, curl, server-to-server)
    if (
      allowedOrigins.includes(origin) ||
      /^https?:\/\/(?:[a-zA-Z0-9-]+\.)?zendaerp\.online(?::\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Headers de seguridad adicionales
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
  next();
});

// Rate limiting - más permisivo para desarrollo
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 500, // máximo 500 requests por minuto por IP (desarrollo)
  message: { error: 'Demasiadas solicitudes, intenta más tarde.' }
});
app.use('/api/', limiter);

// Auth tiene su propio rate limit más estricto
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login, intenta en 15 minutos.' }
});
app.use('/api/auth/login', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Observability — captura automática de trazas HTTP (antes de las rutas)
app.use(observabilityMiddleware);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/shipments', shipmentsRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/admin/billing', adminBillingRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/ecf', ecfRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/admin/observability', adminObservabilityRoutes);

// Observability — captura de errores (antes del handler global)
app.use(observabilityErrorCapture);

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: err.errors
    });
  }
  
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token inválido' });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expirado' });
  }
  
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'El registro ya existe' });
  }
  
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Registro no encontrado' });
  }
  
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Capturar errores no manejados para observabilidad
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : null;
  log('error', `Unhandled Rejection: ${message}`, { source: 'process', stack });
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  log('error', `Uncaught Exception: ${error.message}`, { source: 'process', stack: error.stack });
  console.error('Uncaught Exception:', error);
});

app.listen(PORT, () => {
  console.log(`🚀 Zenda ERP API corriendo en http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔭 Observability: http://localhost:${PORT}/api/admin/observability/overview`);

  const schedulerEnabled = process.env.BILLING_ENFORCEMENT_SCHEDULER_ENABLED !== 'false';
  const intervalMinutes = Number(process.env.BILLING_ENFORCEMENT_INTERVAL_MINUTES || 30);

  if (schedulerEnabled) {
    runBillingEnforcement('system:scheduler-startup')
      .then((summary) => {
        console.log('💳 Billing enforcement inicial ejecutado:', summary);
      })
      .catch((error) => {
        console.error('❌ Error en billing enforcement inicial:', error.message);
      });

    setInterval(async () => {
      try {
        const summary = await runBillingEnforcement('system:scheduler-interval');
        console.log('💳 Billing enforcement ejecutado:', summary);
      } catch (error) {
        console.error('❌ Error en billing enforcement programado:', error.message);
      }
    }, Math.max(intervalMinutes, 1) * 60 * 1000);

    console.log(`⏱️ Billing scheduler activo cada ${Math.max(intervalMinutes, 1)} minuto(s).`);
  } else {
    console.log('⏸️ Billing scheduler deshabilitado por configuración.');
  }
});

export default app;
