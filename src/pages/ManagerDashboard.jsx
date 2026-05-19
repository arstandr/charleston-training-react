import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { app } from '../firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { useAuth } from '../contexts/AuthContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useOrg } from '../contexts/OrgContext'
import AppHeader from '../components/AppHeader'
import StatCard from '../components/StatCard'
import TrainerCard from '../components/TrainerCard'
import TraineeCard from '../components/TraineeCard'
import ScheduleEditor from '../components/ScheduleEditor'
import ArchivedEmployees from '../components/ArchivedEmployees'
import TrainerRatingBreakdownModal from '../components/TrainerRatingBreakdownModal'
import TrainerScheduleModal from '../components/TrainerScheduleModal'
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
  getInitials,
  getCertificationProgress,
  isSameCalendarDay,
} from '../utils/helpers'
import { STORES, REQUIRED_SHIFT_KEYS, SHIFT_META, getStoreDisplayName } from '../constants'
import { useToastStoreGuids } from '../hooks/useToastStoreGuids'
import { ensureTrainingDataFromFirestore, updateDocFields, deleteField } from '../utils/firestore'
import ManagerNavBar from '../components/ManagerNavBar'
import ManagerAnalyticsOverview from '../components/ManagerAnalyticsOverview'
import TraineeAnalytics from '../components/analytics/TraineeAnalytics'
import TrainerAnalytics from '../components/analytics/TrainerAnalytics'
import ManagerAnalytics from '../components/analytics/ManagerAnalytics'
import TestQuizAnalytics from '../components/analytics/TestQuizAnalytics'
import {
  fetchAllFlashcardMastery,
  fetchAllFlashcardSessions,
  fetchAllQuizAttempts,
  fetchAllUsers,
} from '../services/analyticsService'
import { findRecentShiftByType, approveTrainerClaim, createShift } from '../services/trainingShiftsService'
import { findUserByEmpNum } from '../services/userProfileService'
import { getAllActiveTestSessions, deleteActiveTestSession } from '../services/testLockService'
import { syncEmployeesToFirestore, getToastShifts } from '../services/toast'
import { syncTrainersFromToast, syncTrainerSchedules, syncManagersFromToast } from '../services/ToastSyncService'
import { requestTestAttemptReset, getOfficialTestIds } from '../services/testAttemptResets'
import { loadTestResults } from '../services/quizAttemptsService'
import { TESTS, PRETTY_TEST_NAMES } from '../data/quizDatabase'
import PrintTrainingSummary from '../components/PrintTrainingSummary'
import { getLastActivityDate } from '../utils/RiskEngine'
import { SkeletonCard } from '../components/SkeletonCard'
import TestLockManager from '../components/TestLockManager'
import ManagerHealthView from '../components/ManagerHealthView'
import HotSchedulesUpload from '../components/HotSchedulesUpload'
import TerminateTraineeModal from '../components/TerminateTraineeModal'
import TestReviewModal from '../components/TestReviewModal'

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
  const scheduleEditorSaveRef = useRef(null)

  const confirm = useConfirm()
  const { staffAccounts, saveStaffAccounts, archiveStaff, restoreStaff, reload: reloadStaffAccounts } = useStaffAccounts()
  const { trainingData, setTrainingData, saveTrainingData, listTrainees, trainingDataLoading, trainingDataFetchedAt, archiveTrainee, terminateTrainee, restoreTrainee, deleteTrainee, addTrainee, updateTrainee, addTraineeNote, reload: reloadTrainingData, refreshFromFirestore } = useTrainingData()
  const { trainers, loadTrainersFromFirestoreForStore } = useTrainers(store)
  const { stores } = useOrg()
  const { getRestaurantGuid, storeNames } = useToastStoreGuids()

  const [addTraineeOpen, setAddTraineeOpen] = useState(false)
  const [toastSyncLoading, setToastSyncLoading] = useState(false)
  const [toastSyncMessage, setToastSyncMessage] = useState(null)
  const [managerSearch, setManagerSearch] = useState('')
  const [resetAttemptsTraineeId, setResetAttemptsTraineeId] = useState(null)
  const [resetAttemptsTestId, setResetAttemptsTestId] = useState('all')
  const [resetAttemptsSubmitting, setResetAttemptsSubmitting] = useState(false)
  const [resetAttemptsResults, setResetAttemptsResults] = useState(null)
  const [allTraineeTestResults, setAllTraineeTestResults] = useState({})
  const [printSummaryTraineeId, setPrintSummaryTraineeId] = useState(null)
  const [editTraineeId, setEditTraineeId] = useState(null)
  const [noteTraineeId, setNoteTraineeId] = useState(null)
  const [viewTraineeDetailId, setViewTraineeDetailId] = useState(null)
  const [assessSignRow, setAssessSignRow] = useState(null)
  const [assessTraineeId, setAssessTraineeId] = useState(null)
  const [aiAssessTraineeId, setAiAssessTraineeId] = useState(null)
  const [selectedTrainerForRating, setSelectedTrainerForRating] = useState(null)
  const [selectedTrainerForSchedule, setSelectedTrainerForSchedule] = useState(null)
  const [toastShiftsLoading, setToastShiftsLoading] = useState(false)
  const [toastShiftsResult, setToastShiftsResult] = useState(null)
  const [toastTrainersSchedulesLoading, setToastTrainersSchedulesLoading] = useState(false)
  const [testLocksOpen, setTestLocksOpen] = useState(false)
  const [activeLocks, setActiveLocks] = useState([])
  const [testLocksLoading, setTestLocksLoading] = useState(false)
  const [allSchedulesData, setAllSchedulesData] = useState(null)
  const [allSchedulesLoading, setAllSchedulesLoading] = useState(false)
  const [allSchedulesError, setAllSchedulesError] = useState(null)
  const [claimToast, setClaimToast] = useState(null)
  const [analyticsTab, setAnalyticsTab] = useState('overview')
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState(null)
  const [removeTraineeId, setRemoveTraineeId] = useState(null)
  const [terminateTraineeId, setTerminateTraineeId] = useState(null)
  const [reviewTraineeId, setReviewTraineeId] = useState(null)
  const [reviewTestId, setReviewTestId] = useState(null)
  const syncInProgressRef = useRef(false)

  useEffect(() => {
    loadTrainersFromFirestoreForStore(store)
  }, [store, loadTrainersFromFirestoreForStore])

  // Re-fetch training data + trainer schedules from Firestore whenever the schedule editor opens.
  // This ensures hsSchedule and trainer availability are current even if the tab has been open
  // since before the last HotSchedules scrape.
  useEffect(() => {
    if (scheduleTraineeId) {
      refreshFromFirestore()
      loadTrainersFromFirestoreForStore(store)
    }
  }, [scheduleTraineeId])

  // Lazy-load analytics data when analytics view is first opened
  const analyticsLoadingRef = useRef(false)
  useEffect(() => {
    if (!view.startsWith('analytics:') || analyticsData || analyticsLoadingRef.current) return
    analyticsLoadingRef.current = true
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    Promise.all([
      fetchAllFlashcardMastery(),
      fetchAllFlashcardSessions(),
      fetchAllQuizAttempts(),
      fetchAllUsers(),
    ]).then(([mastery, sessions, quizzes, users]) => {
      setAnalyticsData({ mastery, sessions, quizzes, users })
    }).catch((err) => {
      console.error('[Analytics] Load failed:', err)
      setAnalyticsError('Analytics failed to load. Check your connection and try refreshing.')
    }).finally(() => {
      setAnalyticsLoading(false)
      analyticsLoadingRef.current = false
    })
  }, [view, analyticsData])

  useEffect(() => {
    if (!testLocksOpen) return
    let cancelled = false
    setTestLocksLoading(true)
    getAllActiveTestSessions()
      .then((list) => {
        if (!cancelled) setActiveLocks(list)
      })
      .catch(() => {
        if (!cancelled) setActiveLocks([])
      })
      .finally(() => {
        if (!cancelled) setTestLocksLoading(false)
      })
    return () => { cancelled = true }
  }, [testLocksOpen])

  // Load test results for the reset modal (only the selected trainee)
  useEffect(() => {
    if (!resetAttemptsTraineeId) { setResetAttemptsResults(null); return }
    let cancelled = false
    loadTestResults(resetAttemptsTraineeId).then((data) => {
      if (!cancelled) setResetAttemptsResults(data || {})
    }).catch(() => { if (!cancelled) setResetAttemptsResults({}) })
    return () => { cancelled = true }
  }, [resetAttemptsTraineeId])

  // Load test results for all trainees (for locked-out indicator on cards).
  // Depends on trainingData so it re-runs after the Firestore sync on page load
  // (trainingData starts from localStorage, then updates once Firestore hydrates).
  useEffect(() => {
    const ids = listTrainees({ store, includeArchived: false }).filter((t) => !t.archived).map((t) => t.id)
    if (!ids.length) return
    let cancelled = false
    async function loadChunked() {
      const CHUNK = 10
      const map = {}
      for (let i = 0; i < ids.length; i += CHUNK) {
        if (cancelled) return
        const chunk = ids.slice(i, i + CHUNK)
        const results = await Promise.all(chunk.map((id) => loadTestResults(id).then((r) => ({ id, r })).catch(() => ({ id, r: {} }))))
        for (const { id, r } of results) {
          for (const [testId, data] of Object.entries(r)) {
            map[`${id}_${testId}`] = data
          }
        }
      }
      if (!cancelled) setAllTraineeTestResults(map)
    }
    loadChunked()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, trainingData])

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
    .filter(([, info]) => !info?.archived && (info?.role === 'manager' || info?.role === 'admin' || info?.role === 'owner') && (!info?.store || info.store === store))
    .map(([empNum, info]) => ({ empNum, ...info }))
    .filter(m => m.empNum !== '0000')

  const awaitingManagerSignOff = useMemo(
    () => getShiftsAwaitingManagerSignOff(trainingData, store),
    [trainingData, store]
  )
  const needsYouQueue = useMemo(
    () => getManagerNeedsYouQueue(trainingData, store),
    [trainingData, store]
  )
  const inProgressCount = trainees.filter((t) => !t.certified).length
  const certReadyCount = trainees.filter((t) => t.certified).length

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

  const storeStats = useMemo(() => {
    let totalProgress = 0
    trainees.forEach((t) => {
      const td = trainingData?.[t.id]
      const prog = getCertificationProgress(td || t)
      totalProgress += prog.pct
    })
    const avgProgress = trainees.length ? Math.round(totalProgress / trainees.length) : 0
    return {
      trainees: trainees.length,
      certified: certReadyCount,
      trainers: trainersWithMeta.length,
      managers: managers.length,
      avgProgress,
      pendingClaims: needsYouQueue.filter((q) => q.type === 'claim').length,
      awaitingSignOff: awaitingManagerSignOff.length,
    }
  }, [trainees, trainingData, certReadyCount, trainersWithMeta.length, managers.length, needsYouQueue, awaitingManagerSignOff])

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

  // Augment staffAccounts with Firestore-only trainers (empNum = Toast GUID) so schedule name lookups work
  const combinedStaffAccounts = useMemo(() => {
    const map = { ...staffAccounts }
    trainers.forEach((t) => {
      if (!t.name) return
      if (t.empNum && !map[t.empNum]) map[t.empNum] = { name: t.name, role: 'trainer', toastGuid: t.toastGuid }
      if (t.toastGuid && !map[t.toastGuid]) map[t.toastGuid] = { name: t.name, role: 'trainer' }
    })
    return map
  }, [staffAccounts, trainers])

  const scheduleRows = useMemo(
    () => getManagerScheduleRows(trainingData, store, combinedStaffAccounts),
    [trainingData, store, combinedStaffAccounts]
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
  const thisWeekSchedule = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const endOfWeek = new Date(now)
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()))
    endOfWeek.setHours(23, 59, 59, 999)
    return scheduleRows.filter((r) => {
      if (!r.when) return false
      const d = new Date(r.when)
      return d >= now && d <= endOfWeek
    })
  }, [scheduleRows])

  const scheduleShiftColumns = REQUIRED_SHIFT_KEYS.filter((k) => SHIFT_META && k in SHIFT_META)

  const testsToReview = useMemo(() => {
    const officialIds = TESTS.filter((t) => t.id !== 'bonus_test').map((t) => t.id)
    const items = []
    for (const trainee of filteredTrainees) {
      for (const testId of officialIds) {
        const key = `${trainee.id}_${testId}`
        const rec = allTraineeTestResults[key]
        if (!rec || !rec.count) continue
        if (rec.passed) continue
        const maxAttempts = rec.maxAttempts || 2
        items.push({
          traineeId: trainee.id,
          traineeName: trainee.name || trainee.id,
          testId,
          testTitle: PRETTY_TEST_NAMES[testId] || testId,
          count: rec.count,
          scores: rec.scores || [],
          passed: false,
          maxAttempts,
          exhausted: rec.count >= maxAttempts,
        })
      }
    }
    items.sort((a, b) => (b.exhausted ? 1 : 0) - (a.exhausted ? 1 : 0))
    return items
  }, [filteredTrainees, allTraineeTestResults])

  const unassignedShifts = useMemo(
    () => thisWeekSchedule.filter((r) => r.missingTrainer === true),
    [thisWeekSchedule]
  )

  const todaysFloor = useMemo(
    () => thisWeekSchedule.filter((r) => isSameCalendarDay(r.when, new Date())),
    [thisWeekSchedule]
  )

  const headsUpAlerts = useMemo(() => {
    const alerts = []
    const now = Date.now()
    // 1. Stalling (red)
    let stallCount = 0
    for (const t of filteredTrainees) {
      if (t.certified || stallCount >= 2) continue
      const last = getLastActivityDate(trainingData?.[t.id] || t)
      if (!last) { alerts.push({ type: 'stall', color: 'red', traineeId: t.id, name: t.name || t.id, detail: 'No activity recorded' }); stallCount++; continue }
      const days = Math.floor((now - last.getTime()) / (86400000))
      if (days > 5) { alerts.push({ type: 'stall', color: 'red', traineeId: t.id, name: t.name || t.id, detail: `Stalled ${days} days` }); stallCount++ }
    }
    // 2. Failed tests — exhausted attempts (amber)
    let failCount = 0
    for (const item of testsToReview) {
      if (failCount >= 2) break
      if (item.exhausted) { alerts.push({ type: 'failed', color: 'amber', traineeId: item.traineeId, name: item.traineeName, detail: `${item.testTitle} — ${item.count}/${item.maxAttempts} attempts used` }); failCount++ }
    }
    // 3. Near certification (green)
    let nearCount = 0
    for (const t of filteredTrainees) {
      if (nearCount >= 2 || t.certified) continue
      const prog = getCertificationProgress(trainingData?.[t.id] || t)
      if (prog.done >= prog.total - 1 && prog.done < prog.total) { alerts.push({ type: 'near', color: 'green', traineeId: t.id, name: t.name || t.id, detail: `${prog.done}/${prog.total} complete` }); nearCount++ }
    }
    // 4. Top trainers (green)
    for (const tr of trainersWithMeta) {
      if (alerts.length >= 5) break
      if (tr.starRating >= 4.5 && tr.ratingsCount >= 3) { alerts.push({ type: 'topTrainer', color: 'green', name: tr.name || `#${tr.empNum}`, detail: `${tr.starRating.toFixed(1)} stars (${tr.ratingsCount} ratings)` }); break }
    }
    return alerts.slice(0, 5)
  }, [filteredTrainees, trainingData, testsToReview, trainersWithMeta])

  const claimsCount = needsYouQueue.filter((q) => q.type === 'claim').length
  const signOffsCount = needsYouQueue.filter((q) => q.type === 'sign').length
  const actionItemsCount = needsYouQueue.length + unassignedShifts.length

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

  async function handleApproveClaim(traineeId, shiftKey) {
    const scheduleItem = trainingData?.[traineeId]?.schedule?.[shiftKey]
    const pendingTrainerEmpNum = scheduleItem?.pendingTrainer
    if (!pendingTrainerEmpNum) return

    try {
      const trainerUid = await findUserByEmpNum(pendingTrainerEmpNum)

      const shiftDoc = await findRecentShiftByType(traineeId, shiftKey)
      if (!trainerUid) {
        console.error('handleApproveClaim: no trainer found', { traineeId, shiftKey })
        setClaimToast('Could not find trainer. Try again.')
        setTimeout(() => setClaimToast(null), 3500)
        return
      }
      if (shiftDoc) {
        await approveTrainerClaim(shiftDoc.id, trainerUid, currentUser?.uid || 'manager')
      } else {
        const scheduleItem = trainingData?.[traineeId]?.schedule?.[shiftKey]
        await createShift({
          traineeId,
          shiftType: shiftKey,
          trainerId: trainerUid,
          trainerClaimStatus: 'approved',
          trainerApprovedAt: new Date().toISOString(),
          scheduledDate: scheduleItem?.date || null,
          status: 'scheduled',
        })
      }

      // Directly remove pendingTrainer from config/trainingData
      try {
        await updateDocFields('config', 'trainingData', {
          [`data.${traineeId}.schedule.${shiftKey}.pendingTrainer`]: deleteField(),
          [`data.${traineeId}.schedule.${shiftKey}.pendingAt`]: deleteField(),
          'updatedAt': new Date().toISOString(),
        })
        console.log('[Approve] Removed pendingTrainer from config/trainingData for', traineeId, shiftKey)
      } catch (e) {
        console.error('[Approve] Failed to remove pendingTrainer:', e?.message, e?.code)
      }

      const next = approveShiftClaim(trainingData, traineeId, shiftKey)
      setTrainingData(next)
      await saveTrainingData(next)
      setClaimToast('Claim approved — trainer assigned.')
      setTimeout(() => setClaimToast(null), 2500)
    } catch (err) {
      console.error('Failed to approve claim:', err)
      setClaimToast('Failed to approve claim. Try again.')
      setTimeout(() => setClaimToast(null), 3500)
    }
  }

  async function handleDenyClaim(traineeId, shiftKey) {
    // Directly remove pendingTrainer from config/trainingData
    try {
      await updateDocFields('config', 'trainingData', {
        [`data.${traineeId}.schedule.${shiftKey}.pendingTrainer`]: deleteField(),
        [`data.${traineeId}.schedule.${shiftKey}.pendingAt`]: deleteField(),
        'updatedAt': new Date().toISOString(),
      })
      console.log('[Deny] Removed pendingTrainer from config/trainingData for', traineeId, shiftKey)
    } catch (e) {
      console.error('[Deny] Failed to remove pendingTrainer:', e?.message, e?.code)
    }
    const next = denyShiftClaim(trainingData, traineeId, shiftKey)
    setTrainingData(next)
    saveTrainingData(next)
    setClaimToast('Claim denied — trainee back in unassigned pool.')
    setTimeout(() => setClaimToast(null), 2500)
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
    if (syncInProgressRef.current) {
      setToastSyncMessage({ error: 'A sync is already in progress. Please wait.' })
      return
    }
    const restaurantGuid = getRestaurantGuid(store)
    if (!restaurantGuid) {
      setToastSyncMessage({ error: `No Toast restaurant ID configured for ${store}. Contact admin.` })
      return
    }
    syncInProgressRef.current = true
    setToastSyncLoading(true)
    setToastSyncMessage({ text: 'Syncing employees from Toast…', loading: true })
    try {
      const result = await syncEmployeesToFirestore(restaurantGuid)
      setToastSyncMessage({
        success: true,
        text: `Synced: ${result.created ?? 0} created, ${result.updated ?? 0} updated, ${result.skipped ?? 0} skipped.`,
      })
    } catch (err) {
      const msg = err?.message || 'Sync failed'
      console.error('[Sync employees]', msg, err?.stack)
      setToastSyncMessage({ error: `Employee sync failed: ${msg}` })
    } finally {
      setToastSyncLoading(false)
      syncInProgressRef.current = false
    }
  }

  async function handleSyncTrainersAndSchedules() {
    if (syncInProgressRef.current) {
      setToastSyncMessage({ error: 'A sync is already in progress. Please wait.' })
      return
    }
    const restaurantGuid = getRestaurantGuid(store)
    if (!restaurantGuid) {
      setToastSyncMessage({ error: `No Toast restaurant ID configured for ${store}. Contact admin.` })
      return
    }
    syncInProgressRef.current = true
    setToastTrainersSchedulesLoading(true)
    setToastSyncMessage({ text: 'Syncing trainers & schedules from Toast…', loading: true })
    try {
      setToastSyncMessage({ text: 'Authenticating with Toast…', loading: true })
      const trainerResult = await syncTrainersFromToast(restaurantGuid, store, staffAccounts)
      if (trainerResult.staffAccounts) {
        await saveStaffAccounts(trainerResult.staffAccounts)
        reloadStaffAccounts()
      }
      setToastSyncMessage({ text: `Found ${trainerResult.count} Trainer${trainerResult.count !== 1 ? 's' : ''}… syncing schedules…`, loading: true })
      const scheduleResult = await syncTrainerSchedules(restaurantGuid, store)
      setToastSyncMessage({ text: `Downloaded 3 weeks of schedules (${scheduleResult.shiftCount} shifts)… finishing up…`, loading: true })
      setToastSyncMessage({
        text: `✅ Sync complete. Dashboard updated. (${trainerResult.count} trainers, ${scheduleResult.shiftCount} shifts)`,
      })
      await loadTrainersFromFirestoreForStore(store)
    } catch (err) {
      const msg = err?.message || 'Sync failed'
      console.error('[Sync trainers]', msg, err?.stack)
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        setToastSyncMessage({ error: 'Toast authentication failed — check store config or re-sync credentials.' })
      } else if (msg.includes('403') || msg.includes('Forbidden')) {
        setToastSyncMessage({ error: 'Toast access denied — this store may not be configured correctly.' })
      } else if (msg.includes('GUID') || msg.includes('guid')) {
        setToastSyncMessage({ error: 'No Toast restaurant ID configured for this store. Contact admin.' })
      } else {
        setToastSyncMessage({ error: `Sync failed: ${msg}` })
      }
    } finally {
      setToastTrainersSchedulesLoading(false)
      syncInProgressRef.current = false
    }
  }

  async function handleSyncSchedulesOnly() {
    if (syncInProgressRef.current) {
      setToastSyncMessage({ error: 'A sync is already in progress. Please wait.' })
      return
    }
    syncInProgressRef.current = true
    setToastTrainersSchedulesLoading(true)
    setToastSyncMessage({ text: 'Syncing schedules from Toast…', loading: true })
    try {
      const functions = getFunctions(app)
      const syncSchedulesFn = httpsCallable(functions, 'syncTrainerSchedules')
      const result = await syncSchedulesFn()
      const data = result?.data || {}
      await loadTrainersFromFirestoreForStore(store)
      const matched = data.matchedTrainers || []
      const unmatched = data.totalUnmatched || 0
      let message = ''
      if (matched.length > 0) {
        message = '✅ Synced schedules for:\n' + matched.map(m =>
          '• ' + m.name + ' (' + getStoreDisplayName(m.store) + ', ' + m.shifts + ' shifts)'
        ).join('\n')
        if (unmatched > 0) {
          message += '\n\n⚠️ ' + unmatched + ' Toast employees could not be matched to trainers'
        }
      } else {
        message = '⚠️ No schedules matched. Toast returned shifts but none matched trainers in the system.'
      }
      setToastSyncMessage({ text: message })
    } catch (err) {
      const msg = err?.message || 'Sync failed'
      console.error('[Sync schedules]', msg, err?.stack)
      setToastSyncMessage({ error: `Schedule sync failed: ${msg}` })
    } finally {
      setToastTrainersSchedulesLoading(false)
      syncInProgressRef.current = false
    }
  }

  async function loadAllSchedules() {
    setAllSchedulesLoading(true)
    setAllSchedulesError(null)
    try {
      const url = 'https://us-central1-chartrain-20901.cloudfunctions.net/allSchedules'
      const res = await fetch(url)
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load schedules')
      setAllSchedulesData(data)
    } catch (err) {
      setAllSchedulesError(err?.message || 'Failed to load schedules')
      setAllSchedulesData(null)
    } finally {
      setAllSchedulesLoading(false)
    }
  }

  async function handleSyncManagers() {
    if (syncInProgressRef.current) {
      setToastSyncMessage({ error: 'A sync is already in progress. Please wait.' })
      return
    }
    syncInProgressRef.current = true
    setToastSyncLoading(true)
    setToastSyncMessage({ text: 'Syncing managers from Toast…', loading: true })
    try {
      let merged = { ...(staffAccounts || {}) }
      let totalCount = 0
      let totalCreated = 0
      let totalUpdated = 0
      const storeResults = []
      const allCreatedNames = []
      const syncStores = isAdminOrOwner ? storeNames : [store]

      for (const storeName of syncStores) {
        const guid = getRestaurantGuid(storeName)
        if (!guid) continue
        const result = await syncManagersFromToast(guid, storeName, merged)
        merged = result.staffAccounts
        totalCount += result.count
        totalCreated += result.created
        totalUpdated += result.updated
        if (result.createdNames?.length) allCreatedNames.push(...result.createdNames)
        if (result.count > 0) storeResults.push(`${storeName}: ${result.count}`)
      }

      await saveStaffAccounts(merged)
      reloadStaffAccounts()
      let msg = `Managers synced: ${totalCreated} new, ${totalUpdated} updated (${totalCount} found across ${storeResults.length} store${storeResults.length !== 1 ? 's' : ''}).`
      if (allCreatedNames.length) msg += `\nAdded: ${allCreatedNames.join(', ')}`
      setToastSyncMessage({ text: msg })
    } catch (err) {
      setToastSyncMessage({ error: err?.message || 'Manager sync failed' })
    } finally {
      setToastSyncLoading(false)
      syncInProgressRef.current = false
    }
  }

  async function handleSyncTrainersOnly() {
    if (syncInProgressRef.current) {
      setToastSyncMessage({ error: 'A sync is already in progress. Please wait.' })
      return
    }
    const restaurantGuid = getRestaurantGuid(store)
    if (!restaurantGuid) {
      setToastSyncMessage({ error: `No Toast restaurant ID configured for ${store}. Contact admin.` })
      return
    }
    syncInProgressRef.current = true
    setToastTrainersSchedulesLoading(true)
    setToastSyncMessage({ text: 'Syncing trainers from Toast…', loading: true })
    try {
      const trainerResult = await syncTrainersFromToast(restaurantGuid, store, staffAccounts)
      if (trainerResult.staffAccounts) {
        await saveStaffAccounts(trainerResult.staffAccounts)
        reloadStaffAccounts()
      }
      await loadTrainersFromFirestoreForStore(store)
      setToastSyncMessage({
        text: `✅ Trainers synced. (${trainerResult.count} trainers${trainerResult.archived ? `, ${trainerResult.archived} removed` : ''})`,
      })
    } catch (err) {
      const msg = err?.message || 'Sync failed'
      console.error('[Sync trainers only]', msg, err?.stack)
      setToastSyncMessage({ error: `Trainer sync failed: ${msg}` })
    } finally {
      setToastTrainersSchedulesLoading(false)
      syncInProgressRef.current = false
    }
  }

  return (
    <>
      <style>{`
        @keyframes scheduleModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scheduleModalScaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <AppHeader />
      {claimToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg text-sm text-gray-800">
          {claimToast}
        </div>
      )}
      <div className="container mx-auto px-4 pb-8">
        <div className="content-area">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Manager Dashboard</h2>
          <p className="text-gray-600 text-sm mb-2">{getStoreDisplayName(store)} Location</p>
          {!trainingDataLoading && trainingDataFetchedAt && (() => {
            const ageMs = Date.now() - new Date(trainingDataFetchedAt).getTime()
            if (ageMs < 60 * 60 * 1000) return null
            const hours = Math.floor(ageMs / (60 * 60 * 1000))
            return (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>&#9888;</span>
                <span>Training data is {hours} hour{hours !== 1 ? 's' : ''} old — may not reflect latest changes.</span>
                <button type="button" className="ml-auto underline" onClick={() => { reloadTrainingData() }}>Reload</button>
              </div>
            )
          })()}

          <ManagerNavBar
            activeView={view}
            onViewChange={(id) => {
              if (id.startsWith('analytics:')) {
                setAnalyticsTab(id.split(':')[1] || 'overview')
                setView(id)
              } else if (id === 'teamSchedules') {
                setView(id)
                if (!allSchedulesData && !allSchedulesLoading) loadAllSchedules()
              } else {
                setView(id)
              }
            }}
            isAdminOrOwner={isAdminOrOwner}
            actionItemsCount={actionItemsCount}
            traineeCount={filteredTrainees.length}
            trainerCount={trainersWithMeta.length}
            archivedCount={archivedTrainees.length + archivedStaffList.length}
            onAddTrainee={() => setAddTraineeOpen(true)}
            onOpenArchived={() => setArchivedOpen(true)}
            onOpenLegacyLocks={() => setTestLocksOpen(true)}
            onSyncSchedules={handleSyncSchedulesOnly}
            onSyncTrainers={handleSyncTrainersOnly}
            onSyncTrainees={async () => {
              setToastSyncMessage({ text: 'Syncing trainees from Toast…', loading: true })
              const functions = getFunctions(app)
              const syncFn = httpsCallable(functions, 'manualTraineeSync')
              try {
                const result = await syncFn()
                const data = result?.data || {}
                setToastSyncMessage({ text: `Trainees synced: ${data.newTrainees ?? 0} new, ${data.updatedTrainees ?? 0} updated.` })
                await ensureTrainingDataFromFirestore()
                reloadTrainingData()
              } catch (err) {
                setToastSyncMessage({ error: err?.message || 'Trainee sync failed' })
              }
            }}
            onSyncManagers={handleSyncManagers}
            onSyncFromToast={handleSyncFromToast}
            onNavigateMenu={() => navigate('/menu-management')}
            onNavigateMenuStudio={() => navigate('/menu-studio')}
          />
          {toastSyncMessage && (
            <div
              className={`mb-4 rounded-lg border p-3 text-sm whitespace-pre-line flex items-center gap-2 ${toastSyncMessage.error ? 'border-red-200 bg-red-50 text-red-800' : toastSyncMessage.loading ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-green-200 bg-green-50 text-green-800'}`}
            >
              {toastSyncMessage.loading && (
                <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
              )}
              <span>{toastSyncMessage.error || toastSyncMessage.text}</span>
            </div>
          )}

          <AddTraineeModal
            open={addTraineeOpen}
            store={store}
            onAdd={(emp, name) => addTrainee(emp, name, store)}
            onClose={() => setAddTraineeOpen(false)}
          />

          {view === 'health' && (
            <ManagerHealthView store={store} isAdminOrOwner={isAdminOrOwner} />
          )}

          {view === 'uploadSchedule' && (
            <HotSchedulesUpload
              store={store}
              trainers={trainersWithMeta}
              locationGuid={getRestaurantGuid(store)}
              onComplete={() => {
                loadTrainersFromFirestoreForStore(store)
                setView('overview')
              }}
            />
          )}

          {view === 'overview' && (
            <>
              {/* Section 1: Stat Cards (4-card grid) */}
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <button type="button" className="text-left" onClick={() => document.getElementById('action-items-section')?.scrollIntoView({ behavior: 'smooth' })}>
                  <StatCard count={claimsCount} label="Pending claims" borderClass={claimsCount > 0 ? 'border-orange-400' : 'border-gray-200'} />
                </button>
                <button type="button" className="text-left" onClick={() => document.getElementById('action-items-section')?.scrollIntoView({ behavior: 'smooth' })}>
                  <StatCard count={signOffsCount} label="Sign-offs" borderClass={signOffsCount > 0 ? 'border-blue-400' : 'border-gray-200'} />
                </button>
                <button type="button" className="text-left" onClick={() => document.getElementById('action-items-section')?.scrollIntoView({ behavior: 'smooth' })}>
                  <StatCard count={testsToReview.length} label="Tests to review" borderClass={testsToReview.length > 0 ? 'border-purple-400' : 'border-gray-200'} />
                </button>
                <button type="button" className="text-left" onClick={() => document.getElementById('action-items-section')?.scrollIntoView({ behavior: 'smooth' })}>
                  <StatCard count={unassignedShifts.length} label="Unassigned shifts" borderClass={unassignedShifts.length > 0 ? 'border-red-400' : 'border-gray-200'} />
                </button>
              </div>

              {/* Section 2: Action Items — unified priority queue */}
              <section id="action-items-section" className="mb-8">
                <h3 className="mb-3 border-l-4 border-l-orange-500 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                  Action Items ({actionItemsCount})
                </h3>
                {actionItemsCount === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-10 text-center text-gray-600">
                    You're all caught up! No pending actions.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {/* Claims (orange) */}
                    {needsYouQueue.filter((q) => q.type === 'claim').map((item) => (
                      <li
                        key={`claim-${item.traineeId}-${item.shiftKey}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm border-l-4 border-l-orange-400"
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-800">{item.traineeName}</span>
                            <span className="inline-flex items-center rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">Pending Claim</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {item.icon ? <span className="mr-1">{item.icon}</span> : null}
                            {item.shiftLabel} · Trainer claim · {formatWhenHuman(item.when)}
                          </div>
                          {item.pendingTrainer && (
                            <div className="mt-0.5 text-xs text-gray-500">
                              Claimed by: {staffAccounts[item.pendingTrainer]?.name || `#${item.pendingTrainer}`}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="btn btn-small bg-red-600 text-white hover:bg-red-700 border-0" onClick={() => handleDenyClaim(item.traineeId, item.shiftKey)}>Deny</button>
                          <button type="button" className="btn btn-small bg-green-600 text-white hover:bg-green-700 border-0" onClick={() => handleApproveClaim(item.traineeId, item.shiftKey)}>Approve</button>
                          <button type="button" className="btn btn-small btn-secondary" onClick={() => setViewTraineeDetailId(item.traineeId)}>View</button>
                        </div>
                      </li>
                    ))}
                    {/* Sign-offs (blue) */}
                    {needsYouQueue.filter((q) => q.type === 'sign').map((item) => (
                      <li
                        key={`sign-${item.traineeId}-${item.shiftKey}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm border-l-4 border-l-blue-400"
                      >
                        <div>
                          <span className="font-bold text-gray-800">{item.traineeName}</span>
                          <div className="text-sm text-gray-600">
                            {item.icon ? <span className="mr-1">{item.icon}</span> : null}
                            {item.shiftLabel} · Sign-off needed · {formatWhenHuman(item.when)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="btn btn-small" onClick={() => setAssessSignRow(item)}>Sign off</button>
                          <button type="button" className="btn btn-small btn-secondary" onClick={() => setViewTraineeDetailId(item.traineeId)}>View</button>
                        </div>
                      </li>
                    ))}
                    {/* Unassigned shifts (red) */}
                    {unassignedShifts.map((r) => (
                      <li
                        key={`unassigned-${r.traineeId}-${r.shiftKey}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm border-l-4 border-l-red-400"
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-800">{r.traineeName}</span>
                            <span className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Unassigned</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {r.icon ? <span className="mr-1">{r.icon}</span> : null}
                            {r.shiftLabel} · {formatWhenHuman(r.when)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="btn btn-small" onClick={() => setScheduleTraineeId(r.traineeId)}>Assign</button>
                          <button type="button" className="btn btn-small btn-secondary" onClick={() => setViewTraineeDetailId(r.traineeId)}>View</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Section 3: Today's Floor */}
              {todaysFloor.length > 0 && (
                <section className="mb-8">
                  <h3 className="mb-3 border-l-4 border-l-green-500 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                    Today's Floor ({todaysFloor.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {todaysFloor.map((r) => {
                      const time = new Date(r.when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      const signed = !r.unsigned && !r.missingTrainer
                      return (
                        <button
                          key={`floor-${r.traineeId}-${r.shiftKey}`}
                          type="button"
                          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm text-left hover:border-[var(--color-primary)] transition-colors"
                          onClick={() => setViewTraineeDetailId(r.traineeId)}
                        >
                          <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${signed ? 'bg-green-500' : r.missingTrainer ? 'bg-red-400' : 'bg-amber-400'}`} />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-800 truncate">{r.traineeName}</div>
                            <div className="text-xs text-gray-500 truncate">
                              {r.icon && <span className="mr-1">{r.icon}</span>}{r.shiftLabel} · {time}
                              {r.trainerName ? ` · ${r.trainerName}` : ''}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Section 4: Failed Tests (FYI — no action required) */}
              {testsToReview.length > 0 && (
                <section className="mb-8">
                  <h3 className="mb-3 border-l-4 border-l-purple-400 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                    Failed Tests ({testsToReview.length}) <span className="normal-case font-normal text-gray-400">— FYI only, no action required</span>
                  </h3>
                  <ul className="space-y-2">
                    {testsToReview.map((item) => (
                      <li
                        key={`test-${item.traineeId}-${item.testId}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm border-l-4 border-l-purple-400"
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-800">{item.traineeName}</span>
                            <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${item.exhausted ? 'bg-red-100 text-red-800' : 'bg-purple-100 text-purple-800'}`}>
                              {item.exhausted ? 'Locked out' : 'Failed test'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {item.testTitle} · {item.count}/{item.maxAttempts} attempts{item.scores.length ? ` · Last: ${item.scores[item.scores.length - 1]}%` : ''}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="btn btn-small btn-secondary" onClick={() => { setReviewTraineeId(item.traineeId); setReviewTestId(item.testId) }}>Review test</button>
                          <button type="button" className="btn btn-small btn-secondary" onClick={() => setViewTraineeDetailId(item.traineeId)}>View trainee</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Section 5: Heads Up — proactive alerts */}
              {headsUpAlerts.length > 0 && (
                <section className="mb-8">
                  <h3 className="mb-3 border-l-4 border-l-amber-500 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                    Heads Up
                  </h3>
                  <div className="space-y-2">
                    {headsUpAlerts.map((alert, i) => {
                      const colorMap = {
                        red: 'border-l-red-500 bg-red-50',
                        amber: 'border-l-amber-500 bg-amber-50',
                        green: 'border-l-green-500 bg-green-50',
                      }
                      const emojiMap = {
                        stall: '\u26a0\ufe0f',
                        failed: '\ud83d\udea8',
                        near: '\ud83c\udf1f',
                        topTrainer: '\u2b50',
                      }
                      return (
                        <div
                          key={`alert-${i}`}
                          className={`rounded-lg border border-l-4 p-3 text-sm ${colorMap[alert.color] || 'bg-gray-50 border-l-gray-400'}`}
                        >
                          <span className="mr-1">{emojiMap[alert.type] || ''}</span>
                          <span className="font-semibold text-gray-800">{alert.name}</span>
                          <span className="text-gray-600 ml-1">— {alert.detail}</span>
                          {alert.traineeId && (
                            <button
                              type="button"
                              className="ml-2 text-xs text-blue-600 hover:underline"
                              onClick={() => setViewTraineeDetailId(alert.traineeId)}
                            >
                              View
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Section 5: Store Pulse (existing store summary) */}
              <div className="rounded-2xl border-2 border-[var(--color-primary)] bg-gradient-to-br from-green-50 to-white shadow-sm overflow-hidden p-5 mb-8">
                <h3 className="text-lg font-bold text-gray-800 mb-3">{getStoreDisplayName(store)}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                  <div>
                    <div className="text-2xl font-bold text-gray-800">{storeStats.trainees}</div>
                    <div className="text-gray-500 text-xs">Trainees</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-700">{storeStats.certified}</div>
                    <div className="text-gray-500 text-xs">Certified</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-800">{storeStats.trainers}</div>
                    <div className="text-gray-500 text-xs">Trainers</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-800">{storeStats.managers}</div>
                    <div className="text-gray-500 text-xs">Managers</div>
                  </div>
                </div>
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Avg certification progress</span>
                    <span>{storeStats.avgProgress}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                      style={{ width: `${storeStats.avgProgress}%` }}
                    />
                  </div>
                </div>
                {(storeStats.pendingClaims > 0 || storeStats.awaitingSignOff > 0) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {storeStats.pendingClaims > 0 && (
                      <span className="inline-block rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-medium">
                        {storeStats.pendingClaims} pending claim{storeStats.pendingClaims !== 1 ? 's' : ''}
                      </span>
                    )}
                    {storeStats.awaitingSignOff > 0 && (
                      <span className="inline-block rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 text-xs font-medium">
                        {storeStats.awaitingSignOff} awaiting sign-off
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Section 6: This Week's Schedule — card rows */}
              <section className="mb-8">
                <h3 className="mb-3 border-l-4 border-l-blue-500 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                  This Week's Schedule
                </h3>
                {thisWeekSchedule.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-10 text-center text-gray-600">
                    No shifts scheduled this week.
                  </div>
                ) : (
                  (() => {
                    const grouped = {}
                    thisWeekSchedule.forEach((r) => {
                      const d = new Date(r.when)
                      const key = d.toISOString().slice(0, 10)
                      if (!grouped[key]) grouped[key] = { date: d, rows: [] }
                      grouped[key].rows.push(r)
                    })
                    const days = Object.keys(grouped).sort()
                    const today = new Date()
                    return (
                      <div className="space-y-4">
                        {days.map((dayKey) => {
                          const { date, rows } = grouped[dayKey]
                          const isToday = isSameCalendarDay(date, today)
                          const dayLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                          return (
                            <div key={dayKey}>
                              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                                {isToday ? `Today \u2014 ${dayLabel}` : dayLabel}
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {rows.map((r) => {
                                  const time = new Date(r.when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                                  const signed = !r.unsigned && !r.missingTrainer
                                  const borderColor = signed ? 'border-l-green-500' : r.missingTrainer ? 'border-l-red-400' : 'border-l-amber-400'
                                  return (
                                    <button
                                      key={`${r.traineeId}-${r.shiftKey}`}
                                      type="button"
                                      className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm shadow-sm border-l-4 ${borderColor} hover:border-[var(--color-primary)] transition-colors`}
                                      onClick={() => setViewTraineeDetailId(r.traineeId)}
                                    >
                                      {r.icon && <span>{r.icon}</span>}
                                      <span className="font-medium text-gray-800">{r.shiftLabel}</span>
                                      <span className="text-gray-400">&mdash;</span>
                                      <span className="text-gray-700">{r.traineeName}</span>
                                      <span className="text-gray-400">&mdash;</span>
                                      <span className="text-gray-500">{time}</span>
                                      {r.trainerName && (
                                        <>
                                          <span className="text-gray-400">&mdash;</span>
                                          <span className="text-gray-500">{r.trainerName}</span>
                                        </>
                                      )}
                                      <span className={`inline-block h-2 w-2 rounded-full ml-1 ${signed ? 'bg-green-500' : r.missingTrainer ? 'bg-red-400' : 'bg-amber-400'}`} />
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                )}
              </section>
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
                  allTrainingData={trainingData}
                  traineeHsSchedule={trainingData[scheduleTraineeId]?.hsSchedule || []}
                  onSave={handleSaveSchedule}
                />
              )}
            </div>
          )}

          {view === 'teamSchedules' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-bold text-gray-800">Team Schedules</h3>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={allSchedulesLoading}
                  onClick={loadAllSchedules}
                >
                  {allSchedulesLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
              {allSchedulesError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-red-800 text-sm">
                  {allSchedulesError}
                </div>
              )}
              {allSchedulesData && (
                <>
                  {['Westfield', 'Castleton'].map((storeName) => {
                    const people = allSchedulesData.schedules?.[storeName] || []
                    return (
                      <section key={storeName} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                        <h4 className="border-b border-gray-200 bg-gray-50 px-4 py-2 font-bold text-gray-800">
                          {getStoreDisplayName(storeName)} ({people.length} with schedules)
                        </h4>
                        {people.length === 0 ? (
                          <p className="px-4 py-3 text-gray-500 text-sm">No schedules synced yet. Use Sync dropdown → Sync Schedules.</p>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {people.map((person) => {
                              const shifts = Array.isArray(person.schedule) ? person.schedule : Object.values(person.schedule || {})
                              const sorted = [...shifts].sort((a, b) => (a.date || a.inTime || '').localeCompare(b.date || b.inTime || ''))
                              return (
                                <div key={person.id || person.employeeNumber} className="px-4 py-3">
                                  <div className="font-semibold text-gray-800">
                                    {person.name || 'Unknown'}
                                    {person.employeeNumber && <span className="ml-1 text-gray-500 font-normal">#{person.employeeNumber}</span>}
                                    {person.role && <span className="ml-2 text-xs text-gray-500">({person.role})</span>}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {sorted.slice(0, 14).map((shift, i) => {
                                      const date = shift.date || '—'
                                      const inTime = shift.inTime ? (typeof shift.inTime === 'string' && shift.inTime.includes('T') ? new Date(shift.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : shift.inTime) : '?'
                                      const outTime = shift.outTime ? (typeof shift.outTime === 'string' && shift.outTime.includes('T') ? new Date(shift.outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : shift.outTime) : '?'
                                      const job = shift.jobName || ''
                                      return (
                                        <span key={i} className="text-xs bg-gray-100 rounded px-2 py-0.5">
                                          {date} {inTime}–{outTime}{job ? ` · ${job}` : ''}
                                        </span>
                                      )
                                    })}
                                    {sorted.length > 14 && <span className="text-xs text-gray-500">+{sorted.length - 14} more</span>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </section>
                    )
                  })}
                  {allSchedulesData.unmatched?.length > 0 && (
                    <section className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                      <h4 className="border-b border-amber-200 px-4 py-2 font-bold text-amber-900">
                        Unmatched ({allSchedulesData.unmatched.length})
                      </h4>
                      <p className="px-4 py-2 text-sm text-amber-800">These Toast employees have shifts but could not be matched to trainees/users.</p>
                      <ul className="px-4 pb-3 list-disc list-inside text-sm text-amber-800">
                        {allSchedulesData.unmatched.map((u) => (
                          <li key={u.toastGuid}>
                            {u.toastGuid?.substring(0, 8)}… ({getStoreDisplayName(u.store)}) — {u.shiftCount} shifts
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {view === 'testIntegrity' && (
            <div className="space-y-6">
              <TestLockManager />
            </div>
          )}
          {view === 'trainers' && (
            <>
              <h3 className="text-lg font-bold text-orange-600 border-b-2 border-orange-500 pb-2 mb-4">
                Trainers ({trainersWithMeta.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {trainersWithMeta.map((t) => (
                  <TrainerCard
                    key={t.empNum}
                    trainer={t}
                    onClick={(trainer) => setSelectedTrainerForSchedule(trainer)}
                    onFeedback={(empNum) => setSelectedTrainerForRating(trainersWithMeta.find((x) => x.empNum === empNum))}
                    onArchive={(empNum) => archiveStaff(empNum)}
                  />
                ))}
              </div>
            </>
          )}
          {view === 'trainees' && (
            <>
              <div className="mb-4">
                <input
                  type="search"
                  placeholder="Search by name or #"
                  className="rounded border border-gray-300 px-3 py-2 text-sm max-w-xs"
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                />
              </div>
              <h3 className="text-lg font-bold text-blue-600 border-b-2 border-blue-500 pb-2 mb-4">
                Trainees ({filteredTrainees.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {trainingDataLoading ? (
                  Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
                ) : traineesWithNeedsYou.map((t) => (
                  <TraineeCard
                    key={t.id}
                    trainee={t}
                    trainingData={trainingData}
                    testAttempts={allTraineeTestResults}
                    variant="mint"
                    needsYouLabel={t.needsYouLabel}
                    readiness={t.readiness}
                    onEditSchedule={() => setScheduleTraineeId(t.id)}
                    onAssess={(id) => setAssessTraineeId(id)}
                    onInsight={(id) => setAiAssessTraineeId(id)}
                    onArchive={() => setRemoveTraineeId(t.id)}
                    onResetAttempts={(id) => { setResetAttemptsTraineeId(id); setResetAttemptsTestId('all') }}
                    onReviewTest={(id) => setViewTraineeDetailId(id)}
                    onPrintSummary={(id) => setPrintSummaryTraineeId(id)}
                    onEditTrainee={(id) => setEditTraineeId(id)}
                    onAddNote={(id) => setNoteTraineeId(id)}
                    onVerbalCert={(id) => navigate(`/verbal-cert/${id}`)}
                    onViewDetails={(id) => setViewTraineeDetailId(id)}
                  />
                ))}
              </div>
            </>
          )}
          {view.startsWith('analytics:') && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">Analytics</h2>
              <p className="text-gray-600 text-sm mb-4">{getStoreDisplayName(store)}</p>
              <div className="flex gap-1 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'trainees', label: 'Trainees' },
                  { id: 'trainers', label: 'Trainers' },
                  { id: 'managers', label: 'Managers' },
                  { id: 'tests', label: 'Tests & Quizzes' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setAnalyticsTab(tab.id); setView(`analytics:${tab.id}`) }}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                      analyticsTab === tab.id
                        ? 'bg-[var(--color-primary)] text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {analyticsLoading && (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-gray-200 border-t-[var(--color-primary)] rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Loading analytics data...</p>
                  </div>
                </div>
              )}
              {!analyticsLoading && analyticsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
                  {analyticsError}
                  <button
                    type="button"
                    className="ml-3 underline text-red-700"
                    onClick={() => { setAnalyticsError(null); analyticsLoadingRef.current = false; setAnalyticsData(null) }}
                  >
                    Retry
                  </button>
                </div>
              )}
              {!analyticsLoading && analyticsTab === 'overview' && (
                <ManagerAnalyticsOverview trainees={trainees} trainingData={trainingData} store={store} staffAccounts={staffAccounts} />
              )}
              {!analyticsLoading && analyticsTab === 'trainees' && (
                <TraineeAnalytics trainingData={trainingData} storeFilter={store} sessionData={analyticsData?.sessions} quizAttempts={analyticsData?.quizzes} />
              )}
              {!analyticsLoading && analyticsTab === 'trainers' && (
                <TrainerAnalytics trainingData={trainingData} staffAccounts={staffAccounts} storeFilter={store} />
              )}
              {!analyticsLoading && analyticsTab === 'managers' && (
                <ManagerAnalytics trainingData={trainingData} staffAccounts={staffAccounts} storeFilter={store} />
              )}
              {!analyticsLoading && analyticsTab === 'tests' && analyticsData && (
                <TestQuizAnalytics quizAttempts={analyticsData.quizzes} trainingData={trainingData} storeFilter={store} />
              )}
            </div>
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
        testAttempts={allTraineeTestResults}
        onClose={() => setAiAssessTraineeId(null)}
      />

      {viewTraineeDetailId && (
        <ManagerTraineeDetailView
          traineeId={viewTraineeDetailId}
          trainee={trainingData[viewTraineeDetailId] ? { id: viewTraineeDetailId, ...trainingData[viewTraineeDetailId] } : null}
          trainingData={trainingData}
          staffAccounts={staffAccounts}
          testAttempts={allTraineeTestResults}
          onClose={() => setViewTraineeDetailId(null)}
          onReviewTest={(tid, testId) => { setReviewTraineeId(tid); setReviewTestId(testId) }}
        />
      )}

      {reviewTraineeId && reviewTestId && (
        <TestReviewModal
          traineeId={reviewTraineeId}
          testId={reviewTestId}
          traineeName={trainingData[reviewTraineeId]?.name || trainees.find((t) => t.id === reviewTraineeId)?.name}
          onClose={() => { setReviewTraineeId(null); setReviewTestId(null) }}
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
        // Only show tests that have been attempted (count > 0)
        const attemptedIds = resetAttemptsResults
          ? officialIds.filter((id) => resetAttemptsResults[id]?.count > 0)
          : []
        const hasAttemptedTests = attemptedIds.length > 0
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !resetAttemptsSubmitting && setResetAttemptsTraineeId(null)}>
            <div className="rounded-xl bg-white p-6 shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Reset test attempts</h3>
              <p className="text-sm text-gray-600 mb-4">
                For <strong>{trainee?.name || resetAttemptsTraineeId}</strong>. This grants 1 additional retake per test.
              </p>
              {!resetAttemptsResults ? (
                <p className="text-sm text-gray-500 mb-4">Loading test data...</p>
              ) : !hasAttemptedTests ? (
                <p className="text-sm text-gray-500 mb-4">No test attempts found for this trainee.</p>
              ) : (
                <>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test</label>
                  <select
                    className="w-full rounded border border-gray-300 px-3 py-2 mb-2"
                    value={resetAttemptsTestId}
                    onChange={(e) => setResetAttemptsTestId(e.target.value)}
                  >
                    {attemptedIds.length > 1 && <option value="all">All attempted tests</option>}
                    {attemptedIds.map((id) => {
                      const r = resetAttemptsResults[id]
                      const title = TESTS.find((t) => t.id === id)?.title || id
                      return (
                        <option key={id} value={id}>
                          {title} ({r.count}/2 attempts{r.passed ? ', passed' : ''})
                        </option>
                      )
                    })}
                  </select>
                  <p className="text-xs text-gray-500 mb-4">
                    Resets attempt count to 1, giving trainee 1 more try.
                  </p>
                </>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn btn-small" onClick={() => setResetAttemptsTraineeId(null)} disabled={resetAttemptsSubmitting}>Cancel</button>
                {hasAttemptedTests && (
                  <button
                    type="button"
                    className="btn btn-small bg-amber-600 text-white hover:bg-amber-700"
                    disabled={resetAttemptsSubmitting}
                    onClick={async () => {
                      setResetAttemptsSubmitting(true)
                      const ok = await requestTestAttemptReset(resetAttemptsTraineeId, resetAttemptsTestId, empNum)
                      setResetAttemptsSubmitting(false)
                      if (ok) {
                        // Refresh the test results cache — bump maxAttempts
                        setAllTraineeTestResults((prev) => {
                          const next = { ...prev }
                          const idsToReset = resetAttemptsTestId === 'all' ? attemptedIds : [resetAttemptsTestId]
                          for (const tid of idsToReset) {
                            const key = `${resetAttemptsTraineeId}_${tid}`
                            if (next[key]) {
                              const count = next[key].count || 0
                              const curMax = next[key].maxAttempts || 2
                              next[key] = { ...next[key], maxAttempts: Math.max(curMax, count) + 1, passed: false }
                            }
                          }
                          return next
                        })
                        setResetAttemptsTraineeId(null)
                      }
                    }}
                  >
                    {resetAttemptsSubmitting ? 'Resetting…' : 'Reset'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Schedule editor modal (from Overview/Team "Edit Schedule" on card) */}
      {scheduleTraineeId && view !== 'schedule' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-[scheduleModalFadeIn_0.25s_ease-out]"
          onClick={() => setScheduleTraineeId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-[scheduleModalScaleIn_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-[#1F4D1C] to-[#2d6b28] px-6 py-4 text-white">
              <h3 className="text-lg font-bold">
                Edit schedule · {trainingData[scheduleTraineeId]?.name || scheduleTraineeId}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="min-h-[44px] rounded-lg bg-white/20 px-4 font-medium hover:bg-white/30"
                  onClick={() => {
                    scheduleEditorSaveRef.current?.saveAndClose?.()
                  }}
                >
                  Save &amp; Close
                </button>
                <button
                  type="button"
                  className="min-h-[44px] rounded-lg px-3 text-sm text-white/80 hover:text-white underline"
                  onClick={() => setScheduleTraineeId(null)}
                >
                  Cancel without saving
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <ScheduleEditor
                ref={scheduleEditorSaveRef}
                traineeId={scheduleTraineeId}
                schedule={trainingData[scheduleTraineeId]?.schedule || {}}
                trainers={trainers}
                managers={managers}
                allTrainingData={trainingData}
                traineeHsSchedule={trainingData[scheduleTraineeId]?.hsSchedule || []}
                onSave={(tid, schedule) => {
                  handleSaveSchedule(tid, schedule)
                  setScheduleTraineeId(null)
                }}
                onSaveAndCloseRequest={() => setScheduleTraineeId(null)}
              />
            </div>
          </div>
        </div>
      )}

      {selectedTrainerForRating && (
        <TrainerRatingBreakdownModal
          trainer={{
            uid: selectedTrainerForRating.toastGuid || selectedTrainerForRating.empNum,
            name: selectedTrainerForRating.name || `Trainer #${selectedTrainerForRating.empNum}`,
          }}
          onClose={() => setSelectedTrainerForRating(null)}
        />
      )}

      {selectedTrainerForSchedule && (
        <TrainerScheduleModal
          trainer={selectedTrainerForSchedule}
          onClose={() => setSelectedTrainerForSchedule(null)}
        />
      )}

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
                                  await deleteActiveTestSession(lock.traineeId)
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
        trainingData={trainingData}
        onRestoreTrainee={(id) => { restoreTrainee(id); setArchivedOpen(false) }}
        onRestoreStaff={handleRestoreStaff}
      />

      {/* Remove trainee choice modal: Archive or Terminate */}
      {removeTraineeId && (() => {
        const t = trainingData[removeTraineeId]
        const name = t?.name || removeTraineeId
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRemoveTraineeId(null)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Remove {name}</h3>
              <p className="text-sm text-gray-600 mb-5">What would you like to do with this trainee?</p>
              <div className="space-y-3">
                <button
                  type="button"
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-left hover:border-gray-400 transition-colors"
                  onClick={() => { archiveTrainee(removeTraineeId); setRemoveTraineeId(null) }}
                >
                  <div className="font-bold text-gray-800">Archive</div>
                  <div className="text-xs text-gray-500">Temporarily remove from active list. Can restore later.</div>
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl border-2 border-red-200 px-4 py-3 text-left hover:border-red-400 bg-red-50 transition-colors"
                  onClick={() => { setTerminateTraineeId(removeTraineeId); setRemoveTraineeId(null) }}
                >
                  <div className="font-bold text-red-700">Terminate</div>
                  <div className="text-xs text-red-600">Record termination reason and training snapshot.</div>
                </button>
              </div>
              <button type="button" className="btn w-full mt-4" onClick={() => setRemoveTraineeId(null)}>Cancel</button>
            </div>
          </div>
        )
      })()}

      <TerminateTraineeModal
        open={!!terminateTraineeId}
        trainee={terminateTraineeId ? { id: terminateTraineeId, ...(trainingData[terminateTraineeId] || {}) } : null}
        trainingData={trainingData}
        onTerminate={(id, reason, note, snapshot) => {
          terminateTrainee(id, reason, note, snapshot, empNum)
          setTerminateTraineeId(null)
        }}
        onClose={() => setTerminateTraineeId(null)}
      />
    </>
  )
}
