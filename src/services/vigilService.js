/**
 * Vigil Service — Firestore queries for E2E test monitoring data.
 */
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

/** Get the most recent vigil run. */
export async function getLatestVigilRun() {
  if (!db) return null
  const q = query(collection(db, 'vigilRuns'), orderBy('completedAt', 'desc'), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, ...doc.data() }
}

/** Get the last N vigil runs (default 20). */
export async function getVigilRunHistory(count = 20) {
  if (!db) return []
  const q = query(collection(db, 'vigilRuns'), orderBy('completedAt', 'desc'), limit(count))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/** Get pass rate trend for the last N runs (default 14), returned oldest-first for charting. */
export async function getVigilPassRateTrend(count = 14) {
  if (!db) return []
  const q = query(collection(db, 'vigilRuns'), orderBy('completedAt', 'desc'), limit(count))
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .reverse() // oldest first for chart
}
