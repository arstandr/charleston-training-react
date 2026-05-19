/**
 * Charlie Tools — Tool implementations that Charlie AI can call.
 * Each tool reads/writes Firestore using existing services.
 */
import { getActiveFlashcards, getAllFlashcardSets, createFlashcard as createCard, updateFlashcard as updateCard, invalidateActiveCardsCache } from './flashcardService'
import { autoGenerateQuizForCard, generateFlashcards } from './ai'
import {
  getAllMasteryForUser,
  getAllProgressForUser,
  getCardsForSession,
} from './flashcardIntelligenceService'
import { loadTestResults } from './quizAttemptsService'
import { fetchStudyLog } from './studyLogService'
import { collection, query, where, orderBy, limit, getDocs, addDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getFromFirestore, updateDocFields, deleteField } from '../utils/firestore'
import { SHIFT_META } from '../constants'
import { getManagerNeedsYouQueue, getCertificationProgress } from '../utils/helpers'
import { getLastActivityDate } from '../utils/RiskEngine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Roles allowed to use staff read tools */
const STAFF_ROLES = ['trainer', 'manager', 'admin', 'owner']
/** Roles allowed to use manager read + write tools */
const MANAGER_ROLES = ['manager', 'admin', 'owner']

/**
 * Load and extract training data from Firestore config doc.
 * Handles both { data: { ... } } wrapper and raw object format.
 */
async function loadTrainingData() {
  const raw = await getFromFirestore('config', 'trainingData')
  if (!raw) return null
  return raw.data && typeof raw.data === 'object' ? raw.data : raw
}

/**
 * Validate flashcard text input.
 * @returns {string|null} Error message or null if valid.
 */
function validateFlashcardText(front, back) {
  if (!front || typeof front !== 'string' || !front.trim()) return 'front text is required'
  if (!back || typeof back !== 'string' || !back.trim()) return 'back text is required'
  if (front.length > 500) return 'front text exceeds 500 character limit'
  if (back.length > 2000) return 'back text exceeds 2000 character limit'
  return null
}

// ---------------------------------------------------------------------------
// Read Tools (all roles)
// ---------------------------------------------------------------------------

/**
 * Search flashcards by keyword. Returns matching cards.
 */
