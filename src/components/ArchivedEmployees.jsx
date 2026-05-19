import { getStoreDisplayName, TERMINATION_REASONS } from '../constants'

export default function ArchivedEmployees({ open, onClose, archivedTrainees = [], archivedStaff = [], trainingData = {}, onRestoreTrainee, onRestoreStaff }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold mb-4">Archived Employees</h3>

          <div className="mb-6">
            <div className="font-bold text-gray-700 mb-2">Archived Trainees</div>
            {archivedTrainees.length === 0 ? (
              <p className="text-gray-500 text-sm">No archived trainees.</p>
            ) : (
              <div className="space-y-2">
                {archivedTrainees.map((t) => {
                  const rec = trainingData[t.id]
                  const isTerminated = rec?.terminated
                  const reasonObj = isTerminated ? TERMINATION_REASONS.find((r) => r.key === rec.terminationReason) : null
                  const snap = rec?.terminationSnapshot
                  return (
                    <div key={t.id} className={`border rounded-xl p-3 ${isTerminated ? 'border-red-200 bg-red-50/50' : 'border-gray-200'}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{t.name || 'Unnamed'} #{t.employeeNumber || t.id} · {t.store ? getStoreDisplayName(t.store) : ''}</div>
                          {isTerminated ? (
                            <div className="mt-1">
                              <span className="inline-block rounded-full bg-red-600 text-white px-2 py-0.5 text-xs font-bold">TERMINATED</span>
                              {reasonObj && <span className="ml-2 text-xs text-red-700">{reasonObj.label}</span>}
                              {rec.terminatedAt && (
                                <span className="ml-2 text-xs text-gray-500">{new Date(rec.terminatedAt).toLocaleDateString()}</span>
                              )}
                              {rec.terminationNote && (
                                <div className="text-xs text-gray-600 mt-1 italic">"{rec.terminationNote}"</div>
                              )}
                              {snap && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {snap.certDone != null && <span>Progress: {snap.certDone}/{snap.certTotal} ({snap.certProgress}%)</span>}
                                  {snap.daysInTraining > 0 && <span className="ml-2">· {snap.daysInTraining}d</span>}
                                  {snap.readinessAvg != null && <span className="ml-2">· Readiness: {snap.readinessAvg}/5</span>}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="mt-1">
                              <span className="inline-block rounded-full bg-gray-400 text-white px-2 py-0.5 text-xs font-bold">ARCHIVED</span>
                            </div>
                          )}
                        </div>
                        <button type="button" className="btn btn-small btn-success flex-shrink-0" onClick={() => onRestoreTrainee?.(t.id)}>
                          Restore
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <div className="font-bold text-gray-700 mb-2">Archived Staff</div>
            {archivedStaff.length === 0 ? (
              <p className="text-gray-500 text-sm">No archived staff.</p>
            ) : (
              <div className="space-y-2">
                {archivedStaff.map((s) => (
                  <div key={s.emp} className="border border-gray-200 rounded-xl p-3 flex justify-between items-center">
                    <div className="font-medium">{s.name} #{s.emp} · {s.role} · {s.store ? getStoreDisplayName(s.store) : ''}</div>
                    <button type="button" className="btn btn-small btn-success" onClick={() => onRestoreStaff?.(s.emp)}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6">
            <button type="button" className="btn w-full" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
