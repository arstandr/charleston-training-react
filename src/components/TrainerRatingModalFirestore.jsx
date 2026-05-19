import { useState } from 'react'
import { submitTrainerRating, updateTrainerRating } from '../services/trainerRatingsService'
import { useAuth } from '../contexts/AuthContext'
import {
  TRAINER_RATING_CRITERIA,
  TRAINER_RATING_NOTES_MAX,
  calculateTrainerAverage,
} from '../data/trainerRatingCriteria'

export default function TrainerRatingModalFirestore({
  shift,
  trainee,
  trainer,
  onClose,
  existingRating = null,
}) {
  const { currentUser } = useAuth()
  const [scores, setScores] = useState(existingRating?.scores ?? [0, 0, 0, 0, 0])
  const [notes, setNotes] = useState(existingRating?.notes ?? '')
  const [saving, setSaving] = useState(false)

  function handleStarClick(criteriaIndex, starValue) {
    const newScores = [...scores]
    newScores[criteriaIndex] = starValue
    setScores(newScores)
  }

  async function handleSubmit() {
    if (scores.some((s) => s === 0)) {
      alert('⚠️ Please rate all 5 criteria before submitting')
      return
    }
    setSaving(true)
    try {
      const average = calculateTrainerAverage(scores)
      const userId = currentUser?.uid || currentUser?.id
      const ratingData = {
        traineeId: trainee?.id ?? userId,
        traineeName: trainee?.name ?? currentUser?.name ?? 'Trainee',
        trainerId: trainer?.id ?? '',
        trainerName: trainer?.name ?? 'Trainer',
        shiftId: shift?.id ?? '',
        shiftType: shift?.shiftType ?? '',
        scores,
        average,
        notes: notes.trim().slice(0, TRAINER_RATING_NOTES_MAX),
        ratedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      if (existingRating?.id) {
        await updateTrainerRating(existingRating.id, ratingData)
      } else {
        await submitTrainerRating(ratingData)
      }
      alert('✅ Trainer rating submitted successfully!')
      onClose()
    } catch (error) {
      console.error('Error saving trainer rating:', error)
      alert('❌ Failed to save rating: ' + (error?.message || error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6 rounded-t-xl sticky top-0 z-10 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Rate Your Trainer</h2>
            <p className="text-orange-100">
              {shift?.shiftType ?? 'Shift'} · {trainer?.name ?? 'Trainer'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-orange-200 text-3xl font-bold leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-6">
          <div className="bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-600 p-4 mb-6">
            <p className="text-sm text-purple-900 dark:text-purple-200">
              <strong>When to fill this out:</strong> Complete this after your private sit-down with the trainer.
              Your ratings help us recognize great trainers!
            </p>
          </div>
          <div className="space-y-6 mb-6">
            {TRAINER_RATING_CRITERIA.map((criteria, index) => (
              <div key={criteria.id} className="border-b border-gray-200 dark:border-gray-600 pb-4">
                <div className="mb-3">
                  <p className="font-semibold text-gray-900 dark:text-white mb-1">
                    {index + 1}. {criteria.label}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{criteria.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleStarClick(index, star)}
                      className="text-4xl focus:outline-none hover:scale-110 transition-transform"
                      style={{ color: star <= scores[index] ? '#f57c00' : '#ddd' }}
                    >
                      {star <= scores[index] ? '★' : '☆'}
                    </button>
                  ))}
                  {scores[index] > 0 && (
                    <span className="ml-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {scores[index]} star{scores[index] !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Anything your trainer could improve? (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, TRAINER_RATING_NOTES_MAX))}
              placeholder="Optional feedback for managers..."
              rows={3}
              maxLength={TRAINER_RATING_NOTES_MAX}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {notes.length} / {TRAINER_RATING_NOTES_MAX} characters
            </p>
          </div>
          {scores.every((s) => s > 0) && (
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 mb-6 border border-orange-200 dark:border-orange-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Overall Rating:</span>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                    {calculateTrainerAverage(scores)}
                  </span>
                  <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className="text-xl"
                        style={{
                          color: star <= Math.round(calculateTrainerAverage(scores)) ? '#f57c00' : '#ddd',
                        }}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || scores.some((s) => s === 0)}
              className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Submitting…' : existingRating ? 'Update Rating' : 'Submit Rating'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
