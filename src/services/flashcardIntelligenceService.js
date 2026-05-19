/**
 * Flashcard Intelligence Service - 100% Firestore (no localStorage).
 * Mastery, progress, session, analytics. Modular Firestore API only.
 */
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  startAt,
  endAt,
  documentId,
  deleteDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { stableCardId } from '../utils/helpers'

let _deckCacheVersion = 1
let _deckCache = {}
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// MASTERY (Firestore: flashcardMastery/{userId}_{cardId})
// ---------------------------------------------------------------------------

export async function getFlashcardMastery(userId, cardId) {
  if (!userId || !cardId) return { status: null, struggleCount: 0, masteryCount: 0, lastSeen: 0 }
  if (!db) return { status: null, struggleCount: 0, masteryCount: 0, lastSeen: 0 }
  try {
    const docId = `${userId}_${cardId}`
    const ref = doc(db, 'flashcardMastery', docId)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const d = snap.data()
      return {
        status: d.status || null,
        struggleCount: d.struggleCount || 0,
        masteryCount: d.masteryCount || 0,
        lastSeen: d.lastSeen || 0,
      }
    }
    return { status: null, struggleCount: 0, masteryCount: 0, lastSeen: 0 }
  } catch (e) {
    console.error('getFlashcardMastery:', e)
    return { status: null, struggleCount: 0, masteryCount: 0, lastSeen: 0 }
  }
}

export async function recordFlashcardMastery(userId, cardId, result) {
  if (!userId || !cardId || !db) return
  try {
    const current = await getFlashcardMastery(userId, cardId)
    const updated = {
      ...current,
      lastSeen: Date.now(),
      updatedAt: new Date().toISOString(),
    }
    if (result === 'needsPractice' || result === 'struggle') {
      updated.status = 'struggle'
      updated.struggleCount = (current.struggleCount || 0) + 1
    } else if (result === 'gotIt' || result === 'mastered') {
      updated.masteryCount = (current.masteryCount || 0) + 1
      if (updated.masteryCount > 2) updated.status = 'mastered'
    }
    const docId = `${userId}_${cardId}`
    await setDoc(doc(db, 'flashcardMastery', docId), updated)
    bumpDeckCache()
  } catch (e) {
    console.error('recordFlashcardMastery:', e)
  }
}

export async function getAllMasteryForUser(userId) {
  if (!userId || !db) return []
  try {
    const ref = collection(db, 'flashcardMastery')
    const q = query(
      ref,
      orderBy(documentId()),
      startAt(`${userId}_`),
      endAt(`${userId}_\uf8ff`)
    )
    const snap = await getDocs(q)
    const records = []
    snap.forEach((d) => {
      const cardId = d.id.slice(`${userId}_`.length)
      records.push({ cardId, ...d.data() })
    })
    return records
  } catch (e) {
    console.error('getAllMasteryForUser:', e)
    return []
  }
}

export async function getStruggleTopicIdsFromMastery(userId) {
  const records = await getAllMasteryForUser(userId)
  const bySet = {}
  records.forEach((r) => {
    if (r.status === 'struggle') {
      const setId = (r.cardId || '').includes('_') ? (r.cardId || '').split('_')[0] : r.cardId
      if (setId) bySet[setId] = (bySet[setId] || 0) + 1
    }
  })
  return Object.keys(bySet)
}

export async function getMasteredTopicIdsFromMastery(userId) {
  const records = await getAllMasteryForUser(userId)
  const bySet = {}
  records.forEach((r) => {
    if (r.status === 'mastered') {
      const setId = (r.cardId || '').includes('_') ? (r.cardId || '').split('_')[0] : r.cardId
      if (setId) bySet[setId] = (bySet[setId] || 0) + 1
    }
  })
  return Object.keys(bySet)
}

// ---------------------------------------------------------------------------
// PROGRESS (Firestore: flashcardProgress/{userId}/cards/{cardId})
// ---------------------------------------------------------------------------

