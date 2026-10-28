import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Todas las rutas requieren autenticación
router.use(authenticate);

// GET /settings - Obtener configuraciones del usuario/empresa
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
      customerCategories: settings.customerCategories || ['General', 'VIP', 'Mayorista'],
      pricing: settings.pricing || { categoryDiscounts: {} },
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

      // Modo de pedidos
      orderMode: settings.orderMode || 'craft',
      availableOrderModes: settings.availableOrderModes || ['craft'],
      businessType: settings.businessType || 'otro',

      // Configuración de Email (SMTP Propio)
      smtp: settings.smtp || {
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
    } = req.body;

    // Obtener el usuario para saber su companyId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Obtener settings y notifications actuales para merge
    const currentCompany = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { settings: true, notifications: true }
    });

    const currentSettings = currentCompany?.settings || {};
    const currentNotifications = currentCompany?.notifications || {};
    
    // Construir nuevo objeto settings con todos los campos extendidos
    const newSettings = { ...currentSettings };
    
    if (customerCategories !== undefined) {
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
    if (smtp !== undefined) {
      newSettings.smtp = smtp;
    }

    // Actualizar notifications si se proporcionan
    const newNotifications = notifications !== undefined 
      ? { ...currentNotifications, ...notifications }
      : currentNotifications;

    // Serializar dirección para el campo address de la tabla
    let addressStr = null;
    if (address) {
      if (typeof address === 'object') {
        const parts = [address.street, address.sector, address.city, address.zipCode, address.country].filter(Boolean);
        addressStr = parts.join(', ');
      } else {
        addressStr = address;
      }
    }

    // Usar name o companyName, logo o logoUrl
    const finalName = name || companyName;
    const finalLogo = logo || logoUrl;

    // Actualizar la empresa
    const updated = await prisma.company.update({
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
      allowCustomization: settings.allowCustomization !== undefined ? settings.allowCustomization : true,
      customerCategories: settings.customerCategories || [],
      smtp: newSettings.smtp || { host: '', port: 587, secure: false, user: '', pass: '', from: '' },
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

// PUT /settings/ncf - Actualizar secuencias NCF
router.put('/ncf', authorize('admin', 'manager'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { B01, B02 } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const updateData = {};
    if (B01) {
      if (B01.prefix !== undefined) updateData.ncfB01Prefix = B01.prefix;
      if (B01.next !== undefined) updateData.ncfB01SequenceNext = B01.next;
    }
    if (B02) {
      if (B02.prefix !== undefined) updateData.ncfB02Prefix = B02.prefix;
      if (B02.next !== undefined) updateData.ncfB02SequenceNext = B02.next;
    }

    const updated = await prisma.company.update({
      where: { id: user.companyId },
      data: updateData
    });

    res.json({ 
      ncfSequences: {
        B01: { prefix: updated.ncfB01Prefix, next: updated.ncfB01SequenceNext },
        B02: { prefix: updated.ncfB02Prefix, next: updated.ncfB02SequenceNext },
      }
    });
  } catch (error) {
    console.error('Error updating NCF sequences:', error);
    res.status(500).json({ error: 'Error al actualizar secuencias NCF' });
  }
});

// GET /settings/ncf - Obtener secuencias NCF
router.get('/ncf', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const company = user.company;
    res.json({ 
      ncfSequences: {
        B01: { prefix: company.ncfB01Prefix, next: company.ncfB01SequenceNext },
        B02: { prefix: company.ncfB02Prefix, next: company.ncfB02SequenceNext },
      }
    });
  } catch (error) {
    console.error('Error fetching NCF sequences:', error);
    res.status(500).json({ error: 'Error al obtener secuencias NCF' });
  }
});

export default router;
