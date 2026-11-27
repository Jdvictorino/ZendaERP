import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import ProfilePicture from '../common/ProfilePicture.jsx';
import Button from '../ui/Button.jsx';
import toast from 'react-hot-toast';
import { TAXPAYER_TYPES } from '../../utils/tax.js';
import { paymentTermsOf, isCashTerm } from '../../utils/paymentTerms.js';
import { customerTermId } from '../../utils/saleTerms.js';

// Valores del selector viejo (mismo mapa que backend/src/services/customerTax.js)
const LEGACY_TYPES = { Persona: 'consumidor_final', Empresa: 'empresa', 'Zona Franca': 'zona_franca', Gubernamental: 'gubernamental', ONG: 'ong' };
// Mismo criterio que backend/src/services/customerTax.js: solo el consumidor final puede ir sin identificación
// (cédula o pasaporte); la persona física lleva cédula o RNC y los demás tipos, RNC.
const CEDULA_TYPES = ['consumidor_final'];
const hasLetters = (v = '') => /[a-z]/i.test(v);
const passportOf = (v = '') => v.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 20);

// Validación RD: Cédula (11 dígitos) y RNC (9 dígitos)
function onlyDigits(v = '') { return (v || '').replace(/\D/g, ''); }
function validateCedula(ced) {
    const digits = onlyDigits(ced);
    return digits.length === 11;
}
function validateRNC(rnc) {
    const digits = onlyDigits(rnc);
    if (digits.length !== 9) return false;
    const weights = [7,9,8,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += parseInt(digits[i], 10) * weights[i];
    return (10 - (sum % 11)) % 9 + 1 === parseInt(digits[8], 10);
}

const CustomerModal = ({ customer, onClose, onSave, companyProfile, fullPage = false }) => {
        const terms = useMemo(() => paymentTermsOf(companyProfile), [companyProfile]);
        const [formData, setFormData] = useState({ 
                name: '', email: '', phone: '', taxpayerType: 'consumidor_final', exemptionNumber: '', exemptionExpiresAt: '', identificationNumber: '',
                address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana' },
                defaultDiscount: 0, logo: '',
                status: 'active', category: 'Retail', paymentTermId: 'contado', creditLimit: 0, notes: '', customerCode: '', remindersOff: false
        });
        const [errors, setErrors] = useState({});
    
    useEffect(() => { 
                if (customer && customer.id) {
            setFormData({ 
                                name: customer.name || '', email: customer.email || '', phone: customer.phone || '', taxpayerType: customer.taxpayerType || LEGACY_TYPES[customer.type] || 'consumidor_final',
                                exemptionNumber: customer.exemptionNumber || '', exemptionExpiresAt: (customer.exemptionExpiresAt || '').slice(0, 10),
                                identificationNumber: customer.identificationNumber || customer.rnc || '',
                                address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana', ...(customer.address || {}) },
                                defaultDiscount: customer.defaultDiscount || 0, logo: customer.logo || '',
                                status: customer.status || 'active', category: customer.category || 'Retail', paymentTermId: customerTermId(customer, terms),
                                creditLimit: Number(customer.creditLimit || 0),
                                notes: customer.notes || '', customerCode: customer.customerCode || '', remindersOff: !!customer.remindersOff
            });
        }
    }, [customer, terms]);

        const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
        const selectedTerm = terms.find(t => t.id === formData.paymentTermId);
        const isCash = !selectedTerm || isCashTerm(selectedTerm);
        const handleTermChange = (e) => {
            setFormData(prev => ({ ...prev, paymentTermId: e.target.value }));
        };
    const handleAddressChange = (e) => setFormData({ ...formData, address: { ...formData.address, [e.target.name]: e.target.value } });
    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onloadend = () => setFormData({ ...formData, logo: reader.result });
            reader.readAsDataURL(e.target.files[0]);
        }
    };
        const idTypeLabel = useMemo(() => {
            if (CEDULA_TYPES.includes(formData.taxpayerType)) return 'Cédula / Pasaporte';
            return formData.taxpayerType === 'persona_fisica' ? 'Cédula / RNC' : 'RNC';
        }, [formData.taxpayerType]);
        const exemptible = TAXPAYER_TYPES.find(t => t.value === formData.taxpayerType)?.exemptible;

        const validateForm = () => {
            const errs = {};
            if (!formData.name.trim()) errs.name = 'Requerido';
            if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errs.email = 'Email inválido';
            if (formData.defaultDiscount < 0 || formData.defaultDiscount > 100) errs.defaultDiscount = '0 a 100%';
            const idValue = formData.identificationNumber || '';
            if (CEDULA_TYPES.includes(formData.taxpayerType)) {
                if (hasLetters(idValue)) {
                    if (passportOf(idValue).length < 6) errs.identificationNumber = 'Pasaporte inválido';
                } else if (onlyDigits(idValue) && !validateCedula(idValue)) errs.identificationNumber = 'Cédula inválida';
            } else if (formData.taxpayerType === 'persona_fisica') {
                const d = onlyDigits(idValue);
                if (!d) errs.identificationNumber = 'Requerido';
                else if (d.length === 11 ? !validateCedula(d) : d.length === 9 ? !validateRNC(d) : true) errs.identificationNumber = 'Use una cédula (11 dígitos) o un RNC (9) válidos';
            } else {
                const rnc = onlyDigits(idValue);
                if (!rnc) errs.identificationNumber = 'Requerido';
                else if (!validateRNC(rnc)) errs.identificationNumber = 'RNC inválido';
            }
            setErrors(errs);
            return Object.keys(errs).length === 0;
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            if (!validateForm()) { toast.error('Revisa los campos marcados.'); return; }
            const payload = {
                ...formData,
                exemptionNumber: exemptible ? formData.exemptionNumber.trim() : '',
                exemptionExpiresAt: exemptible ? formData.exemptionExpiresAt : '',
                defaultDiscount: Number(formData.defaultDiscount || 0),
                paymentTermId: isCash ? null : formData.paymentTermId,
                // El límite se conserva aunque el plazo sea contado (el servidor lo guarda tal cual)
                creditLimit: Number(formData.creditLimit || 0),
                identificationNumber: hasLetters(formData.identificationNumber) ? passportOf(formData.identificationNumber) : onlyDigits(formData.identificationNumber),
                // Normaliza status y category
                remindersOff: !!formData.remindersOff,
                status: formData.status || 'active',
                category: formData.category || 'Retail',
            };
                    await onSave(payload);
        };

                const categories = useMemo(() => {
                    const list = companyProfile?.customerCategories;
                    if (Array.isArray(list) && list.length) return list;
                    return ['Retail','Mayorista','VIP'];
                }, [companyProfile]);

                // Máscara de cédula (000-0000000-0) en vivo cuando es Persona
                const onIdChange = (e) => {
                    let val = e.target.value || '';
                    if (CEDULA_TYPES.includes(formData.taxpayerType) && hasLetters(val)) {
                        // Pasaporte: letras y números, sin máscara
                        setFormData(prev => ({ ...prev, identificationNumber: passportOf(val) }));
                    } else if (CEDULA_TYPES.includes(formData.taxpayerType)) {
                        // Cédula: 11 dígitos con máscara
                        const d = onlyDigits(val).slice(0, 11);
                        let masked = d;
                        if (d.length > 3 && d.length <= 10) masked = `${d.slice(0,3)}-${d.slice(3)}`;
                        if (d.length > 10) masked = `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`;
                        setFormData(prev => ({ ...prev, identificationNumber: masked }));
                    } else if (formData.taxpayerType === 'persona_fisica') {
                        // Cédula (11) o RNC (9): solo dígitos
                        setFormData(prev => ({ ...prev, identificationNumber: onlyDigits(val).slice(0, 11) }));
                    } else {
                        // Empresa, Zona Franca, Gubernamental, ONG: RNC sin máscara (hasta 9 dígitos)
                        const d = onlyDigits(val).slice(0, 9);
                        setFormData(prev => ({ ...prev, identificationNumber: d }));
                    }
                };
    
    return (
        <div className={fullPage ? 'w-full' : 'fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4'}>
            <div className={fullPage ? 'modal-panel p-6 w-full' : 'modal-panel p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto'}>
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                    <div className="flex items-center gap-2">
                        {fullPage && (
                            <button type="button" onClick={onClose} className="modal-close" aria-label="Salir">
                                <ArrowLeft size={22} strokeWidth={2.5} />
                            </button>
                        )}
                        <h3 className="text-lg font-semibold text-ink">{customer.id ? 'Modificar Cliente' : 'Nuevo Cliente'}</h3>
                    </div>
                    {!fullPage && <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>}
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="md:col-span-1 flex items-start">
                            <div className="w-32">
                                <ProfilePicture photoURL={formData.logo} handleImageChange={handleImageChange} />
                            </div>
                        </div>
                        <div className="md:col-span-3">
                            <fieldset className="p-4 border rounded-lg">
                                <legend className="font-semibold text-brand-600 px-2">Información del Cliente</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label htmlFor="name" className="block text-ink-soft mb-1">Nombre Completo / Razón Social</label><input id="name" type="text" name="name" value={formData.name} onChange={handleChange} className="input-base" required /></div>
                                    <div>
                                        <label htmlFor="taxpayerType" className="block text-ink-soft mb-1">Tipo de cliente</label>
                                        <select id="taxpayerType" name="taxpayerType" value={formData.taxpayerType} onChange={handleChange} className="input-base">
                                            {TAXPAYER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {exemptible && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                        <div>
                                            <label htmlFor="exemptionNumber" className="block text-ink-soft mb-1">Número de carnet / autorización</label>
                                            <input id="exemptionNumber" type="text" name="exemptionNumber" value={formData.exemptionNumber} onChange={handleChange} className="input-base" />
                                            <p className="text-xs text-ink-muted mt-1">Verifique el carnet con la app DGII antes de guardar.</p>
                                        </div>
                                        <div>
                                            <label htmlFor="exemptionExpiresAt" className="block text-ink-soft mb-1">Vence</label>
                                            <input id="exemptionExpiresAt" type="date" name="exemptionExpiresAt" value={formData.exemptionExpiresAt} onChange={handleChange} className="input-base" />
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                                                        <div>
                                                                            <label htmlFor="identificationNumber" className="block text-ink-soft mb-1">{idTypeLabel}{!CEDULA_TYPES.includes(formData.taxpayerType) && <span className="text-red-600" aria-hidden="true"> *</span>}</label>
                                                                            <input id="identificationNumber" type="text" name="identificationNumber" value={formData.identificationNumber} onChange={onIdChange} className="input-base" aria-invalid={!!errors.identificationNumber} aria-describedby={errors.identificationNumber ? 'err-identificationNumber' : undefined} />
                                      {errors.identificationNumber && <p id="err-identificationNumber" className="field-error">{errors.identificationNumber}</p>}
                                    </div>
                                    <div>
                                      <label className="block text-ink-soft mb-1">Teléfono</label>
                                      <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="input-base" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div>
                                      <label className="block text-ink-soft mb-1">Email</label>
                                      <input type="email" name="email" value={formData.email} onChange={handleChange} className="input-base" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'err-email' : undefined} />
                                      {errors.email && <p id="err-email" className="field-error">{errors.email}</p>}
                                    </div>
                                    <div>
                                      <label className="block text-ink-soft mb-1">Descuento por Defecto (%)</label>
                                      <input type="number" name="defaultDiscount" value={formData.defaultDiscount} onChange={handleChange} className="input-base" aria-invalid={!!errors.defaultDiscount} aria-describedby={errors.defaultDiscount ? 'err-defaultDiscount' : undefined} min="0" max="100" />
                                      {errors.defaultDiscount && <p id="err-defaultDiscount" className="field-error">{errors.defaultDiscount}</p>}
                                    </div>
                                </div>
                                <div className="mt-4"><label className="block text-ink-soft mb-1">Dirección - Calle</label><input type="text" name="street" value={formData.address.street} onChange={handleAddressChange} className="input-base" /></div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                    <input name="sector" value={formData.address.sector} onChange={handleAddressChange} placeholder="Sector" className="input-base" />
                                    <input name="city" value={formData.address.city} onChange={handleAddressChange} placeholder="Ciudad" className="input-base" />
                                    <input name="zipCode" value={formData.address.zipCode} onChange={handleAddressChange} placeholder="Código Postal" className="input-base" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                    <div>
                                        <label className="block text-ink-soft mb-1">Estado</label>
                                        <select name="status" value={formData.status} onChange={handleChange} className="input-base">
                                            <option value="active">Activo</option>
                                            <option value="inactive">Inactivo</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-ink-soft mb-1">Categoría</label>
                                        <select name="category" value={formData.category} onChange={handleChange} className="input-base">
                                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-ink-soft mb-1">Código Cliente</label>
                                        <input type="text" name="customerCode" value={formData.customerCode} onChange={handleChange} className="input-base" placeholder="Ej: CLI-0001" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label htmlFor="paymentTermId" className="block text-ink-soft mb-1">Condición de pago</label>
                                        <select id="paymentTermId" name="paymentTermId" value={formData.paymentTermId} onChange={handleTermChange} className="input-base">
                                            {terms.filter(t => t.active !== false || t.id === formData.paymentTermId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="creditLimit" className="block text-ink-soft mb-1">Límite de Crédito</label>
                                        <input id="creditLimit" type="number" name="creditLimit" value={formData.creditLimit} onChange={handleChange} className={`input-base ${isCash ? 'bg-gray-100 cursor-not-allowed opacity-75' : ''}`} min="0" disabled={isCash} />
                                    </div>
                                </div>
                                <label className="mt-4 flex items-center gap-2">
                                    <input type="checkbox" aria-label="No enviarle recordatorios de cobro" checked={!!formData.remindersOff} onChange={(e) => setFormData({ ...formData, remindersOff: e.target.checked })} /> No enviarle recordatorios de cobro
                                </label>
                                <div className="mt-4">
                                    <label className="block text-ink-soft mb-1">Notas</label>
                                    <textarea name="notes" value={formData.notes} onChange={handleChange} className="input-base" rows={2} placeholder="Notas adicionales, preferencias, etc." />
                                </div>
                            </fieldset>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="submit">Guardar Cliente</Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CustomerModal;