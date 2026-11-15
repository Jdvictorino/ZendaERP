// Formulario de compras y gastos (606) como página, con la misma estructura que Proveedor, Cliente y Producto.
// Si la empresa emite el comprobante (B11/B13/B17 o su e-CF), el servidor asigna el NCF al guardar.
import React, { useState, useMemo } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { SERVICIOS_609, PAISES } from '../../utils/dgii609.js';

const TIPOS_GASTO = [
    '01-GASTOS DE PERSONAL', '02-GASTOS POR TRABAJOS, SUMINISTROS Y SERVICIOS',
    '03-ARRENDAMIENTOS', '04-GASTOS DE ACTIVOS FIJOS', '05-GASTOS DE REPRESENTACIÓN',
    '06-OTRAS DEDUCCIONES ADMITIDAS', '07-GASTOS FINANCIEROS', '08-GASTOS EXTRAORDINARIOS',
    '09-COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA', '10-ADQUISICIONES DE ACTIVOS',
    '11-GASTOS DE SEGUROS',
];
const FORMAS_PAGO = [
    ['01', 'Efectivo'], ['02', 'Cheque, transferencia o depósito'], ['03', 'Tarjeta de crédito o débito'],
    ['04', 'Compra a crédito'], ['05', 'Permuta'], ['06', 'Nota de crédito'], ['07', 'Mixto'],
];
const TIPOS_RETENCION_ISR = [
    ['1', 'Alquileres'], ['2', 'Honorarios por servicios independientes'], ['3', 'Otras rentas'],
    ['4', 'Otras rentas (rentas presuntas)'], ['5', 'Intereses pagados a personas jurídicas residentes'],
    ['6', 'Intereses pagados a personas físicas residentes'], ['7', 'Retención por proveedores del Estado'],
    ['8', 'Juegos telefónicos de venta de bienes'],
];
// Quién emite el comprobante del gasto
const COMPROBANTES = [
    { code: '', title: 'NCF del proveedor', hint: 'El proveedor te entregó una factura con su NCF.' },
    { code: 'B11', title: 'Comprobante de Compras (B11)', hint: 'Compras a personas sin RNC ni comprobante. Lo emite tu empresa.' },
    { code: 'B13', title: 'Gastos Menores (B13)', hint: 'Gastos pequeños sin comprobante: peajes, parqueos, refrigerios.' },
    { code: 'B17', title: 'Pagos al Exterior (B17)', hint: 'Servicios o compras a proveedores fuera del país.' },
];
const ELECTRONICO = { B11: 'E41', B13: 'E43', B17: 'E47', E41: 'E41', E43: 'E43', E47: 'E47' };

const today = () => new Date().toISOString().split('T')[0];
const dateInput = (value) => (value ? String(value).slice(0, 10) : '');
const num = (v) => parseFloat(v) || 0;

