/**
 * Verbal Cert Practice Service
 * Firestore collection: verbalCertPractice/{traineeId}
 * Tracks self-study scores for certification preparation.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const READINESS_THRESHOLD = 70 // % needed to be considered "ready"

/**
 * Get the trainee's verbal cert practice data.
 * @param {string} traineeId
 * @returns {Promise<{scores, bestTotal, attempts, lastAttemptAt, readyForCert}|null>}
 */
export async function getVerbalCertPractice(traineeId) {
  if (!traineeId || !db) return null
  try {
    const snap = await getDoc(doc(db, 'verbalCertPractice', traineeId))
    return snap.exists() ? snap.data() : null
  } catch (e) {
    console.error('getVerbalCertPractice:', e)
    return null
  }
}

/**
 * Save the trainee's verbal cert practice scores.
 * @param {string} traineeId
 * @param {{ phase1Reviewed: boolean, phase2: number, phase3: number, phase4: number, phase5: number }} scores
 * @param {number} totalPct - total percentage score
 */
export async function saveVerbalCertPractice(traineeId, scores, totalPct) {
  if (!traineeId || !db) return
  try {
    const existing = await getVerbalCertPractice(traineeId)
    const attempts = (existing?.attempts || 0) + 1
    const bestTotal = Math.max(existing?.bestTotal || 0, totalPct)
    const readyForCert = bestTotal >= READINESS_THRESHOLD

    await setDoc(doc(db, 'verbalCertPractice', traineeId), {
      scores,
      bestTotal,
      attempts,
      lastAttemptAt: new Date().toISOString(),
      readyForCert,
    })
  } catch (e) {
    console.error('saveVerbalCertPractice:', e)
  }
}

export { READINESS_THRESHOLD }
