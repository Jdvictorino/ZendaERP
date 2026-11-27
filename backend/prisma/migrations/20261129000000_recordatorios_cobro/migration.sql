-- AlterTable
ALTER TABLE "customers" ADD COLUMN "remindersOff" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "collection_reminders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "stage" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "to" TEXT NOT NULL,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collection_reminders_companyId_createdAt_idx" ON "collection_reminders"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "collection_reminders_invoiceId_idx" ON "collection_reminders"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_reminders_invoiceId_dueDate_stage_channel_key" ON "collection_reminders"("invoiceId", "dueDate", "stage", "channel");

-- AddForeignKey
ALTER TABLE "collection_reminders" ADD CONSTRAINT "collection_reminders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_reminders" ADD CONSTRAINT "collection_reminders_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_reminders" ADD CONSTRAINT "collection_reminders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
