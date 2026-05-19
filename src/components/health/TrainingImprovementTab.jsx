/**
 * TrainingImprovementTab.jsx — the Training Improvement Queue
 * (CharTrain Sentinel & Medic, Part 9 §16).
 *
 * §16 turns the Assessment Integrity Boundary into a positive handoff surface:
 * Sentinel observes training-program health (bad quiz questions, weak shift
 * content, rubber-stamp sign-offs, stalled cohorts) and Medic assembles an
 * evidence-backed PROPOSED remediation. This tab is where a human reads the
 * evidence and approves / edits / rejects.
 *
 * §17 — proposal-only. Approving a proposal records that a human accepted it;
 * it does NOT execute a fix. No control on this page writes a score, a sign-off,
 * a certification, quiz content, or a role. The decision goes through the
 * `manageTrainingHealthFinding` callable — never a direct client write.
 *
 * Read-only over `trainingHealthFindings` + one callable. Mirrors MedicTab.jsx.
 */
import { useState, useEffect, useMemo } from 'react'
import {
  subscribeToTrainingHealth,
  decideTrainingHealthFinding,
  summarizeQueue,
} from '../../services/trainingHealthService'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tsToMs(ts) {
  if (!ts) return 0
  if (typeof ts === 'number') return ts
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (ts._seconds != null) return ts._seconds * 1000
  if (ts.seconds != null) return ts.seconds * 1000
  const t = new Date(ts).getTime()
  return Number.isFinite(t) ? t : 0
}

