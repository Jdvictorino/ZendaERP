# Landing www.zendaerp.online

Sitio de una página (Vite + Tailwind 4 + GSAP + Lenis + Three.js). El hero es una venta completa que avanza con el
scroll: los cuadros salen de los renders de HyperFrames en `../landing-clips/hero` (16:9) y `../landing-clips/hero-v`
(9:16), y al final el ticket impreso pasa a ser un comprobante 3D que se puede girar.

```bash
npm install
npm run dev      # desarrollo
npm run assets   # regenera public/frames, public/img y og.jpg (requiere ffmpeg y los renders de HyperFrames)
npm run build    # genera dist/
```

- Si cambias la secuencia: render en `landing-clips/hero` y `hero-v` (`npx hyperframes@0.9.28 render --fps 24 --quality delivery -o renders/<carpeta>.mp4`),
  sube `FRAMES_VERSION` en `scripts/build-assets.mjs` y la ruta `/frames/v1` en `src/hero.js` e `index.html`
  (Cloudflare guarda los cuadros varios días por nombre).
- El servidor manda una CSP sin scripts en línea: todo el JS va en `src/`.
- Las fotos de `assets-src/` (colmado, distribuidor, tienda, hero) son generadas con Higgsfield: son ilustrativas.
- `img/ticket.webp` es el ticket real de la app (`generateThermalReceiptHTML`) con datos de demostración.

## Publicar

```bash
npm run build
tar --force-local -czf site.tgz -C dist .
scp site.tgz zenda@zenda-server:/srv/zenda/landing/site.tgz
# en el servidor, el dueño: sudo bash /srv/zenda/landing/publicar.sh
```
