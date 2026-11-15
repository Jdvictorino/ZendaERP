import * as THREE from 'three'

// El ticket térmico real (generado por la app) como papel en 3D: entra plano, encima del ticket del
// último cuadro de la secuencia, y al asentarse se curva y se aparta para dejar sitio al texto.
const WIDTH = 1
const HEIGHT = 2490 / 1088 // proporción de img/ticket.webp
const FOV = 30
const DRAG_SPEED = 0.008
const MAX_TILT = 0.35

// Curva del papel: la parte de abajo se enrolla hacia atrás, como recién salido de la impresora
function bend(geometry, flat, curl) {
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = flat[i * 3]
    const y = flat[i * 3 + 1]
    const t = 0.5 - y / HEIGHT // 0 arriba, 1 abajo
    const roll = Math.max(0, t - 0.5) / 0.5
    const bow = 1 - (2 * x / WIDTH) ** 2
    pos.setZ(i, curl * (-0.55 * roll * roll + 0.05 * bow + 0.03 * Math.sin(t * Math.PI * 3)))
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
}

function trackDrag(canvas) {
  const drag = { y: 0, x: 0, velocity: 0, active: false }
  let last = null
  canvas.addEventListener('pointerdown', (e) => {
    last = { x: e.clientX, y: e.clientY }
    drag.active = true
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!last) return
    drag.velocity = (e.clientX - last.x) * DRAG_SPEED
    drag.y += drag.velocity
    drag.x = THREE.MathUtils.clamp(drag.x + (e.clientY - last.y) * DRAG_SPEED * 0.5, -MAX_TILT, MAX_TILT)
    last = { x: e.clientX, y: e.clientY }
  })
  const release = () => { last = null; drag.active = false }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  drag.coast = () => {
    if (drag.active) return
    drag.y += drag.velocity
    drag.velocity *= 0.94
    drag.x *= 0.92
  }
  return drag
}

/**
 * @param canvas      lienzo del hero
 * @param textureUrl  imagen del ticket
 * @param ticketPx    función que da el alto en px del ticket en el último cuadro (para empatar el 3D)
 */
export function createReceipt(canvas, textureUrl, ticketPx) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8cc4, 1.15))
  const key = new THREE.DirectionalLight(0xffffff, 1.1)
  key.position.set(-2, 3, 5)
  scene.add(key)

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100)
  const render = () => renderer.render(scene, camera)

  const texture = new THREE.TextureLoader().load(textureUrl, render)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()

  const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT, 12, 120)
  const flat = Float32Array.from(geometry.attributes.position.array)
  const front = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: texture, side: THREE.FrontSide }))
  const back = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0xece8dd, side: THREE.BackSide }))
  const paper = new THREE.Group()
  paper.add(front, back)
  const holder = new THREE.Group()
  holder.add(paper)
  scene.add(holder)

  const drag = trackDrag(canvas)
  let progress = 0
  let curl = -1
  let rafId = 0
  let final = { x: 0, y: 0, scale: 1 }

  function layout() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // Distancia a la que el ticket mide en pantalla lo mismo que en el último cuadro
    const distance = (HEIGHT * h) / (ticketPx() * 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)))
    camera.position.set(0, 0, distance)
    camera.updateProjectionMatrix()
    const viewH = 2 * distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const viewW = viewH * camera.aspect
    // Escritorio: a la derecha del texto. Celular: arriba, con el texto debajo.
    final = w >= 768 ? { x: viewW * 0.2, y: -viewH * 0.03, scale: 0.84 } : { x: 0, y: viewH * 0.12, scale: 0.52 }
    draw()
  }

  function draw() {
    const settle = 1 - (1 - progress) ** 3
    const c = Math.round(settle * 40) / 40
    if (c !== curl) { bend(geometry, flat, c); curl = c }
    const time = performance.now() / 1000
    holder.position.set(final.x * settle, final.y * settle, 0)
    holder.scale.setScalar(1 + (final.scale - 1) * settle)
    paper.rotation.y = settle * -0.42 + drag.y + Math.sin(time * 0.7) * 0.06 * settle
    paper.rotation.x = settle * 0.12 + drag.x
    paper.rotation.z = settle * 0.05
    render()
  }

  function loop() {
    drag.coast()
    draw()
    rafId = requestAnimationFrame(loop)
  }

  window.addEventListener('resize', layout)
  layout()

  return {
    // 0: plano encima del ticket del video. 1: curvado, apartado y libre para arrastrar.
    setProgress(value) {
      progress = value
      const visible = value > 0
      if (visible && !rafId) rafId = requestAnimationFrame(loop)
      if (!visible && rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      if (value < 1) { drag.y = 0; drag.velocity = 0 }
      if (!visible) draw()
    },
  }
}