async function searchFlashcards({ query: searchQuery, maxResults = 5 }) {
  const cards = await getActiveFlashcards()
  const q = (searchQuery || '').toLowerCase().trim()
  if (!q) return { results: [], message: 'No search query provided' }

  const scored = cards
    .map((card) => {
      const front = (card.front || '').toLowerCase()
      const back = (card.back || '').toLowerCase()
      const setId = (card.setId || '').toLowerCase()
      let score = 0
      if (front.includes(q)) score += 10
      if (back.includes(q)) score += 5
      if (setId.includes(q)) score += 3
      // Word-level matching
      const words = q.split(/\s+/)
      for (const w of words) {
        if (w.length < 2) continue
        if (front.includes(w)) score += 2
        if (back.includes(w)) score += 1
      }
      return { id: card.id, front: card.front, back: card.back, setId: card.setId, score }
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(maxResults || 5, 10))

  return {
    results: scored.map(({ id, front, back, setId }) => ({ id, item: front, description: back, category: setId })),
    totalMatches: scored.length,
  }
}

/**
 * Get all flashcard categories with card counts.
 */
async function getFlashcardCategories() {
  const [sets, cards] = await Promise.all([getAllFlashcardSets(), getActiveFlashcards()])
  const counts = {}
  for (const card of cards) {
    const setId = card.setId || 'uncategorized'
    counts[setId] = (counts[setId] || 0) + 1
  }
  const categories = sets.map((s) => ({
    id: s.id,
    name: s.title || s.name || s.id,
    cardCount: counts[s.id] || 0,
  }))
  return { categories, totalCards: cards.length }
}

// ---------------------------------------------------------------------------
// Read Tools (trainee — about themselves)
// ---------------------------------------------------------------------------

/**
 * Get trainee's overall mastery stats with per-topic breakdown.
 */
export async function getMyProgress({ userId }) {
  const [masteryRecords, progressRecords, cards, sets] = await Promise.all([
    getAllMasteryForUser(userId),
    getAllProgressForUser(userId),
    getActiveFlashcards(),
    getAllFlashcardSets(),
  ])

  const setNames = {}
  sets.forEach((s) => { setNames[s.id] = s.title || s.name || s.id })

  // Count total cards per set
  const totalBySet = {}
  for (const card of cards) {
    const setId = card.setId || 'uncategorized'
    totalBySet[setId] = (totalBySet[setId] || 0) + 1
  }

  // Count mastered and struggling per set
  const masteredBySet = {}
  const struggleBySet = {}
  for (const m of masteryRecords) {
    const cardSetId = cards.find((c) => c.id === m.cardId)?.setId
    const setId = cardSetId || 'uncategorized'
    if (m.status === 'mastered') masteredBySet[setId] = (masteredBySet[setId] || 0) + 1
    if (m.status === 'struggle') struggleBySet[setId] = (struggleBySet[setId] || 0) + 1
  }

  // Build per-topic breakdown
  const topicBreakdown = Object.keys(totalBySet).map((setId) => {
    const total = totalBySet[setId] || 0
    const mastered = masteredBySet[setId] || 0
    const struggling = struggleBySet[setId] || 0
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0
    return {
      topic: setNames[setId] || setId,
      totalCards: total,
      mastered,
      struggling,
      masteryPct: pct,
      status: pct >= 80 ? 'strong' : struggling > mastered ? 'needs work' : 'in progress',
    }
  }).sort((a, b) => a.masteryPct - b.masteryPct)

  const totalMastered = masteryRecords.filter((m) => m.status === 'mastered').length
  const totalStudied = progressRecords.length
  const overallPct = cards.length > 0 ? Math.round((totalMastered / cards.length) * 100) : 0

  return {
    totalCards: cards.length,
    totalStudied,
    totalMastered,
    overallMasteryPct: overallPct,
    topicBreakdown,
  }
}

/**
 * Get trainee's recent quiz/test scores.
 */
async function getMyQuizScores({ userId }) {
  const testResults = await loadTestResults(userId)
  const scores = Object.entries(testResults).map(([testId, data]) => ({
    test: testId,
    score: data.score || data.scores?.[data.scores.length - 1] || 0,
    attempts: data.count || 0,
    passed: data.passed || false,
    lastAttempt: data.lastAttemptAt || data.updatedAt || null,
  }))
  return { scores, totalTests: scores.length }
}

/**
 * Get trainee's weak areas from weakSpots collection.
 */
async function getMyWeakAreas({ userId }) {
  if (!db || !userId) return { weakAreas: [] }
  try {
    const q = query(
      collection(db, 'weakSpots'),
      where('userId', '==', String(userId)),
      where('mastered', '==', false),
      orderBy('missedAt', 'desc'),
      limit(20),
    )
    const snap = await getDocs(q)
    const weakAreas = snap.docs.map((d) => {
      const data = d.data()
      return {
        topic: data.setId || 'general',
        question: data.questionText || '',
        correctAnswer: data.correctAnswer || '',
        timesReviewed: data.reviewCount || 0,
        source: data.source || 'unknown',
      }
    })
    return { weakAreas, totalWeakSpots: weakAreas.length }
  } catch (e) {
    console.warn('[charlieTools] getMyWeakAreas error:', e?.message)
    return { weakAreas: [], error: 'Could not load weak areas' }
  }
}

/**
 * Get trainee's recent study history.
 */
export async function getMyStudyHistory({ userId, maxResults = 10 }) {
  const log = await fetchStudyLog(userId)
  const recent = log.slice(0, maxResults || 10).map((entry) => {
    if (entry.type === 'flashcard') {
      return {
        type: 'flashcard_session',
        date: entry.timestamp,
        category: entry.category || entry.setId,
        cardsViewed: entry.cardsViewed,
        gotIt: entry.gotIt,
        needsPractice: entry.needsPractice,
      }
    }
    if (entry.type === 'quiz') {
      return {
        type: 'quiz_session',
        date: entry.timestamp,
        quiz: entry.quizTitle || entry.quizId,
        score: entry.score,
        correct: entry.correctCount,
        total: entry.totalQuestions,
        mode: entry.mode,
      }
    }
    return { type: entry.type, date: entry.timestamp }
  })
  return { recentActivity: recent, totalEntries: log.length }
}

/**
 * Get study recommendation based on Leitner spaced repetition.
 */
export async function getStudyRecommendation({ userId }) {
  const [progressRecords, cards, sets] = await Promise.all([
    getAllProgressForUser(userId),
    getActiveFlashcards(),
    getAllFlashcardSets(),
  ])

  // Find cards due for review
  const progressByCard = {}
  progressRecords.forEach((r) => { progressByCard[r.cardId] = r })

  // Estimate current session (we don't have the exact number, use a high number)
  const currentSession = 999
  const withProgress = cards.map((card) => {
    const p = progressByCard[card.id] || {}
    return {
      front: card.front,
      setId: card.setId,
      leitnerBox: p.leitnerBox ?? 1,
      lastReviewedSession: p.lastReviewedSession ?? 0,
    }
  })

  const due = getCardsForSession(withProgress, currentSession)

  // Group by set
  const bySet = {}
  for (const card of due) {
    const setId = card.setId || 'general'
    if (!bySet[setId]) bySet[setId] = 0
    bySet[setId]++
  }

  const setNames = {}
  sets.forEach((s) => { setNames[s.id] = s.title || s.name || s.id })

  const recommendations = Object.entries(bySet)
    .map(([setId, count]) => ({ topic: setNames[setId] || setId, cardsDue: count }))
    .sort((a, b) => b.cardsDue - a.cardsDue)

  // Count unseen cards (never studied)
  const unseenCount = cards.filter((c) => !progressByCard[c.id]).length

  return {
    recommendations,
    totalDueCards: due.length,
    unseenCards: unseenCount,
    totalCards: cards.length,
  }
}

// ---------------------------------------------------------------------------
// Read Tools (trainer/manager — about trainees)
// ---------------------------------------------------------------------------

/**
 * Get list of all trainees.
 */
async function getTraineeList() {
  const data = await loadTrainingData()
  if (!data) return { trainees: [] }
  const arr = data?.trainees || data?.users
  if (Array.isArray(arr)) {
    return {
      trainees: arr
        .filter((t) => !t.archived)
        .map((t) => ({ name: t.name, store: t.store, empNum: t.empNum || t.employeeNumber, traineeId: t.traineeId })),
    }
  }
  // Object format
  const trainees = Object.entries(data || {})
    .filter(([, v]) => v && typeof v === 'object' && v.name && !v.archived)
    .map(([id, v]) => ({ name: v.name, store: v.store, empNum: v.empNum, traineeId: id }))
  return { trainees }
}

/**
 * Get a specific trainee's progress by name with per-topic breakdown.
 */
async function getTraineeProgress({ traineeName }) {
  const { trainees } = await getTraineeList()
  const q = (traineeName || '').toLowerCase().trim()
  const match = trainees.find((t) =>
    (t.name || '').toLowerCase().includes(q) ||
    (t.traineeId || '').toLowerCase().includes(q)
  )
  if (!match) return { error: `No trainee found matching "${traineeName}"`, suggestions: trainees.slice(0, 5).map((t) => t.name) }

  const userId = match.traineeId || match.empNum
  const [progressData, testResults] = await Promise.all([
    getMyProgress({ userId }),
    loadTestResults(userId),
  ])

  const scores = Object.entries(testResults).map(([testId, data]) => ({
    test: testId,
    score: data.score || 0,
    passed: data.passed || false,
    attempts: data.count || 0,
  }))

  return {
    name: match.name,
    store: match.store,
    traineeId: userId,
    totalCards: progressData.totalCards,
    totalStudied: progressData.totalStudied,
    totalMastered: progressData.totalMastered,
    overallMasteryPct: progressData.overallMasteryPct,
    topicBreakdown: progressData.topicBreakdown,
    testScores: scores,
  }
}

/**
 * Compare multiple trainees side-by-side.
 */
async function compareTrainees({ traineeNames }) {
  const results = await Promise.all(
    (traineeNames || []).map((name) => getTraineeProgress({ traineeName: name }))
  )
  return { comparisons: results }
}

// ---------------------------------------------------------------------------
// Write Tools (trainee)
// ---------------------------------------------------------------------------

/**
 * Log a study session.
 */
async function logStudySession({ userId, topic, cardsReviewed, correctCount }) {
  if (!db || !userId) return { success: false, error: 'Not logged in' }
  try {
    await addDoc(collection(db, 'flashcardAnalytics'), {
      userId,
      traineeId: userId,
      setId: topic || 'charlie-quiz',
      category: topic || 'Charlie Quiz',
      cardsViewed: cardsReviewed || 0,
      gotIt: correctCount || 0,
      needsPractice: Math.max(0, (cardsReviewed || 0) - (correctCount || 0)),
      timestamp: new Date().toISOString(),
      source: 'charlie',
    })
    return { success: true, message: 'Study session recorded' }
  } catch (e) {
    console.warn('[charlieTools] logStudySession error:', e?.message)
    return { success: false, error: 'Failed to save session' }
  }
}

/**
 * Save conversational quiz result.
 */
async function saveQuizResult({ userId, topic, totalQuestions, correctCount }) {
  if (!db || !userId) return { success: false, error: 'Not logged in' }
  try {
    const total = Math.max(0, totalQuestions || 0)
    const correct = Math.min(Math.max(0, correctCount || 0), total)
    const score = total > 0 ? Math.round((correct / total) * 100) : 0
    await addDoc(collection(db, 'practiceTestSessions'), {
      traineeId: userId,
      quizId: `charlie_${(topic || 'general').toLowerCase().replace(/\s+/g, '_')}`,
      quizTitle: `Charlie Quiz: ${topic || 'General'}`,
      mode: 'charlie',
      totalQuestions: total,
      correctCount: correct,
      wrongCount: Math.max(0, total - correct),
      score,
      timestamp: new Date().toISOString(),
      source: 'charlie',
    })
    return { success: true, score, message: `Quiz result saved: ${score}%` }
  } catch (e) {
    console.warn('[charlieTools] saveQuizResult error:', e?.message)
    return { success: false, error: 'Failed to save quiz result' }
  }
}

// ---------------------------------------------------------------------------
// Read Tools (manager/owner — team management)
// ---------------------------------------------------------------------------

/**
 * Get pending action items: claims, sign-offs, stalled trainees, failed tests.
 */
export async function getManagerActionItems({ store }) {
  try {
    const data = await loadTrainingData()
    if (!data) return { pendingClaims: [], signOffsNeeded: [], stalledTrainees: [], failedTests: [], summary: 'No training data available' }

    // 1. Needs-you queue (claims + sign-offs)
    const queue = getManagerNeedsYouQueue(data, store || '')
    const pendingClaims = queue.filter((q) => q.type === 'claim').map((c) => ({
      traineeId: c.traineeId, traineeName: c.traineeName, shiftKey: c.shiftKey, shiftLabel: c.shiftLabel, when: c.when,
    }))
    const signOffsNeeded = queue.filter((q) => q.type === 'sign').map((s) => ({
      traineeId: s.traineeId, traineeName: s.traineeName, shiftKey: s.shiftKey, shiftLabel: s.shiftLabel,
    }))

    // 2. Stalled trainees (no activity 5+ days)
    const stalledTrainees = []
    for (const [id, rec] of Object.entries(data)) {
      if (!rec || rec.archived || typeof rec !== 'object' || !rec.name) continue
      if (store && (rec.store || '') !== store) continue
      const lastDate = getLastActivityDate({ id, ...rec })
      if (!lastDate) continue
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince >= 5) {
        stalledTrainees.push({ name: rec.name, daysSince })
      }
    }
    stalledTrainees.sort((a, b) => b.daysSince - a.daysSince)

    // 3. Failed / locked-out tests
    const failedTests = []
    for (const [id, rec] of Object.entries(data)) {
      if (!rec || rec.archived || typeof rec !== 'object' || !rec.name) continue
      if (store && (rec.store || '') !== store) continue
      const results = rec.testResults || []
      for (const r of results) {
        if (r.passed) continue
        const attempts = r.count || r.attempts || 1
        failedTests.push({
          traineeName: rec.name,
          testTitle: r.testTitle || r.testId || r.id || 'Unknown test',
          attempts,
          locked: attempts >= 3,
        })
      }
    }

    const parts = []
    if (pendingClaims.length) parts.push(`${pendingClaims.length} pending claim${pendingClaims.length > 1 ? 's' : ''}`)
    if (signOffsNeeded.length) parts.push(`${signOffsNeeded.length} sign-off${signOffsNeeded.length > 1 ? 's' : ''} needed`)
    if (stalledTrainees.length) parts.push(`${stalledTrainees.length} trainee${stalledTrainees.length > 1 ? 's' : ''} stalled`)
    if (failedTests.length) parts.push(`${failedTests.length} failed test${failedTests.length > 1 ? 's' : ''}`)
    const summary = parts.length ? parts.join(', ') : 'All clear — nothing needs your attention right now'

    return { pendingClaims, signOffsNeeded, stalledTrainees, failedTests, summary }
  } catch (e) {
    console.warn('[charlieTools] getManagerActionItems error:', e?.message)
    return { pendingClaims: [], signOffsNeeded: [], stalledTrainees: [], failedTests: [], summary: 'Could not load action items', error: e?.message }
  }
}

