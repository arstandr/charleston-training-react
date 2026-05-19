/**
 * Post-Shift Knowledge Check Service
 * Creates a prompt after trainer sign-off for the trainee to take a practice quiz.
 * Firestore collection: postShiftChecks/{docId}
 */
import { collection, addDoc, getDocs, query, where, updateDoc, doc, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Create a pending post-shift check after trainer signs off a shift.
 * @param {string} traineeId
 * @param {string} shiftKey - e.g. 'follow', 'rev1'
 * @returns {Promise<string|null>} docId
 */
export async function createPostShiftCheck(traineeId, shiftKey) {
  if (!traineeId || !shiftKey || !db) return null
  try {
    const ref = await addDoc(collection(db, 'postShiftChecks'), {
      traineeId,
      shiftKey,
      createdAt: new Date().toISOString(),
      completedAt: null,
    })
    return ref.id
  } catch (e) {
    console.error('createPostShiftCheck:', e)
    return null
  }
}

/**
 * Get all pending (uncompleted) post-shift checks for a trainee.
 * @param {string} traineeId
 * @returns {Promise<Array<{id, shiftKey, createdAt}>>}
 */
export async function getPendingChecks(traineeId) {
  if (!traineeId || !db) return []
  try {
    const q = query(
      collection(db, 'postShiftChecks'),
      where('traineeId', '==', traineeId),
      where('completedAt', '==', null),
      orderBy('createdAt', 'desc')
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.error('getPendingChecks:', e)
    return []
  }
}

/**
 * Mark a post-shift check as completed.
 * @param {string} docId
 */
export async function completePostShiftCheck(docId) {
  if (!docId || !db) return
  try {
    await updateDoc(doc(db, 'postShiftChecks', docId), {
      completedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('completePostShiftCheck:', e)
  }
}
