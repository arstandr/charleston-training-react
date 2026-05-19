/**
 * Training Shifts Service — all Firestore operations for the trainingShifts collection.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Load a single shift by ID. Returns { id, ...data } or null.
 */
export async function getShift(shiftId) {
  if (!db || !shiftId) return null
  const snap = await getDoc(doc(db, 'trainingShifts', shiftId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Update fields on a shift document.
 */
export async function updateShift(shiftId, data) {
  if (!db) throw new Error('Database not available')
  return updateDoc(doc(db, 'trainingShifts', shiftId), data)
}

/**
 * List shifts for a user (trainer or trainee), ordered by scheduledDate desc.
 */
export async function getShiftsForUser(userId, isTrainer, maxResults = 50) {
  if (!db || !userId) return []
  const field = isTrainer ? 'trainerId' : 'traineeId'
  const q = query(
    collection(db, 'trainingShifts'),
    where(field, '==', userId),
    orderBy('scheduledDate', 'desc'),
    limit(maxResults),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Find the most recent shift for a trainee with a specific shiftType.
 * Uses a two-query fallback pattern (composite index may not exist).
 * Returns the Firestore doc snapshot or null.
 */
export async function findRecentShiftByType(traineeId, shiftType) {
  if (!db || !traineeId || !shiftType) return null
  // Attempt 1: composite index query
  try {
    const q1 = query(
      collection(db, 'trainingShifts'),
      where('traineeId', '==', traineeId),
      where('shiftType', '==', shiftType),
      orderBy('scheduledDate', 'desc'),
      limit(1),
    )
    const snap1 = await getDocs(q1)
    if (!snap1.empty) return snap1.docs[0]
  } catch (_) { /* composite index may be missing */ }
  // Attempt 2: broader query filtered in memory
  try {
    const q2 = query(
      collection(db, 'trainingShifts'),
      where('traineeId', '==', traineeId),
      orderBy('scheduledDate', 'desc'),
      limit(10),
    )
    const snap2 = await getDocs(q2)
    return snap2.docs.find((d) => d.data().shiftType === shiftType) || null
  } catch (_) { /* both attempts failed */ }
  return null
}

/**
 * Approve a trainer's claim on a shift.
 */
export async function approveTrainerClaim(shiftId, trainerUid, approvedBy) {
  if (!db) throw new Error('Database not available')
  return updateDoc(doc(db, 'trainingShifts', shiftId), {
    trainerId: trainerUid,
    trainerClaimStatus: 'approved',
    trainerApprovedAt: serverTimestamp(),
    trainerApprovedBy: approvedBy,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Create a new shift document with an auto-generated ID.
 * Returns the DocumentReference.
 */
export async function createShift(data) {
  if (!db) throw new Error('Database not available')
  const ref = doc(collection(db, 'trainingShifts'))
  await setDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
  })
  return ref
}