/**
 * Get team certification readiness: per-trainee progress, certified count, average.
 */
export async function getTeamReadiness({ store }) {
  try {
    const data = await loadTrainingData()
    if (!data) return { trainees: [], avgProgress: 0, totalTrainees: 0, certified: 0, summary: 'No training data available' }

    const trainees = []
    for (const [id, rec] of Object.entries(data)) {
      if (!rec || rec.archived || typeof rec !== 'object' || !rec.name) continue
      if (store && (rec.store || '') !== store) continue
      const { done, total, pct } = getCertificationProgress(rec)
      const isCertified = done >= total
      let status = 'Not started'
      if (isCertified) status = 'Certified'
      else if (pct >= 80) status = 'Almost there'
      else if (pct > 0) status = 'In progress'
      trainees.push({ name: rec.name, progress: `${done}/${total}`, pct, certified: isCertified, status })
    }
    trainees.sort((a, b) => b.pct - a.pct)

    const totalTrainees = trainees.length
    const certified = trainees.filter((t) => t.certified).length
    const avgProgress = totalTrainees ? Math.round(trainees.reduce((s, t) => s + t.pct, 0) / totalTrainees) : 0
    const closest = trainees.find((t) => !t.certified && t.pct > 0)
    let summary = `${certified}/${totalTrainees} certified.`
    if (closest) summary += ` ${closest.name} is closest (${closest.progress} shifts).`
    summary += ` Avg progress: ${avgProgress}%.`

    return { trainees, avgProgress, totalTrainees, certified, summary }
  } catch (e) {
    console.warn('[charlieTools] getTeamReadiness error:', e?.message)
    return { trainees: [], avgProgress: 0, totalTrainees: 0, certified: 0, summary: 'Could not load readiness data', error: e?.message }
  }
}

