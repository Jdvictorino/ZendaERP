import React from 'react';
import { Upload, User } from 'lucide-react';

export default function ProfilePicture({ photoURL, handleImageChange, id = 'photoUpload' }) {
    return (
        <div className="flex flex-col items-center space-y-2">
            {photoURL ? (
                <img
                    src={photoURL}
                    alt="Foto de perfil"
                    className="w-24 h-24 rounded-full object-cover border border-line"
                />
            ) : (
                <div className="w-24 h-24 rounded-full bg-surface-muted border border-line flex items-center justify-center text-gray-400 dark:text-gray-500" aria-label="Sin foto de perfil" role="img">
                    <User size={36} />
                </div>
            )}
            <label htmlFor={id} className="cursor-pointer border border-line bg-surface text-ink text-sm font-medium h-8 px-3 rounded-lg hover:bg-surface-muted flex items-center gap-2 shadow-sm">
                <Upload size={14} />
                Cargar foto
            </label>
            <input id={id} type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
        </div>
    );
}
