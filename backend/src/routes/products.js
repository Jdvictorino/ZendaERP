import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Todos los endpoints requieren autenticación
router.use(authenticate);

// Helper para convertir string vacío a null o undefined
const emptyToNull = (val) => (val === '' || val === undefined) ? null : val;
const toNumber = (val) => {
  if (val === '' || val === null || val === undefined) return undefined;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
};

// Schema base de validación (flexible para aceptar datos del frontend)
const productSchemaBase = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  description: z.preprocess(emptyToNull, z.string().optional().nullable()),
  code: z.preprocess(emptyToNull, z.string().optional().nullable()),
  barcode: z.preprocess(emptyToNull, z.string().optional().nullable()),
  sku: z.preprocess(emptyToNull, z.string().optional().nullable()),
  categoryId: z.preprocess(emptyToNull, z.string().uuid().optional().nullable()),
  supplierId: z.preprocess(emptyToNull, z.string().uuid().optional().nullable()),
  // Aceptar ambos nombres de campo (frontend usa purchasePrice, DB usa costPrice)
  costPrice: z.preprocess(toNumber, z.number().min(0).optional()),
  purchasePrice: z.preprocess(toNumber, z.number().min(0).optional()),
  salePrice: z.preprocess(toNumber, z.number().min(0).default(0)),
  wholesalePrice: z.preprocess(toNumber, z.number().min(0).optional().nullable()),
  stock: z.preprocess(toNumber, z.number().int().default(0)),
  // Aceptar ambos nombres (frontend usa stockThreshold, DB usa minStock)
  minStock: z.preprocess(toNumber, z.number().int().optional()),
  stockThreshold: z.preprocess(toNumber, z.number().int().optional()),
  maxStock: z.preprocess(toNumber, z.number().int().optional().nullable()),
  unit: z.string().default('unidad'),
  taxRate: z.preprocess(toNumber, z.number().min(0).max(100).default(18)),
  taxStatus: z.string().optional(), // Frontend envía taxStatus
  isTaxable: z.preprocess((val) => val === true || val === 'true', z.boolean().default(true)),
  status: z.enum(['active', 'inactive']).default('active'),
  imageUrl: z.preprocess(emptyToNull, z.string().optional().nullable())
});

// Helper para transformar campos del frontend al modelo
const transformProductData = (data) => {
  const result = { ...data };
  
  // costPrice: usar purchasePrice si costPrice no está definido
  if (result.costPrice === undefined && result.purchasePrice !== undefined) {
    result.costPrice = result.purchasePrice;
  }
  result.costPrice = result.costPrice ?? 0;
  delete result.purchasePrice;
  
  // minStock: usar stockThreshold si minStock no está definido
  if (result.minStock === undefined && result.stockThreshold !== undefined) {
    result.minStock = result.stockThreshold;
  }
  result.minStock = result.minStock ?? 0;
  delete result.stockThreshold;
  
  // taxRate: derivar de taxStatus si viene del frontend
  if (result.taxStatus) {
    result.isTaxable = result.taxStatus.includes('18');
    result.taxRate = result.taxStatus.includes('18') ? 18 : 0;
    delete result.taxStatus;
  }
  
  return result;
};

// Schema completo para crear productos
const productSchema = productSchemaBase.transform(transformProductData);

// Schema parcial para actualizar productos (partial ANTES de transform)
const updateProductSchema = productSchemaBase.partial().transform(transformProductData);

// Helper para mapear campos del modelo a lo que espera el frontend
const mapProductForFrontend = (product) => {
  if (!product) return product;
  return {
    ...product,
    // Agregar aliases que el frontend espera
    purchasePrice: product.costPrice,
    stockThreshold: product.minStock,
    taxStatus: product.isTaxable ? 'Gravado (18%)' : 'Exento (0%)',
  };
};

/**
 * GET /api/products
 * Listar todos los productos de la empresa
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, category, search, page = 1, limit = 50 } = req.query;
    
    const where = { companyId: req.companyId };
    
    if (status) where.status = status;
    if (category) where.categoryId = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          variants: true
        },
        orderBy: { name: 'asc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.product.count({ where })
    ]);

    res.json({
      data: products.map(mapProductForFrontend),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/:id
 * Obtener un producto por ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        companyId: req.companyId
      },
      include: {
        category: true,
        supplier: true,
        variants: true,
        inventoryLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(mapProductForFrontend(product));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/products
 * Crear nuevo producto
 */
