import {
  collection, doc, getDocs, addDoc, updateDoc,
  query, where, orderBy, limit,
} from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'shiftChecklists'

/** Load recent checklists for a trainee (most recent first, max 10). */
export async function getChecklistsForTrainee(traineeId) {
  if (!db || !traineeId) return []
  const q = query(
    collection(db, COLLECTION),
    where('traineeId', '==', traineeId),
    orderBy('createdAt', 'desc'),
    limit(10),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Create a new checklist and return { id, ...data }. */
export async function createChecklist(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, COLLECTION), data)
  return { id: ref.id, ...data }
}

/** Generic update — pass any fields to merge. */
export async function updateChecklist(checklistId, data) {
  if (!db) return
  await updateDoc(doc(db, COLLECTION, checklistId), data)
}

/** Toggle a single item's completed state and persist. */
export async function toggleChecklistItem(checklistId, items) {
  return updateChecklist(checklistId, {
    items,
    updatedAt: new Date().toISOString(),
  })
}

/** Update notes on an item (caller passes full items array). */
export async function updateChecklistNotes(checklistId, items) {
  return updateChecklist(checklistId, {
    items,
    updatedAt: new Date().toISOString(),
  })
}

/** Mark checklist as completed (trainee requests signoff). */
export async function requestChecklistSignoff(checklistId) {
  return updateChecklist(checklistId, {
    status: 'completed',
    updatedAt: new Date().toISOString(),
  })
}

/** Manager signs off on a checklist. */
export async function managerSignoffChecklist(checklistId, managerId, managerName) {
  return updateChecklist(checklistId, {
    status: 'signed-off',
    managerSignoff: {
      managerId,
      name: managerName,
      timestamp: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  })
}
