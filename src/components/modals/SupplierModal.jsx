import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import ProfilePicture from '../common/ProfilePicture.jsx';
import toast from 'react-hot-toast';
import Button from '../ui/Button.jsx';

const SupplierModal = ({ supplier, onClose, onSave, isQuickAdd = false, fullPage = false }) => {
    // Helpers RD: cédula y RNC
    const onlyDigits = (v = '') => (v || '').replace(/\D/g, '');
    const validateCedula = (ced) => {
        const digits = onlyDigits(ced);
        return digits.length === 11;
    };
    const validateRNC = (rnc) => {
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
    };
    // --- ESTADO INICIAL CON TODOS LOS NUEVOS CAMPOS ---
    const [formData, setFormData] = useState({
        name: '',
        identificationNumber: '',
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
                identificationNumber: supplier.identificationNumber || '',
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
    const handleIdChange = (e) => {
        let val = e.target.value || '';
        const digits = onlyDigits(val);
        // Si parece cédula (11 dígitos), aplicar máscara 000-0000000-0
        if (digits.length <= 11 && /^\d+$/.test(val.replace(/[-\s]/g, ''))) {
            const d = digits.slice(0, 11);
            let masked = d;
            if (d.length > 3 && d.length <= 10) masked = `${d.slice(0,3)}-${d.slice(3)}`;
            if (d.length > 10) masked = `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`;
            setFormData(prev => ({ ...prev, identificationNumber: masked }));
        } else {
            // Permitir pasaporte u otros formatos
            setFormData(prev => ({ ...prev, identificationNumber: val }));
        }
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
        // Validación flexible de identificación: si es todo dígitos y 11 => validar cédula; si 9 => validar RNC; si alfanumérico, se permite (pasaporte)
        const idRaw = formData.identificationNumber || '';
        const idDigits = onlyDigits(idRaw);
        const onlyNumeric = /^[0-9\-\s]+$/.test(idRaw);
        if (idRaw) {
            if (onlyNumeric) {
                if (idDigits.length === 11 && !validateCedula(idDigits)) err.identificationNumber = 'Cédula inválida';
                if (idDigits.length === 9 && !validateRNC(idDigits)) err.identificationNumber = 'RNC inválido';
                if (![0,9,11].includes(idDigits.length)) {
                    err.identificationNumber = 'Longitud inválida (use 11 dígitos para Cédula o 9 para RNC)';
                }
            } // si no es solo numérico, se asume pasaporte y no valida
        }
        setErrors(err);
        return Object.keys(err).length === 0;
    };

    const handleSubmit = async (e) => { 
        e.preventDefault(); 
        if (!validate()) return;
        setSubmitting(true);
        try {
            const dataToSave = { ...formData };
            // La imagen ya está en base64 en formData.logo si se seleccionó una nueva
            // El backend puede almacenarla directamente o convertirla según necesite
            await onSave(dataToSave);
            toast.success('Proveedor guardado.');
            onClose();
        } catch (err) {
            console.error('Error guardando proveedor:', err);
            toast.error('No se pudo guardar el proveedor.');
        } finally {
            setSubmitting(false);
        }
    };
    
    const modalContent = (
        <div className={fullPage ? 'bg-white rounded-2xl shadow-card p-6 w-full' : 'bg-white rounded-2xl shadow-card p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto'}>
            <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                <div className="flex items-center gap-2">
                    {fullPage && (
                        <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-600 shadow-sm hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label="Salir">
                            <ArrowLeft size={22} strokeWidth={2.5} />
                        </button>
                    )}
                    <h3 className="text-lg md:text-2xl font-semibold text-gray-900">{supplier.id ? 'Modificar Proveedor' : 'Nuevo Proveedor'}</h3>
                </div>
                {!fullPage && <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>}
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
                            <legend className="text-lg font-semibold text-indigo-600 px-2">Información General</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-700 mb-1">Nombre / Razón Social</label>
                                    <input type="text" name="name" value={formData.name} onChange={handleChange} className={`input-base ${errors.name ? 'border-red-400' : ''}`} required />
                                    {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
                                </div>
                                <div>
                                    <label className="block text-gray-700 mb-1">RNC / Cédula / Pasaporte (Opcional)</label>
                                    <input type="text" name="identificationNumber" value={formData.identificationNumber} onChange={handleIdChange} className={`input-base ${errors.identificationNumber ? 'border-red-400' : ''}`} placeholder="Ej: 001-1234567-8 o 1-01-12345-1" />
                                    {errors.identificationNumber && <p className="text-red-500 text-sm mt-1">{errors.identificationNumber}</p>}
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="block text-gray-700 mb-1">Dirección</label>
                                <textarea name="address" value={formData.address} onChange={handleChange} rows="3" className="input-base" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div>
                                    <label className="block text-gray-700 mb-1">Teléfono</label>
                                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="input-base" />
                                </div>
                                <div>
                                    <label className="block text-gray-700 mb-1">Correo Electrónico</label>
                                    <input type="email" name="email" value={formData.email} onChange={handleChange} className={`input-base ${errors.email ? 'border-red-400' : ''}`} />
                                    {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="block text-gray-700 mb-1">Sitio Web / Tienda Online (Opcional)</label>
                                <input type="url" name="website" value={formData.website} onChange={handleChange} className="input-base" />
                            </div>
                        </fieldset>
                        
                        {/* --- NUEVA SECCIÓN DE DATOS BANCARIOS --- */}
                        <fieldset className="border p-4 rounded-lg mt-4">
                            <legend className="text-lg font-semibold text-indigo-600 px-2">Datos Bancarios (Opcional)</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-700 mb-1">Nombre del Banco</label>
                                    <input type="text" name="bankName" value={formData.bankDetails.bankName} onChange={handleBankChange} className="input-base" />
                                </div>
                                 <div>
                                    <label className="block text-gray-700 mb-1">Tipo de Cuenta</label>
                                    <select name="accountType" value={formData.bankDetails.accountType} onChange={handleBankChange} className="input-base">
                                        <option>Ahorros</option>
                                        <option>Corriente</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="block text-gray-700 mb-1">Nombre del Beneficiario</label>
                                <input type="text" name="beneficiaryName" value={formData.bankDetails.beneficiaryName} onChange={handleBankChange} className="input-base" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div>
                                   <label className="block text-gray-700 mb-1">Número de Cuenta</label>
                                   <input type="text" name="accountNumber" value={formData.bankDetails.accountNumber} onChange={handleBankChange} className="input-base" />
                                </div>
                                <div>
                                   <label className="block text-gray-700 mb-1">Cédula o RNC del Beneficiario</label>
                                   <input type="text" name="beneficiaryId" value={formData.bankDetails.beneficiaryId} onChange={handleBankChange} className="input-base" />
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
        <div className={fullPage ? 'w-full' : `fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center ${zIndexClass} p-4`}>
            {modalContent}
        </div>
    );
};

export default SupplierModal;