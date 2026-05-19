/**
 * System Health Service — all Firestore operations for the SystemHealthPage.
 * Covers: config reads, error feed, usage stats, Toast sync statuses,
 * active sessions, critical alerts, Charlie feedback, and KB chunks.
 */
import {
  collection, doc, getDoc, getDocs, deleteDoc, updateDoc, writeBatch,
  query, where, orderBy, limit, onSnapshot, Timestamp, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

// ---------------------------------------------------------------------------
// Config reads
// ---------------------------------------------------------------------------

/** Read Gemini config (both legacy 'geminiKey' and new 'geminiApiKey' docs). */
export async function getGeminiConfig() {
  if (!db) return { geminiKey: {}, geminiApiKey: {} }
  const [keySnap, apiKeySnap] = await Promise.all([
    getDoc(doc(db, 'config', 'geminiKey')),
    getDoc(doc(db, 'config', 'geminiApiKey')),
  ])
  return {
    geminiKey: keySnap.exists() ? keySnap.data() : {},
    geminiApiKey: apiKeySnap.exists() ? apiKeySnap.data() : {},
  }
}

/** Read Toast POS config doc. */
export async function getToastConfig() {
  if (!db) return {}
  const snap = await getDoc(doc(db, 'config', 'toast'))
  return snap.exists() ? snap.data() : {}
}

// ---------------------------------------------------------------------------
// Error feed
// ---------------------------------------------------------------------------

/** Get recent client errors (last 20, ordered by timestamp desc). */
export async function getRecentClientErrors(maxCount = 20) {
  if (!db) return []
  const q = query(collection(db, 'clientErrors'), orderBy('timestamp', 'desc'), limit(maxCount))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/** Subscribe to live error feed (real-time). Returns unsubscribe fn. */
export function subscribeLiveErrors(callback, maxCount = 50) {
  if (!db) return () => {}
  return onSnapshot(
    query(collection(db, 'clientErrors'), orderBy('timestamp', 'desc'), limit(maxCount)),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
  )
}

/** Delete all client errors (batched for efficiency). */
export async function clearAllClientErrors() {
  if (!db) return
  const snap = await getDocs(collection(db, 'clientErrors'))
  if (snap.empty) return
  // Firestore batch limit is 500 per commit
  const BATCH_SIZE = 500
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}

// ---------------------------------------------------------------------------
// Usage / feature health stats
// ---------------------------------------------------------------------------

/** Get today's usage stats from featureUsage (since startOfDay). */
export async function getTodayUsageStats() {
  if (!db) return []
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const startTimestamp = Timestamp.fromDate(startOfDay)
  const snap = await getDocs(
    query(collection(db, 'featureUsage'), where('timestamp', '>=', startTimestamp))
  )
  return snap.docs.map(d => d.data())
}

/** Get feature health data (errors + usage in last 24h). */
export async function getFeatureHealthData() {
  if (!db) return { errors: [], usage: [] }
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const cutoff = Timestamp.fromDate(twentyFourHoursAgo)
  const [errSnap, usageSnap] = await Promise.all([
    getDocs(query(collection(db, 'clientErrors'), where('timestamp', '>=', cutoff))),
    getDocs(query(collection(db, 'featureUsage'), where('timestamp', '>=', cutoff))),
  ])
  return {
    errors: errSnap.docs.map(d => d.data()),
    usage: usageSnap.docs.map(d => d.data()),
  }
}

// ---------------------------------------------------------------------------
// Toast sync statuses
// ---------------------------------------------------------------------------

/** Get all Toast sync status docs. */
export async function getToastSyncStatuses() {
  if (!db) return []
  const snap = await getDocs(collection(db, 'toastSyncStatus'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ---------------------------------------------------------------------------
// Active sessions
// ---------------------------------------------------------------------------

/** Subscribe to active sessions (real-time, capped at 50). Returns unsubscribe fn. */
export function subscribeActiveSessions(callback) {
  if (!db) return () => {}
  return onSnapshot(
    query(collection(db, 'activeSessions'), limit(50)),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
  )
}

// ---------------------------------------------------------------------------
// Critical alerts
// ---------------------------------------------------------------------------

/** Subscribe to unresolved critical alerts (real-time, capped at 50). Returns unsubscribe fn. */
export function subscribeCriticalAlerts(callback) {
  if (!db) return () => {}
  return onSnapshot(
    query(
      collection(db, 'criticalAlerts'),
      where('resolved', '==', false),
      orderBy('createdAt', 'desc'),
      limit(50),
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
  )
}

// ---------------------------------------------------------------------------
// Charlie feedback
// ---------------------------------------------------------------------------

/** Subscribe to unresolved Charlie feedback (real-time). Returns unsubscribe fn. */
export function subscribeCharlieFeedback(callback, maxCount = 50) {
  if (!db) return () => {}
  return onSnapshot(
    query(
      collection(db, 'charlieFeedback'),
      where('resolved', '==', false),
      orderBy('createdAt', 'desc'),
      limit(maxCount)
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
  )
}

/** Resolve a Charlie feedback item (mark correct, fixed, or dismissed). */
export async function resolveCharlieFeedback(feedbackId, verdict) {
  if (!db) throw new Error('Database not available')
  return updateDoc(doc(db, 'charlieFeedback', feedbackId), { resolved: true, verdict })
}

// ---------------------------------------------------------------------------
// Knowledge base chunks
// ---------------------------------------------------------------------------

/** Get KB chunks (ordered by createdAt desc, paginated). */
export async function getKbChunks(maxCount = 20) {
  if (!db) return []
  const snap = await getDocs(
    query(collection(db, 'chatbotKnowledge'), orderBy('createdAt', 'desc'), limit(maxCount))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/** Delete a single KB chunk. */
export async function deleteKbChunk(chunkId) {
  if (!db) throw new Error('Database not available')
  return deleteDoc(doc(db, 'chatbotKnowledge', chunkId))
}

// ---------------------------------------------------------------------------
// Firebase connectivity test
// ---------------------------------------------------------------------------

/** Test read access to a collection (getDocs with limit 1). Returns { ok, permission }. */
export async function testCollectionAccess(collectionName) {
  if (!db) return { ok: false, permission: false }
  try {
    await getDocs(query(collection(db, collectionName), limit(1)))
    return { ok: true }
  } catch (e) {
    const msg = e?.message || e?.code || ''
    return { ok: false, permission: msg.toLowerCase().includes('permission') }
  }
}
