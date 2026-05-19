/**
 * SentinelPrioritiesWidget — Shows top Sentinel findings on the Manager Overview.
 * Only renders when there are active findings. Links to the Sentinel view.
 */
import { useState, useEffect } from 'react'
import { subscribeToFindings } from '../services/sentinelService'

function timeAgo(ts) {
  if (!ts) return '—'
  const ms = ts?.toMillis ? ts.toMillis() : new Date(ts).getTime()
  const diff = Date.now() - ms
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const SEV_STYLES = {
  critical: { bar: 'bg-red-500', badge: 'bg-red-100 text-red-700', icon: '🚨' },
  warning:  { bar: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700', icon: '⚠️' },
  info:     { bar: 'bg-blue-400', badge: 'bg-blue-100 text-blue-700', icon: 'ℹ️' },
}

export default function SentinelPrioritiesWidget({ onNavigateSentinel }) {
  const [findings, setFindings] = useState([])

  useEffect(() => {
    return subscribeToFindings(setFindings, 20)
  }, [])

  if (findings.length === 0) return null

  const critical = findings.filter(f => f.severity === 'critical').length
  const warning  = findings.filter(f => f.severity === 'warning').length
  const top      = findings.slice(0, 4)

  return (
    <div className="mb-6 rounded-xl border-2 border-red-200 bg-red-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-red-100 border-b border-red-200">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <span className="font-bold text-red-900 text-sm">Sentinel Priorities</span>
          <div className="flex items-center gap-1.5 ml-1">
            {critical > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">
                {critical} critical
              </span>
            )}
            {warning > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-white">
                {warning} warning
              </span>
            )}
          </div>
        </div>
        {onNavigateSentinel && (
          <button
            type="button"
            onClick={onNavigateSentinel}
            className="text-xs font-semibold text-red-700 hover:text-red-900 underline underline-offset-2"
          >
            View all in Sentinel →
          </button>
        )}
      </div>

      {/* Findings list */}
      <div className="divide-y divide-red-100">
        {top.map(f => {
          const sty = SEV_STYLES[f.severity] || SEV_STYLES.info
          return (
            <div key={f.id} className="flex items-start gap-3 px-4 py-3">
              <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${sty.bar}`} />
              <span className="text-base flex-shrink-0 mt-0.5">{sty.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-snug">{f.title}</p>
                {f.suggestedAction && (
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">→ {f.suggestedAction}</p>
                )}
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                {timeAgo(f.detectedAt)}
              </span>
            </div>
          )
        })}
      </div>

      {findings.length > 4 && (
        <div className="px-4 py-2 border-t border-red-200 bg-red-50">
          <button
            type="button"
            onClick={onNavigateSentinel}
            className="text-xs text-red-700 font-medium hover:text-red-900"
          >
            + {findings.length - 4} more finding{findings.length - 4 !== 1 ? 's' : ''} — view in Sentinel
          </button>
        </div>
      )}
    </div>
  )
}
