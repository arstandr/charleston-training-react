import { useState, useMemo } from 'react'
import { TERMINATION_REASONS, REQUIRED_SHIFT_KEYS, SHIFT_META } from '../constants'
import { getCertificationProgress, getTraineeReadinessAggregate } from '../utils/helpers'

export default function TerminateTraineeModal({ open, trainee, trainingData, onTerminate, onClose }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  const rec = trainee?.id ? trainingData?.[trainee.id] || trainee : trainee

  const snapshot = useMemo(() => {
    if (!rec) return null
    const schedule = rec.schedule || {}
    const cert = getCertificationProgress(rec)
    const readiness = getTraineeReadinessAggregate(trainingData, trainee?.id)

    // Find last completed shift (loop backwards through required keys)
    let lastShiftKey = null
    let lastShiftDate = null
    for (let i = REQUIRED_SHIFT_KEYS.length - 1; i >= 0; i--) {
      const key = REQUIRED_SHIFT_KEYS[i]
      const item = schedule[key]
      if (item?.trainerSignedAt) {
        lastShiftKey = key
        lastShiftDate = item.when || item.date || null
        break
      }
    }

    // Days in training: earliest "when" to now
    let earliest = null
    for (const item of Object.values(schedule)) {
      const w = item?.when || item?.date
      if (w) {
        const d = new Date(w)
        if (!earliest || d < earliest) earliest = d
      }
    }
    const daysInTraining = earliest ? Math.max(1, Math.round((Date.now() - earliest.getTime()) / 86400000)) : 0

    return {
      lastShiftKey,
      lastShiftDate,
      certProgress: cert.pct,
      certDone: cert.done,
      certTotal: cert.total,
      readinessAvg: readiness.average,
      daysInTraining,
    }
  }, [rec, trainingData, trainee?.id])

  if (!open || !trainee) return null

  function handleSubmit() {
    if (!reason) return
    onTerminate(trainee.id, reason, note, snapshot)
    setReason('')
    setNote('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="bg-red-600 text-white px-6 py-4 rounded-t-2xl">
          <h3 className="text-lg font-bold">Terminate {trainee.name || 'Trainee'}</h3>
          <p className="text-red-100 text-sm mt-1">This will archive the trainee and record termination details.</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Reason selection */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Reason for termination</label>
            <div className="space-y-2">
              {TERMINATION_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(r.key)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium ${
                    reason === r.key
                      ? 'border-red-500 bg-red-50 text-red-800'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
              rows={3}
              placeholder="Any additional context..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Training summary snapshot */}
          {snapshot && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Training Summary at Exit</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-500 text-xs">Last shift</div>
                  <div className="font-medium text-gray-800">
                    {snapshot.lastShiftKey ? (SHIFT_META[snapshot.lastShiftKey]?.label || snapshot.lastShiftKey) : 'None'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Last shift date</div>
                  <div className="font-medium text-gray-800">
                    {snapshot.lastShiftDate ? new Date(snapshot.lastShiftDate).toLocaleDateString() : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Certification progress</div>
                  <div className="font-medium text-gray-800">{snapshot.certDone}/{snapshot.certTotal} ({snapshot.certProgress}%)</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Readiness avg</div>
                  <div className="font-medium text-gray-800">{snapshot.readinessAvg != null ? `${snapshot.readinessAvg}/5` : '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Days in training</div>
                  <div className="font-medium text-gray-800">{snapshot.daysInTraining || '—'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn flex-1" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              disabled={!reason}
              onClick={handleSubmit}
            >
              Terminate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
