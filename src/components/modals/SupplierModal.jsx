import React, { useState, useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import ProfilePicture from '../common/ProfilePicture.jsx';
import toast from 'react-hot-toast';
import Button from '../ui/Button.jsx';
import { normalizeSupplierId, formatSupplierId } from '../../utils/supplierId.js';

const TYPES = [['empresa', 'Empresa'], ['persona_fisica', 'Persona física'], ['informal', 'Informal (sin comprobante)'], ['exterior', 'Del exterior']];
const ID_LABEL = { empresa: 'RNC', persona_fisica: 'Cédula o RNC', informal: 'Cédula del vendedor', exterior: 'Pasaporte o identificación extranjera' };
const ID_HELP = { informal: 'Para estas compras tu empresa emite el comprobante de compras (B11).', exterior: 'Pagos al exterior (B17).' };
// Lo guardado: el tipo, o persona física si la identificación tiene 11 dígitos
const initialType = (s) => s.supplierType || (/^\d{11}$/.test(String(s.identificationNumber || s.rnc || '').replace(/\D/g, '')) ? 'persona_fisica' : 'empresa');

const SupplierModal = ({ supplier, onClose, onSave, isQuickAdd = false, fullPage = false }) => {
    // --- ESTADO INICIAL CON TODOS LOS NUEVOS CAMPOS ---
    const [formData, setFormData] = useState({
        name: '',
        supplierType: 'empresa',
        identificationNumber: '',
        contactName: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        bankDetails: {
            bankName: '',
            beneficiaryName: '',
            accountNumber: '',
            accountType: 'Ahorros',
            beneficiaryId: '',
        }
    });
    const [logoFile, setLogoFile] = useState(null);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    
    useEffect(() => { 
        if (supplier && supplier.id) {
            setFormData({ 
                name: supplier.name || '', 
                supplierType: initialType(supplier),
                identificationNumber: supplier.identificationNumber || supplier.rnc || '',
                contactName: supplier.contactName || '',
                address: supplier.address || '',
                phone: supplier.phone || '', 
                email: supplier.email || '',
                website: supplier.website || '',
                // Aseguramos que bankDetails siempre sea un objeto
                bankDetails: supplier.bankDetails || {
                    bankName: '', beneficiaryName: '', accountNumber: '', accountType: 'Ahorros', beneficiaryId: '',
                }
            }); 
            // clear image file state when editing existing supplier (we use existing logo url)
            setLogoFile(null);
            setErrors({});
        }
    }, [supplier]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    // El campo muestra el formato; lo que se guarda es solo dígitos (exterior: mayúsculas sin espacios)
    const handleIdChange = (e) => {
        const v = e.target.value;
        const clean = formData.supplierType === 'exterior' ? v.replace(/[\s-]/g, '').toUpperCase().slice(0, 20) : v.replace(/\D/g, '').slice(0, 11);
        setFormData(prev => ({ ...prev, identificationNumber: clean }));
    };
    const handleBankChange = (e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, [e.target.name]: e.target.value } });
    
    const validate = () => {
        const err = {};
        if (!formData.name || !formData.name.trim()) err.name = 'El nombre es obligatorio.';
        if (formData.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formData.email)) err.email = 'Correo inválido.';
        // Opcional: validar número de cuenta si se ingresó
        if (formData.bankDetails && formData.bankDetails.accountNumber && !/^[0-9\-\s]+$/.test(formData.bankDetails.accountNumber)) {
            err.accountNumber = 'Número de cuenta inválido.';
        }
        const id = normalizeSupplierId(formData.supplierType, formData.identificationNumber);
        if (id.error) err.identificationNumber = id.error;
        setErrors(err);
        return Object.keys(err).length === 0;
    };

    const handleSubmit = async (e) => { 
        e.preventDefault(); 
        if (!validate()) return;
        setSubmitting(true);
        try {
            const dataToSave = { ...formData, identificationNumber: normalizeSupplierId(formData.supplierType, formData.identificationNumber).value || '' };
            // La imagen ya está en base64 en formData.logo si se seleccionó una nueva
            // El backend puede almacenarla directamente o convertirla según necesite
            await onSave(dataToSave);
            toast.success('Proveedor guardado.');
            onClose();
        } catch (err) {
            console.error('Error guardando proveedor:', err);
            toast.error(err?.message || err?.response?.data?.error || err?.error || 'No se pudo guardar el proveedor.');
        } finally {
            setSubmitting(false);
        }
    };
    
    const modalContent = (
        <div className={fullPage ? 'modal-panel p-6 w-full' : 'modal-panel p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto'}>
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                <div className="flex items-center gap-2">
                    {fullPage && (
                        <button type="button" onClick={onClose} className="modal-close" aria-label="Salir">
                            <ArrowLeft size={22} strokeWidth={2.5} />
                        </button>
                    )}
                    <h3 className="text-lg font-semibold text-ink">{supplier.id ? 'Modificar Proveedor' : 'Nuevo Proveedor'}</h3>
                </div>
                {!fullPage && <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>}
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-1 flex items-start">
                        <div className="w-32">
                            <ProfilePicture photoURL={formData.logo} handleImageChange={(e)=>{
                                const f = e.target.files && e.target.files[0];
                                if (f) {
                                    setLogoFile(f);
                                    const reader = new FileReader();
                                    reader.onloadend = () => setFormData(prev => ({...prev, logo: reader.result}));
                                    reader.readAsDataURL(f);
                                }
                            }} />
                        </div>
                    </div>
                    <div className="md:col-span-3">
                        {/* --- SECCIÓN DE INFORMACIÓN GENERAL --- */}
                        <fieldset className="border p-4 rounded-lg">
                            <legend className="text-lg font-semibold text-brand-600 px-2">Información General</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="sup-name" className="block text-ink-soft mb-1">Nombre / Razón Social</label>
                                    <input id="sup-name" type="text" name="name" value={formData.name} onChange={handleChange} className="input-base" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'err-name' : undefined} required />
                                    {errors.name && <p id="err-name" className="field-error">{errors.name}</p>}
                                </div>
                                <div>
                                    <label htmlFor="sup-type" className="block text-ink-soft mb-1">Tipo de proveedor</label>
                                    <select id="sup-type" name="supplierType" value={formData.supplierType} onChange={handleChange} className="input-base">
                                        {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="sup-id" className="block text-ink-soft mb-1">{ID_LABEL[formData.supplierType]}{formData.supplierType !== 'exterior' && ' *'}</label>
                                    <input id="sup-id" type="text" name="identificationNumber" value={formatSupplierId(formData.identificationNumber)} onChange={handleIdChange} className="input-base" aria-invalid={!!errors.identificationNumber} aria-describedby={[errors.identificationNumber && 'err-identificationNumber', ID_HELP[formData.supplierType] && 'help-id'].filter(Boolean).join(' ') || undefined} />
                                    {ID_HELP[formData.supplierType] && <p id="help-id" className="text-xs text-ink-soft mt-1">{ID_HELP[formData.supplierType]}</p>}
                                    {errors.identificationNumber && <p id="err-identificationNumber" className="field-error">{errors.identificationNumber}</p>}
                                </div>
                                <div>
                                    <label htmlFor="sup-contact" className="block text-ink-soft mb-1">Persona de contacto</label>
                                    <input id="sup-contact" type="text" name="contactName" value={formData.contactName} onChange={handleChange} className="input-base" />
                                </div>
                            </div>
                            <div className="mt-4">
                                <label htmlFor="sup-address" className="block text-ink-soft mb-1">Dirección</label>
                                <textarea id="sup-address" name="address" value={formData.address} onChange={handleChange} rows="3" className="input-base" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div>
                                    <label htmlFor="sup-phone" className="block text-ink-soft mb-1">Teléfono</label>
                                    <input id="sup-phone" type="tel" name="phone" value={formData.phone} onChange={handleChange} className="input-base" />
                                </div>
                                <div>
                                    <label htmlFor="sup-email" className="block text-ink-soft mb-1">Correo Electrónico</label>
                                    <input id="sup-email" type="email" name="email" value={formData.email} onChange={handleChange} className="input-base" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'err-email' : undefined} />
                                    {errors.email && <p id="err-email" className="field-error">{errors.email}</p>}
                                </div>
                            </div>
                            <div className="mt-4">
                                <label htmlFor="sup-website" className="block text-ink-soft mb-1">Sitio Web / Tienda Online (Opcional)</label>
                                <input id="sup-website" type="url" name="website" value={formData.website} onChange={handleChange} className="input-base" />
                            </div>
                        </fieldset>
                        
                        {/* --- NUEVA SECCIÓN DE DATOS BANCARIOS --- */}
                        <fieldset className="border p-4 rounded-lg mt-4">
                            <legend className="text-lg font-semibold text-brand-600 px-2">Datos Bancarios (Opcional)</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="sup-bank" className="block text-ink-soft mb-1">Nombre del Banco</label>
                                    <input id="sup-bank" type="text" name="bankName" value={formData.bankDetails.bankName} onChange={handleBankChange} className="input-base" />
                                </div>
                                 <div>
                                    <label htmlFor="sup-acctype" className="block text-ink-soft mb-1">Tipo de Cuenta</label>
                                    <select id="sup-acctype" name="accountType" value={formData.bankDetails.accountType} onChange={handleBankChange} className="input-base">
                                        <option>Ahorros</option>
                                        <option>Corriente</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-4">
                                <label htmlFor="sup-benef" className="block text-ink-soft mb-1">Nombre del Beneficiario</label>
                                <input id="sup-benef" type="text" name="beneficiaryName" value={formData.bankDetails.beneficiaryName} onChange={handleBankChange} className="input-base" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div>
                                   <label htmlFor="sup-acct" className="block text-ink-soft mb-1">Número de Cuenta</label>
                                   <input id="sup-acct" type="text" name="accountNumber" value={formData.bankDetails.accountNumber} onChange={handleBankChange} className="input-base" />
                                </div>
                                <div>
                                   <label htmlFor="sup-benefid" className="block text-ink-soft mb-1">Cédula o RNC del Beneficiario</label>
                                   <input id="sup-benefid" type="text" name="beneficiaryId" value={formData.bankDetails.beneficiaryId} onChange={handleBankChange} className="input-base" />
                                </div>
                            </div>
                        </fieldset>

                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
                            <Button type="submit" disabled={submitting}>{submitting ? 'Guardando...' : 'Guardar Proveedor'}</Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );

    const zIndexClass = isQuickAdd ? "z-[60]" : "z-50";

    return (
        <div className={fullPage ? 'w-full' : `fixed inset-0 modal-backdrop flex items-center justify-center ${zIndexClass} p-4`}>
            {modalContent}
        </div>
    );
};

export default SupplierModal;