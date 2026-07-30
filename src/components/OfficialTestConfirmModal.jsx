export default function OfficialTestConfirmModal({
  pendingOfficialTest, attemptCount, maxAttempts, isThirdAttempt,
  managerPin, managerPinError, managerApproval, lockError, loadingOfficialStart,
  onPinChange, onStart, onCancel,
}) {
  if (!pendingOfficialTest) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
      <div className="max-w-md" style={{
        background: 'rgba(248,250,246,0.97)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        borderRadius: 'var(--radius)',
        border: '1px solid rgba(200,210,195,0.5)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        padding: '24px',
      }}>
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Start official test?</h3>
        <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
          This is attempt {attemptCount + 1} of {maxAttempts}. ({pendingOfficialTest.displayName})
        </p>
        {isThirdAttempt ? (
          <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm font-bold text-red-800">Final attempt — harder rules apply:</p>
            <ul className="mt-1 text-sm text-red-700 list-disc pl-4">
              <li>20 questions — no bonus questions</li>
              <li>Must score 90% (18/20) to pass</li>
              <li>No hints available</li>
            </ul>
          </div>
        ) : (
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            20 regular + 3 bonus • Need 15/20 regular (75%) to pass
          </p>
        )}
        <div className="mt-4">
          <label className="block text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Manager Approval PIN</label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Manager employee number"
            placeholder="Enter manager employee number"
            value={managerPin}
            onChange={(e) => onPinChange(e.target.value.replace(/\D/g, ''))}
            className="input-glass mt-1 text-center text-lg tracking-widest"
            autoFocus
          />
          {managerPinError && (
            <p className="mt-1 text-sm text-red-600">{managerPinError}</p>
          )}
          {managerApproval && (
            <p className="mt-1 text-sm font-medium text-green-700">Approved by: {managerApproval.name}</p>
          )}
        </div>
        {lockError && (
          <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{lockError}</p>
        )}
        {loadingOfficialStart && (
          <p className="mt-3 text-sm text-gray-600">Loading questions…</p>
        )}
        <div className="mt-6 flex gap-3 justify-end">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={loadingOfficialStart}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={onStart}
            disabled={loadingOfficialStart || !managerApproval}
          >
            {loadingOfficialStart ? 'Loading…' : 'Start Test'}
          </button>
        </div>
      </div>
    </div>
  )
}
