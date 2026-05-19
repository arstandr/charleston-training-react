/**
 * SentinelDirectivesWidget — "Your Training Priorities" on Trainee Dashboard.
 * Shows Sentinel-generated directives for this trainee.
 * Only renders when there are active directives.
 */
import { useState, useEffect } from 'react'
import { subscribeToDirectives } from '../services/sentinelService'

const PRIORITY_STYLES = {
  high:   { border: 'border-red-200 bg-red-50',    bar: 'bg-red-400',   label: 'bg-red-100 text-red-700' },
  medium: { border: 'border-amber-200 bg-amber-50', bar: 'bg-amber-400', label: 'bg-amber-100 text-amber-700' },
  low:    { border: 'border-blue-200 bg-blue-50',   bar: 'bg-blue-300',  label: 'bg-blue-100 text-blue-700' },
}

export default function SentinelDirectivesWidget({ traineeId }) {
  const [directives, setDirectives] = useState([])

  useEffect(() => {
    if (!traineeId) return
    return subscribeToDirectives(traineeId, setDirectives)
  }, [traineeId])

  if (!directives.length) return null

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">🧠</span>
        <span className="text-sm font-bold text-gray-800">Your Training Priorities</span>
      </div>
      <div className="divide-y divide-gray-100">
        {directives.map(directive => {
          const sty = PRIORITY_STYLES[directive.priority] || PRIORITY_STYLES.low
          return (
            <div key={directive.id} className="flex items-start gap-3 px-4 py-3">
              <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${sty.bar}`} />
              <span className="text-lg flex-shrink-0">{directive.icon || '📌'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{directive.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{directive.detail}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
