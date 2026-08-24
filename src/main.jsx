import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'
import { initTheme } from './utils/theme.js'
import { ScannerProvider } from './context/ScannerContext.jsx'
import { Toaster } from 'react-hot-toast'

// Inicializa el tema antes de renderizar la app
initTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ScannerProvider>
        <Toaster position="top-center" />
        <App />
      </ScannerProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

// Registrar Service Worker para PWA (solo en servidor HTTP/HTTPS, no en file://)
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}