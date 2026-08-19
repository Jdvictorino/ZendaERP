import React from 'react';
import QRCode from 'react-qr-code';
import { buildLabelPayload } from '../utils/shipping';

const ShipmentLabel = ({ shipment, companyProfile }) => {
  // Build payload with company data as sender if available
  const sender = companyProfile ? {
    name: companyProfile.name || '',
    phone: companyProfile.phone || '',
    street: companyProfile.address || '',
    city: companyProfile.city || '',
    postalCode: companyProfile.postalCode || ''
  } : (shipment.sender || {});
  
  const payload = { ...buildLabelPayload(shipment), sender };
  const innerId = `shipment-label-inner-${payload.id}`;
  const displayCode = payload.code || payload.orderNumber || payload.orderId || payload.id;
  const asText = (value) => {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
    if (typeof value === 'object') return Object.values(value).map(asText).filter(Boolean).join(', ');
    return '';
  };
  const hasDimensions = payload.dimensions && (payload.dimensions.length || payload.dimensions.width || payload.dimensions.height);
  const dimensionText = hasDimensions
    ? `${payload.dimensions.length || 0}x${payload.dimensions.width || 0}x${payload.dimensions.height || 0} cm`
    : '—';

  const downloadQr = async () => {
    try {
      const svgEl = document.getElementById(`qr-${payload.id}`);
      if (!svgEl) return alert('QR no disponible para descarga.');
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shipment-${payload.id}-qr.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error descargando QR', err);
    }
  };

  const printLabel = () => {
    try {
      const inner = document.getElementById(innerId)?.innerHTML || '';
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta ${displayCode}</title><style>@page{size:4in 5in;margin:0}body{margin:0;padding:0;font-family:'Inter',sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:5in}.label-container{width:4in;height:5in;box-sizing:border-box;padding:8mm}.label{border:2px solid #312e81;border-radius:12px;overflow:hidden;background:#fff;height:100%;display:flex;flex-direction:column}.label-header{background:linear-gradient(135deg,#312e81,#4338ca);color:#fff;padding:12px 16px}.label-body{padding:14px 16px;font-size:11px;color:#0f172a;flex:1;display:flex;flex-direction:column}.section-title{font-weight:600;text-transform:uppercase;font-size:9px;color:#94a3b8;margin-bottom:6px;letter-spacing:0.5px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.courier-section{border-top:1px solid #e5e7eb;padding-top:14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:start;gap:14px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:auto}.metric{background:#eef2ff;color:#312e81;padding:10px 6px;border-radius:8px;text-align:center}.qr-container{text-align:right}.qr-container svg{border:1px solid #e2e8f0;border-radius:6px;padding:3px;background:#fff}</style></head><body><div class="label-container"><div class="label"><div class="label-header"><p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;opacity:0.9;margin-bottom:2px">Envío</p><p style="margin:0;font-size:19px;font-weight:600">${displayCode}</p></div><div class="label-body"><div class="grid"><div><p class="section-title">Remitente</p><p style="font-weight:600;margin:0 0 3px 0;font-size:12px">${payload.sender?.name||'—'}</p><p style="margin:0 0 2px 0;font-size:10px;color:#6b7280">${payload.sender?.street||''}</p><p style="margin:0 0 2px 0;font-size:10px;color:#6b7280">${payload.sender?.city||''} ${payload.sender?.postalCode||''}</p><p style="margin:0;font-size:10px;color:#6b7280">${payload.sender?.phone||''}</p></div><div><p class="section-title">Consignatario</p><p style="font-weight:600;margin:0 0 3px 0;font-size:12px">${payload.to?.name||'—'}</p><p style="margin:0 0 2px 0;font-size:10px;color:#6b7280">${payload.to?.street||''}</p><p style="margin:0 0 2px 0;font-size:10px;color:#6b7280">${payload.to?.city||''} ${payload.to?.postalCode||''}</p><p style="margin:0;font-size:10px;color:#6b7280">${payload.to?.phone||''}</p></div></div><div class="courier-section"><div style="flex:1"><p class="section-title">Courier</p><p style="font-weight:600;margin:0;font-size:12px">${payload.courier||'—'}</p><p style="font-size:10px;font-weight:600;color:#312e81;margin:6px 0 0 0">Tracking: ${payload.trackingNumber||'—'}</p></div><div class="qr-container">${document.getElementById(`qr-${payload.id}`)?.querySelector('svg')?.outerHTML || ''}</div></div><div class="metrics"><div class="metric"><p style="margin:0;font-size:9px;text-transform:uppercase;font-weight:600;margin-bottom:3px">Items</p><p style="margin:0;font-size:16px;font-weight:700">${payload.items?.length||0}</p></div><div class="metric"><p style="margin:0;font-size:9px;text-transform:uppercase;font-weight:600;margin-bottom:3px">Peso</p><p style="margin:0;font-size:12px;font-weight:700">${payload.weightKg ? `${payload.weightKg}kg` : '—'}</p></div><div class="metric"><p style="margin:0;font-size:9px;text-transform:uppercase;font-weight:600;margin-bottom:3px">Dim.</p><p style="margin:0;font-size:9px;font-weight:700;line-height:1.2">${dimensionText}</p></div><div class="metric"><p style="margin:0;font-size:9px;text-transform:uppercase;font-weight:600;margin-bottom:3px">Costo</p><p style="margin:0;font-size:12px;font-weight:700">${payload.postage||0}</p></div></div></div></div></div></body></html>`;
      const w = window.open('', '_blank', 'toolbar=0,scrollbars=0,location=0,status=0');
      if (!w) return alert('Permitir ventanas emergentes para imprimir la etiqueta.');
      w.document.open();
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.print(); }, 250);
    } catch (err) {
      console.error('Error imprimiendo etiqueta', err);
      alert('No se pudo abrir la ventana de impresión.');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-indigo-100 p-4 w-[380px] font-['Inter']">
      <div id={innerId}>
        <div className="label-header rounded-t-lg bg-gradient-to-br from-indigo-900 to-indigo-700 text-white p-4">
          <p className="text-xs uppercase tracking-widest opacity-90 mb-1">Envío</p>
          <p className="text-xl font-semibold">{displayCode}</p>
        </div>
        <div className="label-body p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="section-title text-xs font-semibold uppercase text-gray-400 mb-2">Remitente</p>
              <p className="font-semibold text-slate-800 text-sm mb-1">{asText(payload.sender?.name) || '—'}</p>
              <p className="text-xs text-gray-600">{asText(payload.sender?.street)}</p>
              <p className="text-xs text-gray-600">{`${asText(payload.sender?.city)} ${asText(payload.sender?.postalCode)}`.trim()}</p>
              <p className="text-xs text-gray-600">{asText(payload.sender?.phone)}</p>
            </div>
            <div>
              <p className="section-title text-xs font-semibold uppercase text-gray-400 mb-2">Consignatario</p>
              <p className="font-semibold text-slate-800 text-sm mb-1">{asText(payload.to?.name) || '—'}</p>
              <p className="text-xs text-gray-600">{asText(payload.to?.street)}</p>
              <p className="text-xs text-gray-600">{`${asText(payload.to?.city)} ${asText(payload.to?.postalCode)}`.trim()}</p>
              <p className="text-xs text-gray-600">{asText(payload.to?.phone)}</p>
            </div>
          </div>
          
          <div className="border-t border-gray-100 pt-4 mb-4">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <p className="section-title text-xs font-semibold uppercase text-gray-400 mb-2">Courier</p>
                <p className="font-semibold text-slate-700 text-sm">{asText(payload.courier) || '—'}</p>
                <p className="text-xs font-semibold text-indigo-900 mt-2">Tracking: {asText(payload.trackingNumber) || '—'}</p>
              </div>
              <div className="text-right">
                <p className="section-title text-xs font-semibold uppercase text-gray-400 mb-2">QR Confirmación</p>
                <div id={`qr-${payload.id}`} className="bg-white p-1 rounded border border-slate-200 inline-block">
                  <QRCode value={payload.confirmUrl || ''} size={100} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <p className="text-[10px] uppercase text-indigo-900 font-semibold mb-1">Items</p>
              <p className="text-lg font-bold text-indigo-900">{payload.items?.length || 0}</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <p className="text-[10px] uppercase text-indigo-900 font-semibold mb-1">Peso</p>
              <p className="text-sm font-bold text-indigo-900">{payload.weightKg ? `${payload.weightKg}kg` : '—'}</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <p className="text-[10px] uppercase text-indigo-900 font-semibold mb-1">Dim.</p>
              <p className="text-[10px] font-bold text-indigo-900 leading-tight">{dimensionText}</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <p className="text-[10px] uppercase text-indigo-900 font-semibold mb-1">Costo</p>
              <p className="text-sm font-bold text-indigo-900">{payload.postage}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button onClick={printLabel} className="flex-1 rounded-lg bg-indigo-600 text-white py-2 text-sm font-semibold shadow hover:bg-indigo-700 transition-colors">Imprimir etiqueta</button>
        <button onClick={downloadQr} className="flex-1 rounded-lg border border-indigo-200 text-indigo-700 py-2 text-sm font-semibold hover:bg-indigo-50 transition-colors">Descargar QR</button>
      </div>
    </div>
  );
};

export default ShipmentLabel;
