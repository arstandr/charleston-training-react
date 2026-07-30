import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { register as registerPWA } from './pwaRegistration'
import { logClientError } from './services/errorLogger'

registerPWA()

// Catch unhandled JS errors
window.addEventListener('error', (event) => {
  logClientError('general', 'unhandled-error', event.error || event.message, {
    filename: event.filename,
    lineno: event.lineno,
  })
})
// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || String(event.reason || '')
  // Suppress Firebase IndexedDB connection-lost noise — not actionable, SDK auto-recovers
  if (/Connection to Indexed Database server lost|IndexedDB/i.test(msg)) return
  logClientError('general', 'unhandled-promise-rejection', event.reason)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
