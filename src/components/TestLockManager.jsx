import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  subscribeToAllLocks,
  deleteTestLock,
  triggerLockout,
  getRecentViolations,
  resolveViolation,
} from '../services/testLockService'

export default function TestLockManager() {
  const { currentUser } = useAuth()
  const [activeLocks, setActiveLocks] = useState([])
  const [recentViolations, setRecentViolations] = useState([])
  const [unlocking, setUnlocking] = useState(null)

  useEffect(() => {
    const unsub = subscribeToAllLocks((locks) => {
      setActiveLocks(locks)
      locks.forEach(async (lock) => {
        if (!lock.active || lock.lockedOut) return
        const raw = lock.lastHeartbeat
        const lastBeat =
          raw == null
            ? null
            : typeof raw.toDate === 'function'
              ? raw.toDate()
              : raw.seconds != null
                ? new Date(raw.seconds * 1000)
                : null
        if (lastBeat && Date.now() - lastBeat.getTime() > 90000) {
          await triggerLockout(lock.id, 'heartbeat_timeout')
        }
      })
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    async function loadViolations() {
      const violations = await getRecentViolations(50)
      setRecentViolations(violations)
    }
    loadViolations()
    const interval = setInterval(loadViolations, 30000)
    return () => clearInterval(interval)
  }, [])

  async function handleUnlock(lockId, userName) {
    if (!confirm(`Unlock ${userName}? They will be able to log in and access the app again.`))
      return
    setUnlocking(lockId)
    try {
      await deleteTestLock(lockId)
    } catch (e) {
      alert('Failed to unlock: ' + e.message)
    }
    setUnlocking(null)
  }

  async function handleResolveViolation(violationId) {
    const resolvedBy = currentUser?.name || currentUser?.username || 'Manager'
    await resolveViolation(violationId, resolvedBy)
    setRecentViolations((prev) =>
      prev.map((v) => (v.id === violationId ? { ...v, resolved: true } : v))
    )
  }

  const lockedOut = activeLocks.filter((l) => l.lockedOut)
  const testing = activeLocks.filter((l) => l.active && !l.lockedOut)
  const unresolvedViolations = recentViolations.filter((v) => !v.resolved)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Test Integrity</h2>
          <p className="text-sm text-gray-500">Monitor active tests and manage lockouts</p>
        </div>
        {unresolvedViolations.length > 0 && (
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
            {unresolvedViolations.length} unresolved
          </span>
        )}
      </div>

      {testing.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
            <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
              📝 Currently Testing ({testing.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {testing.map((lock) => (
              <div key={lock.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{lock.userName}</p>
                  <p className="text-xs text-gray-500">
                    {lock.testName} • Started{' '}
                    {lock.startedAt?.toDate?.()
                      ? lock.startedAt.toDate().toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : '—'}
                    {lock.violationCount > 0 && (
                      <span className="text-red-500 font-semibold ml-2">
                        ⚠️ {lock.violationCount} violation
                        {lock.violationCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lockedOut.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
          <div className="px-5 py-3 bg-red-50 border-b border-red-100">
            <h3 className="text-sm font-bold text-red-900 flex items-center gap-2">
              🔒 Locked Out ({lockedOut.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {lockedOut.map((lock) => {
              const raw = lock.lockoutExpiresAt
              const expires =
                raw == null
                  ? null
                  : typeof raw?.toDate === 'function'
                    ? raw.toDate()
                    : raw?.seconds != null
                      ? new Date(raw.seconds * 1000)
                      : null
              return (
                <div key={lock.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{lock.userName}</p>
                    <p className="text-xs text-gray-500">
                      Reason:{' '}
                      {lock.lockoutReason === 'heartbeat_timeout'
                        ? 'Browser closed during test'
                        : lock.lockoutReason === 'excessive_violations'
                          ? 'Too many violations'
                          : lock.lockoutReason === 'tab_switch'
                            ? 'Switched tabs during test'
                            : lock.lockoutReason || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {lock.violationCount || 0} violations • Auto-unlocks{' '}
                      {expires
                        ? `at ${expires.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                        : 'in ~1 hour'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnlock(lock.id, lock.userName)}
                    disabled={unlocking === lock.id}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 active:scale-[0.97] transition-all disabled:opacity-50"
                  >
                    {unlocking === lock.id ? 'Unlocking…' : '🔓 Unlock'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {testing.length === 0 && lockedOut.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <span className="text-3xl">✅</span>
          <p className="text-sm text-gray-500 mt-2">No active tests or lockouts</p>
        </div>
      )}

      {unresolvedViolations.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
            <h3 className="text-sm font-bold text-amber-900">
              ⚠️ Unresolved Violations ({unresolvedViolations.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {unresolvedViolations.map((v) => (
              <div key={v.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{v.userName}</p>
                  <p className="text-xs text-gray-500">{v.details}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {v.timestamp?.toDate?.()?.toLocaleString() || '—'} • {v.testName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleResolveViolation(v.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                >
                  ✓ Reviewed
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
