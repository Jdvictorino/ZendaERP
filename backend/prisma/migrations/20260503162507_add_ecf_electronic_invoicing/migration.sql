-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "ecfCertificateB64" TEXT,
ADD COLUMN     "ecfCertificatePass" TEXT,
ADD COLUMN     "ecfEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ecfEnvironment" TEXT NOT NULL DEFAULT 'test';

-- CreateTable
CREATE TABLE "ecf_sequences" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tipoEcf" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rangoDesde" INTEGER NOT NULL DEFAULT 1,
    "rangoHasta" INTEGER NOT NULL DEFAULT 0,
    "secuencial" INTEGER NOT NULL DEFAULT 1,
    "fechaVencimiento" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecf_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecf_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "tipoEcf" TEXT NOT NULL,
    "eNcf" TEXT NOT NULL,
    "xmlContent" TEXT,
    "xmlSigned" TEXT,
    "trackId" TEXT,
    "dgiiStatus" TEXT NOT NULL DEFAULT 'pendiente',
    "dgiiMessage" TEXT,
    "securityCode" TEXT,
    "rncEmisor" TEXT NOT NULL,
    "rncComprador" TEXT,
    "nombreComprador" TEXT,
    "montoTotal" DECIMAL(12,2) NOT NULL,
    "itbisTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "enviadoAt" TIMESTAMP(3),
    "aceptadoAt" TIMESTAMP(3),
    "rechazadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecf_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ecf_sequences_companyId_idx" ON "ecf_sequences"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ecf_sequences_companyId_tipoEcf_key" ON "ecf_sequences"("companyId", "tipoEcf");

-- CreateIndex
CREATE UNIQUE INDEX "ecf_documents_eNcf_key" ON "ecf_documents"("eNcf");

-- CreateIndex
CREATE INDEX "ecf_documents_companyId_idx" ON "ecf_documents"("companyId");

-- CreateIndex
CREATE INDEX "ecf_documents_trackId_idx" ON "ecf_documents"("trackId");

-- CreateIndex
CREATE INDEX "ecf_documents_eNcf_idx" ON "ecf_documents"("eNcf");

-- CreateIndex
CREATE INDEX "ecf_documents_dgiiStatus_idx" ON "ecf_documents"("dgiiStatus");

-- AddForeignKey
ALTER TABLE "ecf_sequences" ADD CONSTRAINT "ecf_sequences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecf_documents" ADD CONSTRAINT "ecf_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecf_documents" ADD CONSTRAINT "ecf_documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
