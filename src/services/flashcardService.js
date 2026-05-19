/**
 * Flashcard Service — all Firestore operations for the flashcards and flashcardSets collections.
 */
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  writeBatch, query, where, serverTimestamp, limit,
} from 'firebase/firestore'
import { db } from '../firebase'

// ---------------------------------------------------------------------------
// Flashcard Sets
// ---------------------------------------------------------------------------

/**
 * Get all flashcard sets. Returns [{ id, ...data }].
 */
export async function getAllFlashcardSets() {
  if (!db) return []
  const snap = await getDocs(query(collection(db, 'flashcardSets'), limit(200)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get all custom (user-created) flashcard sets.
 */
export async function getCustomFlashcardSets() {
  if (!db) return []
  const snap = await getDocs(query(collection(db, 'customFlashcardSets'), limit(200)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------

/**
 * Get all flashcards (any status). Returns [{ id, ...data }].
 */
export async function getAllFlashcards() {
  if (!db) return []
  const snap = await getDocs(query(collection(db, 'flashcards'), limit(2000)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get only active flashcards. Optionally filter by setId.
 */
export async function getActiveFlashcards(setId) {
  if (!db) return []
  const constraints = [where('status', '==', 'active')]
  if (setId) constraints.push(where('setId', '==', setId))
  const q = query(collection(db, 'flashcards'), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get flashcards by setId and status (e.g. verbal_cert + active).
 */
export async function getFlashcardsBySetAndStatus(setId, status = 'active') {
  if (!db) return []
  const q = query(
    collection(db, 'flashcards'),
    where('setId', '==', setId),
    where('status', '==', status),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Update fields on a single flashcard.
 */
export async function updateFlashcard(cardId, data) {
  if (!db) throw new Error('Database not available')
  return updateDoc(doc(db, 'flashcards', cardId), data)
}

/**
 * Create a new flashcard. Returns the DocumentReference.
 */
export async function createFlashcard(data) {
  if (!db) throw new Error('Database not available')
  return addDoc(collection(db, 'flashcards'), {
    ...data,
    createdAt: serverTimestamp(),
  })
}

/**
 * Permanently delete a flashcard.
 */
export async function deleteFlashcard(cardId) {
  if (!db) throw new Error('Database not available')
  return deleteDoc(doc(db, 'flashcards', cardId))
}

/**
 * Batch-update multiple flashcards with the same data (e.g. quarantine).
 * Splits into 500-doc batches per Firestore limit.
 */
export async function batchUpdateFlashcards(cardIds, data) {
  if (!db) throw new Error('Database not available')
  const chunks = []
  for (let i = 0; i < cardIds.length; i += 500) {
    chunks.push(cardIds.slice(i, i + 500))
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach((id) => batch.update(doc(db, 'flashcards', id), data))
    await batch.commit()
  }
}

// ---------------------------------------------------------------------------
// Quiz approval helpers
// ---------------------------------------------------------------------------

/**
 * Get active cards that are missing a quiz question (no quizData.q).
 * Firestore can't query missing fields, so we filter client-side.
 */
export async function getActiveCardsWithMissingQuiz(setId) {
  const active = await getActiveFlashcards(setId)
  return active.filter((c) => c.front && c.back && (!c.quizData || !c.quizData.q))
}

/**
 * Backward-compatible quiz approval check.
 * - undefined/null → true (existing cards are grandfathered in)
 * - explicit false → not approved
 * - true → approved
 */
export function isQuizApproved(card) {
  if (!card?.quizData?.q) return false // no question = nothing to approve
  return card.quizApproved !== false
}

/**
 * Batch-delete multiple flashcards.
 * Splits into 500-doc batches per Firestore limit.
 */
export async function batchDeleteFlashcards(cardIds) {
  if (!db) throw new Error('Database not available')
  const chunks = []
  for (let i = 0; i < cardIds.length; i += 500) {
    chunks.push(cardIds.slice(i, i + 500))
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach((id) => batch.delete(doc(db, 'flashcards', id)))
    await batch.commit()
  }
}
