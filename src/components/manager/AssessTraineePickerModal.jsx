import { formatWhenHuman } from '../../utils/helpers'

export default function AssessTraineePickerModal({ assessTraineeId, traineeName, rows, onSelectRow, onClose }) {
  if (!assessTraineeId) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="max-w-md w-full" style={{
        background: 'rgba(248,250,246,0.97)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        borderRadius: 'var(--radius)',
        border: '1px solid rgba(200,210,195,0.5)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        padding: '16px',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Assess · {traineeName}</h3>
        {rows.length === 0 ? (
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>No shifts awaiting your sign-off.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {rows.map((row) => (
              <li key={`${row.traineeId}-${row.shiftKey}`}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-2"
                  onClick={() => onSelectRow(row)}
                >
                  <span>{row.shiftLabel || row.shiftKey}</span>
                  {row.when && <span className="text-xs text-gray-500">{formatWhenHuman(row.when)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-small btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
