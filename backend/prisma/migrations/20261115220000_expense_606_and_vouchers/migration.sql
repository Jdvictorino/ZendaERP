-- Campos del 606 que el formulario de gastos ya pedía y no se guardaban
ALTER TABLE "expenses" ADD COLUMN "ncfModificado" TEXT;
ALTER TABLE "expenses" ADD COLUMN "montoBienes" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN "montoServicios" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN "itbisRetenido" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN "retencionIsrTipo" TEXT;
ALTER TABLE "expenses" ADD COLUMN "montoRetencionIsr" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN "propina" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Comprobante emitido por la empresa (B11/B13/B17 o E41/E43/E47)
ALTER TABLE "expenses" ADD COLUMN "issuedVoucher" TEXT;
ALTER TABLE "expenses" ADD COLUMN "ncfExpiresAt" DATE;
ALTER TABLE "ecf_documents" ADD COLUMN "expenseId" TEXT;
ALTER TABLE "ecf_documents" ADD CONSTRAINT "ecf_documents_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Datos del pago al exterior que pide el formato 609 (beneficiario, país, tipo de servicio, ...)
ALTER TABLE "expenses" ADD COLUMN "foreignPayment" JSONB;
