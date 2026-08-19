import { render, screen } from '@testing-library/react';
import React from 'react';
import ShipmentsView from '../src/views/ShipmentsView.jsx';

const mockShipments = [
  {
    id: 's1',
    orderNumber: 'PED-1',
    toAddress: { name: 'Cliente Demo', city: 'Santo Domingo' },
    courier: 'local',
    status: 'created',
    items: [{ name: 'X', quantity: 1 }],
    weightKg: 3,
    dimensions: { length: 20, width: 15, height: 10 },
    trackingNumber: 'TRACK-123',
  },
];

vi.mock('../src/hooks/useCollection.js', () => ({
  __esModule: true,
  default: () => ({ data: mockShipments }),
}));

vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: () => {}, unmount: () => {} }),
}));

vi.mock('react-qr-code', () => ({
  __esModule: true,
  default: () => <svg data-testid="qr" />,
}));

vi.mock('../src/utils/shipping.js', () => {
  const buildLabelPayload = vi.fn((s) => ({
    id: s.id,
    orderNumber: s.orderNumber,
    code: s.orderNumber,
    sender: {},
    to: s.toAddress,
    items: s.items,
    courier: s.courier,
    postage: 0,
    confirmUrl: 'http://demo',
  }));
  return {
    __esModule: true,
    default: {
      updateShipmentStatus: vi.fn(),
      updateShipment: vi.fn(),
      createShipment: vi.fn(),
      deleteShipment: vi.fn(),
    },
    buildLabelPayload,
  };
});

// window.confirm is used when cancelling shipments
window.confirm = vi.fn(() => true);

describe('ShipmentsView', () => {
  it('renderiza la tabla con el estilo corporativo y columnas de detalles', () => {
    render(
      <ShipmentsView
        db={{}}
        userId="owner-1"
        companyProfile={{ name: 'Corp SRL' }}
        setView={() => {}}
        teamUsers={[{ id: 'driver-1', firstName: 'Ana', role: 'driver' }]}
      />
    );

    expect(screen.getByText('Envíos')).toBeInTheDocument();
    expect(screen.getByText('PED-1')).toBeInTheDocument();
    expect(screen.getByText(/Dimensiones:/)).toBeInTheDocument();
    expect(screen.getByText(/TRACK-123/)).toBeInTheDocument();
    expect(screen.getByText('Cliente Demo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear envío/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Eliminar/i })).toBeInTheDocument();
  });
});
