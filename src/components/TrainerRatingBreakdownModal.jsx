import { useState, useEffect } from 'react'
import { getTrainerRatingsDetailed } from '../services/trainerRatingsService'
import { TRAINER_RATING_CRITERIA } from '../data/trainerRatingCriteria'

export default function TrainerRatingBreakdownModal({ trainer, onClose }) {
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!trainer?.uid) {
      setLoading(false)
      return
    }
    loadRatings()
  }, [trainer?.uid])

  async function loadRatings() {
    try {
      const ratingsData = await getTrainerRatingsDetailed(trainer.uid)
      setRatings(ratingsData)

      if (ratingsData.length > 0) {
        const totalAvg =
          ratingsData.reduce((sum, r) => sum + (r.average || 0), 0) / ratingsData.length

        const criteriaScores = [0, 0, 0, 0, 0]
        ratingsData.forEach((r) => {
          if (r.scores && Array.isArray(r.scores)) {
            r.scores.forEach((score, idx) => {
              criteriaScores[idx] += score
            })
          }
        })

        setStats({
          overallAverage: totalAvg.toFixed(1),
          totalRatings: ratingsData.length,
          criteriaAverages: criteriaScores.map((sum) =>
            (sum / ratingsData.length).toFixed(1)
          ),
        })
      }
    } catch (error) {
      console.error('Error loading ratings:', error)
    } finally {
      setLoading(false)
    }
  }

  const criteriaLabels = TRAINER_RATING_CRITERIA.map((c) => c.label)

  function renderStars(rating) {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < Math.round(rating) ? 'text-yellow-400' : 'text-gray-300'}>
        ★
      </span>
    ))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500 text-2xl font-bold text-white">
              {(trainer?.name || 'T').charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {trainer?.name || 'Trainer'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Trainer Performance Ratings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-3xl text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-orange-500" />
            </div>
          ) : ratings.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-lg text-gray-500 dark:text-gray-400">No ratings yet</p>
              <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                Trainees will rate this trainer after completing shifts
              </p>
            </div>
          ) : (
            <>
              {stats && (
                <div className="mb-6 rounded-lg bg-orange-50 p-6 dark:bg-orange-900/20">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      Overall Performance
                    </h3>
                    <div className="text-right">
                      <div className="text-4xl font-bold text-orange-600 dark:text-orange-400">
                        {stats.overallAverage}
                      </div>
                      <div className="mt-1 flex text-2xl">
                        {renderStars(parseFloat(stats.overallAverage))}
                      </div>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        {stats.totalRatings} rating{stats.totalRatings !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {criteriaLabels.map((criterion, idx) => (
                      <div key={idx}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {criterion}
                          </span>
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {stats.criteriaAverages[idx]} / 5
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-2 rounded-full bg-orange-500 transition-all"
                            style={{
                              width: `${(parseFloat(stats.criteriaAverages[idx]) / 5) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h3 className="mb-3 text-lg font-bold text-gray-900 dark:text-white">
                  Individual Ratings ({ratings.length})
                </h3>
                {ratings.map((rating) => (
                  <div
                    key={rating.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/50"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {rating.traineeName || 'Anonymous'}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {rating.shiftType || 'Training Shift'} •{' '}
                          {rating.ratedAt
                            ? new Date(
                                rating.ratedAt?.toDate ? rating.ratedAt.toDate() : rating.ratedAt
                              ).toLocaleDateString()
                            : 'Unknown date'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                          {rating.average != null ? Number(rating.average).toFixed(1) : '—'}
                        </div>
                        <div className="flex text-lg">
                          {renderStars(rating.average || 0)}
                        </div>
                      </div>
                    </div>

                    {rating.scores && Array.isArray(rating.scores) && (
                      <div className="mb-3 space-y-2">
                        {criteriaLabels.map((criterion, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-gray-700 dark:text-gray-300">
                              {criterion}
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="flex text-base">
                                {renderStars(rating.scores[idx] || 0)}
                              </div>
                              <span className="w-8 text-right font-medium text-gray-900 dark:text-white">
                                {rating.scores[idx] ?? 0}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {rating.notes && (
                      <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-600">
                        <p className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Additional feedback:
                        </p>
                        <p className="text-sm italic text-gray-600 dark:text-gray-400">
                          &quot;{rating.notes}&quot;
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-gray-200 p-6 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-gray-200 px-6 py-3 font-semibold text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
