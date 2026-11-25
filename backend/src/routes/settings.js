import express from 'express';
import { PrismaClient } from '@prisma/client';
import { rolesFor } from '../permissions.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { publicSettings, mergeSmtp } from '../services/security.js';
import { withholdingsOf, validateWithholdings } from '../services/withholdings.js';
import { DEFAULT_CUSTOMER_CATEGORIES, planCategoryChanges } from '../services/categoryPrices.js';

const router = express.Router();
const httpError = (status, message) => Object.assign(new Error(message), { status });
const prisma = new PrismaClient();

// Todas las rutas requieren autenticación
router.use(authenticate);

// GET /settings - Obtener configuraciones del usuario/empresa
// Toda escritura de settings toma el mismo bloqueo por empresa que la emisión de NCF (takeNcf en invoices.js)
// y relee la empresa dentro de él: un guardado de Configuración nunca pisa el contador de una secuencia.
const withSettingsLock = (companyId, fn) => prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ncf:${companyId}`}))::text`;
  return fn(tx);
});

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Obtener el usuario con su empresa
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const company = user.company;
    const settings = company.settings || {};
    const notifications = company.notifications || {};

    // Transformar a formato esperado por el frontend (ProfileModal)
    // El frontend espera: name, rnc, address (objeto), phone, email, logo, currency, etc.
    res.json({
      // Campos principales mapeados al formato del frontend
      name: company.name,
      rnc: company.rnc || '',
      phone: company.phone || '',
      email: company.email || '',
      logo: company.logoUrl || '',
      currency: company.currency || 'DOP',
      
      // Address como objeto (o parseado si viene como string)
      address: settings.address || {
        street: company.address || '',
        sector: '',
        city: '',
        zipCode: '',
        country: 'República Dominicana'
      },
      
      // Campos guardados en settings JSON
      allowCustomization: settings.allowCustomization ?? true,
      customerCategories: settings.customerCategories || DEFAULT_CUSTOMER_CATEGORIES,
      pricing: { categoryDiscounts: {}, maxDiscountPercent: 5, ...(settings.pricing || {}) },
      withholdings: withholdingsOf(settings),
      bankDetails: settings.bankDetails || {
        entityType: 'Persona',
        bankName: '',
        beneficiaryName: '',
        beneficiaryId: '',
        accountType: 'Ahorro en Pesos RD$',
        accountNumber: '',
        bankEmail: ''
      },
      cash: settings.cash || {
        tolerance: 0,
        requireSupervisorBeyondTolerance: true,
        registers: [],
        printing: { mode: 'html', printerName: '' }
      },
      notifications: notifications || { sound: { enabled: true, volume: 0.7 } },
      
      // NCF para compatibilidad
      ncf: {
        b01_prefix: company.ncfB01Prefix || '',
        b01_sequence_next: company.ncfB01SequenceNext || 1,
        b02_prefix: company.ncfB02Prefix || '',
        b02_sequence_next: company.ncfB02SequenceNext || 1,
        b03_prefix: settings.ncf?.b03_prefix || '',
        b03_sequence_next: settings.ncf?.b03_sequence_next || 1,
        b04_prefix: settings.ncf?.b04_prefix || '',
        b04_sequence_next: settings.ncf?.b04_sequence_next || 1,
      },

      // Talonarios NCF (Configuración > Secuencias NCF)
      ncfSequences: liveSequences(company),

      // Modo de pedidos
      orderMode: settings.orderMode || 'craft',
      availableOrderModes: settings.availableOrderModes || ['craft'],
      businessType: settings.businessType || 'otro',

      // Configuración de Email (SMTP Propio)
      smtp: publicSettings({ smtp: settings.smtp }).smtp || {
        host: '',
        port: 587,
        secure: false,
        user: '',
        pass: '',
        from: ''
      },
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Error al obtener configuraciones' });
  }
});

