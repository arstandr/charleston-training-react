import { useState } from 'react'

export default function MenuItemCard({ item, onEdit, onGraveyard, onRestore, inGraveyard, isGhost }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name || '')
  const [description, setDescription] = useState(item.description || '')
  const [category, setCategory] = useState(item.category || 'General')

  function handleSave() {
    onEdit(item.id, { name, description, category })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
        />
        <textarea
          className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          rows={2}
        />
        <input
          className="mb-3 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
        />
        <div className="flex gap-2">
          <button type="button" className="btn btn-small" onClick={handleSave}>
            Save
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  const borderClass = isGhost ? 'border-red-400 bg-red-50/50' : inGraveyard ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${borderClass}`}>
      <div className="flex justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-gray-800">{item.name || 'Untitled'}</h4>
          {isGhost && (
            <span className="mt-1 inline-block rounded bg-red-200 px-2 py-0.5 text-xs font-medium text-red-900">
              Returned to menu
            </span>
          )}
          {item.description && <p className="mt-1 text-sm text-gray-600">{item.description}</p>}
          {item.category && (
            <span className="mt-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {item.category}
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {inGraveyard ? (
            <button type="button" className="btn btn-small btn-secondary" onClick={() => onRestore(item.id)}>
              Restore
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-small btn-secondary" onClick={() => { setName(item.name); setDescription(item.description); setCategory(item.category); setEditing(true) }}>
                Edit
              </button>
              <button type="button" className="btn btn-small btn-danger" onClick={() => onGraveyard(item.id)}>
                Graveyard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