function progressRef(userId, cardId) {
  if (!cardId) return null
  return doc(db, 'flashcardProgress', userId, 'cards', cardId)
}

export async function getFlashcardProgress(userId, cardId) {
  if (!userId || !cardId || !db) {
    return { gotItCount: 0, needsPracticeCount: 0, lastSeenAt: 0, lastResult: null, leitnerBox: 1, lastReviewedSession: 0, consecutiveCorrect: 0 }
  }
  try {
    const ref = progressRef(userId, cardId)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const d = snap.data()
      return {
        gotItCount: d.gotItCount || 0,
        needsPracticeCount: d.needsPracticeCount || 0,
        lastSeenAt: d.lastSeenAt || 0,
        lastResult: d.lastResult || null,
        leitnerBox: d.leitnerBox ?? 1,
        lastReviewedSession: d.lastReviewedSession ?? 0,
        consecutiveCorrect: d.consecutiveCorrect ?? 0,
      }
    }
    return { gotItCount: 0, needsPracticeCount: 0, lastSeenAt: 0, lastResult: null, leitnerBox: 1, lastReviewedSession: 0, consecutiveCorrect: 0 }
  } catch (e) {
    console.error('getFlashcardProgress:', e)
    return { gotItCount: 0, needsPracticeCount: 0, lastSeenAt: 0, lastResult: null, leitnerBox: 1, lastReviewedSession: 0, consecutiveCorrect: 0 }
  }
}

const BOX_INTERVALS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 }

/**
 * Leitner: updates a card's box after a review.
 * @param {string} result - 'gotIt' or 'needsPractice'
 * @param {object} cardProgress - Current progress data
 * @param {number} currentSession - Current session number
 * @returns {object} Updated progress fields
 */
