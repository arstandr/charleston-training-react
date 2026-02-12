/**
 * Mercy Rule: build official test question set adaptive to attempt count and flashcard mastery.
 * - First attempt: 60% struggle, 40% mastered/neutral (challenge).
 * - Retake: 60% mastered/neutral, 40% struggle (mercy).
 * Option A: map each quiz question to a flashcard (by matching correct answer to card.back) for mastery lookup.
 */

const OFFICIAL_QUESTION_COUNT = 28

function normalizeForMatch(str) {
  return (str || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** Find a card in the set whose back or front matches the correct answer text. */
function findCardIdForQuestion(setId, correctAnswerText, cards, stableCardId) {
  if (!setId || !cards?.length || !stableCardId) return null
  const norm = normalizeForMatch(correctAnswerText)
  if (!norm) return null
  for (const card of cards) {
    const backNorm = normalizeForMatch(card.back)
    const frontNorm = normalizeForMatch(card.front)
    if (backNorm && (norm.includes(backNorm) || backNorm.includes(norm))) return stableCardId(setId, card)
    if (frontNorm && (norm.includes(frontNorm) || frontNorm.includes(norm))) return stableCardId(setId, card)
  }
  return null
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Build adaptive official test questions.
 * @param {string} testId - e.g. 'bar_test'
 * @param {string} traineeId
 * @param {{ getAttempts: (id) => { count: number }, getMastery: (cardId) => { status: string } }} deps
 * @param {{ QUIZ_DATABASE: object, TEST_TO_FLASHCARD_SET: object, FLASHCARD_DATABASE: object, stableCardId: (setId, card) => string }} data
 * @returns {{ questions: any[], indices: number[] }}
 */
export function buildAdaptiveOfficialTest(testId, traineeId, deps, data) {
  const { getAttempts, getMastery } = deps
  const { QUIZ_DATABASE, TEST_TO_FLASHCARD_SET, FLASHCARD_DATABASE, stableCardId } = data
  const quiz = QUIZ_DATABASE?.[testId]
  if (!quiz?.questions?.length) return { questions: [], indices: [] }

  const attemptCount = (getAttempts(testId) || {}).count || 0
  const isRetake = attemptCount >= 1
  const setId = TEST_TO_FLASHCARD_SET?.[testId]
  const cards = setId ? (FLASHCARD_DATABASE?.[setId] || []) : []

  const struggleIndices = []
  const masteredIndices = []
  const neutralIndices = []

  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i]
    const correctText = q?.opts && q.ans != null ? q.opts[q.ans] : ''
    const cardId = findCardIdForQuestion(setId, correctText, cards, stableCardId)
    const status = cardId && traineeId ? (getMastery(cardId) || {}).status : null
    if (status === 'struggle') struggleIndices.push(i)
    else if (status === 'mastered') masteredIndices.push(i)
    else neutralIndices.push(i)
  }

  const fromStruggle = Math.round(OFFICIAL_QUESTION_COUNT * 0.6)
  const fromRest = OFFICIAL_QUESTION_COUNT - fromStruggle
  const allIndices = [...struggleIndices, ...neutralIndices, ...masteredIndices]
  let selected
  if (isRetake) {
    const restPool = shuffle([...masteredIndices, ...neutralIndices])
    const strugglePool = shuffle([...struggleIndices])
    const pickRest = restPool.slice(0, fromStruggle)
    const pickStruggle = strugglePool.slice(0, fromRest)
    const used = new Set([...pickRest, ...pickStruggle])
    const need = OFFICIAL_QUESTION_COUNT - used.size
    const fill = allIndices.filter((idx) => !used.has(idx))
    const extra = shuffle(fill).slice(0, need)
    selected = shuffle([...pickRest, ...pickStruggle, ...extra])
  } else {
    const strugglePool = shuffle([...struggleIndices])
    const restPool = shuffle([...neutralIndices, ...masteredIndices])
    const pickStruggle = strugglePool.slice(0, fromStruggle)
    const pickRest = restPool.slice(0, fromRest)
    const used = new Set([...pickStruggle, ...pickRest])
    const need = OFFICIAL_QUESTION_COUNT - used.size
    const fill = allIndices.filter((idx) => !used.has(idx))
    const extra = shuffle(fill).slice(0, need)
    selected = shuffle([...pickStruggle, ...pickRest, ...extra])
  }
  const questions = selected.map((i) => quiz.questions[i])
  return { questions, indices: selected }
}

/**
 * Infinite Gym: get one next practice question, weighted by mastery; avoid recent (session history).
 * @param {string} testId
 * @param {string} traineeId
 * @param {{ getMastery: (cardId) => { status: string } }} deps
 * @param {number[]} sessionHistory - last N question indices shown (to avoid repeat)
 * @param {object} data - same as buildAdaptiveOfficialTest
 * @returns {{ question: object, index: number, cardId: string|null }}
 */
export function getNextInfiniteQuestion(testId, traineeId, deps, sessionHistory, data) {
  const { getMastery } = deps
  const { QUIZ_DATABASE, TEST_TO_FLASHCARD_SET, FLASHCARD_DATABASE, stableCardId } = data
  const quiz = QUIZ_DATABASE?.[testId]
  if (!quiz?.questions?.length) return { question: null, index: -1, cardId: null }

  const setId = TEST_TO_FLASHCARD_SET?.[testId]
  const cards = setId ? (FLASHCARD_DATABASE?.[setId] || []) : []
  const recent = new Set(sessionHistory || [])

  const weighted = []
  for (let i = 0; i < quiz.questions.length; i++) {
    if (recent.has(i)) continue
    const q = quiz.questions[i]
    const correctText = q?.opts && q.ans != null ? q.opts[q.ans] : ''
    const cardId = findCardIdForQuestion(setId, correctText, cards, stableCardId)
    const status = cardId && traineeId ? (getMastery(cardId) || {}).status : null
    let w = 10
    if (status === 'struggle') w = 50
    else if (status === 'mastered') w = 2
    for (let j = 0; j < w; j++) weighted.push({ i, cardId })
  }

  if (weighted.length === 0) {
    const idx = Math.floor(Math.random() * quiz.questions.length)
    return { question: quiz.questions[idx], index: idx, cardId: null }
  }
  const pick = weighted[Math.floor(Math.random() * weighted.length)]
  return { question: quiz.questions[pick.i], index: pick.i, cardId: pick.cardId }
}

export { OFFICIAL_QUESTION_COUNT }
