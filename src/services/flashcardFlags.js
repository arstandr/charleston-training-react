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
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
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
 * Report a card as inaccurate. Adds a flag AND updates the card's status to
 * 'quarantined' so it is immediately excluded from getActiveFlashcards() queries
 * (which filter status === 'active'). This ensures quarantined cards are hidden
 * from quizzes AND flashcard study, not just flagged.
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
  // Also quarantine the card so it's immediately hidden from active queries
  if (cardId) {
    try {
      await updateDoc(doc(db, 'flashcards', cardId), { status: 'quarantined' })
    } catch (e) {
      console.warn('[flashcardFlags] Failed to quarantine card:', e?.message)
    }
  }
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

/**
 * Delete a flag document (admin). Use when dismissing or after deleting the card.
 */
export async function deleteFlag(flagId) {
  await deleteDoc(doc(db, COLLECTION, flagId))
}

/**
 * Report a quiz question as inaccurate (trainee report during quiz).
 * Creates a flag with quiz-specific fields and quarantines the underlying flashcard.
 */
export async function reportQuizQuestionInaccuracy({ cardId, front, back, quizQuestion, quizOptions, quizCorrectAnswer, selectedAnswer, reason, reportedBy }) {
  await addDoc(collection(db, COLLECTION), {
    cardId: cardId || '',
    front: (front || '').slice(0, 500),
    back: (back || '').slice(0, 500),
    quizQuestion: (quizQuestion || '').slice(0, 500),
    quizOptions: Array.isArray(quizOptions) ? quizOptions.map((o) => (o || '').slice(0, 300)) : [],
    quizCorrectAnswer: (quizCorrectAnswer || '').slice(0, 300),
    selectedAnswer: (selectedAnswer || '').slice(0, 300),
    reason: (reason || 'Flagged as inaccurate').slice(0, 1000),
    reportedBy: reportedBy || '',
    reportedAt: new Date().toISOString(),
    status: 'pending',
    flagType: 'quiz',
  })
  if (cardId) {
    try {
      await updateDoc(doc(db, 'flashcards', cardId), { status: 'quarantined' })
    } catch (e) {
      console.warn('[flashcardFlags] Failed to quarantine card:', e?.message)
    }
  }
}

/**
 * Flag a manager quiz question as bad/wrong (trainee report).
 * Shows up in admin flashcard flags with reason 'bad_question'.
 */
export async function flagManagerQuizQuestion({ cardId, flaggedBy, questionText, displayedAnswer }) {
  await addDoc(collection(db, COLLECTION), {
    cardId: cardId || '',
    flaggedBy: flaggedBy || '',
    reportedAt: new Date().toISOString(),
    reason: 'bad_question',
    questionText: (questionText || '').slice(0, 500),
    displayedAnswer: (displayedAnswer || '').slice(0, 1000),
    status: 'pending',
  })
}

/**
 * Report that quiz generation failed for a card. Creates a Content Alert
 * with reason 'quiz_generation_failed' so admins can retry or manually create.
 */
export async function reportQuizGenerationFailed({ cardId, front, back, setId }) {
  await addDoc(collection(db, COLLECTION), {
    cardId: cardId || '',
    setId: setId || '',
    front: (front || '').slice(0, 500),
    back: (back || '').slice(0, 500),
    reason: 'quiz_generation_failed',
    reportedBy: 'system',
    reportedAt: new Date().toISOString(),
    status: 'pending',
  })
}

/**
 * Get flags a specific trainee filed (reportQuizQuestionInaccuracy sets
 * `reportedBy` to currentUser?.name || traineeId — same fallback used here).
 * Lets the trainee see whether a question they flagged got fixed. No orderBy
 * in the query (avoids needing a composite index for a small per-user list);
 * sorted client-side instead.
 */
export async function getFlagsForUser(identifier) {
  if (!db || !identifier) return []
  const q = query(collection(db, COLLECTION), where('reportedBy', '==', identifier), limit(50))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.reportedAt || '').localeCompare(a.reportedAt || ''))
}

/** Subscribe to pending flashcard flag count (real-time). Returns unsubscribe fn. */
export function subscribePendingFlagCount(callback) {
  if (!db) return () => {}
  const q = query(collection(db, COLLECTION), where('status', '==', 'pending'))
  return onSnapshot(q, (snap) => callback(snap.size), (error) => {
    console.error('subscribePendingFlagCount error:', error?.message)
    callback(0)
  })
}
