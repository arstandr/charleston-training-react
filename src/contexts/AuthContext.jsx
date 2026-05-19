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
import { setErrorLoggerUser, logFeatureUsage } from '../services/errorLogger'
import { createSession, takeOverSession, heartbeat, subscribeSession } from '../services/activeSessionService'

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

      const hasTraineeSession = sessionStorage.getItem('sessionToken') && sessionStorage.getItem('traineeId')
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
    const { rememberMe = false } = options
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
      throw new Error('This account has been archived. Contact your manager.')
    }

    if (staff) {
      const traineeId = findTraineeIdByEmployeeNumber(trainingData, empNum)
      if (traineeId && staff.role !== 'admin' && staff.role !== 'owner') {
      } else {
        const orgId = staff.orgId ?? 'org_charlestons'
        let staffUser = { role: staff.role, name: staff.name, store: staff.store, empNum, staff: true, orgId }
        try {
          const cred = await signInAnonymously(auth)
          if (cred?.user) {
            const uid = cred.user.uid
            const payload = {
              empNum,
              name: staff.name,
              role: staff.role,
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

    try {
      const result = await createSession(String(empNum).trim())

      if (result.status === 'conflict') {
        return new Promise((resolve, reject) => {
          setSessionConflictModal({
            user: result.user,
            traineeId: result.traineeId,
            onContinue: async () => {
              try {
                const res = await takeOverSession(result.traineeId)
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
    } catch (e) {
      const msg = e?.message || e?.code || 'Login failed. Try again.'
      throw new Error(typeof msg === 'string' ? msg : 'Login failed. Try again.')
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

    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    if (sessionUnsubscribeRef.current) {
      sessionUnsubscribeRef.current()
      sessionUnsubscribeRef.current = null
    }

    if (isTrainee) {
      sessionStorage.removeItem('sessionToken')
      sessionStorage.removeItem('traineeId')
      sessionStorage.removeItem('currentUser')
      currentSessionTokenRef.current = null
    } else if (uid) {
      try {
        logAuditEvent(uid, name, 'logout', {})
      } catch (_) {}
      try {
        sessionStorage.removeItem('currentUser')
      } catch (_) {}
      try {
        await signOut(auth)
      } catch (_) {}
    }

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
