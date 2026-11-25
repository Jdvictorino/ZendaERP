// Copia de backend/src/services/expensePayable.js — mantener iguales desde la línea 2 (la prueba test/expensePayment.spec.js las compara)
const num = (v) => Number(v) || 0;

// Lo que se le debe al suplidor: bienes + servicios + ITBIS + propina, menos lo retenido
export const expensePayable = (e) => {
  const base = num(e.montoFacturado) || num(e.montoBienes) + num(e.montoServicios);
  return Math.max(0, base + num(e.itbisFacturado) + num(e.propina) - num(e.itbisRetenido) - num(e.montoRetencionIsr));
};

// Estado de pago: se calcula, no se guarda
export const expensePaymentStatus = (e) => {
  const paid = num(e.paidAmount);
  if (paid > 0 && paid >= expensePayable(e) - 0.01) return 'Pagado';
  return paid > 0 ? 'Parcial' : 'Pendiente';
};
