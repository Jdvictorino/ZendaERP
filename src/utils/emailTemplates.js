export const defaultTemplates = [
  {
    id: 'invoice_client',
    name: 'Factura al Cliente',
    subject: 'Factura {{invoiceNumber}} de {{companyName}}',
    body: `Hola {{customerName}},\n\nAdjunto la factura {{invoiceNumber}} emitida el {{invoiceIssueDate}} por {{invoiceTotal}}.\nVencimiento: {{invoiceDueDate}}.\nSaldo pendiente: {{outstandingAmount}}.\n\nResumen de artículos:\n{{itemsList}}\n{{itemsMoreNote}}\n\n{{attachmentReminder}}\n\nSaludos,\n{{companySignature}}`
  },
  {
    id: 'order_confirmation',
    name: 'Confirmación de Pedido',
    subject: 'Confirmación de pedido {{invoiceNumber}} - {{companyName}}',
    body: `Hola {{customerName}},\n\nGracias por confiar en {{companyName}}. Confirmamos la recepción del pedido {{invoiceNumber}} generado el {{orderDate}}.\nImporte total: {{invoiceTotal}}.\n\nDetalle de artículos:\n{{itemsList}}\n{{itemsMoreNote}}\n\nSi necesitas modificar el pedido, respóndenos a este correo.\n\nSaludos,\n{{companySignature}}`
  },
  {
    id: 'account_statement',
    name: 'Estado de Cuenta',
    subject: 'Estado de cuenta actualizado - {{companyName}}',
    body: `Hola {{customerName}},\n\nCompartimos tu estado de cuenta al {{todayDate}}.\nTotal pendiente: {{statementTotalPending}}.\n\nResumen:\nTotal facturado: {{statementTotalAmount}}\nTotal pagado: {{statementTotalPaid}}\nDocumentos abiertos: {{statementTotalInvoices}}\n\nDetalle principal:\n{{statementLines}}\n\n{{attachmentReminder}}\n\nSaludos cordiales,\n{{companySignature}}`
  },
  {
    id: 'credit_note',
    name: 'Nota de Crédito',
    subject: 'Nota de crédito {{creditNoteNumber}} - {{companyName}}',
    body: `Hola {{customerName}},\n\nEmitimos la nota de crédito {{creditNoteNumber}} por {{creditNoteAmount}}.\nDocumento afectado: {{creditNoteOriginalInvoice}}.\nMotivo: {{creditNoteReason}}.\n\n{{attachmentReminder}}\n\nQuedamos atentos ante cualquier consulta.\n\nSaludos,\n{{companySignature}}`
  },
  {
    id: 'debit_note',
    name: 'Nota de Débito',
    subject: 'Nota de débito {{debitNoteNumber}} - {{companyName}}',
    body: `Hola {{customerName}},\n\nEmitimos la nota de débito {{debitNoteNumber}} por {{debitNoteAmount}}.\nDocumento asociado: {{debitNoteOriginalInvoice}}.\nMotivo: {{debitNoteReason}}.\n\n{{attachmentReminder}}\n\nPara cualquier inquietud, contáctanos.\n\nSaludos,\n{{companySignature}}`
  },
  {
    id: 'payment_reminder',
    name: 'Recordatorio de Pago',
    subject: 'Recordatorio de pago pendiente - {{companyName}}',
    body: `Hola {{customerName}},\n\nEsperamos que te encuentres bien. Tenemos registrado un saldo pendiente de {{outstandingAmount}} correspondiente a la factura {{invoiceNumber}}, con vencimiento el {{invoiceDueDate}}.\n\nAgradecemos nos confirmes el estado del pago o si necesitas asistencia adicional.\n\n{{attachmentReminder}}\n\nSaludos cordiales,\n{{companySignature}}`
  }
];

export function renderTemplate(template, context = {}) {
  if (!template) return '';
  let out = template;
  Object.keys(context).forEach(key => {
    const re = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    out = out.replace(re, String(context[key] ?? ''));
  });
  return out;
}
