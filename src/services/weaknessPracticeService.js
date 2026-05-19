/**
 * Weakness Practice Service
 * Combines flashcard intelligence + quiz intelligence + weak spots
 * to build a targeted weakness report for the trainee.
 */
import { getStruggleTopicIds, getAllProgressForUser } from './flashcardIntelligenceService'
import { getWeakSpotsForPracticeTest } from './weakSpotsService'

/**
 * Build a weakness report for a trainee.
 * @param {string} userId - Firebase Auth UID
 * @param {Array} flashcardSets - all flashcard sets [{id, title, cards}]
 * @param {Array} quizAttempts - from useQuizAttempts or fetchAllQuizAttempts
 * @returns {Promise<{flashcardWeakSets, quizWeakTopics, weakSpotCount, recommendedActions}>}
 */
export async function getWeaknessReport(userId, flashcardSets, quizAttempts) {
  const empty = {
    flashcardWeakSets: [],
    quizWeakTopics: [],
    weakSpotCount: 0,
    recommendedActions: [],
  }
  if (!userId) return empty

  // 1. Flashcard weak areas
  const [struggleSetIds, progressRecords] = await Promise.all([
    getStruggleTopicIds(userId).catch(() => []),
    getAllProgressForUser(userId).catch(() => []),
  ])

  // Count struggle cards per set
  const struggleCountBySet = {}
  progressRecords.forEach((r) => {
    if ((r.needsPracticeCount || 0) > 0 || r.lastResult === 'needsPractice') {
      const setId = (r.cardId || '').includes('_') ? (r.cardId || '').split('_')[0] : r.cardId
      if (setId) struggleCountBySet[setId] = (struggleCountBySet[setId] || 0) + 1
    }
  })

  const flashcardWeakSets = (flashcardSets || [])
    .filter((s) => struggleSetIds.includes(s.id) || struggleCountBySet[s.id])
    .map((s) => ({
      setId: s.id,
      title: s.title || s.id,
      struggleCount: struggleCountBySet[s.id] || 0,
      totalCards: Array.isArray(s.cards) ? s.cards.length : 0,
    }))
    .sort((a, b) => b.struggleCount - a.struggleCount)

  // 2. Quiz weak topics (from quizAttempts)
  const topicStats = {}
  ;(quizAttempts || []).forEach((a) => {
    if ((a.userId || '') !== userId) return
    const topic = a.quizId || a.topic || ''
    if (!topic) return
    if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 }
    topicStats[topic].total++
    if (a.correct || a.passed) topicStats[topic].correct++
  })

  const quizWeakTopics = Object.entries(topicStats)
    .map(([topic, stats]) => ({
      topic,
      successRate: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      total: stats.total,
      severity: stats.total > 0 ? Math.round(((stats.total - stats.correct) / stats.total) * 100) : 0,
    }))
    .filter((t) => t.successRate < 60 && t.total >= 2)
    .sort((a, b) => a.successRate - b.successRate)

  // 3. Weak spots count
  let weakSpotCount = 0
  try {
    const ws = await getWeakSpotsForPracticeTest(userId, null, 50)
    weakSpotCount = ws.length
  } catch (_) {}

  // 4. Build recommended actions (priority sorted)
  const recommendedActions = []

  // Flashcard actions first (worst areas)
  flashcardWeakSets.slice(0, 3).forEach((s) => {
    recommendedActions.push({
      type: 'flashcards',
      setId: s.setId,
      label: `Practice ${s.title} flashcards (${s.struggleCount} struggling)`,
      priority: s.struggleCount,
    })
  })

  // Quiz actions
  const TEST_MAP = {
    bar_test: 'bar-beer',
    wines_test: 'wines-cocktails',
    soups_test: 'starters-soups-salads',
    steaks_test: 'steaks-specialties',
  }
  quizWeakTopics.slice(0, 3).forEach((t) => {
    recommendedActions.push({
      type: 'quiz',
      testId: t.topic,
      setId: TEST_MAP[t.topic] || null,
      label: `Practice ${t.topic.replace(/_/g, ' ')} quiz (${t.successRate}% success)`,
      priority: 100 - t.successRate,
    })
  })

  // Weak spots action
  if (weakSpotCount > 0) {
    recommendedActions.push({
      type: 'weakSpots',
      label: `Review ${weakSpotCount} weak spot${weakSpotCount > 1 ? 's' : ''}`,
      priority: weakSpotCount * 5,
    })
  }

  // Sort by priority descending
  recommendedActions.sort((a, b) => b.priority - a.priority)

  return { flashcardWeakSets, quizWeakTopics, weakSpotCount, recommendedActions }
}
