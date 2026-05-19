import {
  collection, query, where, orderBy, limit, getDocs, addDoc,
  doc, setDoc, getDoc, deleteField,
} from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'quizAttempts'
const RESULTS_COLLECTION = 'testResults'
const REVIEWS_COLLECTION = 'testReviews'

/** Load quiz attempts for a user (most recent first). */
export async function getAttemptsForUser(userId, maxResults = 500) {
  if (!db || !userId) return []
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    orderBy('timestamp', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Log a single quiz attempt. */
export async function createQuizAttempt(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, COLLECTION), data)
  return ref.id
}

/** Persist aggregate test result to Firestore (called after each official test). */
export async function saveTestResult(traineeId, testId, resultData) {
  if (!db || !traineeId || !testId) return
  try {
    const ref = doc(db, RESULTS_COLLECTION, String(traineeId))
    await setDoc(ref, { [testId]: resultData, updatedAt: new Date().toISOString() }, { merge: true })
  } catch (e) {
    console.warn('[saveTestResult] Failed:', e?.message)
  }
}

/** Reset a test result in Firestore: bump maxAttempts by 1 (giving trainee 1 retake). 'all' resets every test. */
export async function resetTestResult(traineeId, testId, officialTestIds = []) {
  if (!db || !traineeId) return
  try {
    const ref = doc(db, RESULTS_COLLECTION, String(traineeId))
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const data = snap.data()
    const update = {}
    const ids = testId === 'all'
      ? (officialTestIds.length ? officialTestIds : Object.keys(data).filter((k) => k !== 'updatedAt'))
      : [testId]
    for (const id of ids) {
      if (data[id]) {
        const count = data[id].count || 0
        const currentMax = data[id].maxAttempts || 2
        // Bump maxAttempts to count+1 so they get exactly 1 more try
        update[id] = { ...data[id], maxAttempts: Math.max(currentMax, count) + 1, passed: false }
      }
    }
    if (Object.keys(update).length) {
      update.updatedAt = new Date().toISOString()
      await setDoc(ref, update, { merge: true })
    }
  } catch (e) {
    console.warn('[resetTestResult] Failed:', e?.message)
  }
}

/** Get the most recent test session for a trainee + test.
 *  Returns array of attempt docs for the most recent session, or null if none found.
 *  Sessions with questionText (detailed review data) are preferred but not required. */
export async function getFailedTestSession(traineeId, testId) {
  if (!db || !traineeId || !testId) return null

  async function queryAndGroup(field, value) {
    const q = query(
      collection(db, COLLECTION),
      where(field, '==', String(value)),
      where('quizId', '==', testId),
      orderBy('timestamp', 'desc'),
      limit(200),
    )
    const snap = await getDocs(q)
    if (snap.empty) return null

    // Group by quizSessionId; docs without one form a single legacy group
    const sessions = {}
    const legacyDocs = []
    snap.docs.forEach((d) => {
      const data = { id: d.id, ...d.data() }
      const sid = data.quizSessionId
      if (!sid) {
        legacyDocs.push(data)
        return
      }
      if (!sessions[sid]) sessions[sid] = []
      sessions[sid].push(data)
    })

    const sessionList = Object.values(sessions)
    // Legacy docs (no quizSessionId) form their own group so they aren't silently dropped
    if (legacyDocs.length > 0) sessionList.push(legacyDocs)
    if (!sessionList.length) return null

    // Prefer most-recent session with full question detail; fall back to first session
    const withDetail = sessionList.find((attempts) => attempts.some((a) => a.questionText != null))
    return withDetail || sessionList[0]
  }

  try {
    // Primary: query by userId (canonical trainee ID stored at save time)
    const result = await queryAndGroup('userId', traineeId)
    if (result) return result

    // Fallback: query by traineeId field (handles uid vs traineeId mismatch edge case)
    return await queryAndGroup('traineeId', traineeId)
  } catch (e) {
    console.warn('[getFailedTestSession] Failed:', e?.message)
    return null
  }
}

