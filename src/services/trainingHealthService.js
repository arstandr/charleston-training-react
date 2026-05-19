/**
 * trainingHealthService.js — Frontend reads + the decision callable for the
 * Training Improvement Queue (CharTrain Sentinel & Medic, Part 9 §16).
 *
 * §16 — Sentinel's training-program health detectors file evidence-backed
 * PROPOSALS into `trainingHealthFindings`. A human approves / edits / rejects.
 *
 * §17 — proposal-only. This service NEVER writes a score, a sign-off, a
 * certification, quiz content, or a role. `trainingHealthFindings` is
 * Cloud-Function write only (firestore.rules) — the ONLY write path is the
 * `manageTrainingHealthFinding` callable, which itself only updates the
 * proposal's decision metadata and has no path to assessment data.
 */
import {
  collection, onSnapshot, query, limit, orderBy,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db, app } from '../firebase'

const COLLECTION = 'trainingHealthFindings'

/**
 * Subscribe to the Training Improvement Queue in real-time, newest-first.
 * owner/admin/manager-gated by firestore.rules. Returns an unsubscribe fn.
 */
export function subscribeToTrainingHealth(callback, maxCount = 200) {
  if (!db) return () => {}
  return onSnapshot(
    query(collection(db, COLLECTION), orderBy('lastDetectedAt', 'desc'), limit(maxCount)),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    // Permission errors are expected during auth-token propagation — warn, not error.
    (err) => console.warn('[TrainingHealth] subscribe:', err?.code || err?.message),
  )
}

/**
 * manageTrainingHealthFinding — apply a human decision to a queued proposal.
 * Goes through the Cloud Function callable (NOT a direct client write — the
 * proposal collection is write:false). §17: the callable only updates the
 * proposal's decision metadata; it cannot write assessment data.
 *
 * @param {string} proposalId        — the trainingHealthFindings doc id
 * @param {'approve'|'edit'|'reject'} decision
 * @param {object} extra             — { note, editedRemediation }
 * @returns {Promise<{ok:boolean, status?:string, error?:string}>}
 */
export async function decideTrainingHealthFinding(proposalId, decision, extra = {}) {
  try {
    const functions = getFunctions(app)
    const fn = httpsCallable(functions, 'manageTrainingHealthFinding')
    const res = await fn({
      proposalId,
      decision,
      note: extra.note ?? null,
      editedRemediation: extra.editedRemediation ?? null,
    })
    return res?.data || { ok: false, error: 'no response' }
  } catch (e) {
    console.warn('[TrainingHealth] decide failed:', e?.message)
    return { ok: false, error: e?.message || 'callable failed' }
  }
}

/** Group queue rows by status for the UI summary. */
export function summarizeQueue(rows = []) {
  const out = { open: 0, approved: 0, edited: 0, rejected: 0, recurred: 0, total: rows.length }
  for (const r of rows) {
    const s = r.status || 'open'
    if (out[s] != null) out[s]++
    if (r.recurredAfterDecision) out.recurred++
  }
  return out
}
