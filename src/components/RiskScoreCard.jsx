/**
 * Displays a trainee risk score based on certification progress and recency of activity.
 */
import { useState } from 'react'
import { getCertificationProgress } from '../utils/helpers'

function getLastActivityDate(rec) {
  let latest = null
  const schedule = rec?.schedule || {}
  for (const item of Object.values(schedule)) {
    const d = item.managerSignedAt || item.trainerSignedAt || item.when
    if (d) {
      const t = new Date(d).getTime()
      if (!latest || t > latest) latest = t
    }
  }
  return latest ? new Date(latest) : null
}

/** Simple risk score 0-100 (higher = more risk). Based on low progress and stale activity. */
export function computeRiskScore(rec) {
  const prog = getCertificationProgress(rec)
  const last = getLastActivityDate(rec)
  const now = Date.now()
  const daysSinceActivity = last ? (now - last.getTime()) / (24 * 60 * 60 * 1000) : 999
  let score = 0
  if (prog.pct < 25) score += 40
  else if (prog.pct < 50) score += 25
  else if (prog.pct < 75) score += 10
  if (daysSinceActivity > 30) score += 35
  else if (daysSinceActivity > 14) score += 20
  else if (daysSinceActivity > 7) score += 10
  return Math.min(100, score)
}

/** Return breakdown reasons for risk score (for details panel). */
function getRiskBreakdown(rec) {
  const prog = getCertificationProgress(rec)
  const last = getLastActivityDate(rec)
  const now = Date.now()
  const daysSinceActivity = last ? (now - last.getTime()) / (24 * 60 * 60 * 1000) : 999
  const lines = []
  if (prog.pct < 25) lines.push({ text: `Low progress (${prog.pct}%, ${prog.done}/${prog.total} shifts)`, add: 40 })
  else if (prog.pct < 50) lines.push({ text: `Moderate progress (${prog.pct}%)`, add: 25 })
  else if (prog.pct < 75) lines.push({ text: `Progress ${prog.pct}%`, add: 10 })
  if (daysSinceActivity > 30) lines.push({ text: 'No activity in 30+ days', add: 35 })
  else if (daysSinceActivity > 14) lines.push({ text: 'No activity in 14+ days', add: 20 })
  else if (daysSinceActivity > 7) lines.push({ text: 'No activity in 7+ days', add: 10 })
  if (lines.length === 0) lines.push({ text: 'On track', add: 0 })
  return lines
}

/** Human-readable risk narrative (e.g. for tooltips or detail view). */
export function getRiskNarrative(rec) {
  const score = computeRiskScore(rec)
  if (score < 20) return "Doing great — on schedule with recent activity."
  const breakdown = getRiskBreakdown(rec)
  const reasons = breakdown.filter((b) => b.add > 0).map((b) => b.text.toLowerCase())
  if (reasons.length === 0) return "On track."
  return `High risk: ${reasons.join('; ')}.`
}

export default function RiskScoreCard({ trainee, store }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const score = computeRiskScore(trainee)
  const prog = getCertificationProgress(trainee)
  const last = getLastActivityDate(trainee)
  const level = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low'
  const color = level === 'high' ? 'text-red-600' : level === 'medium' ? 'text-amber-600' : 'text-green-600'
  const breakdown = getRiskBreakdown(trainee)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-800">{trainee.name || `#${trainee.employeeNumber || trainee.id}`}</div>
          <div className="text-xs text-gray-500">{store || trainee.store || '—'}</div>
        </div>
        <div className={`text-2xl font-bold ${color}`}>{score}</div>
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span>Progress: {prog.done}/{prog.total}</span>
        <span>{last ? `Last activity: ${last.toLocaleDateString()}` : 'No activity'}</span>
      </div>
      {score >= 25 && (
        <p className="mt-2 text-xs text-gray-600 italic" title="Risk summary">
          {getRiskNarrative(trainee)}
        </p>
      )}
      <div className="mt-2 border-t border-gray-100 pt-2">
        <button
          type="button"
          className="text-xs text-gray-500 hover:text-gray-700"
          onClick={() => setDetailsOpen((o) => !o)}
        >
          {detailsOpen ? '[-] Details' : '[+] Details'}
        </button>
        {detailsOpen && (
          <div className="mt-2 text-xs text-gray-600 space-y-1">
            {breakdown.map((line, i) => (
              <div key={i}>{line.text}{line.add > 0 ? ` (+${line.add})` : ''}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
