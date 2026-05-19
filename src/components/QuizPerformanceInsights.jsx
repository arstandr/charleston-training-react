import {
  calculatePerformanceMetrics,
  identifyStruggleTopics,
  identifyStrengthTopics,
} from '../services/quizIntelligenceService'
import { useQuizAttempts } from '../hooks/useQuizAttempts'

export default function QuizPerformanceInsights({ attempts: attemptsProp }) {
  const hook = useQuizAttempts()
  const attempts = attemptsProp != null ? attemptsProp : hook.attempts
  const loading = attemptsProp != null ? false : hook.loading

  if (loading) {
    return (
      <section className="mb-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
        <p className="text-sm text-gray-500">Loading performance insights…</p>
      </section>
    )
  }

  if (!attempts || attempts.length === 0) {
    return (
      <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-bold text-gray-800">Performance insights</h3>
        <p className="text-gray-600">Take a practice or official test to see your performance insights.</p>
      </section>
    )
  }

  const metrics = calculatePerformanceMetrics(attempts)
  const struggleTopics = identifyStruggleTopics(attempts).slice(0, 5)
  const strengthTopics = identifyStrengthTopics(attempts).slice(0, 8)

  const trendLabel = metrics.trend === 'improving' ? '↑ Improving' : metrics.trend === 'declining' ? '↓ Declining' : '→ Stable'
  const trendClass =
    metrics.trend === 'improving'
      ? 'text-green-600'
      : metrics.trend === 'declining'
        ? 'text-amber-600'
        : 'text-gray-600'

  return (
    <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-gray-800">Performance insights</h3>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Success rate</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">
            {metrics.overallSuccessRate.toFixed(0)}%
          </p>
          <p className={`text-sm ${trendClass}`}>{trendLabel}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Quizzes / Questions</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">
            {metrics.totalQuizzes} / {metrics.totalAttempts}
          </p>
          <p className="text-sm text-gray-600">quizzes · questions answered</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Average score</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{metrics.averageScore.toFixed(0)}%</p>
          <p className="text-sm text-gray-600">Best: {metrics.bestScore.toFixed(0)}%</p>
        </div>
      </div>

      {struggleTopics.length > 0 && (
        <div className="mb-6">
          <h4 className="mb-2 font-semibold text-gray-800">Topics needing review</h4>
          <ul className="space-y-2">
            {struggleTopics.map((t) => (
              <li
                key={t.topic}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-gray-800">{t.topic}</span>
                <span className="text-amber-700">
                  {(t.successRate * 100).toFixed(0)}% ({t.correctAttempts}/{t.totalAttempts})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {strengthTopics.length > 0 && (
        <div>
          <h4 className="mb-2 font-semibold text-gray-800">Your strong topics</h4>
          <div className="flex flex-wrap gap-2">
            {strengthTopics.map((t) => (
              <span
                key={t.topic}
                className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800"
              >
                {t.topic} ({(t.successRate * 100).toFixed(0)}%)
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
