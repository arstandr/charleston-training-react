import { useState, useEffect, useMemo, useCallback } from 'react'
import AppHeader from '../components/AppHeader'
import ShiftDetailView from '../components/ShiftDetailView'
import TrainerSignoffModal from '../components/TrainerSignoffModal'
import TrainerShiftRow from '../components/TrainerShiftRow'
import TestReviewModal from '../components/TestReviewModal'
import { useAuth } from '../contexts/AuthContext'
import { useTrainingData } from '../hooks/useTrainingData'
import { useStaffAccounts } from '../hooks/useStaffAccounts'
import { useTrainers } from '../hooks/useTrainers'
import {
  getTrainerAssignedShifts,
  getCoverageShifts,
  getPendingClaimsForTrainer,
  claimShift,
  signShiftAsTrainer,
  formatWhenHuman,
  shiftRequiredTestsPassed,
  isRequiredChecklistComplete,
  isSameCalendarDay,
  getTrainerEffectiveness,
  loadTestAttemptsFromStorage,
  getRecentTestAttemptsForTrainer,
  getTraineeHealthSummary,
} from '../utils/helpers'
import { SHIFT_META } from '../constants'
import { PRETTY_TEST_NAMES, TESTS } from '../data/quizDatabase'
import { listTrainees } from '../hooks/useTrainingData'
import TrainerHealthView from '../components/TrainerHealthView'
import { loadTestResults } from '../services/quizAttemptsService'

const TRAINER_TODAY_ONLY_KEY = 'trainerTodayOnly'
const BROWSE_PAGE_SIZE = 30

