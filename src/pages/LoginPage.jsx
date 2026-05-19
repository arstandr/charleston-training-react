import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import { useTrainingData } from '../hooks/useTrainingData'
import { useStaffAccounts } from '../hooks/useStaffAccounts'
import { validateEmployeeNumber } from '../utils/helpers'
import { STAFF_LOGINS } from '../constants'
import { SESSION_REVOKED_KEY } from '../contexts/AuthContext'
import RoleSelectorModal from '../components/RoleSelectorModal'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../firebase'

const REMEMBER_KEY = 'loginRememberEmp'
const REMEMBER_DAYS = 30

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, login, logout, impersonate, loading: authLoading } = useAuth()
  const { stores } = useOrg()
  const { listTrainees, trainingData } = useTrainingData()
  const { staffAccounts } = useStaffAccounts()

  // Merge STAFF_LOGINS + staffAccounts for person picker
  const mergedStaffAccounts = useMemo(() => {
    const merged = {}
    Object.entries(STAFF_LOGINS).forEach(([empNum, info]) => {
      merged[empNum] = { ...info }
    })
    Object.entries(staffAccounts || {}).forEach(([empNum, info]) => {
      if (!info?.archived) {
        merged[empNum] = { ...(merged[empNum] || {}), ...info }
      }
    })
    return merged
  }, [staffAccounts])
  const [sessionRevokedMessage, setSessionRevokedMessage] = useState('')
  const [empNum, setEmpNum] = useState(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY)
      if (saved) {
        const { value, expires } = JSON.parse(saved)
        if (expires && Date.now() < expires) return value || ''
      }
    } catch (_) {}
    return ''
  })
