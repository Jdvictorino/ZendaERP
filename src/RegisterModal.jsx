import React, { useState } from 'react';

export default function RegisterModal({ onClose, onRegister }) {
    const [form, setForm] = useState({
        photoURL: '', firstName: '', lastName: '', idNumber: '', gender: 'F',
        cargo: 'Administrador', empresa: '', businessType: 'otro',
        address: { street: '', sector: '', city: '', zipCode: '', country: 'Repúbílica Dominicana' },
        phone: '', cellphone: '', email: '', password: '', confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name.startsWith('address.')) {
            const key = name.split('.')[1];
            setForm(prev => ({ ...prev, address: { ...prev.address, [key]: value } }));
        } else {
            setForm(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onloadend = () => setForm(prev => ({ ...prev, photoURL: reader.result }));
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        if (form.password !== form.confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }
        setError('');
        setIsLoading(true);
        const registrationError = await onRegister(form);
        if (registrationError) {
            setError(registrationError);
        }
        setIsLoading(false);
    };

    return (
        <div className="fixed inset-0 modal-backdrop z-50 flex justify-center items-center p-4">
            <div className="modal-panel p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold mb-4 text-ink">Crear Cuenta Administrador</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input name="firstName" value={form.firstName} onChange={handleChange} placeholder="Nombres" required className="w-full p-2 border rounded-md" />
                        <input name="lastName" value={form.lastName} onChange={handleChange} placeholder="Apellidos" required className="w-full p-2 border rounded-md" />
                        <input name="idNumber" value={form.idNumber} onChange={handleChange} placeholder="Cédula / Pasaporte" className="w-full p-2 border rounded-md" />
                        <select name="gender" value={form.gender} onChange={handleChange} className="w-full p-2 border rounded-md">
                            <option value="F">Femenino</option>
                            <option value="M">Masculino</option>
                        </select>
                        <input name="cargo" value={form.cargo} onChange={handleChange} placeholder="Cargo" className="w-full p-2 border rounded-md" />
                        <input name="empresa" value={form.empresa} onChange={handleChange} placeholder="Empresa (opcional)" className="w-full p-2 border rounded-md" />
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-ink-soft mb-1">Tipo de actividad comercial</label>
                            <select name="businessType" value={form.businessType} onChange={handleChange} className="w-full p-2 border rounded-md">
                                <optgroup label="Modo Tienda Craft (recomendado)">
                                    <option value="restaurante">Restaurante / Comida rápida</option>
                                    <option value="food_truck">Food Truck</option>
                                    <option value="cafeteria">Cafetería / Repostería</option>
                                    <option value="tienda_regalos">Tienda de regalos / artículos personalizados</option>
                                    <option value="libreria">Librería</option>
                                    <option value="floristeria">Floristería</option>
                                </optgroup>
                                <optgroup label="Modo Distribuidor">
                                    <option value="distribuidora">Distribuidora / Mayorista</option>
                                    <option value="ferreteria">Ferretería</option>
                                    <option value="farmacia">Farmacia</option>
                                    <option value="salon">Salón de belleza / Estética</option>
                                    <option value="supermercado">Supermercado / Minimarket</option>
                                    <option value="tecnologia">Tecnología / Electrónica</option>
                                    <option value="otro">Otra actividad</option>
                                </optgroup>
                            </select>
                            <p className="text-xs text-ink-muted mt-1">Esto configura la vista de pedidos más adecuada para tu negocio.</p>
                        </div>
                    </div>

                    <fieldset className="border p-4 rounded-md">
                        <legend className="text-sm font-medium">Dirección</legend>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                            <input name="address.street" value={form.address.street} onChange={handleChange} placeholder="Calle y Número" className="w-full p-2 border rounded-md md:col-span-2" />
                            <input name="address.sector" value={form.address.sector} onChange={handleChange} placeholder="Sector" className="w-full p-2 border rounded-md" />
                            <input name="address.city" value={form.address.city} onChange={handleChange} placeholder="Ciudad" className="w-full p-2 border rounded-md" />
                            <input name="address.zipCode" value={form.address.zipCode} onChange={handleChange} placeholder="Código Postal" className="w-full p-2 border rounded-md" />
                        </div>
                    </fieldset>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input name="phone" value={form.phone} onChange={handleChange} placeholder="Teléfono" className="w-full p-2 border rounded-md" />
                        <input name="cellphone" value={form.cellphone} onChange={handleChange} placeholder="Celular" className="w-full p-2 border rounded-md" />
                        <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Correo electrónico" required className="w-full p-2 border rounded-md" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="Contraseña" required className="w-full p-2 border rounded-md" />
                        <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} placeholder="Confirmar contraseña" required className="w-full p-2 border rounded-md" />
                    </div>

                    {error && <p role="alert" className="field-error">{error}</p>}

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 rounded bg-brand-600 text-white">{isLoading ? 'Registrando...' : 'Registrarse'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}