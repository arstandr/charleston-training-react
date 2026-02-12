import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useOrg } from '../contexts/OrgContext'
import AppHeader from '../components/AppHeader'
import StatCard from '../components/StatCard'
import TrainerCard from '../components/TrainerCard'
import TraineeCard from '../components/TraineeCard'
import ScheduleEditor from '../components/ScheduleEditor'
import ArchivedEmployees from '../components/ArchivedEmployees'
import TrainerFeedbackModal from '../components/TrainerFeedbackModal'
import AddTraineeModal from '../components/AddTraineeModal'
import EditTraineeModal from '../components/EditTraineeModal'
import AddNoteModal from '../components/AddNoteModal'
import ManagerTraineeDetailView from '../components/ManagerTraineeDetailView'
import ManagerAssessSignModal from '../components/ManagerAssessSignModal'
import ManagerAiAssessmentModal from '../components/ManagerAiAssessmentModal'
import { useStaffAccounts } from '../hooks/useStaffAccounts'
import { useTrainingData } from '../hooks/useTrainingData'
import { useTrainers } from '../hooks/useTrainers'
import {
  getPendingClaimsForStore,
  approveShiftClaim,
  denyShiftClaim,
  getShiftsAwaitingManagerSignOff,
  getManagerNeedsYouQueue,
  getManagerScheduleRows,
  getTraineeReadinessAggregate,
  signShiftAsManager,
  getTrainerAssignedShifts,
  getTrainerRatingBreakdown,
  formatWhenHuman,
} from '../utils/helpers'
import { STORES, REQUIRED_SHIFT_KEYS, SHIFT_META } from '../constants'
import { useToastStoreGuids } from '../hooks/useToastStoreGuids'
import { syncEmployeesToFirestore, getToastShifts } from '../services/toast'
import { syncTrainersFromToast, syncTrainerSchedules } from '../services/ToastSyncService'
import { requestTestAttemptReset, getOfficialTestIds } from '../services/testAttemptResets'
import { QUIZ_DATABASE } from '../data/quizDatabase'
import PrintTrainingSummary from '../components/PrintTrainingSummary'
import { SkeletonCard } from '../components/SkeletonCard'

function isThisWeek(iso) {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  const sun = new Date(now)
  sun.setDate(now.getDate() - now.getDay())
  sun.setHours(0, 0, 0, 0)
  const nextSun = new Date(sun)
  nextSun.setDate(nextSun.getDate() + 7)
  return d >= sun && d < nextSun
}

