import React, { useMemo, useState } from 'react';
import Button from '../ui/Button.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { generatePDF, generateAccountStatementPDF } from '../../utils/pdfGenerator.js';
import { Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import SendEmailModal from './SendEmailModal.jsx';

const ReceivableDetailModal = ({ open, onClose, entry, statementEntries = [], companyProfile = {} }) => {
  const currency = companyProfile?.currency || 'USD';

  const invoice = entry?.invoice || {};
  const customer = entry?.customer || {};
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  const totals = useMemo(() => ({
    total: entry?.total || 0,
    paid: entry?.paid || 0,
    outstanding: entry?.outstanding || 0,
    discount: invoice?.discountAmount || invoice?.discount || 0,
    tax: invoice?.itbis || invoice?.tax || 0,
    shipping: invoice?.shippingCost || invoice?.shipping || 0,
    subtotal: invoice?.subtotal || items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0),
  }), [entry, invoice, items]);

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
    const hasSmtpConfig = !!(smtpSettings.host && smtpSettings.user && smtpSettings.pass);

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
    const hasSmtpConfig = !!(smtpSettings.host && smtpSettings.user && smtpSettings.pass);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-1 border-b border-slate-200 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Detalle de la factura</h3>
                <p className="text-sm text-slate-500">
                  Doble clic registrado para la factura {invoice.orderNumber || invoice.invoiceNumber || invoice.id || 'Sin número'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500 hover:bg-slate-200"
              >
                Cerrar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm text-slate-600 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="font-semibold text-slate-500">Cliente</p>
                <p>{customer.name || entry?.customerName || 'Cliente'}</p>
                {customer.identificationNumber && <p>ID: {customer.identificationNumber}</p>}
                {customer.email && <p>{customer.email}</p>}
                {customer.phone && <p>Tel. {customer.phone}</p>}
              </div>
              <div>
                <p className="font-semibold text-slate-500">Fecha de emisión</p>
                <p>{entry?.invoice?.date ? new Date(entry.invoice.date.seconds ? entry.invoice.date.seconds * 1000 : entry.invoice.date).toLocaleDateString() : 'N/D'}</p>
                <p className="font-semibold text-slate-500 mt-2">Vencimiento</p>
                <p>{entry?.dueDate ? entry.dueDate.toLocaleDateString() : 'Sin fecha'}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Estado</p>
                <p>{entry?.status}</p>
                {entry?.overdueDays > 0 && <p className="text-red-600">Vencida {entry.overdueDays} días</p>}
                <p className="font-semibold text-slate-500 mt-2">Saldo</p>
                <p className="text-indigo-600 font-semibold">{formatMoney(totals.outstanding)}</p>
              </div>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 p-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Subtotal</p>
              <p className="text-lg font-semibold text-slate-900">{formatMoney(totals.subtotal)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Pagado</p>
              <p className="text-lg font-semibold text-emerald-600">{formatMoney(totals.paid)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Pendiente</p>
              <p className="text-lg font-semibold text-indigo-600">{formatMoney(totals.outstanding)}</p>
            </div>
            {totals.discount > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Descuento</p>
                <p className="text-lg font-semibold text-slate-900">{formatMoney(totals.discount)}</p>
              </div>
            )}
            {totals.tax > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Impuestos</p>
                <p className="text-lg font-semibold text-slate-900">{formatMoney(totals.tax)}</p>
              </div>
            )}
            {totals.shipping > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Envío</p>
                <p className="text-lg font-semibold text-slate-900">{formatMoney(totals.shipping)}</p>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <p className="text-sm font-semibold text-slate-600">Conceptos</p>
              <p className="text-xs text-slate-400">{items.length} registros</p>
            </header>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
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
                    const quantity = Number(item.quantity) || 0;
                    const price = Number(item.price) || 0;
                    const lineTotal = quantity * price;
                    return (
                      <tr key={`${item.cartId || item.id || item.name}`}
                        className="border-t border-slate-100">
                        <td className="px-4 py-2">
                          <p className="font-medium text-slate-700">{item.name || 'Artículo'}</p>
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

          <section className="flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between">
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
