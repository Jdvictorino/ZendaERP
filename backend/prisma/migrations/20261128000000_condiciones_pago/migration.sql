-- AlterTable
ALTER TABLE "customers" ADD COLUMN "paymentTermId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "paymentTerm" JSONB,
ADD COLUMN "creditedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'normal';

-- Las notas de crédito parciales ya emitidas reducen el saldo de facturas no anuladas
UPDATE invoices i SET "creditedAmount" = s.sum
FROM (SELECT "invoiceId", SUM(amount) AS sum FROM credit_notes GROUP BY "invoiceId") s
WHERE s."invoiceId" = i.id AND i.status NOT IN ('Anulado', 'Cancelado');
