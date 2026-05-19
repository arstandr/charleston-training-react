/**
 * Compact health summary for TraineeDashboard — verdict, score, link to full report.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { computeGeminiReadinessScore } from '../services/readinessScoreService'
import { REQUIRED_SHIFT_KEYS } from '../constants'

/** Local fallback when Gemini is unavailable — uses shift + test data from trainingData. */
function computeLocalFallback(trainingData) {
  if (!trainingData) return { score: 0, recommendation: 'Needs More Time' }
  const schedule = trainingData.schedule || {}

  // Shift completion (60%): signed shifts / required
  const signed = REQUIRED_SHIFT_KEYS.filter(k => {
    const s = schedule[k]
    return s && (s.trainerSigned || s.managerSigned)
  }).length
  const shiftPct = (signed / REQUIRED_SHIFT_KEYS.length) * 100

  // Test results (40%): passed / total from testResults on the record
  const tests = Object.values(trainingData.testResults || {})
  const testPct = tests.length > 0
    ? (tests.filter(t => t.passed).length / tests.length) * 100
    : 50 // neutral default when no tests taken yet

  const score = Math.round(shiftPct * 0.6 + testPct * 0.4)
  const recommendation = score >= 75 ? 'Ready' : score >= 50 ? 'Almost Ready' : 'Needs More Time'
  return { score, recommendation }
}

export default function HealthSummaryCard({ traineeId, traineeName, userId, trainingData }) {
  const navigate = useNavigate()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!traineeId || !userId) return
    setLoading(true)
    computeGeminiReadinessScore({ userId, traineeId, traineeName, trainingData })
      .then((r) => {
        if (!r.error && r.score > 0) setResult(r)
        else setResult(computeLocalFallback(trainingData))
      })
      .catch(() => {
        setResult(computeLocalFallback(trainingData))
      })
      .finally(() => setLoading(false))
  }, [traineeId, userId, traineeName, trainingData])

  if (!traineeId) return null

  const verdict = result?.recommendation || '—'
  const score = result?.score ?? '—'
  const verdictColor =
    verdict === 'Ready' ? 'bg-green-100 text-green-700' :
    verdict === 'Almost Ready' ? 'bg-amber-100 text-amber-700' :
    verdict === 'Needs More Time' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'

  return (
    <section className="mb-6 rounded-xl border-2 border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-10 w-20 animate-pulse rounded bg-gray-100" />
          ) : (
            <>
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${verdictColor}`}>
                {verdict}
              </span>
              <span className="text-2xl font-bold text-gray-800">{score}</span>
              <span className="text-sm text-gray-500">/ 100</span>
            </>
          )}
        </div>
        <button
          type="button"
          className="text-[var(--color-primary)] font-semibold hover:underline"
          onClick={() => navigate('/trainee/health')}
        >
          See full health report →
        </button>
      </div>
    </section>
  )
}
