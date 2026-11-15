import './style.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { initHero } from './hero.js'
import { initSections } from './sections.js'

gsap.registerPlugin(ScrollTrigger)

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

if (!reducedMotion) {
  const lenis = new Lenis({ anchors: true })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)
}

// Correo de las solicitudes de demo: se configura en <meta name="zenda-demo-email">
const demoEmail = document.querySelector('meta[name="zenda-demo-email"]')?.content.trim()
if (demoEmail) {
  const subject = encodeURIComponent('Solicitud de demo de Zenda ERP')
  const body = encodeURIComponent('Hola, me gustaría ver una demostración de Zenda ERP.\n\nNombre del negocio:\nTipo de negocio:\nTeléfono:\n')
  document.querySelectorAll('[data-demo]').forEach((a) => { a.href = `mailto:${demoEmail}?subject=${subject}&body=${body}` })
}
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()) })

// El menú del celular se cierra al elegir una sección o al tocar fuera
const menu = document.querySelector('.menu')
menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { menu.open = false }))
document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false })

initHero()
initSections({ reducedMotion })
