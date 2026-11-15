-- Vencimiento de la secuencia del NCF de cada factura (Norma General 06-2018: se imprime "Válido hasta")
ALTER TABLE "invoices" ADD COLUMN "ncfExpiresAt" DATE;

-- Notas de crédito (E34) y débito (E33) electrónicas: el e-CF va enlazado a la nota, no a la factura
ALTER TABLE "ecf_documents" ADD COLUMN "creditNoteId" TEXT;
ALTER TABLE "ecf_documents" ADD COLUMN "debitNoteId" TEXT;
ALTER TABLE "ecf_documents" ADD CONSTRAINT "ecf_documents_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ecf_documents" ADD CONSTRAINT "ecf_documents_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES "debit_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
