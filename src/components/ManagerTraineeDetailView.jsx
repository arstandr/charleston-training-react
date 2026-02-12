import { REQUIRED_SHIFT_KEYS, SHIFT_META } from '../constants'
import { getCertificationProgress, getShiftStatus, formatWhenHuman, getInitials } from '../utils/helpers'

function getName(staffAccounts, emp) {
  if (!emp) return '—'
  const r = (staffAccounts || {})[emp]
  return (r && r.name) ? r.name : `#${emp}`
}

export default function ManagerTraineeDetailView({ traineeId, trainee, trainingData, staffAccounts, onClose }) {
  const rec = (trainingData && traineeId && trainingData[traineeId]) || trainee ? { ...trainee } : null
  if (!rec) return null

  const prog = getCertificationProgress(rec)
  const schedule = rec.schedule || {}
  const testResults = rec.testResults || []
  const notes = Array.isArray(rec.notes) ? rec.notes : []

  const shiftRows = REQUIRED_SHIFT_KEYS.map((key) => {
    const item = schedule[key]
    const status = getShiftStatus(rec, key)
    const meta = SHIFT_META[key] || { label: key }
    return {
      key,
      label: meta.label,
      when: item?.when ? formatWhenHuman(item.when) : '—',
      trainer: item?.trainer ? getName(staffAccounts, item.trainer) : '—',
      state: status.state,
    }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="my-8 w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1F4D1C] text-lg font-bold text-white">
              {getInitials(rec.name)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">{rec.name || 'Unnamed'}</h2>
              <p className="text-sm text-gray-500">#{rec.employeeNumber || rec.id} · {rec.store || '—'}</p>
            </div>
          </div>
          <button type="button" className="btn btn-small btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="p-6 space-y-6">
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">Certification progress</h3>
            <div className="flex items-center gap-4">
              <div className="h-3 flex-1 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                  style={{ width: `${prog.pct}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-700">{prog.done}/{prog.total} shifts ({prog.pct}%)</span>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Schedule</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-2 pr-2">Shift</th>
                  <th className="pb-2 pr-2">Date</th>
                  <th className="pb-2 pr-2">Trainer</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shiftRows.map((r) => (
                  <tr key={r.key} className="border-b border-gray-100">
                    <td className="py-2 pr-2">{r.label}</td>
                    <td className="py-2 pr-2">{r.when}</td>
                    <td className="py-2 pr-2">{r.trainer}</td>
                    <td className="py-2">{r.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Test results</h3>
            {testResults.length === 0 ? (
              <p className="text-sm text-gray-500">No test results recorded.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {testResults.map((r, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{r.testName || r.testId || '—'}</span>
                    <span>{r.score != null ? `${r.score}%` : '—'} {r.passed ? '✓' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {notes.length > 0 && (
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Notes</h3>
              <ul className="space-y-2">
                {notes.slice().reverse().map((n, i) => (
                  <li key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                    <p className="text-gray-800">{n.text}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {n.at ? new Date(n.at).toLocaleString() : ''} {n.by ? `by #${n.by}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
