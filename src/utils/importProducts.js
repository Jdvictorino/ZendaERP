/**
 * Utilidades para importar productos desde archivos Excel
 * Migrado de Firebase a PostgreSQL API
 */
import { loadScript } from './loadScript.js';
import { isValidEAN13, generateUniqueEAN13 } from './ean.js';
import { generateUniqueSKU } from './sku.js';
import { products as productsApi } from '../api/client.js';

/**
 * Parsear un archivo XLSX y extraer los productos
 */
export async function parseXlsxFile(file) {
    await loadScript('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');
    const arrayBuffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const errors = [];
    const data = raw.map((row, idx) => {
        const nombre = (row.Nombre || '').toString().trim();
        const precioVenta = parseFloat(row.PrecioVenta || row.Precio || 0) || 0;
        const precioCompra = parseFloat(row.PrecioCompra || 0) || 0;
        const stock = parseFloat(row.Stock || 0) || 0;
        if (!nombre) errors.push({ row: idx + 2, error: 'Nombre es obligatorio' });
        if (isNaN(precioVenta)) errors.push({ row: idx + 2, error: 'PrecioVenta debe ser numérico' });
        return {
            name: nombre,
            sku: row.SKU || '',
            codigoProducto: row.CodigoProducto || row.Codigo || '',
            barcode: row.CodigoBarras || '',
            category: row.Categoria || '',
            categoryId: row.CategoriaId || '',
            supplierName: row.Proveedor || '',
            supplierId: row.ProveedorId || '',
            purchasePrice: precioCompra,
            salePrice: precioVenta,
            stock: stock,
            stockThreshold: parseFloat(row.StockThreshold || row.StockAlerta || 5) || 5,
            taxStatus: row.Impuesto || row.TaxStatus || 'Gravado (18%)',
            description: row.Descripcion || '',
            variants: (() => {
                try { return JSON.parse(row.Variantes || '[]'); } catch(e) { return []; }
            })(),
            images: (row.Imagenes || '').toString().split(',').map(s => s.trim()).filter(Boolean),
        };
    });

    return { data, errors };
}

/**
 * Importar productos a la base de datos via API
 */
export async function importProducts(products) {
    if (!Array.isArray(products) || products.length === 0) {
        return { imported: 0 };
    }

    // Obtener productos existentes para verificar unicidad
    const existingProducts = await productsApi.list();
    const existingBarcodes = new Set(existingProducts.map(p => (p.barcode || p.code || '').toString()));
    const existingSkus = new Set(existingProducts.map(p => (p.sku || '').toString()));

    // Función para obtener iniciales del nombre
    const initialsPrefix = (name) => {
        if (!name) return 'PRD';
        const parts = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
        let letters = parts.slice(0, 4).map(p => p[0]).join('');
        if (letters.length < 4) {
            const flat = parts.join('');
            letters = (flat.substring(0, 4)).padEnd(4, 'X');
        }
        return letters;
    };

    // Normaliza entrada a dígitos
    const digitsOnly = (s) => (s || '').toString().replace(/\D/g, '');

    // Preparar productos para importar
    const productsToImport = products.map(p => {
        // 1) EAN-13: usar el que venga si es válido y no duplicado; si no, generar único
        let candidate = digitsOnly(p.CodigoBarras || p.codigoBarras || p.barcode || p.codigoProducto || p.code || '');
        if (candidate && candidate.length === 13 && isValidEAN13(candidate) && !existingBarcodes.has(candidate)) {
            // ok
        } else {
            candidate = generateUniqueEAN13(existingBarcodes);
        }
        existingBarcodes.add(candidate);

        // 2) SKU: si no viene o está repetido, generar único basado en nombre
        let sku = (p.sku || '').toString().trim();
        if (!sku || existingSkus.has(sku)) {
            sku = generateUniqueSKU(p.name || 'PRD', existingSkus);
        }
        existingSkus.add(sku);

        return {
            name: p.name,
            sku: sku,
            barcode: candidate,
            code: candidate,
            category: p.category || null,
            categoryId: p.categoryId || null,
            supplierId: p.supplierId || null,
            purchasePrice: p.purchasePrice || 0,
            salePrice: p.salePrice || 0,
            stock: p.stock || 0,
            stockThreshold: p.stockThreshold || 5,
            taxStatus: p.taxStatus || 'Gravado (18%)',
            description: p.description || '',
            images: p.images || [],
            status: 'active'
        };
    });

    // Usar bulk import de la API
    const result = await productsApi.bulkImport(productsToImport);
    return { imported: result.imported || productsToImport.length };
}

/**
 * Alias legacy para compatibilidad
 * @deprecated Use importProducts instead
 */
export const importProductsToFirestore = importProducts;

export default {
    parseXlsxFile,
    importProducts,
    importProductsToFirestore
};
