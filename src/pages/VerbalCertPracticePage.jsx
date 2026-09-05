import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import TraineeNavTabs from '../components/TraineeNavTabs'
import { useAuth } from '../contexts/AuthContext'
import {
  PHASE1_TRAINING,
  PHASE2_LOCAL_OPTIONS,
  PHASE3_FOOD_MENU,
  PHASE4_BAR,
  PHASE5_SERVICE,
  TOTAL_POSSIBLE,
} from '../data/verbalCertQuestions'
import {
  getVerbalCertPractice,
  saveVerbalCertPractice,
  READINESS_THRESHOLD,
} from '../services/verbalCertPracticeService'

const PHASES = [
  { key: 'phase1', label: 'Phase 1: Training Review', icon: '1' },
  { key: 'phase2', label: 'Phase 2: Local Options', icon: '2' },
  { key: 'phase3', label: 'Phase 3: Food Menu', icon: '3' },
  { key: 'phase4', label: 'Phase 4: Bar', icon: '4' },
  { key: 'phase5', label: 'Phase 5: Service', icon: '5' },
]

export default function VerbalCertPracticePage() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const traineeId = currentUser?.traineeId || currentUser?.id

  const [activePhase, setActivePhase] = useState('phase1')
  const [phase1Checked, setPhase1Checked] = useState({})
  const [phase2Answers, setPhase2Answers] = useState({})
  const [phase3Answers, setPhase3Answers] = useState({})
  const [phase4Answers, setPhase4Answers] = useState({})
  const [phase5Answers, setPhase5Answers] = useState({})
  const [existingData, setExistingData] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    if (!traineeId) return
    getVerbalCertPractice(traineeId).then(setExistingData).catch(() => {})
  }, [traineeId])

  // Phase 2 score: count items marked "know"
  const phase2Score = useMemo(() => {
    return Object.values(phase2Answers).filter((v) => v === 'know').length
  }, [phase2Answers])

  // Phase 3 score: count checked items * 5pts
  const phase3Score = useMemo(() => {
    return Object.values(phase3Answers).filter(Boolean).length * PHASE3_FOOD_MENU.pointsPerItem
  }, [phase3Answers])

  // Phase 4 score: sum points for items marked "know"
  const phase4Score = useMemo(() => {
    return PHASE4_BAR.items.reduce((sum, item, i) => {
      return sum + (phase4Answers[i] === 'know' ? item.points : 0)
    }, 0)
  }, [phase4Answers])

  // Phase 5 score: count items marked "know"
  const phase5Score = useMemo(() => {
    return Object.values(phase5Answers).filter((v) => v === 'know').length
  }, [phase5Answers])

  const totalScore = phase2Score + phase3Score + phase4Score + phase5Score
  const totalPct = TOTAL_POSSIBLE > 0 ? Math.round((totalScore / TOTAL_POSSIBLE) * 100) : 0
  const isReady = totalPct >= READINESS_THRESHOLD

  async function handleSubmit() {
    if (!traineeId) return
    setSaving(true)
    try {
      const scores = {
        phase1Reviewed: Object.values(phase1Checked).filter(Boolean).length >= 4,
        phase2: phase2Score,
        phase3: phase3Score,
        phase4: phase4Score,
        phase5: phase5Score,
      }
      await saveVerbalCertPractice(traineeId, scores, totalPct)
      setSubmitted(true)
    } catch (e) {
      console.error('Failed to save practice:', e)
      setSaveError('Failed to save — please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (submitted) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-2xl px-4 py-6">
          <TraineeNavTabs />
          <div className="content-area text-center py-12">
            <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white ${isReady ? 'bg-green-600' : 'bg-amber-500'}`}>
              {totalPct}%
            </div>
            <h2 className="mt-4 text-xl font-bold text-gray-800">
              {isReady ? 'Ready for verbal certification!' : 'Keep practicing'}
            </h2>
            <p className="mt-2 text-gray-600">
              {totalScore}/{TOTAL_POSSIBLE} points ({totalPct}%)
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {isReady
                ? 'You\'ve reached the readiness threshold. Talk to your manager to schedule your certification.'
                : `Need ${READINESS_THRESHOLD}% to be considered ready. Review the areas where you marked "Need to study."`}
            </p>
            {existingData && (
              <p className="mt-2 text-sm text-gray-400">
                Best score: {existingData.bestTotal || totalPct}% ({(existingData.attempts || 0) + 1} attempts)
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <button type="button" className="btn" onClick={() => navigate('/trainee')}>
                Back to Dashboard
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => {
                setSubmitted(false)
                setPhase1Checked({})
                setPhase2Answers({})
                setPhase3Answers({})
                setPhase4Answers({})
                setPhase5Answers({})
                setActivePhase('phase1')
              }}>
                Practice again
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <AppHeader />
      <div className="container mx-auto max-w-3xl px-4 py-6">
        <TraineeNavTabs />
        <nav className="study-nav mb-4">
          <button type="button" className="link-style bg-transparent border-0 cursor-pointer p-0" onClick={() => navigate('/trainee')}>
            &larr; Dashboard
          </button>
          <span className="text-gray-400">&middot;</span>
          <span className="font-semibold text-gray-800">Verbal Cert Practice</span>
        </nav>

        <div className="content-area">
          <h2 className="mb-2 text-xl font-bold text-gray-800">Verbal Certification Practice</h2>
          <p className="mb-4 text-sm text-gray-600">
            Self-assess your knowledge across all 5 phases. This mirrors the actual certification exam.
            Score {READINESS_THRESHOLD}% or higher to be marked as "Ready for certification."
          </p>

          {existingData && (
            <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600">
              Previous best: <strong>{existingData.bestTotal}%</strong> ({existingData.attempts} attempt{existingData.attempts !== 1 ? 's' : ''})
              {existingData.readyForCert && <span className="ml-2 text-green-700 font-medium">&#10003; Ready</span>}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate('/mock-cert-practice')}
            className="mb-4 w-full text-left px-4 py-3 rounded-xl border-2 border-[var(--color-primary)]/40 bg-green-50 hover:bg-green-100 transition-colors"
          >
            <span className="font-semibold text-gray-800">🎙️ Try the AI Mock Exam</span>
            <span className="block text-xs text-gray-600 mt-0.5">Type your answers out loud-style and get graded on substance, like a real manager listening in.</span>
          </button>

          {/* Phase tabs */}
          <div className="flex overflow-x-auto scrollbar-hide gap-1 mb-6 bg-gray-100 rounded-xl p-1">
            {PHASES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setActivePhase(p.key)}
                className={`flex-shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activePhase === p.key
                    ? 'bg-white shadow-sm text-[var(--color-primary)] font-bold'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Phase 1: Training Review */}
          {activePhase === 'phase1' && (
            <div>
              <h3 className="font-bold text-gray-800 mb-3">Training Review (Discussion)</h3>
              <p className="text-sm text-gray-600 mb-4">
                Review each question and check the ones you&apos;ve thought about. No score &mdash; just preparation.
              </p>
              <div className="space-y-3">
                {PHASE1_TRAINING.questions.map((q, i) => (
                  <label key={i} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 rounded accent-[var(--color-primary)]"
                      checked={!!phase1Checked[i]}
                      onChange={() => setPhase1Checked((prev) => ({ ...prev, [i]: !prev[i] }))}
                    />
                    <span className="text-sm text-gray-800">{q}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Phase 2: Local Options */}
          {activePhase === 'phase2' && (
            <div>
              <h3 className="font-bold text-gray-800 mb-1">Local Options ({phase2Score}/{PHASE2_LOCAL_OPTIONS.maxScore} pts)</h3>
              <p className="text-sm text-gray-600 mb-4">1 point each. Mark whether you know the answer.</p>
              <div className="space-y-2">
                {PHASE2_LOCAL_OPTIONS.questions.map((q, i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3">
                    <span className="text-sm text-gray-800 flex-1">{q}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${phase2Answers[i] === 'know' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-50'}`}
                        onClick={() => setPhase2Answers((p) => ({ ...p, [i]: 'know' }))}
                      >
                        I know this
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${phase2Answers[i] === 'study' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-50'}`}
                        onClick={() => setPhase2Answers((p) => ({ ...p, [i]: 'study' }))}
                      >
                        Need to study
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase 3: Food Menu */}
          {activePhase === 'phase3' && (
            <div>
              <h3 className="font-bold text-gray-800 mb-1">Food Menu ({phase3Score}/{PHASE3_FOOD_MENU.targetScore} pts)</h3>
              <p className="text-sm text-gray-600 mb-4">{PHASE3_FOOD_MENU.pointsPerItem} points per item. Check the ones you can describe.</p>
              {PHASE3_FOOD_MENU.categories.map((cat, ci) => (
                <div key={ci} className="mb-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-2">{cat.title}</h4>
                  <div className="space-y-2">
                    {cat.items.map((item, ii) => {
                      const key = `${ci}_${ii}`
                      return (
                        <label key={key} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 cursor-pointer hover:bg-gray-50">
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded accent-[var(--color-primary)]"
                            checked={!!phase3Answers[key]}
                            onChange={() => setPhase3Answers((p) => ({ ...p, [key]: !p[key] }))}
                          />
                          <span className="text-sm text-gray-800">{item}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Phase 4: Bar */}
          {activePhase === 'phase4' && (
            <div>
              <h3 className="font-bold text-gray-800 mb-1">Bar Knowledge ({phase4Score}/{PHASE4_BAR.maxScore} pts)</h3>
              <p className="text-sm text-gray-600 mb-4">Points vary per item. Mark whether you know the answer.</p>
              <div className="space-y-2">
                {PHASE4_BAR.items.map((item, i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex-1">
                      <span className="text-sm text-gray-800">{item.text}</span>
                      <span className="ml-2 text-xs text-gray-400">({item.points} pts)</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${phase4Answers[i] === 'know' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-50'}`}
                        onClick={() => setPhase4Answers((p) => ({ ...p, [i]: 'know' }))}
                      >
                        I know this
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${phase4Answers[i] === 'study' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-50'}`}
                        onClick={() => setPhase4Answers((p) => ({ ...p, [i]: 'study' }))}
                      >
                        Need to study
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase 5: Service */}
          {activePhase === 'phase5' && (
            <div>
              <h3 className="font-bold text-gray-800 mb-1">Service Standards ({phase5Score}/{PHASE5_SERVICE.maxScore} pts)</h3>
              <p className="text-sm text-gray-600 mb-4">1 point each. Mark whether you know the answer.</p>
              <div className="space-y-2">
                {PHASE5_SERVICE.questions.map((q, i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3">
                    <span className="text-sm text-gray-800 flex-1">{q}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${phase5Answers[i] === 'know' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-50'}`}
                        onClick={() => setPhase5Answers((p) => ({ ...p, [i]: 'know' }))}
                      >
                        I know this
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${phase5Answers[i] === 'study' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-50'}`}
                        onClick={() => setPhase5Answers((p) => ({ ...p, [i]: 'study' }))}
                      >
                        Need to study
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Running total + submit (hide on Phase 1 which is discussion-only) */}
          {activePhase === 'phase1' ? (
            <div className="mt-6 rounded-xl border-2 border-gray-300 bg-gray-50 p-4 text-center">
              <p className="text-sm text-gray-600">Phase 1 is discussion-only. Move to Phase 2+ to start scoring.</p>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border-2 border-gray-300 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-lg font-bold text-gray-800">{totalScore}/{TOTAL_POSSIBLE}</span>
                  <span className="ml-2 text-gray-600">({totalPct}%)</span>
                  {isReady && <span className="ml-3 text-green-700 font-bold">&#10003; Ready</span>}
                  {!isReady && totalPct > 0 && <span className="ml-3 text-amber-600 text-sm">Need {READINESS_THRESHOLD}%</span>}
                </div>
                {saveError && <p className="text-sm text-red-600 mb-1">{saveError}</p>}
                <button
                  type="button"
                  className="btn"
                  onClick={() => { setSaveError(null); handleSubmit() }}
                  disabled={saving || totalScore === 0}
                >
                  {saving ? 'Saving...' : 'Submit & save score'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
