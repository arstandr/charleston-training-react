import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActiveFlashcards } from '../services/flashcardService'
import { TEST_PLAN, computeTestReadiness } from '../utils/testReadiness'

/**
 * TestReadinessPanel — per-test mastery breakdown for the trainee.
 * Shows total cards, mastered, struggling, and not yet studied.
 * Links directly to focus-mode flashcards and practice tests.
 *
 * Props:
 *   getStruggleCards(setId) — sync, returns string[] of ALL struggle cardIds (ignore setId param)
 *   getMasteredCards(setId) — sync, returns string[] of ALL mastered cardIds (ignore setId param)
 *   getAttempts(testId)     — sync, returns { count, passed, scores, maxAttempts }
 *   getRequiredScore(testId)— sync, returns number (80/85/90)
 */
export default function TestReadinessPanel({
  getStruggleCards,
  getMasteredCards,
  getStudiedCardIds,
  getAttempts,
  getRequiredScore,
  getBestScore,
}) {
  const navigate = useNavigate()
  const [cardSets, setCardSets] = useState({}) // setId → Card[]
  const [loading, setLoading] = useState(true)

  // Load active cards for all 4 test sets in parallel
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all(
      TEST_PLAN.map(({ setId }) =>
        getActiveFlashcards(setId)
          .then((cards) => ({ setId, cards }))
          .catch(() => ({ setId, cards: [] }))
      )
    ).then((results) => {
      if (cancelled) return
      const map = {}
      results.forEach(({ setId, cards }) => { map[setId] = cards })
      setCardSets(map)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  // Per-test computed data (shared with PreCertBriefing via utils/testReadiness)
  const testData = useMemo(() => computeTestReadiness({
    cardSets,
    struggleIds: getStruggleCards?.() || [],
    masteredIds: getMasteredCards?.() || [],
    studiedIds: getStudiedCardIds?.() || [],
    getAttempts,
    getRequiredScore,
    getBestScore,
  }), [cardSets, getStruggleCards, getMasteredCards, getStudiedCardIds, getAttempts, getRequiredScore, getBestScore])

  if (loading) {
    return (
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Test Readiness</h3>
        <div className="flex items-center gap-2 py-4">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-[var(--color-primary)] rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading your progress…</span>
        </div>
      </section>
    )
  }

  const borderColor = {
    'passed':      'border-l-green-500',
    'strong':      'border-l-green-400',
    'building':    'border-l-amber-400',
    'early':       'border-l-red-400',
    'not-started': 'border-l-gray-300',
  }
  const barColor = {
    'passed':      'bg-green-500',
    'strong':      'bg-green-400',
    'building':    'bg-amber-400',
    'early':       'bg-red-400',
    'not-started': 'bg-gray-200',
  }

  return (
    <section className="mb-6">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Test Readiness</h3>
      <div className="space-y-3">
        {testData.map((t) => (
          <div
            key={t.testId}
            className={`rounded-xl border border-gray-200 border-l-4 ${borderColor[t.readiness]} bg-white p-4 shadow-sm`}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h4 className="font-bold text-gray-800 text-sm">{t.label}</h4>
                {t.passed ? (
                  <span className="inline-block mt-0.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Passed ✓{t.bestScore != null && t.bestScore > 0 ? ` · ${t.bestScore}%` : ''}
                  </span>
                ) : t.total === 0 ? null : (
                  <span className="text-xs text-gray-500 mt-0.5 inline-block">
                    Need {t.requiredScore}% to pass (attempt {t.attemptCount + 1})
                  </span>
                )}
              </div>
              {t.total > 0 && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  t.readiness === 'passed' || t.readiness === 'strong' ? 'bg-green-100 text-green-800' :
                  t.readiness === 'building' ? 'bg-amber-100 text-amber-800' :
                  t.readiness === 'early' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {t.masteryPct}% cards mastered
                </span>
              )}
            </div>

            {/* Mastery progress bar */}
            {t.total > 0 && (
              <div className="mt-2">
                <div className="flex h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full transition-all ${barColor[t.readiness]}`}
                    style={{ width: `${t.masteryPct}%` }}
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                  {t.masteredCount > 0 && (
                    <span className="text-green-700">{t.masteredCount} mastered</span>
                  )}
                  {(t.studiedCount - t.masteredCount - t.struggleCount) > 0 && (
                    <span className="text-blue-600">{t.studiedCount - t.masteredCount - t.struggleCount} in progress</span>
                  )}
                  {t.struggleCount > 0 && (
                    <span className="text-red-600">{t.struggleCount} struggling</span>
                  )}
                  {t.unstudiedCount > 0 && (
                    <span>{t.unstudiedCount} not studied</span>
                  )}
                  <span className="text-gray-400">of {t.total} cards</span>
                </div>
              </div>
            )}

            {t.total === 0 && (
              <p className="mt-1 text-xs text-gray-400">No cards loaded</p>
            )}

            {/* Top struggling cards */}
            {t.topStruggling.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-red-600 mb-1">Struggling with:</p>
                <ul className="space-y-0.5">
                  {t.topStruggling.map((front, i) => (
                    <li key={i} className="text-xs text-gray-600 truncate">
                      • {front}
                    </li>
                  ))}
                  {t.struggleCount > 4 && (
                    <li className="text-xs text-gray-400">+ {t.struggleCount - 4} more</li>
                  )}
                </ul>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex flex-wrap gap-2">
              {t.struggleCount > 0 && (
                <button
                  type="button"
                  className="btn btn-small bg-red-600 border-red-600 text-white hover:bg-red-700 hover:border-red-700 text-xs"
                  onClick={() => navigate(`/flashcards?set=${encodeURIComponent(t.setId)}&focus=1`)}
                >
                  Focus Study ({t.struggleCount})
                </button>
              )}
              {t.readiness === 'not-started' && (
                <button
                  type="button"
                  className="btn btn-small text-xs"
                  onClick={() => navigate(`/flashcards?set=${encodeURIComponent(t.setId)}`)}
                >
                  Start Flashcards
                </button>
              )}
              <button
                type="button"
                className="btn btn-small btn-secondary text-xs"
                onClick={() => navigate(`/quizzes?test=${encodeURIComponent(t.testId)}&mode=practice`)}
              >
                Practice Test
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
