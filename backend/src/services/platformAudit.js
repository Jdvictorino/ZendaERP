export const clientIp = (req) => req.headers?.['cf-connecting-ip'] || req.ip;

export async function audit(prisma, { req, kind, detail, sessionId }) {
  try {
    await prisma.platformAuditLog.create({ data: { ip: clientIp(req), kind, detail, sessionId } });
  } catch (error) {
    console.error('[platformAudit] no se pudo registrar:', error.message);
  }
}