/**
 * Get content health: missing quizzes, pending approvals, unresolved chatbot flags.
 */
export async function getContentHealth() {
  try {
    const cards = await getActiveFlashcards()
    const missingQuizzes = cards.filter((c) => !c.quizData || !c.quizData.question).length
    const pendingApproval = cards.filter((c) => c.quizData?.question && c.quizApproved === false).length
    const totalActiveCards = cards.length

    // Count unresolved chatbot flags (server-side filter to avoid full collection scan)
    let unresolvedChatbotFlags = 0
    try {
      const snap = await getDocs(query(collection(db, 'chatbotFlags'), where('resolved', '==', false), limit(200)))
      unresolvedChatbotFlags = snap.size
    } catch {}

    const parts = []
    if (missingQuizzes) parts.push(`${missingQuizzes} cards missing quizzes`)
    if (pendingApproval) parts.push(`${pendingApproval} pending approval`)
    if (unresolvedChatbotFlags) parts.push(`${unresolvedChatbotFlags} chatbot flag${unresolvedChatbotFlags > 1 ? 's' : ''} to review`)
    const summary = parts.length ? parts.join(', ') : 'Content looks good — no issues found'

    return { missingQuizzes, pendingApproval, unresolvedChatbotFlags, totalActiveCards, summary }
  } catch (e) {
    console.warn('[charlieTools] getContentHealth error:', e?.message)
    return { missingQuizzes: 0, pendingApproval: 0, unresolvedChatbotFlags: 0, totalActiveCards: 0, summary: 'Could not check content health', error: e?.message }
  }
}

