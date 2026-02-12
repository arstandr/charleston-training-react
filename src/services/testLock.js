/**
 * Test Integrity Lock: one active official test per trainee (one device at a time).
 * Uses Firestore activeTestSessions/{traineeId}. Locks block login from another device.
 * Locks expire after 2 hours (stale crash); managers can release manually.
 */
import { getDoc, setDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'activeTestSessions'
const LOCK_EXPIRY_MS = 2 * 60 * 60 * 1000 // 2 hours

const LOCK_BLOCK_MESSAGE = 'You have an official test in progress on another device. Please finish it there, or ask a manager to release your lock.'

/**
 * Pre-login guard: check if trainee is allowed to log in (no active lock, or stale lock cleared).
 * @param {string} traineeId - e.g. T-Westfield-7777
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
export async function checkTraineeLockForLogin(traineeId) {
  if (!traineeId) return { allowed: true }
  const ref = doc(db, COLLECTION, traineeId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return { allowed: true }
  const data = snap.data()
  const startedAt = data.startedAt?.toMillis?.() ?? data.startedAt ?? 0
  const now = Date.now()
  if (now - startedAt < LOCK_EXPIRY_MS) {
    return { allowed: false, reason: LOCK_BLOCK_MESSAGE }
  }
  try {
    await deleteDoc(ref)
  } catch (_) {}
  return { allowed: true }
}

/**
 * Acquire lock when starting an official test. Document ID = traineeId.
 * Do not render test UI until this succeeds.
 * @param {string} traineeId - e.g. T-Westfield-7777
 * @param {string} testId - quiz test id
 * @param {string} [deviceAgent] - optional user agent for debugging
 * @returns {Promise<{ acquired: boolean, reason?: string }>}
 */
export async function tryAcquireLock(traineeId, testId, deviceAgent) {
  if (!traineeId) return { acquired: false, reason: 'Not signed in as trainee.' }
  const ref = doc(db, COLLECTION, traineeId)
  const snap = await getDoc(ref)
  const now = Date.now()
  if (snap.exists()) {
    const data = snap.data()
    const startedAt = data.startedAt?.toMillis?.() ?? data.startedAt ?? 0
    if (now - startedAt < LOCK_EXPIRY_MS) {
      return {
        acquired: false,
        reason: LOCK_BLOCK_MESSAGE,
      }
    }
  }
  await setDoc(ref, {
    testId: testId || '',
    startedAt: serverTimestamp(),
    ...(deviceAgent != null && deviceAgent !== '' ? { deviceAgent: String(deviceAgent).slice(0, 500) } : {}),
  })
  return { acquired: true }
}

/**
 * Release the active test lock for this trainee (on submit or Exit Test).
 * @param {string} traineeId - e.g. T-Westfield-7777
 */
export async function releaseLock(traineeId) {
  if (!traineeId) return
  const ref = doc(db, COLLECTION, traineeId)
  try {
    await deleteDoc(ref)
  } catch (_) {}
}
