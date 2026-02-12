/**
 * Simple confetti burst for celebrations (e.g. perfect quiz score).
 * Creates animated divs and removes them after duration.
 */
const COLORS = ['#1F4D1C', '#2e7d32', '#5CB85C', '#f59e0b', '#e65100']

export function fireConfetti(options = {}) {
  const { count = 50, duration = 3000, origin = { x: 0.5, y: 0.5 } } = options
  const container = document.createElement('div')
  container.className = 'fixed inset-0 pointer-events-none z-[150]'
  container.setAttribute('aria-hidden', 'true')
  document.body.appendChild(container)

  const centerX = (typeof origin.x === 'number' ? origin.x : 0.5) * window.innerWidth
  const centerY = (typeof origin.y === 'number' ? origin.y : 0.5) * window.innerHeight

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    const size = 6 + Math.random() * 8
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
    const velocity = 80 + Math.random() * 120
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    el.style.cssText = `
      position: fixed;
      left: ${centerX}px;
      top: ${centerY}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: 2px;
      pointer-events: none;
      --vx: ${Math.cos(angle) * velocity}px;
      --vy: ${Math.sin(angle) * velocity - 40}px;
      animation: confetti-fall ${duration}ms ease-out forwards;
    `
    container.appendChild(el)
  }

  const style = document.createElement('style')
  style.textContent = `
    @keyframes confetti-fall {
      0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
      100% {
        transform: translate(var(--vx), var(--vy)) rotate(720deg);
        opacity: 0;
      }
    }
  `
  container.appendChild(style)

  setTimeout(() => {
    container.remove()
  }, duration)
}