export function updateCardBox(result, cardProgress, currentSession) {
  const currentBox = cardProgress?.leitnerBox ?? 1
  const consecutive = cardProgress?.consecutiveCorrect ?? 0

  if (result === 'gotIt') {
    return {
      leitnerBox: Math.min(currentBox + 1, 5),
      consecutiveCorrect: consecutive + 1,
      lastReviewedSession: currentSession,
      lastResult: 'gotIt',
      gotItCount: (cardProgress?.gotItCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    }
  }
  return {
    leitnerBox: 1,
    consecutiveCorrect: 0,
    lastReviewedSession: currentSession,
    lastResult: 'needsPractice',
    needsPracticeCount: (cardProgress?.needsPracticeCount || 0) + 1,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Determines which cards are due for review (Leitner).
 * @param {Array} cards - Cards with progress (leitnerBox, lastReviewedSession)
 * @param {number} currentSession - Current session number
 * @returns {Array} Due cards sorted by box (Box 1 first)
 */
export function getCardsForSession(cards, currentSession) {
  const due = []
  for (const card of cards || []) {
    const box = card.leitnerBox ?? 1
    const lastSession = card.lastReviewedSession ?? 0
    const interval = BOX_INTERVALS[box] ?? 1
    const sessionsSinceLast = currentSession - lastSession
    if (sessionsSinceLast >= interval) {
      due.push({ ...card, priority: box })
    }
  }
  due.sort((a, b) => a.priority - b.priority)
  return due
}

/**
 * Gets and increments session count for user+set.
 * Store: flashcardSessions/{userId}/setCounts/{setId}
 */
export async function getAndIncrementSession(db, userId, setId) {
  if (!db || !userId || !setId) return 1
  try {
    const { doc, getDoc, setDoc } = await import('firebase/firestore')
    const ref = doc(db, 'flashcardSessions', userId, 'setCounts', setId)
    const snap = await getDoc(ref)
    const current = snap.exists() ? (snap.data().sessionCount || 0) : 0
    const next = current + 1
    await setDoc(ref, { sessionCount: next, updatedAt: new Date().toISOString() }, { merge: true })
    return next
  } catch (e) {
    console.error('getAndIncrementSession:', e)
    return 1
  }
}

export async function recordFlashcardFeedback(userId, cardId, result, currentSession = null) {
  if (!userId || !cardId || !db) return
  try {
    const current = await getFlashcardProgress(userId, cardId)
    const leitnerUpdates = currentSession != null ? updateCardBox(result, current, currentSession) : {}
    const updated = {
      gotItCount: current.gotItCount || 0,
      needsPracticeCount: current.needsPracticeCount || 0,
      lastSeenAt: Date.now(),
      lastResult: result,
      updatedAt: new Date().toISOString(),
      ...leitnerUpdates,
    }
    if (result === 'gotIt' && !leitnerUpdates.gotItCount) updated.gotItCount += 1
    else if (result === 'needsPractice' && !leitnerUpdates.needsPracticeCount) updated.needsPracticeCount += 1
    await setDoc(progressRef(userId, cardId), updated)
  } catch (e) {
    console.error('recordFlashcardFeedback:', e)
  }
}

export async function getAllProgressForUser(userId) {
  if (!userId || !db) return []
  try {
    const ref = collection(db, 'flashcardProgress', userId, 'cards')
    const snap = await getDocs(ref)
    const records = []
    snap.forEach((d) => records.push({ cardId: d.id, ...d.data() }))
    return records
  } catch (e) {
    console.error('getAllProgressForUser:', e)
    return []
  }
}

export async function getStruggleTopicIds(userId) {
  const records = await getAllProgressForUser(userId)
  const bySet = {}
  records.forEach((r) => {
    if ((r.needsPracticeCount || 0) > 0 || r.lastResult === 'needsPractice') {
      const setId = (r.cardId || '').includes('_') ? (r.cardId || '').split('_')[0] : r.cardId
      if (setId) bySet[setId] = (bySet[setId] || 0) + 1
    }
  })
  return Object.keys(bySet)
}

export async function getStrongTopicIds(userId) {
  const records = await getAllProgressForUser(userId)
  const bySet = {}
  records.forEach((r) => {
    const gotIt = r.gotItCount || 0
    const needs = r.needsPracticeCount || 0
    if (gotIt >= 3 && gotIt > needs) {
      const setId = (r.cardId || '').includes('_') ? (r.cardId || '').split('_')[0] : r.cardId
      if (setId) bySet[setId] = (bySet[setId] || 0) + 1
    }
  })
  return Object.keys(bySet)
}

// ---------------------------------------------------------------------------
// CARD WEIGHT
// ---------------------------------------------------------------------------

export async function getFlashcardWeight(userId, cardId) {
  const p = await getFlashcardProgress(userId, cardId)
  const needsPractice = (p.needsPracticeCount || 0) * 10
  const daysSinceSeen = (Date.now() - (p.lastSeenAt || 0)) / (24 * 60 * 60 * 1000)
  const recency = Math.min(14, Math.floor(daysSinceSeen)) * 2
  const lowGotIt = Math.max(0, 5 - (p.gotItCount || 0))
  return needsPractice + recency + lowGotIt
}

// ---------------------------------------------------------------------------
// STUDY DECK (uses mastery + progress; accepts quarantinedCardIds Set)
// ---------------------------------------------------------------------------

export function filterQuarantinedCards(deck, quarantinedSet) {
  if (!quarantinedSet || !quarantinedSet.size) return deck || []
  return (deck || []).filter((entry) => !quarantinedSet.has(entry.cardId))
}

export async function buildStudyDeck(setId, flashcards, userId, focusModeOnly = false, quarantinedCardIds = new Set(), useLeitner = true) {
  if (!userId || !db) {
    const cards = (flashcards || []).map((card) => ({ card, cardId: stableCardId(setId, card) }))
    const filtered = filterQuarantinedCards(cards, quarantinedCardIds)
    return useLeitner ? { deck: filtered, sessionNumber: 1, allCaughtUp: false } : filtered
  }

  const [masteryRecords, progressRecords] = await Promise.all([
    getAllMasteryForUser(userId),
    getAllProgressForUser(userId),
  ])
  const masteryByCard = {}
  masteryRecords.forEach((r) => { masteryByCard[r.cardId] = r })
  const progressByCard = {}
  progressRecords.forEach((r) => { progressByCard[r.cardId] = r })

  const withIds = (flashcards || []).map((card) => ({ card, cardId: stableCardId(setId, card) }))
  const filtered = withIds.filter((e) => !quarantinedCardIds.has(e.cardId))

  if (useLeitner) {
    const sessionNumber = await getAndIncrementSession(db, userId, setId)
    const withProgress = filtered.map((e) => {
      const p = progressByCard[e.cardId] || {}
      return {
        ...e,
        leitnerBox: p.leitnerBox ?? 1,
        lastReviewedSession: p.lastReviewedSession ?? 0,
        consecutiveCorrect: p.consecutiveCorrect ?? 0,
      }
    })
    const due = getCardsForSession(withProgress, sessionNumber)
    const deck = due.map((e) => ({ card: e.card, cardId: e.cardId, leitnerBox: e.leitnerBox ?? 1 }))
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]]
    }
    return { deck, sessionNumber, allCaughtUp: deck.length === 0 }
  }

  const cacheKey = `${userId}|${setId}|${focusModeOnly ? '1' : '0'}|${_deckCacheVersion}|${(flashcards || []).length}`
  if (_deckCache[cacheKey]?.length) return _deckCache[cacheKey].map((e) => ({ ...e }))

  const struggle = []
  const rest = []
  for (const entry of filtered) {
    const m = masteryByCard[entry.cardId] || {}
    const p = progressByCard[entry.cardId] || {}
    const isStruggle = m.status === 'struggle' || (p.needsPracticeCount || 0) > 0 || p.lastResult === 'needsPractice'
    if (isStruggle) struggle.push(entry)
    else rest.push(entry)
  }

  const weight = (entry) => {
    const p = progressByCard[entry.cardId] || {}
    const needs = (p.needsPracticeCount || 0) * 10
    const days = (Date.now() - (p.lastSeenAt || 0)) / (24 * 60 * 60 * 1000)
    const recency = Math.min(14, Math.floor(days)) * 2
    const low = Math.max(0, 5 - (p.gotItCount || 0))
    return needs + recency + low
  }

  struggle.forEach((e) => { e._weight = weight(e) })
  rest.forEach((e) => { e._weight = weight(e) })
  struggle.sort((a, b) => (b._weight || 0) - (a._weight || 0))
  rest.sort((a, b) => (b._weight || 0) - (a._weight || 0))

  const shuffleBands = (cards) => {
    if (cards.length <= 1) return cards
    const bands = []
    let band = []
    let lastW = null
    for (const c of cards) {
      const w = c._weight || 0
      if (lastW != null && Math.abs(w - lastW) > 5) {
        bands.push(band)
        band = []
      }
      band.push(c)
      lastW = w
    }
    if (band.length) bands.push(band)
    bands.forEach((b) => {
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]]
      }
    })
    return bands.flat()
  }

  const shuffledRest = shuffleBands(rest)
  const deck = focusModeOnly ? struggle : [...struggle, ...shuffledRest]
  _deckCache[cacheKey] = deck
  return deck.map((e) => ({ card: e.card, cardId: e.cardId }))
}

