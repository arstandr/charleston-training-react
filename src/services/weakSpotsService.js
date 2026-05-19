/**
 * Weak Spots (spaced repetition) - Firestore collection weakSpots.
 * Connects practice test misses and flashcard "need practice" for review.
 */
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db } from '../firebase'

const CONSECUTIVE_CORRECT_TO_MASTER = 3
const WEAK_SPOTS_FOR_PRACTICE = 5
const WEAK_SPOTS_FOR_FLASHCARDS = 5

/**
 * Add a weak spot (missed question or flashcard "need practice").
 * @param {string} userId - Firebase Auth uid
 * @param {object} data - { questionText, correctAnswer, wrongAnswer?, setId, source: 'flashcard'|'practiceTest', opts?, ans? }
 */
export async function addWeakSpot(userId, data) {
  if (!userId || !db) return null
  const now = Date.now()
  const docData = {
    userId,
    questionText: data.questionText || '',
    correctAnswer: data.correctAnswer || '',
    wrongAnswer: data.wrongAnswer ?? '',
    setId: data.setId || '',
    source: data.source === 'flashcard' ? 'flashcard' : 'practiceTest',
    missedAt: now,
    reviewCount: 0,
    consecutiveCorrect: 0,
    lastReviewed: now,
    mastered: false,
  }
  if (data.source === 'practiceTest' && Array.isArray(data.opts) && typeof data.ans === 'number') {
    docData.opts = data.opts
    docData.ans = data.ans
    if (data.exp != null) docData.exp = data.exp
  }
  try {
    const ref = await addDoc(collection(db, 'weakSpots'), docData)
    return ref.id
  } catch (e) {
    console.error('addWeakSpot:', e)
    return null
  }
}

/**
 * Fetch weak spots for mixing into a practice test (least recently reviewed first).
 * @param {string} userId
 * @param {string} setId - optional; if provided filter by setId
 * @param {number} maxCount
 * @returns {Promise<Array<{ id: string, ...data }>>}
 */
export async function getWeakSpotsForPracticeTest(userId, setId, maxCount = WEAK_SPOTS_FOR_PRACTICE) {
  if (!userId || !db) return []
  try {
    const q = query(
      collection(db, 'weakSpots'),
      where('userId', '==', userId),
      where('mastered', '==', false),
      where('source', '==', 'practiceTest'),
      orderBy('lastReviewed', 'asc'),
      limit(20)
    )
    const snap = await getDocs(q)
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    if (setId) list = list.filter((w) => w.setId === setId)
    return list.slice(0, maxCount)
  } catch (e) {
    console.error('getWeakSpotsForPracticeTest:', e)
    return []
  }
}

/**
 * Record a review (correct/incorrect). Updates reviewCount, lastReviewed, consecutiveCorrect, mastered.
 * @param {string} weakSpotId
 * @param {boolean} correct
 */
export async function recordWeakSpotReview(weakSpotId, correct) {
  if (!weakSpotId || !db) return
  try {
    const ref = doc(db, 'weakSpots', weakSpotId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const d = snap.data()
    const reviewCount = (d.reviewCount || 0) + 1
    const consecutiveCorrect = correct ? (d.consecutiveCorrect || 0) + 1 : 0
    const mastered = consecutiveCorrect >= CONSECUTIVE_CORRECT_TO_MASTER
    await updateDoc(ref, {
      reviewCount,
      consecutiveCorrect,
      lastReviewed: Date.now(),
      mastered: d.mastered || mastered,
    })
  } catch (e) {
    console.error('recordWeakSpotReview:', e)
  }
}

/**
 * Convert a weak spot doc (from practice test) to quiz question shape { q, opts, ans, exp, weakSpotId }.
 */
export function weakSpotToQuizQuestion(ws) {
  if (!ws) return null
  if (Array.isArray(ws.opts) && typeof ws.ans === 'number') {
    return {
      q: ws.questionText,
      opts: [...ws.opts],
      ans: ws.ans,
      exp: ws.exp || '',
      weakSpotId: ws.id,
    }
  }
  return {
    q: ws.questionText,
    opts: [ws.correctAnswer, ws.wrongAnswer].filter(Boolean).length
      ? [ws.correctAnswer, ws.wrongAnswer, "I'm not sure"].slice(0, 3)
      : [ws.correctAnswer, "I'm not sure"],
    ans: 0,
    exp: '',
    weakSpotId: ws.id,
  }
}

/**
 * Get weak spots from practice tests to show as temporary flashcards (front = question, back = answer).
 * @param {string} userId
 * @returns {Promise<Array<{ weakSpotId: string, front: string, back: string }>>}
 */
export async function getWeakSpotsAsTempFlashcards(userId) {
  if (!userId || !db) return []
  try {
    const q = query(
      collection(db, 'weakSpots'),
      where('userId', '==', userId),
      where('mastered', '==', false),
      where('source', '==', 'practiceTest'),
      orderBy('lastReviewed', 'asc'),
      limit(WEAK_SPOTS_FOR_FLASHCARDS)
    )
    const snap = await getDocs(q)
    const list = []
    snap.docs.forEach((d) => {
      const data = d.data()
      list.push({
        weakSpotId: d.id,
        front: data.questionText || 'Question',
        back: data.correctAnswer || 'Answer',
      })
    })
    return list
  } catch (e) {
    console.error('getWeakSpotsAsTempFlashcards:', e)
    return []
  }
}
