-- Datos del pago al exterior que pide el formato 609 (beneficiario, país, tipo de servicio, ...)
ALTER TABLE "expenses" ADD COLUMN "foreignPayment" JSONB;
