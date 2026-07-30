/**
 * Cloud Function session tokens for trainees. No Firebase Auth.
 * Uses createTraineeSession, takeOverTraineeSession, heartbeatTraineeSession.
 */
import { app, db } from '../firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

const functions = getFunctions(app)

export async function createSession(empNum) {
  const fn = httpsCallable(functions, 'createTraineeSession')
  const result = await fn({ empNum })
  return result.data
}

export async function takeOverSession(traineeId, empNum) {
  const fn = httpsCallable(functions, 'takeOverTraineeSession')
  const result = await fn({ traineeId, empNum })
  return result.data
}

export async function logoutSession(traineeId, sessionToken) {
  if (!traineeId || !sessionToken) return
  const fn = httpsCallable(functions, 'logoutTraineeSession')
  await fn({ traineeId, sessionToken }).catch(() => {})
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
        onRevoked()
      }
      return
    }
    const docToken = snap.data()?.sessionToken
    const ourToken = typeof getCurrentSessionToken === 'function' ? getCurrentSessionToken() : getCurrentSessionToken
    if (ourToken && docToken && docToken !== ourToken) {
      onRevoked()
    }
  }, (err) => {
    console.error('[Session] onSnapshot error:', err?.message)
  })
}