router.post('/', authorize('admin', 'manager', 'warehouse'), async (req, res, next) => {
  try {
    const data = productSchema.parse(req.body);
    
    const product = await prisma.product.create({
      data: {
        ...data,
        companyId: req.companyId
      },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } }
      }
    });

    // Registrar en inventario si hay stock inicial
    if (data.stock > 0) {
      await prisma.inventoryLog.create({
        data: {
          productId: product.id,
          userId: req.user.id,
          type: 'entrada',
          quantity: data.stock,
          previousStock: 0,
          newStock: data.stock,
          reason: 'Stock inicial'
        }
      });
    }

    res.status(201).json(mapProductForFrontend(product));
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/products/:id
 * Actualizar producto
 */
router.put('/:id', authorize('admin', 'manager', 'warehouse'), async (req, res, next) => {
  try {
    const data = updateProductSchema.parse(req.body);
    
    // Verificar que existe y pertenece a la empresa
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Si cambia el stock, registrar el movimiento
    if (data.stock !== undefined && data.stock !== existing.stock) {
      await prisma.inventoryLog.create({
        data: {
          productId: existing.id,
          userId: req.user.id,
          type: data.stock > existing.stock ? 'entrada' : 'salida',
          quantity: Math.abs(data.stock - existing.stock),
          previousStock: existing.stock,
          newStock: data.stock,
          reason: 'Ajuste manual de inventario'
        }
      });
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } }
      }
    });

    res.json(mapProductForFrontend(product));
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/products/:id
 * Eliminar producto
 */