export default function ManagerDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser } = useAuth()
  const store = currentUser?.store || 'Westfield'
  const isAdminOrOwner = ['admin', 'owner'].includes((currentUser?.role || '').toLowerCase())
  const [view, setView] = useState('overview')
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [scheduleTraineeId, setScheduleTraineeId] = useState(null)

  const confirm = useConfirm()
  const { staffAccounts, saveStaffAccounts, archiveStaff, restoreStaff } = useStaffAccounts()
  const { trainingData, setTrainingData, saveTrainingData, listTrainees, trainingDataLoading, archiveTrainee, restoreTrainee, deleteTrainee, addTrainee, updateTrainee, addTraineeNote } = useTrainingData()
  const { trainers, loadTrainersFromFirestoreForStore } = useTrainers(store)
  const { stores } = useOrg()
  const { getRestaurantGuid } = useToastStoreGuids()

  const [addTraineeOpen, setAddTraineeOpen] = useState(false)
  const [toastSyncLoading, setToastSyncLoading] = useState(false)
  const [toastSyncMessage, setToastSyncMessage] = useState(null)
  const [managerSearch, setManagerSearch] = useState('')
  const [resetAttemptsTraineeId, setResetAttemptsTraineeId] = useState(null)
  const [resetAttemptsTestId, setResetAttemptsTestId] = useState('all')
  const [resetAttemptsSubmitting, setResetAttemptsSubmitting] = useState(false)
  const [printSummaryTraineeId, setPrintSummaryTraineeId] = useState(null)
  const [editTraineeId, setEditTraineeId] = useState(null)
  const [noteTraineeId, setNoteTraineeId] = useState(null)
  const [viewTraineeDetailId, setViewTraineeDetailId] = useState(null)
  const [assessSignRow, setAssessSignRow] = useState(null)
  const [assessTraineeId, setAssessTraineeId] = useState(null)
  const [aiAssessTraineeId, setAiAssessTraineeId] = useState(null)
  const [feedbackEmpNum, setFeedbackEmpNum] = useState(null)
  const [toastShiftsLoading, setToastShiftsLoading] = useState(false)
  const [toastShiftsResult, setToastShiftsResult] = useState(null)
  const [toastTrainersSchedulesLoading, setToastTrainersSchedulesLoading] = useState(false)
  const [testLocksOpen, setTestLocksOpen] = useState(false)
  const [activeLocks, setActiveLocks] = useState([])
  const [testLocksLoading, setTestLocksLoading] = useState(false)

  useEffect(() => {
    loadTrainersFromFirestoreForStore(store)
  }, [store, loadTrainersFromFirestoreForStore])

  useEffect(() => {
    if (!testLocksOpen) return
    let cancelled = false
    setTestLocksLoading(true)
    getDocs(collection(db, 'activeTestSessions'))
      .then((snap) => {
        if (cancelled) return
        const list = []
        snap.docs.forEach((d) => {
          const data = d.data()
          const startedAt = data.startedAt?.toMillis?.() ?? data.startedAt
          list.push({
            traineeId: d.id,
            testId: data.testId || '',
            startedAt: startedAt ? new Date(startedAt) : null,
          })
        })
        setActiveLocks(list)
      })
      .catch(() => {
        if (!cancelled) setActiveLocks([])
      })
      .finally(() => {
        if (!cancelled) setTestLocksLoading(false)
      })
    return () => { cancelled = true }
  }, [testLocksOpen])

  useEffect(() => {
    const id = location.state?.viewTraineeId
    if (id) {
      setViewTraineeDetailId(id)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state?.viewTraineeId, location.pathname, navigate])

  const trainees = listTrainees({ store, includeArchived: false }).filter((t) => !t.archived)
  const filteredTrainees = useMemo(() => {
    const q = (managerSearch || '').toLowerCase().trim()
    if (!q) return trainees
    return trainees.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        String(t.employeeNumber || t.id || '').toLowerCase().includes(q)
    )
  }, [trainees, managerSearch])
  const archivedTrainees = listTrainees({ store, includeArchived: true }).filter((t) => t.archived)
  const archivedStaffList = Object.entries(staffAccounts)
    .filter(([, info]) => info?.archived && (!store || info.store === store))
    .map(([emp, info]) => ({ emp, name: info.name || 'Unnamed', role: info.role || '', store: info.store || '' }))

  const managers = Object.entries(staffAccounts)
    .filter(([, info]) => info?.role === 'manager' || info?.role === 'admin' || info?.role === 'owner')
    .map(([empNum, info]) => ({ empNum, ...info }))

  const pendingClaims = useMemo(
    () => getPendingClaimsForStore(trainingData, store),
    [trainingData, store]
  )
  const awaitingManagerSignOff = useMemo(
    () => getShiftsAwaitingManagerSignOff(trainingData, store),
    [trainingData, store]
  )
  const needsYouQueue = useMemo(
    () => getManagerNeedsYouQueue(trainingData, store),
    [trainingData, store]
  )
  const actionItemsCount = needsYouQueue.length
  const inProgressCount = trainees.filter((t) => !t.certified).length
  const certReadyCount = trainees.filter((t) => t.certified).length

  const traineesWithNeedsYou = useMemo(() => {
    return filteredTrainees.map((t) => {
      const hasClaim = needsYouQueue.some((q) => q.type === 'claim' && q.traineeId === t.id)
      const hasSign = needsYouQueue.some((q) => q.type === 'sign' && q.traineeId === t.id)
      let needsYouLabel = ''
      if (hasClaim && hasSign) needsYouLabel = 'Claim + Needs your sign-off'
      else if (hasClaim) needsYouLabel = 'Claim pending your approval'
      else if (hasSign) needsYouLabel = 'Needs your sign-off'
      const readiness = getTraineeReadinessAggregate(trainingData, t.id)
      return { ...t, needsYouLabel, readiness }
    })
  }, [filteredTrainees, needsYouQueue, trainingData])

  const scheduleRows = useMemo(
    () => getManagerScheduleRows(trainingData, store, staffAccounts),
    [trainingData, store, staffAccounts]
  )
  const scheduleGridByTrainee = useMemo(() => {
    const byTrainee = {}
    scheduleRows.forEach((r) => {
      const id = r.traineeId
      if (!byTrainee[id]) {
        byTrainee[id] = { traineeId: id, traineeName: r.traineeName, traineeEmp: r.traineeEmp, cells: {} }
      }
      byTrainee[id].cells[r.shiftKey] = r
    })
    return Object.values(byTrainee).sort((a, b) => (a.traineeName || '').localeCompare(b.traineeName || ''))
  }, [scheduleRows])
  const scheduleShiftColumns = REQUIRED_SHIFT_KEYS.filter((k) => SHIFT_META && k in SHIFT_META)

  const trainersWithMeta = useMemo(() => {
    return trainers
      .filter((t) => !staffAccounts[t.empNum]?.archived)
      .map((t) => {
        const assigned = getTrainerAssignedShifts(trainingData, t.empNum, store)
        const shiftsThisWeek = assigned.filter((row) => isThisWeek(row.when)).length
        const managerSignedCount = assigned.filter((row) => row.managerSigned).length
        const effectivenessPct = assigned.length ? Math.round((managerSignedCount / assigned.length) * 100) : 0
        const breakdown = getTrainerRatingBreakdown(trainingData, t.empNum)
        const starRating = breakdown.overallAvg ?? t.starRating ?? 0
        const ratingsCount = breakdown.count ?? t.ratingsCount ?? 0
        return { ...t, assignedCount: assigned.length, shiftsThisWeek, effectivenessPct, starRating, ratingsCount }
      })
  }, [trainers, staffAccounts, trainingData, store])

  function handleSaveSchedule(traineeId, schedule) {
    const next = { ...trainingData }
    if (!next[traineeId]) next[traineeId] = {}
    next[traineeId].schedule = schedule
    setTrainingData(next)
    saveTrainingData(next)
    setScheduleTraineeId(null)
  }

  function handleRestoreStaff(empNum) {
    restoreStaff(empNum).then(() => setArchivedOpen(false))
  }

  const empNum = currentUser?.empNum

  function handleApproveClaim(traineeId, shiftKey) {
    const next = approveShiftClaim(trainingData, traineeId, shiftKey)
    setTrainingData(next)
    saveTrainingData(next)
  }

  function handleDenyClaim(traineeId, shiftKey) {
    const next = denyShiftClaim(trainingData, traineeId, shiftKey)
    setTrainingData(next)
    saveTrainingData(next)
  }

  function handleManagerSignOff(traineeId, shiftKey, payload = null) {
    if (!empNum) return
    const readiness = payload?.readiness ?? null
    const managerScore = payload?.managerScore ?? null
    const next = signShiftAsManager(trainingData, traineeId, shiftKey, empNum, readiness, managerScore)
    setTrainingData(next)
    saveTrainingData(next)
  }

  async function handleSyncFromToast() {
    const restaurantGuid = getRestaurantGuid(store)
    if (!restaurantGuid) {
      setToastSyncMessage({ error: `No Toast GUID configured for ${store}.` })
      return
    }
    setToastSyncLoading(true)
    setToastSyncMessage(null)
    try {
      const result = await syncEmployeesToFirestore(restaurantGuid)
      setToastSyncMessage({
        success: true,
        text: `Synced: ${result.created ?? 0} created, ${result.updated ?? 0} updated, ${result.skipped ?? 0} skipped.`,
      })
    } catch (err) {
      setToastSyncMessage({ error: err.message || 'Sync failed' })
    } finally {
      setToastSyncLoading(false)
    }
  }

  async function handleSyncTrainersAndSchedules() {
    const restaurantGuid = getRestaurantGuid(store)
    if (!restaurantGuid) {
      setToastSyncMessage({ error: `No Toast GUID configured for ${store}.` })
      return
    }
    setToastTrainersSchedulesLoading(true)
    setToastSyncMessage(null)
    try {
      setToastSyncMessage({ text: 'Authenticating with Toast…' })
      const trainerResult = await syncTrainersFromToast(restaurantGuid, store)
      setToastSyncMessage({ text: `Found ${trainerResult.count} Trainer${trainerResult.count !== 1 ? 's' : ''}…` })
      const scheduleResult = await syncTrainerSchedules(restaurantGuid, store)
      setToastSyncMessage({ text: `Downloading 3 weeks of schedules… (${scheduleResult.shiftCount} shifts)` })
      setToastSyncMessage({
        text: `✅ Sync complete. Dashboard updated. (${trainerResult.count} trainers, ${scheduleResult.shiftCount} shifts)`,
      })
      await loadTrainersFromFirestoreForStore(store)
    } catch (err) {
      setToastSyncMessage({ error: err?.message || 'Sync failed' })
    } finally {
      setToastTrainersSchedulesLoading(false)
    }
  }

  return (
    <>
      <AppHeader />
      <div className="container mx-auto px-4 pb-8">
        <div className="content-area">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Manager Dashboard</h2>
          <p className="text-gray-600 text-sm mb-6">{store} Location</p>

          <div className="flex flex-wrap gap-2 mb-6">
            <button
              type="button"
              className={`btn btn-small ${view === 'overview' ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : ''}`}
              onClick={() => setView('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`btn btn-small ${view === 'schedule' ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : ''}`}
              onClick={() => setView('schedule')}
            >
              Schedule
            </button>
            <button
              type="button"
              className={`btn btn-small ${view === 'team' ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : ''}`}
              onClick={() => setView('team')}
            >
              My Team
            </button>
            <button type="button" className="btn btn-small" onClick={() => setAddTraineeOpen(true)}>
              Add trainee
            </button>
            <button type="button" className="btn btn-small" onClick={() => setArchivedOpen(true)}>
              Archived employees
            </button>
            {STORES[store]?.sheetUrl && (
              <a
                href={STORES[store].sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-small btn-secondary"
              >
                Open {store} data
              </a>
            )}
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={() => setTestLocksOpen(true)}
              title="Release stuck test locks so trainees can log in again"
            >
              🔓 Manage Test Locks
            </button>
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={handleSyncTrainersAndSchedules}
              disabled={toastTrainersSchedulesLoading}
              title="Download Trainers and their schedules from Toast POS"
            >
              {toastTrainersSchedulesLoading ? 'Syncing…' : '🔄 Sync Trainers & Schedules'}
            </button>
            {isAdminOrOwner && (
              <>
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={handleSyncFromToast}
                  disabled={toastSyncLoading}
                >
                  {toastSyncLoading ? 'Syncing…' : 'Sync from Toast'}
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={() => navigate('/menu-management')}
                >
                  Menu management
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={() => navigate('/menu-studio')}
                >
                  Menu Studio
                </button>
              </>
            )}
          </div>
          {toastSyncMessage && (
            <div
              className={`mb-4 rounded-lg border p-3 text-sm ${toastSyncMessage.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}
            >
              {toastSyncMessage.error || toastSyncMessage.text}
            </div>
          )}

          <AddTraineeModal
            open={addTraineeOpen}
            store={store}
            onAdd={(emp, name) => addTrainee(emp, name, store)}
            onClose={() => setAddTraineeOpen(false)}
          />

          {view === 'overview' && (
            <>
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => document.getElementById('needs-attention-section')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  <StatCard count={actionItemsCount} label="Action items" borderClass="border-orange" />
                </button>
                <StatCard count={inProgressCount} label="In progress" variant="green" />
                <StatCard count={certReadyCount} label="Cert ready" variant="green" />
              </div>

              <section id="needs-attention-section" className="mb-8">
                <h3 className="mb-3 border-l-4 border-l-orange-500 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                  Needs attention ({actionItemsCount})
                </h3>
                {needsYouQueue.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-10 text-center text-gray-600">
                    You're all caught up! No pending actions.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {needsYouQueue.map((item) => {
                      const isClaim = item.type === 'claim'
                      return (
                        <li
                          key={`${item.type}-${item.traineeId}-${item.shiftKey}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-[var(--color-primary)]"
                        >
                          <div>
                            <div className="font-bold text-gray-800">{item.traineeName}</div>
                            <div className="text-sm text-gray-600">
                              {item.icon ? <span className="mr-1">{item.icon}</span> : null}
                              {item.shiftLabel} · {isClaim ? 'Trainer claim' : 'Sign-off needed'} · {formatWhenHuman(item.when)}
                            </div>
                            {isClaim && item.pendingTrainer && (
                              <div className="mt-0.5 text-xs text-gray-500">
                                Claimed by: {staffAccounts[item.pendingTrainer]?.name || `#${item.pendingTrainer}`}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {isClaim ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-small btn-secondary"
                                  onClick={() => handleDenyClaim(item.traineeId, item.shiftKey)}
                                >
                                  Deny
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-small"
                                  onClick={() => handleApproveClaim(item.traineeId, item.shiftKey)}
                                >
                                  Approve
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-small"
                                onClick={() => setAssessSignRow(item)}
                              >
                                Assess &amp; sign
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-small btn-secondary"
                              onClick={() => setViewTraineeDetailId(item.traineeId)}
                            >
                              View
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
              <h3 className="text-lg font-bold text-orange-600 border-b-2 border-orange-500 pb-2 mb-4">
                My Trainers ({trainersWithMeta.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {trainersWithMeta.map((t) => (
                  <TrainerCard
                    key={t.empNum}
                    trainer={t}
                    onFeedback={(empNum) => setFeedbackEmpNum(empNum)}
                    onArchive={(empNum) => confirm('Archive this trainer? They can be restored from Archived employees.', 'Archive trainer').then((ok) => ok && archiveStaff(empNum))}
                  />
                ))}
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  placeholder="Search by name or #"
                  className="rounded border border-gray-300 px-3 py-2 text-sm max-w-xs"
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                />
              </div>
              <h3 className="text-lg font-bold text-blue-600 border-b-2 border-blue-500 pb-2 mb-4">
                My Trainees ({filteredTrainees.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {traineesWithNeedsYou.map((t) => (
                  <TraineeCard
                    key={t.id}
                    trainee={t}
                    trainingData={trainingData}
                    variant="mint"
                    needsYouLabel={t.needsYouLabel}
                    readiness={t.readiness}
                    onEditSchedule={() => setScheduleTraineeId(t.id)}
                    onAssess={(id) => setAssessTraineeId(id)}
                    onInsight={(id) => setAiAssessTraineeId(id)}
                    onArchive={() => confirm('Archive this trainee? They can be restored from Archived employees.', 'Archive trainee').then((ok) => ok && archiveTrainee(t.id))}
                    onResetAttempts={(id) => { setResetAttemptsTraineeId(id); setResetAttemptsTestId('all') }}
                    onPrintSummary={(id) => setPrintSummaryTraineeId(id)}
                    onEditTrainee={(id) => setEditTraineeId(id)}
                    onAddNote={(id) => setNoteTraineeId(id)}
                    onViewDetails={(id) => setViewTraineeDetailId(id)}
                    onDeleteTrainee={(id) => confirm('Permanently delete this trainee and all their data? This cannot be undone.', 'Delete trainee').then((ok) => ok && deleteTrainee(id))}
                  />
                ))}
              </div>
            </>
          )}

          {view === 'schedule' && (
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                {isAdminOrOwner && (
                  <button
                    type="button"
                    className="btn btn-small btn-secondary"
                    disabled={toastShiftsLoading}
                    onClick={async () => {
                      const restaurantGuid = getRestaurantGuid(store)
                      if (!restaurantGuid) {
                        setToastShiftsResult({ error: `No Toast GUID for ${store}.` })
                        return
                      }
                      setToastShiftsLoading(true)
                      setToastShiftsResult(null)
                      try {
                        const end = new Date()
                        end.setDate(end.getDate() + 14)
                        const startDate = new Date().toISOString().slice(0, 10)
                        const endDate = end.toISOString().slice(0, 10)
                        const res = await getToastShifts(restaurantGuid, startDate, endDate)
                        const data = res.data ?? res.shifts ?? res
                        const list = Array.isArray(data) ? data : (data?.body ? data.body : [])
                        setToastShiftsResult({ count: list.length, startDate, endDate, shifts: list })
                      } catch (e) {
                        setToastShiftsResult({ error: e.message || 'Failed to fetch shifts' })
                      } finally {
                        setToastShiftsLoading(false)
                      }
                    }}
                  >
                    {toastShiftsLoading ? 'Loading…' : 'Sync schedules from Toast'}
                  </button>
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
                              onClick={() => setViewTraineeDetailId(row.traineeId)}
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
                                  onClick={() => setViewTraineeDetailId(row.traineeId)}
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
                    onClick={() => setScheduleTraineeId(t.id)}
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
                  onSave={handleSaveSchedule}
                />
              )}
            </div>
          )}

          {view === 'team' && (
            <>
              <h3 className="text-lg font-bold text-orange-600 mb-4">Trainers</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {trainersWithMeta.map((t) => (
                  <TrainerCard
                    key={t.empNum}
                    trainer={t}
                    onFeedback={(empNum) => setFeedbackEmpNum(empNum)}
                    onArchive={(empNum) => archiveStaff(empNum)}
                  />
                ))}
              </div>
              <div className="mb-4">
                <input
                  type="search"
                  placeholder="Search by name or #"
                  className="rounded border border-gray-300 px-3 py-2 text-sm max-w-xs"
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                />
              </div>
              <h3 className="text-lg font-bold text-blue-600 mb-4">Trainees</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {trainingDataLoading ? (
                  Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
                ) : traineesWithNeedsYou.map((t) => (
                  <TraineeCard
                    key={t.id}
                    trainee={t}
                    trainingData={trainingData}
                    variant="mint"
                    needsYouLabel={t.needsYouLabel}
                    readiness={t.readiness}
                    onEditSchedule={() => setScheduleTraineeId(t.id)}
                    onAssess={(id) => setAssessTraineeId(id)}
                    onInsight={(id) => setAiAssessTraineeId(id)}
                    onArchive={() => confirm('Archive this trainee? They can be restored from Archived employees.', 'Archive trainee').then((ok) => ok && archiveTrainee(t.id))}
                    onResetAttempts={(id) => { setResetAttemptsTraineeId(id); setResetAttemptsTestId('all') }}
                    onPrintSummary={(id) => setPrintSummaryTraineeId(id)}
                    onEditTrainee={(id) => setEditTraineeId(id)}
                    onAddNote={(id) => setNoteTraineeId(id)}
                    onViewDetails={(id) => setViewTraineeDetailId(id)}
                    onDeleteTrainee={(id) => confirm('Permanently delete this trainee and all their data? This cannot be undone.', 'Delete trainee').then((ok) => ok && deleteTrainee(id))}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Assess: pick a shift awaiting manager sign-off for this trainee */}
      {assessTraineeId && (() => {
        const rows = awaitingManagerSignOff.filter((r) => r.traineeId === assessTraineeId)
        const traineeName = trainingData[assessTraineeId]?.name || trainees.find((t) => t.id === assessTraineeId)?.name || assessTraineeId
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAssessTraineeId(null)}>
            <div className="rounded-xl bg-white shadow-xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Assess · {traineeName}</h3>
              {rows.length === 0 ? (
                <p className="text-sm text-gray-600 mb-4">No shifts awaiting your sign-off.</p>
              ) : (
                <ul className="space-y-2 mb-4">
                  {rows.map((row) => (
                    <li key={`${row.traineeId}-${row.shiftKey}`}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => { setAssessSignRow(row); setAssessTraineeId(null) }}
                      >
                        <span>{row.shiftLabel || row.shiftKey}</span>
                        {row.when && <span className="text-xs text-gray-500">{formatWhenHuman(row.when)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="btn btn-small btn-secondary" onClick={() => setAssessTraineeId(null)}>Close</button>
            </div>
          </div>
        )
      })()}

      <ManagerAssessSignModal
        open={!!assessSignRow}
        row={assessSignRow}
        onSign={(payload) => {
          if (assessSignRow) handleManagerSignOff(assessSignRow.traineeId, assessSignRow.shiftKey, payload)
          setAssessSignRow(null)
        }}
        onClose={() => setAssessSignRow(null)}
      />

      <ManagerAiAssessmentModal
        open={!!aiAssessTraineeId}
        traineeId={aiAssessTraineeId}
        traineeName={aiAssessTraineeId ? (trainingData[aiAssessTraineeId]?.name || trainees.find((t) => t.id === aiAssessTraineeId)?.name) : ''}
        trainingData={trainingData}
        onClose={() => setAiAssessTraineeId(null)}
      />

      {viewTraineeDetailId && (
        <ManagerTraineeDetailView
          traineeId={viewTraineeDetailId}
          trainee={trainingData[viewTraineeDetailId] ? { id: viewTraineeDetailId, ...trainingData[viewTraineeDetailId] } : null}
          trainingData={trainingData}
          staffAccounts={staffAccounts}
          onClose={() => setViewTraineeDetailId(null)}
        />
      )}

      <AddNoteModal
        open={!!noteTraineeId}
        trainee={noteTraineeId ? (trainingData[noteTraineeId] ? { id: noteTraineeId, ...trainingData[noteTraineeId] } : null) : null}
        onSave={(id, text) => { addTraineeNote(id, text, empNum); setNoteTraineeId(null) }}
        onClose={() => setNoteTraineeId(null)}
      />

      <EditTraineeModal
        open={!!editTraineeId}
        trainee={editTraineeId ? (trainingData[editTraineeId] ? { id: editTraineeId, ...trainingData[editTraineeId] } : null) : null}
        stores={stores}
        onSave={(id, payload) => updateTrainee(id, payload) && setEditTraineeId(null)}
        onClose={() => setEditTraineeId(null)}
      />

      {/* Print training summary modal */}
      {printSummaryTraineeId && (() => {
        const t = trainees.find((x) => x.id === printSummaryTraineeId)
        if (!t) return null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPrintSummaryTraineeId(null)}>
            <div className="rounded-xl bg-white shadow-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <PrintTrainingSummary
                trainee={t}
                trainingData={trainingData}
                staffAccounts={staffAccounts}
                onClose={() => setPrintSummaryTraineeId(null)}
              />
            </div>
          </div>
        )
      })()}

      {/* Reset test attempts modal */}
      {resetAttemptsTraineeId && (() => {
        const trainee = trainees.find((t) => t.id === resetAttemptsTraineeId)
        const officialIds = getOfficialTestIds()
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !resetAttemptsSubmitting && setResetAttemptsTraineeId(null)}>
            <div className="rounded-xl bg-white p-6 shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Reset test attempts</h3>
              <p className="text-sm text-gray-600 mb-4">
                For <strong>{trainee?.name || resetAttemptsTraineeId}</strong>. They will get attempts back on next login.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">Test</label>
              <select
                className="w-full rounded border border-gray-300 px-3 py-2 mb-4"
                value={resetAttemptsTestId}
                onChange={(e) => setResetAttemptsTestId(e.target.value)}
              >
                <option value="all">All official tests</option>
                {officialIds.map((id) => (
                  <option key={id} value={id}>{(QUIZ_DATABASE[id]?.title) || id}</option>
                ))}
              </select>
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn btn-small" onClick={() => setResetAttemptsTraineeId(null)} disabled={resetAttemptsSubmitting}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-small bg-amber-600 text-white hover:bg-amber-700"
                  disabled={resetAttemptsSubmitting}
                  onClick={async () => {
                    setResetAttemptsSubmitting(true)
                    const ok = await requestTestAttemptReset(resetAttemptsTraineeId, resetAttemptsTestId, empNum)
                    setResetAttemptsSubmitting(false)
                    if (ok) setResetAttemptsTraineeId(null)
                  }}
                >
                  {resetAttemptsSubmitting ? 'Resetting…' : 'Reset'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Schedule editor modal (from Overview/Team "Edit Schedule" on card) */}
      {scheduleTraineeId && view !== 'schedule' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setScheduleTraineeId(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                Edit schedule · {trainingData[scheduleTraineeId]?.name || scheduleTraineeId}
              </h3>
              <button type="button" className="btn btn-small btn-secondary" onClick={() => setScheduleTraineeId(null)}>
                Close
              </button>
            </div>
            <ScheduleEditor
              traineeId={scheduleTraineeId}
              schedule={trainingData[scheduleTraineeId]?.schedule || {}}
              trainers={trainers}
              managers={managers}
              onSave={(tid, schedule) => {
                handleSaveSchedule(tid, schedule)
                setScheduleTraineeId(null)
              }}
            />
          </div>
        </div>
      )}

      <TrainerFeedbackModal
        open={!!feedbackEmpNum}
        trainerName={feedbackEmpNum ? (staffAccounts[feedbackEmpNum]?.name || trainers.find((t) => t.empNum === feedbackEmpNum)?.name || `#${feedbackEmpNum}`) : ''}
        trainerEmpNum={feedbackEmpNum}
        breakdown={feedbackEmpNum ? getTrainerRatingBreakdown(trainingData, feedbackEmpNum) : null}
        onClose={() => setFeedbackEmpNum(null)}
      />

      {testLocksOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTestLocksOpen(false)}>
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-xl border border-gray-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-800">Manage Test Locks</h2>
              <button type="button" className="btn btn-small btn-secondary" onClick={() => setTestLocksOpen(false)}>
                Close
              </button>
            </div>
            <p className="px-6 py-2 text-sm text-gray-600 border-b border-gray-100">
              Trainees are locked out when they have an official test in progress on another device. Release a lock to let them sign in again (e.g. after a crash).
            </p>
            <div className="flex-1 overflow-y-auto p-6">
              {testLocksLoading ? (
                <p className="text-gray-500">Loading…</p>
              ) : activeLocks.length === 0 ? (
                <p className="text-gray-500">No active test locks.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 pr-4 font-semibold text-gray-700">Trainee</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Test</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Started</th>
                      <th className="py-2 font-semibold text-gray-700">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLocks.map((lock) => {
                      const name = trainingData[lock.traineeId]?.name || lock.traineeId
                      const startedStr = lock.startedAt ? lock.startedAt.toLocaleString() : '—'
                      return (
                        <tr key={lock.traineeId} className="border-b border-gray-100">
                          <td className="py-3 pr-4 text-gray-800">{name}</td>
                          <td className="py-3 pr-4 text-gray-700">{lock.testId || '—'}</td>
                          <td className="py-3 pr-4 text-gray-600">{startedStr}</td>
                          <td className="py-3">
                            <button
                              type="button"
                              className="btn btn-small btn-secondary"
                              onClick={async () => {
                                try {
                                  await deleteDoc(doc(db, 'activeTestSessions', lock.traineeId))
                                  setActiveLocks((prev) => prev.filter((l) => l.traineeId !== lock.traineeId))
                                } catch (_) {}
                              }}
                            >
                              Release Lock
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <ArchivedEmployees
        open={archivedOpen}
        onClose={() => setArchivedOpen(false)}
        archivedTrainees={archivedTrainees}
        archivedStaff={archivedStaffList}
        onRestoreTrainee={(id) => { restoreTrainee(id); setArchivedOpen(false) }}
        onRestoreStaff={handleRestoreStaff}
      />
    </>
  )
}
