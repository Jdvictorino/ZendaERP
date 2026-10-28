// Imagen de reemplazo local (sin red): cuadro gris claro con un icono de imagen; funciona offline en Electron.
export const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#f1f5f9"/>' +
    '<g fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="18" y="20" width="28" height="24" rx="3"/><circle cx="27" cy="29" r="3"/><path d="m46 38-7-7-15 13"/></g></svg>'
  );
