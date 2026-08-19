import React from 'react';
import { settings as settingsApi } from '../api/client.js';
import ProfileModal from '../components/modals/ProfileModal.jsx';

const CompanyProfileViewSQL = ({ companyProfile, onProfileUpdate, isMasterUser, setView, previousView }) => {
  const handleSaveProfile = async (profileData) => {
    const savedProfile = await settingsApi.update({
      name: profileData.name || profileData.companyName,
      rnc: profileData.rnc || profileData.taxId || '',
      phone: profileData.phone || '',
      email: profileData.email || '',
      address: profileData.address || {},
      currency: profileData.currency || 'DOP',
      logo: profileData.logo || '',
      bankDetails: profileData.bankDetails || {},
      cash: profileData.cash || {},
      notifications: profileData.notifications || {},
      pricing: profileData.pricing || {},
      allowCustomization: profileData.allowCustomization !== undefined ? profileData.allowCustomization : true,
      customerCategories: profileData.customerCategories || [],
      ncf: profileData.ncf || {},
      orderMode: profileData.orderMode || 'craft',
    });

    if (onProfileUpdate) {
      onProfileUpdate(savedProfile);
    }

    return savedProfile;
  };

  return (
    <div className="space-y-6">
      <ProfileModal
        profile={companyProfile}
        onClose={() => setView(previousView || 'dashboard')}
        onSave={handleSaveProfile}
        isMasterUser={isMasterUser}
        fullPage
      />
    </div>
  );
};

export default CompanyProfileViewSQL;
