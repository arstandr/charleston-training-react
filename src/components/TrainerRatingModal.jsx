import { useState, useEffect } from 'react'
import { TRAINER_RATING_CRITERIA } from '../constants'

const MAX_NOTES = 300

export default function TrainerRatingModal({
  open,
  traineeId,
  shiftKey,
  shiftLabel,
  trainerId,
  trainerName,
  existingRating,
  onSave,
  onClose,
}) {
  const [scores, setScores] = useState([0, 0, 0, 0, 0])
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    if (existingRating?.scores?.length >= 5) {
      setScores(existingRating.scores.slice(0, 5))
    } else {
      setScores([0, 0, 0, 0, 0])
    }
    setNotes(existingRating?.notes || '')
  }, [open, existingRating])

  const handleStar = (criteriaIndex, value) => {
    const next = [...scores]
    next[criteriaIndex] = value
    setScores(next)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const hasOne = scores.some((s) => s > 0)
    if (!hasOne) return
    onSave({
      trainerId,
      trainerName,
      shiftLabel: shiftLabel || shiftKey,
      scores: scores.slice(0, 5),
      notes: notes.slice(0, MAX_NOTES),
      at: new Date().toISOString(),
    })
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="trainer-rating-modal max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800">Rate your trainer</h2>
        <p className="mt-1 text-sm text-gray-600">
          {shiftLabel || shiftKey} · {trainerName || `#${trainerId}`}
        </p>
        <form onSubmit={handleSubmit} className="mt-6">
          {TRAINER_RATING_CRITERIA.map((label, i) => (
            <div key={i} className="mb-4">
              <div className="mb-1 text-sm font-medium text-gray-700">{label}</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className="trainer-rating-star rounded p-1 text-2xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    onClick={() => handleStar(i, star)}
                    aria-label={`${star} star`}
                  >
                    {scores[i] >= star ? '★' : '☆'}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              maxLength={MAX_NOTES}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional feedback..."
            />
            <div className="mt-0.5 text-right text-xs text-gray-500">
              {notes.length} / {MAX_NOTES}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={!scores.some((s) => s > 0)}>
              Save rating
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
