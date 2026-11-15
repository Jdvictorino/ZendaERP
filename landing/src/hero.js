import gsap from 'gsap'

// Reparto del scroll del hero (0 a 1): hasta SEQ_END avanzan los cuadros de la venta;
// desde RECEIPT_START el ticket impreso pasa a ser el comprobante 3D.
const SEQ_END = 0.8
const RECEIPT_START = 0.78
const RECEIPT_SETTLED = 0.95
const FADE = 0.035
// Paradas del scroll: cada gesto lleva a la siguiente, donde se lee el texto del paso
export const STOPS = [0, 0.3, 0.415, 0.75, 1]
const LOAD_CONCURRENCY = 6
const FRAMES = '/frames/v1'

// Ticket del último cuadro (px del render): alto y tamaño del cuadro, para que el 3D aparezca encima
const SETS = {
  h: { count: 192, w: 1280, h: 720, ticketH: 600 },
  v: { count: 96, w: 720, h: 1280, ticketH: 980 },
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smooth = (t) => t * t * (3 - 2 * t)

// Cuadros verticales cuando la pantalla es más alta que ancha (igual que el <picture> del póster)
const pickSet = () => (matchMedia('(max-aspect-ratio: 4/5)').matches ? 'v' : 'h')

// De grueso a fino: cualquier punto del scroll tiene pronto un cuadro cercano
function loadOrder(count) {
  const seen = new Set()
  const order = []
  for (let step = 16; step >= 1; step /= 2) {
    for (let i = 0; i < count; i += step) if (!seen.has(i)) { seen.add(i); order.push(i) }
  }
  return order
}

function createSequence(canvas) {
  const ctx = canvas.getContext('2d')
  const key = pickSet()
  const set = SETS[key]
  const frames = new Array(set.count)
  let wanted = 0 // índice con decimales: se mezclan los dos cuadros vecinos
  let drawn = -1

  const nearestLoaded = (index) => {
    for (let d = 0; d < set.count; d++) {
      if (frames[index - d]) return index - d
      if (frames[index + d]) return index + d
    }
    return -1
  }

  const paint = (img, alpha) => {
    const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    ctx.globalAlpha = alpha
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
  }

  // Entre dos cuadros se dibuja el siguiente encima con transparencia: el movimiento no da saltos
  const draw = (force = false) => {
    const base = Math.floor(wanted)
    const mix = Math.round((wanted - base) * 8) / 8
    const key = base + mix
    if (key === drawn && !force) return
    const a = frames[base]
    const b = frames[base + 1]
    if (a) {
      paint(a, 1)
      if (b && mix > 0) paint(b, mix)
    } else {
      const index = nearestLoaded(base)
      if (index < 0) return
      paint(frames[index], 1)
    }
    ctx.globalAlpha = 1
    drawn = a ? key : -1
  }

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(canvas.clientWidth * dpr)
    canvas.height = Math.round(canvas.clientHeight * dpr)
    draw(true)
  }

  const queue = loadOrder(set.count)
  const loadNext = () => {
    const index = queue.shift()
    if (index === undefined) return
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => { frames[index] = img; draw(); loadNext() }
    img.onerror = loadNext
    img.src = `${FRAMES}/${key}/f_${String(index).padStart(3, '0')}.webp`
  }
  for (let i = 0; i < LOAD_CONCURRENCY; i++) loadNext()

  resize()
  window.addEventListener('resize', resize)

  return {
    show(progress) {
      wanted = clamp01(progress) * (set.count - 1)
      draw()
    },
    // Alto del ticket en pantalla (px CSS) en el último cuadro, con el mismo recorte "cover"
    ticketHeight() {
      const scale = Math.max(canvas.clientWidth / set.w, canvas.clientHeight / set.h)
      return set.ticketH * scale
    },
  }
}

function createLayers(root) {
  const layers = [...root.querySelectorAll('.hero-layer')].map((el) => {
    const [from, to] = el.dataset.range.split(',').map(Number)
    return { el, from, to }
  })
  return (p) => {
    for (const { el, from, to } of layers) {
      const fadeIn = smooth(from === 0 ? 1 : clamp01((p - from) / FADE))
      const fadeOut = smooth(clamp01((to - p) / FADE))
      const opacity = Math.min(fadeIn, fadeOut)
      el.style.opacity = opacity
      // Entra desde abajo y sale hacia arriba, como si siguiera al scroll
      el.style.translate = `0 ${fadeIn < 1 ? (1 - fadeIn) * 18 : -(1 - fadeOut) * 18}px`
      el.classList.toggle('is-on', opacity > 0.5)
    }
  }
}

