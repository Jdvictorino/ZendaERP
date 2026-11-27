import React, { useEffect, useMemo, useState } from 'react';
import { invoices as invoicesApi } from '../../api/client.js';
import { rdDate } from '../../utils/rdDate.js';
import { stageLabel } from '../../utils/collectionReminders.js';
import Button from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { generatePDF, generateAccountStatementPDF } from '../../utils/pdfGenerator.js';
import { Mail, X } from 'lucide-react';
import toast from 'react-hot-toast';
import SendEmailModal from './SendEmailModal.jsx';
import { docLine } from '../../utils/docLines.js';
import { installmentsOf } from '../../utils/paymentTerms.js';
import { todayRD } from '../../utils/tax.js';

const ReceivableDetailModal = ({ open, onClose, entry, statementEntries = [], companyProfile = {} }) => {
  const currency = companyProfile?.currency || 'USD';

  const invoice = entry?.invoice || {};
  const customer = entry?.customer || {};
  // Las líneas del backend traen productName/unitPrice/subtotal; las locales antiguas, name/price
  const items = (Array.isArray(invoice.items) ? invoice.items : []).map((item) => {
    const quantity = Number(item.quantity) || 0;
    // Precio sin ITBIS e importe = base guardada (también en facturas viejas)
    const { unit: price, amount: lineTotal } = docLine(item, invoice.pricesIncludeTax);
    return { ...item, quantity, price, lineTotal, name: item.productName || item.name };
  });

  const totals = useMemo(() => ({
    total: entry?.total || 0,
    paid: entry?.paid || 0,
    outstanding: entry?.outstanding || 0,
    discount: invoice?.discountAmount || invoice?.discount || 0,
    tax: Number(invoice?.taxAmount ?? invoice?.itbis ?? invoice?.tax ?? 0),
    shipping: invoice?.shippingCost || invoice?.shipping || 0,
    subtotal: invoice?.subtotal || items.reduce((sum, item) => sum + item.lineTotal, 0),
  }), [entry, invoice, items]);

  // Calendario de cuotas: solo si la factura guardó su plazo; fechas 'YYYY-MM-DD' tal cual.
  const installments = invoice.paymentTerm?.schedule?.length
    ? installmentsOf({ ...invoice, amountPaid: invoice.paidAmount ?? invoice.amountPaid }, todayRD()) : [];

  const [reminders, setReminders] = useState([]);
  useEffect(() => {
    setReminders([]);
    if (!open || !invoice.id) return undefined;
    let alive = true;
    (async () => { try { const r = await invoicesApi.reminders(invoice.id); if (alive) setReminders(Array.isArray(r) ? r : []); } catch { /* el historial es opcional */ } })();
    return () => { alive = false; };
  }, [open, invoice.id]);

  const formatMoney = (value) => formatCurrency(Number(value) || 0, currency);

  const handlePrintInvoice = async () => {
    if (!invoice) return;
    await generatePDF(
      invoice,
      'invoice',
      companyProfile,
      customer,
      invoice?.emitterInfo,
      'print'
    );
  };

  const handleViewStatement = async () => {
    if (!statementEntries.length) return;
    await generateAccountStatementPDF({
      entries: statementEntries,
      companyProfile,
      customer,
      action: 'view',
    });
  };

  const handleDownloadStatement = async () => {
    if (!statementEntries.length) return;
    await generateAccountStatementPDF({
      entries: statementEntries,
      companyProfile,
      customer,
      action: 'download',
    });
  };

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailModalData, setEmailModalData] = useState({ docName: '', filename: '', base64Attachment: '' });

  const handleSendInvoiceEmail = async () => {
    if (!invoice) return;
    
    const clientEmail = customer.email || '';
    const num = invoice.invoiceNumber || invoice.orderNumber || 'N/A';
    const docName = `Factura ${num}`;
    const filename = `factura-${num}.pdf`;
    const defaultSubject = `[Zenda ERP] Factura ${num}`;
    const defaultBody = `Estimado cliente,\n\nAdjunto a este correo encontrará su factura correspondiente.\n\nSaludos cordiales,\nEl equipo de Zenda ERP`;

    const smtpSettings = companyProfile?.settings?.smtp || {};
    const hasSmtpConfig = !!(smtpSettings.host && smtpSettings.user && smtpSettings.hasPassword);

    if (hasSmtpConfig) {
      try {
        toast.loading('Generando documento PDF...', { id: 'pdf-gen' });
        const dataUrl = await generatePDF(
          invoice,
          'invoice',
          companyProfile,
          customer,
          invoice?.emitterInfo,
          'dataurl'
        );
        toast.dismiss('pdf-gen');

        if (!dataUrl) {
          toast.error('No se pudo generar el documento PDF.');
          return;
        }

        const base64Attachment = dataUrl.split(',')[1];
        setEmailModalData({
          docName,
          filename,
          base64Attachment
        });
        setShowEmailModal(true);
      } catch (error) {
        toast.dismiss('pdf-gen');
        console.error('Error al preparar email:', error);
        toast.error('Error al generar el PDF para adjuntar.');
      }
    } else {
      toast.success('Abriendo cliente de correo nativo... ¡Descarga y adjunta el PDF!');
      try {
        generatePDF(
          invoice,
          'invoice',
          companyProfile,
          customer,
          invoice?.emitterInfo,
          'download'
        );
      } catch (err) {
        console.error('Auto-download PDF failed:', err);
      }

      const mailtoUrl = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(defaultSubject)}&body=${encodeURIComponent(defaultBody)}`;
      window.location.href = mailtoUrl;
    }
  };

  const handleSendStatementEmail = async () => {
    if (!statementEntries.length) return;
    
    const clientEmail = customer.email || '';
    const customerName = customer.name || entry?.customerName || 'Cliente';
    const docName = `Estado de Cuenta - ${customerName}`;
    const filename = `estado-de-cuenta-${customerName.replace(/\s+/g, '-')}.pdf`;
    const defaultSubject = `[Zenda ERP] Estado de Cuenta - ${customerName}`;
    const defaultBody = `Estimado cliente,\n\nAdjunto a este correo encontrará su estado de cuenta correspondiente.\n\nSaludos cordiales,\nEl equipo de Zenda ERP`;

    const smtpSettings = companyProfile?.settings?.smtp || {};
    const hasSmtpConfig = !!(smtpSettings.host && smtpSettings.user && smtpSettings.hasPassword);

    if (hasSmtpConfig) {
      try {
        toast.loading('Generando Estado de Cuenta...', { id: 'pdf-gen' });
        const dataUrl = await generateAccountStatementPDF({
          entries: statementEntries,
          companyProfile,
          customer,
          action: 'dataurl',
        });
        toast.dismiss('pdf-gen');

        if (!dataUrl) {
          toast.error('No se pudo generar el Estado de Cuenta.');
          return;
        }

        const base64Attachment = dataUrl.split(',')[1];
        setEmailModalData({
          docName,
          filename,
          base64Attachment
        });
        setShowEmailModal(true);
      } catch (error) {
        toast.dismiss('pdf-gen');
        console.error('Error al preparar email:', error);
        toast.error('Error al generar el Estado de Cuenta para adjuntar.');
      }
    } else {
      toast.success('Abriendo cliente de correo nativo... ¡Descarga y adjunta el PDF!');
      try {
        generateAccountStatementPDF({
          entries: statementEntries,
          companyProfile,
          customer,
          action: 'download',
        });
      } catch (err) {
        console.error('Auto-download PDF failed:', err);
      }

      const mailtoUrl = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(defaultSubject)}&body=${encodeURIComponent(defaultBody)}`;
      window.location.href = mailtoUrl;
    }
  };

  if (!open || !entry) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto modal-panel p-6">
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-1 border-b border-line pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">Detalle de la factura</h3>
                <p className="text-sm text-ink-muted">
                  Doble clic registrado para la factura {invoice.orderNumber || invoice.invoiceNumber || invoice.id || 'Sin número'}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar" className="modal-close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm text-ink-soft md:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="font-semibold text-ink-muted">Cliente</p>
                <p>{customer.name || entry?.customerName || 'Cliente'}</p>
                {customer.identificationNumber && <p>ID: {customer.identificationNumber}</p>}
                {customer.email && <p>{customer.email}</p>}
                {customer.phone && <p>Tel. {customer.phone}</p>}
              </div>
              <div>
                <p className="font-semibold text-ink-muted">Fecha de emisión</p>
                <p>{entry?.invoice?.date ? new Date(entry.invoice.date.seconds ? entry.invoice.date.seconds * 1000 : entry.invoice.date).toLocaleDateString() : 'N/D'}</p>
                <p className="font-semibold text-ink-muted mt-2">Vencimiento</p>
                <p>{entry?.dueDate ? entry.dueDate.toLocaleDateString() : 'Sin fecha'}</p>
              </div>
              <div>
                <p className="font-semibold text-ink-muted">Estado</p>
                <p>{entry?.status}</p>
                {entry?.overdueDays > 0 && <p className="text-red-600">Vencida {entry.overdueDays} días</p>}
                <p className="font-semibold text-ink-muted mt-2">Saldo</p>
                <p className="text-brand-600 font-semibold">{formatMoney(totals.outstanding)}</p>
              </div>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 rounded-lg border border-line p-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted">Subtotal</p>
              <p className="text-lg font-semibold text-ink">{formatMoney(totals.subtotal)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted">Pagado</p>
              <p className="text-lg font-semibold text-success-600">{formatMoney(totals.paid)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted">Pendiente</p>
              <p className="text-lg font-semibold text-brand-600">{formatMoney(totals.outstanding)}</p>
            </div>
            {totals.discount > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">Descuento</p>
                <p className="text-lg font-semibold text-ink">{formatMoney(totals.discount)}</p>
              </div>
            )}
            {totals.tax > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">Impuestos</p>
                <p className="text-lg font-semibold text-ink">{formatMoney(totals.tax)}</p>
              </div>
            )}
            {totals.shipping > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">Envío</p>
                <p className="text-lg font-semibold text-ink">{formatMoney(totals.shipping)}</p>
              </div>
            )}
          </section>

          {installments.length > 0 && (
            <section className="rounded-lg border border-line p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">Calendario de cuotas</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="py-1">Vence</th><th className="py-1 text-right">Monto</th><th className="py-1 text-right">Pendiente</th><th className="py-1 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((c, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1">{c.dueDate.split('-').reverse().join('/')}</td>
                      <td className="py-1 text-right tabular-nums">{formatMoney(c.amount)}</td>
                      <td className="py-1 text-right tabular-nums">{formatMoney(c.remaining)}</td>
                      <td className={`py-1 text-right ${c.overdue ? 'text-red-600' : 'text-ink-muted'}`}>{c.remaining <= 0.01 ? 'Pagada' : c.overdue ? 'Vencida' : 'Pendiente'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {reminders.length > 0 && (
            <section className="rounded-lg border border-line p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">Recordatorios enviados</h3>
              <ul className="space-y-1 text-sm">
                {reminders.map((r) => (
                  <li key={r.id} className="border-t border-line pt-1 first:border-0 first:pt-0">
                    {rdDate(r.updatedAt || r.createdAt)} · {stageLabel(r.stage)} · {r.channel === 'email' ? 'correo' : r.channel} · {r.sentById ? 'manual' : 'automático'} ·{' '}
                    <span className={r.status === 'failed' ? 'text-red-600' : 'text-ink-muted'}>{r.status === 'sent' ? 'enviado' : r.status === 'failed' ? 'falló' : 'en curso'}</span>
                    {r.status === 'failed' && r.error ? <span className="text-red-600"> ({r.error})</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-line">
            <header className="flex items-center justify-between border-b border-line px-4 py-2">
              <p className="text-sm font-semibold text-ink-soft">Conceptos</p>
              <p className="text-xs text-slate-400">{items.length} registros</p>
            </header>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-muted text-ink-muted">
                  <tr>
                    <th className="px-4 py-2 text-left">Descripción</th>
                    <th className="px-4 py-2 text-right">Cantidad</th>
                    <th className="px-4 py-2 text-right">Precio</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-4 py-6 text-center text-slate-400">Sin conceptos asociados.</td>
                    </tr>
                  )}
                  {items.map((item) => {
                    const { quantity, price, lineTotal } = item;
                    return (
                      <tr key={`${item.cartId || item.id || item.name}`}
                        className="border-t border-line">
                        <td className="px-4 py-2">
                          <p className="font-medium text-ink-soft">{item.name || 'Artículo'}</p>
                          {item.customizationNotes && (
                            <p className="text-xs text-slate-400">{item.customizationNotes}</p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">{quantity}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(price)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatMoney(lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-3 border-t border-line pt-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button onClick={handlePrintInvoice}>Imprimir factura</Button>
              <Button variant="secondary" onClick={handleSendInvoiceEmail}><Mail size={16} className="mr-1"/> Enviar Factura</Button>
              <Button variant="secondary" onClick={handleViewStatement} disabled={!statementEntries.length}>
                Ver estado de cuenta
              </Button>
              <Button variant="secondary" onClick={handleDownloadStatement} disabled={!statementEntries.length}>
                Descargar estado de cuenta
              </Button>
              <Button variant="secondary" onClick={handleSendStatementEmail} disabled={!statementEntries.length}><Mail size={16} className="mr-1"/> Enviar Estado por Email</Button>
            </div>
            <p className="text-xs text-slate-400">
              {statementEntries.length
                ? `Incluye ${statementEntries.length} documentos en el estado de cuenta.`
                : 'Sin movimientos adicionales disponible para este cliente.'}
            </p>
          </section>
        </div>
      </div>
      {showEmailModal && <SendEmailModal 
        isOpen={showEmailModal} 
        onClose={() => setShowEmailModal(false)} 
        defaultEmail={customer?.email || ''} 
        docName={emailModalData.docName} 
        filename={emailModalData.filename} 
        base64Attachment={emailModalData.base64Attachment} 
      />}
    </div>
  );
};

export default ReceivableDetailModal;
