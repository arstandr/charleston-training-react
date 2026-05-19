/**
 * Trainer Health tab — live trainee board, my performance, alerts.
 */
import { useState, useEffect } from 'react'
import { subscribeTrainerCohort } from '../services/healthService'
import { subscribeNotifications } from '../services/notificationService'
import { formatWhenHuman } from '../utils/helpers'
import { SHIFT_META, REQUIRED_SHIFT_KEYS } from '../constants'

const FIVE_MIN_MS = 5 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function TraineeLiveBoard({ trainees, staffAccounts }) {
  const [expandedTraineeId, setExpandedTraineeId] = useState(null)
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Live trainee board
      </h3>
      {!trainees || trainees.length === 0 ? (
        <p className="text-gray-500">No trainees assigned to you.</p>
      ) : (
        <>
          {(() => {
            const atRisk = trainees.filter((t) => {
              const hb = t.activeSession?.lastHeartbeat ?? 0
              const now = Date.now()
              const noStudy = !hb || now - hb > 24 * 60 * 60 * 1000
              const sched = t.trainingData?.schedule || {}
              const next = Object.values(sched).filter((s) => s?.when).sort((a,b) => (a.when||'').localeCompare(b.when||''))[0]
              const days = next ? Math.ceil((new Date(next.when).getTime() - now) / (24*60*60*1000)) : null
              return noStudy && days != null && days <= 3
            }).length
            return (
              <div className="flex gap-4 mb-3 text-xs text-gray-500">
                <span>{trainees.length} trainee{trainees.length !== 1 ? 's' : ''}</span>
                {atRisk > 0 && <span className="text-amber-600 font-medium">{atRisk} need attention</span>}
              </div>
            )
          })()}
        <div className="space-y-3">
          {trainees.map((t) => {
            const data = t
            const rec = data.trainingData
            const session = data.activeSession
            const hb = session?.lastHeartbeat ?? 0
            const now = Date.now()
            const lastActive = typeof hb === 'number' ? hb : 0
            const minsAgo = lastActive ? Math.floor((now - lastActive) / 60000) : null
            const hoursAgo = minsAgo != null ? Math.floor(minsAgo / 60) : null
            const daysAgo = hoursAgo != null ? Math.floor(hoursAgo / 24) : null
            let activityStr = 'No recent activity'
            if (lastActive && now - lastActive < FIVE_MIN_MS) activityStr = 'Active now'
            else if (hoursAgo != null && hoursAgo < 24) activityStr = `${hoursAgo}h ago`
            else if (daysAgo != null) activityStr = daysAgo >= 1 ? `No activity in ${daysAgo}d` : activityStr

            const schedule = rec?.schedule || {}
            const nextShift = Object.entries(schedule)
              .filter(([, v]) => v?.when)
              .sort((a, b) => (a[1].when || '').localeCompare(b[1].when || ''))[0]
            const daysToTest = nextShift
              ? Math.ceil((new Date(nextShift[1].when).getTime() - now) / DAY_MS)
              : null

            const noStudy24h = !lastActive || now - lastActive > DAY_MS
            const testSoon = daysToTest != null && daysToTest <= 3
            const riskAmber = noStudy24h && testSoon
            const riskRed = false // Would need readiness score

            return (
              <div
                key={t.traineeId}
                className={`rounded-lg border p-4 hover:bg-gray-50 cursor-pointer ${riskRed ? 'border-red-300 bg-red-50/30' : riskAmber ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'}`}
                onClick={() => setExpandedTraineeId(prev => prev === t.traineeId ? null : t.traineeId)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-800">{rec?.name || t.traineeId}</div>
                    <div className="text-sm text-gray-500">
                      {nextShift ? `${SHIFT_META[nextShift[0]]?.label || nextShift[0]} · ${formatWhenHuman(nextShift[1].when)}` : '—'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {activityStr}
                      {daysToTest != null && testSoon && ` · Test in ${daysToTest}d`}
                    </div>
                    {(() => {
                      const sched = rec?.schedule || {}
                      const shifts = REQUIRED_SHIFT_KEYS.map(k => sched[k]).filter(Boolean)
                      const signed = shifts.filter((s) => s.trainerSigned).length
                      const total = REQUIRED_SHIFT_KEYS.length
                      const pct = total > 0 ? Math.round((signed / total) * 100) : 0
                      const color = pct >= 75 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'
                      return total > 0 ? (
                        <div className={`text-xs font-medium mt-1 ${color}`}>
                          {pct}% shifts signed off ({signed}/{total})
                        </div>
                      ) : null
                    })()}
                    {(riskAmber || riskRed) && (
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${riskRed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {riskRed ? '⚠️ At risk' : '📉 Low activity'}
                      </span>
                    )}
                  </div>
                </div>
                {expandedTraineeId === t.traineeId && (
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-sm text-gray-600">
                    <div><span className="font-medium">Last active:</span> {activityStr}</div>
                    <div><span className="font-medium">Next shift:</span> {nextShift ? `${SHIFT_META[nextShift[0]]?.label || nextShift[0]} · ${formatWhenHuman(nextShift[1].when)}` : 'None scheduled'}</div>
                    <div><span className="font-medium">Days to test:</span> {daysToTest != null ? daysToTest : '—'}</div>
                    <div><span className="font-medium">Risk:</span> {riskRed ? '⚠️ At risk' : riskAmber ? '📉 Low activity' : '✅ On track'}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}
    </div>
  )
}

function MyTrainerPerformance({ empNum, trainingData, store }) {
  const [avgReadiness, setAvgReadiness] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!empNum || !trainingData) { setLoading(false); return }
    const trainees = Object.entries(trainingData).filter(
      ([_, rec]) => rec && !rec.archived && rec.schedule &&
      Object.values(rec.schedule).some((s) => String(s.trainer) === String(empNum))
    )
    if (trainees.length === 0) { setAvgReadiness(null); setLoading(false); return }
    const scores = trainees.map(([_, rec]) => {
      const sched = rec.schedule || {}
      const shifts = REQUIRED_SHIFT_KEYS.map(k => sched[k]).filter(Boolean)
      const signed = shifts.filter((s) => s.trainerSigned).length
      const total = REQUIRED_SHIFT_KEYS.length
      return total > 0 ? Math.round((signed / total) * 100) : 0
    })
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    setAvgReadiness(avg)
    setLoading(false)
  }, [empNum, trainingData])

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">My performance</h3>
      {loading ? (
        <div className="animate-pulse h-16 bg-gray-100 rounded" />
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-800">{avgReadiness ?? '—'}</span>
            <span className="text-gray-500">% shifts signed off</span>
          </div>
        </div>
      )}
    </div>
  )
}

function TrainerAlerts({ trainerUid }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!trainerUid) return
    setLoading(false)
    return subscribeNotifications(trainerUid, setAlerts)
  }, [trainerUid])

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Alerts
      </h3>
      {loading ? (
        <div className="animate-pulse h-12 bg-gray-100 rounded" />
      ) : alerts.length === 0 ? (
        <p className="text-gray-500">No alerts.</p>
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, 5).map((a) => (
            <div key={a.id} className="rounded border border-amber-200 bg-amber-50 p-2 text-sm">
              {a.message || a.type || 'Alert'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TrainerHealthView({ trainerUid, empNum, trainingData, store, staffAccounts }) {
  const [cohort, setCohort] = useState([])

  useEffect(() => {
    if ((!empNum && !trainerUid) || !trainingData) return
    return subscribeTrainerCohort(empNum || trainerUid, trainingData, (list) => {
      const withRecs = list.map((t) => ({
        ...t,
        trainingData: trainingData?.[t.traineeId] || null,
      }))
      setCohort(withRecs)
    })
  }, [empNum, trainerUid, trainingData])

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Health</h2>
      <div className="grid gap-6 md:grid-cols-1">
        <TraineeLiveBoard
          trainees={cohort}
          staffAccounts={staffAccounts || {}}
        />
        <MyTrainerPerformance empNum={empNum} trainingData={trainingData} store={store} />
        <TrainerAlerts trainerUid={trainerUid} />
      </div>
    </div>
  )
}
