import React, { useState } from 'react';
import { parseXlsxFile } from '../utils/importProducts.js';
import { downloadProductTemplate } from '../utils/productTemplate.js';
import { products as productsApi } from '../api/client.js';
import toast from 'react-hot-toast';
import { Upload, Download } from 'lucide-react';
import Button from '../components/ui/Button.jsx';

// embedded: dentro del modal de Inventario, que ya muestra su propio título
const ProductsImportViewSQL = ({ onImportComplete, embedded = false }) => {
    const [file, setFile] = useState(null);
    const [fileName, setFileName] = useState('');
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
            {!embedded && <h2 className="page-title mb-6">Importar productos (Excel)</h2>}
            <div className="card p-5 mb-4">
                <div className="flex flex-wrap gap-3 items-center">
                    <label className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-dashed border-line dark:border-gray-600 bg-surface-muted text-sm font-medium text-ink cursor-pointer hover:border-brand-400 transition-colors">
                        <Upload size={16} />
                        <span className="max-w-[16rem] truncate">{fileName || 'Seleccionar archivo .xlsx'}</span>
                        <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFileName(e.target.files?.[0]?.name || ''); handleFile(e); }} className="sr-only" />
                    </label>
                    <Button variant="secondary" onClick={() => downloadProductTemplate()} className="gap-2"><Download size={16} /> Descargar plantilla</Button>
                    <Button onClick={handleImport} disabled={importing} className="ml-auto">{importing ? 'Importando…' : 'Importar'}</Button>
                </div>
                {errors && errors.length > 0 && (
                    <div className="mt-4 text-sm text-danger-600">
                        <strong>Errores:</strong>
                        <ul className="max-h-40 overflow-y-auto">
                            {errors.map((er, i) => <li key={i}>Fila {er.row}: {er.error}</li>)}
                        </ul>
                    </div>
                )}
            </div>

            <div className="card p-5">
                <h3 className="text-base font-semibold text-ink mb-3">Vista previa (primeras 200 filas)</h3>
                {preview.length === 0 && <p className="text-sm text-ink-muted">Selecciona un archivo para ver aquí las filas antes de importarlas.</p>}
                {preview.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead>
                                <tr className="bg-gray-50/60 dark:bg-gray-800 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                    <th className="px-3 py-2 border-b border-line">Nombre</th>
                                    <th className="px-3 py-2 border-b border-line">Código (entrada)</th>
                                    <th className="px-3 py-2 border-b border-line">SKU</th>
                                    <th className="px-3 py-2 border-b border-line">PrecioVenta</th>
                                    <th className="px-3 py-2 border-b border-line">Stock</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.map((r, idx) => (
                                    <tr key={idx} className="border-b border-line last:border-0">
                                        <td className="px-3 py-2">{r.name}</td>
                                        <td className="px-3 py-2">{r.barcode || r.codigoProducto || ''}</td>
                                        <td className="px-3 py-2">{r.sku}</td>
                                        <td className="px-3 py-2">{r.salePrice}</td>
                                        <td className="px-3 py-2">{r.stock}</td>
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
