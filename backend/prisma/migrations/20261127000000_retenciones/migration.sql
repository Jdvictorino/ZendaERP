-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "itbisRetenido" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "retencionRenta" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "retentionDate" DATE;
