import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

function navBackground() {
  const nav = document.querySelector('.nav')
  ScrollTrigger.create({
    trigger: '#inicio',
    start: 'bottom top+=64',
    onEnter: () => nav.classList.add('is-solid'),
    onLeaveBack: () => nav.classList.remove('is-solid'),
  })
}

function reveals() {
  gsap.set('[data-reveal]', { opacity: 0, y: 40 })
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 88%',
    once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08 }),
  })
  // Los módulos se levantan como fichas
  gsap.set('[data-flip]', { opacity: 0, rotateX: -50, y: 60, transformOrigin: '50% 100%' })
  ScrollTrigger.batch('[data-flip]', {
    start: 'top 90%',
    once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, rotateX: 0, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1 }),
  })
}

// En escritorio "Un día" se fija y avanza en horizontal con el scroll; cada pantalla gira según su posición
function dayGallery() {
  const track = document.querySelector('#day-track')
  const days = gsap.utils.toArray('.day')
  gsap.matchMedia().add('(min-width: 900px)', () => {
    const distance = () => track.scrollWidth - window.innerWidth
    const tilt = () => {
      const center = window.innerWidth / 2
      for (const day of days) {
        const box = day.getBoundingClientRect()
        const offset = (box.left + box.width / 2 - center) / center
        gsap.set(day, { rotateY: offset * -18, z: -Math.abs(offset) * 100 })
      }
    }
    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: '.day-pin',
        pin: true,
        start: 'top top',
        end: () => `+=${distance()}`,
        scrub: 0.6,
        invalidateOnRefresh: true,
        onUpdate: tilt,
        onRefresh: tilt,
      },
    })
    return () => gsap.set(days, { clearProps: 'transform' })
  })
}

// Los videos corren solo mientras se ven; con ahorro de datos se queda la imagen fija
function autoplayVideos({ reducedMotion }) {
  if (reducedMotion || navigator.connection?.saveData) return
  const io = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) target.play().catch(() => {})
      else target.pause()
    }
  }, { threshold: 0.35 })
  document.querySelectorAll('video[data-autoplay]').forEach((v) => io.observe(v))
}

// En el celular, el botón fijo aparece cuando no se ve ningún otro "Pedir una demo"
function stickyCta() {
  const sticky = document.querySelector('.sticky-cta')
  const watched = [document.querySelector('#inicio'), document.querySelector('#demo')]
  const visible = new Set()
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)))
    sticky.classList.toggle('is-visible', visible.size === 0)
  })
  watched.forEach((el) => io.observe(el))
}

export function initSections({ reducedMotion }) {
  navBackground()
  autoplayVideos({ reducedMotion })
  stickyCta()
  if (reducedMotion) return
  reveals()
  dayGallery()
}