// ---------------------------------------------------------------------------
// Write Tools (manager/owner — team management actions)
// ---------------------------------------------------------------------------

/**
 * Approve a pending trainer claim on a trainee's shift.
 */
async function approveClaim({ traineeId, shiftKey }) {
  if (!traineeId || !shiftKey) return { error: 'Missing traineeId or shiftKey' }
  const data = await loadTrainingData()
  if (!data) return { error: 'Could not load training data' }
  const trainee = data[traineeId]
  if (!trainee) return { error: `Trainee ${traineeId} not found` }
  const shift = trainee.schedule?.[shiftKey]
  if (!shift?.pendingTrainer) return { error: `No pending claim on ${shiftKey} for ${trainee.name || traineeId}` }

  const trainerEmp = shift.pendingTrainer
  const prefix = `${traineeId}.schedule.${shiftKey}`
  const ok = await updateDocFields('config', 'trainingData', {
    [`${prefix}.trainer`]: trainerEmp,
    [`${prefix}.pendingTrainer`]: deleteField(),
    [`${prefix}.pendingAt`]: deleteField(),
  })
  if (!ok) return { error: 'Failed to update Firestore' }

  const shiftLabel = SHIFT_META[shiftKey]?.label || shiftKey
  return { success: true, message: `Approved trainer claim on ${trainee.name}'s ${shiftLabel}` }
}

