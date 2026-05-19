import { useState, useEffect } from 'react'
import {
  READINESS_SCALE,
  READINESS_CATEGORIES,
  calculateReadinessAverage,
  getReadinessLabel,
  getReadinessColor,
} from '../data/readinessScale'

export default function ReadinessScoring({
  initialScores = {},
  onChange,
  isTrainer = false,
  readonly = false,
}) {
  const [scores, setScores] = useState({
    knowledge: initialScores.knowledge ?? null,
    execution: initialScores.execution ?? null,
    confidence: initialScores.confidence ?? null,
  })
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    setScores({
      knowledge: initialScores.knowledge ?? null,
      execution: initialScores.execution ?? null,
      confidence: initialScores.confidence ?? null,
    })
  }, [initialScores.knowledge, initialScores.execution, initialScores.confidence])

  useEffect(() => {
    const average = calculateReadinessAverage(scores.knowledge, scores.execution, scores.confidence)
    if (onChange) {
      onChange({ ...scores, average })
    }
  }, [scores.knowledge, scores.execution, scores.confidence])

  function handleScoreChange(category, value) {
    if (readonly || !isTrainer) return
    setScores((prev) => ({
      ...prev,
      [category]: value === '' ? null : parseInt(value, 10),
    }))
  }

  const average = calculateReadinessAverage(scores.knowledge, scores.execution, scores.confidence)
  const label = getReadinessLabel(average)
  const color = getReadinessColor(average)
  const allScoresSet = scores.knowledge && scores.execution && scores.confidence

  return (
    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-l-4 border-green-700 rounded-lg p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h4 className="text-lg font-bold text-green-900 dark:text-green-100 flex items-center gap-2 mb-2">
            ⭐ Trainee Readiness (Floor-Ready Score)
            {!isTrainer && (
              <span className="text-xs font-normal text-green-700 dark:text-green-300 bg-green-200 dark:bg-green-800 px-2 py-1 rounded">
                Trainer Only
              </span>
            )}
          </h4>
          <p className="text-sm text-green-800 dark:text-green-200 font-medium">
            Key question: <em>&quot;If I were cut from the floor right now, would this person be okay?&quot;</em>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 font-semibold text-sm underline ml-4"
        >
          {showHelp ? 'Hide Guide' : 'Show Guide'}
        </button>
      </div>

      {showHelp && (
        <div className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border-2 border-green-200 dark:border-green-700 shadow-sm">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 font-semibold">
            Score 1–5 for each category. Final score = average of all 3.
          </p>
          <div className="space-y-2">
            {READINESS_SCALE.map((scale) => (
              <div key={scale.value} className="flex items-start gap-2 text-xs">
                <span
                  className="font-bold px-2 py-1 rounded text-white flex-shrink-0"
                  style={{ backgroundColor: scale.color }}
                >
                  {scale.value}
                </span>
                <div>
                  <span className="font-bold">{scale.short}:</span>{' '}
                  <span className="text-gray-600 dark:text-gray-400">{scale.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4 mb-4">
        {READINESS_CATEGORIES.map((category) => (
          <div key={category.id} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-green-200 dark:border-green-700">
            <label className="block text-sm font-bold text-gray-900 dark:text-white mb-1">{category.label}</label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{category.description}</p>
            <div className="flex items-center gap-2">
              <select
                value={scores[category.id] ?? ''}
                onChange={(e) => handleScoreChange(category.id, e.target.value)}
                disabled={readonly || !isTrainer}
                className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">— Select Rating —</option>
                {READINESS_SCALE.map((scale) => (
                  <option key={scale.value} value={scale.value}>
                    {scale.label}
                  </option>
                ))}
              </select>
              {scores[category.id] && (
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className="text-2xl"
                      style={{ color: star <= scores[category.id] ? '#f57c00' : '#ddd' }}
                    >
                      {star <= scores[category.id] ? '★' : '☆'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-green-300 dark:border-green-600">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Final Readiness Score:</p>
            {allScoresSet ? (
              <div className="flex items-center gap-3">
                <div className="text-4xl font-black" style={{ color }}>
                  {average}
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className="text-xl"
                        style={{ color: star <= Math.round(average) ? color : '#ddd' }}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <p className="text-sm font-bold" style={{ color }}>
                    {label}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 italic">Complete all 3 categories to see final score</p>
            )}
          </div>
          {allScoresSet && (
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Average of:</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {scores.knowledge} + {scores.execution} + {scores.confidence}
              </p>
            </div>
          )}
        </div>
      </div>

      {!allScoresSet && isTrainer && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ <strong>Required:</strong> Manager cannot sign off until all 3 readiness categories are scored.
          </p>
        </div>
      )}
    </div>
  )
}
