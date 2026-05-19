import { useTestLock } from '../contexts/TestLockContext'
import { useAuth } from '../contexts/AuthContext'

export default function TestLockOverlay() {
  const { lockState, isMySession, isLockedOut, isTestActive } = useTestLock()
  const { currentUser } = useAuth()

  const isTrainee = (currentUser?.role || '').toLowerCase() === 'trainee'
  if (!isTrainee || !lockState || isMySession) return null
  if (!isTestActive && !isLockedOut) return null

  const raw = lockState.lockoutExpiresAt
  const lockoutExpires =
    raw == null
      ? null
      : typeof raw?.toDate === 'function'
        ? raw.toDate()
        : raw?.seconds != null
          ? new Date(raw.seconds * 1000)
          : new Date(raw)

  return (
    <div className="fixed inset-0 z-[99999] bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        {isLockedOut ? (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-4xl">🔒</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Account Locked</h1>
            <p className="text-gray-400 mb-2 text-sm leading-relaxed">
              {lockState.lockoutReason === 'browser_closed' ||
              lockState.lockoutReason === 'heartbeat_timeout'
                ? 'Your test session was interrupted. For security, your account has been temporarily locked.'
                : lockState.lockoutReason === 'excessive_violations'
                  ? 'Multiple test violations were detected. Your account has been temporarily locked.'
                  : 'A test integrity violation was detected. Your account has been temporarily locked.'}
            </p>
            {lockoutExpires && (
              <div className="mt-6 p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-xs text-gray-500 mb-1">Auto-unlocks at</p>
                <p className="text-lg font-bold text-white font-mono">
                  {lockoutExpires.toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            )}
            <p className="text-gray-500 text-xs mt-6">
              Ask a manager to unlock your account to resume immediately.
            </p>
          </>
        ) : (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/20 flex items-center justify-center">
              <span className="text-4xl">📝</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Test In Progress</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              You have an active test:{' '}
              <strong className="text-white">{lockState.testName || 'Quiz'}</strong>
            </p>
            <p className="text-gray-500 text-sm mt-3">
              Return to your original test tab to continue. You cannot access any other part of the
              app during a test.
            </p>
            {lockState.violationCount > 0 && (
              <div className="mt-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-red-400 text-xs font-semibold">
                  ⚠️ {lockState.violationCount} violation
                  {lockState.violationCount > 1 ? 's' : ''} recorded.
                  {lockState.violationCount >= 2 &&
                    ' One more and your account will be locked.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
