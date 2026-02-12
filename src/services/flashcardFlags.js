/**
 * Flashcard flags (inaccurate content reports) and quarantine.
 * Flags are stored in Firestore; quarantined card IDs = cardIds from pending flags.
 */

import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'flashcardFlags'

/**
 * Get all pending flags (status === 'pending'). Used for quarantine list and admin UI.
 */
export async function getPendingFlags() {
  const ref = collection(db, COLLECTION)
  const q = query(
    ref,
    where('status', '==', 'pending'),
    orderBy('reportedAt', 'desc'),
    limit(200)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get set of card IDs that are quarantined (have at least one pending flag).
 */
export async function getQuarantinedCardIds() {
  const flags = await getPendingFlags()
  const ids = new Set()
  flags.forEach((f) => {
    if (f.cardId) ids.add(f.cardId)
  })
  return ids
}

/**
 * Report a card as inaccurate. Adds a flag and the card is quarantined until admin dismisses/fixes.
 */
export async function reportCardInaccuracy({ setId, cardId, front, back, reason, reportedBy }) {
  await addDoc(collection(db, COLLECTION), {
    setId: setId || '',
    cardId: cardId || '',
    front: (front || '').slice(0, 500),
    back: (back || '').slice(0, 500),
    reason: (reason || 'Flagged as inaccurate').slice(0, 1000),
    reportedBy: reportedBy || '',
    reportedAt: new Date().toISOString(),
    status: 'pending',
  })
}

/**
 * Dismiss a flag (admin). Sets status to 'dismissed'.
 */
export async function dismissFlag(flagId) {
  await updateDoc(doc(db, COLLECTION, flagId), { status: 'dismissed' })
}

/**
 * Mark flag as fixed and restore card (admin). Sets status to 'fixed'.
 */
export async function fixAndRestoreFlag(flagId) {
  await updateDoc(doc(db, COLLECTION, flagId), { status: 'fixed' })
}
