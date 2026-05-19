/**
 * PWA: register service worker and expose update callback for "New version available" banner.
 * VitePWA is currently disabled (disable: true in vite.config.js), so we unregister any
 * old service workers to prevent stale JS chunk caching that causes MIME type errors.
 */
let updateSW = null

export function register() {
  if (import.meta.env.DEV) return
  // Unregister any previously installed service workers (from when VitePWA was enabled).
  // Old SW caches stale chunk hashes, causing "text/html is not a valid JavaScript MIME type".
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister())
    }).catch(() => {})
  }
  import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      immediate: true,
      onNeedRefresh: () => window.dispatchEvent(new CustomEvent('pwa-need-refresh')),
    })
    updateSW = typeof update === 'function' ? update : null
  }).catch(() => {})
}

export function getUpdateSW() {
  return updateSW
}
