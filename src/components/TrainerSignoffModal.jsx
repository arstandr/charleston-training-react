import { useState, useEffect } from 'react'

const SIGNOFF_CRITERIA = [
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'execution', label: 'Execution' },
  { key: 'confidence', label: 'Confidence' },
]
const MAX_NOTES = 500

export default function TrainerSignoffModal({
  open,
  traineeId,
  traineeName,
  shiftKey,
  shiftLabel,
  canSignOff = true,
  onSave,
  onClose,
}) {
  const [knowledge, setKnowledge] = useState(0)
  const [execution, setExecution] = useState(0)
  const [confidence, setConfidence] = useState(0)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) {
      setKnowledge(0)
      setExecution(0)
      setConfidence(0)
      setNotes('')
    }
  }, [open])

  const handleSubmit = (e) => {
    e.preventDefault()
    const allRated = knowledge >= 1 && execution >= 1 && confidence >= 1
    if (!allRated) return
    onSave({
      knowledge,
      execution,
      confidence,
      notes: (notes && notes.trim()) ? notes.trim().slice(0, MAX_NOTES) : undefined,
    })
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800">Rate &amp; Sign Off</h2>
        <p className="mt-1 text-sm text-gray-600">
          {shiftLabel || shiftKey} · {traineeName || traineeId}
        </p>
        {!canSignOff && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Trainee must pass the required test(s) and complete the checklist before you can sign off.
          </div>
        )}
        {canSignOff && (
        <form onSubmit={handleSubmit} className="mt-6">
          {SIGNOFF_CRITERIA.map(({ key, label }) => {
            const value = key === 'knowledge' ? knowledge : key === 'execution' ? execution : confidence
            const setValue = key === 'knowledge' ? setKnowledge : key === 'execution' ? setExecution : setConfidence
            return (
              <div key={key} className="mb-4">
                <div className="mb-1 text-sm font-medium text-gray-700">{label} (1–5)</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="rounded border-2 border-gray-200 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      style={value >= n ? { borderColor: 'var(--color-primary)', backgroundColor: 'rgba(31,77,28,0.1)' } : {}}
                      onClick={() => setValue(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={4}
              maxLength={MAX_NOTES}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Feedback for the trainee..."
            />
            <div className="mt-0.5 text-right text-xs text-gray-500">
              {notes.length} / {MAX_NOTES}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              disabled={knowledge < 1 || execution < 1 || confidence < 1}
            >
              Save &amp; Sign Off
            </button>
          </div>
        </form>
        )}
        {!canSignOff && (
          <div className="mt-6">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
