import React from 'react'

/**
 * Service Review Exercise — Day 3 and Day 5
 * Managers spot-check trainee knowledge with these questions.
 * Each question has a text response field and a pass/fail toggle.
 */
export default function ServiceReviewExercise({ data, onChange, questions, title, disabled }) {
  const answers = data?.answers || {}
  const grades = data?.grades || {}

  function updateAnswer(idx, value) {
    onChange({ ...data, answers: { ...answers, [idx]: value } })
  }

  function toggleGrade(idx) {
    if (disabled) return
    const current = grades[idx] || 'none'
    const next = current === 'none' ? 'pass' : current === 'pass' ? 'fail' : 'none'
    onChange({ ...data, grades: { ...grades, [idx]: next } })
  }

  const answeredCount = Object.values(grades).filter((g) => g !== 'none').length
  const passCount = Object.values(grades).filter((g) => g === 'pass').length

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Managers:</strong> Use these questions to spot-check the Trainee&apos;s knowledge. Tap ✅ or ❌
          after the Trainee responds.
        </p>
      </div>

      {answeredCount > 0 && (
        <div className="flex items-center justify-center gap-4">
          <span className="text-sm font-bold text-green-600 dark:text-green-400">✅ {passCount}</span>
          <span className="text-sm font-bold text-red-600 dark:text-red-400">
            ❌ {answeredCount - passCount}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({answeredCount}/{questions?.length || 0} reviewed)
          </span>
        </div>
      )}

      <div className="space-y-3">
        {(questions || []).map((question, idx) => {
          const grade = grades[idx] || 'none'
          return (
            <div
              key={idx}
              className={`rounded-xl border-2 overflow-hidden transition-all ${
                grade === 'pass'
                  ? 'border-green-200 dark:border-green-600 bg-green-50/30 dark:bg-green-900/20'
                  : grade === 'fail'
                    ? 'border-red-200 dark:border-red-600 bg-red-50/30 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
              }`}
            >
              <div className="flex items-start gap-3 p-4">
                <span className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-300 flex-shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 leading-relaxed">
                  {question}
                </p>
                <button
                  onClick={() => toggleGrade(idx)}
                  disabled={disabled}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 border-2 transition-all ${
                    grade === 'pass'
                      ? 'bg-green-500 border-green-500 text-white'
                      : grade === 'fail'
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-300 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  {grade === 'pass' ? '✓' : grade === 'fail' ? '✗' : '—'}
                </button>
              </div>
              <div className="px-4 pb-4">
                <textarea
                  value={answers[idx] || ''}
                  onChange={(e) => updateAnswer(idx, e.target.value)}
                  placeholder="Trainee's response / notes..."
                  disabled={disabled}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-300 dark:focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={2}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
