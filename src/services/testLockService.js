import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

const LOCKS = 'testLocks'
const VIOLATIONS = 'testViolations'

// ── testLocks ──────────────────────────────────────────

/** Subscribe to a single user's lock doc. Returns unsubscribe fn. */
export function subscribeToLock(userId, callback) {
  if (!db || !userId) return () => {}
  return onSnapshot(doc(db, LOCKS, userId), (snap) => {
    callback(snap.exists() ? snap.data() : null)
  })
}

/** Subscribe to ALL lock docs (admin view). Returns unsubscribe fn. */
export function subscribeToAllLocks(callback) {
  if (!db) return () => {}
  return onSnapshot(collection(db, LOCKS), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  })
}

/** Read a single lock doc. */
export async function getTestLock(userId) {
  if (!db || !userId) return null
  const snap = await getDoc(doc(db, LOCKS, userId))
  return snap.exists() ? snap.data() : null
}

/** Create / overwrite the lock doc when a test starts. */
export async function createTestLock(userId, data) {
  if (!db || !userId) return
  await setDoc(doc(db, LOCKS, userId), {
    ...data,
    startedAt: serverTimestamp(),
    lastHeartbeat: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000)),
  })
}

/** Remove the lock doc (end test or manager unlock). */
export async function deleteTestLock(userId) {
  if (!db || !userId) return
  await deleteDoc(doc(db, LOCKS, userId))
}

/** Set the lockout fields on a lock doc. */
export async function triggerLockout(userId, reason) {
  if (!db || !userId) return
  const lockoutExpires = new Date(Date.now() + 60 * 60 * 1000)
  await updateDoc(doc(db, LOCKS, userId), {
    active: false,
    lockedOut: true,
    lockedOutAt: serverTimestamp(),
    lockoutExpiresAt: Timestamp.fromDate(lockoutExpires),
    lockoutReason: reason,
  })
}

/** Push a violation entry onto the lock doc. */
export async function updateTestLockViolations(userId, violations, violationCount) {
  if (!db || !userId) return
  await updateDoc(doc(db, LOCKS, userId), { violations, violationCount })
}

/** Send a heartbeat timestamp. */
export async function sendHeartbeat(userId) {
  if (!db || !userId) return
  await updateDoc(doc(db, LOCKS, userId), { lastHeartbeat: serverTimestamp() })
}

// ── testViolations ─────────────────────────────────────

/** Create an audit violation record. */
export async function createViolation(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, VIOLATIONS), {
    ...data,
    timestamp: serverTimestamp(),
  })
  return ref.id
}

/** Load recent violations (newest first). */
export async function getRecentViolations(maxResults = 50) {
  if (!db) return []
  const q = query(collection(db, VIOLATIONS), orderBy('timestamp', 'desc'), limit(maxResults))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Mark a violation as resolved. */
export async function resolveViolation(violationId, resolvedBy) {
  if (!db || !violationId) return
  await updateDoc(doc(db, VIOLATIONS, violationId), {
    resolved: true,
    resolvedBy,
    resolvedAt: serverTimestamp(),
  })
}

// ── activeTestSessions (legacy locks) ──────────────────

const LEGACY_SESSIONS = 'activeTestSessions'

/** Load all legacy active test sessions. */
export async function getAllActiveTestSessions() {
  if (!db) return []
  const snap = await getDocs(collection(db, LEGACY_SESSIONS))
  return snap.docs.map((d) => {
    const data = d.data()
    const startedAt = data.startedAt?.toMillis?.() ?? data.startedAt
    return {
      traineeId: d.id,
      testId: data.testId || '',
      startedAt: startedAt ? new Date(startedAt) : null,
    }
  })
}

/** Delete a legacy active test session (release lock). */
export async function deleteActiveTestSession(traineeId) {
  if (!db || !traineeId) return
  await deleteDoc(doc(db, LEGACY_SESSIONS, traineeId))
}
