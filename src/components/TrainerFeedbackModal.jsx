import { TRAINER_RATING_CRITERIA } from '../constants'

function formatWhen(at) {
  if (!at) return ''
  if (typeof at?.toDate === 'function') return at.toDate().toLocaleString()
  if (typeof at === 'string' && at.length >= 10) return at.slice(0, 10)
  return String(at)
}

export default function TrainerFeedbackModal({ open, trainerName, trainerEmpNum, breakdown, onClose, anonymousFeedback = false }) {
  if (!open) return null
  const overallStars = '★'.repeat(Math.round(breakdown?.overallAvg || 0)) + '☆'.repeat(5 - Math.round(breakdown?.overallAvg || 0))
  const criteriaAvgs = breakdown?.criteriaAvgs || []
  const feedbacks = breakdown?.feedbacks || []
  const count = breakdown?.count ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl border-2 border-orange-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-amber-50 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-800">Trainer feedback</h2>
          <button type="button" className="btn btn-small btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="p-6">
          <div className="mb-4">
            <div className="text-lg font-bold text-gray-800">{trainerName || `#${trainerEmpNum}`}</div>
            {trainerEmpNum != null && trainerEmpNum !== '' && (
              <div className="text-sm text-gray-500 mt-0.5">Employee #{trainerEmpNum}</div>
            )}
            <div className="text-orange-600 text-xl tracking-wider mt-2" title={`${breakdown?.overallAvg ?? 0} avg · Rated on ${count} shift${count !== 1 ? 's' : ''}`}>
              {overallStars}
            </div>
            <div className="text-sm text-gray-500 mt-0.5">
              {count > 0 ? `${breakdown?.overallAvg ?? 0}/5 · Rated on ${count} shift${count !== 1 ? 's' : ''}` : 'No ratings yet'}
            </div>
          </div>

          {count > 0 && TRAINER_RATING_CRITERIA.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">Breakdown by criterion</h3>
              <div className="space-y-2">
                {TRAINER_RATING_CRITERIA.map((label, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-700">{i + 1}. {label}</span>
                    <span className="text-orange-600">
                      {'★'.repeat(Math.round(criteriaAvgs[i] || 0))}{'☆'.repeat(5 - Math.round(criteriaAvgs[i] || 0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {feedbacks.length > 0 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">
                {anonymousFeedback ? 'Feedback feed' : 'Individual feedback (managers can see notes)'}
              </h3>
              <div className="max-h-[320px] overflow-y-auto space-y-3">
                {feedbacks.map((f, i) => {
                  const rowStars = (f.scores || []).slice(0, 5).map((s) => {
                    const v = parseInt(s, 10)
                    const n = isNaN(v) || v < 1 || v > 5 ? 0 : v
                    return '★'.repeat(n) + '☆'.repeat(5 - n)
                  })
                  const shiftLabel = f.shiftLabel || f.shiftKey || '—'
                  const dateStr = formatWhen(f.at)
                  if (anonymousFeedback) {
                    return (
                      <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                        {f.notes ? (
                          <div className="text-gray-700">&quot;{f.notes}&quot;</div>
                        ) : (
                          <div className="text-gray-500 italic">No written feedback</div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">— {dateStr} ({shiftLabel})</div>
                      </div>
                    )
                  }
                  return (
                    <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                      <div className="font-semibold text-gray-800">{f.traineeName || '—'} · {shiftLabel}</div>
                      <div className="text-xs text-gray-500 mt-1">{dateStr}</div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-orange-600">
                        {TRAINER_RATING_CRITERIA.slice(0, 5).map((_, j) => (
                          <span key={j}>{j + 1}. {rowStars[j] || '—'}</span>
                        ))}
                      </div>
                      {f.notes && (
                        <div className="mt-2 text-gray-600 italic">&quot;{f.notes}&quot;</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {count === 0 && (
            <p className="text-gray-500 text-sm">Trainees rate their trainer after completing a shift. No ratings yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
