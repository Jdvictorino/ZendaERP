import React, { useEffect, useMemo, useState } from 'react';
import { shifts } from '../../api/client.js';
import Button from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import toast from 'react-hot-toast';
import { printHTML, printEscPosReceipt } from '../../utils/printer.js';
import SupervisorAuthModal from './SupervisorAuthModal.jsx';
import { logAction } from '../../utils/audit.js';

const DEFAULT_DENOMS = [1000, 500, 200, 100, 50, 25, 10, 5, 1];

export default function CloseShiftModal({ onClose, currentUserProfile, companyProfile, invoices, openShift, movements = [], registerId, supervisors = [] }) {
  const currency = companyProfile?.currency || 'USD';
  const [denoms, setDenoms] = useState(() => Object.fromEntries(DEFAULT_DENOMS.map(v => [v, 0])));
  const [notes, setNotes] = useState('');
  const tolerance = Number(companyProfile?.cash?.tolerance || 0);
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [cardCounted, setCardCounted] = useState('');
  const [transferCounted, setTransferCounted] = useState('');

  const counted = useMemo(() => Object.entries(denoms).reduce((s, [k, q]) => s + (Number(k) * (parseInt(q || 0, 10))), 0), [denoms]);

  // Convertir timestamps de openedAt desde formato ISO o seconds
  const getTimestamp = (ts) => {
    if (!ts) return Date.now();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'number') return ts;
    if (ts.seconds) return ts.seconds * 1000;
    if (typeof ts === 'string') {
        const d = new Date(ts);
        return isNaN(d.getTime()) ? Date.now() : d.getTime();
    }
    return Date.now();
  };

  const { totals, efectivoEsperado, ingresos, egresos } = useMemo(() => {
    if (!openShift) return { totals: { efectivo: 0, tarjeta: 0, chequeTransferencia: 0, credito: 0 }, efectivoEsperado: 0, ingresos: 0, egresos: 0 };
    const start = getTimestamp(openShift.openedAt);
    const rows = (invoices || []).filter(inv => {
      const isActuallyBilled = inv.isBilled || inv.status === 'Pagado' || inv.status === 'Facturado';
      const dateToUse = inv.billedDate || inv.createdAt || inv.date;
      return isActuallyBilled && dateToUse && (getTimestamp(dateToUse)) >= start && (inv.status !== 'Cancelado');
    });
    const sum = (arr, key) => arr.reduce((s, p) => s + (parseFloat(p?.[key]) || 0), 0);
    let efectivo = 0, tarjeta = 0, chequeTransferencia = 0, credito = 0;
    rows.forEach(inv => {
      const pagos = Array.isArray(inv.payments) ? inv.payments : [];
      efectivo += sum(pagos, 'efectivo');
      tarjeta += sum(pagos, 'tarjeta');
      chequeTransferencia += sum(pagos, 'chequeTransferencia');
      credito += sum(pagos, 'credito');
    });
    const ingresos = (movements || []).filter(m => m.shiftId === openShift.id && m.type === 'ingreso').reduce((s, m) => s + (m.amount || 0), 0);
    const egresos = (movements || []).filter(m => m.shiftId === openShift.id && m.type === 'retiro').reduce((s, m) => s + (m.amount || 0), 0);
    const opening = Number(openShift.openingAmount || 0);
    const efectivoEsperado = opening + efectivo + ingresos - egresos;
    return { totals: { efectivo, tarjeta, chequeTransferencia, credito }, efectivoEsperado, ingresos, egresos, opening };
  }, [invoices, openShift, movements]);

  const diferencia = useMemo(() => counted - efectivoEsperado, [counted, efectivoEsperado]);

  const buildCloseShiftHTML = () => {
    const recCard = parseFloat(cardCounted || '0') || 0;
    const recTransfer = parseFloat(transferCounted || '0') || 0;
    const openedAtStr = openShift?.openedAt ? new Date(getTimestamp(openShift.openedAt)).toLocaleString() : '';
    const closingDateStr = new Date().toLocaleString();
    return `<!doctype html><html><head><meta charset="utf-8"/><style>
      body{font-family:Arial;font-size:12px;padding:10px}
      h1{font-size:16px;margin:0 0 8px;text-align:center}
      .row{display:flex;justify-content:space-between;margin:2px 0}
      .tot{font-weight:700}
      hr{border:none;border-top:1px dashed #999;margin:8px 0}
    </style></head><body>
      <h1>Reporte de Cierre de Caja</h1>
      <div class="row"><span>Empresa:</span><span>${companyProfile?.name || ''}</span></div>
      <div class="row"><span>Fecha:</span><span>${closingDateStr}</span></div>
      <div class="row"><span>Usuario:</span><span>${currentUserProfile?.fullName || ''}</span></div>
      ${ (registerId || openShift.registerId) ? `<div class="row"><span>Caja:</span><span>${registerId || openShift.registerId}</span></div>` : '' }
      <div class="row"><span>Apertura:</span><span>${openedAtStr}</span></div>
      <hr/>
      <div class="row"><span>Fondo inicial</span><span>${formatCurrency(openShift.openingAmount || 0, currency)}</span></div>
      <div class="row"><span>Ventas Efectivo</span><span>${formatCurrency(totals.efectivo, currency)}</span></div>
      <div class="row"><span>Ventas Tarjeta</span><span>${formatCurrency(totals.tarjeta, currency)}</span></div>
      <div class="row"><span>Transfer/Cheque</span><span>${formatCurrency(totals.chequeTransferencia, currency)}</span></div>
      <div class="row"><span>Crédito</span><span>${formatCurrency(totals.credito, currency)}</span></div>
      <hr/>
      <div class="row tot"><span>Efectivo Esperado</span><span>${formatCurrency(efectivoEsperado, currency)}</span></div>
      <div class="row tot"><span>Efectivo Contado</span><span>${formatCurrency(counted, currency)}</span></div>
      <div class="row tot"><span>Diferencia</span><span>${formatCurrency(diferencia, currency)}</span></div>
      <hr/>
      <div class="row"><span>Tarjeta contado</span><span>${formatCurrency(recCard, currency)}</span></div>
      <div class="row"><span>Transfer/Cheque contado</span><span>${formatCurrency(recTransfer, currency)}</span></div>
      ${notes ? `<hr/><div>${notes}</div>` : ''}
      <div style="margin-top: 50px; border-top: 1px solid #000; text-align: center; padding-top: 5px; width: 80%; margin-left: auto; margin-right: auto;">
        Firma Autorizada
      </div>
    </body></html>`;
  };

  const handleCloseShift = async () => {
    if (tolerance > 0 && Math.abs(diferencia) > tolerance && !authorizedBy.trim()) {
      // If configuration requires supervisor, open modal
      if (companyProfile?.cash?.requireSupervisorBeyondTolerance) {
        setShowAuth(true);
        return;
      } else {
        toast.error('Diferencia fuera de tolerancia. Requiere autorización.');
        return;
      }
    }

    try {
      const notesWithAuth = authorizedBy 
        ? `${notes || ''}\nAutorizado por: ${authorizedBy}`.trim() 
        : notes;

      await toast.promise(
        shifts.close(openShift.id, counted, notesWithAuth),
        {
          loading: 'Cerrando turno...',
          success: 'Turno cerrado.',
          error: 'No se pudo cerrar el turno.'
        }
      );

      try { 
        await logAction('shift_close', { 
          registerId: registerId || openShift.registerId || '', 
          counted, 
          expected: efectivoEsperado, 
          difference: diferencia, 
          by: currentUserProfile?.uid || currentUserProfile?.id,
          authorizedBy 
        }); 
      } catch {}

      // Imprimir ticket de cierre
      try {
        const useEscpos = companyProfile?.cash?.printing?.mode === 'escpos';
        const openedAtStr = openShift?.openedAt ? new Date(getTimestamp(openShift.openedAt)).toLocaleString() : '';
        const recCard = parseFloat(cardCounted || '0') || 0;
        const recTransfer = parseFloat(transferCounted || '0') || 0;
        
        if (useEscpos) {
          const printerName = companyProfile?.cash?.printing?.printerName || '';
          const blocks = [];
          blocks.push({ type: 'text', text: 'Reporte de Cierre de Caja', align: 'center', style: 'B' });
          if (companyProfile?.name) blocks.push({ type: 'text', text: `Empresa: ${companyProfile.name}` });
          blocks.push({ type: 'text', text: `Fecha: ${new Date().toLocaleString()}` });
          blocks.push({ type: 'text', text: `Usuario: ${currentUserProfile?.fullName || ''}` });
          if (registerId || openShift.registerId) blocks.push({ type: 'text', text: `Caja: ${registerId || openShift.registerId}` });
          blocks.push({ type: 'text', text: `Apertura: ${openedAtStr}` });
          blocks.push({ type: 'hr' });
          blocks.push({ type: 'text', text: `Fondo inicial: ${formatCurrency(openShift.openingAmount || 0, currency)}` });
          blocks.push({ type: 'text', text: `Efectivo: ${formatCurrency(totals.efectivo, currency)}` });
          blocks.push({ type: 'text', text: `Tarjeta: ${formatCurrency(totals.tarjeta, currency)}` });
          blocks.push({ type: 'text', text: `Transf/Cheque: ${formatCurrency(totals.chequeTransferencia, currency)}` });
          blocks.push({ type: 'text', text: `Crédito: ${formatCurrency(totals.credito, currency)}` });
          blocks.push({ type: 'hr' });
          blocks.push({ type: 'text', text: `Esperado: ${formatCurrency(efectivoEsperado, currency)}`, style: 'B' });
          blocks.push({ type: 'text', text: `Contado: ${formatCurrency(counted, currency)}`, style: 'B' });
          blocks.push({ type: 'text', text: `Diferencia: ${formatCurrency(diferencia, currency)}`, style: 'B' });
          blocks.push({ type: 'hr' });
          blocks.push({ type: 'text', text: `Tarjeta contado: ${formatCurrency(recCard, currency)}` });
          blocks.push({ type: 'text', text: `Transf/Cheque contado: ${formatCurrency(recTransfer, currency)}` });
          if (notes) { blocks.push({ type: 'hr' }); blocks.push({ type: 'text', text: 'Notas:' }); blocks.push({ type: 'text', text: String(notes) }); }
          
          blocks.push({ type: 'text', text: '\n\n' });
          blocks.push({ type: 'text', text: '_______________________', align: 'center' });
          blocks.push({ type: 'text', text: 'Firma Autorizada', align: 'center' });
          
          const ok = await printEscPosReceipt(blocks, printerName);
          if (!ok) {
            await printHTML(buildCloseShiftHTML(), { silent: false, printBackground: true });
          }
        } else {
          await printHTML(buildCloseShiftHTML(), { silent: false, printBackground: true });
        }
      } catch {}

      onClose(true);
    } catch (error) {
      console.error('Error cerrando turno:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-card p-6 w-full max-w-lg">
        <div className="flex justify-between items-start gap-4 mb-2">
          <h3 className="text-lg md:text-2xl font-semibold text-gray-900">Cierre de Turno</h3>
          <button onClick={() => onClose(false)} className="text-2xl text-gray-500">&times;</button>
        </div>
        <p className="text-sm text-gray-600 mb-4">Cuenta por denominación y confirma el cierre.</p>
        {(registerId || openShift.registerId) && (
          <div className="mb-2 text-sm text-gray-700"><span className="font-medium">Caja:</span> {registerId || openShift.registerId}</div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {DEFAULT_DENOMS.map(v => (
            <div key={v} className="flex items-center justify-between gap-2 border rounded p-2">
              <div className="text-gray-700 font-medium">{formatCurrency(v, currency)}</div>
              <input type="number" min="0" className="input-base w-24" value={denoms[v]} onChange={e => setDenoms(prev => ({...prev, [v]: e.target.value}))} />
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-gray-50 rounded flex items-center justify-between">
          <span className="text-gray-600">Efectivo contado</span>
          <span className="text-xl font-bold text-indigo-600">{formatCurrency(counted, currency)}</span>
        </div>
        <div className="mt-2 p-3 bg-gray-50 rounded">
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-gray-600">Fondo inicial</span>
            <span className="font-semibold">{formatCurrency(totals.opening, currency)}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100"><span>Efectivo esperado</span><span>{formatCurrency(efectivoEsperado, currency)}</span></div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100"><span>Ingresos de caja</span><span>{formatCurrency(ingresos, currency)}</span></div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100"><span>Retiros de caja</span><span>{formatCurrency(egresos, currency)}</span></div>
          <div className="flex items-center justify-between font-bold pt-2"><span>Diferencia</span><span className={diferencia === 0 ? 'text-green-700' : 'text-red-600'}>{formatCurrency(diferencia, currency)}</span></div>
        </div>
        <div className="mt-3 p-3 border rounded bg-gray-50">
          <div className="font-medium mb-2">Conciliación No-Efectivo</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Tarjeta contado</label>
              <input type="number" min="0" step="0.01" className="input-base" value={cardCounted} onChange={e => setCardCounted(e.target.value)} />
              <div className="text-xs text-gray-500 mt-1">Esperado: {formatCurrency(totals.tarjeta || 0, currency)}</div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Transfer/Cheque contado</label>
              <input type="number" min="0" step="0.01" className="input-base" value={transferCounted} onChange={e => setTransferCounted(e.target.value)} />
              <div className="text-xs text-gray-500 mt-1">Esperado: {formatCurrency(totals.chequeTransferencia || 0, currency)}</div>
            </div>
          </div>
        </div>
        {tolerance > 0 && Math.abs(diferencia) > tolerance && (
          <div className="mt-3 p-3 border rounded bg-red-50">
            <p className="text-sm text-red-700">La diferencia excede la tolerancia de {formatCurrency(tolerance, currency)}.</p>
            {!companyProfile?.cash?.requireSupervisorBeyondTolerance ? (
              <>
                <label className="block text-sm text-gray-700 mt-2">Autorizado por</label>
                <input className="input-base" value={authorizedBy} onChange={e => setAuthorizedBy(e.target.value)} placeholder="Nombre/ID del supervisor" />
              </>
            ) : (
              <div className="text-sm text-gray-700 mt-2">Se solicitará PIN de supervisor al confirmar.</div>
            )}
          </div>
        )}
        <div className="mt-3">
          <label className="block text-sm text-gray-600 mb-1">Notas</label>
          <textarea className="input-base" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
          <Button variant="secondary" onClick={async () => { try { await printHTML(buildCloseShiftHTML(), { silent: false, printBackground: true }); } catch {} }}>Imprimir Ticket (Sistema)</Button>
          <Button onClick={handleCloseShift}>Cerrar Turno</Button>
        </div>
      </div>
      {showAuth && (
        <SupervisorAuthModal
          supervisors={[
            ...(supervisors || []),
            ...(companyProfile?.adminProfile?.pinHash ? [{ id: companyProfile?.owner || 'admin', uid: companyProfile?.owner || 'admin', firstName: 'Admin', lastName: '', role: 'admin', adminPinHash: companyProfile?.adminProfile?.pinHash }] : [])
          ]}
          onClose={(res) => {
            if (res && res.authorized) {
              setAuthorizedBy(res.user?.uid || res.user?.id || '');
              setShowAuth(false);
              // Continue closing now that we have authorization
              setTimeout(() => handleCloseShift(), 0);
            } else {
              setShowAuth(false);
            }
          }}
        />
      )}
    </div>
  );
}
