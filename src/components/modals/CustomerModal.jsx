import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import ProfilePicture from '../common/ProfilePicture.jsx';
import Button from '../ui/Button.jsx';
import toast from 'react-hot-toast';

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
    const mod = sum % 11;
    let check = 11 - mod;
    if (check === 10) check = 2;
    if (check === 11) check = 1;
    return check === parseInt(digits[8], 10);
}

const CustomerModal = ({ customer, onClose, onSave, companyProfile, fullPage = false }) => {
        const [formData, setFormData] = useState({ 
                name: '', email: '', phone: '', type: 'Persona', identificationNumber: '',
                address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana' },
                defaultDiscount: 0, logo: '',
                status: 'active', category: 'Retail', accountType: 'contado', creditLimit: 0, creditDays: 0, notes: '', customerCode: ''
        });
        const [errors, setErrors] = useState({});
    
    useEffect(() => { 
                if (customer && customer.id) {
            setFormData({ 
                                name: customer.name || '', email: customer.email || '', phone: customer.phone || '', type: customer.type || 'Persona',
                                identificationNumber: customer.identificationNumber || '',
                                address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana', ...(customer.address || {}) },
                                defaultDiscount: customer.defaultDiscount || 0, logo: customer.logo || '',
                                status: customer.status || 'active', category: customer.category || 'Retail', accountType: customer.accountType || 'contado',
                                creditLimit: Number(customer.creditLimit || 0), creditDays: parseInt(customer.creditDays || 0, 10),
                                notes: customer.notes || '', customerCode: customer.customerCode || ''
            });
        }
    }, [customer]);

        const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
        const handleAccountTypeChange = (e) => {
            const val = e.target.value;
            setFormData(prev => ({
                ...prev,
                accountType: val,
                // Si pasa a contado, resetea campos de crédito para evitar inconsistencias
                creditLimit: val === 'contado' ? 0 : prev.creditLimit,
                creditDays: val === 'contado' ? 0 : prev.creditDays,
            }));
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
            if (formData.type === 'Persona') return 'Cédula / Pasaporte';
            return 'RNC';
        }, [formData.type]);

        const validateForm = () => {
            const errs = {};
            if (!formData.name.trim()) errs.name = 'Requerido';
            if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errs.email = 'Email inválido';
            if (formData.defaultDiscount < 0 || formData.defaultDiscount > 100) errs.defaultDiscount = '0 a 100%';
            if (formData.type === 'Persona') {
                const ced = onlyDigits(formData.identificationNumber);
                if (ced && !validateCedula(ced)) errs.identificationNumber = 'Cédula inválida';
            } else {
                const rnc = onlyDigits(formData.identificationNumber);
                if (rnc && !validateRNC(rnc)) errs.identificationNumber = 'RNC inválido';
            }
            if (formData.accountType === 'credito' && formData.creditDays < 0) errs.creditDays = 'No negativo';
            setErrors(errs);
            return Object.keys(errs).length === 0;
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            if (!validateForm()) { toast.error('Revisa los campos marcados.'); return; }
            const payload = {
                ...formData,
                defaultDiscount: Number(formData.defaultDiscount || 0),
                creditLimit: Number(formData.creditLimit || 0),
                creditDays: parseInt(formData.creditDays || 0, 10),
                identificationNumber: onlyDigits(formData.identificationNumber),
                // Normaliza status y category
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
                    if (formData.type === 'Persona') {
                        // Cédula: 11 dígitos con máscara
                        const d = onlyDigits(val).slice(0, 11);
                        let masked = d;
                        if (d.length > 3 && d.length <= 10) masked = `${d.slice(0,3)}-${d.slice(3)}`;
                        if (d.length > 10) masked = `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`;
                        setFormData(prev => ({ ...prev, identificationNumber: masked }));
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
                                    <div><label className="block text-ink-soft mb-1">Nombre Completo / Razón Social</label><input type="text" name="name" value={formData.name} onChange={handleChange} className="input-base" required /></div>
                                    <div>
                                        <label className="block text-ink-soft mb-1">Tipo de Cliente</label>
                                        <select name="type" value={formData.type} onChange={handleChange} className="input-base">
                                            <option value="Persona">Persona</option>
                                            <option value="Empresa">Empresa</option>
                                            <option value="Zona Franca">Zona Franca / Régimen Especial</option>
                                            <option value="Gubernamental">Gubernamental</option>
                                            <option value="ONG">ONG</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                                                        <div>
                                                                            <label className="block text-ink-soft mb-1">{idTypeLabel}</label>
                                                                            <input type="text" name="identificationNumber" value={formData.identificationNumber} onChange={onIdChange} className="input-base" aria-invalid={!!errors.identificationNumber} aria-describedby={errors.identificationNumber ? 'err-identificationNumber' : undefined} />
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
                                        <label className="block text-ink-soft mb-1">Tipo de Cliente</label>
                                        <select name="category" value={formData.category} onChange={handleChange} className="input-base">
                                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-ink-soft mb-1">Código Cliente</label>
                                        <input type="text" name="customerCode" value={formData.customerCode} onChange={handleChange} className="input-base" placeholder="Ej: CLI-0001" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                    <div>
                                        <label className="block text-ink-soft mb-1">Tipo de Cuenta</label>
                                        <select name="accountType" value={formData.accountType} onChange={handleAccountTypeChange} className="input-base">
                                            <option value="contado">Contado</option>
                                            <option value="credito">Crédito</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="block text-ink-soft mb-1">Límite de Crédito</label>
                                        <input type="number" name="creditLimit" value={formData.creditLimit} onChange={handleChange} className={`input-base ${formData.accountType !== 'credito' ? 'bg-gray-100 cursor-not-allowed opacity-75' : ''}`} min="0" disabled={formData.accountType !== 'credito'} />
                                    </div>
                                    <div>
                                        <label className="block text-ink-soft mb-1">Días de Crédito</label>
                                        <input type="number" name="creditDays" value={formData.creditDays} onChange={handleChange} aria-invalid={!!errors.creditDays} aria-describedby={errors.creditDays ? 'err-creditDays' : undefined} className={`input-base ${formData.accountType !== 'credito' ? 'bg-gray-100 cursor-not-allowed opacity-75' : ''}`} min="0" disabled={formData.accountType !== 'credito'} />
                                        {errors.creditDays && <p id="err-creditDays" className="field-error">{errors.creditDays}</p>}
                                    </div>
                                </div>
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