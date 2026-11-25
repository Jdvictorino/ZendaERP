-- CreateTable
CREATE TABLE "category_prices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "packagingId" TEXT,
    "minQuantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_prices_companyId_productId_idx" ON "category_prices"("companyId", "productId");

-- AddForeignKey
ALTER TABLE "category_prices" ADD CONSTRAINT "category_prices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_prices" ADD CONSTRAINT "category_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_prices" ADD CONSTRAINT "category_prices_packagingId_fkey" FOREIGN KEY ("packagingId") REFERENCES "product_packagings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