// PUT /settings - Actualizar configuraciones generales
router.put('/', authorize('admin', 'manager'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      name, companyName, // name o companyName por compatibilidad
      rnc, phone, address, currency, customerCategories, email, 
      logo, logoUrl, // logo o logoUrl por compatibilidad
      bankDetails, cash, notifications, pricing, allowCustomization,
      ncf, // Secuencias NCF
      orderMode, availableOrderModes, businessType, // Modo de pedidos
      smtp, // Configuración SMTP
      _categoryMigrations,
      withholdings,
    } = req.body;

    if (Array.isArray(customerCategories) && customerCategories.some((c) => !String(c ?? '').trim())) {
      return res.status(400).json({ error: 'Cada categoría necesita un nombre' });
    }

    if (withholdings !== undefined) {
      const bad = validateWithholdings(withholdings);
      if (bad) return res.status(400).json({ error: bad });
    }

    // Obtener el usuario para saber su companyId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const { updated, newSettings, newNotifications } = await withSettingsLock(user.companyId, async (tx) => {
    // Obtener settings y notifications actuales para merge
    const currentCompany = await tx.company.findUnique({
      where: { id: user.companyId },
      select: { settings: true, notifications: true }
    });

    const currentSettings = currentCompany?.settings || {};
    const currentNotifications = currentCompany?.notifications || {};
    
    // Construir nuevo objeto settings con todos los campos extendidos
    const newSettings = { ...currentSettings };
    
    if (customerCategories !== undefined) {
      // Renombres y borrados de categorías: precios siempre; clientes solo si el usuario lo aceptó
      const { renames, merges, removed } = planCategoryChanges(
        currentSettings.customerCategories || DEFAULT_CUSTOMER_CATEGORIES, customerCategories, _categoryMigrations);
      const companyId = user.companyId;
      // Ids primero: los cambios son simultáneos y no se encadenan entre sí
      const moves = [];
      for (const { from, to } of [...renames, ...merges]) {
        const customers = _categoryMigrations.apply === true ? await tx.customer.findMany({ where: { companyId, category: from }, select: { id: true } }) : [];
        const prices = renames.some((r) => r.from === from) ? await tx.categoryPrice.findMany({ where: { companyId, category: { equals: from, mode: 'insensitive' } }, select: { id: true } }) : [];
        moves.push({ to, customers: customers.map((c) => c.id), prices: prices.map((c) => c.id) });
      }
      if (removed.length) await tx.categoryPrice.deleteMany({ where: { companyId, OR: removed.map((x) => ({ category: { equals: x, mode: 'insensitive' } })) } });
      for (const m of moves) {
        if (m.customers.length) await tx.customer.updateMany({ where: { id: { in: m.customers } }, data: { category: m.to } });
        if (m.prices.length) await tx.categoryPrice.updateMany({ where: { id: { in: m.prices } }, data: { category: m.to } });
      }
      newSettings.customerCategories = customerCategories;
    }
    if (address !== undefined) {
      // Guardar la dirección como objeto en settings
      newSettings.address = typeof address === 'object' ? address : { street: address || '' };
    }
    if (bankDetails !== undefined) {
      newSettings.bankDetails = bankDetails;
    }
    if (cash !== undefined) {
      newSettings.cash = cash;
    }
    if (pricing !== undefined) {
      newSettings.pricing = pricing;
    }
    if (allowCustomization !== undefined) {
      newSettings.allowCustomization = allowCustomization;
    }
    if (ncf !== undefined) {
      newSettings.ncf = ncf;
    }
    if (orderMode !== undefined) {
      newSettings.orderMode = orderMode;
    }
    if (availableOrderModes !== undefined) {
      newSettings.availableOrderModes = availableOrderModes;
    }
    if (businessType !== undefined) {
      newSettings.businessType = businessType;
    }
    if (withholdings !== undefined) {
      newSettings.withholdings = withholdings;
    }
    if (smtp !== undefined) {
      newSettings.smtp = mergeSmtp(currentSettings.smtp, smtp);
    }

    // Actualizar notifications si se proporcionan
    const newNotifications = notifications !== undefined 
      ? { ...currentNotifications, ...notifications }
      : currentNotifications;

    // Serializar dirección para el campo address de la tabla
    let addressStr = null;
    if (address) {
      if (typeof address === 'object') {
        const parts = [address.street, address.sector, address.city, address.province, address.zipCode, address.country].filter(Boolean);
        addressStr = parts.join(', ');
      } else {
        addressStr = address;
      }
    }

    // Usar name o companyName, logo o logoUrl
    const finalName = name || companyName;
    const finalLogo = logo || logoUrl;

    // Actualizar la empresa
    const updated = await tx.company.update({
      where: { id: user.companyId },
      data: {
        name: finalName,
        rnc: rnc || null,
        phone: phone || null,
        address: addressStr || null,
        currency: currency || 'DOP',
        email: email || null,
        logoUrl: finalLogo || null,
        settings: newSettings,
        notifications: newNotifications,
      }
    });
    return { updated, newSettings, newNotifications };
    });

    // Devolver respuesta en el mismo formato que GET
    const settings = newSettings;
    res.json({
      name: updated.name,
      rnc: updated.rnc || '',
      phone: updated.phone || '',
      email: updated.email || '',
      currency: updated.currency || 'DOP',
      logo: updated.logoUrl || '',
      address: settings.address || { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana' },
      bankDetails: settings.bankDetails || { bankName: '', accountType: '', accountNumber: '', accountHolder: '' },
      cash: settings.cash || { enabled: true, defaultPaymentMethod: 'Efectivo' },
      notifications: newNotifications || { sound: { enabled: true, volume: 0.7 } },
      pricing: settings.pricing || {},
      withholdings: withholdingsOf(settings),
      allowCustomization: settings.allowCustomization !== undefined ? settings.allowCustomization : true,
      customerCategories: settings.customerCategories || [],
      smtp: publicSettings({ smtp: newSettings.smtp }).smtp || { host: '', port: 587, secure: false, user: '', pass: '', from: '' },
      ncfSequences: liveSequences(updated),
      ncf: settings.ncf || {
        b01_prefix: '',
        b01_sequence_next: 1,
        b02_prefix: '',
        b02_sequence_next: 1,
        b03_prefix: '',
        b03_sequence_next: 1,
        b04_prefix: '',
        b04_sequence_next: 1,
      }
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Error al actualizar configuraciones' });
  }
});

