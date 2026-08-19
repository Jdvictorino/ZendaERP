import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';

const asText = (value) => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
  if (typeof value === 'object') return Object.values(value).map(asText).filter(Boolean).join(', ');
  return '';
};

const getOrderCode = (order) => {
  if (!order) return '';
  return (
    order.orderNumber ||
    order.invoiceNumber ||
    order.reference ||
    order.ncf?.sequential ||
    order.code ||
    order.id ||
    ''
  );
};

const normalizeAddress = (rawAddress = {}, fallback = {}) => {
  if (!rawAddress) return { ...fallback };
  if (typeof rawAddress === 'string') {
    return {
      ...fallback,
      street: rawAddress,
    };
  }
  const base = typeof rawAddress === 'object' ? rawAddress : {};
  return {
    name: base.name || fallback.name || '',
    phone: base.phone || base.contactPhone || fallback.phone || '',
    street: base.street || base.addressLine1 || base.line1 || base.address || fallback.street || '',
    city: base.city || base.municipio || fallback.city || '',
    postalCode: base.postalCode || base.zipCode || fallback.postalCode || '',
  };
};

const resolveSkuFromItem = (item = {}) => (
  item.sku ||
  item.variantInfo?.sku ||
  item.variant?.sku ||
  item.source?.variant?.sku ||
  item.productSku ||
  item.productId ||
  item.name ||
  ''
);

const normalizeShipmentItems = (items = []) => {
  return items
    .map((item) => {
      const sku = resolveSkuFromItem(item);
      if (!sku) return null;
      const qty = Number(item.qty || item.quantity || 1) || 1;
      const name = item.name || item.productName || item.description || '';
      return {
        ...item,
        sku,
        qty,
        quantity: qty,
        name,
      };
    })
    .filter(Boolean);
};

const buildPreviewRows = (items = []) => (
  items.map((item) => ({
    sku: item.sku || resolveSkuFromItem(item) || '—',
    name: item.name || item.productName || 'Nombre no disponible',
    qty: Number(item.qty || item.quantity || 1) || 1,
  }))
);

