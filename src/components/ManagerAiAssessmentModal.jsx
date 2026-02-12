import { useState, useMemo } from 'react'
import { getTraineeAssessment } from '../services/ai'
import { getTraineeReadinessAggregate } from '../utils/helpers'
import { getOfficialTestIds } from '../services/testAttemptResets'
import { PRETTY_TEST_NAMES } from '../data/quizDatabase'

const TEST_ATTEMPTS_KEY = 'testAttempts'

function loadTestAttempts() {
  try {
    return JSON.parse(localStorage.getItem(TEST_ATTEMPTS_KEY) || '{}') || {}
  } catch (_) {
    return {}
  }
}

function getTestScoresForTrainee(testAttempts, traineeId) {
  const officialIds = getOfficialTestIds()
  const parts = []
  for (const testId of officialIds) {
    const key = `${traineeId}_${testId}`
    const rec = testAttempts[key] || {}
    const scores = Array.isArray(rec.scores) ? rec.scores : []
    const best = scores.length ? Math.max(...scores) : null
    const name = PRETTY_TEST_NAMES[testId] || testId
    if (best != null) parts.push(`${name}: ${best}%`)
  }
  return parts.length ? parts.join(', ') : 'No test scores on this device'
}

export default function ManagerAiAssessmentModal({ open, traineeId, traineeName, trainingData, onClose }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [assessment, setAssessment] = useState(null)

  const readiness = useMemo(() => {
    if (!traineeId || !trainingData) return { average: null, count: 0 }
    return getTraineeReadinessAggregate(trainingData, traineeId)
  }, [traineeId, trainingData])

  const testAttempts = useMemo(() => loadTestAttempts(), [open])
  const testScoresText = useMemo(
    () => (traineeId ? getTestScoresForTrainee(testAttempts, traineeId) : ''),
    [traineeId, testAttempts, open]
  )

  const readinessScore = readiness.average != null ? Math.round((readiness.average / 3) * 5 * 10) / 10 : 0
  const readinessLabel = readiness.average != null ? `${readinessScore}/5` : 'No manager ratings yet'

  const handleGenerate = async () => {
    setError(null)
    setAssessment(null)
    setLoading(true)
    try {
      const text = await getTraineeAssessment(traineeName || traineeId, readinessLabel, testScoresText)
      setAssessment(text)
    } catch (e) {
      setError(e?.message || 'Assessment failed')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="rounded-xl bg-white shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800 mb-1">AI performance assessment</h2>
        <p className="text-sm text-gray-600 mb-4">{traineeName || traineeId}</p>
        <div className="mb-4 text-sm text-gray-700 space-y-1">
          <p><strong>Readiness:</strong> {readinessLabel}</p>
          <p><strong>Test scores:</strong> {testScoresText}</p>
        </div>
        <button
          type="button"
          className="btn btn-small mb-4"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? 'Generating…' : 'Generate assessment'}
        </button>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {assessment && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 whitespace-pre-wrap">
            {assessment}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
