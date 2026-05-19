/**
 * medicService.js — Frontend reads for the Medic Activity Log + scoreboard
 * (CharTrain Sentinel & Medic, Phase 3 — §D6 Activity Log, §D1 scoreboard).
 *
 * All reads are owner/admin/manager-gated by firestore.rules; every Medic
 * collection is Cloud-Function/Admin-SDK write only. This service NEVER writes
 * to medicRemediations — the only write path is the revert callable (a stub
 * until a real revert Cloud Function ships).
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot,
  query, limit, orderBy,
} from 'firebase/firestore'
import { db } from '../firebase'

const REMEDIATIONS = 'medicRemediations'

/**
 * Subscribe to the Medic remediation ledger in real-time, newest-first.
 * This is the data behind the Activity Log (§D6). Returns unsubscribe fn.
 */
export function subscribeToRemediations(callback, maxCount = 100) {
  if (!db) return () => {}
  return onSnapshot(
    query(collection(db, REMEDIATIONS), orderBy('createdAt', 'desc'), limit(maxCount)),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    // Permission errors are expected during auth-token propagation — warn, not error.
    (err) => console.warn('[Medic] subscribeToRemediations:', err?.code || err?.message),
  )
}

/**
 * One-shot fetch of recent remediations (newest-first). Fallback for callers
 * that don't want a live listener.
 */
export async function getRecentRemediations(maxCount = 100) {
  if (!db) return []
  try {
    const snap = await getDocs(
      query(collection(db, REMEDIATIONS), orderBy('createdAt', 'desc'), limit(maxCount)),
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.warn('[Medic] getRecentRemediations:', e?.code || e?.message)
    return []
  }
}

/**
 * Subscribe to the healer registry (medicHealers). May be empty / non-existent
 * until the Phase 2 build lands it — soft-fails to []. Returns unsubscribe fn.
 */
export function subscribeToHealers(callback) {
  if (!db) return () => {}
  return onSnapshot(
    collection(db, 'medicHealers'),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err) => console.warn('[Medic] subscribeToHealers:', err?.code || err?.message),
  )
}

/**
 * Read the observability-coverage doc (systemHealth/observabilityCoverage) for
 * the scoreboard's coverage %. Soft-fails to null when the doc/auditor isn't
 * live yet (the coverage auditor is a §D2 capability).
 */
export async function getObservabilityCoverage() {
  if (!db) return null
  try {
    const snap = await getDoc(doc(db, 'systemHealth', 'observabilityCoverage'))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  } catch (e) {
    console.warn('[Medic] getObservabilityCoverage:', e?.code || e?.message)
    return null
  }
}

/**
 * Fetch all sentinelFindings for the scoreboard's findings/day + MTTD aggregation.
 * Capped — the scoreboard only needs a recent window. Soft-fails to [].
 */
export async function getFindingsForScoreboard(maxCount = 500) {
  if (!db) return []
  try {
    const snap = await getDocs(query(collection(db, 'sentinelFindings'), limit(maxCount)))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.warn('[Medic] getFindingsForScoreboard:', e?.code || e?.message)
    return []
  }
}

/** Tolerant Firestore-timestamp → epoch-ms (handles Timestamp, ms, ISO string). */
export function tsToMs(ts) {
  if (ts == null) return 0
  if (typeof ts === 'number') return ts
  if (typeof ts?.toMillis === 'function') return ts.toMillis()
  if (typeof ts?.toDate === 'function') return ts.toDate().getTime()
  if (typeof ts === 'string') { const n = Date.parse(ts); return Number.isFinite(n) ? n : 0 }
  return 0
}

/**
 * Compute the §D1 scoreboard client-side from the Phase-3 inputs:
 *   - remediations (medicRemediations)
 *   - findings (sentinelFindings)
 *   - coverage (systemHealth/observabilityCoverage)
 *
 * Phase 3 is intentionally client-side aggregation — Part 8 §D1 says the data
 * is "from Phase 1", the dashboard is Phase 3. There is no medicScoreboard
 * read here yet; that collection is computed by the weekly meta-review.
 *
 * Returns a stable shape so the panel renders even with zero data.
 */
export function computeScoreboard({ remediations = [], findings = [], coverage = null } = {}) {
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000

  // ── Findings/day (rolling 7-day window of findings that have a detect time) ──
  const findingTimes = findings
    .map(f => tsToMs(f.detectedAt || f.firstSeenAt || f.createdAt))
    .filter(Boolean)
  const last7d = findingTimes.filter(t => now - t <= 7 * DAY)
  const findingsPerDay = last7d.length ? +(last7d.length / 7).toFixed(1) : 0

  // ── Auto-resolved % — remediations resolved with no human grading/handoff ──
  const resolved = remediations.filter(r => r.result === 'resolved')
  const autoResolved = resolved.filter(
    r => r.status !== 'handed_to_human' && (r.tier === 0 || r.tier === 1),
  )
  const autoResolvedPct = resolved.length
    ? Math.round((autoResolved.length / resolved.length) * 100)
    : 0

  // ── Recurrence rate — remediations whose recurrence.occurrence > 1 ──
  const recurrences = remediations.filter(r => (r.recurrence?.occurrence ?? 1) > 1)
  const recurrenceRate = remediations.length
    ? Math.round((recurrences.length / remediations.length) * 100)
    : 0

  // ── MTTR — mean timeToResolveMs over remediations that carry one ──
  const resolveTimes = remediations
    .map(r => r.timeToResolveMs)
    .filter(v => typeof v === 'number' && v > 0)
  const mttrMs = resolveTimes.length
    ? Math.round(resolveTimes.reduce((a, b) => a + b, 0) / resolveTimes.length)
    : null

  // ── MTTD — mean (firstSeenAt → detectedAt) gap where both exist ──
  const detectGaps = findings
    .map(f => {
      const first = tsToMs(f.firstSeenAt)
      const detected = tsToMs(f.detectedAt)
      return first && detected && detected >= first ? detected - first : null
    })
    .filter(v => v != null)
  const mttdMs = detectGaps.length
    ? Math.round(detectGaps.reduce((a, b) => a + b, 0) / detectGaps.length)
    : null

  // ── Observability coverage % — from the §D2 auditor doc, if live ──
  let coveragePct = null
  if (coverage) {
    if (typeof coverage.coveragePct === 'number') coveragePct = Math.round(coverage.coveragePct)
    else if (typeof coverage.instrumented === 'number' && typeof coverage.total === 'number' && coverage.total > 0) {
      coveragePct = Math.round((coverage.instrumented / coverage.total) * 100)
    }
  }

  return {
    findingsPerDay,
    autoResolvedPct,
    recurrenceRate,
    mttrMs,
    mttdMs,
    coveragePct,
    totalRemediations: remediations.length,
    shadowRemediations: remediations.filter(r => r.shadowMode).length,
    openFindings: findings.filter(f => !f.resolved).length,
  }
}