// Secuencias NCF con el contador real: B01/B02 cuentan en sus columnas (las usa la facturación)
const liveSequences = (company) => (Array.isArray(company.settings?.ncfSequences) ? company.settings.ncfSequences : [])
  .map((s) => (['B01', 'B02'].includes(s.code) ? { ...s, next: company[`ncf${s.code}SequenceNext`] ?? s.next } : s));

// PUT /settings/ncf - Guardar las secuencias de talonarios (inicio, fin, siguiente y si está activa)
router.put('/ncf', authorize(...rolesFor('finance-fiscal-management')), async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Envía la lista de secuencias NCF.' });
    }
    const updated = await withSettingsLock(req.companyId, async (tx) => {
    const company = await tx.company.findUnique({ where: { id: req.companyId } });
    const current = Object.fromEntries(liveSequences(company).map((s) => [s.code, Number(s.next) || 1]));

    const sequences = [];
    for (const s of req.body) {
      const code = String(s.code || '').toUpperCase();
      const [start, end, next] = [s.start, s.end, s.next].map((n) => parseInt(n, 10));
      if (!/^B\d{2}$/.test(code)) throw httpError(400, `Tipo de NCF no válido: ${s.code}`);
      if (!(start >= 1 && end >= start && next >= start)) {
        throw httpError(400, `Revisa la secuencia ${code}: el inicio debe ser 1 o más, el fin no puede ser menor que el inicio y el siguiente no puede ser menor que el inicio.`);
      }
      // Vencimiento (AAAA-MM-DD): el 31 de diciembre del año siguiente a la autorización. B02 y B04 no vencen.
      const expiresAt = ['B02', 'B04'].includes(code) || !s.expiresAt ? null : String(s.expiresAt).slice(0, 10);
      if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) throw httpError(400, `Fecha de vencimiento no válida en la secuencia ${code}.`);
      // Nunca se retrocede el contador: un número ya usado no se vuelve a emitir
      sequences.push({ code, name: String(s.name || code), prefix: String(s.prefix || code).trim(), start, end, next: Math.max(next, current[code] || 0), active: !!s.active, expiresAt });
    }

    const data = { settings: { ...(company.settings || {}), ncfSequences: sequences } };
    for (const s of sequences.filter((x) => ['B01', 'B02'].includes(x.code))) {
      data[`ncf${s.code}Prefix`] = s.prefix;
      data[`ncf${s.code}SequenceNext`] = s.next;
    }
    return tx.company.update({ where: { id: req.companyId }, data });
    });
    res.json({ ncfSequences: liveSequences(updated) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error updating NCF sequences:', error);
    res.status(500).json({ error: 'Error al actualizar secuencias NCF' });
  }
});

// GET /settings/ncf - Obtener secuencias NCF
router.get('/ncf', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    res.json({ ncfSequences: liveSequences(company) });
  } catch (error) {
    console.error('Error fetching NCF sequences:', error);
    res.status(500).json({ error: 'Error al obtener secuencias NCF' });
  }
});

export default router;
