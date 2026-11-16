const path = require('path');

// Devuelve la ruta absoluta de `rel` dentro de `base`, o null si sale de ella (o es la propia carpeta).
function safeUserPath(base, rel, pathImpl = path) {
  if (typeof rel !== 'string' || !rel) return null;
  const full = pathImpl.resolve(base, rel);
  const win = pathImpl.sep === '\\'; // en Windows las rutas no distinguen mayúsculas
  const norm = (p) => (win ? p.toLowerCase() : p);
  return norm(full).startsWith(norm(pathImpl.resolve(base)) + pathImpl.sep) ? full : null;
}

const isImagePath = (p) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(p));

module.exports = { safeUserPath, isImagePath };
