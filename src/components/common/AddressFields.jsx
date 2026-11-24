import React from 'react';
import { Field } from '../registration/FormParts.jsx';

/**
 * Campos de dirección. Con `title={null}` se muestran con etiquetas, sin marco propio
 * (para usarlos dentro de una sección que ya tiene título).
 */
export default function AddressFields({ address, onChange, title = 'Datos de Dirección', idPrefix = 'addr' }) {
    if (title === null) {
        const input = (name, placeholder, extra = {}) => (
            <input name={name} value={address[name] || ''} onChange={onChange} placeholder={placeholder} className="input-base" {...extra} />
        );
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id={`${idPrefix}-street`} label="Calle y número" className="sm:col-span-2">{input('street', 'Av. Duarte #123', { autoComplete: 'address-line1' })}</Field>
                <Field id={`${idPrefix}-sector`} label="Sector">{input('sector', 'Ensanche Ozama')}</Field>
                <Field id={`${idPrefix}-city`} label="Ciudad">{input('city', 'Santo Domingo', { autoComplete: 'address-level2' })}</Field>
                <Field id={`${idPrefix}-zip`} label="Código postal" optional>{input('zipCode', '11501', { autoComplete: 'postal-code', inputMode: 'numeric' })}</Field>
                <Field id={`${idPrefix}-country`} label="País">{input('country', 'República Dominicana', { autoComplete: 'country-name' })}</Field>
            </div>
        );
    }

    return (
        <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-semibold text-brand-600 px-2">{title}</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input name="street" value={address.street} onChange={onChange} placeholder="Calle y Número" className="w-full p-2 border rounded-md md:col-span-2" />
                <input name="sector" value={address.sector} onChange={onChange} placeholder="Sector" className="w-full p-2 border rounded-md" />
                <input name="city" value={address.city} onChange={onChange} placeholder="Ciudad" className="w-full p-2 border rounded-md" />
                <input name="zipCode" value={address.zipCode} onChange={onChange} placeholder="Código Postal (Opcional)" className="w-full p-2 border rounded-md" />
                <input name="country" value={address.country} onChange={onChange} placeholder="País" className="w-full p-2 border rounded-md" />
            </div>
        </fieldset>
    );
}
