/**
 * sentinelService.js — Frontend reads/writes for Sentinel data.
 * Covers: live findings feed, system health status, run history,
 * and acknowledge/resolve actions.
 */
import {
  collection, doc, getDocs, updateDoc, onSnapshot,
  query, where, limit, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Subscribe to all unresolved sentinel findings in real-time.
 * Sorted client-side: critical first, then by newest.
 * Returns unsubscribe function.
 */
export function subscribeToFindings(callback, maxCount = 100) {
  if (!db) return () => {}
  return onSnapshot(
    query(
      collection(db, 'sentinelFindings'),
      where('resolved', '==', false),
      limit(maxCount),
    ),
    (snap) => {
      const sevOrder = { critical: 0, warning: 1, info: 2 }
      const findings = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const sd = (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3)
          if (sd !== 0) return sd
          const at = a.detectedAt?.toMillis?.() ?? 0
          const bt = b.detectedAt?.toMillis?.() ?? 0
          return bt - at
        })
      callback(findings)
    },
    // Permission errors are expected during auth token propagation — warn, not error
    (err) => console.warn('[Sentinel] subscribeToFindings:', err?.code || err?.message),
  )
}

/**
 * Subscribe to all systemHealth docs in real-time.
 * Returns { [system]: healthDoc } via callback.
 */
export function subscribeToSystemHealth(callback) {
  if (!db) return () => {}
  return onSnapshot(
    collection(db, 'systemHealth'),
    (snap) => {
      const health = {}
      snap.docs.forEach(d => { health[d.id] = { id: d.id, ...d.data() } })
      callback(health)
    },
    (err) => console.warn('[Sentinel] subscribeToSystemHealth:', err?.code || err?.message),
  )
}

/** Get recent auto-heal actions (newest first). */
export async function getRecentHealingActions(maxCount = 20) {
  if (!db) return []
  try {
    const snap = await getDocs(
      query(collection(db, 'healingActions'), orderBy('attemptedAt', 'desc'), limit(maxCount)),
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.warn('[Sentinel] getRecentHealingActions:', e?.code || e?.message)
    return []
  }
}

/** Get recent sentinel runs (newest first). */
export async function getRecentRuns(maxCount = 20) {
  if (!db) return []
  try {
    const snap = await getDocs(
      query(collection(db, 'sentinelRuns'), orderBy('startedAt', 'desc'), limit(maxCount)),
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.warn('[Sentinel] getRecentRuns:', e?.code || e?.message)
    return []
  }
}

/**
 * Get sentinel profile for a single trainee.
 * Returns null if no profile exists yet (Sentinel hasn't run daily yet).
 */
export async function getSentinelProfile(traineeId) {
  if (!db || !traineeId) return null
  try {
    const { getDoc } = await import('firebase/firestore')
    const snap = await getDoc(doc(db, 'sentinelProfiles', String(traineeId)))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  } catch (e) {
    console.warn('[Sentinel] getSentinelProfile:', e?.code || e?.message)
    return null
  }
}

/**
 * Batch-fetch sentinel profiles for a list of trainee IDs.
 * Returns { [traineeId]: profile } map.
 */
export async function getSentinelProfilesBatch(traineeIds) {
  if (!db || !traineeIds?.length) return {}
  try {
    // Firestore 'in' query supports up to 30 items per chunk
    const chunks = []
    for (let i = 0; i < traineeIds.length; i += 30) {
      chunks.push(traineeIds.slice(i, i + 30))
    }
    const results = {}
    for (const chunk of chunks) {
      const snap = await getDocs(
        query(collection(db, 'sentinelProfiles'), where('traineeId', 'in', chunk))
      )
      snap.docs.forEach(d => { results[d.id] = { id: d.id, ...d.data() } })
    }
    return results
  } catch (e) {
    console.warn('[Sentinel] getSentinelProfilesBatch:', e?.code || e?.message)
    return {}
  }
}

/**
 * Subscribe to a trainee's Sentinel directives in real-time.
 * Returns unsubscribe function.
 */
export function subscribeToDirectives(traineeId, callback) {
  if (!db || !traineeId) return () => {}
  return onSnapshot(
    doc(db, 'sentinelDirectives', String(traineeId)),
    (snap) => callback(snap.exists() ? (snap.data().directives || []) : []),
    (err) => console.warn('[Sentinel] subscribeToDirectives:', err?.code || err?.message),
  )
}

/** Acknowledge a finding (I've seen this, not urgent right now). */
export async function acknowledgeFinding(findingId, acknowledgedBy) {
  if (!db) return
  await updateDoc(doc(db, 'sentinelFindings', findingId), {
    acknowledged: true,
    acknowledgedBy: acknowledgedBy || 'admin',
    acknowledgedAt: serverTimestamp(),
  })
}

/** Manually resolve a finding (human confirms it's fixed). */
export async function resolveFinding(findingId, resolvedBy) {
  if (!db) return
  await updateDoc(doc(db, 'sentinelFindings', findingId), {
    resolved: true,
    resolvedBy: resolvedBy || 'admin',
    resolvedAt: serverTimestamp(),
  })
}
