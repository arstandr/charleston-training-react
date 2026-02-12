import { useState } from 'react'
import { getScenariosForShift } from '../data/standardsData'

export default function StandardsQuizModal({ open, shiftKey, shiftLabel, onClose }) {
  const scenarios = open && shiftKey ? getScenariosForShift(shiftKey) : []
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  if (!open || !shiftKey) return null

  const current = scenarios[index]
  const isFirst = index === 0
  const isLast = index >= scenarios.length - 1

  const handleNext = () => {
    if (isLast) {
      onClose()
      return
    }
    setIndex((i) => i + 1)
    setRevealed(false)
  }

  const handleBack = () => {
    if (isFirst) return
    setIndex((i) => i - 1)
    setRevealed(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800">Quiz: Standards &amp; 7 Steps</h2>
        <p className="mt-1 text-sm text-gray-500">{shiftLabel || shiftKey}</p>
        <p className="mt-2 text-xs text-gray-400">
          Question {index + 1} of {scenarios.length}
        </p>

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
                  <button type="button" className="btn btn-small" onClick={handleNext}>
                    {isLast ? 'Done' : 'Next →'}
                  </button>
                )}
                <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
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
