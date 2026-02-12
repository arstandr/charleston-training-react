import { useState, useEffect } from 'react'
import { formatWhenHuman } from '../utils/helpers'
import { MANAGER_ASSESSMENT_CONFIG } from '../data/assessmentConfig'

const RATING_OPTS = [
  { value: 1, label: 'Needs Work (1)' },
  { value: 2, label: 'Good (2)' },
  { value: 3, label: 'Pro (3)' },
]

export default function ManagerAssessSignModal({ open, row, onSign, onClose }) {
  const [legacyKnowledge, setLegacyKnowledge] = useState('')
  const [legacyExecution, setLegacyExecution] = useState('')
  const [legacyConfidence, setLegacyConfidence] = useState('')
  const [questionScores, setQuestionScores] = useState({})

  const config = row?.shiftKey ? MANAGER_ASSESSMENT_CONFIG[row.shiftKey] : null
  const questions = config?.questions || []

  useEffect(() => {
    if (!open || !row) return
    setQuestionScores({})
    setLegacyKnowledge('')
    setLegacyExecution('')
    setLegacyConfidence('')
  }, [open, row])

  const setScore = (questionId, value) => {
    setQuestionScores((prev) => ({ ...prev, [questionId]: value === '' ? undefined : Number(value) }))
  }

  const handleSign = () => {
    if (config && questions.length > 0) {
      const values = questions.map((q) => questionScores[q.id]).filter((v) => v != null && v >= 1 && v <= 3)
      const managerScore = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : undefined
      const readiness = {}
      questions.forEach((q) => {
        const v = questionScores[q.id]
        if (v != null) readiness[q.id] = v
      })
      onSign({ readiness, managerScore })
    } else {
      const readiness = {
        knowledge: legacyKnowledge ? Number(legacyKnowledge) : undefined,
        execution: legacyExecution ? Number(legacyExecution) : undefined,
        confidence: legacyConfidence ? Number(legacyConfidence) : undefined,
      }
      onSign({ readiness, managerScore: undefined })
    }
    onClose()
  }

  const canSubmit = config && questions.length > 0
    ? questions.some((q) => questionScores[q.id] != null)
    : true

  if (!open || !row) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800">Assess &amp; sign</h2>
        <p className="mt-1 text-sm text-gray-600">
          {row.traineeName} · {row.shiftLabel || row.shiftKey}
        </p>
        {row.when && (
          <p className="text-xs text-gray-500 mt-0.5">{formatWhenHuman(row.when)}</p>
        )}

        {config && questions.length > 0 ? (
          <>
            <p className="mt-4 mb-3 text-sm font-medium text-gray-700">{config.title}</p>
            <p className="mb-3 text-xs text-gray-500">Rate each: Needs Work (1), Good (2), Pro (3)</p>
            <div className="space-y-4">
              {questions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium text-gray-800 mb-0.5">{q.label}</label>
                  <p className="text-xs text-gray-500 mb-2">{q.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {RATING_OPTS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          questionScores[q.id] === opt.value
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-gray-900'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                        onClick={() => setScore(q.id, questionScores[q.id] === opt.value ? undefined : opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 mb-3 text-sm text-gray-600">Rate readiness (1–3, optional)</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Knowledge</label>
                <select
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={legacyKnowledge}
                  onChange={(e) => setLegacyKnowledge(e.target.value)}
                >
                  <option value="">—</option>
                  {RATING_OPTS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Execution</label>
                <select
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={legacyExecution}
                  onChange={(e) => setLegacyExecution(e.target.value)}
                >
                  <option value="">—</option>
                  {RATING_OPTS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Confidence</label>
                <select
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={legacyConfidence}
                  onChange={(e) => setLegacyConfidence(e.target.value)}
                >
                  <option value="">—</option>
                  {RATING_OPTS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        <div className="mt-6 flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={handleSign} disabled={config && questions.length > 0 && !canSubmit}>
            Sign off
          </button>
        </div>
      </div>
    </div>
  )
}
