// src/services/billing.js
// Migrado de Firebase a PostgreSQL API
import { invoices } from '../../api/client.js';

/**
 * Factura un pedido usando el API del backend.
 * El backend maneja atomicamente la asignación de NCF y actualización de secuencias.
 * @param {{ order: any, billingType: 'NoFiscal'|'B01'|'B02', rnc?: string }} params
 * @returns {Promise<object>} orderUpdate aplicado (incluye ncf/fechas)
 */
export async function billOrderTx({ order, billingType, rnc }) {
  // Llamar al endpoint de facturación del backend que maneja la transacción
  const result = await invoices.bill(order.id, billingType, rnc);
  
  return {
    isBilled: true,
    invoiceNumber: result.invoiceNumber || order.orderNumber,
    billedDate: result.billedDate || new Date().toISOString(),
    ncf: {
      number: result.ncfNumber || 'N/A',
      type: billingType,
      customerRnc: rnc || ''
    }
  };
}
