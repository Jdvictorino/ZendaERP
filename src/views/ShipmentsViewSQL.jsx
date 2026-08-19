import React, { useState, useMemo, useEffect } from 'react';
import { useApiCrud } from '../hooks/useApi.js';
import { shipments as shipmentsApi, users as usersApi, invoices as invoicesApi, customers as customersApi } from '../api/client.js';
import QRCode from 'react-qr-code';
import { createRoot } from 'react-dom/client';
import ShipmentModal from '../components/ShipmentModal.jsx';
import { buildLabelPayload } from '../utils/shipping.js';
import ShipmentLabel from '../components/ShipmentLabel.jsx';
import notificationService from '../utils/notificationService.js';
import { Tag, Settings, Printer, Send, CheckCircle, X, Trash2, Plus } from 'lucide-react';
import Button from '../components/ui/Button.jsx';

const ShipmentsViewSQL = ({ companyProfile, setView, isMasterUser, currentUserProfile, onProfileUpdate }) => {
  // Fetch data using API hooks
  const { data: shipmentsRaw, loading: loadingShipments, refetch: refetchShipments } = useApiCrud('/shipments');
  const { data: teamUsersRaw, loading: loadingUsers } = useApiCrud('/users');
  const { data: invoicesRaw, loading: loadingInvoices } = useApiCrud('/invoices');
  const { data: customersRaw, loading: loadingCustomers } = useApiCrud('/customers');
  
  // Ensure arrays are never null
  const shipments = Array.isArray(shipmentsRaw) ? shipmentsRaw : [];
  const teamUsers = Array.isArray(teamUsersRaw) ? teamUsersRaw : [];
  const invoices = Array.isArray(invoicesRaw) ? invoicesRaw : [];
  const customers = Array.isArray(customersRaw) ? customersRaw : [];

  const [showModal, setShowModal] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [labelData, setLabelData] = useState(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryShipment, setDeliveryShipment] = useState(null);
  const [proofPhoto, setProofPhoto] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Definir permisos al inicio
  const currentUserId = currentUserProfile?.uid || currentUserProfile?.id;
  const currentRole = (currentUserProfile?.role || '').toLowerCase().trim();
  
  // Roles que pueden marcar envíos como enviados (después de ser creados)
  // El driver puede marcar como enviado si está asignado al envío
  const canCurrentUserMarkAsShipped = isMasterUser || ['admin', 'manager', 'cashier', 'vendedor', 'seller', 'driver'].includes(currentRole);
  
  // Roles que pueden crear/editar/asignar envíos
  const canCurrentUserAssignShipment = isMasterUser || ['admin', 'manager', 'cashier'].includes(currentRole);

  // Debug: Log de permisos
  useEffect(() => {
    console.log('🔍 ShipmentsViewSQL Debug:', {
      isMasterUser,
      currentRole,
      currentUserProfile,
      teamUsers: (teamUsers || []).map(u => ({ id: u.id, role: u.role, firstName: u.firstName, lastName: u.lastName })),
      canCurrentUserAssignShipment,
      canCurrentUserMarkAsShipped,
      currentUserId
    });
  }, [isMasterUser, currentRole, currentUserProfile, canCurrentUserAssignShipment, canCurrentUserMarkAsShipped, teamUsers, currentUserId]);

  const openCreate = () => {
    if (!canCurrentUserAssignShipment) {
      alert('Solo administradores, gerentes y cajeros pueden crear envíos.');
      return;
    }
    setSelectedShipment(null);
    setShowModal(true);
  };

  const handleCreate = async (payload) => {
    try {
      // ensure sender is company
      const sender = companyProfile ? {
        name: companyProfile.name || '',
        phone: companyProfile.phone || '',
        street: companyProfile.address || '',
        city: companyProfile.city || '',
        postalCode: companyProfile.postalCode || ''
      } : {};
      
      const res = await shipmentsApi.create({ ...payload, sender });
      setShowModal(false);
      setLabelData(res);
      refetchShipments();
    } catch (err) {
      console.error('Error creando envío', err);
      alert('No se pudo crear el envío. Revisa la consola.');
    }
  };

  const handleEdit = (s) => {
    if (!canCurrentUserAssignShipment) {
      alert('Solo administradores, gerentes y cajeros pueden editar envíos.');
      return;
    }
    setSelectedShipment(s);
    setShowModal(true);
  };

  const handleUpdate = async (shipmentId, patch) => {
    try {
      const updated = await shipmentsApi.update(shipmentId, patch);
      setShowModal(false);
      setLabelData(updated);
      refetchShipments();
    } catch (err) {
      console.error('Error actualizando envío', err);
      alert('No se pudo actualizar el envío.');
    }
  };

  const handleCancel = async (shipmentId) => {
    if (!confirm('¿Cancelar este envío?')) return;
    try {
      await shipmentsApi.updateStatus(shipmentId, 'cancelled', {});
      refetchShipments();
    } catch (err) {
      console.error('Error cancelando envío', err);
      alert('No se pudo cancelar el envío.');
    }
  };

  const handleDelete = async (shipmentId) => {
    if (!confirm('Esta eliminación es permanente. ¿Eliminar el registro de envío?')) return;
    try {
      await shipmentsApi.delete(shipmentId);
      refetchShipments();
    } catch (err) {
      console.error('Error eliminando envío', err);
      alert('No se pudo eliminar el envío.');
    }
  };

  const handleAssign = async (shipmentId, driverId) => {
    try {
      await shipmentsApi.assignDriver(shipmentId, driverId || null);
      refetchShipments();
    } catch (err) {
      console.error('Error asignando driver', err);
      alert('No se pudo asignar el repartidor.');
    }
  };

  const handleMarkAsShipped = async (shipmentId, assignedDriverId) => {
    if (!canCurrentUserMarkAsShipped) {
      alert('Solo administradores, gerentes, vendedores o mensajeros pueden marcar envíos como enviados.');
      return;
    }
    if (!assignedDriverId) {
      alert('Debe asignar un repartidor antes de marcar como enviado.');
      return;
    }
    if (!confirm('¿Marcar este envío como "En Reparto"? El repartidor asignado podrá confirmar la entrega.')) return;
    try {
      // Cambiar a "out_for_delivery" cuando el vendedor confirma que está en reparto
      await shipmentsApi.updateStatus(shipmentId, 'out_for_delivery', {});
      
      // Notificación del dispositivo - Envío despachado
      const shipment = shipments.find(s => s.id === shipmentId);
      notificationService.notify('SHIPMENT_DISPATCHED', {
        title: 'Envío Despachado',
        message: `Envío #${shipment?.trackingNumber || shipmentId} está en reparto`,
      }, ['desktop']);
      
      refetchShipments();
    } catch (err) {
      console.error('Error marcando como enviado', err);
      alert('No se pudo marcar como enviado.');
    }
  };

  const openDeliveryModal = (shipment) => {
    // Verificar que el usuario actual sea el repartidor asignado
    const isAssignedDriver = shipment.assignedDriverId === currentUserId;
    
    if (!isAssignedDriver && !isMasterUser) {
      alert('Solo el repartidor asignado puede marcar como entregado.');
      return;
    }
    
    setDeliveryShipment(shipment);
    setProofPhoto(null);
    setShowDeliveryModal(true);
  };

  const handleMarkAsDelivered = async () => {
    if (!deliveryShipment) return;
    setIsUploading(true);
    
    try {
      // Nota: Sin Firebase Storage, la foto se maneja de forma diferente
      // Por ahora, solo indicamos que se seleccionó una foto
      let photoInfo = null;
      if (proofPhoto) {
        photoInfo = {
          fileName: proofPhoto.name,
          fileSize: proofPhoto.size,
          fileType: proofPhoto.type
        };
        console.log('Foto de comprobante seleccionada:', photoInfo);
        // TODO: Implementar upload de imagen al backend si es necesario
      }

      // Actualizar estado del envío
      await shipmentsApi.updateStatus(
        deliveryShipment.id, 
        'delivered', 
        {
          deliveredAt: new Date().toISOString(),
          deliveredBy: currentUserId,
          proofImageInfo: photoInfo,
          tokenUsed: true
        }
      );
      
      // Notificación del dispositivo - Envío entregado
      notificationService.notify('SHIPMENT_DELIVERED', {
        title: 'Entrega Confirmada',
        message: `Envío #${deliveryShipment.trackingNumber || deliveryShipment.id} entregado exitosamente`,
      }, ['desktop']);

      setShowDeliveryModal(false);
      setDeliveryShipment(null);
      setProofPhoto(null);
      refetchShipments();
    } catch (err) {
      console.error('Error marcando como entregado', err);
      alert('No se pudo marcar como entregado.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleShowLabel = (s) => {
    setLabelData(s);
    setShowLabelModal(true);
  };

  const openPrintWindowForShipment = (s) => {
    try {
      // Build payload with company data as sender
      const sender = companyProfile ? {
        name: companyProfile.name || '',
        phone: companyProfile.phone || '',
        street: companyProfile.address || '',
        city: companyProfile.city || '',
        postalCode: companyProfile.postalCode || ''
      } : {};
      
      const payload = { ...buildLabelPayload(s), sender };
      const displayCode = payload.orderNumber || payload.orderId || payload.id;
      const asText = (value) => {
        if (value == null) return '';
        if (typeof value === 'string' || typeof value === 'number') return String(value);
        if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
        if (typeof value === 'object') return Object.values(value).map(asText).filter(Boolean).join(', ');
        return '';
      };

      const itemsHtml = (payload.items || []).map((item, idx) => 
        `<tr><td>${idx + 1}</td><td>${item.name || item.sku || 'Item'}</td><td class="text-center">${item.qty || item.quantity || 1}</td><td class="text-center">☐</td></tr>`
      ).join('');
      
      const weightDisplay = payload.weightKg ? payload.weightKg + 'kg' : '—';
      const rncLine = companyProfile?.rnc ? `<p>RNC: ${companyProfile.rnc}</p>` : '';
      const logoHtml = companyProfile?.logo ? `<img src="${companyProfile.logo}" alt="Logo" class="header-logo" />` : '';
      const hasLogo = Boolean(companyProfile?.logo);

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Orden de Entrega - ${displayCode}</title>
  <style>
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif; 
      font-size: 10pt; 
      color: #1f2937; 
      background: #fff; 
      padding: 20mm 15mm;
      line-height: 1.5;
    }
    .container { max-width: 750px; margin: 0 auto; }
    
    /* Header */
    .header {
      background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: grid;
      grid-template-columns: ${hasLogo ? '60px 1fr 1fr' : '1fr 1fr'};
      gap: 20px;
      align-items: start;
    }
    .header-logo { 
      width: 60px; 
      height: 60px; 
      object-fit: contain; 
      background: white;
      border-radius: 4px;
      padding: 4px;
    }
    .header-left h1 { font-size: 14pt; font-weight: 700; margin-bottom: 4px; }
    .header-left p { font-size: 8.5pt; opacity: 0.9; margin-bottom: 2px; }
    .header-right { text-align: right; }
    .header-right .doc-type { font-size: 8.5pt; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .header-right .doc-number { font-size: 16pt; font-weight: 700; }
    
    /* Info Grid */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .info-box { 
      background: #f9fafb; 
      border: 1px solid #e5e7eb; 
      border-left: 4px solid #3b82f6;
      border-radius: 4px; 
      padding: 12px; 
    }
    .info-box h3 { 
      margin: 0 0 8px 0; 
      font-size: 8.5pt; 
      color: #374151; 
      font-weight: 700; 
      text-transform: uppercase; 
      letter-spacing: 0.5px; 
    }
    .info-box p { margin: 3px 0; font-size: 9pt; line-height: 1.4; }
    .info-box strong { color: #1f2937; }
    
    /* Details Box */
    .details-section { 
      background: #f9fafb; 
      border: 1px solid #e5e7eb; 
      border-radius: 4px; 
      padding: 12px; 
      margin-bottom: 20px;
    }
    .details-section h3 { 
      margin: 0 0 12px 0; 
      font-size: 9pt; 
      color: #374151; 
      font-weight: 700; 
      text-transform: uppercase;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 8px;
    }
    .details-grid { 
      display: grid; 
      grid-template-columns: repeat(4, 1fr); 
      gap: 10px; 
    }
    .detail-item { background: white; padding: 8px; border-radius: 3px; border: 1px solid #e5e7eb; }
    .detail-item strong { display: block; font-size: 8pt; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.3px; }
    .detail-item span { display: block; font-size: 10pt; color: #1f2937; font-weight: 600; }
    
    /* Table */
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #fff; font-size: 9pt; }
    table thead { background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%); }
    table th { 
      color: #1e40af; 
      padding: 8px; 
      text-align: left; 
      font-size: 8.5pt; 
      font-weight: 700; 
      text-transform: uppercase; 
      border-bottom: 2px solid #3b82f6;
    }
    table td { 
      padding: 7px 8px; 
      border-bottom: 1px solid #e5e7eb; 
    }
    table tbody tr:nth-child(even) { background: #f9fafb; }
    table .text-center { text-align: center; }
    
    /* Notes Section */
    .notes-section { 
      background: #fffbeb; 
      border: 1px solid #fcd34d; 
      border-left: 4px solid #f59e0b;
      border-radius: 4px; 
      padding: 12px; 
      margin-bottom: 20px;
    }
    .notes-section h4 { 
      margin: 0 0 8px 0; 
      font-size: 9pt; 
      color: #92400e; 
      font-weight: 700; 
      text-transform: uppercase;
    }
    .notes-section .lines { display: flex; flex-direction: column; gap: 6px; }
    .notes-section .line { border-bottom: 1px solid #d1d5db; height: 20px; }
    
    /* Signature Section */
    .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .signature-box { 
      border: 1px solid #e5e7eb; 
      border-radius: 4px; 
      padding: 12px; 
      background: #f9fafb;
    }
    .signature-box h4 { 
      margin: 0 0 10px 0; 
      font-size: 9pt; 
      color: #374151; 
      font-weight: 700; 
      text-transform: uppercase;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 6px;
    }
    .signature-box .field { margin-bottom: 8px; }
    .signature-box .field label { 
      display: block; 
      font-size: 8pt; 
      color: #6b7280; 
      margin-bottom: 3px; 
      font-weight: 600; 
      text-transform: uppercase;
    }
    .signature-box .field .line { border-bottom: 1px solid #d1d5db; height: 24px; background: white; }
    
    /* Footer */
    .footer { 
      margin-top: 16px; 
      text-align: center; 
      font-size: 8pt; 
      color: #9ca3af; 
      padding-top: 10px; 
      border-top: 1px solid #e5e7eb;
    }
    .footer p { margin: 2px 0; }
    
    /* Print styles */
    @media print {
      body { background: white; }
      .container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      ${logoHtml}
      <div class="header-left">
        <h1>${companyProfile?.name || 'EMPRESA'}</h1>
        ${rncLine}
        <p>${companyProfile?.phone || ''}</p>
      </div>
      <div class="header-right">
        <div class="doc-type">Orden de Entrega</div>
        <div class="doc-number">${displayCode}</div>
        <p style="font-size: 8pt; margin-top: 4px;">Fecha: ${new Date().toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
      </div>
    </div>

    <!-- Remitente y Destinatario -->
    <div class="info-grid">
      <div class="info-box">
        <h3>Remitente</h3>
        <p><strong>${asText(payload.sender?.name) || '—'}</strong></p>
        <p>${asText(payload.sender?.street) || ''}</p>
        <p>${asText(payload.sender?.city) || ''} ${asText(payload.sender?.postalCode) || ''}</p>
        <p>Tel: ${asText(payload.sender?.phone) || '—'}</p>
      </div>
      <div class="info-box">
        <h3>Destinatario</h3>
        <p><strong>${asText(payload.to?.name) || '—'}</strong></p>
        <p>${asText(payload.to?.street) || ''}</p>
        <p>${asText(payload.to?.city) || ''} ${asText(payload.to?.postalCode) || ''}</p>
        <p>Tel: ${asText(payload.to?.phone) || '—'}</p>
      </div>
    </div>

    <!-- Detalles del envío -->
    <div class="details-section">
      <h3>Detalles del Envío</h3>
      <div class="details-grid">
        <div class="detail-item">
          <strong>Courier</strong>
          <span>${asText(payload.courier) || '—'}</span>
        </div>
        <div class="detail-item">
          <strong>Tracking</strong>
          <span>${asText(payload.trackingNumber) || '—'}</span>
        </div>
        <div class="detail-item">
          <strong>Peso</strong>
          <span>${weightDisplay}</span>
        </div>
        <div class="detail-item">
          <strong>Total Items</strong>
          <span>${payload.items?.length || 0}</span>
        </div>
      </div>
    </div>

    <!-- Items -->
    <table>
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th>Descripción del Artículo</th>
          <th style="width: 100px; text-align: center;">Cantidad</th>
          <th style="width: 100px; text-align: center;">Verificado</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <!-- Observaciones -->
    <div class="notes-section">
      <h4>Observaciones o Daños al Recibir</h4>
      <div class="lines">
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
      </div>
    </div>

    <!-- Firmas -->
    <div class="signature-section">
      <div class="signature-box">
        <h4>Entregado por (Repartidor)</h4>
        <div class="field">
          <label>Nombre completo:</label>
          <div class="line"></div>
        </div>
        <div class="field">
          <label>Firma:</label>
          <div class="line"></div>
        </div>
        <div class="field">
          <label>Fecha y Hora:</label>
          <div class="line"></div>
        </div>
      </div>
      <div class="signature-box">
        <h4>Recibido por (Cliente)</h4>
        <div class="field">
          <label>Nombre completo:</label>
          <div class="line"></div>
        </div>
        <div class="field">
          <label>Firma:</label>
          <div class="line"></div>
        </div>
        <div class="field">
          <label>Cédula/Pasaporte:</label>
          <div class="line"></div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>Este documento certifica la entrega del envío en las condiciones descritas.</p>
      <p><strong>${companyProfile?.name || 'EMPRESA'}</strong> | ${companyProfile?.phone || ''} | ${companyProfile?.email || ''}</p>
      <p>Generado automáticamente por el sistema de gestión de envíos</p>
    </div>
  </div>
</body>
</html>`;

      const w = window.open('', '_blank', 'width=900,height=800');
      if (!w) return alert('Permitir ventanas emergentes para imprimir.');
      w.document.open();
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.print(); }, 300);
    } catch (err) {
      console.error('Error al abrir ventana de impresión', err);
      alert('No se pudo abrir la ventana de impresión.');
    }
  };

  const drivers = useMemo(() => (teamUsers || []).filter(u => (u.role || '').toLowerCase() === 'driver' || (u.role || '').toLowerCase() === 'repartidor'), [teamUsers]);

  // Debug drivers
  useEffect(() => {
    console.log('🔍 Drivers Debug:', {
      teamUsers: (teamUsers || []).map(u => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, role: u.role })),
      driversFiltered: drivers.map(d => ({ id: d.id, firstName: d.firstName, lastName: d.lastName, role: d.role })),
      driversCount: drivers.length
    });
  }, [teamUsers, drivers]);

  // Filtering + pagination
  const toDisplayText = (value) => {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(toDisplayText).filter(Boolean).join(', ');
    if (typeof value === 'object') return Object.values(value).map(toDisplayText).filter(Boolean).join(', ');
    return '';
  };

  const filtered = shipments.filter(s => {
    if (statusFilter !== 'all' && (s.status || '') !== statusFilter) return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const toName = toDisplayText(s.toAddress?.name).toLowerCase();
    const toStreet = toDisplayText(s.toAddress?.street).toLowerCase();
    return (
      (s.id && String(s.id).toLowerCase().includes(q)) ||
      (s.orderId && String(s.orderId).toLowerCase().includes(q)) ||
      (s.trackingNumber && String(s.trackingNumber).toLowerCase().includes(q)) ||
      toName.includes(q) ||
      toStreet.includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const downloadCSV = () => {
    const rows = [['id', 'orderId', 'trackingNumber', 'to_name', 'to_street', 'city', 'postalCode', 'phone', 'status', 'courier', 'assignedDriverId']];
    shipments.forEach(s => {
      rows.push([
        s.id || '',
        s.orderId || '',
        s.trackingNumber || '',
        s.toAddress?.name || '',
        s.toAddress?.street || '',
        s.toAddress?.city || '',
        s.toAddress?.postalCode || '',
        s.toAddress?.phone || '',
        s.status || '',
        s.courier || '',
        s.assignedDriverId || '',
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shipments-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColors = {
    created: 'bg-slate-200 text-slate-700',
    in_transit: 'bg-amber-200 text-amber-900',
    out_for_delivery: 'bg-sky-200 text-sky-900',
    delivered: 'bg-emerald-200 text-emerald-900',
    cancelled: 'bg-rose-200 text-rose-900',
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    try {
      let date;
      if (timestamp?.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else if (timestamp?.toDate) {
        date = timestamp.toDate();
      } else {
        date = new Date(timestamp);
      }
      return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  // Loading state
  if (loadingShipments || loadingUsers || loadingInvoices || loadingCustomers) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <span className="ml-3 text-gray-600">Cargando datos...</span>
      </div>
    );
  }

  if (showModal) {
    return (
      <div className="space-y-6">
        <ShipmentModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
          drivers={drivers}
          shipment={selectedShipment}
          onUpdate={handleUpdate}
          orders={invoices}
          customers={customers}
          existingShipments={shipments}
          fullPage
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-3">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Gestión de Envíos</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={downloadCSV} size="md">Exportar CSV</Button>
          <Button 
            variant="primary"
            onClick={openCreate} 
            disabled={!canCurrentUserAssignShipment}
            title={!canCurrentUserAssignShipment ? 'Solo administradores, gerentes y cajeros pueden crear envíos' : 'Crear nuevo envío'}
          >
            <Plus size={18} className="mr-2" /> Crear envío
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">En tránsito</p>
              <p className="text-2xl font-semibold text-gray-900">{shipments.filter(s => s.status === 'out_for_delivery' || s.status === 'in_transit').length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Entregados</p>
              <p className="text-2xl font-semibold text-gray-900">{shipments.filter(s => s.status === 'delivered').length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pendientes</p>
              <p className="text-2xl font-semibold text-gray-900">{shipments.filter(s => s.status === 'created').length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total envíos</p>
              <p className="text-2xl font-semibold text-gray-900">{shipments.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow border border-slate-100 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-600 mb-1">Buscar envío</label>
            <input placeholder="ID, nombre, orden..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Estado</label>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-indigo-500 focus:outline-none">
              <option value="all">Todos</option>
              <option value="created">Creado</option>
              <option value="in_transit">En tránsito</option>
              <option value="out_for_delivery">En reparto</option>
              <option value="delivered">Entregado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          <div className="md:col-span-3 flex justify-between text-sm text-gray-500">
            <span>Mostrando {filtered.length} de {shipments.length} envíos</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="bg-gray-50/60 text-gray-500 uppercase text-xs tracking-wide">
            <tr>
              <th className="py-3 px-4 text-left">Fecha</th>
              <th className="py-3 px-4 text-left">Código</th>
              <th className="py-3 px-4 text-left">Consignatario</th>
              <th className="py-3 px-4 text-left">Detalles</th>
              <th className="py-3 px-4 text-left">Estado</th>
              <th className="py-3 px-4 text-left">Repartidor</th>
              <th className="py-3 px-4 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                <td className="py-3 px-4 text-slate-500 text-xs">
                  {formatDate(s.createdAt)}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-800">{s.orderId || s.orderNumber || s.id}</td>
                <td className="py-3 px-4 text-slate-700">
                  <p className="font-semibold">{toDisplayText(s.toAddress?.name) || '—'}</p>
                  <p className="text-xs text-slate-500">{toDisplayText(s.toAddress?.city)}</p>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  <p className="text-xs">Courier: <span className="font-semibold text-slate-800">{s.courier || '—'}</span></p>
                  <p className="text-xs">Peso: {s.weightKg ? `${s.weightKg}kg` : '—'}</p>
                  <p className="text-xs">Dimensiones: {s.dimensions && (s.dimensions.length || s.dimensions.width || s.dimensions.height)
                    ? `${s.dimensions.length || 0}x${s.dimensions.width || 0}x${s.dimensions.height || 0} cm`
                    : '—'}</p>
                  <p className="text-xs">Tracking: {toDisplayText(s.trackingNumber) || '—'}</p>
                </td>
                <td className="py-3 px-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[s.status] || 'bg-slate-200 text-slate-700'}`}>
                    {s.status?.replace(/_/g, ' ') || '—'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  {drivers.length > 0 ? (
                    <select 
                      defaultValue={s.assignedDriverId || ''} 
                      onChange={(e) => handleAssign(s.id, e.target.value)} 
                      disabled={!canCurrentUserAssignShipment}
                      className={`px-2 py-1 rounded border border-slate-200 text-sm focus:ring-indigo-500 focus:outline-none ${!canCurrentUserAssignShipment ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                      title={!canCurrentUserAssignShipment ? 'Solo administradores, gerentes y cajeros pueden asignar envíos' : 'Seleccionar repartidor'}
                    >
                      <option value="">-- Ninguno --</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.firstName ? `${d.firstName} ${d.lastName || ''}` : d.email || d.id}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded border border-yellow-200">
                      Sin repartidores
                    </span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleShowLabel(s)} title="Ver etiqueta" aria-label="Ver etiqueta">
                      <Tag size={18} className="text-blue-600" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(s)} title="Editar envío" aria-label="Editar envío">
                      <Settings size={18} className="text-indigo-600" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openPrintWindowForShipment(s)} title="Imprimir etiqueta" aria-label="Imprimir etiqueta">
                      <Printer size={18} className="text-purple-600" />
                    </Button>

                    {/* Administrador, Gerente y Vendedores: Marcar como enviado solo si tiene repartidor asignado */}
                    {s.status === 'created' && s.assignedDriverId && canCurrentUserMarkAsShipped && (
                      <Button variant="ghost" size="sm" onClick={() => handleMarkAsShipped(s.id, s.assignedDriverId)} title="Marcar como enviado" aria-label="Marcar como enviado">
                        <Send size={18} className="text-orange-600" />
                      </Button>
                    )}

                    {/* Repartidor: Marcar como entregado solo si es el asignado */}
                    {s.status === 'out_for_delivery' && (isMasterUser || s.assignedDriverId === currentUserId) && (
                      <Button variant="ghost" size="sm" onClick={() => openDeliveryModal(s)} title="Marcar como entregado" aria-label="Marcar como entregado">
                        <CheckCircle size={18} className="text-emerald-600" />
                      </Button>
                    )}

                    {s.status !== 'delivered' && s.status !== 'cancelled' && (
                      <Button variant="ghost" size="sm" onClick={() => handleCancel(s.id)} title="Cancelar envío" aria-label="Cancelar envío">
                        <X size={18} className="text-red-600" />
                      </Button>
                    )}

                    <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} title="Eliminar permanentemente" aria-label="Eliminar permanentemente">
                      <Trash2 size={18} className="text-red-600" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {shipments.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400">No hay envíos registrados.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1 border rounded">Anterior</button>
        <div>Página {page} / {totalPages}</div>
        <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 border rounded">Siguiente</button>
      </div>

      {showLabelModal && labelData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Etiqueta de Envío</h3>
              <button 
                onClick={() => setShowLabelModal(false)} 
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex justify-center">
              <ShipmentLabel shipment={labelData} companyProfile={companyProfile} />
            </div>
          </div>
        </div>
      )}

      {showDeliveryModal && deliveryShipment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Confirmar Entrega</h3>
              <button 
                onClick={() => setShowDeliveryModal(false)} 
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                disabled={isUploading}
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong className="text-gray-800 dark:text-gray-200">Envío:</strong> {deliveryShipment.orderId || deliveryShipment.id}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  <strong className="text-gray-800 dark:text-gray-200">Para:</strong> {deliveryShipment.toAddress?.name || '—'}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  <strong className="text-gray-800 dark:text-gray-200">Dirección:</strong> {deliveryShipment.toAddress?.street || '—'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Foto de comprobante (opcional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setProofPhoto(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 dark:text-gray-400
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-semibold
                    file:bg-indigo-50 file:text-indigo-700
                    hover:file:bg-indigo-100
                    dark:file:bg-indigo-900 dark:file:text-indigo-300"
                  disabled={isUploading}
                />
                {proofPhoto && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    ✓ Foto seleccionada: {proofPhoto.name}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowDeliveryModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  disabled={isUploading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleMarkAsDelivered}
                  className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isUploading}
                >
                  {isUploading ? 'Confirmando...' : 'Confirmar Entrega'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShipmentsViewSQL;
