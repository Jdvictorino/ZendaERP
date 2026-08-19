import React from 'react';
import { render } from '@testing-library/react';
import RegistrationReviewModal from '../src/components/modals/RegistrationReviewModal.jsx';

describe('RegistrationReviewModal snapshot', () => {
    it('renders admin and company data correctly', () => {
        const adminData = {
            firstName: 'Juan',
            lastName: 'Pérez',
            email: 'juan@example.com',
            cargo: 'Administrador',
            phone: '809-555-1234',
            idNumber: '001-1234567-8',
            photoURL: ''
        };
        const companyData = {
            name: 'Mi Empresa',
            rnc: '101-23456-7',
            address: { street: 'Calle Falsa', sector: 'Centro', city: 'Santo Domingo' },
            phone: '809-555-0000',
            email: 'info@miempresa.com',
            logo: ''
        };

        const { container } = render(
            <RegistrationReviewModal
                adminData={adminData}
                companyData={companyData}
                onBackToCompany={() => {}}
                onBackToAdmin={() => {}}
                onConfirm={() => {}}
                onClose={() => {}}
                isProcessing={false}
                onClear={() => {}}
            />
        );

        expect(container).toMatchSnapshot();
    });
});
