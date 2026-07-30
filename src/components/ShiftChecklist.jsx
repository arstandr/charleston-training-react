import { useState } from 'react'
import { getShiftChecklistTemplate, TRAINING_MISSION_STATEMENT } from '../data/shiftChecklistTemplates'

/* Renders a SINGLE section of checklist items. Pagination is handled by parent (ShiftDetailView). */
export default function ShiftChecklist({ shiftKey, section, items = {}, canEdit = false, onItemChange, onOpenExercise, isExerciseComplete, openExercise }) {
  const [localValues, setLocalValues] = useState(() => {
    const init = {}
    Object.entries(items).forEach(([id, entry]) => {
      if (entry && typeof entry.value !== 'undefined') init[id] = entry.value
    })
    return init
  })

  if (!section?.items?.length) return null

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

  return (
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
          const exId = item.exerciseId || item.linkedExercise
          const hasExercise = !!exId
          const exerciseDone = hasExercise && isExerciseComplete && isExerciseComplete(exId)
          return (
            <li
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => canEdit && setValue(item.id, !checked)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && canEdit && setValue(item.id, !checked)}
              className={`flex items-center gap-3 min-h-[56px] px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer select-none active:scale-[0.98] ${
                checked
                  ? 'bg-green-100 border-2 border-green-400 shadow-sm'
                  : 'bg-white border-2 border-gray-200 hover:border-gray-300'
              } ${!canEdit ? 'cursor-default' : ''}`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                checked ? 'bg-green-500 text-white' : 'bg-gray-200 text-transparent'
              }`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className={`text-sm flex-1 leading-relaxed ${item.discuss ? 'font-bold text-green-800' : checked ? 'text-green-700' : 'text-gray-700'}`}>
                {item.label}
              </span>
              {hasExercise && onOpenExercise && canEdit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenExercise(exId) }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border-2 flex-shrink-0 ${
                    openExercise === exId ? 'bg-green-600 text-white border-green-600' : exerciseDone ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-green-700 border-green-400 hover:bg-green-50'
                  }`}
                >
                  {exerciseDone ? '✓ Done' : '▼ Exercise'}
                </button>
              )}
            </li>
          )
        }
        const labelClass = `mb-1 block text-sm font-medium ${item.discuss ? 'font-bold text-green-800' : 'text-gray-700'}`
        if (isDropdown) {
          return (
            <li key={item.id} className="px-2 py-1">
              <label className={labelClass}>{item.label}</label>
              <select
                value={value ?? ''}
                onChange={(e) => setValue(item.id, e.target.value)}
                disabled={!canEdit}
                className="w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm min-h-[44px]"
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
            <li key={item.id} className="px-2 py-1">
              <span className={labelClass}>{item.label}</span>
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setValue(item.id, i)}
                    className={`rounded-lg border-2 px-4 py-3 text-base font-bold min-h-[52px] min-w-[52px] ${n >= i ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-gray-800' : 'border-gray-200 bg-white text-gray-500'}`}
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
            <li key={item.id} className="px-2 py-1">
              <label className={labelClass}>{item.label}</label>
              <textarea
                value={value ?? ''}
                onChange={(e) => setValue(item.id, e.target.value)}
                disabled={!canEdit}
                rows={2}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm min-h-[44px]"
              />
            </li>
          )
        }
        if (isText) {
          return (
            <li key={item.id} className="px-2 py-1">
              <label className={labelClass}>{item.label}</label>
              <input
                type="text"
                value={value ?? ''}
                onChange={(e) => setValue(item.id, e.target.value)}
                disabled={!canEdit}
                className="w-full max-w-md rounded border border-gray-300 px-2 py-1.5 text-sm min-h-[44px]"
              />
            </li>
          )
        }
        return (
          <li key={item.id} className="text-sm text-gray-600 px-2 py-1">
            <span className={item.discuss ? 'font-bold text-green-800' : ''}>{item.label}</span>: {String(value ?? '—')}
          </li>
        )
      })}
    </ul>
  )
}

/* Helper: get template sections for building pages externally */
export function getChecklistSections(shiftKey) {
  const template = getShiftChecklistTemplate(shiftKey)
  return template?.sections || []
}

export { TRAINING_MISSION_STATEMENT }
