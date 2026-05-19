import { TESTS } from '../../data/quizDatabase'
import { getOfficialTestIds } from '../../services/testAttemptResets'

export default function ResetAttemptsModal({
  traineeId, traineeName,
  resetAttemptsResults, resetAttemptsTestId, resetAttemptsSubmitting,
  onTestIdChange, onSubmit, onClose,
}) {
  if (!traineeId) return null
  const officialIds = getOfficialTestIds()
  const attemptedIds = resetAttemptsResults
    ? officialIds.filter((id) => resetAttemptsResults[id]?.count > 0)
    : []
  const hasAttemptedTests = attemptedIds.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={() => !resetAttemptsSubmitting && onClose()}>
      <div className="max-w-md w-full mx-4" style={{
        background: 'rgba(248,250,246,0.97)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        borderRadius: 'var(--radius)',
        border: '1px solid rgba(200,210,195,0.5)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        padding: '24px',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Reset test attempts</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          For <strong>{traineeName || traineeId}</strong>. This grants 1 additional retake per test.
        </p>
        {!resetAttemptsResults ? (
          <p className="text-sm text-gray-500 mb-4">Loading test data...</p>
        ) : !hasAttemptedTests ? (
          <p className="text-sm text-gray-500 mb-4">No test attempts found for this trainee.</p>
        ) : (
          <>
            <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Test</label>
            <select
              className="input-glass mb-2"
              value={resetAttemptsTestId}
              onChange={(e) => onTestIdChange(e.target.value)}
            >
              {attemptedIds.length > 1 && <option value="all">All attempted tests</option>}
              {attemptedIds.map((id) => {
                const r = resetAttemptsResults[id]
                const title = TESTS.find((t) => t.id === id)?.title || id
                return (
                  <option key={id} value={id}>
                    {title} ({r.count}/{r.maxAttempts || 2} attempts{r.passed ? ', passed' : ''})
                  </option>
                )
              })}
            </select>
            <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
              Resets attempt count to 1, giving trainee 1 more try.
            </p>
          </>
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn btn-small" onClick={onClose} disabled={resetAttemptsSubmitting}>Cancel</button>
          {hasAttemptedTests && (
            <button
              type="button"
              className="btn-accent btn-small"
              disabled={resetAttemptsSubmitting}
              onClick={() => onSubmit(attemptedIds)}
            >
              {resetAttemptsSubmitting ? 'Resetting…' : 'Reset'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
