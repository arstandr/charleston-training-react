import { REQUIRED_SHIFT_KEYS, SHIFT_META } from '../constants'
import { formatWhenHuman, getShiftStatus, getCertificationProgress } from '../utils/helpers'

function getName(staffAccounts, emp) {
  if (!emp) return '—'
  const r = (staffAccounts || {})[emp]
  return (r && r.name) ? r.name : `#${emp}`
}

export default function PrintTrainingSummary({ trainee, trainingData, staffAccounts, onClose }) {
  const rec = (trainingData && trainee && trainingData[trainee.id]) || {}
  const schedule = rec.schedule || {}
  const testResults = rec.testResults || []
  const prog = getCertificationProgress(rec)

  const rows = REQUIRED_SHIFT_KEYS.map((key) => {
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
    <div className="print-training-summary bg-white text-gray-900 p-6 max-w-2xl">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-xl font-bold">{trainee?.name || trainee?.id || 'Trainee'}</h1>
          <p className="text-sm text-gray-600">#{trainee?.employeeNumber || trainee?.id} · {trainee?.store || '—'}</p>
        </div>
        <p className="text-sm text-gray-500">Generated {new Date().toLocaleDateString()}</p>
      </div>

      <section className="mb-6">
        <h2 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">Certification progress</h2>
        <p className="text-sm">{prog.done} of {prog.total} shifts complete ({prog.pct}%)</p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">Schedule</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left py-2 pr-4">Shift</th>
              <th className="text-left py-2 pr-4">Date</th>
              <th className="text-left py-2 pr-4">Trainer</th>
              <th className="text-left py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-gray-100">
                <td className="py-2 pr-4">{r.label}</td>
                <td className="py-2 pr-4">{r.when}</td>
                <td className="py-2 pr-4">{r.trainer}</td>
                <td className="py-2">{r.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">Test results</h2>
        {testResults.length === 0 ? (
          <p className="text-sm text-gray-500">No test results recorded.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-2 pr-4">Test</th>
                <th className="text-left py-2 pr-4">Score</th>
                <th className="text-left py-2">Passed</th>
              </tr>
            </thead>
            <tbody>
              {testResults.map((r, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{r.testName || r.testId || '—'}</td>
                  <td className="py-2 pr-4">{r.score != null ? r.score : '—'}</td>
                  <td className="py-2">{r.passed ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="flex gap-2 no-print">
        <button type="button" className="btn btn-small" onClick={() => window.print()}>
          Print
        </button>
        {onClose && (
          <button type="button" className="btn btn-small" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  )
}
