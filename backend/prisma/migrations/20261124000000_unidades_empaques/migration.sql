-- AlterTable
ALTER TABLE "products" ADD COLUMN     "allowFractions" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "minStock" SET DEFAULT 0,
ALTER COLUMN "minStock" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "maxStock" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "product_variants" ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "inventory_logs" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "previousStock" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "newStock" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN     "packagingFactor" DECIMAL(14,3) NOT NULL DEFAULT 1,
ADD COLUMN     "packagingId" TEXT,
ADD COLUMN     "packagingName" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- CreateTable
CREATE TABLE "product_packagings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factor" DECIMAL(14,3) NOT NULL,
    "unitCode" INTEGER NOT NULL DEFAULT 6,
    "barcode" TEXT,
    "salePrice" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_packagings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_packagings_companyId_idx" ON "product_packagings"("companyId");

-- CreateIndex
CREATE INDEX "product_packagings_barcode_idx" ON "product_packagings"("barcode");

-- AddForeignKey
ALTER TABLE "product_packagings" ADD CONSTRAINT "product_packagings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_packagings" ADD CONSTRAINT "product_packagings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_packagingId_fkey" FOREIGN KEY ("packagingId") REFERENCES "product_packagings"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Normaliza products.unit a los códigos de BASE_UNITS (lo desconocido pasa a 'unidad').
UPDATE "products" SET "unit" = CASE lower(trim("unit"))
  WHEN 'und' THEN 'unidad' WHEN 'unid' THEN 'unidad' WHEN 'unidad' THEN 'unidad' WHEN 'u' THEN 'unidad' WHEN 'unidades' THEN 'unidad'
  WHEN 'lb' THEN 'libra' WHEN 'lbs' THEN 'libra' WHEN 'libra' THEN 'libra' WHEN 'libras' THEN 'libra'
  WHEN 'kg' THEN 'kilogramo' WHEN 'kilo' THEN 'kilogramo' WHEN 'kilos' THEN 'kilogramo' WHEN 'kilogramo' THEN 'kilogramo' WHEN 'kilogramos' THEN 'kilogramo' WHEN 'kgs' THEN 'kilogramo'
  WHEN 'g' THEN 'gramo' WHEN 'gr' THEN 'gramo' WHEN 'gramo' THEN 'gramo' WHEN 'gramos' THEN 'gramo' WHEN 'grs' THEN 'gramo'
  WHEN 'oz' THEN 'onza' WHEN 'onza' THEN 'onza' WHEN 'onzas' THEN 'onza'
  WHEN 'm' THEN 'metro' WHEN 'metro' THEN 'metro' WHEN 'metros' THEN 'metro' WHEN 'mts' THEN 'metro' WHEN 'mt' THEN 'metro'
  WHEN 'cm' THEN 'centimetro' WHEN 'centimetro' THEN 'centimetro' WHEN 'centimetros' THEN 'centimetro' WHEN 'centímetro' THEN 'centimetro' WHEN 'centímetros' THEN 'centimetro'
  WHEN 'l' THEN 'litro' WHEN 'lt' THEN 'litro' WHEN 'litro' THEN 'litro' WHEN 'litros' THEN 'litro' WHEN 'lts' THEN 'litro'
  WHEN 'ml' THEN 'mililitro' WHEN 'mililitro' THEN 'mililitro' WHEN 'mililitros' THEN 'mililitro'
  WHEN 'gal' THEN 'galon' WHEN 'galon' THEN 'galon' WHEN 'galón' THEN 'galon' WHEN 'galones' THEN 'galon'
  WHEN 'pie' THEN 'pie' WHEN 'pies' THEN 'pie'
  WHEN 'yd' THEN 'yarda' WHEN 'yarda' THEN 'yarda' WHEN 'yardas' THEN 'yarda' WHEN 'yds' THEN 'yarda'
  WHEN 'doc' THEN 'docena' WHEN 'docena' THEN 'docena' WHEN 'docenas' THEN 'docena'
  ELSE 'unidad'
END;
