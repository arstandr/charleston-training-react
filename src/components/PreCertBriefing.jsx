import { useState, useEffect, useMemo } from 'react'
import { getActiveFlashcards } from '../services/flashcardService'
import { TEST_PLAN, computeTestReadiness } from '../utils/testReadiness'
import { getPreCertBriefing } from '../services/ai'

function cacheKey(traineeId) {
  const today = new Date().toISOString().slice(0, 10)
  return `preCertBriefing_${traineeId}_${today}`
}

/**
 * AI-phrased version of TestReadinessPanel's data — same computation
 * (utils/testReadiness.js), just turned into a short personalized summary
 * instead of a bar-chart breakdown. One Gemini call per day per trainee
 * (cached in localStorage), not per dashboard visit.
 */
export default function PreCertBriefing({ traineeId, traineeName, getStruggleCards, getMasteredCards, getStudiedCardIds, getAttempts, getRequiredScore, getBestScore }) {
  const [cardSets, setCardSets] = useState({})
  const [loading, setLoading] = useState(true)
  const [briefing, setBriefing] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all(
      TEST_PLAN.map(({ setId }) =>
        getActiveFlashcards(setId).then((cards) => ({ setId, cards })).catch(() => ({ setId, cards: [] }))
      )
    ).then((results) => {
      if (cancelled) return
      const map = {}
      results.forEach(({ setId, cards }) => { map[setId] = cards })
      setCardSets(map)
    })
    return () => { cancelled = true }
  }, [])

  const testData = useMemo(() => computeTestReadiness({
    cardSets,
    struggleIds: getStruggleCards?.() || [],
    masteredIds: getMasteredCards?.() || [],
    studiedIds: getStudiedCardIds?.() || [],
    getAttempts,
    getRequiredScore,
    getBestScore,
  }), [cardSets, getStruggleCards, getMasteredCards, getStudiedCardIds, getAttempts, getRequiredScore, getBestScore])

  useEffect(() => {
    if (!traineeId || Object.keys(cardSets).length === 0) return
    const key = cacheKey(traineeId)
    try {
      const cached = localStorage.getItem(key)
      if (cached) {
        setBriefing(cached)
        setLoading(false)
        return
      }
    } catch (_) {}

    let cancelled = false
    getPreCertBriefing(traineeName, testData)
      .then((text) => {
        if (cancelled) return
        setBriefing(text)
        try { localStorage.setItem(key, text) } catch (_) {}
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traineeId, cardSets])

  if (error) return null // fail silently — this is a nice-to-have, not core dashboard function

  return (
    <section className="mb-6 rounded-xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-green-50 to-white p-4">
      <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide text-[var(--color-primary)]">Today's Focus</h3>
      {loading ? (
        <div className="flex items-center gap-2 py-1">
          <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-[var(--color-primary)] rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Putting together your briefing…</span>
        </div>
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed">{briefing}</p>
      )}
    </section>
  )
}
