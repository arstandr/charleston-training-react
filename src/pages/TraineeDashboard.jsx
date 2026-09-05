import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

const PRACTICE_SESSION_KEY = 'practiceTestSession'
import { useAuth } from '../contexts/AuthContext'
import AppHeader from '../components/AppHeader'
import TraineeNavTabs from '../components/TraineeNavTabs'
import CertificationProgress from '../components/CertificationProgress'
import TraineeShiftCard from '../components/TraineeShiftCard'
import ShiftDetailView from '../components/ShiftDetailView'
import TrainerRatingModal from '../components/TrainerRatingModal'
import VerbalCertChecklistModal from '../components/VerbalCertChecklistModal'
import { useTrainingData } from '../hooks/useTrainingData'
import { useStaffAccounts } from '../hooks/useStaffAccounts'
import { useToastStoreGuids } from '../hooks/useToastStoreGuids'
import { useTestAttempts } from '../hooks/useTestAttempts'
import { getTrainersByLocation } from '../services/trainerService'
import { submitTrainerRating, updateTrainerRating, getExistingRating } from '../services/trainerRatingsService'
import { useFlashcardMastery } from '../hooks/useFlashcardMastery'
import { REQUIRED_SHIFT_KEYS, SHIFT_META, getRequiredShiftKeys, shiftNeedsTrainer, getStoreDisplayName } from '../constants'
import { getAllFlashcardSets } from '../services/flashcardService'
import {
  getCertificationProgress,
  getNextShift,
  formatWhenHuman,
  isShiftComplete,
  getShiftRequiredTestIds,
} from '../utils/helpers'
import SkeletonCards from '../components/SkeletonCard'
import HealthSummaryCard from '../components/HealthSummaryCard'
import WeaknessPracticePanel from '../components/WeaknessPracticePanel'
import MyFlagsPanel from '../components/MyFlagsPanel'
import TestReadinessPanel from '../components/TestReadinessPanel'
import PreCertBriefing from '../components/PreCertBriefing'
import { getPendingChecks } from '../services/postShiftCheckService'
import { getVerbalCertPractice } from '../services/verbalCertPracticeService'
import { logClientError } from '../services/errorLogger'

const SHIFT_ORDER = ['host', 'follow', 'rev1', 'rev2', 'rev3', 'rev4', 'foodrun', 'cert']

