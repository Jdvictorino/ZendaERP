-- Plazo de crédito y vencimiento de la factura (ventas a crédito)
ALTER TABLE "invoices" ADD COLUMN "paymentTermDays" INTEGER;
ALTER TABLE "invoices" ADD COLUMN "dueDate" TIMESTAMP(3);
