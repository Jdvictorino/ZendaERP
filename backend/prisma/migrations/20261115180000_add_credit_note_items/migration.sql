-- Artículos que cada nota de crédito devolvió a inventario: [{ "itemId", "quantity" }]
ALTER TABLE "credit_notes" ADD COLUMN "items" JSONB NOT NULL DEFAULT '[]';
