import { useState, useEffect } from 'react'
import { SHIFT_META } from '../constants'
import { formatWhenHuman, getShiftStatus, updateChecklistItem, updateShiftFeedback, getShiftAuditEntries } from '../utils/helpers'
import ShiftChecklist from './ShiftChecklist'
import StandardsQuizModal from './StandardsQuizModal'

const SIGNOFF_LABELS = { knowledge: 'Knowledge', execution: 'Execution', confidence: 'Confidence' }

export default function ShiftDetailView({
  shiftKey,
  rec,
  traineeId,
  staffAccounts = {},
  onBack,
  onRateSignOff,
  canSignOff = false,
  canEditChecklist = false,
  currentUserEmpNum = '',
  trainingData = {},
  setTrainingData,
  saveTrainingData,
}) {
  const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey, icon: '' }
  const item = (rec?.schedule && rec.schedule[shiftKey]) || {}
  const status = getShiftStatus(rec, shiftKey)
  const whenStr = item.when ? formatWhenHuman(item.when) : 'Not scheduled'
  const getName = (emp) => {
    const r = staffAccounts[emp]
    return (r && r.name) ? r.name : (emp ? `#${emp}` : '—')
  }
  const trainerName = item.trainer ? getName(item.trainer) : 'Not assigned'
  const feedback = (rec?.shiftFeedback && rec.shiftFeedback[shiftKey]) || {}
  const readiness = (rec?.checklists && rec.checklists[shiftKey]?.readiness) || {}
  const clInst = (rec?.checklists && rec.checklists[shiftKey]) || {}
  const clItems = clInst.items || {}
  const trainerSignStr = item.trainerSignedBy
    ? `${getName(item.trainerSignedBy)}${item.trainerSignedAt ? ' · ' + formatWhenHuman(item.trainerSignedAt) : ''}`
    : '—'
  const managerSignStr = item.managerSignedBy
    ? `${getName(item.managerSignedBy)}${item.managerSignedAt ? ' · ' + formatWhenHuman(item.managerSignedAt) : ''}`
    : '—'

  const [sogDraft, setSogDraft] = useState({ strengths: feedback.strengths ?? '', opportunities: feedback.opportunities ?? '', goalsNext: feedback.goalsNext ?? '' })
  const [standardsQuizOpen, setStandardsQuizOpen] = useState(false)
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false)
  const auditEntries = getShiftAuditEntries(rec, shiftKey)
  useEffect(() => {
    setSogDraft({ strengths: feedback.strengths ?? '', opportunities: feedback.opportunities ?? '', goalsNext: feedback.goalsNext ?? '' })
  }, [feedback.strengths, feedback.opportunities, feedback.goalsNext])

  function handleChecklistItemChange(itemId, value) {
    if (!traineeId || !setTrainingData || !saveTrainingData) return
    const next = updateChecklistItem(trainingData, traineeId, shiftKey, itemId, value, currentUserEmpNum || undefined)
    setTrainingData(next)
    saveTrainingData(next)
  }

  function handleSaveSog() {
    if (!traineeId || !setTrainingData || !saveTrainingData) return
    const next = updateShiftFeedback(trainingData, traineeId, shiftKey, {
      strengths: sogDraft.strengths || undefined,
      opportunities: sogDraft.opportunities || undefined,
      goalsNext: sogDraft.goalsNext || undefined,
    })
    setTrainingData(next)
    saveTrainingData(next)
  }

  return (
    <div className="shift-detail-view rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn btn-secondary btn-small" onClick={onBack}>
          ← Back
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-small btn-secondary"
            onClick={() => setStandardsQuizOpen(true)}
          >
            Quiz: Standards &amp; 7 Steps
          </button>
          <button
            type="button"
            className="btn btn-small btn-secondary"
            onClick={() => setAuditDrawerOpen(true)}
          >
            View audit
          </button>
          {canSignOff && onRateSignOff && (
            <button type="button" className="btn btn-small" onClick={onRateSignOff}>
              Rate &amp; Sign Off
            </button>
          )}
        </div>
      </div>
      <StandardsQuizModal
        open={standardsQuizOpen}
        shiftKey={shiftKey}
        shiftLabel={meta.label}
        onClose={() => setStandardsQuizOpen(false)}
      />
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-800">
          {meta.icon ? <span className="mr-1.5">{meta.icon}</span> : null}
          {meta.label}
        </h2>
        <div className="mt-1 text-sm text-gray-600">{whenStr}</div>
        <div className="mt-0.5 text-sm text-gray-500">Trainer: {trainerName}</div>
        <span
          className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold text-white"
          style={{
            backgroundColor:
              status.complete ? '#2e7d32' : status.managerSigned ? '#5e35b1' : status.trainerSigned ? '#5e35b1' : '#e65100',
          }}
        >
          {status.state}
        </span>
      </div>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Checklist</h3>
        <ShiftChecklist
          shiftKey={shiftKey}
          items={clItems}
          canEdit={canEditChecklist}
          onItemChange={handleChecklistItemChange}
        />
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Strengths / Opportunities / Goals</h3>
        {canEditChecklist ? (
          <div className="space-y-2 rounded-lg bg-gray-50 p-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Strengths</label>
              <textarea
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                rows={2}
                value={sogDraft.strengths}
                onChange={(e) => setSogDraft((d) => ({ ...d, strengths: e.target.value }))}
                placeholder="What went well..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Opportunities</label>
              <textarea
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                rows={2}
                value={sogDraft.opportunities}
                onChange={(e) => setSogDraft((d) => ({ ...d, opportunities: e.target.value }))}
                placeholder="Areas to improve..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Goals for next shift</label>
              <textarea
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                rows={2}
                value={sogDraft.goalsNext}
                onChange={(e) => setSogDraft((d) => ({ ...d, goalsNext: e.target.value }))}
                placeholder="Next shift goals..."
              />
            </div>
            <button type="button" className="btn btn-small" onClick={handleSaveSog}>
              Save feedback
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
            {(feedback.strengths || feedback.opportunities || feedback.goalsNext) ? (
              <>
                {feedback.strengths && <div><span className="font-semibold text-gray-700">Strengths: </span><span className="text-gray-600">{feedback.strengths}</span></div>}
                {feedback.opportunities && <div><span className="font-semibold text-gray-700">Opportunities: </span><span className="text-gray-600">{feedback.opportunities}</span></div>}
                {feedback.goalsNext && <div><span className="font-semibold text-gray-700">Goals for next shift: </span><span className="text-gray-600">{feedback.goalsNext}</span></div>}
              </>
            ) : (
              <p className="text-gray-500">No feedback yet.</p>
            )}
          </div>
        )}
      </section>

      {(Object.keys(readiness).length > 0 || feedback.notes) && (
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Trainer sign-off feedback</h3>
          <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
            {Object.keys(readiness).length > 0 && (
              <div className="flex flex-wrap gap-3">
                {Object.entries(readiness).map(([k, v]) => (
                  v != null && (
                    <span key={k} className="text-gray-700">
                      {SIGNOFF_LABELS[k] || k}: <strong>{v}/5</strong>
                    </span>
                  )
                ))}
              </div>
            )}
            {feedback.notes && (
              <div>
                <span className="font-semibold text-gray-700">Notes: </span>
                <span className="text-gray-600">{feedback.notes}</span>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Sign-off</h3>
        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <div>
            <span className="font-semibold text-gray-700">Trainer: </span>
            <span className="text-gray-600">{trainerSignStr}</span>
          </div>
          <div className="mt-1">
            <span className="font-semibold text-gray-700">Manager: </span>
            <span className="text-gray-600">{managerSignStr}</span>
          </div>
        </div>
      </section>

      {auditDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAuditDrawerOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Audit trail</h3>
              <button type="button" className="btn btn-small btn-secondary" onClick={() => setAuditDrawerOpen(false)}>
                Close
              </button>
            </div>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-gray-500">No audit entries for this shift.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {auditEntries.map((entry, i) => (
                  <li key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                    <span className="font-medium text-gray-700">{entry.action}</span>
                    {entry.timestamp && (
                      <span className="ml-2 text-gray-500">{formatWhenHuman(entry.timestamp)}</span>
                    )}
                    {entry.by && <span className="ml-2 text-gray-600">by #{entry.by}</span>}
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <pre className="mt-1 whitespace-pre-wrap text-xs text-gray-600">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
