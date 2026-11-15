// Una sola animación para 16:9 (escritorio) y 9:16 (celular): el encuadre sale del tamaño del cuadro.
(function () {
  const root = document.querySelector("#root");
  const W = Number(root.dataset.width);
  const H = Number(root.dataset.height);
  const portrait = H > W;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Esquinas de la pantalla de la laptop en la foto (px de hero.jpg, 2048x1152)
  const Q = { tl: [730, 432], tr: [1292, 432], br: [1310, 790], bl: [717, 788] };
  const BOX = { w: 1580, h: 1000 }; // caja del punto de venta (pos.png a 1580 px de ancho)

  // Homografía del rectángulo BOX al cuadrilátero Q, como matrix3d de CSS
  function quadMatrix() {
    const [x0, y0] = Q.tl, [x1, y1] = Q.tr, [x2, y2] = Q.br, [x3, y3] = Q.bl;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
    const { w, h: hh } = BOX;
    return `matrix3d(${[a / w, d / w, 0, g / w, b / hh, e / hh, 0, h / hh, 0, 0, 1, 0, x0, y0, 0, 1].join(",")})`;
  }
  $("#scr").style.transform = quadMatrix();

  // Cámara: de la foto completa (cover) a la pantalla llenando el cuadro
  const cx = (Q.tl[0] + Q.br[0]) / 2, cy = (Q.tl[1] + Q.br[1]) / 2;
  const s0 = Math.max(W / 2048, H / 1152);
  const cam0 = { scale: s0, x: clamp(W / 2 - cx * s0, W - 2048 * s0, 0), y: clamp(H / 2 - cy * s0, H - 1152 * s0, 0) };
  const screenW = (Q.tr[0] - Q.tl[0] + Q.br[0] - Q.bl[0]) / 2, screenH = Q.bl[1] - Q.tl[1];
  const s1 = portrait ? (W / screenW) * 1.02 : (H / screenH) * 1.06;
  const cam1 = { scale: s1, x: W / 2 - cx * s1, y: H / 2 - cy * s1 };

  // Al terminar el acercamiento, la pantalla plana ocupa el mismo lugar que la de la foto
  // (escala por eje: la pantalla de la foto no tiene exactamente la proporción de la caja)
  const pan0 = { scaleX: (screenW * s1) / BOX.w, scaleY: (screenH * s1) / BOX.h, x: cam1.x + ((Q.tl[0] + Q.bl[0]) / 2) * s1, y: cam1.y + Q.tl[1] * s1 };
  // Vista final: el total y el botón Cobrar (horizontal) o la columna del cliente y el pago (vertical)
  const view = portrait ? { x: 1066, y: 100, w: 506 } : { x: 797, y: 560, w: 783 };
  const ps = W / view.w;
  const pan1 = { scaleX: ps, scaleY: ps, x: -view.x * ps, y: -view.y * ps };

  // Ticket: alto casi completo del cuadro, centrado; sale por la ranura de abajo
  const tH = portrait ? 980 : 600;
  const tW = Math.round(tH * 1088 / 2490);
  const tTop = Math.round((H - tH) / 2);
  const slotY = tTop + tH;
  Object.assign($("#ticket").style, { width: tW + "px", height: tH + "px", left: Math.round((W - tW) / 2) + "px", top: tTop + "px" });
  Object.assign($("#feed").style, { height: slotY + "px", bottom: "auto" });
  Object.assign($("#slot").style, { width: tW + 90 + "px", left: Math.round((W - tW - 90) / 2) + "px", top: slotY - 8 + "px" });

  const tl = gsap.timeline({ paused: true });
  tl.set("#cam", { transformOrigin: "0 0", ...cam0 }, 0)
    .set("#pan", { ...pan0 }, 0)
    .to("#cam", { ...cam1, duration: 2.3, ease: "power2.inOut" }, 0.3)
    .fromTo("#stage", { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "none" }, 2.45)
    // El fondo claro entra cuando la pantalla ya casi llena el cuadro (en vertical queda foto arriba y abajo)
    .fromTo("#paper", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.inOut" }, 2.65)
    .to("#pan", { ...pan1, duration: 1.4, ease: "power3.inOut" }, 2.8)
    // Toque en Cobrar y facturar
    .fromTo("#ring", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" }, 4.2)
    .to("#ring", { opacity: 0, scale: 1.6, duration: 0.3, ease: "power2.in" }, 4.45)
    .fromTo("#press", { opacity: 0 }, { opacity: 1, duration: 0.12 }, 4.25)
    .to("#press", { opacity: 0, duration: 0.2 }, 4.45)
    // El fondo se apaga y el ticket sale impreso
    .fromTo("#shade", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.inOut" }, 4.6)
    .fromTo("#slot", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }, 4.75)
    .fromTo("#ticket", { y: tH }, { y: 0, duration: 2.0, ease: "sine.inOut" }, 4.95)
    .to("#slot", { opacity: 0, y: 12, duration: 0.35, ease: "power2.in" }, 6.95);

  window.__timelines = window.__timelines || {};
  window.__timelines[root.dataset.compositionId] = tl;
})();