function timeAgo(ts) {
  const ms = tsToMs(ts)
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const KIND_LABELS = {
  bad_quiz_question: '❓ Bad quiz question',
  weak_shift_content: '📋 Weak shift content',
  rubber_stamp_signoff: '✍️ Rubber-stamp sign-off',
  stalled_cohort: '💤 Stalled cohort',
}

const SEVERITY_COLORS = {
  critical: 'bg-red-100 text-red-800',
  warning: 'bg-amber-100 text-amber-800',
  info: 'bg-blue-100 text-blue-800',
}

const STATUS_COLORS = {
  open: 'bg-indigo-100 text-indigo-700',
  approved: 'bg-green-200 text-green-800',
  edited: 'bg-violet-200 text-violet-800',
  rejected: 'bg-gray-200 text-gray-600',
}

// ─── Evidence renderer ────────────────────────────────────────────────────────
// Each proposal kind carries a different evidence shape — render the real data
// so the human gets a decision-ready packet, not a raw anomaly.

function EvidenceBlock({ kind, evidence }) {
  if (!evidence || typeof evidence !== 'object') return null
  const Row = ({ label, value }) => (
    <div className="flex justify-between gap-3 text-xs py-0.5">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-medium text-right">{value}</span>
    </div>
  )

  if (kind === 'bad_quiz_question') {
    const wrong = Array.isArray(evidence.wrongAnswerDistribution)
      ? evidence.wrongAnswerDistribution : []
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 mt-2">
        <p className="text-xs font-semibold text-gray-500 mb-1.5">Evidence</p>
        {evidence.questionText && (
          <p className="text-xs text-gray-800 italic mb-2">“{evidence.questionText}”</p>
        )}
        <Row label="Test" value={evidence.testId || '—'} />
        <Row label="Miss rate" value={`${evidence.missRatePct}% (${evidence.misses}/${evidence.attempts})`} />
        {Array.isArray(evidence.options) && evidence.options.length > 0 && (
          <div className="mt-1.5">
            <p className="text-[11px] text-gray-400 mb-0.5">Options (★ = answer key)</p>
            {evidence.options.map((opt, i) => (
              <p key={i} className="text-[11px] text-gray-600">
                {i === evidence.correctIndex ? '★ ' : '· '}{String(opt)}
              </p>
            ))}
          </div>
        )}
        {wrong.length > 0 && (
          <div className="mt-1.5">
            <p className="text-[11px] text-gray-400 mb-0.5">Most-chosen wrong answers</p>
            {wrong.map((w, i) => (
              <p key={i} className="text-[11px] text-red-600">{w.label} — {w.count}×</p>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (kind === 'weak_shift_content') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 mt-2">
        <p className="text-xs font-semibold text-gray-500 mb-1.5">Evidence</p>
        <Row label="Shift" value={evidence.shiftLabel || evidence.shiftKey} />
        <Row label="Linked test" value={`${evidence.linkedTest} (${evidence.testId})`} />
        <Row label="First-attempt fail rate"
          value={`${evidence.firstFailRatePct}% (${evidence.firstFails}/${evidence.firstAttempts})`} />
      </div>
    )
  }

  if (kind === 'rubber_stamp_signoff') {
    const fast = Array.isArray(evidence.fastExamples) ? evidence.fastExamples : []
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 mt-2">
        <p className="text-xs font-semibold text-gray-500 mb-1.5">Evidence</p>
        <Row label="Trainer" value={`${evidence.trainerName} (${evidence.trainerId})`} />
        <Row label="Sign-offs"
          value={`${evidence.fastSignoffs} fast / ${evidence.totalSignoffs} total (${evidence.fastSignoffRatioPct}%)`} />
        <Row label="Certified trainees underperforming"
          value={`${evidence.traineesUnderperforming}/${evidence.traineesEvaluated} (${evidence.underperformRatePct}%)`} />
        {fast.length > 0 && (
          <div className="mt-1.5">
            <p className="text-[11px] text-gray-400 mb-0.5">Suspiciously-fast sign-offs</p>
            {fast.map((f, i) => (
              <p key={i} className="text-[11px] text-red-600">
                trainee {f.traineeId || '?'} — signed {f.minutesToSignoff} min after checklist start
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (kind === 'stalled_cohort') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 mt-2">
        <p className="text-xs font-semibold text-gray-500 mb-1.5">Evidence</p>
        <Row label="Store" value={evidence.store} />
        <Row label="Stalled"
          value={`${evidence.stalledTrainees}/${evidence.totalTrainees} (${evidence.stalledRatePct}%)`} />
      </div>
    )
  }

  // Fallback — raw evidence dump.
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 mt-2">
      <p className="text-xs font-semibold text-gray-500 mb-1">Evidence</p>
      <pre className="text-[10px] text-gray-600 overflow-x-auto">
        {JSON.stringify(evidence, null, 2)}
      </pre>
    </div>
  )
}

// ─── Proposal card ─────────────────────────────────────────────────────────────

function ProposalCard({ proposal, onDecision }) {
  const p = proposal
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(p.editedRemediation || p.proposedRemediation || '')
  const [note, setNote] = useState('')

  const status = p.status || 'open'
  const isOpen = status === 'open' || status === 'edited'

  async function decide(decision) {
    setBusy(true)
    setMsg(null)
    try {
      const extra = { note: note || null }
      if (decision === 'edit') extra.editedRemediation = editText
      const res = await onDecision(p.id, decision, extra)
      setMsg(res?.ok ? `Recorded: ${res.status}` : (res?.error || 'Failed'))
      if (res?.ok && decision === 'edit') setEditing(false)
    } catch (e) {
      setMsg(e?.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const sevColor = SEVERITY_COLORS[p.severity] || SEVERITY_COLORS.warning
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.open
  const border = status === 'approved' ? 'border-green-200 bg-green-50'
    : status === 'rejected' ? 'border-gray-200 bg-gray-50'
    : p.severity === 'critical' ? 'border-red-200 bg-red-50'
    : 'border-amber-200 bg-amber-50'

  return (
    <div className={`rounded-xl border-2 p-4 ${border}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white border border-gray-200 text-gray-700">
          {KIND_LABELS[p.kind] || p.kind}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sevColor}`}>
          {p.severity}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
          {status}
        </span>
        {p.recurredAfterDecision && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
            ↻ recurred after decision
          </span>
        )}
        <span className="text-xs text-gray-400 ml-auto">{timeAgo(p.lastDetectedAt)}</span>
      </div>

      <p className="text-sm font-semibold text-gray-900">{p.title}</p>
      {p.summary && <p className="text-xs text-gray-600 mt-1">{p.summary}</p>}

      {/* Evidence */}
      <EvidenceBlock kind={p.kind} evidence={p.evidence} />

      {/* Proposed remediation */}
      <div className="mt-2">
        <p className="text-xs font-semibold text-gray-500 mb-0.5">
          Proposed remediation
          <span className="font-normal text-gray-400"> — Medic proposes; a human executes by hand</span>
        </p>
        {editing ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            className="w-full text-xs p-2 rounded-lg border border-gray-300"
          />
        ) : (
          <p className="text-xs text-gray-700 leading-relaxed">
            {p.editedRemediation || p.proposedRemediation || '—'}
            {p.editedRemediation && (
              <span className="text-violet-500"> (edited by {p.decidedBy || 'a human'})</span>
            )}
          </p>
        )}
      </div>

      {/* Decision controls */}
      {isOpen ? (
        <div className="mt-3 pt-2.5 border-t border-white/60">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (logged with the decision)…"
            className="w-full text-xs p-1.5 rounded-lg border border-gray-300 mb-2"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button" disabled={busy}
              onClick={() => decide('approve')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              ✓ Approve
            </button>
            {editing ? (
              <button
                type="button" disabled={busy}
                onClick={() => decide('edit')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
              >
                Save edit
              </button>
            ) : (
              <button
                type="button" disabled={busy}
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                ✎ Edit proposal
              </button>
            )}
            <button
              type="button" disabled={busy}
              onClick={() => decide('reject')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              ✗ Reject
            </button>
            {msg && <span className="text-[11px] text-gray-500 self-center">{msg}</span>}
          </div>
        </div>
      ) : (
        <div className="mt-3 pt-2.5 border-t border-white/60 text-[11px] text-gray-400">
          {status} by {p.decidedBy || 'a human'} · {timeAgo(p.decidedAt)}
          {p.decisionNote && <span> — “{p.decisionNote}”</span>}
        </div>
      )}
    </div>
  )
}

// ─── Main tab ──────────────────────────────────────────────────────────────────

export default function TrainingImprovementTab() {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open') // open | all | approved | rejected

  useEffect(() => {
    const unsub = subscribeToTrainingHealth((rows) => {
      setProposals(rows)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const summary = useMemo(() => summarizeQueue(proposals), [proposals])

  const visible = useMemo(() => {
    if (filter === 'all') return proposals
    if (filter === 'open') return proposals.filter(p => (p.status || 'open') === 'open' || p.status === 'edited')
    return proposals.filter(p => p.status === filter)
  }, [proposals, filter])

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="rounded-xl p-4 flex items-center justify-between bg-emerald-50 border border-emerald-200">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎓</span>
          <div>
            <p className="font-bold text-gray-900 text-sm">Training Improvement Queue</p>
            <p className="text-xs text-gray-500">
              Decision-ready proposals from Sentinel — Medic proposes, a human decides.
              Scores, sign-offs, and certifications are never auto-changed.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-emerald-700">{summary.open} open</p>
          <p className="text-xs text-gray-400">
            {summary.approved} approved · {summary.rejected} rejected
            {summary.recurred > 0 && ` · ${summary.recurred} recurred`}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-bold text-gray-700">
          Proposals <span className="font-normal text-gray-400">— what the training program needs</span>
        </h3>
        <div className="flex gap-1 ml-auto">
          {[
            { key: 'open', label: `Open (${summary.open + summary.edited})` },
            { key: 'approved', label: `Approved (${summary.approved})` },
            { key: 'rejected', label: `Rejected (${summary.rejected})` },
            { key: 'all', label: `All (${summary.total})` },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                filter === opt.key
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Loading the Training Improvement Queue…</p>
      ) : visible.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-2xl mb-2">🎓</p>
          <p className="text-sm font-semibold text-gray-700">
            {proposals.length === 0 ? 'No training-health proposals yet' : 'Nothing in this view'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {proposals.length === 0
              ? 'Sentinel reviews training-program health weekly. Bad quiz questions, weak shift content, rubber-stamp sign-offs, and stalled cohorts will surface here as decision-ready proposals.'
              : 'Try a different filter above.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(p => (
            <ProposalCard key={p.id} proposal={p} onDecision={decideTrainingHealthFinding} />
          ))}
        </div>
      )}
    </div>
  )
}
