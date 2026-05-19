/**
 * Chatbot Flags Service — all Firestore operations for the chatbotFlags collection.
 */
import { collection, query, limit, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Submit a new chatbot flag (trainee reporting a bad response).
 */
export async function submitChatbotFlag(flagData) {
  if (!db) throw new Error('Database not available')
  return addDoc(collection(db, 'chatbotFlags'), {
    ...flagData,
    flaggedAt: serverTimestamp(),
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    resolvedNote: null,
  })
}

/**
 * Subscribe to chatbot flags in real-time (most recent first, capped at 50).
 * Returns the unsubscribe function.
 */
export function subscribeChatbotFlags(callback) {
  if (!db) return () => {}
  const q = query(collection(db, 'chatbotFlags'), limit(50))
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    list.sort((a, b) => {
      const ta = a.flaggedAt?.toMillis?.() ?? a.flaggedAt ?? 0
      const tb = b.flaggedAt?.toMillis?.() ?? b.flaggedAt ?? 0
      return tb - ta
    })
    callback(list)
  }, (error) => {
    console.error('subscribeChatbotFlags error:', error)
  })
}

/** Subscribe to unresolved chatbot flag count (real-time). Returns unsubscribe fn. */
export function subscribeUnresolvedFlagCount(callback) {
  if (!db) return () => {}
  const q = query(collection(db, 'chatbotFlags'))
  return onSnapshot(q, (snap) => {
    const unresolved = snap.docs.filter((d) => !d.data().resolved).length
    callback(unresolved)
  }, (error) => {
    console.error('subscribeUnresolvedFlagCount error:', error?.message)
    callback(0)
  })
}

/**
 * Mark a chatbot flag as resolved, optionally with a corrected response and note.
 */
export async function resolveChatbotFlag(flagId, resolvedBy = 'manager', { correctedText, resolvedNote } = {}) {
  if (!db) throw new Error('Database not available')
  const update = {
    resolved: true,
    resolvedBy,
    resolvedAt: serverTimestamp(),
  }
  if (correctedText != null) update.correctedText = correctedText
  if (resolvedNote != null) update.resolvedNote = resolvedNote
  return updateDoc(doc(db, 'chatbotFlags', flagId), update)
}
