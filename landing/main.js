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

// Los clips de cada paso se reproducen una vez al entrar en pantalla y se pausan al salir.
// Con "reducir movimiento" o ahorro de datos se queda la imagen fija (poster) y no se descarga el video.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = navigator.connection?.saveData === true;
if ('IntersectionObserver' in window) {
  if (!reduceMotion && !saveData) {
    const clipIO = new IntersectionObserver((entries) => {
      entries.forEach(({ target: video, isIntersecting }) => {
        if (isIntersecting) {
          video.currentTime = 0;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, { threshold: 0.6 });
    document.querySelectorAll('.clip-video').forEach((v) => clipIO.observe(v));
  }

  const scan = document.querySelector('.phone-scan');
  if (scan) {
    const scanIO = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        scan.classList.add('is-live');
        scanIO.disconnect();
      }
    }, { threshold: 0.5 });
    scanIO.observe(scan);
  }
}
// Sin IntersectionObserver no hay cuándo disparar la animación: se muestra el resultado directamente
if (!('IntersectionObserver' in window)) document.querySelector('.phone-scan')?.classList.add('is-live');
