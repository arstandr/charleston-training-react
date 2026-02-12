/**
 * Manager-initiated test attempt resets. Stored in Firestore so the trainee's
 * app can clear local attempts on next load.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'testAttemptResets'

/**
 * Request a reset of test attempts for a trainee. The trainee's app will clear
 * local attempts when it next loads and sees the reset.
 * @param {string} traineeId - trainee id (e.g. employee number or uid)
 * @param {string} testId - 'all' or a specific test id (e.g. 'bar_test')
 * @param {string} byEmpNum - manager/admin employee number
 */
export async function requestTestAttemptReset(traineeId, testId, byEmpNum) {
  if (!traineeId || !byEmpNum) return false
  try {
    const ref = doc(db, COLLECTION, String(traineeId))
    const snap = await getDoc(ref)
    const existing = (snap.exists() && snap.data()) || {}
    const resets = { ...(existing.resets || {}) }
    const at = serverTimestamp()
    const by = String(byEmpNum)
    if (testId === 'all') {
      const officialTestIds = getOfficialTestIds()
      officialTestIds.forEach((id) => {
        resets[id] = { at, by }
      })
    } else {
      resets[testId] = { at, by }
    }
    await setDoc(ref, { resets }, { merge: true })
    return true
  } catch (e) {
    console.warn('[testAttemptResets] request failed:', e?.message)
    return false
  }
}

/**
 * Fetch resets for a trainee (used by useTestAttempts to apply on load).
 * @param {string} traineeId
 * @returns {Promise<Record<string, { at: number, by: string }>>} testId -> { at (ms), by }
 */
export async function getTestAttemptResets(traineeId) {
  if (!traineeId) return {}
  try {
    const ref = doc(db, COLLECTION, String(traineeId))
    const snap = await getDoc(ref)
    const data = snap.exists() ? snap.data() : {}
    const resets = data.resets || {}
    const out = {}
    for (const [id, v] of Object.entries(resets)) {
      const at = v?.at?.toMillis?.() ?? v?.at ?? 0
      out[id] = { at, by: v?.by || '' }
    }
    return out
  } catch (e) {
    console.warn('[testAttemptResets] get failed:', e?.message)
    return {}
  }
}

import { QUIZ_DATABASE } from '../data/quizDatabase'

export function getOfficialTestIds() {
  return Object.keys(QUIZ_DATABASE || {}).filter((id) => id !== 'bonus_test')
}