/**
 * Deny a pending trainer claim on a trainee's shift.
 */
async function denyClaim({ traineeId, shiftKey }) {
  if (!traineeId || !shiftKey) return { error: 'Missing traineeId or shiftKey' }
  const data = await loadTrainingData()
  if (!data) return { error: 'Could not load training data' }
  const trainee = data[traineeId]
  if (!trainee) return { error: `Trainee ${traineeId} not found` }
  const shift = trainee.schedule?.[shiftKey]
  if (!shift?.pendingTrainer) return { error: `No pending claim on ${shiftKey} for ${trainee.name || traineeId}` }

  const prefix = `${traineeId}.schedule.${shiftKey}`
  const ok = await updateDocFields('config', 'trainingData', {
    [`${prefix}.pendingTrainer`]: deleteField(),
    [`${prefix}.pendingAt`]: deleteField(),
  })
  if (!ok) return { error: 'Failed to update Firestore' }

  const shiftLabel = SHIFT_META[shiftKey]?.label || shiftKey
  return { success: true, message: `Denied trainer claim on ${trainee.name}'s ${shiftLabel}` }
}

/**
 * Manager sign-off on a trainee's shift (after trainer has signed).
 */
async function signOffShift({ traineeId, shiftKey, empNum }) {
  if (!traineeId || !shiftKey) return { error: 'Missing traineeId or shiftKey' }
  if (!empNum) return { error: 'Manager employee number required for sign-off' }
  const data = await loadTrainingData()
  if (!data) return { error: 'Could not load training data' }
  const trainee = data[traineeId]
  if (!trainee) return { error: `Trainee ${traineeId} not found` }
  const shift = trainee.schedule?.[shiftKey]
  if (!shift?.trainerSignedAt) return { error: `Trainer hasn't signed off on ${shiftKey} yet` }
  if (shift.managerSignedAt) return { error: `${shiftKey} is already signed off by manager` }

  const prefix = `${traineeId}.schedule.${shiftKey}`
  const ok = await updateDocFields('config', 'trainingData', {
    [`${prefix}.managerSignedAt`]: new Date().toISOString(),
    [`${prefix}.managerSignedBy`]: empNum,
  })
  if (!ok) return { error: 'Failed to update Firestore' }

  const shiftLabel = SHIFT_META[shiftKey]?.label || shiftKey
  return { success: true, message: `Signed off on ${trainee.name}'s ${shiftLabel}` }
}

// ---------------------------------------------------------------------------
// Content Management Tools (manager/admin/owner)
// ---------------------------------------------------------------------------

/**
 * Create a new flashcard.
 */
async function createFlashcard({ front, back, setId }) {
  const validationError = validateFlashcardText(front, back)
  if (validationError) return { error: validationError }
  if (setId && (typeof setId !== 'string' || setId.length > 100)) return { error: 'Invalid setId' }
  try {
    const ref = await createCard({ front: front.trim(), back: back.trim(), setId: setId || 'general', status: 'active' })
    invalidateActiveCardsCache()
    return { success: true, cardId: ref.id }
  } catch (e) {
    console.warn('[charlieTools] createFlashcard error:', e?.message)
    return { error: 'Failed to create flashcard' }
  }
}

/**
 * Edit an existing flashcard.
 */
async function editFlashcard({ cardId, front, back, setId }) {
  if (!cardId || typeof cardId !== 'string') return { error: 'cardId is required' }
  const updates = {}
  if (front !== undefined) {
    if (typeof front !== 'string' || !front.trim() || front.length > 500) return { error: 'Invalid front text (max 500 chars)' }
    updates.front = front.trim()
  }
  if (back !== undefined) {
    if (typeof back !== 'string' || !back.trim() || back.length > 2000) return { error: 'Invalid back text (max 2000 chars)' }
    updates.back = back.trim()
  }
  if (setId !== undefined) {
    if (typeof setId !== 'string' || setId.length > 100) return { error: 'Invalid setId' }
    updates.setId = setId
  }
  if (Object.keys(updates).length === 0) return { error: 'No fields to update' }
  updates.updatedAt = new Date().toISOString()
  try {
    await updateCard(cardId, updates)
    invalidateActiveCardsCache()
    return { success: true }
  } catch (e) {
    console.warn('[charlieTools] editFlashcard error:', e?.message)
    return { error: 'Failed to update flashcard' }
  }
}

