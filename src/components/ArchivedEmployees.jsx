export default function ArchivedEmployees({ open, onClose, archivedTrainees = [], archivedStaff = [], onRestoreTrainee, onRestoreStaff }) {
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
                {archivedTrainees.map((t) => (
                  <div key={t.id} className="border border-gray-200 rounded-xl p-3 flex justify-between items-center">
                    <div className="font-medium">{t.name || 'Unnamed'} #{t.employeeNumber || t.id} · {t.store || ''}</div>
                    <button type="button" className="btn btn-small btn-success" onClick={() => onRestoreTrainee?.(t.id)}>
                      Restore
                    </button>
                  </div>
                ))}
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
                    <div className="font-medium">{s.name} #{s.emp} · {s.role} · {s.store}</div>
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
