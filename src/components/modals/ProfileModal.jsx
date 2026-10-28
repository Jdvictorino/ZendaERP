import React, { useState, useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { playSuccessSound, playErrorSound } from '../../utils/soundPlayer.js';
import ProfilePicture from '../common/ProfilePicture.jsx';
import toast from 'react-hot-toast';
import Button from '../ui/Button.jsx';

const sanitizeForFirestore = (value) => {
    if (value === null) return null;
    if (Array.isArray(value)) {
        return value
            .map((entry) => sanitizeForFirestore(entry))
            .filter((entry) => entry !== undefined);
    }
    if (typeof value === 'object') {
        const output = {};
        Object.entries(value).forEach(([key, val]) => {
            if (val === undefined) return;
            if (typeof val === 'number' && !Number.isFinite(val)) return;
            const sanitized = sanitizeForFirestore(val);
            if (sanitized !== undefined) output[key] = sanitized;
        });
        return output;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    return undefined;
};

const ProfileModal = ({ profile, onClose, onSave, isMasterUser, fullPage = false }) => {
    const [formData, setFormData] = useState({
        name: '', rnc: '', address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana' },
        phone: '', email: '', logo: '',
        bankDetails: { entityType: 'Persona', bankName: '', beneficiaryName: '', beneficiaryId: '', accountType: 'Ahorro en Pesos RD$', accountNumber: '', bankEmail: '' }
    });

    useEffect(() => {
        if (profile) {
            const { emailProvider: _legacyEmailProvider, ...profileWithoutEmailProvider } = profile;
            // Convertir valores null a strings vacíos para evitar warnings de controlled inputs
            const sanitizedProfile = Object.fromEntries(
                Object.entries(profileWithoutEmailProvider).map(([key, value]) => [key, value === null ? '' : value])
            );
            setFormData((prevData) => ({
                ...prevData,
                ...sanitizedProfile,
                address: { ...prevData.address, ...(profile.address || {}) },
                bankDetails: { ...prevData.bankDetails, ...(profile.bankDetails || {}) }
            }));
        }
    }, [profile]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    const handleAddressChange = (e) => setFormData({ ...formData, address: { ...formData.address, [e.target.name]: e.target.value } });
    const handleBankChange = (e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, [e.target.name]: e.target.value } });
    
    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onloadend = () => setFormData({ ...formData, logo: reader.result });
            reader.readAsDataURL(e.target.files[0]);
        }
    };
    
    const handleSubmit = async (e) => { 
        e.preventDefault();
        const cleanPayload = sanitizeForFirestore(formData);
        cleanPayload.emailProvider = null;
        const promise = onSave(cleanPayload);
        await toast.promise(promise, {
            loading: 'Guardando perfil...',
            success: () => { playSuccessSound(); return '¡Perfil guardado!'; },
            error: () => { playErrorSound(); return 'No se pudo guardar el perfil.'; }
        });
        onClose();
    };

    return (
        <div className={fullPage ? 'w-full' : 'fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4'}>
            <div className={fullPage ? 'modal-panel p-6 w-full' : 'modal-panel p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto'}>
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                    <div className="flex items-center gap-2">
                        {fullPage && (
                            <button type="button" onClick={onClose} className="modal-close" aria-label="Salir">
                                <ArrowLeft size={22} strokeWidth={2.5} />
                            </button>
                        )}
                        <h3 className="text-lg font-semibold text-ink">Perfil de la Empresa</h3>
                    </div>
                    {!fullPage && <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>}
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Top: logo left + general info right (like UserModal) */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="md:col-span-1 flex items-start">
                            <div className="w-32">
                                <ProfilePicture photoURL={formData.logo} handleImageChange={handleImageChange} id="companyLogoUpload" />
                            </div>
                        </div>
                        <div className="md:col-span-3">
                            <fieldset className="p-4 border rounded-lg">
                                <legend className="font-semibold text-brand-600 px-2">Información General</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label className="block text-ink-soft text-sm mb-1">Nombre de la Empresa</label><input type="text" name="name" value={formData.name} onChange={handleChange} className="input-base" required readOnly={!isMasterUser} /></div>
                                    <div><label className="block text-ink-soft text-sm mb-1">RNC (Opcional)</label><input type="text" name="rnc" value={formData.rnc} onChange={handleChange} className="input-base" readOnly={!isMasterUser} /></div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div className="col-span-2"><label className="block text-ink-soft text-sm mb-1">Dirección</label><input type="text" name="street" value={formData.address.street} onChange={handleAddressChange} className="input-base" readOnly={!isMasterUser} /></div>
                                    <div><label className="block text-ink-soft text-sm mb-1">Sector</label><input type="text" name="sector" value={formData.address.sector} onChange={handleAddressChange} className="input-base" readOnly={!isMasterUser} /></div>
                                    <div><label className="block text-ink-soft text-sm mb-1">Ciudad</label><input type="text" name="city" value={formData.address.city} onChange={handleAddressChange} className="input-base" readOnly={!isMasterUser} /></div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div><label className="block text-ink-soft text-sm mb-1">Teléfono</label><input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="input-base" readOnly={!isMasterUser} /></div>
                                    <div><label className="block text-ink-soft text-sm mb-1">Email</label><input type="email" name="email" value={formData.email} onChange={handleChange} className="input-base" readOnly={!isMasterUser} /></div>
                                </div>
                            </fieldset>
                        </div>
                    </div>
                    
                    {/* --- SECCIÓN DE DATOS BANCARIOS --- */}
                    <fieldset className="p-4 border rounded-lg">
                        <legend className="font-semibold text-brand-600 px-2">Datos Bancarios (Para Facturas)</legend>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <select name="entityType" value={formData.bankDetails.entityType} onChange={handleBankChange} className="input-base" disabled={!isMasterUser}><option>Persona</option><option>Empresa</option></select>
                            <input type="text" name="bankName" value={formData.bankDetails.bankName} onChange={handleBankChange} placeholder="Nombre del Banco" className="input-base" readOnly={!isMasterUser}/>
                            <input type="text" name="beneficiaryName" value={formData.bankDetails.beneficiaryName} onChange={handleBankChange} placeholder="Nombre del Beneficiario" className="input-base" readOnly={!isMasterUser}/>
                            <input type="text" name="beneficiaryId" value={formData.bankDetails.beneficiaryId} onChange={handleBankChange} placeholder="Cédula o RNC del Beneficiario" className="input-base" readOnly={!isMasterUser}/>
                            <select name="accountType" value={formData.bankDetails.accountType} onChange={handleBankChange} className="input-base" disabled={!isMasterUser}><option>Ahorro en Pesos RD$</option><option>Corriente en Pesos RD$</option><option>Ahorro en Dólares USD$</option><option>Corriente en Dólares USD$</option></select>
                            <input type="text" name="accountNumber" value={formData.bankDetails.accountNumber} onChange={handleBankChange} placeholder="Número de Cuenta" className="input-base" readOnly={!isMasterUser}/>
                            <input type="email" name="bankEmail" value={formData.bankDetails.bankEmail} onChange={handleBankChange} placeholder="Email para Notificación de Pago" className="input-base md:col-span-2" readOnly={!isMasterUser}/>
                        </div>
                    </fieldset>

                    <div className="flex justify-end gap-2 mt-6">
                        <Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button>
                        {isMasterUser && (
                           <Button type="submit">Guardar Perfil</Button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProfileModal;