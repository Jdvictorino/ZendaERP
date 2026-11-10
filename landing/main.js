import * as THREE from './vendor/three.module.min.js';

// Correo de las solicitudes de demo: se configura en <meta name="zenda-demo-email">
const demoEmail = document.querySelector('meta[name="zenda-demo-email"]')?.content.trim();
if (demoEmail) {
  const subject = encodeURIComponent('Solicitud de demo de Zenda ERP');
  const body = encodeURIComponent('Hola, me gustaría ver una demostración de Zenda ERP.\n\nNombre del negocio:\nTipo de negocio:\nTeléfono:\n');
  document.querySelectorAll('[data-demo]').forEach((a) => { a.href = `mailto:${demoEmail}?subject=${subject}&body=${body}`; });
}
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

const canvas = document.getElementById('scene');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const gl = !reduceMotion && canvas.getContext('webgl2', { antialias: true, alpha: false });
// Sin WebGL2 o con movimiento reducido se queda el recorrido con imágenes (ya está en el HTML)
if (gl) startScene(gl);

function startScene(context) {
  document.documentElement.classList.add('has-webgl');

  const NIGHT = 0x0a0f1e;
  const PANEL_W = 3.6;
  const PANEL_H = PANEL_W * (1130 / 1600);
  const TOUR = ['pos', 'pedidos', 'inventario', 'cxc', 'reportes', 'fiscal'];
  const EXTRA = [
    { name: 'dashboard', pos: [3.6, 2.1, -7], rot: -0.35 },
    { name: 'app-dark', pos: [4.4, -1.7, -7.5], rot: -0.55 },
  ];

  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(NIGHT);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(NIGHT, 9, 34);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  // Esquinas redondeadas de las pantallas, como las ventanas de la app
  const alphaMap = (() => {
    const c = document.createElement('canvas');
    c.width = 800; c.height = Math.round(800 * (1130 / 1600));
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath();
    g.roundRect(0, 0, c.width, c.height, 22);
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  // Halo índigo detrás de cada pantalla (luz, no un borde)
  const glowTexture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(99,102,241,0.9)');
    grad.addColorStop(0.5, 'rgba(79,70,229,0.25)');
    grad.addColorStop(1, 'rgba(79,70,229,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();

  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const panelGeo = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
  const glowGeo = new THREE.PlaneGeometry(PANEL_W * 1.9, PANEL_H * 2.1);

  function makePanel(name) {
    const group = new THREE.Group();
    const tex = loader.load(`/assets/screens/${name}.webp`, undefined, undefined, () => document.documentElement.classList.remove('has-webgl'));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    const panel = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ map: tex, alphaMap, transparent: true, fog: true }));
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, fog: false }));
    glow.position.z = -0.05;
    group.add(glow, panel);
    group.userData = { panel, glow };
    scene.add(group);
    return group;
  }

  // Estaciones a lo largo de un pasillo, alternando lados
  const stations = TOUR.map((name, i) => {
    const g = makePanel(name);
    const side = i % 2 === 0 ? 1 : -1;
    g.position.set(side * 1.1, side * 0.2, -i * 7);
    g.userData.idleRot = -side * 0.42;
    g.userData.base = g.position.clone();
    return g;
  });
  const extras = EXTRA.map(({ name, pos, rot }) => {
    const g = makePanel(name);
    g.position.set(...pos);
    g.rotation.y = rot;
    g.userData.base = g.position.clone();
    g.scale.setScalar(0.85);
    return g;
  });

  // Polvo índigo y un piso de rejilla para dar profundidad
  const dust = (() => {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = 8 - Math.random() * 50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x818cf8, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }));
  })();
  scene.add(dust);
  const grid = new THREE.GridHelper(90, 90, 0x27326a, 0x151d3a);
  grid.position.set(0, -3.2, -18);
  scene.add(grid);

  // Poses de cámara: la portada y una por estación
  let aspect = 1;
  let mobile = false;
  function stationPose(g) {
    const p = g.userData.base;
    if (mobile) {
      // La pantalla entera debe caber a lo ancho y quedar en la mitad superior
      const tan = Math.tan(THREE.MathUtils.degToRad(20));
      const d = (PANEL_W * 1.08) / (2 * tan * aspect);
      // La pantalla queda centrada en la mitad superior; el texto ocupa la inferior
      const lift = d * tan * 0.5;
      return { pos: new THREE.Vector3(p.x, p.y - lift, p.z + d), look: new THREE.Vector3(p.x, p.y - lift, p.z) };
    }
    const off = PANEL_W * 0.42;
    return { pos: new THREE.Vector3(p.x - off, p.y, p.z + 6.1), look: new THREE.Vector3(p.x - off, p.y, p.z) };
  }
  function heroPose() {
    return mobile
      ? { pos: new THREE.Vector3(0.9, -2.6, 16), look: new THREE.Vector3(0.9, -6.4, -4) }
      : { pos: new THREE.Vector3(-3.9, 0.3, 8.6), look: new THREE.Vector3(-0.6, 0, -4) };
  }

  // Avance del scroll medido sobre el centro de cada estación del HTML
  const articles = [...document.querySelectorAll('.station')];
  let anchors = [];
  let poses = [];
  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    aspect = w / h;
    mobile = aspect < 0.9;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    // Posición en la página (offsetTop es relativo a la sección del recorrido)
    anchors = [h / 2, ...articles.map((a) => a.getBoundingClientRect().top + window.scrollY + a.offsetHeight / 2)];
    poses = [heroPose(), ...stations.map(stationPose)];
  }
  layout();
  window.addEventListener('resize', layout);

  const smooth = (t) => t * t * (3 - 2 * t);
  function scrollState() {
    const y = window.scrollY + window.innerHeight / 2;
    let k = 0;
    while (k < anchors.length - 2 && y > anchors[k + 1]) k++;
    const span = anchors[k + 1] - anchors[k];
    const f = THREE.MathUtils.clamp((y - anchors[k]) / span, 0, 1);
    // Se queda quieta en cada estación y viaja en el tramo central
    const travel = smooth(THREE.MathUtils.clamp((f - 0.22) / 0.56, 0, 1));
    const last = anchors[anchors.length - 1];
    const fadeOut = THREE.MathUtils.clamp((y - last) / (window.innerHeight * 0.9), 0, 1);
    return { k, travel, s: k + travel, fadeOut };
  }

  const pointer = new THREE.Vector2();
  window.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  const camPos = poses[0].pos.clone();
  const camLook = poses[0].look.clone();
  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const clock = new THREE.Clock();
  let running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { clock.getDelta(); requestAnimationFrame(frame); }
  });

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const { k, travel, s, fadeOut } = scrollState();

    canvas.style.opacity = String(1 - fadeOut);
    if (fadeOut < 1) {
      tmpPos.lerpVectors(poses[k].pos, poses[k + 1].pos, travel);
      tmpLook.lerpVectors(poses[k].look, poses[k + 1].look, travel);
      if (!mobile) {
        tmpPos.x += pointer.x * 0.35;
        tmpPos.y -= pointer.y * 0.2;
      }
      const ease = 1 - Math.exp(-dt * 4.5);
      camPos.lerp(tmpPos, ease);
      camLook.lerp(tmpLook, ease);
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      // La estación activa se endereza y su halo se enciende; las demás esperan inclinadas
      stations.forEach((g, i) => {
        const near = 1 - Math.min(1, Math.abs(s - (i + 1)));
        const targetRot = g.userData.idleRot * (1 - near);
        g.rotation.y += (targetRot - g.rotation.y) * ease;
        g.position.y = g.userData.base.y + Math.sin(t * 0.6 + i) * 0.06 * (1 - near);
        g.userData.glow.material.opacity = 0.18 + near * 0.42;
      });
      extras.forEach((g, i) => { g.position.y = g.userData.base.y + Math.sin(t * 0.5 + i * 2) * 0.08; });
      dust.rotation.y = t * 0.01;
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
