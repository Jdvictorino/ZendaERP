export const PASSWORD_MIN = 8;

const EXAMPLE_SECRET = 'default-secret-change-in-production';

export function requireJwtSecret(env) {
  const secret = env?.JWT_SECRET;
  if (!secret || secret === EXAMPLE_SECRET) throw new Error('JWT_SECRET falta o es el valor de ejemplo');
  return secret;
}

// Los tokens de refresco y de permiso llevan `type`; solo el de acceso no.
export function isAccessPayload(decoded) {
  return !!decoded && decoded.type === undefined;
}

// Quita secretos del JSON de ajustes antes de enviarlo al navegador
export function publicSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const out = { ...settings };
  if (out.smtp) {
    const { pass, ...smtp } = out.smtp;
    out.smtp = { ...smtp, hasPassword: Boolean(pass) };
  }
  if (out.adminProfile) {
    const { pinHash, ...adminProfile } = out.adminProfile;
    out.adminProfile = adminProfile;
  }
  return out;
}

export function publicCompany(company) {
  return company ? { ...company, settings: publicSettings(company.settings) } : company;
}

// Un `pass` vacío o ausente conserva la contraseña guardada
export function mergeSmtp(current, incoming) {
  const { hasPassword, ...rest } = incoming || {};
  return { ...rest, pass: rest.pass ? rest.pass : (current?.pass || '') };
}
