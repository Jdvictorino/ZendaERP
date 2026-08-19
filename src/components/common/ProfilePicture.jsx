import React from 'react';
import { Upload } from 'lucide-react';

export default function ProfilePicture({ photoURL, handleImageChange, id = 'photoUpload' }) {
    return (
        <div className="flex flex-col items-center space-y-2">
            <img
                src={photoURL || 'https://placehold.co/100x100/e2e8f0/a0aec0?text=Foto'}
                alt="Foto de perfil"
                className="w-24 h-24 rounded-full object-cover border-2 border-gray-300"
            />
            <label htmlFor={id} className="cursor-pointer bg-gray-200 text-gray-700 text-sm py-1 px-3 rounded-lg hover:bg-gray-300 flex items-center gap-2">
                <Upload size={14} />
                Cargar Foto
            </label>
            <input id={id} type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
        </div>
    );
}
