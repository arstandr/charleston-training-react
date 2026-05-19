export default function QuizResultsView({ results, mode, passingScore, onBackToDashboard }) {
  const badgeLabel = results.performanceLevel === 'excellent' ? 'Excellent' : results.performanceLevel === 'good' ? 'Good' : results.performanceLevel === 'fair' ? 'Fair' : 'Needs improvement'
  const badgeClass = results.performanceLevel === 'excellent' ? 'bg-green-100 text-green-800' : results.performanceLevel === 'good' ? 'bg-blue-100 text-blue-800' : results.performanceLevel === 'fair' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
  return (
    <div className="content-area text-center py-10">
      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Results</h2>
      <div
        className={`mx-auto mt-6 flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white ${
          mode === 'practice' ? 'bg-blue-600' : results.passed ? 'bg-green-600' : 'bg-red-600'
        }`}
      >
        {results.score}%
      </div>
      {mode === 'official' && (
        <p className={`mt-4 text-lg font-semibold ${results.passed ? 'text-green-600' : 'text-red-600'}`}>
          {results.passed ? 'Passed' : 'Not passed'}
        </p>
      )}
      {results.performanceLevel && (
        <p className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-medium ${badgeClass}`}>
          {badgeLabel}
        </p>
      )}
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        {results.totalCorrect} / {results.total} correct
      </p>
      {mode === 'official' && results.regularTotal != null && results.bonusTotal != null && (
        <div className="mt-4 max-w-md mx-auto text-left rounded-xl glass p-4">
          <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Score breakdown</h3>
          <div className="flex justify-between items-center mb-1">
            <span style={{ color: 'var(--text-secondary)' }}>Regular:</span>
            <span className="font-semibold text-green-800">{results.regularCorrect} / {results.regularTotal}</span>
          </div>
          <div className="w-full rounded-full h-2 mb-2" style={{ background: 'rgba(0,0,0,0.08)' }}>
            <div className="bg-green-700 h-2 rounded-full" style={{ width: `${results.regularPercentage ?? 0}%` }} />
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: 'var(--text-secondary)' }}>Bonus (extra credit):</span>
            <span className="font-semibold text-yellow-600">+{results.bonusCorrect} / {results.bonusTotal}</span>
          </div>
          {results.bonusCorrect > 0 && (
            <p className="mt-2 text-sm text-yellow-800">You earned {results.bonusCorrect} bonus point{results.bonusCorrect > 1 ? 's' : ''}.</p>
          )}
        </div>
      )}
      {mode === 'official' && !results.passed && results.passingScore != null && (
        <p className="mt-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>Needed {results.passingScore} regular correct ({passingScore}%) to pass</p>
      )}
      {results.insights && results.insights.length > 0 && (
        <div className="mt-6 text-left rounded-xl glass p-4">
          <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Insights</h3>
          <ul className="list-disc list-inside space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {results.insights.map((insight, i) => (
              <li key={i}>{insight.message}</li>
            ))}
          </ul>
        </div>
      )}
      {results.missedTopics && results.missedTopics.length > 0 && (
        <div className="mt-4 text-left rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-900 mb-2">Topics to review</h3>
          <ul className="space-y-1 text-amber-800 text-sm">
            {results.missedTopics.map((t, i) => (
              <li key={i}>{t.topic} ({t.questionsMissed} missed)</li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="btn mt-6" onClick={onBackToDashboard}>
        Back to Dashboard
      </button>
    </div>
  )
}
