import { stableCardId } from './helpers'

/**
 * The 4 scored practice tests and the flashcard set each draws from.
 * Shared by TestReadinessPanel (the visible per-test breakdown) and
 * PreCertBriefing (the AI-phrased summary of the same data) so the two
 * surfaces can never silently disagree about what "ready" means.
 */
export const TEST_PLAN = [
  { testId: 'bar_test', setId: 'bar-beer', label: 'Bar & Beer Test' },
  { testId: 'wines_test', setId: 'wines-cocktails', label: 'Wine & Cocktails Test' },
  { testId: 'soups_test', setId: 'starters-soups-salads', label: 'Starters, Soups & Salads Test' },
  { testId: 'steaks_test', setId: 'steaks-specialties', label: 'Steaks & Specialties Test' },
]

/**
 * Per-test mastery/readiness breakdown. Pulled out of TestReadinessPanel.jsx
 * verbatim (no behavior change there) so it has one home instead of being
 * trapped inside that component.
 *
 * @param {Object} params
 * @param {Object<string, Array>} params.cardSets - setId -> flashcard[] (from getActiveFlashcards per set)
 * @param {string[]} params.struggleIds - getStruggleCards() output
 * @param {string[]} params.masteredIds - getMasteredCards() output
 * @param {string[]} params.studiedIds - getStudiedCardIds() output
 * @param {(testId:string) => {count:number, passed:boolean, maxAttempts:number}} params.getAttempts
 * @param {(testId:string) => number} params.getRequiredScore
 * @param {(testId:string) => number|null} [params.getBestScore]
 */
export function computeTestReadiness({ cardSets, struggleIds, masteredIds, studiedIds, getAttempts, getRequiredScore, getBestScore }) {
  const allStruggleIds = new Set(struggleIds || [])
  const allMasteredIds = new Set(masteredIds || [])
  const allStudiedIds = new Set(studiedIds || [])

  return TEST_PLAN.map(({ testId, setId, label }) => {
    const cards = cardSets?.[setId] || []
    const total = cards.length

    const cardByStableId = {}
    cards.forEach((card) => {
      cardByStableId[stableCardId(setId, card)] = card
    })

    const prefix = setId + '_'
    const masteredInSet = [...allMasteredIds].filter((id) => id.startsWith(prefix))
    const struggleInSet = [...allStruggleIds].filter((id) => id.startsWith(prefix))
    const studiedInSet = [...allStudiedIds].filter((id) => id.startsWith(prefix))

    const masteredCount = masteredInSet.length
    const struggleCount = struggleInSet.length
    const studiedCount = studiedInSet.length
    const unstudiedCount = Math.max(0, total - studiedCount)

    const topStruggling = struggleInSet
      .slice(0, 4)
      .map((id) => cardByStableId[id])
      .filter(Boolean)
      .map((c) => c.front)

    const masteryPct = total > 0 ? Math.round(((studiedCount - struggleCount) / total) * 100) : 0

    const { count: attemptCount, passed, maxAttempts } = getAttempts?.(testId) || { count: 0, passed: false, maxAttempts: 2 }
    const requiredScore = getRequiredScore?.(testId) ?? 80
    const bestScore = getBestScore?.(testId) ?? null

    let readiness = 'not-started'
    if (passed) readiness = 'passed'
    else if (studiedCount === 0) readiness = 'not-started'
    else if (masteryPct >= 75) readiness = 'strong'
    else if (masteryPct >= 50) readiness = 'building'
    else readiness = 'early'

    return {
      testId, setId, label,
      total, masteredCount, studiedCount, struggleCount, unstudiedCount, masteryPct,
      topStruggling, readiness, passed, attemptCount, maxAttempts, requiredScore, bestScore,
    }
  })
}
