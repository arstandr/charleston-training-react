import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getTestAttemptResets } from '../services/testAttemptResets'
import { saveTestResult, loadTestResults } from '../services/quizAttemptsService'

const TEST_ATTEMPTS_KEY = 'testAttempts'
const RESETS_APPLIED_KEY = 'testAttemptResetsApplied'
const PASSING_SCORE_ATTEMPT_1 = 80
const PASSING_SCORE_ATTEMPT_2 = 85
const PASSING_SCORE_ATTEMPT_3 = 90
const DEFAULT_MAX_ATTEMPTS = 2

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
  const hydratedRef = useRef(false)
  // hydrating = true until Firestore attempt data has been checked this session.
  // Starts true even when traineeId is absent so callers don't flash an open gate
  // before the traineeId is known. Set to false once we have a definitive answer.
  const [hydrating, setHydrating] = useState(true)

  // Hydrate localStorage from Firestore on mount so lockout works cross-browser
  useEffect(() => {
    if (!traineeId) {
      setHydrating(false)
      return
    }
    if (hydratedRef.current) return
    hydratedRef.current = true
    // Re-arm the gate in case the !traineeId path already cleared it
    // (auth is async: traineeId starts null, then resolves)
    setHydrating(true)
    let cancelled = false
    loadTestResults(traineeId).then((firestoreData) => {
      if (cancelled) return
      if (firestoreData) {
        const localAttempts = loadAttempts()
        let changed = false
        for (const [testId, fsRec] of Object.entries(firestoreData)) {
          const key = `${traineeId}_${testId}`
          const local = localAttempts[key] || { count: 0, scores: [], passed: false, usedBonusIds: [], maxAttempts: DEFAULT_MAX_ATTEMPTS }
          const fsCount = fsRec?.count || 0
          const fsScores = Array.isArray(fsRec?.scores) ? fsRec.scores : []
          const fsPassed = !!fsRec?.passed
          const fsMax = fsRec?.maxAttempts || DEFAULT_MAX_ATTEMPTS
          // Merge usedBonusIds from both sources (union)
          const mergedBonusIds = [...new Set([...(local.usedBonusIds || []), ...(Array.isArray(fsRec?.usedBonusIds) ? fsRec.usedBonusIds : [])])]
          // Firestore is authoritative — use whichever has more attempts, and highest maxAttempts
          if (fsCount > (local.count || 0) || fsMax > (local.maxAttempts || DEFAULT_MAX_ATTEMPTS)) {
            localAttempts[key] = {
              count: Math.max(fsCount, local.count || 0),
              scores: fsCount > (local.count || 0) ? fsScores : local.scores,
              passed: fsPassed || local.passed,
              usedBonusIds: mergedBonusIds,
              maxAttempts: Math.max(fsMax, local.maxAttempts || DEFAULT_MAX_ATTEMPTS),
            }
            changed = true
          } else if (fsPassed && !local.passed || mergedBonusIds.length > (local.usedBonusIds || []).length) {
            localAttempts[key] = { ...local, passed: fsPassed || local.passed, usedBonusIds: mergedBonusIds }
            changed = true
          }
        }
        if (changed) {
          saveAttempts(localAttempts)
        }
      }
      setHydrating(false)
    }).catch((e) => {
      console.warn('[useTestAttempts] Firestore hydration failed:', e?.message)
      setHydrating(false)
    })
    return () => { cancelled = true }
  }, [traineeId])

  // Apply manager-initiated resets from Firestore (bumps maxAttempts to give 1 retake)
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
          const existing = attempts[key]
          if (existing && (existing.count || 0) >= (existing.maxAttempts || DEFAULT_MAX_ATTEMPTS)) {
            // Bump maxAttempts by 1 — gives exactly 1 retake, count stays accurate
            attempts[key] = { ...existing, maxAttempts: (existing.count || 0) + 1, passed: false }
          } else if (!existing) {
            // No record — nothing to reset
          }
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
      if (!traineeId) return { count: 0, scores: [], passed: false, usedBonusIds: [], maxAttempts: DEFAULT_MAX_ATTEMPTS }
      const attempts = loadAttempts()
      const key = `${traineeId}_${testId}`
      const rec = attempts[key] || { count: 0, scores: [], passed: false, usedBonusIds: [], maxAttempts: DEFAULT_MAX_ATTEMPTS }
      return {
        count: rec.count || 0,
        scores: Array.isArray(rec.scores) ? rec.scores : [],
        passed: !!rec.passed,
        usedBonusIds: Array.isArray(rec.usedBonusIds) ? rec.usedBonusIds : [],
        maxAttempts: rec.maxAttempts || DEFAULT_MAX_ATTEMPTS,
      }
    },
    [traineeId]
  )

  const getUsedBonusIds = useCallback(
    (testId) => {
      const { usedBonusIds } = getAttempts(testId)
      return usedBonusIds
    },
    [getAttempts]
  )

  const getRequiredScore = useCallback(
    (testId) => {
      if (!traineeId || testId === 'bonus_test') return PASSING_SCORE_ATTEMPT_1
      const { count } = getAttempts(testId)
      if (count >= 2) return PASSING_SCORE_ATTEMPT_3
      if (count === 1) return PASSING_SCORE_ATTEMPT_2
      return PASSING_SCORE_ATTEMPT_1
    },
    [traineeId, getAttempts]
  )

  const canTake = useCallback(
    (testId, { isPractice = false } = {}) => {
      if (!traineeId) return { allowed: false, reason: 'Not logged in', requiredScore: PASSING_SCORE_ATTEMPT_1, attempts: 0, maxAttempts: DEFAULT_MAX_ATTEMPTS }
      if (hydrating) return { allowed: false, reason: 'Checking your test history…', hydrating: true, attempts: 0, maxAttempts: DEFAULT_MAX_ATTEMPTS }
      if (testId === 'bonus_test') return { allowed: true, reason: 'Practice test - unlimited attempts', requiredScore: PASSING_SCORE_ATTEMPT_1, attempts: 0, maxAttempts: DEFAULT_MAX_ATTEMPTS }
      const { count, scores, passed, maxAttempts } = getAttempts(testId)
      if (passed) return { allowed: true, reason: 'Already passed - retaking for practice', attempts: count, maxAttempts }
      if (count >= maxAttempts) return { allowed: false, reason: `Maximum ${maxAttempts} attempts used. Ask your manager to request a reset.`, attempts: count, maxAttempts }
      return { allowed: true, requiredScore: getRequiredScore(testId), attempts: count, maxAttempts }
    },
    [traineeId, hydrating, getAttempts, getRequiredScore]
  )

  const recordAttempt = useCallback(
    (testId, score, passed, meta = {}) => {
      if (!traineeId) return
      const attempts = loadAttempts()
      const key = `${traineeId}_${testId}`
      const rec = attempts[key] || { count: 0, scores: [], passed: false, usedBonusIds: [], maxAttempts: DEFAULT_MAX_ATTEMPTS }
      rec.count = (rec.count || 0) + 1
      rec.scores = rec.scores || []
      rec.scores.push(score)
      if (passed) rec.passed = true
      if (meta.hintsUsed != null) rec.lastHintsUsed = meta.hintsUsed
      if (Array.isArray(meta.bonusQuestionIds) && meta.bonusQuestionIds.length > 0) {
        const existing = new Set(rec.usedBonusIds || [])
        meta.bonusQuestionIds.forEach((id) => existing.add(id))
        rec.usedBonusIds = [...existing]
      }
      attempts[key] = rec
      saveAttempts(attempts)
      // Persist to Firestore so lockout works cross-browser and trainers can see results
      saveTestResult(traineeId, testId, {
        count: rec.count,
        scores: rec.scores,
        passed: rec.passed,
        maxAttempts: rec.maxAttempts || DEFAULT_MAX_ATTEMPTS,
        usedBonusIds: rec.usedBonusIds || [],
      })
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
      hydrating,
      getAttempts,
      getUsedBonusIds,
      getRequiredScore,
      canTake,
      recordAttempt,
      getBestScore,
      isTestPassed,
      resetAttempts,
    }),
    [hydrating, getAttempts, getUsedBonusIds, getRequiredScore, canTake, recordAttempt, getBestScore, isTestPassed, resetAttempts]
  )
}