export default function TraineeDashboard() {
  const navigate = useNavigate()
  const { currentUser, loading } = useAuth()
  const traineeId = currentUser?.traineeId || currentUser?.id
  const { trainingData, setTrainingData, saveTrainingData, trainingDataLoading, trainingDataFetchedAt } = useTrainingData()
  const { staffAccounts } = useStaffAccounts()
  const { getRestaurantGuid } = useToastStoreGuids()
  const [firestoreTrainerMap, setFirestoreTrainerMap] = useState({})
  const testAttempts = useTestAttempts(traineeId)

  const [detailShiftKey, setDetailShiftKey] = useState(null)
  const [ratingModal, setRatingModal] = useState({ open: false, shiftKey: null })
  const [showCompletedOpen, setShowCompletedOpen] = useState(false)
  const [verbalChecklistOpen, setVerbalChecklistOpen] = useState(false)
  const [pendingChecks, setPendingChecks] = useState([])
  const [certPracticeData, setCertPracticeData] = useState(null)

  // Load pending post-shift knowledge checks
  useEffect(() => {
    if (!traineeId) return
    getPendingChecks(traineeId).then(setPendingChecks).catch(() => setPendingChecks([]))
  }, [traineeId])

  // Load verbal cert practice data
  useEffect(() => {
    if (!traineeId) return
    getVerbalCertPractice(traineeId).then(setCertPracticeData).catch(() => {})
  }, [traineeId])

  const { getStruggleCards, getMasteredCards, getStudiedCardIds, getSavedSession } = useFlashcardMastery(traineeId)
  const [resumeFlashcard, setResumeFlashcard] = useState(null)
  const [flashcardSets, setFlashcardSets] = useState([])
  useEffect(() => {
    getAllFlashcardSets().then((sets) => {
      setFlashcardSets(sets.filter((s) => s.status !== 'hidden').sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)))
    }).catch(() => setFlashcardSets([]))
  }, [])
  const struggleSetTitles = useMemo(() => {
    return flashcardSets.filter((s) => getStruggleCards(s.id).length > 0).map((s) => s.title)
  }, [flashcardSets, getStruggleCards])

  useEffect(() => {
    if (!traineeId) {
      setResumeFlashcard(null)
      return
    }
    getSavedSession().then((data) => {
      if (data?.setId) {
        setResumeFlashcard({ setId: data.setId, focusMode: !!data.focusMode, index: data.currentIndex ?? 0 })
      } else {
        setResumeFlashcard(null)
      }
    })
  }, [traineeId, getSavedSession])

  const rawRec = (traineeId && trainingData?.[traineeId]) || null
  const rec = rawRec ? { ...rawRec, id: rawRec.id || traineeId } : null

  // Load Firestore trainers so we can resolve trainer names by Toast GUID
  useEffect(() => {
    const store = rawRec?.store
    if (!store) return
    const guid = getRestaurantGuid(store)
    if (!guid) return
    getTrainersByLocation(guid).then((list) => {
      const map = {}
      list.forEach((t) => {
        const entry = { name: t.name, role: 'trainer' }
        if (t.empNum) map[String(t.empNum)] = entry
        if (t.toastGuid) map[t.toastGuid] = entry
      })
      setFirestoreTrainerMap(map)
    }).catch(() => {})
  }, [rawRec?.store, getRestaurantGuid])

  // Merge Firestore trainers (keyed by Toast GUID) with staffAccounts for name lookups
  const combinedStaffAccounts = useMemo(() => ({
    ...firestoreTrainerMap,
    ...staffAccounts,
  }), [staffAccounts, firestoreTrainerMap])

  // Fire exactly once when the "no training record" state is entered so Sentinel can detect it.
  const noRecordLoggedRef = useRef(false)
  useEffect(() => {
    if (!traineeId || trainingDataLoading || loading) return
    if (rec) { noRecordLoggedRef.current = false; return }
    if (noRecordLoggedRef.current) return
    noRecordLoggedRef.current = true
    logClientError(
      'training',
      'no_training_record',
      new Error('trainee dashboard found no record'),
      { traineeId, empNum: currentUser?.empNum, hasTrainingData: !!trainingData }
    )
  }, [traineeId, rec, trainingDataLoading, loading, currentUser?.empNum, trainingData])

  const nextShift = rec ? getNextShift(rec, combinedStaffAccounts, SHIFT_ORDER) : null
  const progress = rec ? getCertificationProgress(rec) : { done: 0, total: 6, pct: 0 }
  const incompleteShifts = SHIFT_ORDER.filter((key) => {
    try { return rec?.schedule?.[key] && !isShiftComplete(rec, key) } catch (_) { return false }
  })
  const completedShifts = getRequiredShiftKeys(rec).filter((key) => {
    try { return rec && isShiftComplete(rec, key) } catch (_) { return false }
  })
  const shiftsRatable = SHIFT_ORDER.filter((key) => rec?.schedule?.[key]?.trainerSignedAt && rec?.schedule?.[key]?.trainer)
  const trainerRatings = rec?.trainerRatings || {}

  // Most recently signed-off shift with a trainer that hasn't been rated yet — blocks login
  const mandatoryRatingShift = useMemo(() => {
    if (!rec) return null
    const unrated = SHIFT_ORDER.filter(
      (key) => key !== 'follow' && rec.schedule?.[key]?.trainerSignedAt && rec.schedule?.[key]?.trainer && !trainerRatings[key]
    )
    if (!unrated.length) return null
    unrated.sort((a, b) => new Date(rec.schedule[b].trainerSignedAt) - new Date(rec.schedule[a].trainerSignedAt))
    return unrated[0]
  }, [rec, trainerRatings])

  const resumePracticeTest = useMemo(() => {
    if (!traineeId) return null
    try {
      const raw = localStorage.getItem(`${PRACTICE_SESSION_KEY}_${traineeId}`)
      if (!raw) return null
      const s = JSON.parse(raw)
      if (s?.testId && s?.mode === 'practice') return { testId: s.testId }
    } catch (_) {}
    return null
  }, [traineeId])

  const resumeOfficialTest = useMemo(() => {
    if (!traineeId) return null
    try {
      const raw = localStorage.getItem(`officialTestSession_${traineeId}`)
      if (!raw) return null
      const s = JSON.parse(raw)
      if (s?.testId && s?.mode === 'official') return { testId: s.testId, testTitle: s.testTitle || 'Test' }
    } catch (_) {}
    return null
  }, [traineeId])

  const waitingForResetTests = useMemo(() => {
    if (!rec || !testAttempts) return []
    const locked = []
    for (const shiftKey of REQUIRED_SHIFT_KEYS) {
      const testIds = getShiftRequiredTestIds(shiftKey, traineeId)
      for (const testId of testIds) {
        const { passed, count, maxAttempts } = testAttempts.getAttempts(testId)
        if (!passed && count >= (maxAttempts || 3)) {
          // Avoid duplicates — same testId can appear in multiple shifts
          if (!locked.find((x) => x.testId === testId)) {
            const shiftMeta = SHIFT_META[shiftKey] || { label: shiftKey }
            locked.push({ testId, label: shiftMeta.label })
          }
        }
      }
    }
    return locked
  }, [rec, testAttempts, traineeId])

  const needsVerbalCert = useMemo(() => {
    if (!rec || !testAttempts) return false
    if (rec?.verbalCertCompletedAt) return false
    const allTestIds = []
    for (const shiftKey of REQUIRED_SHIFT_KEYS) {
      const ids = getShiftRequiredTestIds(shiftKey, traineeId)
      for (const id of ids) {
        if (!allTestIds.includes(id)) allTestIds.push(id)
      }
    }
    if (allTestIds.length === 0) return false
    return allTestIds.every((testId) => testAttempts.getAttempts(testId).passed)
  }, [rec, testAttempts, traineeId])

  const certificationComplete = !!rec?.verbalCertCompletedAt

  const handleSaveRating = async (shiftKey, payload) => {
    if (!traineeId || !rec) return
    const next = { ...trainingData }
    if (!next[traineeId]) next[traineeId] = { ...rec }
    if (!next[traineeId].trainerRatings) next[traineeId].trainerRatings = {}
    next[traineeId].trainerRatings[shiftKey] = payload
    setTrainingData(next)
    // Write only the trainerRatings field — saveTrainingData writes the full record
    // which trainees don't have permission to do (trainers/managers/owners only)
    try {
      await updateDoc(doc(db, 'trainees', traineeId), { [`trainerRatings.${shiftKey}`]: payload })
    } catch (e) {
      console.error('[TraineeDashboard] Failed to persist trainer rating to trainee record:', e?.message)
    }
    setRatingModal({ open: false, shiftKey: null })

    // Write to trainerRatings collection so manager views can see this rating
    try {
      const trainerEmpNum = String(payload.trainerId || rec.schedule[shiftKey]?.trainer || '')
      const trainerId = staffAccounts?.[trainerEmpNum]?.toastGuid || trainerEmpNum
      const scores = Array.isArray(payload.scores) ? payload.scores : []
      const average = scores.length > 0
        ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
        : 0
      const ratingData = {
        trainerId,
        trainerEmpNum,
        traineeId,
        traineeName: rec.name || '',
        shiftId: shiftKey,
        shiftType: payload.shiftLabel || SHIFT_META[shiftKey]?.label || shiftKey,
        scores,
        average,
        notes: payload.notes || '',
        ratedAt: payload.at || new Date().toISOString(),
      }
      const existing = await getExistingRating(shiftKey, traineeId)
      if (existing) {
        await updateTrainerRating(existing.id, ratingData)
      } else {
        await submitTrainerRating(ratingData)
      }
    } catch (err) {
      console.error('[TraineeDashboard] Failed to write trainer rating:', err)
    }
  }

  if (!traineeId) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl p-4">
          <p className="text-gray-600">You are not logged in as a trainee. Use your employee number to sign in.</p>
        </div>
      </>
    )
  }

  if (!rec && !trainingDataLoading && !loading && traineeId) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl p-4">
          <div className="content-area rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
            <p className="text-gray-600 mb-2">No training record found for {traineeId}.</p>
            <p className="text-sm text-gray-500 mb-1">Ask your manager to add you as a trainee from the Manager dashboard.</p>
            <p className="text-xs text-gray-400">Show this screen to your manager: ID {traineeId}{currentUser?.empNum ? `, emp #${currentUser.empNum}` : ''}.</p>
          </div>
        </div>
      </>
    )
  }

  if (mandatoryRatingShift) {
    return (
      <TrainerRatingModal
        open={true}
        mandatory={true}
        fullPage={true}
        traineeId={traineeId}
        shiftKey={mandatoryRatingShift}
        shiftLabel={SHIFT_META[mandatoryRatingShift]?.label || mandatoryRatingShift}
        trainerId={rec.schedule[mandatoryRatingShift]?.trainer}
        trainerName={combinedStaffAccounts[rec.schedule[mandatoryRatingShift]?.trainer]?.name || rec.schedule[mandatoryRatingShift]?.trainer}
        existingRating={trainerRatings[mandatoryRatingShift]}
        onSave={(payload) => handleSaveRating(mandatoryRatingShift, payload)}
        onClose={() => {}}
      />
    )
  }

  if (detailShiftKey) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl p-4">
          <ShiftDetailView
            shiftKey={detailShiftKey}
            rec={rec}
            traineeId={traineeId}
            staffAccounts={combinedStaffAccounts}
            onBack={() => setDetailShiftKey(null)}
          />
        </div>
      </>
    )
  }

  const nextMeta = nextShift && SHIFT_META[nextShift.key]
  const nextWhenStr = nextShift?.when ? formatWhenHuman(nextShift.when) : '—'

  return (
    <>
      <AppHeader />
      <div className="container mx-auto max-w-4xl px-4 pb-8">
        <TraineeNavTabs />
        <div className="content-area">
          {trainingDataLoading ? (
            <>
              <div className="mb-2 h-7 w-48 rounded bg-gray-200 animate-pulse" aria-hidden />
              <div className="mb-6 h-4 w-64 rounded bg-gray-100 animate-pulse" aria-hidden />
              <SkeletonCards count={4} />
            </>
          ) : (
            <>
          <h2 className="mb-2 text-xl font-bold text-gray-800">Trainee Dashboard</h2>
          <p className="mb-2 text-sm text-gray-600">{getStoreDisplayName(rec?.store || currentUser?.store || 'Westfield')} · #{rec?.employeeNumber || currentUser?.empNum || '—'}</p>
          {trainingDataFetchedAt && (() => {
            const ageMs = Date.now() - new Date(trainingDataFetchedAt).getTime()
            if (ageMs < 60 * 60 * 1000) return null
            const hours = Math.floor(ageMs / (60 * 60 * 1000))
            return (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>&#9888;</span>
                <span>Your progress data is {hours} hour{hours !== 1 ? 's' : ''} old — may not be current.</span>
              </div>
            )
          })()}

          {/* State banners: Test In-Progress, Waiting for Reset, Needs Verbal Cert */}
          {resumeOfficialTest != null && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold text-amber-900">Test in progress</div>
                <div className="text-sm text-amber-800">{resumeOfficialTest.testTitle}</div>
                <div className="text-sm text-amber-700">You have an unfinished official attempt. Resume to submit.</div>
              </div>
              <button
                type="button"
                className="btn btn-small bg-amber-500 border-amber-500 text-white hover:bg-amber-600 hover:border-amber-600"
                onClick={() => navigate(`/quizzes?test=${encodeURIComponent(resumeOfficialTest.testId)}&mode=official`)}
              >
                Resume test
              </button>
            </div>
          )}

          {waitingForResetTests.length > 0 && (
            <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 shadow-sm mb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-bold text-red-900">Test locked — manager reset required</div>
                  <div className="mt-1 text-sm text-red-700">You&apos;ve used all your attempts. Ask your manager to unlock the test.</div>
                  <div className="mt-2 space-y-1">
                    {waitingForResetTests.map((t) => (
                      <div key={t.testId} className="text-sm text-red-800">{t.label}</div>
                    ))}
                  </div>
                </div>
                <span className="text-xs font-bold text-red-700 bg-red-100 rounded-full px-3 py-1 self-start">Waiting for manager</span>
              </div>
            </div>
          )}

          {needsVerbalCert && (
            <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4 shadow-sm mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-green-900">Written tests complete!</span>
                <span className="text-xs font-bold bg-green-600 text-white rounded-full px-3 py-1">Ready for verbal cert</span>
              </div>
              <p className="text-sm text-green-800 mt-1">All your written tests are passed. Your next step is the verbal certification with your manager.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-small bg-green-600 border-green-600 text-white hover:bg-green-700 hover:border-green-700"
                  onClick={() => navigate('/flashcards?set=verbal_cert')}
                >
                  Study for verbal cert
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={() => setVerbalChecklistOpen(true)}
                >
                  View checklist
                </button>
              </div>
            </div>
          )}

          {/* What's Next */}
          {certificationComplete ? (
            <section className="rounded-xl border-2 border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 p-6 shadow-sm text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-green-600 flex items-center justify-center text-white text-3xl mx-auto">&#10003;</div>
              <div className="text-xl font-bold text-green-900 text-center mt-3">Certification Complete!</div>
              <div className="text-sm text-green-800 text-center mt-1">Congratulations, you&apos;re certified as a Charleston&apos;s server.</div>
              {rec.verbalCertCompletedAt && (
                <div className="text-xs text-green-700 text-center mt-1">
                  Certified on {new Date(rec.verbalCertCompletedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              )}
            </section>
          ) : (
          <section className="mb-6 rounded-xl border-2 border-[var(--color-primary)] bg-green-50/50 p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-primary)]">What&apos;s next</h3>
            {nextShift ? (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-gray-800">
                    {nextMeta?.icon ? <span className="mr-1.5">{nextMeta?.icon}</span> : null}
                    {nextShift.label}
                  </div>
                  <div className="mt-1 text-sm text-gray-600">{nextWhenStr}</div>
                  {shiftNeedsTrainer(nextShift.key) && <div className="mt-0.5 text-sm text-gray-500">Trainer: {nextShift.trainerName}</div>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-small text-sm bg-[#5e35b1] border-[#5e35b1] text-white hover:bg-[#7e45c1] hover:border-[#7e45c1]"
                      onClick={() => navigate('/flashcards?set=verbal_cert')}
                    >
                      Study for Certification
                    </button>
                    {nextMeta?.flashcardSetId && (
                      <button
                        type="button"
                        className="btn btn-small text-sm"
                        onClick={() => navigate(`/flashcards?set=${encodeURIComponent(nextMeta.flashcardSetId)}`)}
                      >
                        Flashcards
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-small text-sm"
                      onClick={() => navigate(`/quizzes?shift=${encodeURIComponent(nextShift.key)}&mode=practice`)}
                    >
                      Practice Test
                    </button>
                    <button
                      type="button"
                      className="btn btn-small text-sm"
                      onClick={() => {
                        const testIds = getShiftRequiredTestIds(nextShift.key, traineeId)
                        const first = testIds[0]
                        navigate(first ? `/quizzes?test=${encodeURIComponent(first)}&mode=official` : '/quizzes#tests')
                      }}
                    >
                      Test
                    </button>
                  </div>
                </div>
                {(() => {
                  if (nextShift.complete) return <span className="rounded-full bg-[#2e7d32] px-3 py-1 text-xs font-bold text-white">Complete</span>
                  const isFuture = (() => {
                    if (!nextShift.when) return false
                    try {
                      const shiftDate = new Date(nextShift.when)
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      shiftDate.setHours(0, 0, 0, 0)
                      return shiftDate.getTime() > today.getTime()
                    } catch (_) { return false }
                  })()
                  if (isFuture) return <span className="rounded-full bg-[#1976d2] px-3 py-1 text-xs font-bold text-white">Upcoming</span>
                  return <span className="rounded-full bg-[#e65100] px-3 py-1 text-xs font-bold text-white">In progress</span>
                })()}
              </div>
            ) : (
              <p className="text-gray-600">No upcoming shifts. All required shifts are complete or not yet scheduled.</p>
            )}
          </section>
          )}

          {/* Post-shift knowledge check banners */}
          {pendingChecks.length > 0 && (
            <section className="mb-6 space-y-2">
              {pendingChecks.map((check) => {
                const meta = SHIFT_META[check.shiftKey] || { label: check.shiftKey, icon: '' }
                const flashcardSetId = meta.flashcardSetId
                return (
                  <div
                    key={check.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">&#128218;</span>
                        <span className="font-bold text-amber-900">Knowledge check available</span>
                      </div>
                      <p className="mt-1 text-sm text-amber-800">
                        Review what you learned on your {meta.label} shift
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-small bg-amber-500 border-amber-500 text-white hover:bg-amber-600 hover:border-amber-600"
                      onClick={() => {
                        const testId = flashcardSetId
                          ? Object.entries({ bar_test: 'bar-beer', wines_test: 'wines-cocktails', soups_test: 'starters-soups-salads', steaks_test: 'steaks-specialties' }).find(([, v]) => v === flashcardSetId)?.[0] || 'verbal_cert'
                          : 'verbal_cert'
                        navigate(`/quizzes?test=${encodeURIComponent(testId)}&mode=practice&postShiftCheck=${encodeURIComponent(check.id)}`)
                      }}
                    >
                      Start review
                    </button>
                  </div>
                )
              })}
            </section>
          )}

          {/* Health summary — compact, links to full report */}
          {traineeId && (
            <HealthSummaryCard
              traineeId={traineeId}
              traineeName={rec?.name}
              userId={traineeId}
              trainingData={trainingData}
            />
          )}

          {/* AI-phrased summary of the same data TestReadinessPanel shows below */}
          {traineeId && (
            <PreCertBriefing
              traineeId={traineeId}
              traineeName={rec?.name || currentUser?.name}
              getStruggleCards={getStruggleCards}
              getMasteredCards={getMasteredCards}
              getStudiedCardIds={getStudiedCardIds}
              getAttempts={testAttempts.getAttempts}
              getRequiredScore={testAttempts.getRequiredScore}
              getBestScore={testAttempts.getBestScore}
            />
          )}

          {/* Test readiness — per-test mastery breakdown */}
          {traineeId && (
            <TestReadinessPanel
              getStruggleCards={getStruggleCards}
              getMasteredCards={getMasteredCards}
              getStudiedCardIds={getStudiedCardIds}
              getAttempts={testAttempts.getAttempts}
              getRequiredScore={testAttempts.getRequiredScore}
              getBestScore={testAttempts.getBestScore}
            />
          )}

          {/* Weakness practice panel — quiz weak topics and weak spots */}
          {traineeId && <WeaknessPracticePanel userId={traineeId} />}

          {/* Flags this trainee filed — real data shows reportedBy stored as either the
              name or the traineeId depending on the account, so check both */}
          {traineeId && <MyFlagsPanel identifiers={[currentUser?.name, traineeId]} />}

          {/* Resume last activity - only when there is a resumable session */}
          {(resumeFlashcard || resumePracticeTest) && (
            <section className="mb-6 rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Resume last activity</h3>
              <div className="flex flex-wrap gap-3 items-center">
                {resumeFlashcard && (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() =>
                      navigate(`/flashcards?set=${encodeURIComponent(resumeFlashcard.setId)}${resumeFlashcard.focusMode ? '&focus=1' : ''}`, {
                        state: { resumeIndex: resumeFlashcard.index },
                      })
                    }
                  >
                    Resume flashcards
                  </button>
                )}
                {resumePracticeTest && (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => navigate(`/quizzes?test=${encodeURIComponent(resumePracticeTest.testId)}&mode=practice`)}
                  >
                    Resume practice test
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Certification: flashcard deck (legacy: Study for Certification) */}
          <section className="mb-6 rounded-xl border-2 border-[var(--color-primary)] bg-green-50/50 p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-primary)]">Certification</h3>
            <p className="mb-3 text-sm text-gray-600">Study the certification flashcard deck to prepare for your verbal certification.</p>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                type="button"
                className="btn bg-[var(--color-primary)] text-white hover:opacity-90"
                onClick={() => navigate('/flashcards?set=verbal_cert')}
              >
                Study for Certification (flashcards)
              </button>
              <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={() => setVerbalChecklistOpen(true)}
              >
                Certification checklist
              </button>
            </div>
            <div className="mt-3">
              <CertificationProgress done={progress.done} total={progress.total} />
            </div>
            {certPracticeData && (
              <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${certPracticeData.readyForCert ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                <span>{certPracticeData.readyForCert ? '✓' : '○'}</span>
                <span>
                  {certPracticeData.readyForCert
                    ? `Verbal cert ready (${certPracticeData.bestTotal != null ? certPracticeData.bestTotal + '%' : 'complete'})`
                    : `Verbal cert practice: ${certPracticeData.bestTotal != null ? certPracticeData.bestTotal + '%' : '—'} — keep studying`}
                </span>
                <button
                  type="button"
                  className="ml-auto text-xs underline"
                  onClick={() => navigate('/verbal-cert-practice')}
                >
                  {certPracticeData.readyForCert ? 'Practice again' : 'Practice now'}
                </button>
              </div>
            )}
          </section>

          {/* Study: Flashcards, Practice Tests, Tests */}
          <section className="mb-6">
            <h3 className="mb-2 border-l-4 border-l-[var(--color-primary)] pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">Study & practice</h3>
            <div className="flex flex-wrap gap-3 items-center">
              <button type="button" className="btn" onClick={() => navigate('/flashcards')}>
                Flashcards
              </button>
              <button type="button" className="btn" onClick={() => navigate('/quizzes')}>
                Practice Tests
              </button>
              <button type="button" className="btn" onClick={() => navigate('/quizzes#tests')}>
                Tests
              </button>
              <button type="button" className="btn" onClick={() => navigate('/checklists')}>
                Shift Checklists
              </button>
            </div>
          </section>

          {/* Schedule list (incomplete) */}
          <section className="mb-6" id="traineeScheduleSection">
            <h3 className="mb-3 border-l-4 border-l-[var(--color-primary)] pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">Your schedule</h3>
            <div className="space-y-3">
              {incompleteShifts.length === 0 ? (
                <p className="text-gray-500">No incomplete shifts, or schedule not set yet.</p>
              ) : (
                incompleteShifts.map((key) => (
                  <TraineeShiftCard
                    key={key}
                    shiftKey={key}
                    rec={rec}
                    staffAccounts={combinedStaffAccounts}
                    traineeId={traineeId}
                    testAttempts={testAttempts}
                    onViewDetail={setDetailShiftKey}
                    onStudyFlashcards={(setId) => setId && navigate(`/flashcards?set=${encodeURIComponent(setId)}`)}
                    onPracticeTest={(shiftKey) => {
                      const ids = getShiftRequiredTestIds(shiftKey, traineeId)
                      if (ids[0]) navigate(`/quizzes?test=${encodeURIComponent(ids[0])}&mode=practice`)
                      else navigate('/quizzes')
                    }}
                    onTest={(shiftKey) => {
                      const ids = getShiftRequiredTestIds(shiftKey, traineeId)
                      if (ids[0]) navigate(`/quizzes?test=${encodeURIComponent(ids[0])}&mode=official`)
                      else navigate('/quizzes#tests')
                    }}
                  />
                ))
              )}
            </div>
          </section>

          {/* Shifts ready to rate (trainer has signed; rate before or after manager sign-off) */}
          {shiftsRatable.length > 0 && (
            <section className="mb-6">
              <h3 className="mb-3 border-l-4 border-l-amber-500 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                Rate your trainer
              </h3>
              <p className="mb-2 text-sm text-gray-600">Your trainer has signed off. Rate them to help us improve training.</p>
              <div className="space-y-2">
                {shiftsRatable.map((key) => {
                  const meta = SHIFT_META[key] || { label: key, icon: '' }
                  const item = rec.schedule?.[key] || {}
                  const whenStr = item.when ? formatWhenHuman(item.when) : '—'
                  const trainerName = item.trainer
                    ? (combinedStaffAccounts[item.trainer]?.name || `#${item.trainer}`)
                    : '—'
                  const rated = !!trainerRatings[key]
                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/30 p-3"
                    >
                      <div>
                        <span className="font-medium text-gray-800">{meta.icon ? `${meta.icon} ` : ''}{meta.label}</span>
                        <div className="text-sm text-gray-500">{whenStr} · {trainerName}</div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() =>
                          setRatingModal({
                            open: true,
                            shiftKey: key,
                          })
                        }
                      >
                        {rated ? 'Update rating' : 'Rate your trainer'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Completed shifts (collapsed by default) */}
          <section>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-800"
              onClick={() => setShowCompletedOpen(!showCompletedOpen)}
            >
              <span>Completed shifts ({completedShifts.length})</span>
              <span className="text-gray-500">{showCompletedOpen ? '▴' : '▾'}</span>
            </button>
            {showCompletedOpen && (
              <div className="mt-2 space-y-2 rounded-b-xl border border-t-0 border-gray-200 bg-green-50/30 p-4">
                {completedShifts.length === 0 ? (
                  <p className="text-sm text-gray-500">None yet. Complete shifts (trainer + manager sign-off) to see them here.</p>
                ) : (
                  completedShifts.map((key) => {
                    const meta = SHIFT_META[key] || { label: key, icon: '' }
                    const item = rec.schedule?.[key] || {}
                    const whenStr = item.when ? formatWhenHuman(item.when) : '—'
                    const trainerName = item.trainer
                      ? (combinedStaffAccounts[item.trainer]?.name || `#${item.trainer}`)
                      : '—'
                    const rated = !!trainerRatings[key]
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-white p-3"
                      >
                        <div>
                          <span className="font-medium text-gray-800">{meta.icon ? `${meta.icon} ` : ''}{meta.label}</span>
                          <div className="text-sm text-gray-500">{shiftNeedsTrainer(key) ? `${whenStr} · ${trainerName}` : whenStr}</div>
                        </div>
                        {shiftNeedsTrainer(key) && (
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() =>
                              setRatingModal({
                                open: true,
                                shiftKey: key,
                              })
                            }
                          >
                            {rated ? 'Update rating' : 'Rate your trainer'}
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </section>
            </>
          )}
        </div>
      </div>

      {/* Trainer rating modal */}
      <VerbalCertChecklistModal open={verbalChecklistOpen} onClose={() => setVerbalChecklistOpen(false)} />

      {ratingModal.open && ratingModal.shiftKey && (
        <TrainerRatingModal
          open
          traineeId={traineeId}
          shiftKey={ratingModal.shiftKey}
          shiftLabel={(SHIFT_META[ratingModal.shiftKey] || {}).label || ratingModal.shiftKey}
          trainerId={rec.schedule?.[ratingModal.shiftKey]?.trainer}
          trainerName={
            rec.schedule?.[ratingModal.shiftKey]?.trainer
              ? (combinedStaffAccounts[rec.schedule[ratingModal.shiftKey].trainer]?.name ||
                `#${rec.schedule[ratingModal.shiftKey].trainer}`)
              : ''
          }
          existingRating={trainerRatings[ratingModal.shiftKey]}
          onSave={(payload) => handleSaveRating(ratingModal.shiftKey, payload)}
          onClose={() => setRatingModal({ open: false, shiftKey: null })}
        />
      )}
    </>
  )
}
