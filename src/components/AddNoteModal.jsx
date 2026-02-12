import { useState, useEffect } from 'react'

export default function AddNoteModal({ open, trainee, onSave, onClose }) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (open) setText('')
  }, [open])

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = (text || '').trim()
    if (!trimmed) return
    onSave(trainee?.id, trimmed)
    onClose()
  }

  if (!open || !trainee) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800">Add note</h2>
        <p className="mt-1 text-sm text-gray-500">{trainee.name || `#${trainee.employeeNumber || trainee.id}`}</p>
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="mb-4">
            <label htmlFor="addNoteText" className="mb-1 block text-sm font-medium text-gray-700">
              Note
            </label>
            <textarea
              id="addNoteText"
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Follow up on bar test next week"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={!(text || '').trim()}>
              Save note
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
