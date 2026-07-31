/**
 * Trainee Health Dashboard — full health report at /trainee/health.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import TraineeNavTabs from '../components/TraineeNavTabs'
import { useAuth } from '../contexts/AuthContext'
import { useTrainingData } from '../hooks/useTrainingData'
import { subscribeTraineeHealth } from '../services/healthService'
import { loadTestResults } from '../services/quizAttemptsService'
import { TESTS, PRETTY_TEST_NAMES } from '../data/quizDatabase'
import { getRequiredShiftKeys } from '../constants'
import { isShiftComplete } from '../utils/helpers'
import { useStaffAccounts } from '../hooks/useStaffAccounts'

const SHIFT_ORDER = ['host', 'follow', 'rev1', 'rev2', 'rev3', 'rev4', 'foodrun', 'cert']

/* ------------------------------------------------------------------ */
/*  I-1: SimpleReadinessCard — local score, no AI                     */
/* ------------------------------------------------------------------ */
function SimpleReadinessCard({ traineeId, trainingData, testResults }) {
  const rec = trainingData?.[traineeId]

  // Shift completion: what % of required shifts are complete (60% weight)
  const requiredShiftKeys = getRequiredShiftKeys(rec)
  const completedShifts = requiredShiftKeys.filter((k) => rec && isShiftComplete(rec, k)).length
  const shiftPct = requiredShiftKeys.length > 0 ? completedShifts / requiredShiftKeys.length : 0

  // Test results: what % of official tests are passed (40% weight)
  const officialTests = (TESTS || []).filter((t) => t.id !== 'bonus_test')
  const passedTests = officialTests.filter((t) => testResults[t.id]?.passed).length
  const testPct = officialTests.length > 0 ? passedTests / officialTests.length : 0

  const score = Math.round(shiftPct * 60 + testPct * 40)
  const verdict = score >= 80 ? 'Ready' : score >= 50 ? 'Almost Ready' : 'Needs More Time'
  const verdictStyle =
    verdict === 'Ready'
      ? 'bg-green-100 text-green-700'
      : verdict === 'Almost Ready'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700'
  const ringColor =
    verdict === 'Ready' ? 'bg-green-500' : verdict === 'Almost Ready' ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4 mb-4">
        <div className={`w-14 h-14 rounded-full ${ringColor} flex items-center justify-center text-xl font-bold text-white`}>
          {score}
        </div>
        <div>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${verdictStyle}`}>
            {verdict}
          </span>
          <p className="text-sm text-gray-500 mt-1">Readiness score (0–100)</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-gray-500 text-xs mb-1">Shifts completed</p>
          <p className="font-bold text-gray-800">{completedShifts} / {requiredShiftKeys.length}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-gray-500 text-xs mb-1">Tests passed</p>
          <p className="font-bold text-gray-800">{passedTests} / {officialTests.length}</p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  I-2: MomentumMeter — 7-day streak bar                            */
/* ------------------------------------------------------------------ */
function MomentumMeter({ quizAttempts, flashcardProgress }) {
  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const grid = Array(7).fill(0).map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    d.setHours(0, 0, 0, 0)
    return { date: d, count: 0 }
  })

  ;(quizAttempts || []).forEach((a) => {
    const t = typeof a.timestamp === 'string' ? new Date(a.timestamp) : (a.timestamp?.toDate?.() || new Date(0))
    t.setHours(0, 0, 0, 0)
    const idx = grid.findIndex((g) => g.date.getTime() === t.getTime())
    if (idx >= 0) grid[idx].count += 1
  })

  ;(flashcardProgress?.cards || []).forEach((c) => {
    const updated = c.updatedAt ?? c.lastSeen
    if (!updated) return
    const t = typeof updated === 'object' && updated?.toMillis ? new Date(updated.toMillis()) : new Date(updated)
    t.setHours(0, 0, 0, 0)
    const idx = grid.findIndex((g) => g.date.getTime() === t.getTime())
    if (idx >= 0) grid[idx].count += 1
  })

  // Streak: consecutive days with activity ending at today
  let streak = 0
  for (let i = grid.length - 1; i >= 0; i--) {
    if (grid[i].count > 0) streak++
    else break
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Momentum</h3>
        <span className="text-sm font-bold text-green-600">{streak} day streak</span>
      </div>
      <div className="flex gap-1.5">
        {grid.map((g, i) => (
          <div key={i} className="flex-1 text-center">
            <p className="text-[10px] text-gray-400 mb-1">{DAY_LABELS[g.date.getDay()]}</p>
            <div
              className={`h-8 rounded-md ${
                g.count === 0 ? 'bg-gray-100' :
                g.count <= 3 ? 'bg-green-200' :
                g.count <= 9 ? 'bg-green-400' : 'bg-green-700'
              }`}
              title={`${g.date.toLocaleDateString()}: ${g.count} actions`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  I-3: TestResultsCard — per official test with attempt scores      */
/* ------------------------------------------------------------------ */
function TestResultsCard({ testResults }) {
  const officialTests = (TESTS || []).filter((t) => t.id !== 'bonus_test')

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Test results</h3>
      <div className="space-y-3">
        {officialTests.map((test) => {
          const data = testResults[test.id]
          const passed = data?.passed
          const scores = Array.isArray(data?.scores) ? data.scores : []
          const prettyName = PRETTY_TEST_NAMES[test.id] || test.title || test.id

          return (
            <div key={test.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{prettyName}</span>
                {passed ? (
                  <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">PASSED</span>
                ) : scores.length > 0 ? (
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">NOT PASSED</span>
                ) : (
                  <span className="text-xs font-medium text-gray-400">Not taken</span>
                )}
              </div>
              {scores.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {scores.map((s, idx) => (
                    <span
                      key={idx}
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        s >= (test.passing_score || 85)
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      Attempt {idx + 1}: {s}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Existing components kept as-is                                    */
/* ------------------------------------------------------------------ */

function WeakSpotsPanel({ weakSpots, traineeId }) {
  const navigate = useNavigate()
  const items = (weakSpots || []).slice(0, 10)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Weak spots</h3>
      {items.length === 0 ? (
        <p className="text-gray-500">No cards marked Need Practice. Keep studying to build your skills.</p>
      ) : (
        <>
          <ul className="space-y-2 mb-4">
            {items.map((w) => (
              <li key={w.id} className="text-sm">
                <span className="font-medium">{w.questionText || w.correctAnswer || 'Card'}</span>
                <span className="text-gray-500 ml-2">({w.reviewCount || 0} reviews)</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => navigate(`/flashcards?filter=weak_spots${traineeId ? `&traineeId=${traineeId}` : ''}`)}
          >
            Study these now
          </button>
        </>
      )}
    </div>
  )
}

function TrainerFeedbackSummary({ trainingShifts, staffAccounts }) {
  const shifts = (trainingShifts || [])
    .filter((s) => s.step3Checklist?.notes && Object.values(s.step3Checklist.notes || {}).some((v) => v?.trim()))
    .slice(0, 3)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Latest trainer feedback</h3>
      {shifts.length === 0 ? (
        <p className="text-gray-500">No shift notes yet. Trainer feedback will appear here after your shifts.</p>
      ) : (
        <div className="space-y-3">
          {shifts.map((s) => {
            const trainerName = staffAccounts[s.trainerId || s.trainer]?.name || s.trainer || 'Trainer'
            const notes = s.step3Checklist?.notes || {}
            const text = Object.values(notes).filter(Boolean).join(' · ')
            return (
              <div key={s.id} className="border-l-4 border-green-500 pl-3 py-1">
                <span className="font-medium">{s.shiftType || 'Shift'}</span>
                <span className="text-gray-500 text-sm"> · {trainerName}</span>
                <p className="text-sm text-gray-700 mt-1">{text}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

export default function HealthPage() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { trainingData } = useTrainingData()
  const { staffAccounts } = useStaffAccounts()

  const traineeId = currentUser?.traineeId || currentUser?.id
  const traineeName = currentUser?.name || 'Trainee'

  const [healthData, setHealthData] = useState(null)
  const [testResults, setTestResults] = useState({})

  useEffect(() => {
    if (!traineeId) return
    return subscribeTraineeHealth(traineeId, traineeId, setHealthData)
  }, [traineeId])

  // Load test results from Firestore (with localStorage fallback)
  useEffect(() => {
    if (!traineeId) return
    loadTestResults(traineeId).then((data) => {
      if (data && Object.keys(data).length > 0) {
        setTestResults(data)
      } else {
        // Fallback: try to read from localStorage
        try {
          const raw = localStorage.getItem('testAttempts')
          if (raw) {
            const parsed = JSON.parse(raw)
            const local = {}
            for (const [key, val] of Object.entries(parsed)) {
              if (key.startsWith(`${traineeId}_`)) {
                const testId = key.replace(`${traineeId}_`, '')
                local[testId] = val
              }
            }
            if (Object.keys(local).length > 0) setTestResults(local)
          }
        } catch (_) {}
      }
    }).catch(() => {})
  }, [traineeId])

  if (!traineeId) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl p-4">
          <p className="text-gray-600">Sign in as a trainee to view your health report.</p>
          <button type="button" className="btn mt-4" onClick={() => navigate('/trainee')}>
            Back to dashboard
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <AppHeader />
      <div className="container mx-auto max-w-4xl px-4 pb-8">
        <TraineeNavTabs />
        <div className="content-area">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Health Report</h2>
          <p className="text-gray-600 text-sm mb-6">
            Your readiness, momentum, and trainer feedback.
          </p>

          <div className="space-y-6">
            <SimpleReadinessCard
              traineeId={traineeId}
              trainingData={trainingData}
              testResults={testResults}
            />

            <MomentumMeter
              quizAttempts={healthData?.quizAttempts}
              flashcardProgress={healthData?.flashcardProgress}
            />

            <TestResultsCard testResults={testResults} />

            <WeakSpotsPanel weakSpots={healthData?.weakSpots} traineeId={traineeId} />

            <TrainerFeedbackSummary
              trainingShifts={healthData?.trainingShifts}
              staffAccounts={staffAccounts || {}}
            />
          </div>
        </div>
      </div>
    </>
  )
}
