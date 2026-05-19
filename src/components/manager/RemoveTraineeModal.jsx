export default function RemoveTraineeModal({ traineeId, traineeName, onArchive, onTerminate, onClose }) {
  if (!traineeId) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="max-w-sm w-full mx-4" style={{
        background: 'rgba(248,250,246,0.97)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        borderRadius: 'var(--radius)',
        border: '1px solid rgba(200,210,195,0.5)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        padding: '24px',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Remove {traineeName}</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>What would you like to do with this trainee?</p>
        <div className="space-y-3">
          <button
            type="button"
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-left hover:border-gray-400 transition-colors"
            onClick={() => onArchive(traineeId)}
          >
            <div className="font-bold text-gray-800">Archive</div>
            <div className="text-xs text-gray-500">Temporarily remove from active list. Can restore later.</div>
          </button>
          <button
            type="button"
            className="w-full rounded-xl border-2 border-red-200 px-4 py-3 text-left hover:border-red-400 bg-red-50 transition-colors"
            onClick={() => onTerminate(traineeId)}
          >
            <div className="font-bold text-red-700">Terminate</div>
            <div className="text-xs text-red-600">Record termination reason and training snapshot.</div>
          </button>
        </div>
        <button type="button" className="btn w-full mt-4" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
