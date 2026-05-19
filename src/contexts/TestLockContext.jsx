import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import {
  subscribeToLock,
  createTestLock,
  deleteTestLock,
  triggerLockout as serviceTriggerLockout,
  getTestLock,
  updateTestLockViolations,
  createViolation,
  sendHeartbeat,
} from '../services/testLockService'

const TestLockContext = createContext({})

const SESSION_ID = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

export function TestLockProvider({ children }) {
  const { currentUser } = useAuth()
  const [lockState, setLockState] = useState(null)
  const [isMySession, setIsMySession] = useState(false)
  const heartbeatRef = useRef(null)
  const visibilityRef = useRef({ hiddenAt: null, violations: 0 })
  const otherSessionRecordedRef = useRef(false)
  const recordingLockRef = useRef(false)

  const userId = currentUser?.uid
  const userRole = (currentUser?.role || '').toLowerCase()
  const isTrainee = userRole === 'trainee'

  useEffect(() => {
    if (!userId) {
      setLockState(false)
      return
    }
    const unsub = subscribeToLock(userId, (data) => {
      if (!data) {
        setLockState(false)
        setIsMySession(false)
        otherSessionRecordedRef.current = false
        return
      }
      if (data.lockedOut && data.lockoutExpiresAt) {
        const raw = data.lockoutExpiresAt
        const expiresAt =
          typeof raw?.toDate === 'function'
            ? raw.toDate()
            : raw?.seconds != null
              ? new Date(raw.seconds * 1000)
              : new Date(raw)
        if (new Date() > expiresAt) {
          deleteTestLock(userId).catch(() => {})
          return
        }
      }
      setLockState(data)
      setIsMySession(data.sessionId === SESSION_ID)
    })
    return () => unsub()
  }, [userId])

  const startTestLock = useCallback(
    async (testId, testName) => {
      if (!userId) return
      const userName =
        currentUser?.name || currentUser?.displayName || currentUser?.email || 'Unknown'
      await createTestLock(userId, {
        active: true,
        userId,
        userName,
        sessionId: SESSION_ID,
        testId: testId || '',
        testName: testName || 'Quiz',
        lockedOut: false,
        lockedOutAt: null,
        lockoutExpiresAt: null,
        lockoutReason: null,
        violations: [],
        violationCount: 0,
        unlockedBy: null,
        unlockedAt: null,
        managerNotes: null,
      })
    },
    [userId, currentUser]
  )

  const endTestLock = useCallback(async () => {
    if (!userId) return
    try {
      await deleteTestLock(userId)
    } catch (_) {}
  }, [userId])

  const triggerLockout = useCallback(
    async (reason) => {
      if (!userId) return
      await serviceTriggerLockout(userId, reason)
    },
    [userId]
  )

  const recordViolation = useCallback(
    async (type, details) => {
      if (!userId || !lockState?.active) return
      // Mutex: prevent concurrent reads from producing stale violation counts
      if (recordingLockRef.current) return
      recordingLockRef.current = true
      try {
        const data = await getTestLock(userId)
        if (!data) return
        const violations = [...(data.violations || [])]
        const newCount = (data.violationCount || 0) + 1
        violations.push({
          type,
          timestamp: new Date().toISOString(),
          details: details || null,
        })
        await updateTestLockViolations(userId, violations, newCount)
        await createViolation({
          userId,
          userName: data.userName,
          testId: data.testId,
          testName: data.testName,
          violationType: type,
          details: details || `Violation #${newCount} during test`,
          resolved: false,
        })
        if (newCount >= 3) {
          await triggerLockout('excessive_violations')
        }
      } catch (e) {
        console.error('Failed to record violation:', e)
      } finally {
        recordingLockRef.current = false
      }
    },
    [userId, lockState?.active, triggerLockout]
  )

  useEffect(() => {
    if (!isMySession || !lockState?.active || !userId) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      return
    }
    heartbeatRef.current = setInterval(() => {
      sendHeartbeat(userId).catch(() => {})
    }, 30000)
    return () => clearInterval(heartbeatRef.current)
  }, [isMySession, lockState?.active, userId])

  useEffect(() => {
    if (!isMySession || !lockState?.active) return
    function handleVisibilityChange() {
      if (document.hidden) {
        visibilityRef.current.hiddenAt = Date.now()
        visibilityRef.current.violations++
        recordViolation(
          'tab_switch',
          `Left test tab (occurrence #${visibilityRef.current.violations})`
        )
      } else {
        const hiddenDuration = visibilityRef.current.hiddenAt
          ? Date.now() - visibilityRef.current.hiddenAt
          : 0
        if (hiddenDuration > 2000) {
          recordViolation(
            'visibility_hidden',
            `Tab hidden for ${Math.round(hiddenDuration / 1000)}s`
          )
        }
        visibilityRef.current.hiddenAt = null
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isMySession, lockState?.active, recordViolation])

  useEffect(() => {
    if (!lockState?.active || isMySession || !isTrainee) return
    if (otherSessionRecordedRef.current) return
    otherSessionRecordedRef.current = true
    recordViolation('new_session', 'Attempted to open app in another tab/browser during test')
  }, [lockState?.active, isMySession, isTrainee, recordViolation])

  return (
    <TestLockContext.Provider
      value={{
        lockState,
        isMySession,
        isLockedOut: lockState?.lockedOut === true,
        isTestActive: lockState?.active === true,
        sessionId: SESSION_ID,
        startTestLock,
        endTestLock,
        recordViolation,
        triggerLockout,
      }}
    >
      {children}
    </TestLockContext.Provider>
  )
}

export const useTestLock = () => useContext(TestLockContext)
