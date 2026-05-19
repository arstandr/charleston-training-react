/**
 * Celebration effects using canvas-confetti (perfect score, mastery, certification, streak).
 * Lazy-load confetti to avoid "Cannot access before initialization" when quiz page loads.
 */
const BRAND_COLORS = ['#1F4D1C', '#4CAF50', '#FFD700', '#FF6B6B', '#4ECDC4']

let confettiModule = null
async function getConfetti() {
  if (confettiModule) return confettiModule
  try {
    confettiModule = (await import('canvas-confetti')).default
    return confettiModule
  } catch (_) {
    return null
  }
}

function fire(opts) {
  getConfetti().then((confetti) => {
    if (confetti) {
      try {
        confetti(opts)
      } catch (_) {}
    }
  })
}

/**
 * Celebrate perfect quiz score (100%).
 */
export function celebratePerfectScore() {
  const duration = 3000
  const end = Date.now() + duration
  getConfetti().then((confetti) => {
    if (!confetti) return
    function frame() {
      try {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors: BRAND_COLORS })
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors: BRAND_COLORS })
      } catch (_) {}
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    frame()
  })
}

/**
 * Celebrate mastery (e.g. completed flashcard deck).
 */
export function celebrateMastery() {
  getConfetti().then((confetti) => {
    if (confetti) {
      try {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#1F4D1C', '#4CAF50', '#FFD700'] })
      } catch (_) {}
    }
  })
}

/**
 * Celebrate certification completion.
 */
export function celebrateCertification() {
  const duration = 5000
  const animationEnd = Date.now() + duration
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }
  function randomInRange(min, max) {
    return Math.random() * (max - min) + min
  }
  getConfetti().then((confetti) => {
    if (!confetti) return
    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now()
      if (timeLeft <= 0) {
        clearInterval(interval)
        return
      }
      const particleCount = 50 * (timeLeft / duration)
      try {
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: ['#1F4D1C', '#4CAF50', '#FFD700'] })
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: ['#1F4D1C', '#4CAF50', '#FFD700'] })
      } catch (_) {}
    }, 250)
  })
}

/**
 * Celebrate streak milestone.
 */
export function celebrateStreak(streakDays) {
  getConfetti().then((confetti) => {
    if (confetti) {
      try {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 }, colors: ['#FF6B6B', '#FFD700', '#FFA500'], shapes: ['circle'], scalar: 1.2 })
      } catch (_) {}
    }
  })
}
