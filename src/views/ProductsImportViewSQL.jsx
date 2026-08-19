import React, { useState } from 'react';
import { parseXlsxFile } from '../utils/importProducts.js';
import { downloadProductTemplate } from '../utils/productTemplate.js';
import { products as productsApi } from '../api/client.js';
import toast from 'react-hot-toast';

const ProductsImportViewSQL = ({ onImportComplete }) => {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState([]);
    const [errors, setErrors] = useState([]);
    const [importing, setImporting] = useState(false);

    const handleFile = async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        setFile(f);
        try {
            const { data, errors: parseErrors } = await parseXlsxFile(f);
            setPreview(data.slice(0, 200));
            setErrors(parseErrors);
            if (parseErrors.length) toast.error(`Encontrados ${parseErrors.length} errores en el archivo.`);
            else toast.success('Archivo parseado correctamente.');
        } catch (err) {
            console.error(err);
            toast.error('No se pudo parsear el archivo.');
        }
    };

    const handleImport = async () => {
        if (!file) { toast.error('Seleccione un archivo primero.'); return; }
        setImporting(true);
        try {
            const { data, errors: parseErrors } = await parseXlsxFile(file);
            if (parseErrors.length) {
                toast.error('Corrija los errores antes de importar.');
                setErrors(parseErrors);
                setImporting(false);
                return;
            }
            
            // Usar API de PostgreSQL para bulk import
            const res = await productsApi.bulkImport(data);
            
            if (res.errors && res.errors.length > 0) {
                setErrors(res.errors);
                toast.error(`${res.imported} productos importados, ${res.errors.length} errores.`);
            } else {
                toast.success(`${res.imported} productos importados correctamente.`);
                setErrors([]);
                // Notificar al componente padre que se completó la importación
                if (onImportComplete) onImportComplete();
            }
            
            setPreview([]);
            setFile(null);
            // Limpiar el input file
            const fileInput = document.querySelector('input[type="file"]');
            if (fileInput) fileInput.value = '';
        } catch (err) {
            console.error('Import error', err);
            toast.error(err.message || 'Error durante la importación.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div>
            <h2 className="text-3xl font-bold mb-6">Importar Productos (Excel)</h2>
            <div className="bg-white p-6 rounded shadow mb-6">
                <div className="flex gap-3 items-center">
                    <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
                    <button onClick={() => downloadProductTemplate()} className="bg-gray-200 py-2 px-3 rounded">Descargar plantilla</button>
                    <button onClick={handleImport} disabled={importing} className={`ml-auto ${importing ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'} text-white py-2 px-4 rounded`}>{importing ? 'Importando...' : 'Importar'}</button>
                </div>
                {errors && errors.length > 0 && (
                    <div className="mt-4 text-sm text-red-600">
                        <strong>Errores:</strong>
                        <ul className="max-h-40 overflow-y-auto">
                            {errors.map((er, i) => <li key={i}>Fila {er.row}: {er.error}</li>)}
                        </ul>
                    </div>
                )}
            </div>

            <div className="bg-white p-6 rounded shadow">
                <h3 className="font-semibold mb-3">Vista previa (primeras 200 filas)</h3>
                {preview.length === 0 && <p className="text-sm text-gray-500">No hay datos a mostrar.</p>}
                {preview.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr>
                                    <th className="border px-2 py-1">Nombre</th>
                                    <th className="border px-2 py-1">Código (entrada)</th>
                                    <th className="border px-2 py-1">SKU</th>
                                    <th className="border px-2 py-1">PrecioVenta</th>
                                    <th className="border px-2 py-1">Stock</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.map((r, idx) => (
                                    <tr key={idx} className="odd:bg-gray-50">
                                        <td className="border px-2 py-1">{r.name}</td>
                                        <td className="border px-2 py-1">{r.barcode || r.codigoProducto || ''}</td>
                                        <td className="border px-2 py-1">{r.sku}</td>
                                        <td className="border px-2 py-1">{r.salePrice}</td>
                                        <td className="border px-2 py-1">{r.stock}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductsImportViewSQL;
