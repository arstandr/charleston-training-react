import { useState } from 'react'
import { getChecklistTemplate } from '../data/checklistTemplates'

export default function ShiftChecklist({ shiftKey, items = {}, canEdit = false, onItemChange }) {
  const template = getChecklistTemplate(shiftKey)
  const [localValues, setLocalValues] = useState({})
  const [openSections, setOpenSections] = useState(() => (template?.sections || []).reduce((acc, s) => ({ ...acc, [s.id]: true }), {}))

  if (!template?.sections?.length) return null

  function getValue(itemId) {
    if (localValues[itemId] !== undefined) return localValues[itemId]
    const entry = items[itemId]
    if (entry && typeof entry.value !== 'undefined') return entry.value
    return ''
  }

  function setValue(itemId, value) {
    setLocalValues((prev) => ({ ...prev, [itemId]: value }))
    onItemChange?.(itemId, value)
  }

  function toggleSection(sectionId) {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }

  return (
    <div className="shift-checklist space-y-3">
      {template.sections.map((section) => {
        const isOpen = openSections[section.id] !== false
        return (
          <section key={section.id} className="rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-gray-800 hover:bg-gray-100/80"
              onClick={() => toggleSection(section.id)}
              aria-expanded={isOpen}
            >
              <span>{section.title}</span>
              <span className="text-gray-400">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="border-t border-gray-200 px-4 pb-4 pt-1">
                {section.help && <p className="mb-3 text-xs text-gray-500">{section.help}</p>}
                <ul className="space-y-2">
            {section.items.map((item) => {
              const value = getValue(item.id)
              const isCheckbox = item.type === 'checkbox'
              const isDropdown = item.type === 'dropdown'
              const isRating = item.type === 'rating'
              const isTextarea = item.type === 'textarea'
              const isText = item.type === 'text'

              if (isCheckbox) {
                const checked = value === true || value === 'true' || value === 1
                return (
                  <li key={item.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!checked}
                      onChange={(e) => setValue(item.id, e.target.checked)}
                      disabled={!canEdit}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className={`text-sm ${item.discuss ? 'font-bold text-green-800' : 'text-gray-700'}`}>
                      {item.label}
                    </span>
                  </li>
                )
              }
              const labelClass = `mb-1 block text-sm font-medium ${item.discuss ? 'font-bold text-green-800' : 'text-gray-700'}`
              if (isDropdown) {
                return (
                  <li key={item.id}>
                    <label className={labelClass}>{item.label}</label>
                    <select
                      value={value ?? ''}
                      onChange={(e) => setValue(item.id, e.target.value)}
                      disabled={!canEdit}
                      className="w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {(item.options || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </li>
                )
              }
              if (isRating) {
                const n = Math.min(3, Math.max(0, parseInt(value, 10) || 0))
                return (
                  <li key={item.id}>
                    <span className={labelClass}>{item.label}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3].map((i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setValue(item.id, i)}
                          className={`rounded border-2 px-2 py-1 text-sm ${n >= i ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-gray-800' : 'border-gray-200 bg-white text-gray-500'}`}
                        >
                          {i}
                        </button>
                      ))}
                    </div>
                  </li>
                )
              }
              if (isTextarea) {
                return (
                  <li key={item.id}>
                    <label className={labelClass}>{item.label}</label>
                    <textarea
                      value={value ?? ''}
                      onChange={(e) => setValue(item.id, e.target.value)}
                      disabled={!canEdit}
                      rows={2}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </li>
                )
              }
              if (isText) {
                return (
                  <li key={item.id}>
                    <label className={labelClass}>{item.label}</label>
                    <input
                      type="text"
                      value={value ?? ''}
                      onChange={(e) => setValue(item.id, e.target.value)}
                      disabled={!canEdit}
                      className="w-full max-w-md rounded border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </li>
                )
              }
              return (
                <li key={item.id} className="text-sm text-gray-600">
                  <span className={item.discuss ? 'font-bold text-green-800' : ''}>{item.label}</span>: {String(value ?? '—')}
                </li>
              )
            })}
                </ul>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
