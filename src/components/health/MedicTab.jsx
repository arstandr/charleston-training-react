/**
 * MedicTab.jsx — the Medic Activity Log + scoreboard (CharTrain Sentinel & Medic,
 * Phase 3 — §D6 Activity Log, §D1 scoreboard). The direct answer to
 * "what did Medic do?" — renders the entire shadow period included, so Medic's
 * judgment is visible before it is ever allowed to act.
 *
 * Read-only over medicRemediations + sentinelFindings + systemHealth. Every
 * Medic collection is Cloud-Function write only; the one write path is the
 * Revert button, which is a guarded stub until a real revert callable ships.
 */
import { useState, useEffect, useMemo } from 'react'
import {
  subscribeToRemediations,
  getFindingsForScoreboard,
  getObservabilityCoverage,
  computeScoreboard,
  tsToMs,
} from '../../services/medicService'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  const ms = tsToMs(ts)
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

const TIER_LABELS = {
  0: 'Tier 0 · Rule match',
  1: 'Tier 1 · Triage',
  2: 'Tier 2 · Plan',
  3: 'Tier 3 · Execute',
}

const TIER_COLORS = {
  0: 'bg-green-100 text-green-800',
  1: 'bg-blue-100 text-blue-800',
  2: 'bg-violet-100 text-violet-800',
  3: 'bg-orange-100 text-orange-800',
}

const RESULT_COLORS = {
  resolved: 'bg-green-200 text-green-800',
  incomplete: 'bg-amber-200 text-amber-800',
  escalated: 'bg-orange-200 text-orange-800',
  failed: 'bg-red-200 text-red-800',
  proposed: 'bg-gray-200 text-gray-700',
}

const RESULT_ICONS = {
  resolved: '✓',
  incomplete: '◐',
  escalated: '↑',
  failed: '✗',
  proposed: '·',
}

// ─── Scoreboard ───────────────────────────────────────────────────────────────

function ScoreCard({ label, value, sub, tone = 'default' }) {
  const valueColor = tone === 'good' ? 'text-green-700'
    : tone === 'warn' ? 'text-amber-700'
    : tone === 'bad' ? 'text-red-700'
    : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function Scoreboard({ scoreboard }) {
  const s = scoreboard
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-700 mb-3">
        Scoreboard <span className="font-normal text-gray-400">— is the system getting better?</span>
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ScoreCard
          label="Findings / day"
          value={s.findingsPerDay}
          sub="rolling 7-day average"
          tone={s.findingsPerDay > 20 ? 'warn' : 'default'}
        />
        <ScoreCard
          label="Auto-resolved"
          value={`${s.autoResolvedPct}%`}
          sub="closed with no human"
          tone={s.autoResolvedPct >= 70 ? 'good' : s.autoResolvedPct >= 40 ? 'warn' : 'default'}
        />
        <ScoreCard
          label="Recurrence rate"
          value={`${s.recurrenceRate}%`}
          sub="heals that came back"
          tone={s.recurrenceRate <= 10 ? 'good' : s.recurrenceRate <= 25 ? 'warn' : 'bad'}
        />
        <ScoreCard
          label="MTTD"
          value={formatDuration(s.mttdMs)}
          sub="mean time to detect"
        />
        <ScoreCard
          label="MTTR"
          value={formatDuration(s.mttrMs)}
          sub="mean time to resolve"
        />
        <ScoreCard
          label="Observability"
          value={s.coveragePct == null ? '—' : `${s.coveragePct}%`}
          sub={s.coveragePct == null ? 'auditor not live yet' : 'instrumented surface'}
          tone={s.coveragePct == null ? 'default' : s.coveragePct >= 90 ? 'good' : 'warn'}
        />
      </div>
    </div>
  )
}

// ─── Remediation Card ─────────────────────────────────────────────────────────

