import gsap from 'gsap'

// Reparto del scroll del hero (0 a 1): hasta SEQ_END avanzan los cuadros de la venta;
// desde RECEIPT_START el ticket impreso pasa a ser el comprobante 3D.
const SEQ_END = 0.8
const RECEIPT_START = 0.78
const RECEIPT_SETTLED = 0.95
const FADE = 0.035
const LOAD_CONCURRENCY = 6
const FRAMES = '/frames/v1'

// Ticket del último cuadro (px del render): alto y tamaño del cuadro, para que el 3D aparezca encima
const SETS = {
  h: { count: 192, w: 1280, h: 720, ticketH: 600 },
  v: { count: 96, w: 720, h: 1280, ticketH: 980 },
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))

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
  let wanted = 0
  let drawn = -1

  const nearestLoaded = (index) => {
    for (let d = 0; d < set.count; d++) {
      if (frames[index - d]) return index - d
      if (frames[index + d]) return index + d
    }
    return -1
  }

  const draw = (force = false) => {
    const index = nearestLoaded(wanted)
    if (index < 0 || (index === drawn && !force)) return
    const img = frames[index]
    const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
    drawn = index
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
      wanted = Math.round(clamp01(progress) * (set.count - 1))
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
      const fadeIn = from === 0 ? 1 : clamp01((p - from) / FADE)
      const opacity = Math.min(fadeIn, clamp01((to - p) / FADE))
      el.style.opacity = opacity
      el.style.translate = `0 ${(1 - opacity) * 24}px`
      el.classList.toggle('is-on', opacity > 0.5)
    }
  }
}

export function initHero() {
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
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: 0.4 },
    onUpdate: () => render(state.p),
  })
  render(0)
}