const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingStaffUser, setPendingStaffUser] = useState(null)
  const [pendingStorePickUser, setPendingStorePickUser] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    try {
      const msg = sessionStorage.getItem(SESSION_REVOKED_KEY)
      if (msg) {
        setSessionRevokedMessage(msg)
        sessionStorage.removeItem(SESSION_REVOKED_KEY)
      }
    } catch (_) {}
  }, [])

  // Auto-open role selector when admin uses "Switch Role"
  useEffect(() => {
    if (location.state?.switchRole && currentUser && !pendingStaffUser) {
      const role = (currentUser.role || '').toLowerCase()
      if (role === 'admin' || role === 'owner') {
        setPendingStaffUser(currentUser)
        // Clear the state so it doesn't re-trigger
        navigate(location.pathname, { replace: true, state: {} })
      }
    }
  }, [location.state, currentUser, pendingStaffUser, navigate])

  async function doLogin(trimmed) {
    setError('')
    if (!trimmed) {
      setError('Please enter your employee number.')
      return
    }
    if (!validateEmployeeNumber(trimmed)) {
      setError('Employee number must be 3-10 digits.')
      return
    }
    setSubmitting(true)
    try {
      const user = await login(trimmed)
      // Only remove saved number after a successful login, not on failure
      localStorage.removeItem(REMEMBER_KEY)
      const role = (user?.role || '').toLowerCase()
      // mergedStaffAccounts has live Firestore data; login() may return stale localStorage cache
      const effectiveStore = mergedStaffAccounts[trimmed]?.store ?? user?.store
      if (role === 'admin' || role === 'owner') {
        setPendingStaffUser(user)
      } else if (role === 'manager' && effectiveStore === 'All') {
        setPendingStorePickUser({ ...user, store: 'All' })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      setError(err?.message || 'Sign-in error. Try again or use a supported browser.')
    } finally {
      setSubmitting(false)
    }
  }

  // Auto-submit when user types 3 or 4 digits (debounced 500ms)
  useEffect(() => {
    const trimmed = (empNum || '').trim()
    if (trimmed.length === 3 || trimmed.length === 4) {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (!submitting && !authLoading) {
          doLogin(trimmed)
        }
      }, 500)
    }
    return () => clearTimeout(debounceRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empNum])

  // Pre-warm the setCustomClaims Cloud Function the moment the login screen appears.
  // The ping is rejected (no auth/role yet) but still boots the function's container,
  // so the real call at submit time lands on a warm instance instead of cold-starting.
  useEffect(() => {
    try {
      httpsCallable(getFunctions(app), 'setCustomClaims')({}).catch(() => {})
    } catch (_) {}
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    clearTimeout(debounceRef.current)
    doLogin((empNum || '').trim())
  }

  function handleRoleSelect(selection) {
    if (selection.role === 'admin') {
      setPendingStaffUser(null)
      navigate('/owner', { replace: true })
      return
    }
    if (selection.role === 'manager') {
      impersonate({
        ...pendingStaffUser,
        role: 'manager',
        store: selection.store,
        ...(selection.name ? { name: selection.name } : {}),
        ...(selection.managerId ? { empNum: selection.managerId } : {}),
      })
      setPendingStaffUser(null)
      navigate('/manager', { replace: true })
      return
    }
    if (selection.role === 'trainer') {
      impersonate({
        ...pendingStaffUser,
        role: 'trainer',
        store: selection.store,
        ...(selection.name ? { name: selection.name } : {}),
        ...(selection.trainerId ? { empNum: selection.trainerId } : {}),
      })
      setPendingStaffUser(null)
      navigate('/trainer', { replace: true })
      return
    }
    if (selection.role === 'trainee') {
      impersonate({
        role: 'trainee',
        name: selection.name,
        store: selection.store,
        traineeId: selection.traineeId,
        id: selection.traineeId,
      })
      setPendingStaffUser(null)
      navigate('/trainee', { replace: true })
      return
    }
  }

  function handleRoleCancel() {
    setPendingStaffUser(null)
    navigate('/dashboard', { replace: true })
  }

  const allTrainees = pendingStaffUser
    ? listTrainees({ store: null, includeArchived: false })
    : []

  async function handleHardReset() {
    if (!confirm('Clear all saved data and reload? (Like opening in a private window)')) return
    try {
      await logout?.()
    } catch (_) {}
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch (_) {}
    window.location.reload()
  }

  function handleStorePick(store) {
    impersonate({ ...pendingStorePickUser, store })
    setPendingStorePickUser(null)
    navigate('/manager', { replace: true })
  }

  return (
    <div className="login-container relative">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Charleston&apos;s Training</h1>
      <p className="text-gray-600 mb-8">Sign in to access your training</p>
      {sessionRevokedMessage && (
        <div className="mb-4 rounded-lg bg-amber-100 border border-amber-300 px-4 py-3 text-sm text-amber-900" role="alert">
          {sessionRevokedMessage}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="loginEmpNum">Employee Number</label>
          <input
            id="loginEmpNum"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••"
            value={empNum}
            onChange={(e) => setEmpNum(e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-base focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        <button type="submit" disabled={submitting || authLoading} className="btn w-full min-h-[44px]">
          {authLoading ? 'Loading…' : submitting ? 'Signing in…' : 'Sign In'}
        </button>
        <p className="mt-4 text-center text-sm text-gray-500">
          Don&apos;t know your employee number? Ask your manager.
        </p>
      </form>
      <p className="absolute bottom-3 left-3 text-xs text-gray-400">
        {typeof __BUILD_AT__ !== 'undefined'
          ? `Deployed ${new Date(__BUILD_AT__).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
          : null}
      </p>
      <button
        type="button"
        onClick={handleHardReset}
        className="absolute bottom-3 right-3 text-xs text-gray-400 hover:text-gray-600 underline cursor-pointer bg-transparent border-0 p-0"
      >
        Hard reset
      </button>
      <RoleSelectorModal
        open={!!pendingStaffUser}
        staffUser={pendingStaffUser}
        stores={stores}
        trainees={allTrainees}
        staffAccounts={mergedStaffAccounts}
        onSelect={handleRoleSelect}
        onCancel={handleRoleCancel}
      />
      {pendingStorePickUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg p-6 mx-4 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-1">
              Welcome, {pendingStorePickUser.name || 'Manager'}
            </h2>
            <p className="text-sm text-gray-600 mb-5">
              Which store are you working at today?
            </p>
            <div className="flex flex-col gap-3">
              {(stores || []).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStorePick(s)}
                  className="btn w-full min-h-[44px]"
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setPendingStorePickUser(null); logout() }}
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700 underline bg-transparent border-0 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
