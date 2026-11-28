-- AlterTable
ALTER TABLE "products" ALTER COLUMN "costPrice" TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN "costPrice" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "purchase_receipts" ADD COLUMN "charges" JSONB;