export default function TrainerDashboard() {
  const { currentUser } = useAuth()
  const { trainingData, setTrainingData, saveTrainingData, listTrainees: listTraineesFn } = useTrainingData()
  const { staffAccounts } = useStaffAccounts()
  const { trainers, loadTrainersFromFirestoreForStore, lastSync } = useTrainers(currentUser?.store)

  const [detailShift, setDetailShift] = useState(null)
  const [signoffRow, setSignoffRow] = useState(null)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [todayOnly, setTodayOnly] = useState(() => {
    try {
      return localStorage.getItem(TRAINER_TODAY_ONLY_KEY) === 'true'
    } catch (_) {
      return false
    }
  })
  const [browsePage, setBrowsePage] = useState(1)
  const [viewResultAttempt, setViewResultAttempt] = useState(null)
  const [healthView, setHealthView] = useState(false)
  const [signoffConfirm, setSignoffConfirm] = useState(null)

  const store = currentUser?.store || 'Westfield'
  const empNum = currentUser?.empNum

  useEffect(() => {
    if (store) loadTrainersFromFirestoreForStore(store)
  }, [store, loadTrainersFromFirestoreForStore])

  const toggleTodayOnly = () => {
    const next = !todayOnly
    setTodayOnly(next)
    try {
      localStorage.setItem(TRAINER_TODAY_ONLY_KEY, String(next))
    } catch (_) {}
  }

  // Load test results from Firestore so trainer sees trainee test data (not just own localStorage)
  const [testAttempts, setTestAttempts] = useState(() => loadTestAttemptsFromStorage())
  const assignedTraineeIds = useMemo(() => {
    const shifts = getTrainerAssignedShifts(trainingData, empNum, store)
    return [...new Set(shifts.map((r) => r.traineeId))]
  }, [trainingData, empNum, store])

  useEffect(() => {
    if (!assignedTraineeIds.length) return
    let cancelled = false
    Promise.all(
      assignedTraineeIds.map((tid) =>
        loadTestResults(tid).then((results) => ({ tid, results }))
      )
    ).then((all) => {
      if (cancelled) return
      const merged = {}
      for (const { tid, results } of all) {
        for (const [testId, data] of Object.entries(results)) {
          merged[`${tid}_${testId}`] = data
        }
      }
      // Also merge any localStorage data as fallback
      const local = loadTestAttemptsFromStorage()
      setTestAttempts({ ...local, ...merged })
    })
    return () => { cancelled = true }
  }, [assignedTraineeIds])

  const assignedShifts = useMemo(
    () => getTrainerAssignedShifts(trainingData, empNum, store, testAttempts),
    [trainingData, empNum, store, testAttempts]
  )
  const filteredAssigned = useMemo(
    () => (todayOnly ? assignedShifts.filter((r) => isSameCalendarDay(r.when)) : assignedShifts),
    [assignedShifts, todayOnly]
  )
  const coverageShiftsRaw = useMemo(
    () => getCoverageShifts(trainingData, store, { includePending: true }),
    [trainingData, store]
  )
  const coverageShifts = useMemo(
    () => (todayOnly ? coverageShiftsRaw.filter((r) => isSameCalendarDay(r.when)) : coverageShiftsRaw),
    [coverageShiftsRaw, todayOnly]
  )
  const pendingClaims = getPendingClaimsForTrainer(trainingData, empNum)
  const allTrainees = listTraineesFn({ store, includeArchived: false })

  const effectiveness = useMemo(
    () => getTrainerEffectiveness(trainingData, empNum, store, testAttempts),
    [trainingData, empNum, store, testAttempts]
  )
  const recentTestAttempts = useMemo(
    () => getRecentTestAttemptsForTrainer(trainingData, empNum, store, 15, testAttempts),
    [trainingData, empNum, store, testAttempts]
  )

  const toSignCount = useMemo(() => assignedShifts.filter((r) => !r.trainerSigned).length, [assignedShifts])
  const needsYouChips = useMemo(
    () => ({
      toSign: toSignCount,
      pending: pendingClaims.length,
      newResults: recentTestAttempts.length,
    }),
    [toSignCount, pendingClaims.length, recentTestAttempts.length]
  )

  // Always show the next upcoming shift regardless of today-only filter
  const focusRow = assignedShifts[0] || null
  const focusHealth = focusRow ? getTraineeHealthSummary(focusRow.traineeId, trainingData?.[focusRow.traineeId], testAttempts) : null

  const browseTraineesWithMeta = useMemo(() => {
    return allTrainees.map((t) => {
      const rec = trainingData?.[t.id]
      const schedule = rec?.schedule || {}
      const withWhen = Object.entries(schedule)
        .filter(([, item]) => item?.when)
        .sort((a, b) => (a[1].when || '').localeCompare(b[1].when || ''))
      const nextShift = withWhen[0]
        ? {
            shiftKey: withWhen[0][0],
            when: withWhen[0][1].when,
            label: (SHIFT_META && SHIFT_META[withWhen[0][0]]?.label) || withWhen[0][0],
          }
        : null
      const hasAttempts = testAttempts && Object.keys(testAttempts).some((k) => k.startsWith(t.id + '_'))
      return { ...t, nextShift, hasNewTestResult: !!hasAttempts }
    })
  }, [allTrainees, trainingData, testAttempts])

  const browsePaginated = useMemo(
    () => browseTraineesWithMeta.slice(0, browsePage * BROWSE_PAGE_SIZE),
    [browseTraineesWithMeta, browsePage]
  )
  const hasMoreBrowse = browsePaginated.length < browseTraineesWithMeta.length

  const healthByTrainee = useMemo(() => {
    const m = {}
    filteredAssigned.forEach((r) => {
      m[r.traineeId] = getTraineeHealthSummary(r.traineeId, trainingData?.[r.traineeId], testAttempts)
    })
    return m
  }, [filteredAssigned, trainingData, testAttempts])

  const OFFICIAL_TEST_IDS = TESTS.filter((t) => t.id !== 'bonus_test').map((t) => t.id)

  const handleToggleReadyToTest = (tid, testId, value) => {
    const next = {
      ...trainingData,
      [tid]: {
        ...trainingData[tid],
        readyToTest: {
          ...(trainingData[tid]?.readyToTest || {}),
          [testId]: value,
        },
      },
    }
    setTrainingData(next)
    saveTrainingData(next)
  }

  const handleClaim = (row) => {
    const next = claimShift(trainingData, row.traineeId, row.shiftKey, empNum)
    setTrainingData(next)
    saveTrainingData(next)
  }

  const handleSaveSignoff = (feedback) => {
    if (!signoffRow) return
    const next = signShiftAsTrainer(
      trainingData,
      signoffRow.traineeId,
      signoffRow.shiftKey,
      empNum,
      feedback
    )
    setTrainingData(next)
    saveTrainingData(next)
    setSignoffConfirm(`Signed off on ${signoffRow.traineeName} · ${signoffRow.shiftLabel}`)
    setTimeout(() => setSignoffConfirm(null), 4000)
    setSignoffRow(null)
  }

  const handleOpenDetail = (row) => {
    if (!trainingData?.[row.traineeId]) return
    setDetailShift({ traineeId: row.traineeId, shiftKey: row.shiftKey })
  }

  if (!empNum || !currentUser) {
    return (
      <>
        <AppHeader />
        <div className="content-area container max-w-4xl mx-auto">
          <p className="text-gray-600">You are not logged in as a trainer.</p>
        </div>
      </>
    )
  }

  if (detailShift) {
    const { traineeId, shiftKey } = detailShift
    const rec = trainingData?.[traineeId]
    if (!rec) {
      setDetailShift(null)
      return null
    }
    const item = rec?.schedule?.[shiftKey] || {}
    const testsOk = shiftRequiredTestsPassed(rec, shiftKey, traineeId, testAttempts)
    const detailCanSignOff =
      testsOk && !item.trainerSignedAt && String(item.trainer) === String(empNum)

    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl p-4">
          <ShiftDetailView
            shiftKey={shiftKey}
            rec={rec}
            traineeId={traineeId}
            staffAccounts={staffAccounts}
            onBack={() => setDetailShift(null)}
            canSignOff={detailCanSignOff}
            canEditChecklist={String(item.trainer) === String(empNum)}
            currentUserEmpNum={empNum}
            trainingData={trainingData}
            setTrainingData={setTrainingData}
            saveTrainingData={saveTrainingData}
            showAuditButton={['admin','manager','owner'].includes((currentUser?.role || '').toLowerCase())}
            onRateSignOff={
              detailCanSignOff
                ? () =>
                    setSignoffRow({
                      traineeId,
                      shiftKey,
                      traineeName: rec?.name || `Trainee ${traineeId}`,
                      shiftLabel: (SHIFT_META && SHIFT_META[shiftKey]?.label) || shiftKey,
                      testsStatus: 'passed',
                      checklistComplete: isRequiredChecklistComplete(rec, shiftKey),
                      trainerSigned: false,
                      failedTestTitles: [],
                    })
                : undefined
            }
          />
        </div>
      {signoffConfirm && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-green-700 px-6 py-3 text-white font-medium shadow-lg text-sm">
          ✓ {signoffConfirm}
        </div>
      )}
      {signoffRow && (
        <TrainerSignoffModal
          open
          traineeId={signoffRow.traineeId}
          traineeName={signoffRow.traineeName}
          shiftKey={signoffRow.shiftKey}
          shiftLabel={signoffRow.shiftLabel}
          canSignOff={signoffRow.testsStatus === 'passed' && !signoffRow.trainerSigned}
          failedTestTitles={signoffRow.failedTestTitles || []}
          onSave={handleSaveSignoff}
          onClose={() => setSignoffRow(null)}
        />
      )}
      </>
    )
  }

  const trainerUid = currentUser?.uid || currentUser?.id

  if (healthView) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 pb-8">
          <div className="content-area">
            <button
              type="button"
              className="mb-4 text-sm text-[var(--color-primary)] hover:underline"
              onClick={() => setHealthView(false)}
            >
              ← Back to dashboard
            </button>
            <TrainerHealthView
              trainerUid={trainerUid}
              empNum={empNum}
              trainingData={trainingData}
              store={store}
              staffAccounts={staffAccounts}
            />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <AppHeader />
      <div className="container mx-auto max-w-4xl px-4 pb-8">
        <div className="content-area">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="mb-2 text-xl font-bold text-gray-800">Trainer Dashboard</h2>
              <p className="text-sm text-gray-600">{store}</p>
            </div>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setHealthView(true)}
            >
              Health
            </button>
          </div>

          {/* Needs you / summary chips */}
          <div className="mb-4 flex flex-wrap gap-2">
            {needsYouChips.toSign > 0 && (
              <button
                type="button"
                onClick={() => document.getElementById('assigned-shifts')?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 cursor-pointer hover:bg-amber-200 transition-colors"
              >
                {needsYouChips.toSign} to sign
              </button>
            )}
            {needsYouChips.pending > 0 && (
              <button
                type="button"
                onClick={() => document.getElementById('pending-claims')?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 cursor-pointer hover:bg-blue-200 transition-colors"
              >
                {needsYouChips.pending} pending approval
              </button>
            )}
            {needsYouChips.newResults > 0 && (
              <button
                type="button"
                onClick={() => document.getElementById('recent-tests')?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 cursor-pointer hover:bg-green-200 transition-colors"
              >
                {needsYouChips.newResults} test result(s)
              </button>
            )}
          </div>

          {/* Trainer sync status (optional) */}
          {(trainers.length > 0 || lastSync) && (
            <p className="mb-4 text-xs text-gray-500">
              {trainers.length > 0 && <span>{trainers.length} active {trainers.length === 1 ? 'trainer' : 'trainers'} at this store</span>}
              {lastSync && (
                <span>
                  {trainers.length > 0 ? ' · ' : ''}
                  Last sync: {formatWhenHuman(lastSync)}
                </span>
              )}
            </p>
          )}

          {/* Today only / Show all filter */}
          <div className="mb-4">
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              onClick={toggleTodayOnly}
            >
              {todayOnly ? 'Show all' : 'Show today only'}
            </button>
          </div>

          {/* Training Effectiveness */}
          <section className="mb-6 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
              Training effectiveness
            </h3>
            <div className="flex items-baseline gap-4">
              <span className="text-3xl font-bold text-gray-800">{effectiveness.score}</span>
              <span className="text-gray-600">/ 100</span>
              <span className="text-sm text-gray-500">{effectiveness.traineeCount} {effectiveness.traineeCount === 1 ? 'trainee' : 'trainees'}</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Based on your trainees' test pass rates, checklist completion, and readiness scores.
              {effectiveness.score >= 80 ? ' Great work!' : effectiveness.score >= 60 ? ' Room to improve — focus on test prep and checklist follow-through.' : ' Needs attention — work closely with trainees on test preparation.'}
            </p>
          </section>

          {/* Priority: Next Up focus card */}
          {focusRow && (
            <section className="mb-6 rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5 p-4">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-600">
                Priority: Next up
                {todayOnly && !isSameCalendarDay(focusRow.when) && (
                  <span className="ml-2 font-normal normal-case tracking-normal text-xs text-gray-500">(not today)</span>
                )}
              </h3>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-gray-800">{focusRow.traineeName}</div>
                  <div className="text-sm text-gray-600">
                    {focusRow.icon} {focusRow.shiftLabel} · {formatWhenHuman(focusRow.when)}
                  </div>
                  {focusHealth?.quizAvg != null && (
                    <div className="mt-1 text-xs text-gray-500">Quiz avg: {focusHealth.quizAvg}%</div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        focusRow.testsStatus === 'passed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      Tests: {focusRow.testsStatus === 'passed' ? '✓' : '—'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        focusRow.checklistComplete ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      Checklist: {focusRow.checklistComplete ? '✓' : focusRow.checklistProgress?.total ? `${focusRow.checklistProgress.checked}/${focusRow.checklistProgress.total}` : '—'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        focusRow.trainerSigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      Trainer: {focusRow.trainerSigned ? '✓' : '—'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        focusRow.managerSigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      Manager: {focusRow.managerSigned ? '✓' : '—'}
                    </span>
                  </div>

                  {/* Test Readiness toggles */}
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Clear for test</p>
                    <div className="flex flex-wrap gap-1.5">
                      {OFFICIAL_TEST_IDS.map((tid) => {
                        const ready = trainingData?.[focusRow.traineeId]?.readyToTest?.[tid] ?? false
                        return (
                          <button
                            key={tid}
                            type="button"
                            onClick={() => handleToggleReadyToTest(focusRow.traineeId, tid, !ready)}
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${ready ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'}`}
                          >
                            {PRETTY_TEST_NAMES[tid] || tid} {ready ? '✓' : '+'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-small btn-secondary"
                    onClick={() => handleOpenDetail(focusRow)}
                  >
                    Open Details
                  </button>
                  {!focusRow.trainerSigned && (
                    <button
                      type="button"
                      className={`btn btn-small${focusRow.testsStatus !== 'passed' ? ' btn-secondary' : ''}`}
                      onClick={() => setSignoffRow(focusRow)}
                      title={focusRow.testsStatus !== 'passed' ? 'Complete required tests first' : 'Rate & sign off'}
                    >
                      Rate &amp; Sign Off
                    </button>
                  )}
                  {focusRow.trainerSigned && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                      Signed ✓
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* My Assigned Shifts */}
          <section className="mb-8">
            <h3 id="assigned-shifts" className="mb-3 border-l-4 border-l-[var(--color-primary)] pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
              My assigned shifts
            </h3>
            {(() => {
              const displayShifts = focusRow
                ? filteredAssigned.filter((r) => !(r.traineeId === focusRow.traineeId && r.shiftKey === focusRow.shiftKey))
                : filteredAssigned
              return displayShifts.length === 0 ? (
                <p className="text-gray-500">
                  {assignedShifts.length === 0
                    ? 'No shifts assigned to you yet.'
                    : assignedShifts.length === 1 && focusRow
                      ? 'Your only assigned shift is shown above in Priority.'
                      : todayOnly
                        ? `No other shifts scheduled for today. Next shift: ${assignedShifts.find((r) => !isSameCalendarDay(r.when))?.when ? formatWhenHuman(assignedShifts.find((r) => !isSameCalendarDay(r.when)).when) : 'none upcoming'}.`
                        : 'No shifts for the selected filter.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {displayShifts.map((row) => (
                    <TrainerShiftRow
                      key={`${row.traineeId}-${row.shiftKey}`}
                      row={row}
                      health={healthByTrainee[row.traineeId]}
                      onOpenDetail={handleOpenDetail}
                      onRateSignOff={setSignoffRow}
                    />
                  ))}
                </div>
              )
            })()}
          </section>

          {/* Pending Claims (mine) */}
          {pendingClaims.length > 0 && (
            <section className="mb-8">
              <h3 id="pending-claims" className="mb-3 border-l-4 border-l-amber-500 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                My pending claims
              </h3>
              <p className="mb-2 text-sm text-gray-600">Waiting for manager approval.</p>
              <ul className="space-y-2">
                {pendingClaims.map((row) => (
                  <li
                    key={`${row.traineeId}-${row.shiftKey}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-2"
                  >
                    <span className="font-medium text-gray-800">{row.traineeName}</span>
                    <span className="text-sm text-gray-600">
                      {row.icon} {row.shiftLabel} · {formatWhenHuman(row.when)}
                    </span>
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Awaiting manager approval
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Recent Test Completions (Your Trainees) */}
          <section className="mb-8">
            <h3 id="recent-tests" className="mb-3 border-l-4 border-l-green-500 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
              Recent test completions
            </h3>
            {recentTestAttempts.length > 0 ? (
              <ul className="space-y-2">
                {recentTestAttempts.slice(0, 10).map((a, i) => (
                  <li
                    key={`${a.traineeId}-${a.testId}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <span className="text-sm font-medium text-gray-800">
                      {a.traineeName} · {a.testName}
                    </span>
                    <span className="text-sm text-gray-600">
                      {a.score}% {a.passed ? '✓' : ''}
                    </span>
                    <button
                      type="button"
                      className="btn btn-small btn-secondary"
                      onClick={() => setViewResultAttempt(a)}
                    >
                      View result
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No test results yet for your assigned trainees.</p>
            )}
          </section>

          {/* Coverage Needed */}
          <section className="mb-8">
            <h3 className="mb-3 border-l-4 border-l-blue-500 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
              Coverage needed
            </h3>
            {coverageShifts.length === 0 ? (
              <p className="text-gray-500">No unassigned shifts at your store.</p>
            ) : (
              <div className="space-y-2">
                {coverageShifts.map((row) => (
                  <div
                    key={`${row.traineeId}-${row.shiftKey}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800">{row.traineeName}</span>
                        {row.isPending && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Pending
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {row.icon} {row.shiftLabel} · {formatWhenHuman(row.when)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-small btn-secondary"
                        onClick={() => handleOpenDetail(row)}
                      >
                        Open
                      </button>
                      {!row.isPending && (
                        <button type="button" className="btn btn-small" onClick={() => handleClaim(row)}>
                          Claim
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Browse All Trainees */}
          <section>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-800"
              onClick={() => setBrowseOpen(!browseOpen)}
            >
              <span>Browse all trainees ({allTrainees.length})</span>
              <span className="text-gray-500">{browseOpen ? '▴' : '▾'}</span>
            </button>
            {browseOpen && (
              <div className="mt-2 space-y-2 rounded-b-xl border border-t-0 border-gray-200 bg-gray-50/50 p-4">
                {browseTraineesWithMeta.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                    <p className="text-gray-600">No trainees at this store.</p>
                    <p className="mt-1 text-sm text-gray-500">Managers can add trainees from the Manager dashboard or sync from Toast.</p>
                  </div>
                ) : (
                  <>
                    {browsePaginated.map((t) => (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (t.nextShift && trainingData?.[t.id]) {
                            setDetailShift({ traineeId: t.id, shiftKey: t.nextShift.shiftKey })
                          }
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && t.nextShift && trainingData?.[t.id]) {
                            setDetailShift({ traineeId: t.id, shiftKey: t.nextShift.shiftKey })
                          }
                        }}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-3${t.nextShift ? ' cursor-pointer hover:border-gray-300 hover:bg-gray-50' : ''}`}
                      >
                        <div>
                          <span className="font-medium text-gray-800">{t.name || t.id}</span>
                          <span className="ml-2 text-sm text-gray-500">#{t.employeeNumber || '—'}</span>
                          {t.nextShift && (
                            <div className="mt-0.5 text-xs text-gray-500">
                              Next shift: {t.nextShift.label} · {formatWhenHuman(t.nextShift.when)}
                            </div>
                          )}
                          {t.hasNewTestResult && (
                            <span className="mt-1 inline-block rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">
                              New test result
                            </span>
                          )}
                        </div>
                        {t.nextShift && (
                          <span className="text-xs text-gray-400">View shift →</span>
                        )}
                      </div>
                    ))}
                    {hasMoreBrowse && (
                      <button
                        type="button"
                        className="w-full rounded-lg border border-gray-300 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        onClick={() => setBrowsePage((p) => p + 1)}
                      >
                        Load more
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {viewResultAttempt && (
        <TestReviewModal
          traineeId={viewResultAttempt.traineeId}
          testId={viewResultAttempt.testId}
          traineeName={viewResultAttempt.traineeName}
          onClose={() => setViewResultAttempt(null)}
        />
      )}

      {signoffConfirm && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-green-700 px-6 py-3 text-white font-medium shadow-lg text-sm">
          ✓ {signoffConfirm}
        </div>
      )}

      {signoffRow && (
        <TrainerSignoffModal
          open
          traineeId={signoffRow.traineeId}
          traineeName={signoffRow.traineeName}
          shiftKey={signoffRow.shiftKey}
          shiftLabel={signoffRow.shiftLabel}
          canSignOff={signoffRow.testsStatus === 'passed' && !signoffRow.trainerSigned}
          failedTestTitles={signoffRow.failedTestTitles || []}
          onSave={handleSaveSignoff}
          onClose={() => setSignoffRow(null)}
        />
      )}
    </>
  )
}
