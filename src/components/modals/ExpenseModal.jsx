import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import Button from '../ui/Button.jsx';

const ExpenseModal = ({ expense, onClose, onSave, suppliers }) => {
    const [formData, setFormData] = useState({
        supplierId: '',
        rncCedula: '',
        supplierName: '',
        ncf: '',
        ncfModificado: '',
        invoiceDate: new Date().toISOString().split('T')[0],
        paymentDate: new Date().toISOString().split('T')[0],
        montoBienes: 0,
        montoServicios: 0,
        itbisFacturado: 0,
        itbisRetenido: 0,
        rentaRetenida: 0,
        propinaLegal: 0,
        tipoGasto: '09-COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA',
        formaPago: '01', // 01: Efectivo
    });
    const [isLoading, setIsLoading] = useState(false);

    const tiposDeGasto = [
        '01-GASTOS DE PERSONAL', '02-GASTOS POR TRABAJOS, SUMINISTROS Y SERVICIOS',
        '03-ARRENDAMIENTOS', '04-GASTOS DE ACTIVOS FIJOS', '05-GASTOS DE REPRESENTACIÓN',
        '06-OTRAS DEDUCCIONES ADMITIDAS', '07-GASTOS FINANCIEROS', '08-GASTOS EXTRAORDINARIOS',
        '09-COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA', '10-ADQUISICIONES DE ACTIVOS',
        '11-GASTOS DE SEGUROS'
    ];
    const formasDePago = [
        { code: '01', name: '01 - EFECTIVO' },
        { code: '02', name: '02 - CHEQUES/TRANSFERENCIAS/DEPÓSITO' },
        { code: '03', name: '03 - TARJETA CRÉDITO/DÉBITO' },
        { code: '04', name: '04 - COMPRA A CREDITO' },
    ];

    const totalMontoFacturado = useMemo(() => 
        (parseFloat(formData.montoBienes) || 0) + (parseFloat(formData.montoServicios) || 0),
        [formData.montoBienes, formData.montoServicios]
    );

    useEffect(() => {
        if (expense && expense.id) {
            setFormData({
                supplierId: expense.supplierId ?? '',
                rncCedula: expense.rncCedula ?? '',
                supplierName: expense.supplierName ?? '',
                ncf: expense.ncf ?? '',
                ncfModificado: expense.ncfModificado ?? '',
                invoiceDate: expense.invoiceDate && expense.invoiceDate.seconds ? new Date(expense.invoiceDate.seconds * 1000).toISOString().split('T')[0] : '',
                paymentDate: expense.paymentDate && expense.paymentDate.seconds ? new Date(expense.paymentDate.seconds * 1000).toISOString().split('T')[0] : '',
                montoBienes: expense.montoBienes ?? 0,
                montoServicios: expense.montoServicios ?? 0,
                itbisFacturado: expense.itbisFacturado ?? 0,
                itbisRetenido: expense.itbisRetenido ?? 0,
                rentaRetenida: expense.rentaRetenida ?? 0,
                propinaLegal: expense.propinaLegal ?? 0,
                tipoGasto: expense.tipoGasto ?? '09-COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA',
                formaPago: expense.formaPago ?? '01',
            });
        }
    }, [expense]);

    const handleSupplierChange = (e) => {
        const supplierId = e.target.value;
        const selectedSupplier = (suppliers || []).find(s => s.id === supplierId);
        if (selectedSupplier) {
            setFormData(prev => ({
                ...prev,
                supplierId: selectedSupplier.id,
                supplierName: selectedSupplier.name,
                rncCedula: selectedSupplier.identificationNumber,
            }));
        } else {
            setFormData(prev => ({ ...prev, supplierId: '', supplierName: '', rncCedula: '' }));
        }
    };

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        await onSave({ ...formData, totalMontoFacturado });
        setIsLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                    <h3 className="text-lg md:text-2xl font-semibold text-gray-900">{expense?.id ? 'Modificar Gasto' : 'Registrar Compra / Gasto con NCF'}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <fieldset className="border p-4 rounded-lg">
                        <legend className="font-semibold text-indigo-600 px-2">Información del Proveedor</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-gray-700 mb-1">Seleccionar Proveedor (Opcional)</label>
                                <select onChange={handleSupplierChange} value={formData.supplierId} className="input-base">
                                    <option value="">-- Seleccionar de la lista --</option>
                                    {(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-gray-700 mb-1">RNC o Cédula</label>
                                <input type="text" name="rncCedula" value={formData.rncCedula} onChange={handleChange} className="input-base" required />
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-gray-700 mb-1">Nombre o Razón Social</label>
                                <input type="text" name="supplierName" value={formData.supplierName} onChange={handleChange} className="input-base" required />
                            </div>
                        </div>
                    </fieldset>
                    
                    <fieldset className="border p-4 rounded-lg">
                        <legend className="font-semibold text-indigo-600 px-2">Detalles del Comprobante</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input type="text" name="ncf" value={formData.ncf} onChange={handleChange} placeholder="Número de Comprobante (NCF)" className="input-base" required />
                            <input type="text" name="ncfModificado" value={formData.ncfModificado} onChange={handleChange} placeholder="NCF Modificado (si aplica)" className="input-base" />
                            <div><label className="block text-gray-700 text-sm">Fecha Comprobante</label><input type="date" name="invoiceDate" value={formData.invoiceDate} onChange={handleChange} className="input-base" required /></div>
                            <div><label className="block text-gray-700 text-sm">Monto en Bienes</label><input type="number" name="montoBienes" value={formData.montoBienes} onChange={handleChange} className="input-base" required min="0" step="0.01" /></div>
                            <div><label className="block text-gray-700 text-sm">Monto en Servicios</label><input type="number" name="montoServicios" value={formData.montoServicios} onChange={handleChange} className="input-base" required min="0" step="0.01" /></div>
                            <div><label className="block text-gray-700 text-sm">ITBIS Facturado</label><input type="number" name="itbisFacturado" value={formData.itbisFacturado} onChange={handleChange} className="input-base" required min="0" step="0.01" /></div>
                            <div><label className="block text-gray-700 text-sm">ITBIS Retenido</label><input type="number" name="itbisRetenido" value={formData.itbisRetenido} onChange={handleChange} className="input-base" min="0" step="0.01" /></div>
                            <div><label className="block text-gray-700 text-sm">Retención Renta (ISR)</label><input type="number" name="rentaRetenida" value={formData.rentaRetenida} onChange={handleChange} className="input-base" min="0" step="0.01" /></div>
                            <div><label className="block text-gray-700 text-sm">Propina Legal</label><input type="number" name="propinaLegal" value={formData.propinaLegal} onChange={handleChange} className="input-base" min="0" step="0.01" /></div>
                            <div className="md:col-span-2"><label className="block text-gray-700 text-sm">Tipo de Gasto (para 606)</label><select name="tipoGasto" value={formData.tipoGasto} onChange={handleChange} className="input-base">{tiposDeGasto.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}</select></div>
                            <div><label className="block text-gray-700 text-sm">Forma de Pago</label><select name="formaPago" value={formData.formaPago} onChange={handleChange} className="input-base">{formasDePago.map(f => <option key={f.code} value={f.code}>{f.name}</option>)}</select></div>
                        </div>
                    </fieldset>

                    <div className="flex justify-end gap-2 mt-8">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" disabled={isLoading} className="w-36">{isLoading ? <Loader2 className="animate-spin" /> : 'Guardar Gasto'}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ExpenseModal;
