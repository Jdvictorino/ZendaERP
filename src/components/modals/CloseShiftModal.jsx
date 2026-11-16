import React, { useMemo, useState } from 'react';
import { shifts } from '../../api/client.js';
import Button from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import toast from 'react-hot-toast';
import { printHTML, printEscPosReceipt } from '../../utils/printer.js';
import useApproval from '../../hooks/useApproval.js';
import { logAction } from '../../utils/audit.js';
import { shiftPayments } from '../../utils/shiftCash.js';
import Alert from '../ui/Alert.jsx';
import ShiftDialog, { CashCount, countTotal, emptyCount } from './ShiftDialog.jsx';

export default function CloseShiftModal({ onClose, currentUserProfile, companyProfile, invoices, openShift, movements = [], registerId }) {
  const currency = companyProfile?.currency || 'DOP';
  const [denoms, setDenoms] = useState(emptyCount);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const tolerance = Number(companyProfile?.cash?.tolerance || 0);
  const [authorizedBy, setAuthorizedBy] = useState('');
  const { withApproval, approvalModal } = useApproval();
  const [cardCounted, setCardCounted] = useState('');
  const [transferCounted, setTransferCounted] = useState('');

  const counted = countTotal(denoms);

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

  const { totals, efectivoEsperado, ingresos, egresos, opening } = useMemo(() => {
    if (!openShift) return { totals: { efectivo: 0, tarjeta: 0, chequeTransferencia: 0, credito: 0 }, efectivoEsperado: 0, ingresos: 0, egresos: 0, opening: 0 };
    const { efectivo, tarjeta, chequeTransferencia, credito } = shiftPayments(invoices, getTimestamp(openShift.openedAt), openShift.id);
    // El backend guarda 'entrada'/'salida' y el monto como decimal en texto
    const movTotal = (types) => (movements || []).filter(m => m.shiftId === openShift.id && types.includes(m.type)).reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const ingresos = movTotal(['entrada', 'ingreso']);
    const egresos = movTotal(['salida', 'retiro']);
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
      <div class="row"><span>Ingresos de caja</span><span>${formatCurrency(ingresos, currency)}</span></div>
      <div class="row"><span>Retiros de caja</span><span>${formatCurrency(egresos, currency)}</span></div>
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
    // Con la opción de supervisor activa, el servidor pide el PIN (withApproval); sin ella basta el nombre.
    if (tolerance > 0 && Math.abs(diferencia) > tolerance && !authorizedBy.trim() && !companyProfile?.cash?.requireSupervisorBeyondTolerance) {
      toast.error('Diferencia fuera de tolerancia. Requiere autorización.');
      return;
    }

    setSaving(true);
    try {
      const notesWithAuth = authorizedBy 
        ? `${notes || ''}\nAutorizado por: ${authorizedBy}`.trim() 
        : notes;

      await toast.promise(
        withApproval('shift_close_tolerance', (token) => shifts.close(openShift.id, counted, notesWithAuth, token)),
        {
          loading: 'Cerrando turno...',
          success: 'Turno cerrado.',
          error: (e) => e.message || 'No se pudo cerrar el turno.'
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
          blocks.push({ type: 'text', text: `Ingresos caja: ${formatCurrency(ingresos, currency)}` });
          blocks.push({ type: 'text', text: `Retiros caja: ${formatCurrency(egresos, currency)}` });
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
      setSaving(false);
    }
  };

  const caja = registerId || openShift.registerId;
  const outOfTolerance = tolerance > 0 && Math.abs(diferencia) > tolerance;
  const line = (label, value, cls = '') => (
    <div className={`flex items-center justify-between py-1.5 ${cls}`}>
      <dt>{label}</dt><dd className="tabular-nums">{value}</dd>
    </div>
  );

  return (
    <ShiftDialog
      title="Cerrar turno"
      subtitle={`${caja ? `Caja: ${caja}. ` : ''}Cuenta el efectivo y confirma el cuadre.`}
      width="max-w-3xl"
      onClose={() => onClose(false)}
      footer={<>
        <Button variant="ghost" className="mr-auto" onClick={async () => { try { await printHTML(buildCloseShiftHTML(), { silent: false, printBackground: true }); } catch {} }}>Imprimir resumen</Button>
        <Button variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
        <Button onClick={handleCloseShift} disabled={saving}>{saving ? 'Cerrando...' : 'Cerrar turno'}</Button>
      </>}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <CashCount denoms={denoms} setDenoms={setDenoms} currency={currency} label="Efectivo contado" />

        <div className="space-y-5">
          <section>
            <h4 className="text-sm font-semibold text-ink mb-1">Cuadre de efectivo</h4>
            <dl className="text-sm text-ink-soft divide-y divide-line">
              {line('Fondo inicial', formatCurrency(opening, currency))}
              {line('Ventas en efectivo', formatCurrency(totals.efectivo, currency))}
              {line('Ingresos de caja', formatCurrency(ingresos, currency))}
              {line('Retiros de caja', `−${formatCurrency(egresos, currency)}`)}
              {line('Efectivo esperado', formatCurrency(efectivoEsperado, currency), 'font-semibold text-ink')}
              {line('Efectivo contado', formatCurrency(counted, currency), 'font-semibold text-ink')}
              {line(
                diferencia > 0 ? 'Sobrante' : diferencia < 0 ? 'Faltante' : 'Diferencia',
                formatCurrency(diferencia, currency),
                `font-bold ${diferencia === 0 ? 'text-success-700 dark:text-success-400' : 'text-red-600 dark:text-red-400'}`
              )}
            </dl>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-ink mb-2">Otros medios de pago</h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-sm text-ink-soft mb-1">Tarjeta</span>
                <input type="number" min="0" step="0.01" className="input-base" value={cardCounted} onChange={e => setCardCounted(e.target.value)} />
                <span className="block text-xs text-ink-muted mt-1">Esperado: {formatCurrency(totals.tarjeta || 0, currency)}</span>
              </label>
              <label className="block">
                <span className="block text-sm text-ink-soft mb-1">Transferencia o cheque</span>
                <input type="number" min="0" step="0.01" className="input-base" value={transferCounted} onChange={e => setTransferCounted(e.target.value)} />
                <span className="block text-xs text-ink-muted mt-1">Esperado: {formatCurrency(totals.chequeTransferencia || 0, currency)}</span>
              </label>
            </div>
          </section>

          {outOfTolerance && (
            <Alert variant="danger">
              <p>La diferencia pasa la tolerancia de {formatCurrency(tolerance, currency)}.</p>
              {companyProfile?.cash?.requireSupervisorBeyondTolerance ? (
                <p className="mt-1">Al cerrar se pedirá el PIN de un supervisor.</p>
              ) : (
                <label className="block mt-2">
                  <span className="block mb-1">Autorizado por</span>
                  <input className="input-base" value={authorizedBy} onChange={e => setAuthorizedBy(e.target.value)} placeholder="Nombre o ID del supervisor" />
                </label>
              )}
            </Alert>
          )}

          <label className="block">
            <span className="block text-sm text-ink-soft mb-1">Notas</span>
            <textarea className="input-base" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </label>
        </div>
      </div>
      {approvalModal}
    </ShiftDialog>
  );
}