const ExpenseForm = ({ expense = {}, suppliers = [], onClose, onSave, currency = 'DOP' }) => {
    const issued = expense.issuedVoucher || null; // comprobante ya emitido: sus datos fiscales no cambian
    const [form, setForm] = useState({
        voucher: '',
        supplierId: expense.supplierId ?? '',
        rncCedula: expense.rncCedula ?? '',
        supplierName: expense.supplierName ?? '',
        ncf: expense.ncf ?? '',
        ncfModificado: expense.ncfModificado ?? '',
        invoiceDate: dateInput(expense.invoiceDate) || today(),
        paymentDate: dateInput(expense.paymentDate) || today(),
        montoBienes: expense.montoBienes ?? 0,
        montoServicios: expense.montoServicios ?? 0,
        itbisFacturado: expense.itbisFacturado ?? 0,
        itbisRetenido: expense.itbisRetenido ?? 0,
        retencionIsrTipo: expense.retencionIsrTipo ?? '',
        montoRetencionIsr: expense.montoRetencionIsr ?? 0,
        propina: expense.propina ?? 0,
        expenseType: expense.expenseType ?? TIPOS_GASTO[8],
        paymentType: expense.paymentType ?? '01',
        description: expense.description ?? '',
    });
    // Pago al exterior: datos del formato 609 (no van en el e-CF; se pueden corregir después de emitir)
    const [foreign, setForeign] = useState({
        idType: 'Persona Jurídica', taxId: '', country: '', serviceType: '', serviceDetail: '',
        relatedParty: false, documentNumber: '', rentaPresunta: '',
        ...(expense.foreignPayment || {}),
    });
    const setF = (name, value) => setForeign((prev) => ({ ...prev, [name]: value, ...(name === 'serviceType' ? { serviceDetail: '' } : {}) }));
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const voucher = issued || form.voucher;
    const voucherCode = { E41: 'B11', E43: 'B13', E47: 'B17' }[voucher] || voucher; // tipo en papel equivalente
    const exento = voucherCode === 'B13' || voucherCode === 'B17'; // gastos menores y pagos al exterior van exentos
    const total = useMemo(() => num(form.montoBienes) + num(form.montoServicios), [form.montoBienes, form.montoServicios]);

    const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
    const handleChange = (e) => set(e.target.name, e.target.value);
    const handleSupplierChange = (e) => {
        const supplier = suppliers.find((s) => s.id === e.target.value);
        setForm((prev) => ({
            ...prev,
            supplierId: supplier?.id || '',
            supplierName: supplier?.name || '',
            rncCedula: supplier?.identificationNumber || '',
        }));
    };
    const chooseVoucher = (code) => setForm((prev) => ({
        ...prev,
        voucher: code,
        ...(code === 'B13' || code === 'B17' ? { itbisFacturado: 0, itbisRetenido: 0 } : {}),
    }));

    const validate = () => {
        const err = {};
        if (!(total > 0)) err.montos = 'Indica el monto en bienes o en servicios.';
        if (!voucher && !form.ncf.trim()) err.ncf = 'Escribe el NCF de la factura del proveedor.';
        if (!voucher && !form.rncCedula.trim()) err.rncCedula = 'Escribe el RNC o la cédula del proveedor.';
        if (voucherCode === 'B11' && form.rncCedula.replace(/\D/g, '').length !== 11) err.rncCedula = 'El B11 lleva la cédula del vendedor (11 dígitos).';
        if (['', 'B11', 'B17'].includes(voucherCode) && !form.supplierName.trim()) err.supplierName = 'Escribe el nombre del proveedor.';
        if (num(form.montoRetencionIsr) > 0 && !form.retencionIsrTipo) err.retencionIsrTipo = 'Elige el tipo de retención de ISR.';
        if (voucherCode === 'B17') {
            if (!foreign.taxId.trim()) err.taxId = 'Escribe el pasaporte o el NIT del proveedor.';
            if (!foreign.country) err.country = 'Elige el país al que se paga.';
            if (!foreign.serviceDetail) err.serviceDetail = 'Elige el tipo y el detalle del servicio.';
        }
        setErrors(err);
        return Object.keys(err).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setSubmitting(true);
        try {
            const { voucher: issueVoucher, ...fields } = form;
            const payload = {
                ...fields,
                supplierId: fields.supplierId || null,
                montoBienes: num(fields.montoBienes),
                montoServicios: num(fields.montoServicios),
                itbisFacturado: num(fields.itbisFacturado),
                itbisRetenido: num(fields.itbisRetenido),
                montoRetencionIsr: num(fields.montoRetencionIsr),
                propina: num(fields.propina),
                retencionIsrTipo: fields.retencionIsrTipo || null,
                invoiceDate: new Date(fields.invoiceDate).toISOString(),
                paymentDate: fields.paymentDate ? new Date(fields.paymentDate).toISOString() : null,
                ...(issueVoucher && !expense.id ? { issueVoucher, ncf: undefined } : {}),
                ...(voucherCode === 'B17' ? { foreignPayment: { ...foreign, taxId: foreign.taxId.trim(), rentaPresunta: foreign.rentaPresunta === '' ? undefined : num(foreign.rentaPresunta) } } : {}),
            };
            await onSave(payload);
        } finally {
            setSubmitting(false);
        }
    };

    const field = (name, label, props = {}) => (
        <div>
            <label htmlFor={`exp-${name}`} className="block text-ink-soft mb-1">{label}</label>
            <input
                id={`exp-${name}`} name={name} value={form[name]} onChange={handleChange} className="input-base"
                aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `err-${name}` : undefined} {...props}
            />
            {errors[name] && <p id={`err-${name}`} className="field-error">{errors[name]}</p>}
        </div>
    );
    const money = (name, label, props = {}) => field(name, label, { type: 'number', min: '0', step: '0.01', inputMode: 'decimal', readOnly: !!issued, ...props });

    return (
        <div className="w-full">
            <div className="modal-panel p-6 w-full">
                <div className="flex items-center gap-2 mb-4">
                    <button type="button" onClick={onClose} className="modal-close" aria-label="Volver a compras y gastos">
                        <ArrowLeft size={22} strokeWidth={2.5} />
                    </button>
                    <h3 className="text-lg font-semibold text-ink">{expense.id ? 'Modificar Compra / Gasto' : 'Registrar Compra / Gasto'}</h3>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                    {issued ? (
                        <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-muted p-4 text-sm">
                            <Lock size={18} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                            <p className="text-ink-soft">
                                Tu empresa emitió el comprobante <span className="font-mono font-semibold text-ink">{expense.ncf}</span> ({issued}).
                                Los montos, la fecha y el vendedor ya no se pueden cambiar; solo la clasificación y la fecha de pago.
                            </p>
                        </div>
                    ) : !expense.id && (
                        <fieldset className="border p-4 rounded-lg">
                            <legend className="text-lg font-semibold text-brand-600 px-2">Comprobante</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3" role="radiogroup" aria-label="¿Quién emite el comprobante?">
                                {COMPROBANTES.map((c) => (
                                    <label key={c.code || 'proveedor'} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${form.voucher === c.code ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-line'}`}>
                                        <input type="radio" name="voucher" className="mt-1" checked={form.voucher === c.code} onChange={() => chooseVoucher(c.code)} />
                                        <span>
                                            <span className="block font-medium text-ink">{c.title}</span>
                                            <span className="block text-sm text-ink-muted">{c.hint}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                            {form.voucher && (
                                <p className="mt-3 text-sm text-ink-muted">
                                    El NCF se asigna al guardar, de tu secuencia {form.voucher}. Si tu empresa emite comprobantes electrónicos y no tiene esa secuencia en papel, se emite el {ELECTRONICO[form.voucher]}.
                                </p>
                            )}
                        </fieldset>
                    )}

                    <fieldset className="border p-4 rounded-lg">
                        <legend className="text-lg font-semibold text-brand-600 px-2">{voucherCode === 'B11' ? 'Vendedor' : 'Proveedor'}{voucherCode === 'B13' ? ' (opcional)' : ''}</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label htmlFor="exp-supplierId" className="block text-ink-soft mb-1">Proveedor registrado (opcional)</label>
                                <select id="exp-supplierId" value={form.supplierId} onChange={handleSupplierChange} className="input-base" disabled={!!issued}>
                                    <option value="">Escribir los datos a mano</option>
                                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            {voucherCode !== 'B17' && field('rncCedula', voucherCode === 'B11' ? 'Cédula del vendedor' : 'RNC o cédula', { readOnly: !!issued, inputMode: 'numeric' })}
                            <div className={voucherCode === 'B17' ? 'md:col-span-1' : 'md:col-span-3'}>
                                {field('supplierName', 'Nombre o razón social', { readOnly: !!issued })}
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className="border p-4 rounded-lg">
                        <legend className="text-lg font-semibold text-brand-600 px-2">Montos</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {money('montoBienes', 'Monto en bienes')}
                            {money('montoServicios', 'Monto en servicios')}
                            {money('itbisFacturado', exento ? 'ITBIS facturado (exento)' : 'ITBIS facturado', { readOnly: !!issued || exento })}
                            {money('propina', 'Propina legal')}
                        </div>
                        {errors.montos && <p className="field-error mt-2">{errors.montos}</p>}
                        {voucherCode === 'B11' && <p className="mt-2 text-sm text-ink-muted">Si la compra lleva ITBIS, es el 18 % de bienes y servicios: {formatCurrency(total * 0.18, currency)}.</p>}
                        <p className="mt-3 text-sm text-ink-soft">Total facturado: <span className="font-semibold text-ink tabular-nums">{formatCurrency(total, currency)}</span></p>
                    </fieldset>

                    {voucherCode !== 'B13' && (
                        <fieldset className="border p-4 rounded-lg">
                            <legend className="text-lg font-semibold text-brand-600 px-2">Retenciones</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {voucherCode !== 'B17' && money('itbisRetenido', 'ITBIS retenido')}
                                <div>
                                    <label htmlFor="exp-retencionIsrTipo" className="block text-ink-soft mb-1">Tipo de retención de ISR</label>
                                    <select id="exp-retencionIsrTipo" name="retencionIsrTipo" value={form.retencionIsrTipo} onChange={handleChange} className="input-base" disabled={!!issued} aria-invalid={!!errors.retencionIsrTipo} aria-describedby={errors.retencionIsrTipo ? 'err-retencionIsrTipo' : undefined}>
                                        <option value="">Sin retención</option>
                                        {TIPOS_RETENCION_ISR.map(([code, name]) => <option key={code} value={code}>{code} - {name}</option>)}
                                    </select>
                                    {errors.retencionIsrTipo && <p id="err-retencionIsrTipo" className="field-error">{errors.retencionIsrTipo}</p>}
                                </div>
                                {money('montoRetencionIsr', 'Monto retenido de ISR')}
                            </div>
                        </fieldset>
                    )}

                    {voucherCode === 'B17' && (
                        <fieldset className="border p-4 rounded-lg">
                            <legend className="text-lg font-semibold text-brand-600 px-2">Pago al exterior (609)</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label htmlFor="exp-idType" className="block text-ink-soft mb-1">Tipo de ID tributaria</label>
                                    <select id="exp-idType" value={foreign.idType} onChange={(e) => setF('idType', e.target.value)} className="input-base">
                                        <option>Persona Jurídica</option>
                                        <option>Persona Física</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="exp-taxId" className="block text-ink-soft mb-1">{foreign.idType === 'Persona Física' ? 'Pasaporte' : 'NIT (ID tributaria)'}</label>
                                    <input id="exp-taxId" value={foreign.taxId} onChange={(e) => setF('taxId', e.target.value)} className="input-base" aria-invalid={!!errors.taxId} aria-describedby={errors.taxId ? 'err-taxId' : undefined} />
                                    {errors.taxId && <p id="err-taxId" className="field-error">{errors.taxId}</p>}
                                </div>
                                <div>
                                    <label htmlFor="exp-country" className="block text-ink-soft mb-1">País de destino</label>
                                    <select id="exp-country" value={foreign.country} onChange={(e) => setF('country', e.target.value)} className="input-base" aria-invalid={!!errors.country} aria-describedby={errors.country ? 'err-country' : undefined}>
                                        <option value="">Elegir país</option>
                                        {PAISES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                                    </select>
                                    {errors.country && <p id="err-country" className="field-error">{errors.country}</p>}
                                </div>
                                <div className="md:col-span-1">
                                    <label htmlFor="exp-serviceType" className="block text-ink-soft mb-1">Tipo de servicio</label>
                                    <select id="exp-serviceType" value={foreign.serviceType} onChange={(e) => setF('serviceType', e.target.value)} className="input-base">
                                        <option value="">Elegir</option>
                                        {Object.keys(SERVICIOS_609).map((t) => <option key={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="exp-serviceDetail" className="block text-ink-soft mb-1">Detalle del servicio</label>
                                    <select id="exp-serviceDetail" value={foreign.serviceDetail} onChange={(e) => setF('serviceDetail', e.target.value)} className="input-base" disabled={!foreign.serviceType} aria-invalid={!!errors.serviceDetail} aria-describedby={errors.serviceDetail ? 'err-serviceDetail' : undefined}>
                                        <option value="">{foreign.serviceType ? 'Elegir' : 'Primero elige el tipo de servicio'}</option>
                                        {(SERVICIOS_609[foreign.serviceType] || []).map((d) => <option key={d}>{d}</option>)}
                                    </select>
                                    {errors.serviceDetail && <p id="err-serviceDetail" className="field-error">{errors.serviceDetail}</p>}
                                </div>
                                <div>
                                    <label htmlFor="exp-documentNumber" className="block text-ink-soft mb-1">Número de factura o contrato</label>
                                    <input id="exp-documentNumber" value={foreign.documentNumber} onChange={(e) => setF('documentNumber', e.target.value)} className="input-base" placeholder="Del documento del proveedor" />
                                </div>
                                <div>
                                    <label htmlFor="exp-rentaPresunta" className="block text-ink-soft mb-1">Renta presunta (base del ISR)</label>
                                    <input id="exp-rentaPresunta" type="number" min="0" step="0.01" inputMode="decimal" value={foreign.rentaPresunta} onChange={(e) => setF('rentaPresunta', e.target.value)} className="input-base" placeholder={`Igual al total: ${formatCurrency(total, currency)}`} />
                                </div>
                                <label className="flex items-center gap-2 self-end pb-2 text-ink-soft">
                                    <input type="checkbox" checked={!!foreign.relatedParty} onChange={(e) => setF('relatedParty', e.target.checked)} />
                                    Es parte relacionada
                                </label>
                            </div>
                        </fieldset>
                    )}

                    <fieldset className="border p-4 rounded-lg">
                        <legend className="text-lg font-semibold text-brand-600 px-2">Comprobante y clasificación (606)</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {voucher
                                ? <div>
                                    <span className="block text-ink-soft mb-1">NCF</span>
                                    <p className="input-base font-mono bg-surface-muted">{issued ? expense.ncf : 'Se asigna al guardar'}</p>
                                </div>
                                : field('ncf', 'NCF de la factura', { readOnly: !!issued, placeholder: 'B0100000001' })}
                            {!voucher && field('ncfModificado', 'NCF modificado (si aplica)')}
                            {field('invoiceDate', 'Fecha del comprobante', { type: 'date', readOnly: !!issued })}
                            {field('paymentDate', 'Fecha de pago', { type: 'date' })}
                            <div className="md:col-span-2">
                                <label htmlFor="exp-expenseType" className="block text-ink-soft mb-1">Tipo de gasto</label>
                                <select id="exp-expenseType" name="expenseType" value={form.expenseType} onChange={handleChange} className="input-base">
                                    {TIPOS_GASTO.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="exp-paymentType" className="block text-ink-soft mb-1">Forma de pago</label>
                                <select id="exp-paymentType" name="paymentType" value={form.paymentType} onChange={handleChange} className="input-base">
                                    {FORMAS_PAGO.map(([code, name]) => <option key={code} value={code}>{code} - {name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="mt-4">
                            <label htmlFor="exp-description" className="block text-ink-soft mb-1">Concepto (opcional)</label>
                            <textarea id="exp-description" name="description" value={form.description || ''} onChange={handleChange} rows="2" className="input-base" placeholder="Ej.: Compra de materiales, parqueo, hosting" />
                        </div>
                    </fieldset>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Guardando...' : form.voucher && !expense.id ? `Guardar y emitir ${form.voucher}` : 'Guardar Gasto'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ExpenseForm;
