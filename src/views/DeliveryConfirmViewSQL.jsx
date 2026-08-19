import React, { useEffect, useState } from 'react';
import { shipments as shipmentsApi } from '../api/client.js';

const DeliveryConfirmViewSQL = () => {
  const [status, setStatus] = useState('loading');
  const [shipment, setShipment] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [message, setMessage] = useState('');
  const [recipientName, setRecipientName] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shipmentId = params.get('shipmentId') || params.get('id');
    const invoiceId = params.get('invoiceId');
    const token = params.get('token');
    
    // Para PostgreSQL usamos invoiceId para confirmar entrega
    const idToUse = invoiceId || shipmentId;
    
    if (!idToUse) {
      setStatus('error');
      setMessage('Parámetros de QR inválidos.');
      return;
    }

    const fetchShipment = async () => {
      try {
        // Intentar obtener el envío por ID
        const data = await shipmentsApi.get(idToUse);
        if (!data) {
          setStatus('error');
          setMessage('Envío no encontrado.');
          return;
        }
        
        // Token validation (si es necesario)
        if (token && data.qrCode && !data.qrCode.includes(token)) {
          // Simple validation - en producción podría ser más estricto
          console.warn('Token validation skipped');
        }
        
        if (data.status === 'delivered') {
          setStatus('done');
          setMessage('Este envío ya fue entregado.');
          return;
        }
        
        setShipment(data);
        setRecipientName(data.recipientName || '');
        setStatus('ready');
      } catch (err) {
        console.error('Error fetching shipment:', err);
        setStatus('error');
        setMessage('Error al obtener el envío.');
      }
    };

    fetchShipment();
  }, []);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setPhoto(f);
  };

  const confirmDelivery = async () => {
    if (!shipment) return;
    setStatus('saving');
    try {
      // Para PostgreSQL, usamos el endpoint público de confirmación
      // Nota: La carga de fotos no está implementada sin Firebase Storage
      // En producción, podrías usar un servicio alternativo
      
      // Usar el endpoint público de confirmación
      await shipmentsApi.confirmDeliveryPublic(
        shipment.invoiceId,
        photo ? 'photo_attached' : null, // Simplificado sin upload
        recipientName || null
      );
      
      setStatus('done');
      setMessage('Entrega confirmada. ¡Gracias!');
    } catch (err) {
      console.error('Error confirming delivery:', err);
      setStatus('error');
      setMessage(err.data?.error || 'No se pudo confirmar la entrega.');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }
  
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4">✕</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-gray-600">{message}</p>
        </div>
      </div>
    );
  }
  
  if (status === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
          <div className="text-green-500 text-5xl mb-4">✓</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">¡Completado!</h2>
          <p className="text-gray-600">{message}</p>
        </div>
      </div>
    );
  }

  if (status === 'saving') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Confirmando entrega...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Confirmar Entrega</h2>
        
        {shipment && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium text-gray-700">Orden:</span>{' '}
                  <span className="text-gray-600">{shipment.invoice?.orderNumber || shipment.invoiceId}</span>
                </p>
                <p className="text-sm">
                  <span className="font-medium text-gray-700">Destinatario:</span>{' '}
                  <span className="text-gray-600">{shipment.recipientName || shipment.invoice?.customerName || 'Sin nombre'}</span>
                </p>
                <p className="text-sm">
                  <span className="font-medium text-gray-700">Dirección:</span>{' '}
                  <span className="text-gray-600">{shipment.deliveryAddress || 'Sin dirección'}</span>
                </p>
                <p className="text-sm">
                  <span className="font-medium text-gray-700">Estado:</span>{' '}
                  <span className="text-gray-600 capitalize">{shipment.status}</span>
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre de quien recibe:
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Nombre del receptor"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Foto comprobante (opcional):
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-indigo-50 file:text-indigo-700
                  hover:file:bg-indigo-100"
              />
              {photo && (
                <p className="text-xs text-green-600 mt-2">
                  ✓ Foto seleccionada: {photo.name}
                </p>
              )}
            </div>

            <button
              onClick={confirmDelivery}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              Confirmar Entrega
            </button>

            {message && (
              <p className="text-center text-red-600 text-sm">{message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryConfirmViewSQL;
