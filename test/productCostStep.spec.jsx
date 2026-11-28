import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/api/client.js', () => ({ default: {} }));
import ProductModal from '../src/components/modals/ProductModal.jsx';

describe('ProductModal: costo con 4 decimales', () => {
  it('un costo promedio de 6.1235 no bloquea el guardado', () => {
    const { container } = render(<ProductModal product={{ id: 'p1', name: 'Agua', purchasePrice: 6.1235, salePrice: 10, stock: 5, packagings: [] }} onClose={() => {}} onSave={() => {}} suppliers={[]} categories={[]} />);
    const input = container.querySelector('input[name="purchasePrice"]');
    expect(input.value).toBe('6.1235');
    expect(input.validity.stepMismatch).toBe(false);
  });
});
