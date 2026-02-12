import { useState } from 'react'
import { SHIFT_TYPES } from '../constants'

export default function ScheduleEditor({ traineeId, schedule = {}, trainers = [], managers = [], onSave }) {
  const [localSchedule, setLocalSchedule] = useState(() => {
    const s = {}
    SHIFT_TYPES.forEach((shift) => {
      s[shift.key] = schedule[shift.key] || { when: '', trainer: '' }
    })
    return s
  })

  function setShift(key, field, value) {
    setLocalSchedule((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value },
    }))
  }

  function autoFillDates(startDateStr) {
    if (!startDateStr) return
    const start = new Date(startDateStr)
    let dayOffset = 0
    SHIFT_TYPES.forEach((shift) => {
      const next = new Date(start)
      next.setDate(start.getDate() + dayOffset)
      const iso = next.toISOString().slice(0, 16)
      setLocalSchedule((prev) => {
        const current = prev[shift.key]
        if (current?.when) return prev
        return { ...prev, [shift.key]: { ...current, when: iso } }
      })
      dayOffset++
    })
  }

  function handleSave() {
    onSave?.(traineeId, localSchedule)
  }

  const trainerOptions = trainers.map((t) => (
    <option key={t.empNum} value={t.empNum}>{t.name || t.empNum}</option>
  ))
  const managerOptions = managers.map((m) => (
    <option key={m.empNum} value={m.empNum}>{m.name || m.empNum}</option>
  ))

  return (
    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
      <div className="flex justify-between items-center mb-4">
        <div className="font-bold text-gray-700">SHIFT PLAN</div>
        <button type="button" className="btn btn-small" onClick={() => document.getElementById('sch_follow_when')?.focus()}>
          Set Start Date to Auto-Fill
        </button>
      </div>
      <div className="grid gap-3">
        {SHIFT_TYPES.map((s, idx) => {
          const isCert = s.key === 'cert'
          const isFoodRun = s.key === 'foodrun'
          const item = localSchedule[s.key] || {}
          const icon = isCert ? '🎓' : isFoodRun ? '🍳' : `${idx + 1}`
          const hasDate = !!item.when
          return (
            <div
              key={s.key}
              className={`bg-white border rounded-lg p-3 flex gap-4 items-center ${hasDate ? 'border-l-4 border-l-green-600' : 'border-gray-200'}`}
            >
              <div className="text-2xl w-8 text-center">{icon}</div>
              <div className="flex-1">
                <div className="font-bold text-gray-800">{s.label}</div>
                <div className="text-xs text-gray-500">{s.required === false ? 'Optional' : 'Required Session'}</div>
              </div>
              <div className="w-40">
                <input
                  id={s.key === 'follow' ? 'sch_follow_when' : undefined}
                  type="datetime-local"
                  className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                  value={(item.when || '').slice(0, 16)}
                  onChange={(e) => {
                    const v = e.target.value
                    setShift(s.key, 'when', v)
                    if (idx === 0 && v) autoFillDates(v)
                  }}
                />
              </div>
              {isFoodRun ? (
                <div className="w-40 py-2 text-center text-gray-500 text-sm bg-gray-100 rounded">No Trainer Needed</div>
              ) : (
                <div className="w-40">
                  <select
                    className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                    value={item.trainer || ''}
                    onChange={(e) => setShift(s.key, 'trainer', e.target.value)}
                  >
                    <option value="">— Select Trainer —</option>
                    {isCert ? managerOptions : trainerOptions}
                  </select>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-4 text-right">
        <button type="button" className="btn bg-[#1F4D1C] text-white px-6 py-3 rounded-lg" onClick={handleSave}>
          Save Schedule
        </button>
      </div>
    </div>
  )
}
