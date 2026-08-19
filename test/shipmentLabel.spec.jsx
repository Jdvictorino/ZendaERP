import React from 'react';
import { render, screen } from '@testing-library/react';
import ShipmentLabel from '../src/components/ShipmentLabel.jsx';

describe('ShipmentLabel', () => {
  const baseShipment = {
    id: 'SHIP-001',
    orderNumber: 'PED-1001',
    token: 'secure-token',
    sender: { name: 'Corp SRL', street: 'Av. Principal 123', city: 'Santo Domingo', postalCode: '10100', phone: '809-555-0000' },
    toAddress: { name: 'Juan Pérez', street: 'Calle 1ra #45', city: 'San Pedro', postalCode: '21000', phone: '809-555-1212' },
    items: [{ name: 'Producto A', quantity: 1 }],
    courier: 'local',
    postage: 150,
    ownerId: 'owner-1',
    weightKg: 4.5,
    dimensions: { length: 30, width: 25, height: 10 },
    trackingNumber: 'TRK-001-ABC',
  };

  it('muestra remitente, consignatario y métricas logísticas', () => {
    render(<ShipmentLabel shipment={baseShipment} />);
    expect(screen.getByText(/PED-1001/)).toBeInTheDocument();
    expect(screen.getByText('Corp SRL')).toBeInTheDocument();
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('4.5kg')).toBeInTheDocument();
    expect(screen.getByText('30x25x10 cm')).toBeInTheDocument();
    expect(screen.getByText(/TRK-001-ABC/)).toBeInTheDocument();
  });
});
