import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app, auth } from '../firebase'
import { getUserProfile, updateUserProfile } from '../services/userProfileService'

const SESSION_24H_MS = 24 * 60 * 60 * 1000
const SESSION_30D_MS = 30 * 24 * 60 * 60 * 1000
import { STAFF_LOGINS, STAFF_ACCOUNTS_KEY } from '../constants'
import { ensureStaffAccountsFromFirestore, ensureTrainingDataFromFirestore } from '../utils/firestore'
import { findTraineeIdByEmployeeNumber } from '../utils/helpers'
import { logAuditEvent } from '../services/auditService'
import { setErrorLoggerUser, logFeatureUsage, logClientError } from '../services/errorLogger'
import { createSession, takeOverSession, heartbeat, subscribeSession, logoutSession } from '../services/activeSessionService'

const SESSION_REVOKED_KEY = 'sessionRevokedMessage'

const AuthContext = createContext(null)

function loadStaffAccounts() {
  try {
    const raw = localStorage.getItem(STAFF_ACCOUNTS_KEY) || '{}'
    return JSON.parse(raw) || {}
  } catch (_) {
    return {}
  }
}

function loadTrainingData() {
  try {
    const raw = localStorage.getItem('trainingData') || '{}'
    return JSON.parse(raw) || {}
  } catch (_) {
    return {}
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [sessionConflictModal, setSessionConflictModal] = useState(null)

  const sessionUnsubscribeRef = useRef(null)
  const heartbeatRef = useRef(null)
  const currentSessionTokenRef = useRef(null)
  const sessionRevokedRef = useRef(false)
  const impersonatingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const HYDRATE_TIMEOUT_MS = 12000
    const timeoutId = setTimeout(() => {
      if (!cancelled) setHydrated(true)
    }, HYDRATE_TIMEOUT_MS)
    async function hydrate() {
      try {
        await Promise.race([
          Promise.all([
            ensureStaffAccountsFromFirestore(),
            ensureTrainingDataFromFirestore(),
          ]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), HYDRATE_TIMEOUT_MS - 500)),
        ])
      } catch (_) {}
      if (!cancelled) setHydrated(true)
    }
    hydrate()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [])

  function startSessionSubscription(traineeId, sessionToken) {
    if (sessionUnsubscribeRef.current) sessionUnsubscribeRef.current()
    // Guard: only process callbacks if the session token still matches
    const capturedToken = sessionToken
    sessionUnsubscribeRef.current = subscribeSession(
      traineeId,
      () => currentSessionTokenRef.current,
      () => {
        // Stale callback guard: ignore if session token has changed
        if (currentSessionTokenRef.current !== capturedToken) return
        currentSessionTokenRef.current = null
        sessionRevokedRef.current = true
        try {
          sessionStorage.setItem(SESSION_REVOKED_KEY, 'You were signed out because you logged in on another device.')
        } catch (_) {}
        sessionStorage.removeItem('sessionToken')
        sessionStorage.removeItem('traineeId')
        sessionStorage.removeItem('currentUser')
        setCurrentUser(null)
      }
    )
  }

  function startHeartbeat(traineeId, sessionToken) {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(async () => {
      const result = await heartbeat(traineeId, sessionToken).catch(() => null)
      if (result?.status === 'revoked') {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
        currentSessionTokenRef.current = null
        sessionRevokedRef.current = true
        try {
          sessionStorage.setItem(SESSION_REVOKED_KEY, 'You were signed out because you logged in on another device.')
        } catch (_) {}
        sessionStorage.removeItem('sessionToken')
        sessionStorage.removeItem('traineeId')
        sessionStorage.removeItem('currentUser')
        setCurrentUser(null)
      }
    }, 30000)
  }

  useEffect(() => {
    if (!hydrated) return

    const revokedMsg = sessionStorage.getItem(SESSION_REVOKED_KEY)
    if (revokedMsg) {
      sessionStorage.removeItem(SESSION_REVOKED_KEY)
      setCurrentUser(null)
      setAuthChecked(true)
      return
    }

    const storedUser = sessionStorage.getItem('currentUser')
    const storedToken = sessionStorage.getItem('sessionToken')
    const storedTraineeId = sessionStorage.getItem('traineeId')

    // Restore impersonation session
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser)
        if (user?._impersonating) {
          impersonatingRef.current = true
          setCurrentUser(user)
          setAuthChecked(true)
          return
        }
      } catch (_) {}
    }

    if (storedUser && storedToken && storedTraineeId) {
      try {
        const user = JSON.parse(storedUser)
        // Check session expiry
        if (user?.sessionExpiry && Date.now() > user.sessionExpiry) {
          sessionStorage.removeItem('sessionToken')
          sessionStorage.removeItem('traineeId')
          sessionStorage.removeItem('currentUser')
          setCurrentUser(null)
          setAuthChecked(true)
          return
        }
        if (user?.role === 'trainee' && user?.traineeId) {
          currentSessionTokenRef.current = storedToken
          setCurrentUser({ ...user, id: user.traineeId })
          setErrorLoggerUser(user)
          startSessionSubscription(storedTraineeId, storedToken)
          startHeartbeat(storedTraineeId, storedToken)
          setAuthChecked(true)
          return
        }
      } catch (_) {}
    }

    setAuthChecked(true)

    // Cleanup heartbeat and session subscription on unmount / re-run
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      if (sessionUnsubscribeRef.current) {
        sessionUnsubscribeRef.current()
        sessionUnsubscribeRef.current = null
      }
    }
  }, [hydrated])

  useEffect(() => {
    if (!hydrated || !auth) return

    let cancelled = false
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (impersonatingRef.current) return

      // Guard against overwriting an active trainee session — check both sessionStorage
      // and the in-memory ref so we don't miss the window between setCurrentUser and storage write
      const hasTraineeSession =
        (sessionStorage.getItem('sessionToken') && sessionStorage.getItem('traineeId')) ||
        currentSessionTokenRef.current != null
      if (hasTraineeSession) return

      if (!fbUser) {
        setCurrentUser(null)
        setErrorLoggerUser(null)
        setAuthChecked(true)
        return
      }

      try {
        let profile = await getUserProfile(fbUser.uid)
        if (!profile) {
          await new Promise((r) => setTimeout(r, 800))
          if (cancelled) return
          profile = await getUserProfile(fbUser.uid)
        }
        if (!profile) {
          await signOut(auth)
          setCurrentUser(null)
          setAuthChecked(true)
          return
        }
        const data = profile
        const sessionExpiry = data.sessionExpiry
        if (sessionExpiry != null && Date.now() > sessionExpiry) {
          await signOut(auth)
          setCurrentUser(null)
          setAuthChecked(true)
          return
        }
        const user = { ...data, uid: fbUser.uid, id: fbUser.uid, orgId: data.orgId || 'org_charlestons' }
        setCurrentUser(user)
        setErrorLoggerUser(user)
        logFeatureUsage('login', { store: user?.store })
        try {
          sessionStorage.setItem('currentUser', JSON.stringify(user))
        } catch (_) {}
      } catch (e) {
        console.warn('[Auth] Session restore failed:', e?.message)
        setCurrentUser(null)
      }
      setAuthChecked(true)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [hydrated])

  useEffect(() => {
    setLoading(!(hydrated && authChecked))
  }, [hydrated, authChecked])

  const login = useCallback(async (empNum, options = {}) => {
    sessionRevokedRef.current = false
    const { rememberMe = false, forceRole = null } = options
    const sessionExpiryMs = rememberMe ? SESSION_30D_MS : SESSION_24H_MS
    const sessionExpiry = Date.now() + sessionExpiryMs
    let staffAccounts = loadStaffAccounts()
    const trainingData = loadTrainingData()
    let staff = staffAccounts[empNum] ?? STAFF_LOGINS[empNum]

    if (!staff || staff?.archived) {
      // Re-sync from Firestore in case this device is missing or has stale data
      await ensureStaffAccountsFromFirestore()
      staffAccounts = loadStaffAccounts()
      staff = staffAccounts[empNum] ?? STAFF_LOGINS[empNum]
    }

    if (staff?.archived) {
      logClientError('auth', 'login_failed', new Error('Account archived'), { empNum, stage: 'archived' })
      throw new Error('This account has been archived. Contact your manager.')
    }

    // Toast fallback for trainer: if still not found after Firestore re-sync, look up in Toast.
    // This handles new trainers whose staffAccounts entry was never created.
    if (!staff && forceRole !== 'trainee') {
      try {
        const ensureAccess = httpsCallable(getFunctions(app), 'ensureEmployeeAccess')
        const result = await ensureAccess({ empNum })
        const accessResult = result.data
        if (accessResult?.role === 'trainer') {
          // Record was just created — reload staffAccounts and retry
          await ensureStaffAccountsFromFirestore()
          staffAccounts = loadStaffAccounts()
          staff = staffAccounts[empNum] ?? STAFF_LOGINS[empNum]
        } else if (accessResult?.role === 'trainee') {
          // This person is a trainee — fall through to trainee login below
          staff = null
        }
      } catch (accessErr) {
        const code = accessErr?.code || ''
        if (code.includes('not-found')) {
          logClientError('auth', 'login_failed', accessErr, { empNum, stage: 'staff_not_found' })
          throw new Error('Employee not found. Contact your manager.')
        }
        if (code.includes('permission-denied')) {
          logClientError('auth', 'login_failed', accessErr, { empNum, stage: 'archived' })
          throw new Error('Account is inactive.')
        }
        // For any other error (network, etc.) — fall through to trainee path
        // so login still has a chance to succeed
      }
    }

    if (staff) {
      const ROUTABLE_ROLES = ['trainer', 'trainee', 'manager', 'admin', 'owner']
      const routableRoles = (staff.roles || []).filter(r => ROUTABLE_ROLES.includes(r))
      const availableRoles = routableRoles.length > 1 ? routableRoles : null
      if (availableRoles && !forceRole) {
        return { needsRolePicker: true, staffInfo: { ...staff, empNum }, availableRoles }
      }

      // If the active role resolves to 'trainee' (forced OR from staffAccounts), skip the
      // staff path and use the trainee session path below. A trainee who also has a
      // staffAccounts entry (Toast sync) must still log in via createTraineeSession —
      // the staff path produces a Firebase-UID user with no traineeId, so the dashboard
      // can never find their training record.
      const resolvedRole = forceRole || staff.role
      if (resolvedRole !== 'trainee') {
        const orgId = staff.orgId ?? 'org_charlestons'
        const activeRole = resolvedRole
        let staffUser = { role: activeRole, name: staff.name, store: staff.store, empNum, staff: true, orgId }
        try {
          const cred = await signInAnonymously(auth)
          if (cred?.user) {
            const uid = cred.user.uid
            const payload = {
              empNum,
              name: staff.name,
              role: activeRole,
              store: staff.store,
              orgId,
              staff: true,
              lastLoginAt: new Date().toISOString(),
              rememberMe,
              sessionExpiry,
            }
            // The profile write and the custom-claims chain only share the uid — run them
            // concurrently instead of paying for two serial network round-trips at login.
            const profileWrite = updateUserProfile(uid, payload).catch(async (e) => {
              if (e?.code === 'permission-denied') {
                await new Promise((r) => setTimeout(r, 600))
                return updateUserProfile(uid, payload).catch(() => {})
              }
            })
            const claimsChain = (async () => {
              try {
                const setClaims = httpsCallable(getFunctions(app), 'setCustomClaims')
                await setClaims({ role: staffUser.role, store: staffUser.store, empNum: staffUser.empNum })
                await cred.user.getIdToken(true)
              } catch (_) {}
            })()
            await Promise.all([profileWrite, claimsChain])
            try {
              logAuditEvent(uid, staffUser.name, 'login', {
                role: staffUser.role,
                store: staffUser.store,
                empNum,
              })
            } catch (e) {
              console.warn('Audit log write failed:', e?.message)
            }
            staffUser = { ...staffUser, uid, id: uid }
          }
        } catch (e) {
          console.warn('[Auth] Firebase sign-in skipped:', e?.message)
        }
        setCurrentUser(staffUser)
        try {
          sessionStorage.setItem('currentUser', JSON.stringify(staffUser))
        } catch (_) {}
        return staffUser
      }
    }

    // Silent-strand guard: if staff was found but the resolved role is not 'trainee' and
    // was not handled above (not in ROUTABLE_ROLES), log it before falling through.
    if (staff) {
      const resolvedRoleCheck = forceRole || staff.role
      const ROUTABLE_ROLES_CHECK = ['trainer', 'trainee', 'manager', 'admin', 'owner']
      if (resolvedRoleCheck && !ROUTABLE_ROLES_CHECK.includes(resolvedRoleCheck)) {
        logClientError('auth', 'login_failed', new Error(`Unrecognized role: ${resolvedRoleCheck}`), { empNum, stage: 'role_invalid', role: resolvedRoleCheck })
      }
    }

    // Inner helper: run createSession and handle the result (conflict modal, ok, etc.)
    // Extracted so the not-found retry path can reuse it without duplicating the conflict logic.
    const runCreateSession = async () => {
      const result = await createSession(String(empNum).trim())
      console.log('[Auth] createSession result:', result)

      if (result.status === 'conflict') {
        console.log('[Auth] Conflict detected, showing modal for trainee:', result.traineeId)
        return new Promise((resolve, reject) => {
          console.log('[Auth] Setting sessionConflictModal state')
          setSessionConflictModal({
            user: result.user,
            traineeId: result.traineeId,
            onContinue: async () => {
              try {
                const res = await takeOverSession(result.traineeId, result.user?.empNum)
                const { sessionToken } = res
                const u = result.user
                const userWithId = { ...u, id: u.traineeId }

                sessionStorage.setItem('sessionToken', sessionToken)
                sessionStorage.setItem('traineeId', result.traineeId)
                sessionStorage.setItem('currentUser', JSON.stringify(userWithId))

                currentSessionTokenRef.current = sessionToken
                setCurrentUser(userWithId)
                setErrorLoggerUser(userWithId)
                setSessionConflictModal(null)

                startSessionSubscription(result.traineeId, sessionToken)
                startHeartbeat(result.traineeId, sessionToken)
                resolve(userWithId)
              } catch (e) {
                setSessionConflictModal(null)
                reject(new Error('Failed to take over session'))
              }
            },
            onCancel: () => {
              setSessionConflictModal(null)
              reject(new Error('Login cancelled.'))
            },
          })
        })
      }

      if (result.status !== 'ok') {
        const statusErr = new Error(`createSession returned status: ${result.status}`)
        logClientError('auth', 'login_failed', statusErr, { empNum, stage: 'trainee_session_failed', status: result.status })
        throw new Error('Login failed')
      }

      const { sessionToken, traineeId, user } = result
      const userWithId = { ...user, id: traineeId }

      sessionStorage.setItem('sessionToken', sessionToken)
      sessionStorage.setItem('traineeId', traineeId)
      sessionStorage.setItem('currentUser', JSON.stringify(userWithId))

      currentSessionTokenRef.current = sessionToken
      setCurrentUser(userWithId)
      setErrorLoggerUser(userWithId)

      startSessionSubscription(traineeId, sessionToken)
      startHeartbeat(traineeId, sessionToken)

      return userWithId
    }

    try {
      return await runCreateSession()
    } catch (e) {
      // Toast fallback for trainees: if the trainee record is missing, create it and retry once.
      // Never retry more than once — structured as a linear try sequence, not a loop.
      const code = e?.code || ''
      const isNotFound = code.includes('not-found') || e?.message?.includes('not-found')
      if (!isNotFound) {
        logClientError('auth', 'login_failed', e, { empNum, stage: 'trainee_session_failed' })
        const msg = e?.message || e?.code || 'Login failed. Try again.'
        throw new Error(typeof msg === 'string' ? msg : 'Login failed. Try again.')
      }

      // Step 1: Try to provision the trainee record via Toast
      let accessErr = null
      try {
        const ensureAccess = httpsCallable(getFunctions(app), 'ensureEmployeeAccess')
        await ensureAccess({ empNum })
      } catch (err) {
        accessErr = err
      }

      if (accessErr) {
        const accessCode = accessErr?.code || ''
        if (accessCode.includes('not-found')) {
          logClientError('auth', 'login_failed', accessErr, { empNum, stage: 'staff_not_found' })
          throw new Error('Employee not found. Contact your manager.')
        }
        if (accessCode.includes('permission-denied')) {
          logClientError('auth', 'login_failed', accessErr, { empNum, stage: 'archived' })
          throw new Error('Account is inactive.')
        }
        // ensureAccess failed for another reason — fall back to original error
        logClientError('auth', 'login_failed', accessErr, { empNum, stage: 'trainee_session_failed' })
        const msg = e?.message || e?.code || 'Login failed. Try again.'
        throw new Error(typeof msg === 'string' ? msg : 'Login failed. Try again.')
      }

      // Step 2: Record provisioned — retry createSession exactly once
      try {
        return await runCreateSession()
      } catch (_retryErr) {
        logClientError('auth', 'login_failed', _retryErr, { empNum, stage: 'trainee_session_failed' })
        throw new Error('Contact your manager to be added to the training system.')
      }
    }
  }, [])

  const handleConflictContinue = useCallback(async () => {
    const modal = sessionConflictModal
    if (!modal?.onContinue) return
    await modal.onContinue()
  }, [sessionConflictModal])

  const handleConflictCancel = useCallback(() => {
    const modal = sessionConflictModal
    if (!modal?.onCancel) return
    try {
      modal.onCancel()
    } catch (_) {}
    setSessionConflictModal(null)
  }, [sessionConflictModal])

  const logout = useCallback(async () => {
    const uid = currentUser?.uid || currentUser?.id
    const name = currentUser?.name
    const isTrainee = currentUser?.role === 'trainee'

    // Capture trainee session identifiers before clearing storage
    const storedTraineeId = sessionStorage.getItem('traineeId')
    const storedSessionToken = sessionStorage.getItem('sessionToken')

    // Stop heartbeat and session subscription immediately — before any async work
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    if (sessionUnsubscribeRef.current) {
      sessionUnsubscribeRef.current()
      sessionUnsubscribeRef.current = null
    }

    // Clear session token ref first so any in-flight snapshot callbacks see null and bail
    currentSessionTokenRef.current = null

    // Reset impersonation flag — must be cleared so onAuthStateChanged works on next login
    impersonatingRef.current = false
    sessionRevokedRef.current = false

    // Clear all sessionStorage regardless of role — ensures no stale data survives for re-login
    sessionStorage.removeItem('sessionToken')
    sessionStorage.removeItem('traineeId')
    sessionStorage.removeItem('currentUser')

    if (isTrainee) {
      // Fire-and-forget: notify server the session is over
      logoutSession(storedTraineeId, storedSessionToken)
    } else if (uid) {
      try {
        logAuditEvent(uid, name, 'logout', {})
      } catch (_) {}
    }

    // Always sign out Firebase Auth — clears any lingering anonymous session from a prior
    // staff login on the same device. Without this, onAuthStateChanged fires during a
    // subsequent trainee login and can overwrite the freshly-set trainee currentUser.
    try {
      await signOut(auth)
    } catch (_) {}

    setCurrentUser(null)
    setErrorLoggerUser(null)
  }, [currentUser])

  const updateUser = useCallback((partial) => {
    setCurrentUser((prev) => {
      const next = prev ? { ...prev, ...partial } : null
      try {
        if (next) sessionStorage.setItem('currentUser', JSON.stringify(next))
      } catch (_) {}
      return next
    })
  }, [])

  const impersonate = useCallback((overrideUser) => {
    const impersonatedUser = {
      ...overrideUser,
      _realUser: currentUser,
      _impersonating: true,
    }
    impersonatingRef.current = true
    setCurrentUser(impersonatedUser)
    try {
      sessionStorage.setItem('currentUser', JSON.stringify(impersonatedUser))
    } catch (_) {}
    // Audit trail for impersonation
    try {
      const realUid = currentUser?.uid || currentUser?.id || 'unknown'
      const realName = currentUser?.name || 'unknown'
      const targetId = overrideUser?.uid || overrideUser?.id || overrideUser?.traineeId || 'unknown'
      const targetName = overrideUser?.name || 'unknown'
      logAuditEvent(realUid, realName, 'impersonate_start', {
        targetId,
        targetName,
        targetRole: overrideUser?.role || '',
      })
    } catch (_) {}
  }, [currentUser])

  const exitImpersonation = useCallback(() => {
    const real = currentUser?._realUser
    if (!real) return
    // Audit trail for ending impersonation
    try {
      const realUid = real?.uid || real?.id || 'unknown'
      const realName = real?.name || 'unknown'
      const targetId = currentUser?.uid || currentUser?.id || currentUser?.traineeId || 'unknown'
      logAuditEvent(realUid, realName, 'impersonate_end', { targetId })
    } catch (_) {}
    impersonatingRef.current = false
    setCurrentUser(real)
    try {
      sessionStorage.setItem('currentUser', JSON.stringify(real))
    } catch (_) {}
  }, [currentUser])

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, logout, updateUser, impersonate, exitImpersonation }}>
      {children}
      {sessionConflictModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-conflict-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 id="session-conflict-title" className="text-lg font-bold text-gray-900 mb-2">
              Already logged in elsewhere
            </h2>
            <p className="text-gray-600 mb-6">
              You&apos;re already logged in on another device. Would you like to log out the other session and continue
              here?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
                onClick={handleConflictCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:opacity-90"
                onClick={handleConflictContinue}
              >
                Continue Here
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  )
}

export { SESSION_REVOKED_KEY }

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
