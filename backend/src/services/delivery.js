// Quién puede confirmar una entrega: quien trae la llave del QR, o un usuario de la misma empresa.
export function canConfirmDelivery({ shipment, token, user }) {
  if (!shipment) return false;
  if (token && token === shipment.deliveryToken) return true;
  return Boolean(user && user.companyId === shipment.companyId);
}
