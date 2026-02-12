import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { signInAnonymously, signOut } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { doc, setDoc } from 'firebase/firestore'
import { app, auth, db } from '../firebase'
import { STAFF_LOGINS, STAFF_ACCOUNTS_KEY } from '../constants'
import { ensureStaffAccountsFromFirestore, ensureTrainingDataFromFirestore } from '../utils/firestore'
import { findTraineeIdByEmployeeNumber } from '../utils/helpers'
import { checkTraineeLockForLogin } from '../services/testLock'

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
  // Strict session: use sessionStorage only so users must log in again when they open a new tab or close the browser.
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('currentUser')
      const user = saved ? JSON.parse(saved) : null
      if (user && !user.orgId) user.orgId = 'org_charlestons'
      return user
    } catch (_) {
      return null
    }
  })
  const [loading, setLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      await ensureStaffAccountsFromFirestore()
      await ensureTrainingDataFromFirestore()
      if (!cancelled) setHydrated(true)
    }
    hydrate()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (hydrated) setLoading(false)
  }, [hydrated])

  const login = useCallback(async (empNum) => {
    const staffAccounts = loadStaffAccounts()
    const trainingData = loadTrainingData()
    const staff = staffAccounts[empNum] ?? STAFF_LOGINS[empNum]

    if (staff) {
      const traineeId = findTraineeIdByEmployeeNumber(trainingData, empNum)
      if (traineeId && staff.role !== 'admin' && staff.role !== 'owner') {
        // treat as trainee
      } else {
        const orgId = staff.orgId ?? 'org_charlestons'
        const user = { role: staff.role, name: staff.name, store: staff.store, empNum, staff: true, orgId }
        setCurrentUser(user)
        try { sessionStorage.setItem('currentUser', JSON.stringify(user)) } catch (_) {}
        try {
          const cred = await signInAnonymously(auth)
          if (cred?.user && db) {
            const payload = { empNum, name: staff.name, role: staff.role, store: staff.store, orgId, lastLoginAt: new Date().toISOString() }
            await setDoc(doc(db, 'users', cred.user.uid), payload, { merge: true })
            await setDoc(doc(db, 'users', String(empNum)), payload, { merge: true })
            const setClaims = httpsCallable(getFunctions(app), 'setCustomClaims')
            await setClaims({ role: user.role, store: user.store, empNum: user.empNum })
            await cred.user.getIdToken(true)
          }
        } catch (e) { console.warn('[Auth] Firebase sign-in skipped:', e?.message) }
        return user
      }
    }

    const traineeId = findTraineeIdByEmployeeNumber(trainingData, empNum)
    if (!traineeId) throw new Error('Employee number not found. Ask your manager to add you.')

    const t = trainingData[traineeId]
    if (t?.archived) throw new Error('This account is archived. Ask your manager to restore you.')

    const orgId = t?.orgId ?? 'org_charlestons'
    const user = {
      role: 'trainee',
      name: (t?.name) || 'Trainee',
      store: (t?.store) || 'Westfield',
      empNum,
      traineeId,
      orgId,
    }

    // Sign in to Firebase first so Firestore rules allow reading activeTestSessions
    let cred
    try {
      cred = await signInAnonymously(auth)
    } catch (e) {
      throw new Error(e?.message || 'Sign-in failed. Try again.')
    }

    try {
      const { allowed, reason } = await checkTraineeLockForLogin(traineeId)
      if (!allowed) {
        try { await signOut(auth) } catch (_) {}
        throw new Error(reason || 'You cannot sign in right now.')
      }
    } catch (e) {
      if (e?.message?.includes('permission') || e?.message?.includes('insufficient')) {
        console.warn('[Auth] Lock check failed (permissions?). Allowing login. Deploy firestore.rules if you use test locks.', e?.message)
      } else {
        throw e
      }
    }

    setCurrentUser(user)
    try { sessionStorage.setItem('currentUser', JSON.stringify(user)) } catch (_) {}
    try {
      if (cred?.user && db) {
        const payload = { empNum, name: user.name, role: 'trainee', store: user.store, traineeId, orgId, lastLoginAt: new Date().toISOString() }
        await setDoc(doc(db, 'users', cred.user.uid), payload, { merge: true })
        const setClaims = httpsCallable(getFunctions(app), 'setCustomClaims')
        await setClaims({ role: 'trainee', store: user.store, empNum: user.empNum })
        await cred.user.getIdToken(true)
      }
    } catch (e) { console.warn('[Auth] Firebase write/claims skipped:', e?.message) }
    return user
  }, [])

  const logout = useCallback(() => {
    setCurrentUser(null)
    try { sessionStorage.removeItem('currentUser') } catch (_) {}
  }, [])

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