function RemediationCard({ remediation, currentUser, onRevert }) {
  const [reverting, setReverting] = useState(false)
  const [revertMsg, setRevertMsg] = useState(null)
  const r = remediation

  const isShadow = !!r.shadowMode
  const result = r.result || 'proposed'
  const resultColor = RESULT_COLORS[result] || RESULT_COLORS.proposed
  const resultIcon = RESULT_ICONS[result] || RESULT_ICONS.proposed

  const borderColor = result === 'failed' ? 'border-red-200 bg-red-50'
    : result === 'escalated' ? 'border-orange-200 bg-orange-50'
    : result === 'resolved' ? 'border-green-200 bg-green-50'
    : 'border-gray-200 bg-gray-50'

  // In shadow mode Medic executes nothing — show wouldHaveAction; otherwise action.
  const action = isShadow ? r.wouldHaveAction : r.action
  const actionLabel = isShadow ? 'Would have done' : 'Action taken'

  const triggerTitle = r.trigger?.capability
    || r.trigger?.signature
    || r.signature
    || r.trigger?.refId
    || 'Unknown trigger'

  const revertAvailable = !!r.revert?.available && r.status !== 'reverted'

  async function handleRevert() {
    setReverting(true)
    setRevertMsg(null)
    try {
      const res = await onRevert(r)
      setRevertMsg(res?.message || (res?.ok ? 'Revert requested.' : 'Revert not available yet.'))
    } catch (e) {
      setRevertMsg(e?.message || 'Revert failed.')
    } finally {
      setReverting(false)
    }
  }

  return (
    <div className={`rounded-xl border-2 p-4 ${borderColor} transition-all`}>
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${resultColor}`}>
          {resultIcon} {result}
        </span>
        {r.tier != null && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIER_COLORS[r.tier] || 'bg-gray-100 text-gray-700'}`}>
            {TIER_LABELS[r.tier] || `Tier ${r.tier}`}
          </span>
        )}
        {isShadow && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
            🌓 Shadow
          </span>
        )}
        {r.healerId && (
          <span className="px-2 py-0.5 rounded bg-white border border-gray-200 text-xs text-gray-600 font-mono">
            {r.healerId}
          </span>
        )}
        {r.status === 'reverted' && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600">
            ↩ Reverted
          </span>
        )}
        {r.status === 'handed_to_human' && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
            👤 Handed to human
          </span>
        )}
        <span className="text-xs text-gray-400 ml-auto">{timeAgo(r.createdAt)}</span>
      </div>

      {/* Trigger finding */}
      <p className="text-sm font-semibold text-gray-900">
        <span className="text-gray-400 font-normal">Triggered by: </span>
        {triggerTitle}
      </p>

      {/* Plain-English diagnosis */}
      {r.diagnosis && (
        <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
          <span className="font-semibold text-gray-500">Diagnosis: </span>
          {r.diagnosis}
        </p>
      )}

      {/* Action / wouldHaveAction */}
      {action && (action.summary || action.type) && (
        <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
          <span className="font-semibold text-gray-500">{actionLabel}: </span>
          {action.summary || action.type}
          {action.type && action.summary && (
            <span className="text-gray-400"> ({action.type})</span>
          )}
        </p>
      )}

      {/* Footer meta */}
      <div className="flex flex-wrap items-center gap-3 mt-2.5 pt-2.5 border-t border-white/60 text-[11px] text-gray-400">
        {r.timeToResolveMs != null && (
          <span>⏱ resolved in {formatDuration(r.timeToResolveMs)}</span>
        )}
        {(r.recurrence?.occurrence ?? 1) > 1 && (
          <span className="text-amber-500 font-medium">↻ recurrence #{r.recurrence.occurrence}</span>
        )}
        {r.classification?.confidence != null && (
          <span>triage confidence {Math.round(r.classification.confidence * 100)}%</span>
        )}
        {r.grading?.verdict && (
          <span>graded: {r.grading.verdict}</span>
        )}
      </div>

      {/* Revert */}
      {revertAvailable && (
        <div className="mt-3 pt-2.5 border-t border-white/60 flex items-center gap-3">
          <button
            type="button"
            onClick={handleRevert}
            disabled={reverting}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {reverting ? 'Reverting…' : '↩ Revert this fix'}
          </button>
          {r.revert?.method && (
            <span className="text-[11px] text-gray-400">via {r.revert.method}</span>
          )}
          {revertMsg && <span className="text-[11px] text-gray-500">{revertMsg}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Revert handler ───────────────────────────────────────────────────────────
//
// TODO(Phase 4+): wire to a real `medicRevertRemediation` callable Cloud Function.
// No revert callable exists yet — medic-ledger.js stores revert.{available,
// method, ref} but there is no executor. This stub deliberately performs NO
// write — Medic collections are Cloud-Function write only (firestore.rules),
// and fabricating a revert would violate the no-fabrication principle (§2.6).
async function requestRevert(/* remediation */) {
  return {
    ok: false,
    message: 'Revert callable not deployed yet — logged as a TODO (Phase 4+).',
  }
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function MedicTab({ currentUser }) {
  const [remediations, setRemediations] = useState([])
  const [remLoading, setRemLoading] = useState(true)
  const [findings, setFindings] = useState([])
  const [coverage, setCoverage] = useState(null)

  // Activity Log filter: all | shadow | live
  const [modeFilter, setModeFilter] = useState('all')

  // Live ledger feed (newest-first).
  useEffect(() => {
    const unsub = subscribeToRemediations((rows) => {
      setRemediations(rows)
      setRemLoading(false)
    })
    return () => unsub()
  }, [])

  // Scoreboard inputs that don't need a live listener.
  useEffect(() => {
    getFindingsForScoreboard().then(setFindings).catch(() => {})
    getObservabilityCoverage().then(setCoverage).catch(() => {})
  }, [])

  const scoreboard = useMemo(
    () => computeScoreboard({ remediations, findings, coverage }),
    [remediations, findings, coverage],
  )

  const visibleRemediations = useMemo(() => {
    if (modeFilter === 'shadow') return remediations.filter(r => r.shadowMode)
    if (modeFilter === 'live') return remediations.filter(r => !r.shadowMode)
    return remediations
  }, [remediations, modeFilter])

  const shadowCount = remediations.filter(r => r.shadowMode).length
  const liveCount = remediations.length - shadowCount

  return (
    <div className="space-y-6">

      {/* ── Status bar ── */}
      <div className="rounded-xl p-4 flex items-center justify-between bg-indigo-50 border border-indigo-200">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🩺</span>
          <div>
            <p className="font-bold text-gray-900 text-sm">Medic — Self-Healing Control Plane</p>
            <p className="text-xs text-gray-500">
              {remediations.length === 0
                ? 'No remediations yet — Medic logs every action here.'
                : `${remediations.length} remediation${remediations.length !== 1 ? 's' : ''} on the ledger`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-indigo-700">
            {shadowCount > 0 && liveCount === 0 ? 'SHADOW MODE' : liveCount > 0 ? 'ACTIVE' : 'STANDBY'}
          </p>
          <p className="text-xs text-gray-400">
            {shadowCount} shadow · {liveCount} live
          </p>
        </div>
      </div>

      {/* ── Scoreboard (§D1) ── */}
      <Scoreboard scoreboard={scoreboard} />

      {/* ── Activity Log (§D6) ── */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h3 className="text-sm font-bold text-gray-700">
            Activity Log <span className="font-normal text-gray-400">— what did Medic do?</span>
          </h3>
          <div className="flex gap-1 ml-auto">
            {[
              { key: 'all', label: `All (${remediations.length})` },
              { key: 'shadow', label: `Shadow (${shadowCount})` },
              { key: 'live', label: `Live (${liveCount})` },
            ].map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setModeFilter(opt.key)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  modeFilter === opt.key
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {remLoading ? (
          <p className="text-xs text-gray-400">Loading the Medic ledger…</p>
        ) : visibleRemediations.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-2xl mb-2">🩺</p>
            <p className="text-sm font-semibold text-gray-700">
              {remediations.length === 0 ? 'No Medic activity yet' : 'Nothing in this view'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {remediations.length === 0
                ? 'Every remediation Medic runs — including shadow-mode rehearsals — will appear here, newest first.'
                : 'Try a different filter above.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleRemediations.map(r => (
              <RemediationCard
                key={r.id}
                remediation={r}
                currentUser={currentUser}
                onRevert={requestRevert}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