/**
 * Soft-delete a flashcard (graveyard).
 */
async function graveyardFlashcard({ cardId }) {
  if (!cardId || typeof cardId !== 'string') return { error: 'cardId is required' }
  try {
    await updateCard(cardId, { status: 'graveyarded', updatedAt: new Date().toISOString() })
    invalidateActiveCardsCache()
    return { success: true }
  } catch (e) {
    console.warn('[charlieTools] graveyardFlashcard error:', e?.message)
    return { error: 'Failed to graveyard flashcard' }
  }
}

/**
 * Restore a graveyarded flashcard.
 */
async function restoreFlashcard({ cardId }) {
  if (!cardId || typeof cardId !== 'string') return { error: 'cardId is required' }
  try {
    await updateCard(cardId, { status: 'active', updatedAt: new Date().toISOString() })
    invalidateActiveCardsCache()
    return { success: true }
  } catch (e) {
    console.warn('[charlieTools] restoreFlashcard error:', e?.message)
    return { error: 'Failed to restore flashcard' }
  }
}

/**
 * Generate a quiz question for a flashcard using AI.
 */
async function generateQuizForCard({ cardId }) {
  if (!cardId || typeof cardId !== 'string') return { error: 'cardId is required' }
  try {
    const cards = await getActiveFlashcards()
    const card = cards.find((c) => c.id === cardId)
    if (!card) return { error: 'Card not found' }

    const quizData = await autoGenerateQuizForCard(card.front, card.back)
    if (!quizData || !quizData.q || !Array.isArray(quizData.opts)) {
      return { error: 'AI could not generate a valid quiz for this card — try again' }
    }

    await updateCard(cardId, { quizData, quizApproved: false, updatedAt: new Date().toISOString() })
    invalidateActiveCardsCache()
    return {
      success: true,
      quiz: {
        question: quizData.q,
        options: quizData.opts,
        correctAnswer: quizData.ans,
        explanation: quizData.exp,
      },
    }
  } catch (e) {
    console.warn('[charlieTools] generateQuizForCard error:', e?.message)
    return { error: 'Failed to generate quiz' }
  }
}

/**
 * Approve a pending quiz question on a flashcard.
 */
async function approveQuiz({ cardId }) {
  if (!cardId || typeof cardId !== 'string') return { error: 'cardId is required' }
  try {
    await updateCard(cardId, { quizApproved: true, updatedAt: new Date().toISOString() })
    invalidateActiveCardsCache()
    return { success: true }
  } catch (e) {
    console.warn('[charlieTools] approveQuiz error:', e?.message)
    return { error: 'Failed to approve quiz' }
  }
}

/**
 * Bulk-create flashcards from pasted text using AI.
 */
async function bulkCreateFlashcards({ sourceText, setId, count }) {
  if (!sourceText || typeof sourceText !== 'string') return { error: 'sourceText is required' }
  if (sourceText.length > 8000) return { error: 'Source text too long (max 8000 characters)' }
  if (setId && (typeof setId !== 'string' || setId.length > 100)) return { error: 'Invalid setId' }
  const targetCount = Math.min(Math.max(1, count || 10), 25)
  try {
    const generated = await generateFlashcards(sourceText, targetCount)
    if (!generated.length) return { error: 'AI could not extract flashcards from the text' }

    // Filter out malformed cards from AI output
    const validCards = generated.filter((c) =>
      c.front && typeof c.front === 'string' && c.front.trim() &&
      c.back && typeof c.back === 'string' && c.back.trim()
    )
    if (!validCards.length) return { error: 'AI generated cards but none had valid front/back text' }

    const created = []
    for (const item of validCards) {
      const ref = await createCard({
        front: item.front.trim(),
        back: item.back.trim(),
        setId: setId || 'general',
        status: 'active',
      })
      created.push({ id: ref.id, front: item.front.trim(), back: item.back.trim() })
    }
    invalidateActiveCardsCache()
    const skipped = generated.length - validCards.length
    return {
      success: true,
      count: created.length,
      ...(skipped > 0 ? { skipped } : {}),
      cards: created,
    }
  } catch (e) {
    console.warn('[charlieTools] bulkCreateFlashcards error:', e?.message)
    return { error: 'Failed to bulk create flashcards' }
  }
}

/**
 * Get flashcards with pending quiz approvals.
 */