export function initHero(lenis) {
  const hero = document.querySelector('#inicio')
  const seqCanvas = hero.querySelector('#seq')
  const receiptCanvas = hero.querySelector('#receipt3d')
  const poster = hero.querySelector('.hero-poster')
  const scrim = hero.querySelector('.hero-scrim')
  const nav = document.querySelector('.nav')
  const progressBar = hero.querySelector('#hero-progress')

  const sequence = createSequence(seqCanvas)
  const updateLayers = createLayers(hero)
  const state = { p: 0 }
  let receipt = null

  // Three.js pesa: se descarga aparte, cuando el navegador queda libre
  const loadReceipt = () =>
    import('./receipt3d.js').then(({ createReceipt }) => {
      receipt = createReceipt(receiptCanvas, '/img/ticket.webp', () => sequence.ticketHeight())
      render(state.p)
    })
  if ('requestIdleCallback' in window) requestIdleCallback(loadReceipt, { timeout: 2500 })
  else setTimeout(loadReceipt, 1200)

  function render(p) {
    sequence.show(p / SEQ_END)
    if (p > 0.002) poster.style.visibility = 'hidden'
    updateLayers(p)
    scrim.style.opacity = 1 - clamp01((p - 0.06) / 0.08)
    nav.classList.toggle('is-glass', p > 0.06)
    progressBar.style.transform = `scaleX(${p})`

    const enter = clamp01((p - RECEIPT_START) / (RECEIPT_SETTLED - RECEIPT_START))
    // El ticket 2D se cambia por el 3D en el mismo lugar; luego el fondo se queda solo con el índigo
    const handoff = receipt ? clamp01(enter * 6) : 0
    receiptCanvas.style.opacity = handoff
    seqCanvas.style.opacity = 1 - handoff
    receiptCanvas.classList.toggle('is-live', enter >= 1)
    receipt?.setProgress(enter)
  }

  gsap.to(state, {
    p: 1,
    ease: 'none',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: true }, // Lenis ya suaviza
    onUpdate: () => render(state.p),
  })
  render(0)
  if (lenis) stepThrough(hero, lenis)
}

// Dentro del hero cada gesto (rueda, dedo o teclado) avanza o retrocede hasta la siguiente parada,
// y la secuencia corre entre las dos como un video. Pasada la última parada, el scroll es libre.
function stepThrough(hero, lenis) {
  const range = () => {
    const top = hero.offsetTop
    return { top, end: top + hero.offsetHeight - window.innerHeight }
  }
  const stops = () => { const { top, end } = range(); return STOPS.map((p) => top + p * (end - top)) }
  const easeInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2

  let stepping = false
  let lastEvent = 0
  let stepEnd = 0
  let swipe = 0

  const inside = (dir) => {
    const { top, end } = range()
    const s = lenis.scroll
    return dir > 0 ? s >= top - 1 && s < end - 1 : s > top + 1 && s <= end + 1
  }

  const go = (dir) => {
    const s = lenis.scroll
    const ys = stops()
    const target = dir > 0 ? ys.find((y) => y > s + 2) : ys.reverse().find((y) => y < s - 2)
    if (target === undefined) return
    const { top, end } = range()
    const span = Math.abs(target - s) / (end - top)
    stepping = true
    lenis.scrollTo(target, {
      duration: Math.min(2, Math.max(1, 0.75 + span * 3.2)),
      easing: easeInOut,
      lock: true,
      force: true,
      onComplete: () => { stepping = false; stepEnd = performance.now() },
    })
  }

  lenis.options.virtualScroll = ({ deltaY, event }) => {
    if (event.type === 'touchstart') { swipe = 0; return true }
    const dir = Math.sign(deltaY)
    if (!dir || !inside(dir)) return true
    if (event.cancelable) event.preventDefault()
    if (event.type.includes('touch')) {
      // Un deslizamiento cuenta una vez, cuando recorrió suficiente
      if (swipe === null) return false
      swipe += deltaY
      if (!stepping && Math.abs(swipe) > 28) { swipe = null; go(dir) }
      return false
    }
    // Rueda: un paso por gesto; la inercia del trackpad no encadena pasos
    const now = performance.now()
    const quiet = now - lastEvent > 180
    lastEvent = now
    if (!stepping && (quiet || now - stepEnd > 900)) go(dir)
    return false
  }

  const KEYS = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 }
  window.addEventListener('keydown', (e) => {
    const base = KEYS[e.key]
    if (!base || e.target.closest?.('input, textarea, select, button, a, summary')) return
    const dir = e.key === ' ' && e.shiftKey ? -1 : base
    if (!inside(dir)) return
    e.preventDefault()
    if (!stepping) go(dir)
  })

  // La barra de desplazamiento o un enlace dejaron el hero entre dos paradas: se acomoda en la más cercana
  let idle = 0
  lenis.on('scroll', () => {
    clearTimeout(idle)
    if (stepping) return
    idle = setTimeout(() => {
      const { top, end } = range()
      const s = lenis.scroll
      if (stepping || s <= top + 2 || s >= end - 2) return
      const nearest = stops().reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a))
      if (Math.abs(nearest - s) < 3) return
      stepping = true
      lenis.scrollTo(nearest, { duration: 0.8, easing: easeInOut, onComplete: () => { stepping = false } })
    }, 220)
  })
}
