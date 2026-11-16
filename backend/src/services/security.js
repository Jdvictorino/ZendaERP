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
