import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  // Sin esto Vite toma el postcss.config de la app (Tailwind 3) que está en la carpeta de arriba
  css: { postcss: {} },
  build: { target: 'es2020' },
})
