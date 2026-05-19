import { useState, useEffect } from 'react'
import { getTestReview, getFailedTestSession, loadTestResults } from '../services/quizAttemptsService'
import { PRETTY_TEST_NAMES } from '../data/quizDatabase'

export default function TestReviewModal({ traineeId, testId, traineeName, onClose }) {
  const [attempts, setAttempts] = useState(null)
  const [aggregateResult, setAggregateResult] = useState(null)
  const [allReviewSessions, setAllReviewSessions] = useState(null)
  const [selectedSessionIdx, setSelectedSessionIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const testName = (PRETTY_TEST_NAMES && PRETTY_TEST_NAMES[testId]) || testId?.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Test'

  useEffect(() => {
    if (!traineeId || !testId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setAggregateResult(null)
    setAllReviewSessions(null)
    setSelectedSessionIdx(0)
    Promise.all([
      getTestReview(traineeId, testId),       // primary: testReviews collection (full question data)
      getFailedTestSession(traineeId, testId), // fallback: quizAttempts collection (older data)
      loadTestResults(traineeId),              // aggregate: score/count/passed
    ])
      .then(([reviewSessions, sessionData, allResults]) => {
        if (cancelled) return
        if (reviewSessions?.length) {
          // testReviews collection has data — use it (newest first)
          setAllReviewSessions(reviewSessions)
          setAttempts(reviewSessions[0].questions || [])
        } else if (sessionData) {
          // Fall back to quizAttempts collection
          setAttempts(sessionData)
        }
        if (allResults?.[testId]) {
          setAggregateResult(allResults[testId])
        }
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message || 'Failed to load review data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [traineeId, testId])

  // Data from testReviews collection (new path) vs quizAttempts collection (legacy)
  const isFromReviews = !!allReviewSessions?.length
  const currentReviewSession = isFromReviews ? allReviewSessions[selectedSessionIdx] : null

  // When switching between attempts in multi-attempt review
  const handleSelectSession = (idx) => {
    setSelectedSessionIdx(idx)
    setAttempts(allReviewSessions[idx]?.questions || [])
  }

  const hasReviewData = isFromReviews ? !!attempts?.length : attempts?.some((a) => a.questionText != null)
  const score = isFromReviews ? currentReviewSession?.score : attempts?.[0]?.score
  const totalQuestions = attempts?.length ?? (attempts?.[0]?.totalQuestions ?? 0)
  const timestamp = isFromReviews ? currentReviewSession?.timestamp : attempts?.[0]?.timestamp
  const correctCount = attempts?.filter((a) => a.correct).length ?? 0
  const wrongCount = totalQuestions - correctCount

  // Sort: missed first, then correct
  const sorted = attempts ? [...attempts].sort((a, b) => {
    if (a.correct === b.correct) return 0
    return a.correct ? 1 : -1
  }) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="my-8 w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Test Review</h2>
            <p className="text-sm text-gray-500">{traineeName || 'Trainee'} — {testName}</p>
            {/* Attempt selector when multiple attempts are available */}
            {isFromReviews && allReviewSessions.length > 1 && (
              <div className="mt-1.5 flex gap-1.5 flex-wrap">
                {allReviewSessions.map((s, idx) => (
                  <button
                    key={s.id || idx}
                    type="button"
                    onClick={() => handleSelectSession(idx)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${selectedSessionIdx === idx ? 'bg-[var(--color-primary)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    Attempt {allReviewSessions.length - idx} · {s.score}%{s.passed ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-small btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="text-center py-12 text-gray-500">Loading review data...</div>
          )}

          {error && (
            <div className="text-center py-12 text-red-600">{error}</div>
          )}

          {!loading && !error && (!attempts || !hasReviewData) && (
            aggregateResult ? (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-6 py-5">
                <div className="flex items-center gap-4 mb-3">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold text-white ${(aggregateResult.scores?.length ? Math.max(...aggregateResult.scores) : 0) >= 85 ? 'bg-green-600' : (aggregateResult.scores?.length ? Math.max(...aggregateResult.scores) : 0) >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}>
                    {aggregateResult.scores?.length ? Math.max(...aggregateResult.scores) : '—'}%
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{testName}</p>
                    <p className="text-sm text-gray-500">{aggregateResult.count || 0} attempt{aggregateResult.count !== 1 ? 's' : ''} · {aggregateResult.passed ? '✓ Passed' : 'Not yet passed'}</p>
                    {aggregateResult.scores?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">Scores: {aggregateResult.scores.join('%, ')}%</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400">Question-by-question detail is not available for this attempt. Newer tests will include full review.</p>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 font-medium">No test data found</p>
                <p className="text-gray-400 text-sm mt-1">This trainee has no recorded attempts for this test.</p>
              </div>
            )
          )}

          {!loading && !error && hasReviewData && (
            <>
              {/* Summary bar */}
              <div className="flex items-center gap-4 mb-6 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ${score >= 85 ? 'bg-green-600' : score >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}>
                  {score ?? '—'}%
                </div>
                <div className="flex-1 text-sm">
                  <div className="font-medium text-gray-800">
                    <span className="text-green-700">{correctCount} correct</span>
                    {' · '}
                    <span className="text-red-700">{wrongCount} wrong</span>
                    {' · '}
                    {totalQuestions} total
                  </div>
                  {timestamp && (
                    <div className="text-gray-400 text-xs mt-0.5">
                      {new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' at '}
                      {new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>

              {/* Question cards */}
              <div className="space-y-4">
                {sorted.map((attempt, idx) => {
                  if (!attempt.questionText) return null
                  const isCorrect = attempt.correct
                  const options = attempt.options || []
                  const correctIdx = attempt.correctIndex
                  const selectedIdx = attempt.selectedAnswer

                  return (
                    <div
                      key={attempt.id || idx}
                      className={`rounded-lg border-2 p-4 ${isCorrect ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}
                    >
                      <div className="flex items-start gap-2 mb-3">
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                          {isCorrect ? '\u2713' : '\u2717'}
                        </span>
                        <p className="text-sm font-medium text-gray-800">{attempt.questionText}</p>
                      </div>

                      <div className="space-y-1.5 ml-8">
                        {options.map((opt, oi) => {
                          const isSelected = oi === selectedIdx
                          const isAnswer = oi === correctIdx
                          let cls = 'border-gray-200 bg-white text-gray-600'
                          if (isAnswer) cls = 'border-green-300 bg-green-50 text-green-800 font-medium'
                          if (isSelected && !isCorrect && !isAnswer) cls = 'border-red-300 bg-red-50 text-red-800 line-through'
                          if (isSelected && isCorrect) cls = 'border-green-300 bg-green-50 text-green-800 font-medium'

                          return (
                            <div key={oi} className={`rounded-md border px-3 py-1.5 text-sm ${cls}`}>
                              {isAnswer && <span className="mr-1">{'\u2713'}</span>}
                              {isSelected && !isAnswer && <span className="mr-1">{'\u2717'}</span>}
                              {opt}
                            </div>
                          )
                        })}
                      </div>

                      {!isCorrect && attempt.explanation && (
                        <div className="mt-3 ml-8 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                          <p className="text-xs font-medium text-amber-800 mb-0.5">Explanation</p>
                          <p className="text-sm text-amber-900">{attempt.explanation}</p>
                        </div>
                      )}

                      {attempt.isBonus && (
                        <div className="mt-2 ml-8">
                          <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded">Bonus</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
