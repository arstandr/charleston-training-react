import { useState } from 'react'
import { getScenariosForShift } from '../data/standardsData'

export default function StandardsQuizModal({ open, shiftKey, shiftLabel, onClose }) {
  const scenarios = open && shiftKey ? getScenariosForShift(shiftKey) : []
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [results, setResults] = useState({})
  const [showSummary, setShowSummary] = useState(false)

  if (!open || !shiftKey) return null

  const current = scenarios[index]
  const isFirst = index === 0
  const isLast = index >= scenarios.length - 1
  const correctCount = Object.values(results).filter((v) => v === 'correct').length
  const incorrectCount = Object.values(results).filter((v) => v === 'incorrect').length
  const answeredCount = correctCount + incorrectCount

  const handleMark = (mark) => {
    setResults((prev) => ({ ...prev, [index]: mark }))
    if (isLast) {
      setShowSummary(true)
    } else {
      setIndex((i) => i + 1)
      setRevealed(false)
    }
  }

  const handleBack = () => {
    if (showSummary) {
      setShowSummary(false)
      return
    }
    if (isFirst) return
    setIndex((i) => i - 1)
    setRevealed(false)
  }

  const handleClose = () => {
    setIndex(0)
    setRevealed(false)
    setResults({})
    setShowSummary(false)
    onClose()
  }

  if (showSummary) {
    const pct = scenarios.length > 0 ? Math.round((correctCount / scenarios.length) * 100) : 0
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleClose}>
        <div
          className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-xl font-bold text-gray-800">Quiz Summary</h2>
          <p className="mt-1 text-sm text-gray-500">{shiftLabel || shiftKey}</p>
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-gray-800">{pct}%</span>
              <span className="text-gray-600">({correctCount} of {scenarios.length} correct)</span>
            </div>
            <div className="flex gap-2">
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                {correctCount} correct
              </span>
              <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                {incorrectCount} incorrect
              </span>
              {scenarios.length - answeredCount > 0 && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
                  {scenarios.length - answeredCount} skipped
                </span>
              )}
            </div>
            {incorrectCount > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-700">Missed questions:</h4>
                <ul className="mt-1 space-y-1">
                  {scenarios.map((s, i) =>
                    results[i] === 'incorrect' ? (
                      <li key={i} className="rounded border border-red-100 bg-red-50 px-3 py-2 text-sm">
                        <span className="font-medium">{s.title}</span>
                      </li>
                    ) : null
                  )}
                </ul>
              </div>
            )}
          </div>
          <div className="mt-6 flex gap-2">
            <button type="button" className="btn btn-secondary btn-small" onClick={handleBack}>
              ← Review
            </button>
            <button type="button" className="btn btn-small" onClick={handleClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800">Quiz: Standards &amp; 7 Steps</h2>
        <p className="mt-1 text-sm text-gray-500">{shiftLabel || shiftKey}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
          <span>Question {index + 1} of {scenarios.length}</span>
          {answeredCount > 0 && (
            <span>
              <span className="text-green-600">{correctCount}✓</span>
              {' '}
              <span className="text-red-600">{incorrectCount}✗</span>
            </span>
          )}
        </div>

        {scenarios.length === 0 ? (
          <p className="mt-6 text-gray-500">No scenarios for this shift.</p>
        ) : (
          <>
            <div className="mt-6 min-h-[120px] rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-700">{current?.title}</p>
              <p className="mt-2 text-sm text-gray-800">{current?.prompt}</p>
              {revealed && (
                <div className="mt-4 rounded border border-green-200 bg-green-50 p-3">
                  <p className="text-xs font-medium uppercase text-green-800">Standard</p>
                  <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{current?.standard}</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <div>
                {!isFirst && (
                  <button type="button" className="btn btn-secondary btn-small" onClick={handleBack}>
                    ← Back
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {!revealed ? (
                  <button type="button" className="btn btn-small" onClick={() => setRevealed(true)}>
                    Reveal answer
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100"
                      onClick={() => handleMark('incorrect')}
                    >
                      ✗ Incorrect
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border-2 border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100"
                      onClick={() => handleMark('correct')}
                    >
                      ✓ Correct
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-secondary btn-small" onClick={handleClose}>
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
