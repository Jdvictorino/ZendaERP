-- Tipo de contribuyente y carnet de exención de ITBIS del cliente.
ALTER TABLE "customers" ADD COLUMN "taxpayerType" TEXT NOT NULL DEFAULT 'consumidor_final';
ALTER TABLE "customers" ADD COLUMN "exemptionNumber" TEXT;
ALTER TABLE "customers" ADD COLUMN "exemptionExpiresAt" DATE;
UPDATE "customers" SET "taxpayerType" = 'empresa' WHERE length(regexp_replace(coalesce("rnc", ''), '\D', '', 'g')) = 9;

-- Las facturas existentes tienen el precio con ITBIS incluido.
ALTER TABLE "invoices" ADD COLUMN "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoices" ADD COLUMN "exemptionNumber" TEXT;
UPDATE "invoices" SET "pricesIncludeTax" = true;
