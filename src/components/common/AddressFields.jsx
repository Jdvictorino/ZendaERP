import React from 'react';

export default function AddressFields({ address, onChange }) {
    const handle = (e) => onChange(e);

    return (
        <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-semibold text-indigo-600 px-2">Datos de Dirección</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input name="street" value={address.street} onChange={handle} placeholder="Calle y Número" className="w-full p-2 border rounded-md md:col-span-2" />
                <input name="sector" value={address.sector} onChange={handle} placeholder="Sector" className="w-full p-2 border rounded-md" />
                <input name="city" value={address.city} onChange={handle} placeholder="Ciudad" className="w-full p-2 border rounded-md" />
                <input name="zipCode" value={address.zipCode} onChange={handle} placeholder="Código Postal (Opcional)" className="w-full p-2 border rounded-md" />
                <input name="country" value={address.country} onChange={handle} placeholder="País" className="w-full p-2 border rounded-md" />
            </div>
        </fieldset>
    );
}
