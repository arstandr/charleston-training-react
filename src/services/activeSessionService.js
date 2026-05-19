/**
 * Cloud Function session tokens for trainees. No Firebase Auth.
 * Uses createTraineeSession, takeOverTraineeSession, heartbeatTraineeSession.
 */
import { db } from '../firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

const functions = getFunctions()

export async function createSession(empNum) {
  const fn = httpsCallable(functions, 'createTraineeSession')
  const result = await fn({ empNum })
  return result.data
}

export async function takeOverSession(traineeId) {
  const fn = httpsCallable(functions, 'takeOverTraineeSession')
  const result = await fn({ traineeId })
  return result.data
}

export async function heartbeat(traineeId, sessionToken) {
  const fn = httpsCallable(functions, 'heartbeatTraineeSession')
  const result = await fn({ traineeId, sessionToken })
  return result.data
}

export function subscribeSession(traineeId, getCurrentSessionToken, onRevoked) {
  if (!traineeId || !db) return () => {}
  const ref = doc(db, 'activeSessions', traineeId)
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      const token = typeof getCurrentSessionToken === 'function' ? getCurrentSessionToken() : getCurrentSessionToken
      if (token) {
        console.log('[Session] doc deleted → revoked')
        onRevoked()
      }
      return
    }
    const docToken = snap.data()?.sessionToken
    const ourToken = typeof getCurrentSessionToken === 'function' ? getCurrentSessionToken() : getCurrentSessionToken
    console.log('[Session] snapshot fired. ourToken:', ourToken?.slice?.(0, 8), 'docToken:', docToken?.slice?.(0, 8))
    if (ourToken && docToken && docToken !== ourToken) {
      console.log('[Session] token mismatch → revoked')
      onRevoked()
    }
  }, (err) => {
    console.error('[Session] onSnapshot error:', err?.message)
  })
}
