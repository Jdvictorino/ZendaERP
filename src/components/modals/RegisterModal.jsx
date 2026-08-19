import React, { useState, useEffect } from 'react';
import { UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import ProfilePicture from '../common/ProfilePicture.jsx';
import AddressFields from '../common/AddressFields.jsx';
import { calcPasswordStrength, checkPasswordCriteria, isPasswordStrong } from '../../utils/password.js';
import Button from '../ui/Button.jsx';

export default function RegisterModal({ onClose, onCollect, companyProfile, initialData = null }) {
    const [formData, setFormData] = useState({
        photoURL: '', firstName: '', lastName: '', idNumber: '', gender: 'F',
        cargo: 'Administrador', empresa: companyProfile?.name || '', address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana' },
        phone: '', cellphone: '', email: '', password: '', confirmPassword: '', employeeId: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState(0);
    const [passwordTouched, setPasswordTouched] = useState(false);

    useEffect(() => {
        if (companyProfile && companyProfile.name) {
            setFormData(prev => ({ ...prev, empresa: companyProfile.name }));
        }
        if (initialData) {
            setFormData(prev => ({ ...prev, ...initialData }));
        }
    }, [companyProfile]);

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleAddressChange = (e) => setFormData(prev => ({ ...prev, address: { ...prev.address, [e.target.name]: e.target.value } }));
    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onloadend = () => setFormData(prev => ({ ...prev, photoURL: reader.result }));
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const passwordCriteria = {
        minLength: 8,
        hasUpper: /[A-Z]/,
        hasLower: /[a-z]/,
        hasNumber: /[0-9]/,
        hasSymbol: /[^A-Za-z0-9]/
    };

    // usamos utilería externa calcPasswordStrength

    // actualizar fuerza en tiempo real cuando cambie la contraseña
    useEffect(() => {
        setPasswordStrength(calcPasswordStrength(formData.password));
    }, [formData.password]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            // Validaciones antes de enviar
            if (!formData.email) {
                toast.error('El correo es requerido.');
                return;
            }
            if (formData.password !== formData.confirmPassword) {
                toast.error('Las contraseñas no coinciden.');
                return;
            }
            if (!isPasswordStrong(formData.password, 3)) {
                toast.error('La contraseña no cumple con los requisitos mínimos de seguridad.');
                return;
            }

            // En lugar de crear el usuario aquí, enviamos los datos al contenedor (App)
            if (onCollect) {
                onCollect(formData);
            }
            toast.success('Datos de administrador registrados temporalmente. Completa los datos de la empresa.');
            onClose();
        } catch (err) {
            console.error('Error en registro:', err);
            toast.error(err?.message || 'Ocurrió un error al procesar el registro.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center mb-4 gap-2">
                    <h3 className="text-lg md:text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <UserPlus />
                        Registrar Administrador
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl" aria-label="Cerrar">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="md:col-span-1">
                            <ProfilePicture photoURL={formData.photoURL} handleImageChange={handleImageChange} />
                        </div>
                            <div className="md:col-span-3">
                                <fieldset className="border p-4 rounded-lg h-full">
                                    <legend className="text-lg font-semibold text-indigo-600 px-2">Datos Personales y Laborales</legend>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <input name="firstName" value={formData.firstName} onChange={handleChange} placeholder="Nombres" className="input-base" required />
                                        <input name="lastName" value={formData.lastName} onChange={handleChange} placeholder="Apellidos" className="input-base" required />
                                        <input name="idNumber" value={formData.idNumber} onChange={handleChange} placeholder="Cédula / Pasaporte" className="input-base" />
                                        <select name="gender" value={formData.gender} onChange={handleChange} className="input-base">
                                            <option value="F">Femenino</option>
                                            <option value="M">Masculino</option>
                                        </select>
                                        <input name="cargo" value={formData.cargo} onChange={handleChange} placeholder="Cargo" className="input-base" required />
                                        <input name="empresa" value={formData.empresa} onChange={handleChange} placeholder="Empresa" className="input-base bg-gray-100" readOnly />
                                    </div>
                                </fieldset>
                            </div>
                    </div>

                    <AddressFields address={formData.address} onChange={handleAddressChange} />
                    <fieldset className="border p-4 rounded-lg">
                        <legend className="text-lg font-semibold text-indigo-600 px-2">Datos de Contacto</legend>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input name="phone" value={formData.phone} onChange={handleChange} placeholder="Teléfono" className="input-base" />
                            <input name="cellphone" value={formData.cellphone} onChange={handleChange} placeholder="Celular" className="input-base" />
                        </div>
                    </fieldset>

                    <fieldset className="border p-4 rounded-lg">
                        <legend className="text-lg font-semibold text-indigo-600 px-2">Datos de Usuario</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Correo Electrónico" className="input-base" required />
                            <div className="relative">
                                <input type="password" name="password" value={formData.password} onChange={(e) => { handleChange(e); setPasswordTouched(true); }} placeholder="Contraseña" className="input-base" required />
                                {/* strength bar */}
                                <div className="mt-2 h-2 w-full bg-gray-200 rounded">
                                    <div style={{ width: `${(passwordStrength / 5) * 100}%` }} className={`h-2 rounded ${passwordStrength <= 2 ? 'bg-red-500' : passwordStrength === 3 ? 'bg-yellow-400' : 'bg-green-500'}`} />
                                </div>
                                <div className="text-xs mt-1 text-gray-600">Fortaleza: {['Muy débil','Débil','Aceptable','Buena','Fuerte'][Math.max(0, passwordStrength-1)] || 'Muy débil'}</div>
                            </div>

                            <div className="relative">
                                <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Confirmar Contraseña" className="input-base" required />
                                <div className="absolute right-2 top-2">
                                    {formData.confirmPassword.length > 0 && (
                                        formData.password === formData.confirmPassword ? <span className="text-green-600 font-bold">✓</span> : <span className="text-red-600 font-bold">✕</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 text-sm">
                            <p className="font-medium mb-1">Criterios de contraseña:</p>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                                <li className={`${formData.password.length >= passwordCriteria.minLength ? 'text-green-600' : 'text-gray-500'}`}>● Mínimo {passwordCriteria.minLength} caracteres</li>
                                <li className={`${passwordCriteria.hasUpper.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>● Al menos una letra mayúscula</li>
                                <li className={`${passwordCriteria.hasLower.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>● Al menos una letra minúscula</li>
                                <li className={`${passwordCriteria.hasNumber.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>● Al menos un número</li>
                                <li className={`${passwordCriteria.hasSymbol.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>● Al menos un símbolo</li>
                                <li className={`${formData.password === formData.confirmPassword && formData.confirmPassword.length > 0 ? 'text-green-600' : 'text-gray-500'}`}>● Las contraseñas coinciden</li>
                            </ul>
                        </div>
                    </fieldset>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button
                            type="submit"
                            disabled={isLoading || passwordStrength < 3 || formData.password !== formData.confirmPassword || !formData.email}
                            className="w-40"
                            title={passwordStrength < 3 ? 'La contraseña debe tener mayor fortaleza (mínimo 3/5).' : ''}
                        >
                            {isLoading ? 'Registrando...' : 'Registrarse'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