const ShipmentModal = ({
  onClose,
  onCreate,
  drivers = [],
  shipment = null,
  onUpdate = null,
  orders = [],
  customers = [],
  existingShipments = [],
  fullPage = false,
}) => {
  const [orderId, setOrderId] = useState(shipment?.orderId || shipment?.orderNumber || '');
  const [orderDocId, setOrderDocId] = useState(shipment?.orderDocId || null);
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [courier, setCourier] = useState('local');
  const [postage, setPostage] = useState(0);
  const [assignedDriver, setAssignedDriver] = useState('');
  const [shipmentItems, setShipmentItems] = useState(() => normalizeShipmentItems(shipment?.items || []));
  const [weight, setWeight] = useState(shipment?.weightKg ?? '');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [trackingNumber, setTrackingNumber] = useState(shipment?.trackingNumber || '');
  const [lastAppliedOrderCode, setLastAppliedOrderCode] = useState(shipment?.orderId || shipment?.orderNumber || '');
  const isEditing = Boolean(shipment);

  const takenOrderDocIds = useMemo(() => {
    const set = new Set();
    (existingShipments || []).forEach((s) => {
      if (shipment && s.id === shipment.id) return;
      if (s.orderDocId) set.add(String(s.orderDocId));
    });
    return set;
  }, [existingShipments, shipment]);

  const takenOrderCodes = useMemo(() => {
    const set = new Set();
    (existingShipments || []).forEach((s) => {
      if (shipment && s.id === shipment.id) return;
      const code = s.orderId || s.orderNumber;
      if (code) set.add(String(code).toLowerCase());
    });
    return set;
  }, [existingShipments, shipment]);

  const eligibleOrders = useMemo(() => {
    const list = (orders || []).filter((order) => {
      const code = getOrderCode(order);
      const docId = order?.id ? String(order.id) : '';
      const displayCode = code || docId;
      if (!displayCode) return false;

      if (isEditing && shipment) {
        const shipmentCode = (shipment.orderId || shipment.orderNumber || '').toLowerCase();
        const matchesShipment =
          (docId && shipment.orderDocId && shipment.orderDocId === docId) ||
          (shipmentCode && displayCode.toLowerCase() === shipmentCode);
        if (matchesShipment) return true;
      }

      const hasShipmentFlag = Boolean(order.shipmentId);
      if (hasShipmentFlag) return false;
      if (docId && takenOrderDocIds.has(docId)) return false;
      if (displayCode && takenOrderCodes.has(displayCode.toLowerCase())) return false;
      return true;
    });

    return list
      .map((order) => {
        const value = getOrderCode(order) || order.id || '';
        return {
          order,
          value,
          label: `${value} · ${order.customerName || 'Cliente sin nombre'}`,
        };
      })
      .sort((a, b) => {
        const aDate = a.order?.date?.seconds ? a.order.date.seconds : 0;
        const bDate = b.order?.date?.seconds ? b.order.date.seconds : 0;
        return bDate - aDate;
      });
  }, [orders, takenOrderDocIds, takenOrderCodes, isEditing, shipment]);

  const suggestionList = useMemo(() => {
    const term = orderId.trim().toLowerCase();
    const pool = term ? eligibleOrders.filter(({ value, order }) => {
      const customerName = (order.customerName || '').toLowerCase();
      return value.toLowerCase().includes(term) || customerName.includes(term);
    }) : eligibleOrders;
    return pool.slice(0, 5);
  }, [eligibleOrders, orderId]);

  const applyOrderDetails = useCallback((order) => {
    if (!order) return;
    const code = getOrderCode(order) || order.id || '';
    setOrderDocId(order.id || null);
    setLastAppliedOrderCode(code.toLowerCase());

    const customer = (customers || []).find((c) => c.id === order.customerId);
    const fallbackName = order.customerName || customer?.name || '';
    const fallbackPhone = order.customerPhone || customer?.phone || '';
    const resolvedAddress = normalizeAddress(
      customer?.shippingAddress || customer?.address || order.deliveryAddress,
      {
        name: fallbackName,
        phone: fallbackPhone,
        street: customer?.street || '',
        city: customer?.city || '',
        postalCode: customer?.postalCode || '',
      },
    );

    if (!shipment) {
      setOrderId(code);
    }
    if (resolvedAddress.name) setName(resolvedAddress.name);
    else if (fallbackName) setName(fallbackName);
    if (resolvedAddress.phone) setPhone(resolvedAddress.phone);
    else if (fallbackPhone) setPhone(fallbackPhone);
    if (resolvedAddress.street) setStreet(resolvedAddress.street);
    if (resolvedAddress.city) setCity(resolvedAddress.city);
    if (resolvedAddress.postalCode) setPostalCode(resolvedAddress.postalCode);

    setShipmentItems(normalizeShipmentItems(order.items || []));
  }, [customers, shipment]);

  // Prefill if editing
  useEffect(() => {
    if (shipment) {
      setOrderId(shipment.orderId || shipment.orderNumber || '');
      setOrderDocId(shipment.orderDocId || null);
      setName(asText(shipment.toAddress?.name));
      setStreet(asText(shipment.toAddress?.street));
      setCity(asText(shipment.toAddress?.city));
      setPostalCode(asText(shipment.toAddress?.postalCode));
      setPhone(asText(shipment.toAddress?.phone));
      setCourier(shipment.courier || 'local');
      setPostage(shipment.postage || 0);
      setAssignedDriver(shipment.assignedDriverId || '');
      setShipmentItems(normalizeShipmentItems(shipment.items || []));
      setWeight(shipment.weightKg ?? '');
      setLength(shipment.dimensions?.length ?? '');
      setWidth(shipment.dimensions?.width ?? '');
      setHeight(shipment.dimensions?.height ?? '');
      setTrackingNumber(shipment.trackingNumber || '');
    }
  }, [shipment]);

  useEffect(() => {
    if (isEditing) return;
    const trimmed = orderId.trim();
    if (!trimmed) {
      setOrderDocId(null);
      setLastAppliedOrderCode('');
      setShipmentItems([]);
      return;
    }
    if (lastAppliedOrderCode && trimmed.toLowerCase() === lastAppliedOrderCode) {
      return;
    }
    const match = eligibleOrders.find(({ value }) => value.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      applyOrderDetails(match.order);
    }
  }, [orderId, lastAppliedOrderCode, eligibleOrders, applyOrderDetails, isEditing]);

  const previewItems = useMemo(() => buildPreviewRows(shipmentItems), [shipmentItems]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!shipmentItems.length) {
      alert('Selecciona un pedido válido para cargar los artículos del envío.');
      return;
    }
    const items = shipmentItems.map(item => {
      const qty = Number(item.qty || item.quantity || 1) || 1;
      return {
        ...item,
        sku: item.sku,
        qty,
        quantity: qty,
      };
    });
    const parsedDimensions = {
      length: length !== '' ? Number(length) : null,
      width: width !== '' ? Number(width) : null,
      height: height !== '' ? Number(height) : null,
    };
    if (!parsedDimensions.length && !parsedDimensions.width && !parsedDimensions.height) {
      parsedDimensions.length = parsedDimensions.width = parsedDimensions.height = null;
    }

    const payload = {
      orderId: orderId || null,
      orderNumber: orderId || null,
      orderDocId: orderDocId || null,
      items,
      toAddress: { name, street, city, postalCode, phone },
      courier,
      postage: Number(postage) || 0,
      assignedDriverId: assignedDriver || null,
      sender: {},
      weightKg: weight !== '' ? Number(weight) : null,
      dimensions: parsedDimensions.length || parsedDimensions.width || parsedDimensions.height ? parsedDimensions : null,
      trackingNumber: trackingNumber?.trim() ? trackingNumber.trim() : null,
    };
    if (shipment && onUpdate) {
      await onUpdate(shipment.id, payload);
    } else {
      await onCreate(payload);
    }
  };

  return (
    <div style={fullPage ? { width: '100%' } : { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <form onSubmit={handleSubmit} className={fullPage ? 'bg-white rounded-2xl shadow-2xl w-full flex flex-col border border-slate-100' : 'bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col border border-slate-100'} style={fullPage ? undefined : { maxHeight: '90vh' }}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            {fullPage && (
              <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-600 shadow-sm hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label="Salir">
                <ArrowLeft size={22} strokeWidth={2.5} />
              </button>
            )}
            <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Logística</p>
            <h3 className="text-2xl font-semibold text-slate-800">{shipment ? 'Editar envío' : 'Crear envío'}</h3>
            </div>
          </div>
          {!fullPage && <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800">Cerrar</button>}
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm font-medium text-slate-600">
              Código del pedido
              <input
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              placeholder="Ej. PED-1001"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoComplete="off"
            />
            {!isEditing && suggestionList.length > 0 && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white shadow-sm">
                <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pedidos disponibles</p>
                <ul>
                  {suggestionList.map(({ order, value, label }) => (
                    <li key={order.id || value}>
                      <button
                        type="button"
                        onClick={() => applyOrderDetails(order)}
                        className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50"
                      >
                        <span className="font-medium text-slate-900">{value}</span>
                        <span className="ml-2 text-slate-500">{order.customerName ? `· ${order.customerName}` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </label>
          <label className="text-sm font-medium text-slate-600">
            Courier
            <input value={courier} onChange={e => setCourier(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
          </label>
          <label className="text-sm font-medium text-slate-600">
            Costo de envío
            <input type="number" value={postage} onChange={e => setPostage(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
          </label>
          <label className="text-sm font-medium text-slate-600">
            Tracking / guía del courier
            <input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="Número asignado por la agencia" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
          </label>
          <label className="text-sm font-medium text-slate-600">
            Repartidor asignado
            {drivers && drivers.length > 0 ? (
              <select value={assignedDriver} onChange={e => setAssignedDriver(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none">
                <option value="">-- Ninguno --</option>
                {drivers.map(d => <option key={d.uid || d.id} value={d.uid || d.id}>{d.firstName ? `${d.firstName} ${d.lastName || ''}` : d.email || d.uid}</option>)}
              </select>
            ) : (
              <div className="mt-1 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                <p className="font-medium">⚠️ No hay repartidores disponibles</p>
                <p className="text-xs mt-1">Debe crear usuarios con rol "Repartidor" en la sección de Usuarios.</p>
              </div>
            )}
          </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm font-medium text-slate-600">
              Nombre del destinatario
              <input value={name} onChange={e => setName(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Teléfono
              <input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
            </label>
            <label className="text-sm font-medium text-slate-600 md:col-span-2">
              Calle / Dirección completa
              <input value={street} onChange={e => setStreet(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Ciudad
              <input value={city} onChange={e => setCity(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Código postal
              <input value={postalCode} onChange={e => setPostalCode(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="text-sm font-medium text-slate-600">
              Peso (kg)
              <input type="number" step="0.01" value={weight} onChange={e => setWeight(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Largo (cm)
              <input type="number" step="0.1" value={length} onChange={e => setLength(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Ancho (cm)
              <input type="number" step="0.1" value={width} onChange={e => setWidth(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Alto (cm)
              <input type="number" step="0.1" value={height} onChange={e => setHeight(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-indigo-500 focus:outline-none" />
            </label>
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Los artículos se cargan automáticamente al seleccionar un pedido. No es posible añadir productos manualmente desde este formulario.
          </div>

          <div className="rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Resumen</p>
                <p className="text-sm font-semibold text-slate-700">Artículos del envío</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">{previewItems.length}</span>
            </div>
            {previewItems.length > 0 ? (
              <div className="overflow-x-auto max-h-40">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">SKU</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Producto</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewItems.map((item, index) => (
                      <tr key={`${item.sku || 'item'}-${index}`}>
                        <td className="px-4 py-2 font-mono text-slate-700">{item.sku || '—'}</td>
                        <td className="px-4 py-2 text-slate-700">{item.name || 'Nombre no disponible'}</td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-900">{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-3 text-sm text-slate-500">Selecciona un pedido para visualizar los artículos asociados al envío.</p>
            )}
          </div>
        </div>        <div className="p-6 border-t border-slate-100 sticky bottom-0 bg-white flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700">{shipment ? 'Guardar cambios' : 'Crear envío'}</button>
        </div>
      </form>
    </div>
  );
};

export default ShipmentModal;
