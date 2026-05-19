import { useState, useEffect } from 'react'
import { getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import ScheduleEditor from '../ScheduleEditor'
import { REQUIRED_SHIFT_KEYS, SHIFT_META } from '../../constants'
import { formatWhenHuman } from '../../utils/helpers'
import { getToastShifts } from '../../services/toast'

function getTimeAgo(date) {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function ManagerScheduleView({
  store, isAdminOrOwner, getRestaurantGuid,
  trainees, trainingData, trainers, managers,
  scheduleGridByTrainee, scheduleTraineeId,
  toastShiftsLoading, toastShiftsResult,
  onSetToastShiftsLoading, onSetToastShiftsResult,
  onSetScheduleTraineeId, onSetViewTraineeDetailId,
  onSaveSchedule,
}) {
  const scheduleShiftColumns = REQUIRED_SHIFT_KEYS.filter((k) => SHIFT_META && k in SHIFT_META)
  const [hsSyncing, setHsSyncing] = useState(false)
  const [hsProgress, setHsProgress] = useState(0)
  const [hsResult, setHsResult] = useState(null)
  const [hsLastRun, setHsLastRun] = useState(null)

  // Load latest HotSchedules scrape timestamp
  useEffect(() => {
    async function loadHsLog() {
      try {
        const db = getFirestore()
        const q = query(collection(db, 'hotSchedulesScrapeLog'), orderBy('scrapedAt', 'desc'), limit(1))
        const snap = await getDocs(q)
        if (!snap.empty) {
          setHsLastRun(snap.docs[0].data())
        }
      } catch (e) {
        console.warn('Failed to load HS scrape log:', e)
      }
    }
    loadHsLog()
  }, [])

  async function handleHsSync() {
    if (hsSyncing) return
    setHsSyncing(true)
    setHsResult(null)
    setHsProgress(10)

    const progressInterval = setInterval(() => {
      setHsProgress(prev => prev >= 85 ? prev : prev + Math.random() * 8)
    }, 3000)

    try {
      const { onSnapshot } = await import('firebase/firestore')
      const db = getFirestore()

      // Fire and forget — only scrape this manager's store
      fetch(`https://scrapehotschedules-qibven2evq-uc.a.run.app?store=${encodeURIComponent(store)}`, {
        method: 'POST',
        mode: 'cors',
      }).catch(() => {})

      // Watch the latest scrape log for completion
      const q = query(collection(db, 'hotSchedulesScrapeLog'), orderBy('scrapedAt', 'desc'), limit(1))

      await new Promise((resolve, reject) => {
        const tid = setTimeout(() => { unsub(); reject(new Error('Timed out after 10 minutes')) }, 600000)
        const unsub = onSnapshot(q, (snap) => {
          if (snap.empty) return
          const data = snap.docs[0].data()
          if (data.status === 'completed') {
            clearTimeout(tid)
            unsub()
            clearInterval(progressInterval)
            setHsProgress(100)
            const storeResult = data.results?.find(r => r.store === store)
            if (storeResult && storeResult.errors?.length === 0) {
              setHsResult({
                success: true,
                message: `Synced ${storeResult.employeesFound} employees — ${storeResult.trainersMatched}/${storeResult.trainersTotal} trainers, ${storeResult.traineesMatched}/${storeResult.traineesTotal} trainees matched`,
                storeResult,
              })
              setHsLastRun({ scrapedAt: data.scrapedAt, results: data.results })
            } else if (storeResult) {
              setHsResult({ success: false, message: storeResult.errors?.join(', ') || 'Unknown error' })
            } else {
              setHsResult({ success: true, message: 'Scrape completed — reload to see updated schedules' })
            }
            resolve()
          } else if (data.status === 'failed') {
            clearTimeout(tid)
            unsub()
            clearInterval(progressInterval)
            setHsResult({ success: false, message: data.error || 'Scrape failed' })
            resolve()
          }
        }, (err) => { clearTimeout(tid); reject(err) })
      })
    } catch (e) {
      clearInterval(progressInterval)
      setHsResult({ success: false, message: e.message || 'Sync failed' })
    } finally {
      setHsSyncing(false)
      setTimeout(() => setHsProgress(0), 2000)
    }
  }

  // Get last HS run info for current store
  const hsStoreResult = hsLastRun?.results?.find(r => r.store === store)
  const hsOk = hsStoreResult && hsStoreResult.errors?.length === 0
  const hsLastTime = hsLastRun?.scrapedAt ? new Date(hsLastRun.scrapedAt) : null

  return (
    <div>
      {/* HotSchedules status banner */}
      <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${hsOk ? 'border-green-200 bg-green-50' : hsLastTime ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${hsOk ? 'bg-green-500' : hsLastTime ? 'bg-amber-500' : 'bg-gray-400'}`} />
          <span className="font-medium text-gray-700">HotSchedules — {store}</span>
          {hsLastTime ? (
            <span className="text-gray-500">
              Last synced {getTimeAgo(hsLastTime)}
            </span>
          ) : (
            <span className="text-gray-400">Never synced</span>
          )}
        </div>
        {hsOk && (
          <div className="mt-1 ml-4 text-xs text-gray-500">
            {hsStoreResult.employeesFound} employees found — {hsStoreResult.trainersMatched}/{hsStoreResult.trainersTotal} trainers, {hsStoreResult.traineesMatched || 0}/{hsStoreResult.traineesTotal || 0} trainees matched
            {hsStoreResult.unmatchedNames?.length > 0 && (
              <span className="text-amber-600"> — {hsStoreResult.unmatchedNames.length} unmatched</span>
            )}
          </div>
        )}
        {!hsOk && hsStoreResult?.errors?.length > 0 && (
          <div className="mt-1 ml-4 text-xs text-red-600">{hsStoreResult.errors[0]}</div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* HotSchedules sync button — scrapes only this store */}
        <button
          type="button"
          className="btn btn-small btn-secondary"
          disabled={hsSyncing}
          onClick={handleHsSync}
        >
          {hsSyncing ? `Syncing ${store}…` : `Sync ${store} from HotSchedules`}
        </button>

        {isAdminOrOwner && (
          <button
            type="button"
            className="btn btn-small btn-secondary"
            disabled={toastShiftsLoading}
            onClick={async () => {
              const restaurantGuid = getRestaurantGuid(store)
              if (!restaurantGuid) {
                onSetToastShiftsResult({ error: `No Toast GUID for ${store}.` })
                return
              }
              onSetToastShiftsLoading(true)
              onSetToastShiftsResult(null)
              try {
                const end = new Date()
                end.setDate(end.getDate() + 14)
                const startDate = new Date().toISOString().slice(0, 10)
                const endDate = end.toISOString().slice(0, 10)
                const res = await getToastShifts(restaurantGuid, startDate, endDate)
                const data = res.data ?? res.shifts ?? res
                const list = Array.isArray(data) ? data : (data?.body ? data.body : [])
                onSetToastShiftsResult({ count: list.length, startDate, endDate, shifts: list })
              } catch (e) {
                onSetToastShiftsResult({ error: e.message || 'Failed to fetch shifts' })
              } finally {
                onSetToastShiftsLoading(false)
              }
            }}
          >
            {toastShiftsLoading ? 'Loading…' : 'Sync schedules from Toast'}
          </button>
        )}

        {/* HotSchedules progress bar */}
        {hsSyncing && (
          <div className="flex-1 min-w-[200px]">
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${Math.round(hsProgress)}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Syncing {store} schedules… This takes about 1–2 minutes
            </div>
          </div>
        )}

        {/* HotSchedules result message */}
        {hsResult && !hsSyncing && (
          <div className={`text-sm ${hsResult.success ? 'text-green-700' : 'text-red-600'}`}>
            {hsResult.message}
          </div>
        )}

        {toastShiftsResult && (
          <span className="text-sm text-gray-600" role="status" aria-live="polite">
            {toastShiftsResult.error
              ? toastShiftsResult.error
              : `Retrieved ${toastShiftsResult.count} shifts (${toastShiftsResult.startDate} – ${toastShiftsResult.endDate}). Use the schedule editor below to assign trainees.`}
          </span>
        )}
      </div>

      {scheduleGridByTrainee.length > 0 && (
        <section className="mb-8 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <h3 className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-bold uppercase tracking-wide text-gray-600">
            Schedule grid
          </h3>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="p-2 font-semibold text-gray-700">Trainee</th>
                {scheduleShiftColumns.map((key) => (
                  <th key={key} className="p-2 font-semibold text-gray-700">
                    {SHIFT_META[key]?.label || key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scheduleGridByTrainee.map((row) => (
                <tr
                  key={row.traineeId}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="p-2">
                    <button
                      type="button"
                      className="font-medium text-gray-800 hover:underline"
                      onClick={() => onSetViewTraineeDetailId(row.traineeId)}
                    >
                      {row.traineeName}
                    </button>
                    <span className="ml-1 text-gray-500">#{row.traineeEmp}</span>
                  </td>
                  {scheduleShiftColumns.map((key) => {
                    const cell = row.cells[key]
                    if (!cell) {
                      return (
                        <td key={key} className="p-2 text-gray-400">—</td>
                      )
                    }
                    const flags = []
                    if (cell.missingTrainer) flags.push('No trainer')
                    if (cell.pendingApproval) flags.push('Pending')
                    if (cell.unsigned) flags.push('Unsigned')
                    const flagDot = flags.length ? (
                      <span className="text-red-600" title={flags.join(', ')}>●</span>
                    ) : (
                      <span className="text-green-600">●</span>
                    )
                    return (
                      <td key={key} className="p-2">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => onSetViewTraineeDetailId(row.traineeId)}
                          title={cell.trainerName ? `${formatWhenHuman(cell.when)} · ${cell.trainerName}` : formatWhenHuman(cell.when)}
                        >
                          {formatWhenHuman(cell.when)} {cell.trainerName && <span className="text-gray-500 text-xs">{cell.trainerName}</span>} {flagDot}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-gray-600 mb-4">Select a trainee to edit their schedule.</p>
      <div className="space-y-2 mb-6">
        {trainees.map((t) => (
          <button
            key={t.id}
            type="button"
            className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50"
            onClick={() => onSetScheduleTraineeId(t.id)}
          >
            {t.name} #{t.employeeNumber || t.id}
          </button>
        ))}
      </div>
      {scheduleTraineeId && (
        <ScheduleEditor
          traineeId={scheduleTraineeId}
          schedule={trainingData[scheduleTraineeId]?.schedule || {}}
          trainers={trainers}
          managers={managers}
          allTrainingData={trainingData}
          onSave={onSaveSchedule}
        />
      )}
    </div>
  )
}