/**
 * Save a full official test session to testReviews for manager review.
 * Called directly at test-end — does NOT go through useQuizAttempts hook.
 * Each attempt is its own document so all attempts are reviewable.
 */
export async function saveTestReview(traineeId, testId, { score, passed, timestamp, attemptNumber, questions }) {
  if (!db || !traineeId || !testId || !Array.isArray(questions) || !questions.length) return
  try {
    await addDoc(collection(db, REVIEWS_COLLECTION), {
      traineeId: String(traineeId),
      testId,
      score,
      passed: !!passed,
      timestamp: timestamp || new Date().toISOString(),
      attemptNumber: attemptNumber || 1,
      questions,
    })
  } catch (e) {
    console.error('[saveTestReview] Failed:', e?.message)
  }
}

/**
 * Get the most recent test review session for a trainee + test.
 * Returns { score, passed, timestamp, questions[] } or null.
 */
export async function getTestReview(traineeId, testId) {
  if (!db || !traineeId || !testId) return null
  try {
    const makeQ = (tid) => query(
      collection(db, REVIEWS_COLLECTION),
      where('traineeId', '==', String(tid)),
      where('testId', '==', testId),
      orderBy('timestamp', 'desc'),
      limit(5),
    )
    const snap = await getDocs(makeQ(traineeId))
    if (!snap.empty) {
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }
    // Fallback: if canonical ID "T-Store-123" returned nothing, try bare "123"
    const parts = String(traineeId).split('-')
    if (parts.length === 3 && parts[0] === 'T') {
      const bareId = parts[2]
      const snap2 = await getDocs(makeQ(bareId))
      if (!snap2.empty) {
        return snap2.docs.map((d) => ({ id: d.id, ...d.data() }))
      }
    }
    return null
  } catch (e) {
    console.warn('[getTestReview] Failed:', e?.message)
    return null
  }
}

/** Load all test results for a trainee from Firestore. Returns { testId: { count, scores, passed } }
 *  For canonical IDs like "T-Store-123", also checks the bare "123" doc and merges both.
 *  This handles the case where some tests were saved under a ghost bare-ID before cleanup. */
export async function loadTestResults(traineeId) {
  if (!db || !traineeId) return {}
  try {
    const ref = doc(db, RESULTS_COLLECTION, String(traineeId))
    const snap = await getDoc(ref)
    const canonical = snap.exists() ? snap.data() : null

    // For canonical "T-Store-123" IDs, also load the bare "123" doc and merge
    const parts = String(traineeId).split('-')
    let bare = null
    if (parts.length === 3 && parts[0] === 'T') {
      const bareId = parts[2]
      const bareRef = doc(db, RESULTS_COLLECTION, bareId)
      const bareSnap = await getDoc(bareRef)
      if (bareSnap.exists()) bare = bareSnap.data()
    }

    if (!canonical && !bare) return {}

    // Merge: canonical takes precedence over bare for any shared test key
    const merged = { ...(bare || {}) }
    delete merged.updatedAt
    for (const [k, v] of Object.entries(canonical || {})) {
      if (k === 'updatedAt') continue
      if (!merged[k]) {
        merged[k] = v
      } else {
        // Both have it — prefer passed=true, higher count, combined scores
        const b = merged[k]
        const existScores = b.scores || []
        const newScores = v.scores || []
        const allScores = [...existScores]
        for (const s of newScores) { if (!allScores.includes(s)) allScores.push(s) }
        merged[k] = {
          ...b, ...v,
          passed: b.passed || v.passed,
          count: Math.max(b.count || 0, v.count || 0),
          scores: allScores,
        }
      }
    }
    return merged
  } catch (e) {
    console.warn('[loadTestResults] Failed:', e?.message)
    return {}
  }
}
