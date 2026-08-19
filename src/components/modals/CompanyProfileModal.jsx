import React, { useState } from 'react';
import ProfileModal from './ProfileModal.jsx';

export default function CompanyProfileModal({ initialData = {}, onClose, onCollect }) {
    const [profileData, setProfileData] = useState(initialData || {});

    const handleSaveLocal = async (data) => {
        // Retornamos los datos al contenedor (App) para mantenerlos en memoria hasta la revisión
        if (onCollect) onCollect(data || profileData);
    };

    return (
        <ProfileModal profile={profileData} onClose={onClose} onSave={handleSaveLocal} isMasterUser={true} />
    );
}