import React, { useState, useEffect } from 'react';
import ProfilePicture from '../common/ProfilePicture.jsx';

const CURRENCIES = [
  { value: 'DOP', label: 'Peso Dominicano (DOP)' },
  { value: 'USD', label: 'Dólar Americano (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
];

export default function StepCompanyForm({ initialData = {}, onNext, onBack, animClass }) {
  const [form, setForm] = useState({
    name: '',
    rnc: '',
    phone: '',
    email: '',
    currency: 'DOP',
    businessType: 'otro',
    logo: '',
    address: { street: '', sector: '', city: '', zipCode: '', country: 'República Dominicana' },
    ...initialData,
  });

  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      setForm(prev => ({
        ...prev,
        ...initialData,
        address: { ...prev.address, ...(initialData.address || {}) },
      }));
    }
  }, []);

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }));
  const handleChange = (e) => set(e.target.name, e.target.value);
  const handleAddress = (e) => setForm(p => ({
    ...p, address: { ...p.address, [e.target.name]: e.target.value }
  }));
  const compressImage = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        callback(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleLogo = (e) => {
    if (e.target.files?.[0]) {
      compressImage(e.target.files[0], (dataUrl) => set('logo', dataUrl));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    onNext(form);
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${animClass}`} noValidate>
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 mb-1">Paso 2 de 3</p>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Datos de la Empresa</h2>
        <p className="text-sm text-gray-500 mt-1">Esta información aparecerá en tus facturas y comprobantes. Puedes actualizarla luego desde Configuración.</p>
      </div>

      {/* Logo + Info general */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wide">Identidad Comercial</h3></div>
          <div className="p-5">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Logo */}
            <div className="flex flex-col items-center gap-2 md:w-36 flex-shrink-0">
              <ProfilePicture photoURL={form.logo} handleImageChange={handleLogo} id="companyLogo" />
              <p className="text-xs text-gray-400 text-center">Logo de la empresa<br/>(opcional)</p>
            </div>
            {/* Fields */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre comercial <span className="text-red-500">*</span></label>
                <input name="name" value={form.name} onChange={handleChange}
                  className="input-base text-lg font-semibold" placeholder="Mi Empresa S.R.L." required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">RNC <span className="text-gray-400">(opcional)</span></label>
                <input name="rnc" value={form.rnc} onChange={handleChange}
                  className="input-base" placeholder="1-00-00000-0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Moneda principal</label>
                <select name="currency" value={form.currency} onChange={handleChange} className="input-base">
                  {CURRENCIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de actividad comercial <span className="text-red-500">*</span></label>
                <select name="businessType" value={form.businessType} onChange={handleChange} className="input-base" required>
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contacto */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wide">Contacto</h3></div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="reg-label">Teléfono</label>
            <input name="phone" value={form.phone} onChange={handleChange}
              className="input-base" placeholder="809-000-0000" />
          </div>
          <div>
            <label className="reg-label">Correo empresarial</label>
            <input type="email" name="email" value={form.email} onChange={handleChange}
              className="input-base" placeholder="info@empresa.com" />
          </div>
        </div>
      </div>

      {/* Dirección */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wide">Dirección Fiscal</h3></div>
          <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="reg-label">Calle / Avenida</label>
              <input name="street" value={form.address.street} onChange={handleAddress}
                className="input-base" placeholder="Av. Principal #123" />
            </div>
            <div>
              <label className="reg-label">Sector</label>
              <input name="sector" value={form.address.sector} onChange={handleAddress}
                className="input-base" placeholder="Centro" />
            </div>
            <div>
              <label className="reg-label">Ciudad</label>
              <input name="city" value={form.address.city} onChange={handleAddress}
                className="input-base" placeholder="Santo Domingo" />
            </div>
            <div>
              <label className="reg-label">Código Postal</label>
              <input name="zipCode" value={form.address.zipCode} onChange={handleAddress}
                className="input-base" placeholder="10000" />
            </div>
            <div>
              <label className="reg-label">País</label>
              <input name="country" value={form.address.country} onChange={handleAddress}
                className="input-base" placeholder="República Dominicana" />
            </div>
          </div>
        </div>
      </div>

      {/* Hidden submit triggered by footer button */}
      <button type="submit" id="step-company-submit" className="hidden" />
    </form>
  );
}
