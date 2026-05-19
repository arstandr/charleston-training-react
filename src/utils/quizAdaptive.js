/**
 * Adaptive test building from flashcard mastery data.
 * - Attempt 1: 50/50 even mix of struggle and mastered/neutral.
 * - Attempt 2: ~80% mastered/neutral, ~20% struggle (confidence builder).
 * - Attempt 3+: 100% struggle cards (remediation — fill from neutral if not enough).
 *
 * Flashcards are the single source of truth — no QUIZ_DATABASE needed.
 * Each card with approved quizData becomes a question; card.id is used directly for mastery lookup.
 */

import { isQuizApproved } from '../services/flashcardService'

/** Number of regular (non-bonus) questions in an official test. 3 bonus are added in QuizzesPage. */
const OFFICIAL_QUESTION_COUNT = 20

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Convert a flashcard with quizData into a quiz question object. */
function cardToQuestion(card) {
  const qd = card.quizData
  return {
    q: qd.q,
    opts: qd.opts,
    ans: qd.ans,
    exp: qd.exp || '',
    cardId: card.id,
    cardFront: card.front,
    cardBack: card.back,
    source: 'flashcard',
  }
}

/**
 * Build adaptive official test questions from flashcard pool.
 * @param {string} testId - e.g. 'bar_test'
 * @param {string} traineeId
 * @param {{ getAttempts: (id) => { count: number }, getMastery: (cardId) => { status: string } }} deps
 * @param {{ TEST_TO_FLASHCARD_SET: object, FLASHCARD_DATABASE: object, stableCardId: (setId, card) => string }} data
 * @returns {{ questions: any[], indices: number[] }}
 */
export function buildAdaptiveOfficialTest(testId, traineeId, deps, data) {
  const { getAttempts, getMastery } = deps
  const { TEST_TO_FLASHCARD_SET, FLASHCARD_DATABASE, stableCardId } = data

  const setId = TEST_TO_FLASHCARD_SET?.[testId]
  const cards = setId ? (FLASHCARD_DATABASE?.[setId] || []) : []

  // Filter to approved quiz-ready cards
  const pool = cards.filter((c) => c.quizData?.q && Array.isArray(c.quizData.opts) && isQuizApproved(c))
  if (!pool.length) return { questions: [], indices: [] }

  const attemptCount = (getAttempts(testId) || {}).count || 0

  const struggleIndices = []
  const masteredIndices = []
  const neutralIndices = []

  for (let i = 0; i < pool.length; i++) {
    const card = pool[i]
    const cardId = stableCardId ? stableCardId(setId, card) : card.id
    const status = cardId && traineeId ? (getMastery(cardId) || {}).status : null
    if (status === 'struggle') struggleIndices.push(i)
    else if (status === 'mastered') masteredIndices.push(i)
    else neutralIndices.push(i)
  }

  const count = Math.min(OFFICIAL_QUESTION_COUNT, pool.length)
  if (count < 10) {
    console.warn(`Warning: Test ${testId} only has ${pool.length} approved quiz questions`)
  }
  const allIndices = [...struggleIndices, ...neutralIndices, ...masteredIndices]
  let selected

  if (attemptCount === 0) {
    // Attempt 1: even 50/50 mix of struggle and mastered/neutral
    const halfStruggle = Math.round(count * 0.5)
    const halfRest = count - halfStruggle
    const strugglePool = shuffle([...struggleIndices])
    const restPool = shuffle([...masteredIndices, ...neutralIndices])
    const pickStruggle = strugglePool.slice(0, halfStruggle)
    const pickRest = restPool.slice(0, halfRest)
    const used = new Set([...pickStruggle, ...pickRest])
    const need = count - used.size
    const fill = allIndices.filter((idx) => !used.has(idx))
    const extra = shuffle(fill).slice(0, need)
    selected = shuffle([...pickStruggle, ...pickRest, ...extra])
  } else if (attemptCount === 1) {
    // Attempt 2: ~80% mastered/neutral (confidence builder), ~20% struggle
    const fromRest = Math.round(count * 0.8)
    const fromStruggle = count - fromRest
    const restPool = shuffle([...masteredIndices, ...neutralIndices])
    const strugglePool = shuffle([...struggleIndices])
    const pickRest = restPool.slice(0, fromRest)
    const pickStruggle = strugglePool.slice(0, fromStruggle)
    const used = new Set([...pickRest, ...pickStruggle])
    const need = count - used.size
    const fill = allIndices.filter((idx) => !used.has(idx))
    const extra = shuffle(fill).slice(0, need)
    selected = shuffle([...pickRest, ...pickStruggle, ...extra])
  } else {
    // Attempt 3+: 100% struggle cards (remediation), fill from neutral then mastered if needed
    const strugglePool = shuffle([...struggleIndices])
    if (strugglePool.length >= count) {
      selected = shuffle(strugglePool.slice(0, count))
    } else {
      const remaining = count - strugglePool.length
      const fillPool = shuffle([...neutralIndices, ...masteredIndices])
      selected = shuffle([...strugglePool, ...fillPool.slice(0, remaining)])
    }
  }
  const questions = selected.map((i) => cardToQuestion(pool[i]))
  const indices = selected
  return { questions, indices }
}

/**
 * Infinite Gym: get one next practice question, weighted by mastery; avoid recent (session history).
 * Uses flashcard pool directly — no fuzzy matching needed.
 * @param {string} testId
 * @param {string} traineeId
 * @param {{ getMastery: (cardId) => { status: string } }} deps
 * @param {number[]} sessionHistory - last N pool indices shown (to avoid repeat)
 * @param {{ TEST_TO_FLASHCARD_SET: object, FLASHCARD_DATABASE: object, stableCardId: (setId, card) => string }} data
 * @returns {{ question: object, index: number, cardId: string|null }}
 */
export function getNextInfiniteQuestion(testId, traineeId, deps, sessionHistory, data) {
  const { getMastery } = deps
  const { TEST_TO_FLASHCARD_SET, FLASHCARD_DATABASE, stableCardId } = data

  const setId = TEST_TO_FLASHCARD_SET?.[testId]
  const cards = setId ? (FLASHCARD_DATABASE?.[setId] || []) : []

  // Filter to approved quiz-ready cards
  const pool = cards.filter((c) => c.quizData?.q && Array.isArray(c.quizData.opts) && isQuizApproved(c))
  if (!pool.length) return { question: null, index: -1, cardId: null }

  const recent = new Set(sessionHistory || [])

  const weighted = []
  for (let i = 0; i < pool.length; i++) {
    if (recent.has(i)) continue
    const card = pool[i]
    const cardId = stableCardId ? stableCardId(setId, card) : card.id
    const status = cardId && traineeId ? (getMastery(cardId) || {}).status : null
    let w = 10
    if (status === 'struggle') w = 50
    else if (status === 'mastered') w = 2
    for (let j = 0; j < w; j++) weighted.push({ i, cardId })
  }

  if (weighted.length === 0) {
    // All questions recently shown — pick random from full pool
    const idx = Math.floor(Math.random() * pool.length)
    return { question: cardToQuestion(pool[idx]), index: idx, cardId: pool[idx].id }
  }
  const pick = weighted[Math.floor(Math.random() * weighted.length)]
  return { question: cardToQuestion(pool[pick.i]), index: pick.i, cardId: pick.cardId }
}

export { OFFICIAL_QUESTION_COUNT }
