/**
 * PWA: register service worker and expose update callback for "New version available" banner.
 */
let updateSW = null

export function register() {
  if (import.meta.env.DEV) return
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
