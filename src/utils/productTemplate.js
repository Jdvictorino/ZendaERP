import { loadScript } from './loadScript.js';

export async function downloadProductTemplate() {
    await loadScript('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');
    // Template ahora refleja los mismos campos del formulario de producto
    const headers = [{
        Nombre: 'Ejemplo Producto',
        SKU: 'SKU-001',
        CodigoProducto: '',
        CodigoBarras: '',
        Categoria: '',
        CategoriaId: '',
        Proveedor: '',
        ProveedorId: '',
        PrecioCompra: 0,
        PrecioVenta: 0,
        Stock: 0,
        StockThreshold: 5,
        Impuesto: 'Gravado (18%)',
        Descripcion: 'Descripción (opcional)',
        Variantes: '[]',
        Imagenes: ''
    }];
    const worksheet = window.XLSX.utils.json_to_sheet(headers);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

    // Hoja de notas con aclaraciones sobre códigos y SKU
    const notes = [
        ['Notas'],
        ['- CodigoProducto y CodigoBarras son opcionales.'],
        ['  Si están vacíos o no son EAN-13 válidos (13 dígitos con checksum), el sistema asignará un EAN-13 único.'],
        ['- SKU es opcional. Si está vacío o duplicado, se generará automáticamente uno único basado en el nombre.'],
        ['- Si se provee un EAN-13 válido y no duplicado, será respetado como código y barcode.'],
        ['- Columnas soportadas: Nombre, SKU, CodigoProducto, CodigoBarras, Categoria, CategoriaId, Proveedor, ProveedorId,'],
        ['  PrecioCompra, PrecioVenta, Stock, StockThreshold, Impuesto, Descripcion, Variantes (JSON), Imagenes (separadas por coma).'],
        ['- Cualquier columna adicional será ignorada.']
    ];
    const notesSheet = window.XLSX.utils.aoa_to_sheet(notes);
    window.XLSX.utils.book_append_sheet(workbook, notesSheet, 'Notas');

    window.XLSX.writeFile(workbook, 'product_template.xlsx');
}

export const TEMPLATE_HEADERS = ['Nombre','SKU','CodigoProducto','CodigoBarras','Categoria','CategoriaId','Proveedor','ProveedorId','PrecioCompra','PrecioVenta','Stock','StockThreshold','Impuesto','Descripcion','Variantes','Imagenes'];
