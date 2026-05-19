/**
 * Quiz Intelligence Service - smart question selection, weighting, analytics, spaced repetition.
 * 100% Firestore: quiz cache in quizCache; optional async helpers read quizAttempts by userId.
 * Accepts app question shape { q, opts, ans, exp } or normalized { id, question, options, correctAnswer, topic }.
 */
import { doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

const QUIZ_ATTEMPTS_COLLECTION = 'quizAttempts'
const MAX_ATTEMPTS_LOAD = 500

const CACHE_PREFIX = 'intel_'
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ---------------------------------------------------------------------------
// NORMALIZE QUESTION SHAPE
// ---------------------------------------------------------------------------

/**
 * Normalize app shape to service shape. If q exists, treat as app shape.
 * @param {object} raw - { q, opts, ans, exp } or { id, question, options, correctAnswer, topic }
 * @param {string} testId - for deriving topic and id when missing
 * @param {number} index - for deriving id when missing
 */
export function normalizeQuestion(raw, testId = '', index = 0) {
  if (!raw) return null
  if (raw.q != null) {
    const id = raw.id || `${testId}_${index}`
    return {
      id,
      question: raw.q,
      options: raw.opts || [],
      correctAnswer: raw.ans ?? 0,
      explanation: raw.exp,
      topic: raw.topic || testId || 'uncategorized',
      category: raw.category || raw.topic || testId || 'uncategorized',
    }
  }
  return {
    id: raw.id || `${testId}_${index}`,
    question: raw.question || raw.q,
    options: raw.options || raw.opts || [],
    correctAnswer: raw.correctAnswer ?? raw.ans ?? 0,
    explanation: raw.explanation || raw.exp,
    topic: raw.topic || testId || 'uncategorized',
    category: raw.category || raw.topic || testId || 'uncategorized',
  }
}

// ---------------------------------------------------------------------------
// QUIZ CACHE
// ---------------------------------------------------------------------------

export function getQuizCacheHash(quizId, filters = {}) {
  const parts = [
    quizId,
    filters.category || 'all',
    filters.difficulty || 'all',
    filters.topic || 'all',
  ]
  return CACHE_PREFIX + parts.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')
}

export async function loadQuizFromCache(cacheKey) {
  if (!db) return null
  try {
    const ref = doc(db, 'quizCache', cacheKey)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    const data = snap.data()
    const cachedAt = data.cachedAt ? new Date(data.cachedAt).getTime() : 0
    if (Date.now() - cachedAt > MAX_CACHE_AGE_MS) return null
    return {
      questions: data.questions || [],
      metadata: data.metadata || {},
      cachedAt: data.cachedAt,
    }
  } catch (e) {
    console.error('Error loading quiz cache:', e)
    return null
  }
}

export async function saveQuizToCache(cacheKey, questions, metadata = {}) {
  if (!db) return false
  try {
    const ref = doc(db, 'quizCache', cacheKey)
    await setDoc(ref, {
      questions: questions || [],
      metadata: {
        ...metadata,
        questionCount: (questions || []).length,
        categories: [...new Set((questions || []).map((q) => (q.topic || q.category)).filter(Boolean))],
      },
      cachedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    return true
  } catch (e) {
    console.error('Error saving quiz cache:', e)
    return false
  }
}

// ---------------------------------------------------------------------------
// WEIGHTING & SELECTION
// ---------------------------------------------------------------------------

export function calculateQuestionWeight(question, userAttempts = []) {
  const qid = question.id || question.question
  const questionAttempts = (userAttempts || []).filter((a) => a.questionId === qid)
  if (questionAttempts.length === 0) return 3.0
  const correctAttempts = questionAttempts.filter((a) => a.correct).length
  const successRate = correctAttempts / questionAttempts.length
  let weight = 1.0
  if (successRate < 0.3) weight = 2.5
  else if (successRate < 0.6) weight = 1.8
  else if (successRate < 0.9) weight = 1.2
  else weight = 0.5
  const lastAttempt = questionAttempts[questionAttempts.length - 1]
  if (lastAttempt && lastAttempt.timestamp) {
    const daysSince = (Date.now() - new Date(lastAttempt.timestamp).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince > 30) weight *= 2.0
    else if (daysSince > 14) weight *= 1.5
    else if (daysSince > 7) weight *= 1.2
    else if (daysSince < 1) weight *= 0.3
  }
  const recent3 = questionAttempts.slice(-3)
  const recentFailures = recent3.filter((a) => !a.correct).length
  if (recentFailures >= 2) weight *= 1.5
  return Math.max(0.1, Math.min(5.0, weight))
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function selectWeightedQuestions(questions, userAttempts = [], count = 10) {
  if (!questions || questions.length === 0) return []
  const normalized = questions.map((q, i) => normalizeQuestion(q, '', i))
  if (normalized.length <= count) return shuffleArray(normalized)
  const weighted = normalized.map((q) => ({
    question: q,
    weight: calculateQuestionWeight(q, userAttempts),
  }))
  const sorted = weighted.sort((a, b) => (b.weight + (Math.random() - 0.5) * 0.3) - (a.weight + (Math.random() - 0.5) * 0.3))
  const pool = sorted.slice(0, Math.min(count * 3, sorted.length))
  const selected = []
  while (selected.length < count && pool.length > 0) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0)
    let r = Math.random() * totalWeight
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight
      if (r <= 0) {
        selected.push(pool[i].question)
        pool.splice(i, 1)
        break
      }
    }
  }
  return shuffleArray(selected)
}

// ---------------------------------------------------------------------------
// STRUGGLE / STRENGTH TOPICS
// ---------------------------------------------------------------------------

export function identifyStruggleTopics(quizAttempts, threshold = 0.6) {
  const topicStats = {}
  ;(quizAttempts || []).forEach((attempt) => {
    const topic = attempt.topic || attempt.category || 'uncategorized'
    if (!topicStats[topic]) topicStats[topic] = { topic, totalAttempts: 0, correctAttempts: 0 }
    topicStats[topic].totalAttempts++
    if (attempt.correct) topicStats[topic].correctAttempts++
  })
  const struggleTopics = []
  Object.values(topicStats).forEach((stat) => {
    const successRate = stat.totalAttempts ? stat.correctAttempts / stat.totalAttempts : 0
    if (successRate < threshold && stat.totalAttempts >= 3) {
      struggleTopics.push({
        topic: stat.topic,
        successRate,
        totalAttempts: stat.totalAttempts,
        correctAttempts: stat.correctAttempts,
        severity: successRate < 0.3 ? 'high' : successRate < 0.5 ? 'medium' : 'low',
      })
    }
  })
  return struggleTopics.sort((a, b) => a.successRate - b.successRate)
}

export function identifyStrengthTopics(quizAttempts, threshold = 0.85) {
  const topicStats = {}
  ;(quizAttempts || []).forEach((attempt) => {
    const topic = attempt.topic || attempt.category || 'uncategorized'
    if (!topicStats[topic]) topicStats[topic] = { topic, totalAttempts: 0, correctAttempts: 0 }
    topicStats[topic].totalAttempts++
    if (attempt.correct) topicStats[topic].correctAttempts++
  })
  const strongTopics = []
  Object.values(topicStats).forEach((stat) => {
    const successRate = stat.totalAttempts ? stat.correctAttempts / stat.totalAttempts : 0
    if (successRate >= threshold && stat.totalAttempts >= 5) {
      strongTopics.push({
        topic: stat.topic,
        successRate,
        totalAttempts: stat.totalAttempts,
        correctAttempts: stat.correctAttempts,
      })
    }
  })
  return strongTopics.sort((a, b) => b.successRate - a.successRate)
}

// ---------------------------------------------------------------------------
// QUESTION-TO-FLASHCARD LINKING
// ---------------------------------------------------------------------------

export function linkQuestionToFlashcards(question, flashcards) {
  const q = normalizeQuestion(question)
  const questionText = `${q.question} ${q.explanation || ''}`.toLowerCase()
  const words = questionText.split(/\s+/).filter((w) => w.length > 3)
  const scores = (flashcards || []).map((card) => {
    const cardText = `${card.title || ''} ${card.front || ''} ${card.back || ''}`.toLowerCase()
    let matchCount = 0
    words.forEach((word) => {
      if (cardText.includes(word)) matchCount++
    })
    const score = words.length ? matchCount / words.length : 0
    return { flashcard: card, score }
  })
  return scores
    .filter((s) => s.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .map((s) => ({
      flashcardId: s.flashcard.id,
      flashcardTitle: s.flashcard.title || s.flashcard.front,
      relevanceScore: s.score,
    }))
}

export function linkQuestionsToFlashcards(questions, flashcards) {
  return (questions || []).map((q, i) => ({
    ...normalizeQuestion(q, '', i),
    relatedFlashcards: linkQuestionToFlashcards(q, flashcards),
  }))
}

// ---------------------------------------------------------------------------
// ANALYTICS
// ---------------------------------------------------------------------------

export function analyzeQuizResults(questions, answers, userAttempts = []) {
  const totalQuestions = (questions || []).length
  const correctAnswers = (answers || []).filter((a) => a.correct).length
  const score = totalQuestions ? (correctAnswers / totalQuestions) * 100 : 0
  const passed = score >= 80
  const totalTime = (answers || []).reduce((sum, a) => sum + (a.timeSpent || 0), 0)
  const avgTimePerQuestion = totalQuestions ? totalTime / totalQuestions : 0
  const missedQuestions = (answers || []).filter((a) => !a.correct)
  const missedTopics = {}
  const normQuestions = (questions || []).map((q, i) => normalizeQuestion(q, '', i))
  const prettyTopicName = (raw) => {
    if (!raw || raw === 'uncategorized') return 'General'
    return raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bTest\b/i, '').trim() || 'General'
  }
  missedQuestions.forEach((answer) => {
    const q = normQuestions.find((qu) => qu.id === answer.questionId) || normQuestions[answers.indexOf(answer)]
    const rawTopic = (q && (q.topic || q.category)) || answer.topic || 'uncategorized'
    const topic = prettyTopicName(rawTopic)
    if (!missedTopics[topic]) missedTopics[topic] = { topic, questionsMissed: 0, questions: [] }
    missedTopics[topic].questionsMissed++
    if (q) missedTopics[topic].questions.push(q)
  })
  const missedTopicsArray = Object.values(missedTopics).sort((a, b) => b.questionsMissed - a.questionsMissed)
  const struggleTopics = identifyStruggleTopics(userAttempts)
  const insights = []
  if (passed) insights.push({ type: 'success', message: `Great job! You passed with ${score.toFixed(1)}%` })
  else insights.push({ type: 'warning', message: `You scored ${score.toFixed(1)}%. You need 80% to pass.` })
  if (avgTimePerQuestion > 0 && avgTimePerQuestion < 15) {
    insights.push({ type: 'info', message: 'You answered very quickly. Consider taking more time to review each question.' })
  }
  if (missedTopicsArray.length > 0) {
    const top = missedTopicsArray[0]
    insights.push({ type: 'warning', message: `Focus on ${top.topic} - you missed ${top.questionsMissed} questions in this area.` })
  }
  if (struggleTopics.length > 0) {
    insights.push({
      type: 'suggestion',
      message: `Based on your history, review: ${struggleTopics.slice(0, 3).map((t) => t.topic).join(', ')}`,
    })
  }
  return {
    score,
    passed,
    totalQuestions,
    correctAnswers,
    incorrectAnswers: totalQuestions - correctAnswers,
    totalTime,
    avgTimePerQuestion,
    missedTopics: missedTopicsArray,
    struggleTopics,
    insights,
    performanceLevel: score >= 90 ? 'excellent' : score >= 80 ? 'good' : score >= 70 ? 'fair' : 'needs-improvement',
  }
}

// ---------------------------------------------------------------------------
// SPACED REPETITION
// ---------------------------------------------------------------------------

export function calculateNextReview(questionId, userAttempts, correct) {
  const questionAttempts = (userAttempts || []).filter((a) => a.questionId === questionId)
  let interval = 1
  let easeFactor = 2.5
  let repetitions = 0
  if (questionAttempts.length > 0) {
    const last = questionAttempts[questionAttempts.length - 1]
    interval = last.interval || 1
    easeFactor = last.easeFactor || 2.5
    repetitions = last.repetitions || 0
  }
  if (correct) {
    repetitions++
    if (repetitions === 1) interval = 1
    else if (repetitions === 2) interval = 6
    else interval = Math.round(interval * easeFactor)
    easeFactor = Math.max(1.3, easeFactor + 0.1)
  } else {
    repetitions = 0
    interval = 1
    easeFactor = Math.max(1.3, easeFactor - 0.2)
  }
  const nextReviewDate = new Date()
  nextReviewDate.setDate(nextReviewDate.getDate() + interval)
  return {
    nextReviewDate: nextReviewDate.toISOString(),
    interval,
    easeFactor,
    repetitions,
  }
}

export function getQuestionsForReview(questions, userAttempts) {
  const now = new Date()
  const norm = (questions || []).map((q, i) => normalizeQuestion(q, '', i))
  return norm.filter((question) => {
    const questionAttempts = (userAttempts || []).filter((a) => a.questionId === question.id)
    if (questionAttempts.length === 0) return true
    const last = questionAttempts[questionAttempts.length - 1]
    if (!last.nextReviewDate) return true
    return now >= new Date(last.nextReviewDate)
  })
}

// ---------------------------------------------------------------------------
// ADAPTIVE DIFFICULTY
// ---------------------------------------------------------------------------

export function calculateAdaptiveDifficulty(userAttempts, currentDifficulty = 'medium') {
  if (!userAttempts || userAttempts.length < 10) return { newDifficulty: currentDifficulty, reason: 'Not enough data' }
  const recent = userAttempts.slice(-20)
  const successRate = recent.filter((a) => a.correct).length / recent.length
  const levels = ['easy', 'medium', 'hard', 'expert']
  const idx = levels.indexOf(currentDifficulty)
  if (successRate >= 0.9 && idx < levels.length - 1) {
    return { newDifficulty: levels[idx + 1], reason: 'High success rate - ready for harder questions' }
  }
  if (successRate < 0.5 && idx > 0) {
    return { newDifficulty: levels[idx - 1], reason: 'Low success rate - need easier questions to build confidence' }
  }
  return { newDifficulty: currentDifficulty, reason: 'Current difficulty level is appropriate' }
}

// ---------------------------------------------------------------------------
// PERFORMANCE METRICS
// ---------------------------------------------------------------------------

export function calculatePerformanceMetrics(userAttempts) {
  if (!userAttempts || userAttempts.length === 0) {
    return {
      overallSuccessRate: 0,
      recentSuccessRate: 0,
      trend: 'no-data',
      totalAttempts: 0,
      totalQuizzes: 0,
      averageScore: 0,
      bestScore: 0,
      worstScore: 0,
    }
  }
  const correctCount = userAttempts.filter((a) => a.correct).length
  const overallSuccessRate = (correctCount / userAttempts.length) * 100
  const recent = userAttempts.slice(-50)
  const recentCorrect = recent.filter((a) => a.correct).length
  const recentSuccessRate = recent.length ? (recentCorrect / recent.length) * 100 : 0
  let trend = 'stable'
  if (recentSuccessRate > overallSuccessRate + 10) trend = 'improving'
  else if (recentSuccessRate < overallSuccessRate - 10) trend = 'declining'
  const bySession = {}
  userAttempts.forEach((a) => {
    const sid = a.quizSessionId || a.timestamp
    if (!bySession[sid]) bySession[sid] = []
    bySession[sid].push(a)
  })
  const totalQuizzes = Object.keys(bySession).length
  const quizScores = Object.values(bySession).map((session) => {
    const c = session.filter((a) => a.correct).length
    return session.length ? (c / session.length) * 100 : 0
  })
  const averageScore = quizScores.length ? quizScores.reduce((s, n) => s + n, 0) / quizScores.length : 0
  const bestScore = quizScores.length ? Math.max(...quizScores) : 0
  const worstScore = quizScores.length ? Math.min(...quizScores) : 0
  return {
    overallSuccessRate,
    recentSuccessRate,
    trend,
    totalAttempts: userAttempts.length,
    totalQuizzes,
    averageScore,
    bestScore,
    worstScore,
  }
}

// ---------------------------------------------------------------------------
// FIRESTORE-BACKED ASYNC HELPERS (no localStorage)
// ---------------------------------------------------------------------------

/**
 * Load quiz attempts for a user from Firestore. Use with selectWeightedQuestions / identifyStruggleTopics.
 */
export async function getQuizAttemptsForUser(userId) {
  if (!userId || !db) return []
  try {
    const ref = collection(db, QUIZ_ATTEMPTS_COLLECTION)
    const q = query(
      ref,
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(MAX_ATTEMPTS_LOAD)
    )
    const snapshot = await getDocs(q)
    const list = []
    snapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() })
    })
    return list
  } catch (e) {
    console.error('getQuizAttemptsForUser:', e)
    return []
  }
}

/**
 * Async: calculate question weight from Firestore attempts for userId.
 */
export async function calculateQuestionWeightFromFirestore(question, userId) {
  const attempts = await getQuizAttemptsForUser(userId)
  return calculateQuestionWeight(question, attempts)
}

/**
 * Async: select weighted questions using Firestore attempts for userId.
 */
export async function selectWeightedQuestionsFromFirestore(questions, userId, count = 10) {
  const attempts = await getQuizAttemptsForUser(userId)
  return selectWeightedQuestions(questions, attempts, count)
}

/**
 * Async: identify struggle topics from Firestore attempts for userId.
 */
export async function identifyStruggleTopicsFromFirestore(userId, threshold = 0.6) {
  const attempts = await getQuizAttemptsForUser(userId)
  return identifyStruggleTopics(attempts, threshold)
}
