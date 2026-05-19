/**
 * Manager / Admin / Owner Health tab — system pulse, at-risk trainees, bottleneck, backend.
 */
import { useState, useEffect } from 'react'
import {
  fetchSystemHealth,
  fetchBottleneckAnalysis,
  fetchTrainerEffectiveness,
} from '../services/healthService'

const ORG_ID = 'org_charlestons'

function SystemPulseHeader({ health }) {
  const score = health?.errorsLastHour > 10 ? 40 : health?.lastToastSync && Date.now() - health.lastToastSync > 2 * 60 * 60 * 1000 ? 60 : 85
  const status = score > 80 ? 'green' : score >= 50 ? 'amber' : 'red'
  const label = score > 80 ? 'System Healthy' : score >= 50 ? 'Needs Attention' : 'Action Required'
  return (
    <div className={`rounded-xl border-2 p-6 ${status === 'green' ? 'border-green-200 bg-green-50' : status === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
      <div className="flex items-center gap-4">
        <div className={`w-4 h-4 rounded-full ${status === 'green' ? 'bg-green-500' : status === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`} />
        <div>
          <h2 className="text-xl font-bold text-gray-900">{label}</h2>
          <p className="text-sm text-gray-600">Errors last hour: {health?.errorsLastHour ?? '—'} · Active sessions: {health?.activeSessions ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}

export default function ManagerHealthView({ store, isAdminOrOwner }) {
  const [systemHealth, setSystemHealth] = useState(null)
  const [bottleneck, setBottleneck] = useState(null)
  const [trainers, setTrainers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchSystemHealth(),
      fetchBottleneckAnalysis(ORG_ID),
      fetchTrainerEffectiveness(ORG_ID),
    ])
      .then(([sys, bn, tr]) => {
        if (cancelled) return
        setSystemHealth(sys)
        setBottleneck(bn)
        setTrainers(tr)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Health</h2>

      {loading ? (
        <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />
      ) : (
        <>
          <SystemPulseHeader health={systemHealth} />

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">At-risk trainees</h3>
            <p className="text-gray-500 text-sm">Review readiness scores on trainee detail views.</p>
          </div>

          {bottleneck && (bottleneck.shifts?.length > 0 || bottleneck.questions?.length > 0) && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Bottleneck detection</h3>
              <div className="space-y-2 text-sm">
                {bottleneck.questions?.slice(0, 5).map((q) => (
                  <div key={q.questionId} className="flex justify-between">
                    <span className="text-gray-600">Question {q.questionId?.slice(0, 8)}</span>
                    <span className={q.correctRate < 50 ? 'text-red-600' : 'text-gray-800'}>{Math.round(q.correctRate)}% correct</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isAdminOrOwner && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Backend health</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Errors (24h)</span><span>{systemHealth?.errorsLast24h ?? '—'}</span></div>
                <div className="flex justify-between"><span>Active sessions</span><span>{systemHealth?.activeSessions ?? '—'}</span></div>
                <div className="flex justify-between"><span>Orphaned sessions</span><span>{systemHealth?.orphanedSessions ?? '—'}</span></div>
                <div className="flex justify-between"><span>Last Toast sync</span><span>{systemHealth?.lastToastSync ? new Date(systemHealth.lastToastSync).toLocaleString() : '—'}</span></div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
