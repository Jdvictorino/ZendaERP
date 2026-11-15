// Genera public/frames, public/img y la imagen para redes a partir de los renders de HyperFrames
// (landing-clips/hero y landing-clips/hero-v) y de las fotos en assets-src/. Requiere ffmpeg en el PATH.
// Uso: npm run assets. Si cambias la secuencia, sube FRAMES_VERSION: Cloudflare guarda los cuadros varios días.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'

export const FRAMES_VERSION = 'v1'
const HERO_H = '../landing-clips/hero/renders/hero.mp4' // 1280x720, 192 cuadros
const HERO_V = '../landing-clips/hero-v/renders/hero-v.mp4' // 720x1280, 192 cuadros

const ffmpeg = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })

const dirH = `public/frames/${FRAMES_VERSION}/h`
const dirV = `public/frames/${FRAMES_VERSION}/v`
rmSync('public/frames', { recursive: true, force: true })
for (const dir of [dirH, dirV, 'public/img']) mkdirSync(dir, { recursive: true })

// ffmpeg 5.1+ usa -fps_mode; las versiones anteriores solo -vsync
const sequence = (input, filter, quality, out) => {
  const run = (...sync) => ffmpeg('-i', input, '-vf', filter, ...sync, '-c:v', 'libwebp', '-q:v', String(quality), '-start_number', '0', out)
  try { run('-fps_mode', 'passthrough') } catch { run('-vsync', '0') }
}
// Escritorio: los 192 cuadros. Celular: uno de cada dos (96), para pesar la mitad.
sequence(HERO_H, 'null', 74, `${dirH}/f_%03d.webp`)
sequence(HERO_V, "select='not(mod(n,2))'", 70, `${dirV}/f_%03d.webp`)

// Fotos (ilustrativas, generadas con Higgsfield)
for (const name of ['colmado', 'distribuidor', 'tienda']) {
  ffmpeg('-i', `assets-src/${name}.jpg`, '-vf', 'scale=900:-2', '-q:v', '78', `public/img/${name}.webp`)
}
// Textura del ticket 3D: el ticket real que genera la app, con datos de demostración
ffmpeg('-i', 'assets-src/ticket.png', '-q:v', '90', 'public/img/ticket.webp')

// Imagen para compartir en redes (Open Graph): la laptop con el punto de venta
ffmpeg('-i', HERO_H, '-vf', "select='eq(n,24)',scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630", '-frames:v', '1', '-q:v', '3', 'public/og.jpg')
// Fondo del cierre: la secuencia completa como video corto sin audio
ffmpeg('-i', HERO_H, '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'public/img/venta-loop.mp4')
console.log('assets listos')