router.delete('/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    await prisma.product.delete({ where: { id: req.params.id } });
    
    res.json({ message: 'Producto eliminado' });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/products/:id/stock
 * Ajustar stock de un producto
 */
router.patch('/:id/stock', authorize('admin', 'manager', 'warehouse'), async (req, res, next) => {
  try {
    const { quantity, type, reason } = req.body;

    // Validar que quantity sea un número positivo y type sea válido
    const qty = Number(quantity);
    if (!qty || qty <= 0 || !type || !['entrada', 'salida'].includes(type)) {
      return res.status(400).json({ error: 'quantity (número positivo) y type (entrada/salida) son requeridos' });
    }

    const product = await prisma.product.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const newStock = type === 'entrada' 
      ? product.stock + qty 
      : product.stock - qty;

    if (newStock < 0) {
      return res.status(400).json({ error: 'Stock insuficiente' });
    }

    const [updatedProduct] = await prisma.$transaction([
      prisma.product.update({
        where: { id: req.params.id },
        data: { stock: newStock }
      }),
      prisma.inventoryLog.create({
        data: {
          productId: product.id,
          userId: req.user.id,
          type,
          quantity: qty,
          previousStock: product.stock,
          newStock,
          reason
        }
      })
    ]);

    res.json(updatedProduct);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/:id/inventory-logs
 * Historial de inventario de un producto
 */
router.get('/:id/inventory-logs', async (req, res, next) => {
  try {
    const logs = await prisma.inventoryLog.findMany({
      where: { productId: req.params.id },
      include: {
        user: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json(logs);
  } catch (error) {
    next(error);
  }
});

// Schema para bulk import
const bulkProductSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  description: z.string().optional().default(''),
  code: z.string().optional().default(''),
  barcode: z.string().optional().default(''),
  sku: z.string().optional().default(''),
  categoryId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  purchasePrice: z.number().min(0).optional().default(0),
  costPrice: z.number().min(0).optional().default(0),
  salePrice: z.number().min(0).default(0),
  stock: z.number().int().default(0),
  stockThreshold: z.number().int().optional().default(5),
  minStock: z.number().int().optional().default(0),
  taxStatus: z.string().optional().default('Gravado (18%)'),
  taxRate: z.number().min(0).max(100).optional().default(18),
  isTaxable: z.boolean().optional().default(true),
  status: z.enum(['active', 'inactive']).default('active')
});

/**
 * POST /api/products/bulk-import
 * Importar múltiples productos desde Excel
 */
router.post('/bulk-import', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { products: productsData } = req.body;
    
    if (!Array.isArray(productsData) || productsData.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de productos' });
    }

    if (productsData.length > 1000) {
      return res.status(400).json({ error: 'Máximo 1000 productos por importación' });
    }

    // Obtener productos existentes para validar unicidad
    const existingProducts = await prisma.product.findMany({
      where: { companyId: req.companyId },
      select: { barcode: true, code: true, sku: true }
    });

    const existingBarcodes = new Set(existingProducts.map(p => p.barcode).filter(Boolean));
    const existingCodes = new Set(existingProducts.map(p => p.code).filter(Boolean));
    const existingSkus = new Set(existingProducts.map(p => p.sku).filter(Boolean));

    // Función para generar EAN-13 único
    const generateEAN13 = () => {
      const prefix = '200'; // Prefijo interno
      let code;
      do {
        const random = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
        const base = prefix + random;
        // Calcular dígito de control
        let sum = 0;
        for (let i = 0; i < 12; i++) {
          sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        code = base + checkDigit;
      } while (existingBarcodes.has(code));
      return code;
    };

    // Función para generar SKU único
    const generateSKU = (name) => {
      const prefix = (name || 'PRD').substring(0, 3).toUpperCase();
      let sku;
      let counter = 1;
      do {
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        sku = `${prefix}-${random}-${counter}`;
        counter++;
      } while (existingSkus.has(sku));
      return sku;
    };

    const errors = [];
    const validProducts = [];

    for (let i = 0; i < productsData.length; i++) {
      const row = productsData[i];
      
      try {
        // Validar y normalizar
        const validated = bulkProductSchema.parse({
          ...row,
          costPrice: row.costPrice || row.purchasePrice || 0,
          salePrice: row.salePrice || 0,
          stock: row.stock || 0,
          minStock: row.minStock || row.stockThreshold || 5
        });

        // Generar o validar barcode
        let barcode = (validated.barcode || validated.code || '').toString().trim();
        if (!barcode || barcode.length !== 13 || existingBarcodes.has(barcode)) {
          barcode = generateEAN13();
        }
        existingBarcodes.add(barcode);

        // Generar o validar SKU
        let sku = (validated.sku || '').toString().trim();
        if (!sku || existingSkus.has(sku)) {
          sku = generateSKU(validated.name);
        }
        existingSkus.add(sku);

        // Determinar taxRate desde taxStatus
        let taxRate = validated.taxRate;
        if (validated.taxStatus) {
          if (validated.taxStatus.includes('18')) taxRate = 18;
          else if (validated.taxStatus.includes('16')) taxRate = 16;
          else if (validated.taxStatus.toLowerCase().includes('exento')) taxRate = 0;
        }

        validProducts.push({
          name: validated.name,
          description: validated.description || '',
          code: barcode,
          barcode: barcode,
          sku: sku,
          categoryId: validated.categoryId || null,
          supplierId: validated.supplierId || null,
          costPrice: validated.costPrice,
          salePrice: validated.salePrice,
          stock: validated.stock,
          minStock: validated.minStock,
          taxRate: taxRate,
          isTaxable: taxRate > 0,
          status: 'active',
          companyId: req.companyId
        });
      } catch (err) {
        errors.push({ row: i + 1, error: err.message || 'Error de validación' });
      }
    }

    // Insertar productos en lotes
    let imported = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < validProducts.length; i += BATCH_SIZE) {
      const batch = validProducts.slice(i, i + BATCH_SIZE);
      await prisma.product.createMany({
        data: batch,
        skipDuplicates: true
      });
      imported += batch.length;
    }

    res.json({
      imported,
      errors,
      total: productsData.length
    });
  } catch (error) {
    next(error);
  }
});

// =============================================
// VARIANTES DE PRODUCTOS
// =============================================

const variantSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  purchasePrice: z.preprocess(toNumber, z.number().min(0).default(0)),
  salePrice: z.preprocess(toNumber, z.number().min(0).default(0)),
  priceAdjustment: z.preprocess(toNumber, z.number().default(0)),
  stock: z.preprocess(toNumber, z.number().int().default(0)),
  attributes: z.record(z.any()).optional().default({})
});

/**
 * GET /api/products/:id/variants
 * Listar variantes de un producto
 */
router.get('/:id/variants', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const variants = await prisma.productVariant.findMany({
      where: { productId: req.params.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ data: variants });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/products/:id/variants
 * Crear variante de producto
 */
router.post('/:id/variants', authorize('admin', 'manager', 'warehouse'), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const data = variantSchema.parse(req.body);

    const variant = await prisma.productVariant.create({
      data: {
        ...data,
        productId: req.params.id
      }
    });

    res.status(201).json(variant);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/products/:productId/variants/:variantId
 * Actualizar variante
 */
router.put('/:productId/variants/:variantId', authorize('admin', 'manager', 'warehouse'), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, companyId: req.companyId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const existing = await prisma.productVariant.findFirst({
      where: { id: req.params.variantId, productId: req.params.productId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Variante no encontrada' });
    }

    const data = variantSchema.partial().parse(req.body);

    const variant = await prisma.productVariant.update({
      where: { id: req.params.variantId },
      data
    });

    res.json(variant);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/products/:productId/variants/:variantId
 * Eliminar variante
 */
router.delete('/:productId/variants/:variantId', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, companyId: req.companyId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const existing = await prisma.productVariant.findFirst({
      where: { id: req.params.variantId, productId: req.params.productId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Variante no encontrada' });
    }

    await prisma.productVariant.delete({ where: { id: req.params.variantId } });
    
    res.json({ message: 'Variante eliminada' });
  } catch (error) {
    next(error);
  }
});

export default router;