async function getPendingQuizApprovals({ setId }) {
  try {
    const cards = await getActiveFlashcards()
    let pending = cards.filter((c) => c.quizData?.q && c.quizApproved === false)
    if (setId) pending = pending.filter((c) => c.setId === setId)
    return {
      count: pending.length,
      cards: pending.slice(0, 20).map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        setId: c.setId,
        quiz: {
          question: c.quizData.q,
          options: c.quizData.opts,
          correctAnswer: c.quizData.ans,
          explanation: c.quizData.exp,
        },
      })),
    }
  } catch (e) {
    console.warn('[charlieTools] getPendingQuizApprovals error:', e?.message)
    return { cards: [], count: 0, error: 'Failed to load pending approvals' }
  }
}

// ---------------------------------------------------------------------------
// Tool Registry — maps tool names to implementations
// ---------------------------------------------------------------------------

/** Tool registry — each entry: [handler, requiredRole] where requiredRole is null (any), 'staff', or 'manager' */
const TOOL_REGISTRY = {
  // Read tools (all roles)
  searchFlashcards:       [(args) => searchFlashcards(args), null],
  getFlashcardCategories: [() => getFlashcardCategories(), null],
  // Trainee read tools (all roles — reads own data via userId)
  getMyProgress:          [(args, ctx) => getMyProgress({ userId: ctx.userId }), null],
  getMyQuizScores:        [(args, ctx) => getMyQuizScores({ userId: ctx.userId }), null],
  getMyWeakAreas:         [(args, ctx) => getMyWeakAreas({ userId: ctx.userId }), null],
  getMyStudyHistory:      [(args, ctx) => getMyStudyHistory({ userId: ctx.userId, ...args }), null],
  getStudyRecommendation: [(args, ctx) => getStudyRecommendation({ userId: ctx.userId }), null],
  // Trainee write tools
  logStudySession:        [(args, ctx) => logStudySession({ userId: ctx.userId, ...args }), null],
  saveQuizResult:         [(args, ctx) => saveQuizResult({ userId: ctx.userId, ...args }), null],
  // Staff read tools
  getTraineeList:         [() => getTraineeList(), 'staff'],
  getTraineeProgress:     [(args) => getTraineeProgress(args), 'staff'],
  compareTrainees:        [(args) => compareTrainees(args), 'staff'],
  // Manager read tools
  getManagerActionItems:  [(args, ctx) => getManagerActionItems({ store: ctx.store, ...args }), 'manager'],
  getTeamReadiness:       [(args, ctx) => getTeamReadiness({ store: ctx.store, ...args }), 'manager'],
  getContentHealth:       [() => getContentHealth(), 'manager'],
  // Manager write tools
  approveClaim:           [(args) => approveClaim(args), 'manager'],
  denyClaim:              [(args) => denyClaim(args), 'manager'],
  signOffShift:           [(args, ctx) => signOffShift({ ...args, empNum: ctx.empNum }), 'manager'],
  // Content management tools
  createFlashcard:        [(args) => createFlashcard(args), 'manager'],
  editFlashcard:          [(args) => editFlashcard(args), 'manager'],
  graveyardFlashcard:     [(args) => graveyardFlashcard(args), 'manager'],
  restoreFlashcard:       [(args) => restoreFlashcard(args), 'manager'],
  generateQuizForCard:    [(args) => generateQuizForCard(args), 'manager'],
  approveQuiz:            [(args) => approveQuiz(args), 'manager'],
  bulkCreateFlashcards:   [(args) => bulkCreateFlashcards(args), 'manager'],
  getPendingQuizApprovals:[(args) => getPendingQuizApprovals(args), 'manager'],
}

/**
 * Execute a tool by name with given args and user context.
 * Enforces role-based access control.
 * @param {string} toolName - Function name from Gemini
 * @param {object} args - Arguments from Gemini
 * @param {object} context - { userId, role, store, empNum }
 * @returns {object} Tool result
 */
export async function executeTool(toolName, args, context) {
  const { role } = context || {}

  const entry = TOOL_REGISTRY[toolName]
  if (!entry) return { error: `Unknown tool: ${toolName}` }

  const [handler, requiredRole] = entry

  // Role-based access control
  if (requiredRole === 'staff' && !STAFF_ROLES.includes(role)) {
    return { error: 'You don\'t have permission to use this feature' }
  }
  if (requiredRole === 'manager' && !MANAGER_ROLES.includes(role)) {
    return { error: 'You don\'t have permission to use this feature' }
  }

  try {
    return await handler(args || {}, context || {})
  } catch (e) {
    console.error(`[charlieTools] ${toolName} error:`, e?.message)
    return { error: 'Something went wrong. Please try again.' }
  }
}