export function bumpDeckCache() {
  _deckCacheVersion++
  _deckCache = {}
}

// ---------------------------------------------------------------------------
// SESSION (Firestore: flashcardSessions/{userId})
// ---------------------------------------------------------------------------

export async function persistFlashcardSession(userId, setId, focusMode, cardIds, currentIndex) {
  if (!userId || !setId || !(cardIds || []).length || !db) return
  try {
    await setDoc(doc(db, 'flashcardSessions', userId), {
      setId,
      focusMode: !!focusMode,
      cardIds: cardIds || [],
      currentIndex: Math.max(0, currentIndex || 0),
      savedAt: Date.now(),
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('persistFlashcardSession:', e)
  }
}

export async function restoreFlashcardSession(setId, flashcards, userId, focusMode) {
  if (!userId || !db) return null
  try {
    const snap = await getDoc(doc(db, 'flashcardSessions', userId))
    if (!snap.exists()) return null
    const data = snap.data()
    if (data.setId !== setId || !!data.focusMode !== !!focusMode) return null
    if (Date.now() - (data.savedAt || 0) > SESSION_MAX_AGE_MS) return null
    const result = await buildStudyDeck(setId, flashcards, userId, focusMode, new Set(), false)
    const deck = Array.isArray(result) ? result : (result?.deck || [])
    const byId = {}
    deck.forEach((e) => { byId[e.cardId] = e })
    const ordered = (data.cardIds || []).map((id) => byId[id]).filter(Boolean)
    const index = Math.max(0, Math.min(data.currentIndex || 0, ordered.length - 1))
    return {
      deck: ordered.length ? ordered : deck,
      index: ordered.length ? index : 0,
    }
  } catch (e) {
    console.error('restoreFlashcardSession:', e)
    return null
  }
}

export async function clearFlashcardSession(userId) {
  if (!userId || !db) return
  try {
    await deleteDoc(doc(db, 'flashcardSessions', userId))
  } catch (e) {
    console.error('clearFlashcardSession:', e)
  }
}

export async function getSavedSession(userId) {
  if (!userId || !db) return null
  try {
    const snap = await getDoc(doc(db, 'flashcardSessions', userId))
    if (!snap.exists()) return null
    const data = snap.data()
    if (Date.now() - (data.savedAt || 0) > SESSION_MAX_AGE_MS) return null
    return data
  } catch (e) {
    console.error('getSavedSession:', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// DUPLICATES (sync, no storage)
// ---------------------------------------------------------------------------

function normalizeForComparison(text) {
  return (text || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
}

export function isDuplicateFlashcard(front, existingCards) {
  const norm = normalizeForComparison(front)
  for (const c of existingCards || []) {
    if (normalizeForComparison(c.front) === norm) return true
  }
  return false
}

function calculateSimilarity(t1, t2) {
  const n1 = normalizeForComparison(t1).split(' ')
  const n2 = normalizeForComparison(t2).split(' ')
  if (n1.join('') === n2.join('')) return 1
  const s1 = new Set(n1)
  const s2 = new Set(n2)
  const inter = [...s1].filter((x) => s2.has(x)).length
  const union = new Set([...n1, ...n2]).size
  return union ? inter / union : 0
}

export function findPotentialDuplicates(cards) {
  const out = []
  for (let i = 0; i < (cards || []).length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const sim = calculateSimilarity(cards[i].front, cards[j].front)
      if (sim > 0.8) out.push({ card1: cards[i], card2: cards[j], similarity: sim })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// QUIZ → FLASHCARD SYNC
// ---------------------------------------------------------------------------

export function getAllFlashcardTitlesWithIds(flashcardDatabase) {
  const list = []
  if (!flashcardDatabase || typeof flashcardDatabase !== 'object') return list
  for (const [setId, cards] of Object.entries(flashcardDatabase)) {
    if (!Array.isArray(cards)) continue
    for (const card of cards) {
      list.push({
        cardId: stableCardId(setId, card),
        title: card.title || card.front || '',
        setId,
      })
    }
  }
  return list
}

export function keywordMatchQuestionToFlashcard(questionText, titleList) {
  const qWords = normalizeForComparison(questionText || '').split(' ').filter((w) => w.length > 3)
  if (!qWords.length) return null
  let best = null
  let bestScore = 0
  for (const entry of titleList || []) {
    const tWords = normalizeForComparison(entry.title || '').split(' ')
    let match = 0
    for (const w of qWords) {
      if (tWords.includes(w)) match++
    }
    const score = match / qWords.length
    if (score > bestScore && score > 0.2) {
      bestScore = score
      best = entry
    }
  }
  return best
}

export async function syncQuizToFlashcards(missedResults, userId, flashcardDatabase, testToSet = {}) {
  if (!userId || !(missedResults || []).length || !db) return
  const titleList = getAllFlashcardTitlesWithIds(flashcardDatabase)
  if (!titleList.length) return
  const setIdsForTest = (testId) => {
    const setId = testToSet[testId]
    return setId ? [setId] : Object.keys(flashcardDatabase || {})
  }
  for (const r of missedResults) {
    if (r.correct) continue
    const question = r.question || r.q || ''
    const testId = r.testId || r.topic
    const allowedSets = setIdsForTest(testId)
    const filteredList = titleList.filter((t) => allowedSets.includes(t.setId))
    const match = keywordMatchQuestionToFlashcard(question, filteredList)
    if (match) {
      await recordFlashcardFeedback(userId, match.cardId, 'needsPractice')
      await recordFlashcardMastery(userId, match.cardId, 'needsPractice')
    }
  }
  bumpDeckCache()
}

// ---------------------------------------------------------------------------
// ANALYTICS (Firestore: flashcardAnalytics)
// ---------------------------------------------------------------------------

export async function logFlashcardSession(userId, setId, category, cardsViewed, percentComplete, timeSpent) {
  if (!userId || !db) return
  try {
    await addDoc(collection(db, 'flashcardAnalytics'), {
      userId,
      setId: setId || '',
      category: category || '',
      cardsViewed: Math.max(0, cardsViewed || 0),
      percentComplete: Math.max(0, Math.min(100, percentComplete || 0)),
      timeSpent: Math.round(timeSpent || 0),
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error('logFlashcardSession:', e)
  }
}

// ---------------------------------------------------------------------------
// STATISTICS
// ---------------------------------------------------------------------------

export async function getFlashcardStatistics(userId) {
  const empty = {
    totalCards: 0,
    masteredCards: 0,
    needsPracticeCards: 0,
    totalGotIt: 0,
    totalNeedsPractice: 0,
    averageGotIt: 0,
    masteryRate: 0,
    struggleTopics: [],
    strongTopics: [],
  }
  if (!userId) return empty
  try {
    const [progressRecords, masteryRecords] = await Promise.all([
      getAllProgressForUser(userId),
      getAllMasteryForUser(userId),
    ])
    let totalCards = progressRecords.length
    let needsPracticeCards = 0
    let totalGotIt = 0
    let totalNeedsPractice = 0
    for (const p of progressRecords) {
      totalGotIt += p.gotItCount || 0
      totalNeedsPractice += p.needsPracticeCount || 0
      if ((p.needsPracticeCount || 0) > 0) needsPracticeCards++
    }
    let masteredCards = 0
    for (const m of masteryRecords) {
      if (m.status === 'mastered') masteredCards++
    }
    const averageGotIt = totalCards > 0 ? totalGotIt / totalCards : 0
    const masteryRate = totalCards > 0 ? (masteredCards / totalCards) * 100 : 0
    const struggleTopics = await getStruggleTopicIds(userId)
    const strongTopics = await getStrongTopicIds(userId)
    return {
      totalCards,
      masteredCards,
      needsPracticeCards,
      totalGotIt,
      totalNeedsPractice,
      averageGotIt,
      masteryRate,
      struggleTopics,
      strongTopics,
    }
  } catch (e) {
    console.error('getFlashcardStatistics:', e)
    return empty
  }
}

// Re-export for callers that expect it from service
export { stableCardId }
