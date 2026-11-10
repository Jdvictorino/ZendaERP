// Marca que hay JavaScript: la animación del comprobante solo corre si el script carga
document.documentElement.classList.add('js');

// Correo de las solicitudes de demo: se configura en <meta name="zenda-demo-email">
const demoEmail = document.querySelector('meta[name="zenda-demo-email"]')?.content.trim();
if (demoEmail) {
  const subject = encodeURIComponent('Solicitud de demo de Zenda ERP');
  const body = encodeURIComponent('Hola, me gustaría ver una demostración de Zenda ERP.\n\nNombre del negocio:\nTipo de negocio:\nTeléfono:\n');
  document.querySelectorAll('[data-demo]').forEach((a) => { a.href = `mailto:${demoEmail}?subject=${subject}&body=${body}`; });
}
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

// En el celular, el botón fijo aparece cuando los botones de la portada y del cierre no están a la vista
const sticky = document.querySelector('.sticky-cta');
const watched = [document.querySelector('.hero .actions'), document.querySelector('.closing')].filter(Boolean);
if (sticky && 'IntersectionObserver' in window) {
  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    sticky.classList.toggle('is-visible', visible.size === 0);
  });
  watched.forEach((el) => io.observe(el));
}
