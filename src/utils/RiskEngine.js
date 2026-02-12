/**
 * Legacy risk scoring algorithm (AdvancedAnalyticsEngine).
 * Deterministic calculation: Stall factor, Test Failure factor, Retake factor.
 */

import { PRETTY_TEST_NAMES } from '../data/quizDatabase'

const OFFICIAL_TEST_IDS = ['steaks_test', 'bar_test', 'wines_test', 'soups_test']
const FAIL_THRESHOLD = 85
const STALL_DAYS_THRESHOLD = 5
const STALL_POINTS = 20
const FAIL_POINTS = 15
const RETAKE_POINTS = 10
const RETAKE_ATTEMPTS_THRESHOLD = 2

/** Last activity date for display (schedule sign-offs, lastLogin, or startDate). */
export function getLastActivityDate(trainee) {
  const rec = trainee || {}
  let latest = null
  if (rec.lastLogin) {
    const t = new Date(rec.lastLogin).getTime()
    if (!latest || t > latest) latest = t
  }
  if (rec.startDate) {
    const t = new Date(rec.startDate).getTime()
    if (!latest || t > latest) latest = t
  }
  const schedule = rec.schedule || {}
  for (const item of Object.values(schedule)) {
    const d = item.managerSignedAt || item.trainerSignedAt || item.when
    if (d) {
      const t = new Date(d).getTime()
      if (!latest || t > latest) latest = t
    }
  }
  return latest ? new Date(latest) : null
}

function getTestScoreAndCount(testAttempts, traineeId, testId) {
  const key = `${traineeId}_${testId}`
  const rec = testAttempts[key] || {}
  const scores = Array.isArray(rec.scores) ? rec.scores : []
  const best = scores.length ? Math.max(...scores) : 0
  const count = rec.count || 0
  return { score: best, attemptCount: count }
}

function prettyTestName(testId) {
  const key = String(testId).replace(/-/g, '_')
  return PRETTY_TEST_NAMES[key] || testId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Analyze trainee risk using the legacy scoring algorithm.
 * @param {object} trainee - Trainee record { id, schedule, lastLogin?, startDate?, ... }
 * @param {object} options - { testAttempts: {} } - raw localStorage testAttempts object keyed by `${traineeId}_${testId}`
 * @returns {{ score: number, level: 'high'|'medium'|'low', drivers: string[] }}
 */
export function analyzeTraineeRisk(trainee, options = {}) {
  const testAttempts = options.testAttempts || {}
  const traineeId = trainee?.id ?? trainee?.traineeId
  let score = 0
  const drivers = []

  // Stall Factor (+20): (Today - LastActivity) > 5 days
  const lastActivity = getLastActivityDate(trainee)
  const now = Date.now()
  const daysSinceActivity = lastActivity
    ? (now - lastActivity.getTime()) / (24 * 60 * 60 * 1000)
    : 999
  if (daysSinceActivity > STALL_DAYS_THRESHOLD) {
    score += STALL_POINTS
    const days = Math.floor(daysSinceActivity)
    drivers.push(`Stalled ${days} days`)
  }

  // Test Failure Factor (+15 per fail): score > 0 AND score < 85 for steaks_test, bar_test, wines_test, soups_test
  for (const testId of OFFICIAL_TEST_IDS) {
    const { score: testScore } = getTestScoreAndCount(testAttempts, traineeId, testId)
    if (testScore > 0 && testScore < FAIL_THRESHOLD) {
      score += FAIL_POINTS
      drivers.push(`Failed ${prettyTestName(testId)}`)
    }
  }

  // Retake Factor (+10): any of those tests has attemptCount > 2
  let hasHighRetakes = false
  for (const testId of OFFICIAL_TEST_IDS) {
    const { attemptCount } = getTestScoreAndCount(testAttempts, traineeId, testId)
    if (attemptCount > RETAKE_ATTEMPTS_THRESHOLD) {
      hasHighRetakes = true
      break
    }
  }
  if (hasHighRetakes) {
    score += RETAKE_POINTS
    drivers.push('High retakes')
  }

  // Badge determination
  let level = 'low'
  if (score > 60) level = 'high'
  else if (score > 30) level = 'medium'

  return { score, level, drivers }
}

/** Alias for manager dashboard / UI. Same as analyzeTraineeRisk. */
export function calculateTraineeRisk(trainee, options = {}) {
  return analyzeTraineeRisk(trainee, options)
}
