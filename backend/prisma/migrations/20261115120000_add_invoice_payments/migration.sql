-- Desglose de cobros de cada factura (lo usa el cierre de caja) y enlace de cobro por pasarela
ALTER TABLE "invoices" ADD COLUMN "payments" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "invoices" ADD COLUMN "paymentGateway" JSONB;
