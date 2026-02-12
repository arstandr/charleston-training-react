import { useCallback, useEffect, useMemo } from 'react'
import { getTestAttemptResets } from '../services/testAttemptResets'

const TEST_ATTEMPTS_KEY = 'testAttempts'
const RESETS_APPLIED_KEY = 'testAttemptResetsApplied'
const PASSING_SCORE_ATTEMPT_1 = 85
const PASSING_SCORE_ATTEMPT_2 = 90

function loadAttempts() {
  try {
    const raw = localStorage.getItem(TEST_ATTEMPTS_KEY) || '{}'
    return JSON.parse(raw) || {}
  } catch (_) {
    return {}
  }
}

function saveAttempts(attempts) {
  try {
    localStorage.setItem(TEST_ATTEMPTS_KEY, JSON.stringify(attempts))
  } catch (_) {}
}

function loadResetsApplied() {
  try {
    const raw = localStorage.getItem(RESETS_APPLIED_KEY) || '{}'
    return JSON.parse(raw) || {}
  } catch (_) {
    return {}
  }
}

function saveResetsApplied(obj) {
  try {
    localStorage.setItem(RESETS_APPLIED_KEY, JSON.stringify(obj))
  } catch (_) {}
}

export function useTestAttempts(traineeId) {
  // Apply manager-initiated resets from Firestore (clears local attempts when reset is newer than last applied)
  useEffect(() => {
    if (!traineeId) return
    let cancelled = false
    getTestAttemptResets(traineeId).then((resets) => {
      if (cancelled) return
      const applied = loadResetsApplied()
      const attempts = loadAttempts()
      let changed = false
      for (const [testId, { at }] of Object.entries(resets)) {
        const key = `${traineeId}_${testId}`
        if (at > (applied[key] || 0)) {
          delete attempts[key]
          applied[key] = at
          changed = true
        }
      }
      if (changed) {
        saveAttempts(attempts)
        saveResetsApplied(applied)
      }
    })
    return () => { cancelled = true }
  }, [traineeId])

  const getAttempts = useCallback(
    (testId) => {
      if (!traineeId) return { count: 0, scores: [], passed: false }
      const attempts = loadAttempts()
      const key = `${traineeId}_${testId}`
      const rec = attempts[key] || { count: 0, scores: [], passed: false }
      return {
        count: rec.count || 0,
        scores: Array.isArray(rec.scores) ? rec.scores : [],
        passed: !!rec.passed,
      }
    },
    [traineeId]
  )

  const getRequiredScore = useCallback(
    (testId) => {
      if (!traineeId || testId === 'bonus_test') return PASSING_SCORE_ATTEMPT_1
      const { count } = getAttempts(testId)
      return count === 0 ? PASSING_SCORE_ATTEMPT_1 : PASSING_SCORE_ATTEMPT_2
    },
    [traineeId, getAttempts]
  )

  const canTake = useCallback(
    (testId, { isPractice = false } = {}) => {
      if (!traineeId) return { allowed: false, reason: 'Not logged in', requiredScore: PASSING_SCORE_ATTEMPT_1, attempts: 0 }
      if (testId === 'bonus_test') return { allowed: true, reason: 'Practice test - unlimited attempts', requiredScore: PASSING_SCORE_ATTEMPT_1, attempts: 0 }
      const { count, scores, passed } = getAttempts(testId)
      if (passed) return { allowed: true, reason: 'Already passed - retaking for practice', attempts: count }
      if (count >= 2) return { allowed: false, reason: 'Maximum 2 attempts used. Ask your manager to request a reset.', attempts: count }
      return { allowed: true, requiredScore: getRequiredScore(testId), attempts: count }
    },
    [traineeId, getAttempts, getRequiredScore]
  )

  const recordAttempt = useCallback(
    (testId, score, passed, meta = {}) => {
      if (!traineeId) return
      const attempts = loadAttempts()
      const key = `${traineeId}_${testId}`
      const rec = attempts[key] || { count: 0, scores: [], passed: false }
      rec.count = (rec.count || 0) + 1
      rec.scores = rec.scores || []
      rec.scores.push(score)
      if (passed) rec.passed = true
      if (meta.hintsUsed != null) rec.lastHintsUsed = meta.hintsUsed
      attempts[key] = rec
      saveAttempts(attempts)
    },
    [traineeId]
  )

  const getBestScore = useCallback(
    (testId) => {
      const { scores } = getAttempts(testId)
      if (!scores.length) return 0
      return Math.max(...scores)
    },
    [getAttempts]
  )

  const isTestPassed = useCallback(
    (testId) => {
      const { passed } = getAttempts(testId)
      return !!passed
    },
    [getAttempts]
  )

  const resetAttempts = useCallback(
    (testId) => {
      if (!traineeId) return
      const attempts = loadAttempts()
      const key = `${traineeId}_${testId}`
      delete attempts[key]
      saveAttempts(attempts)
    },
    [traineeId]
  )

  return useMemo(
    () => ({
      getAttempts,
      getRequiredScore,
      canTake,
      recordAttempt,
      getBestScore,
      isTestPassed,
      resetAttempts,
    }),
    [getAttempts, getRequiredScore, canTake, recordAttempt, getBestScore, isTestPassed, resetAttempts]
  )
}
