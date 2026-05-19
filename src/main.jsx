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

/**
 * Drain the boot-guard's stashed errors (CHARTRAIN_SENTINEL_MEDIC.md §4.1).
 * The inline pre-bundle <script> in index.html stashes site-load failures to
 * localStorage 'ct_boot_errors' — errors the bundled reporter could not catch
 * because the bundle itself failed. On a successful app init we replay them
 * into clientErrors, then clear the key. Best-effort: never blocks the app.
 */
function drainBootErrors() {
  const KEY = 'ct_boot_errors'
  let list
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    list = JSON.parse(raw)
  } catch (_) {
    try { localStorage.removeItem(KEY) } catch (_) {}
    return
  }
  if (!Array.isArray(list) || list.length === 0) {
    try { localStorage.removeItem(KEY) } catch (_) {}
    return
  }
  // Clear first so a slow/failed drain can't double-report on the next load.
  try { localStorage.removeItem(KEY) } catch (_) {}
  list.forEach((rec) => {
    if (!rec) return
    logClientError('boot', rec.kind || 'boot-error', rec.message || 'Boot error', {
      stack: rec.stack || null,
      bootSource: rec.source || null,
      bootUrl: rec.url || null,
      bootUserAgent: rec.userAgent || null,
      capturedAt: rec.at || null,
      drainedAt: new Date().toISOString(),
      source: 'capture_frontend',
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// App mounted successfully — drain any boot-guard errors from a prior failed load.
drainBootErrors()
