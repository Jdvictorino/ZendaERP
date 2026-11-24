import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { validateAdmin, validateCompany } from '../src/components/registration/validation.js';
import StepAdminForm from '../src/components/registration/StepAdminForm.jsx';
import StepCompanyForm from '../src/components/registration/StepCompanyForm.jsx';

const okAdmin = { firstName: 'Ana', lastName: 'Pérez', email: 'ana@colmado.do', password: 'Clave#2026', confirmPassword: 'Clave#2026' };

describe('validación del registro', () => {
  it('administrador: exige nombre, correo válido y contraseña fuerte que coincida', () => {
    expect(validateAdmin(okAdmin)).toEqual({});
    const e = validateAdmin({ ...okAdmin, firstName: ' ', email: 'ana@', password: 'abc', confirmPassword: 'abd' });
    expect(Object.keys(e).sort()).toEqual(['confirmPassword', 'email', 'firstName', 'password']);
  });
  it('administrador: cédula de 11 dígitos, pasaporte libre, teléfonos de 10 dígitos', () => {
    expect(validateAdmin({ ...okAdmin, idNumber: '001-1234567-8' })).toEqual({});
    expect(validateAdmin({ ...okAdmin, idNumber: 'RD1234567' })).toEqual({});
    expect(validateAdmin({ ...okAdmin, idNumber: '001-123', cellphone: '809-55' })).toHaveProperty('idNumber');
    expect(validateAdmin({ ...okAdmin, cellphone: '809-55' })).toHaveProperty('cellphone');
  });
  it('empresa: nombre obligatorio, RNC de 9 u 11 dígitos con o sin guiones', () => {
    expect(validateCompany({ name: 'Colmado', rnc: '1-01-23456-7' })).toEqual({});
    expect(validateCompany({ name: 'Colmado', rnc: '001-1234567-8' })).toEqual({});
    expect(validateCompany({ name: '', rnc: '12345' })).toEqual({ name: expect.any(String), rnc: expect.any(String) });
  });
});

describe('pasos del registro', () => {
  it('paso 1 vacío muestra los errores en los campos y no avanza', () => {
    const onNext = vi.fn();
    const { container } = render(<StepAdminForm onNext={onNext} animClass="" />);
    fireEvent.submit(container.querySelector('form'));
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Nombres/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Escribe el correo con el que vas a entrar.')).toBeInTheDocument();
  });
  it('paso 2 con datos válidos avanza con el formulario completo', () => {
    const onNext = vi.fn();
    const { container } = render(<StepCompanyForm onNext={onNext} animClass="" />);
    fireEvent.change(screen.getByLabelText(/Nombre comercial/), { target: { value: 'Colmado La Esquina' } });
    fireEvent.submit(container.querySelector('form'));
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ name: 'Colmado La Esquina', currency: 'DOP', businessType: 'otro' }));
  });
});
