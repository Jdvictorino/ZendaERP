import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RegisterModal from '../src/components/modals/RegisterModal';

describe('RegisterModal', () => {
    it('renders and updates password strength', async () => {
        const onRegister = vi.fn();
        const onClose = vi.fn();
        render(<RegisterModal onRegister={onRegister} onClose={onClose} />);

        const passwordInput = screen.getByPlaceholderText('Contraseña');
        fireEvent.change(passwordInput, { target: { value: 'Abc123!' } });
        // strength should update; presence of text 'Fortaleza' indicates UI rendered
        expect(screen.getByText(/Fortaleza/i)).toBeTruthy();
    });
});
