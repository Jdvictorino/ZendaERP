import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

const now = new Date();
const day = (d) => new Date(now.getFullYear(), now.getMonth(), d, 10).toISOString();
const DATA = {
  '/invoices': [
    { id: 'a', date: day(1), total: '1180.00', taxAmount: '180.00', status: 'Completado', customerId: 'c1', customerName: 'Colmado Ana',
      emitterInfo: { fullName: 'Pedro' }, payments: [{ efectivo: '1180.00' }], items: [{ productId: 'p1', productName: 'Arroz', quantity: 2, subtotal: '1000.00', costPrice: '100.00' }] },
    { id: 'b', date: day(1), total: '590.00', taxAmount: '90.00', status: 'Anulado', customerId: 'c1', customerName: 'Colmado Ana',
      items: [{ productId: 'p1', productName: 'Arroz', quantity: 1, subtotal: '500.00' }] },
  ],
  '/expenses': [{ id: 'e', invoiceDate: day(1), tipoGasto: 'Alquiler', totalMontoFacturado: '500.00', itbisFacturado: '76.27' }],
  '/products': [{ id: 'p1', name: 'Arroz', costPrice: '300.00', stock: 10 }],
  '/customers': [{ id: 'c1', name: 'Colmado Ana', category: 'Colmados' }],
};
vi.mock('../src/hooks/useApi.js', () => ({ useApiCrud: (url) => ({ data: DATA[url], loading: false }) }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

describe('ReportsViewSQL', () => {
  it('resume el período sin contar las ventas anuladas y sin emojis', async () => {
    const { default: ReportsViewSQL } = await import('../src/views/ReportsViewSQL.jsx');
    const { container } = render(<ReportsViewSQL companyProfile={{ currency: 'DOP' }} />);
    expect(screen.getByText('Ventas realizadas').parentElement.textContent).toContain('1');
    expect(screen.getByText('Gastos por tipo')).toBeTruthy();
    expect(screen.getByText('Alquiler')).toBeTruthy();
    expect(screen.getByText('Ventas por cliente')).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
  it('el margen usa el costo guardado en la venta, no el actual del producto', async () => {
    const { default: ReportsViewSQL } = await import('../src/views/ReportsViewSQL.jsx');
    const { container } = render(<ReportsViewSQL companyProfile={{ currency: 'DOP' }} />);
    expect(container.textContent).toContain('RD$980.0083.1% sobre ventas');
  });
});
