import React, { useState, useEffect } from 'react';
import { UserPlus, Save, ArrowLeft, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { playSuccessSound, playErrorSound } from '../../utils/soundPlayer.js';
import ProfilePicture from '../common/ProfilePicture.jsx';
import AddressFields from '../common/AddressFields.jsx';
import Button from '../ui/Button.jsx';
import { hashPin } from '../../utils/crypto.js';
import { ROLE_OPTIONS, getRoleLabel } from '../../utils/permissions.js';
import api from '../../api/client.js';

const UserModal = ({ db, adminUser, onClose, companyProfile, userToEdit, onProfileUpdate, currentUserUid, fullPage = false }) => {
    // Usar id en lugar de uid para compatibilidad con PostgreSQL
    const currentUserId = currentUserUid || adminUser?.id || adminUser?.uid;
    const isEditing = userToEdit && (userToEdit.id || userToEdit.uid);
    const isAdminProfile = isEditing && userToEdit.role === 'admin';
    const userId = userToEdit?.id || userToEdit?.uid;
    const isEditingSelf = isEditing && (String(userId) === String(currentUserId));
    const [formData, setFormData] = useState({
        photoURL: '', firstName: '', lastName: '', idNumber: '', gender: 'F',
        cargo: getRoleLabel('cashier'), empresa: '', address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana' },
        phone: '', cellphone: '', email: '', password: '', confirmPassword: '', employeeId: '',
        role: 'cashier', pin: '', confirmPin: ''
    });
    const [photoFile, setPhotoFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isEditing) {
            const matchedRole = userToEdit.role || ROLE_OPTIONS.find(opt => opt.label === userToEdit.cargo)?.value || 'cashier';
            const initialData = {
                ...formData,
                ...userToEdit,
                role: matchedRole,
                cargo: userToEdit.cargo || getRoleLabel(matchedRole),
                address: {
                    ...(formData.address),
                    ...(userToEdit.address || {})
                },
                password: '', 
                confirmPassword: ''
            };
            
            // --- CAMBIO 1: Asegura que la empresa se asigne al editar el perfil de admin ---
            if (companyProfile?.name) {
                initialData.empresa = companyProfile.name;
            }

            if (isAdminProfile) {
                initialData.role = 'admin';
                initialData.cargo = getRoleLabel('admin');
            }
            setFormData(initialData);

        } else if (companyProfile && companyProfile.name) {
            setFormData(prev => ({ ...prev, empresa: companyProfile.name, cargo: getRoleLabel(prev.role || 'cashier') }));
        }
    }, [userToEdit, isEditing, companyProfile, isAdminProfile]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'role') {
            const roleLabel = getRoleLabel(value);
            setFormData(prev => ({ ...prev, role: value, cargo: roleLabel }));
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    const handleAddressChange = (e) => setFormData(prev => ({ ...prev, address: { ...prev.address, [e.target.name]: e.target.value } }));
    const handleImageChange = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        setPhotoFile(f);
        const reader = new FileReader();
        reader.onloadend = () => setFormData(prev => ({ ...prev, photoURL: reader.result }));
        reader.readAsDataURL(f);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            if (isEditing) {
                const userIdToUpdate = userToEdit.id || userToEdit.uid;
                
                // Preparar datos para actualizar
                const dataToUpdate = {
                    firstName: (formData.firstName || '').trim(),
                    lastName: (formData.lastName || '').trim(),
                    phone: (formData.phone || '').trim(),
                    cellphone: (formData.cellphone || '').trim(),
                    address: formData.address,
                    gender: formData.gender || 'F',
                    idNumber: (formData.idNumber || '').trim(),
                    role: isAdminProfile ? 'admin' : (formData.role || 'cashier'),
                    employeeId: formData.employeeId || userToEdit.employeeId,
                };

                // Si hay foto nueva en base64, incluirla
                if (photoFile && formData.photoURL) {
                    dataToUpdate.photoURL = formData.photoURL;
                }

                // Actualizar PIN si se proporcionó
                if (formData.pin && formData.confirmPin) {
                    if (formData.pin !== formData.confirmPin) {
                        throw new Error('El PIN no coincide.');
                    }
                    dataToUpdate.pinHash = await hashPin(formData.pin);
                }

                // Llamar a la API para actualizar el usuario
                const updatedUser = await api.put(`/users/${userIdToUpdate}`, dataToUpdate);
                
                // Notificar actualización con la respuesta real del servidor
                if (onProfileUpdate) {
                    onProfileUpdate(updatedUser);
                }
            } else {
                // Crear nuevo usuario
                if (formData.password !== formData.confirmPassword) {
                    throw new Error("Las contraseñas no coinciden.");
                }
                if (!formData.password || formData.password.length < 6) {
                    throw new Error('La contraseña debe tener al menos 6 caracteres.');
                }

                const employeeId = `NE${String(Math.floor(10000 + Math.random() * 90000))}`;
                
                const newUserData = {
                    email: formData.email,
                    password: formData.password,
                    firstName: (formData.firstName || '').trim(),
                    lastName: (formData.lastName || '').trim(),
                    phone: (formData.phone || '').trim(),
                    cellphone: (formData.cellphone || '').trim(),
                    address: formData.address,
                    gender: formData.gender || 'F',
                    idNumber: (formData.idNumber || '').trim(),
                    role: formData.role || 'cashier',
                    employeeId: employeeId,
                };

                // Agregar PIN si se proporcionó
                if (formData.pin && formData.pin === formData.confirmPin) {
                    newUserData.pinHash = await hashPin(formData.pin);
                }

                // Si hay foto, incluirla
                if (photoFile && formData.photoURL) {
                    newUserData.photoURL = formData.photoURL;
                }

                await api.post('/users', newUserData);
            }

            toast.success(isEditing ? '¡Perfil actualizado!' : '¡Usuario creado!');
            playSuccessSound();
            onClose();

        } catch (err) {
            playErrorSound();
            console.error("Error en el formulario:", err);
            let errorMessage = isEditing ? 'No se pudo actualizar.' : 'No se pudo crear.';
            if (err.code === 'auth/email-already-in-use') {
                errorMessage = 'Este correo ya está registrado.';
            } else if (err.message === "Las contraseñas no coinciden.") {
                errorMessage = err.message;
            } else if (err.message && err.message.includes('PIN')) {
                errorMessage = err.message;
            } else if (err?.data?.details?.length) {
                const firstError = err.data.details[0];
                const fieldPath = Array.isArray(firstError?.path) ? firstError.path.join('.') : 'campo';
                errorMessage = `${firstError?.message || 'Dato inválido'} (${fieldPath})`;
            } else if (err?.message) {
                errorMessage = err.message;
            }
            toast.error(errorMessage);
        
        } finally {
            setIsLoading(false);
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
                        <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
                            {isEditing ? <Save /> : <UserPlus />}
                            {isEditing ? (isAdminProfile ? 'Modificar Perfil de Administrador' : 'Modificar Empleado') : 'Crear Nuevo Empleado'}
                        </h3>
                    </div>
                    {!fullPage && <button onClick={onClose}  aria-label="Cerrar" className="modal-close"><X size={18} /></button>}
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="md:col-span-1">
                            <ProfilePicture photoURL={formData.photoURL} handleImageChange={handleImageChange} />
                        </div>
                        <div className="md:col-span-3">
                                    <fieldset className="border p-4 rounded-lg h-full">
                                        <legend className="text-lg font-semibold text-brand-600 px-2">Datos Personales y Laborales</legend>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <input name="firstName" value={formData.firstName} onChange={handleChange} placeholder="Nombres" className="input-base" required />
                                            <input name="lastName" value={formData.lastName} onChange={handleChange} placeholder="Apellidos" className="input-base" required />
                                            <input name="idNumber" value={formData.idNumber} onChange={handleChange} placeholder="Cédula / Pasaporte" className="input-base" />
                                            <select name="gender" value={formData.gender} onChange={handleChange} className="input-base">
                                                <option value="F">Femenino</option>
                                                <option value="M">Masculino</option>
                                            </select>
                                            <div className="flex flex-col">
                                                <label htmlFor="role" className="text-sm font-medium text-ink-soft mb-1">Cargo y permisos</label>
                                                <select
                                                    id="role"
                                                    name="role"
                                                    value={formData.role}
                                                    onChange={handleChange}
                                                        className="input-base"
                                                        disabled={isAdminProfile || isEditingSelf}
                                                        required
                                                >
                                                    {ROLE_OPTIONS.map(option => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <span className="text-xs text-ink-muted mt-1">
                                                    {isAdminProfile
                                                        ? 'Este perfil es el administrador principal. Debes asignar otro administrador antes de cambiar su cargo.'
                                                        : (isEditingSelf ? 'No puedes cambiar tu propio rol desde aquí.' : 'Selecciona el nivel de acceso que tendrá este usuario en la aplicación.')}
                                                </span>
                                            </div>
                                            <div className="flex flex-col">
                                                <label htmlFor="empresa" className="text-sm font-medium text-ink-soft mb-1">Empresa</label>
                                                <input
                                                    id="empresa"
                                                    name="empresa"
                                                    value={formData.empresa}
                                                    onChange={handleChange}
                                                    placeholder="Empresa"
                                                    className="input-base bg-gray-100"
                                                    readOnly
                                                />
                                            </div>
                                        </div>
                                    </fieldset>
                        </div>
                    </div>

                    <fieldset className="border p-4 rounded-lg">
                        <legend className="text-lg font-semibold text-brand-600 px-2">Datos de Contacto</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input name="street" value={formData.address.street} onChange={handleAddressChange} placeholder="Calle y Número" className="input-base md:col-span-2" />
                            <input name="sector" value={formData.address.sector} onChange={handleAddressChange} placeholder="Sector" className="input-base" />
                            <input name="city" value={formData.address.city} onChange={handleAddressChange} placeholder="Ciudad" className="input-base" />
                            <input name="zipCode" value={formData.address.zipCode} onChange={handleAddressChange} placeholder="Código Postal (Opcional)" className="input-base" />
                            <input name="country" value={formData.address.country} onChange={handleAddressChange} placeholder="País" className="input-base" />
                            <input name="phone" value={formData.phone} onChange={handleChange} placeholder="Teléfono" className="input-base" />
                            <input name="cellphone" value={formData.cellphone} onChange={handleChange} placeholder="Celular" className="input-base" />
                        </div>
                    </fieldset>
                    
                    <fieldset className="border p-4 rounded-lg">
                        <legend className="text-lg font-semibold text-brand-600 px-2">Datos de Usuario</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="Correo Electrónico"
                                className="input-base disabled:bg-gray-100 disabled:text-gray-600 dark:disabled:bg-slate-800 dark:disabled:text-slate-200"
                                required
                                disabled={isEditing}
                            />
                            {!isEditing && (
                                <>
                                    <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="Contraseña" className="input-base" required />
                                    <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Confirmar Contraseña" className="input-base" required />
                                </>
                            )}
                        </div>
                        {isEditing && <p className="text-xs text-ink-muted mt-2">El correo y la contraseña no se pueden modificar por seguridad.</p>}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                            <input type="password" name="pin" value={formData.pin} onChange={handleChange} placeholder={isAdminProfile ? 'PIN de Admin (opcional)' : 'PIN (opcional)'} className="input-base" />
                            <input type="password" name="confirmPin" value={formData.confirmPin} onChange={handleChange} placeholder="Confirmar PIN" className="input-base" />
                            <div className="text-xs text-ink-muted flex items-center">El PIN permite autorizaciones rápidas sin cambiar de usuario.</div>
                        </div>
                    </fieldset>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" disabled={isLoading} className="w-44">{isLoading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear Usuario')}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserModal;