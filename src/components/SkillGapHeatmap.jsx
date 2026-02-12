/**
 * Heatmap of which shift/area has the most incomplete trainees (skill gap).
 */
import { REQUIRED_SHIFT_KEYS, SHIFT_META } from '../constants'
import { isShiftComplete } from '../utils/helpers'

export default function SkillGapHeatmap({ trainees }) {
  const byShift = {}
  REQUIRED_SHIFT_KEYS.forEach((key) => {
    byShift[key] = { complete: 0, incomplete: 0 }
  })
  trainees.forEach((t) => {
    REQUIRED_SHIFT_KEYS.forEach((key) => {
      if (isShiftComplete(t, key)) byShift[key].complete++
      else byShift[key].incomplete++
    })
  })

  const maxIncomplete = Math.max(...Object.values(byShift).map((x) => x.incomplete), 1)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 font-bold text-gray-800">Skill gap (incomplete by area)</h3>
      <div className="space-y-2">
        {REQUIRED_SHIFT_KEYS.map((key) => {
          const meta = SHIFT_META[key] || {}
          const { complete, incomplete } = byShift[key] || { complete: 0, incomplete: 0 }
          const total = complete + incomplete
          const intensity = maxIncomplete ? incomplete / maxIncomplete : 0
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-sm text-gray-700">
                {meta.icon} {meta.label || key}
              </span>
              <div className="h-6 flex-1 rounded bg-gray-100 overflow-hidden flex">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${intensity * 100}%` }}
                />
              </div>
              <span className="w-16 text-right text-xs text-gray-500">
                {incomplete}/{total} incomplete
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
