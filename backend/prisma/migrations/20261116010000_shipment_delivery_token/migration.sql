-- Llave aleatoria por envío para el QR de entrega (antes bastaba con conocer el id de la factura).
ALTER TABLE "shipments" ADD COLUMN "deliveryToken" TEXT;
UPDATE "shipments" SET "deliveryToken" = gen_random_uuid()::text;
ALTER TABLE "shipments" ALTER COLUMN "deliveryToken" SET NOT NULL;
ALTER TABLE "shipments" ALTER COLUMN "deliveryToken" SET DEFAULT gen_random_uuid()::text;
CREATE UNIQUE INDEX "shipments_deliveryToken_key" ON "shipments"("deliveryToken");
