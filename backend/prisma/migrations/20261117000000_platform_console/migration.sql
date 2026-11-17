-- Consola del servidor: segundo factor (TOTP) y registro de auditoría de plataforma.
CREATE TABLE "platform_security" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "totpSecret" TEXT,
    "totpConfirmedAt" TIMESTAMP(3),
    "lastTotpStep" INTEGER NOT NULL DEFAULT -1,

    CONSTRAINT "platform_security_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_audit_log" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "sessionId" TEXT,

    CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_log_at_idx" ON "platform_audit_log"("at");
