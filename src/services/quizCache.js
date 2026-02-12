/**
 * Quiz cache - store and reuse AI-generated quiz questions in Firestore.
 * Cache key is derived from set id, count, and card content so the same set yields cached questions when unchanged.
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { generateQuizQuestions } from './ai'

const COLLECTION = 'quizCache'

function simpleHash(str) {
  let h = 0
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

/**
 * Get cache key for a flashcard set + count. Firestore doc IDs max 1500 bytes; we keep it short.
 */
function cacheKey(setId, count, cards) {
  const cardSig = (cards || [])
    .slice(0, 30)
    .map((c) => (c.front || '') + (c.back || ''))
    .join('|')
  const raw = setId + '_' + String(count) + '_' + cardSig.slice(0, 2000)
  return simpleHash(raw)
}

/**
 * Get cached quiz questions or generate and cache. Returns array of { q, opts, ans, exp }.
 */
export async function getOrGenerateQuizQuestions(setId, setTitle, cards, count = 5) {
  const key = cacheKey(setId, count, cards)
  const ref = doc(db, COLLECTION, key)
  const snap = await getDoc(ref)
  if (snap.exists() && snap.data().questions?.length) {
    return snap.data().questions
  }
  const questions = await generateQuizQuestions(setTitle, cards, count)
  if (questions.length > 0) {
    await setDoc(ref, {
      setId,
      setTitle,
      questions,
      count,
      createdAt: serverTimestamp(),
    })
  }
  return questions
}
