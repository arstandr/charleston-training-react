import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getFromFirestore } from '../utils/firestore'
import { createVerbalCertification } from '../services/verbalCertService'
import { closeOutCertification } from '../services/certSignOff'
import CertificationReview from '../components/CertificationReview'
import {
  PHASE1_TRAINING,
  PHASE2_LOCAL_OPTIONS,
  PHASE3_FOOD_MENU,
  PHASE4_BAR,
  PHASE5_SERVICE,
  TOTAL_POSSIBLE,
} from '../data/verbalCertQuestions'

export default function VerbalCertPage() {
  const { traineeId } = useParams()
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [traineeName, setTraineeName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedOk, setSavedOk] = useState(false)
  const [activePhase, setActivePhase] = useState(1)
  const [scores, setScores] = useState({
    phase2: 0,
    phase3: 0,
    phase4: 0,
    phase5: 0,
  })
  const [phase1Passed, setPhase1Passed] = useState(null)
  const [phase1Notes, setPhase1Notes] = useState('')
  const [phase2Scores, setPhase2Scores] = useState({})
  const [phase3Checked, setPhase3Checked] = useState({})
  const [phase4Scores, setPhase4Scores] = useState({})
  const [phase5Scores, setPhase5Scores] = useState({})
  const [phase4Step, setPhase4Step] = useState(0)
  const [reviewNotes, setReviewNotes] = useState('')
  const [outcome, setOutcome] = useState('certified')
  const [retrainAreas, setRetrainAreas] = useState([])
  const [attested, setAttested] = useState(false)

  useEffect(() => {
    async function loadTrainee() {
      if (!traineeId) {
        setLoading(false)
        return
      }
      try {
        const result = await getFromFirestore('config', 'trainingData')
        const data = result || {}
        const byId = data.data || data.trainees || data
        const trainee = typeof byId === 'object' && byId[traineeId] ? byId[traineeId] : null
        setTraineeName(trainee?.name || traineeId)
      } catch (_) {
        setTraineeName(traineeId)
      } finally {
        setLoading(false)
      }
    }
    loadTrainee()
  }, [traineeId])

  useEffect(() => {
    if (activePhase === 4) setPhase4Step(0)
  }, [activePhase])

  const totalScore = scores.phase2 + scores.phase3 + scores.phase4 + scores.phase5
  const isReviewPhase = activePhase === 6

  function handleContinue() {
    setActivePhase((p) => Math.min(6, p + 1))
  }

  async function handleCertify() {
    if (!traineeId || !currentUser) return
    if (phase1Passed === null) {
      setSaveError('Please complete Phase 1 — mark the Training Review as Satisfactory or Needs Improvement before certifying.')
      setActivePhase(1)
      return
    }
    if (!attested) {
      setSaveError('Confirm you certified this trainee in person before signing.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const certifiedBy = currentUser.uid ?? currentUser.id
      // Trainee doc first: it can fail on rules, and it throws if it does.
      // Writing the immutable verbalCertifications record second means a
      // failure here leaves no orphan pass record behind.
      await closeOutCertification({
        traineeId,
        certifierEmpNum: currentUser.empNum || '',
        certifierUid: certifiedBy,
        outcome,
        totalScore,
        maxScore: TOTAL_POSSIBLE,
        reviewNotes,
        retrainAreas,
      })
      await createVerbalCertification({
        traineeId,
        traineeName: traineeName || traineeId,
        certifiedBy,
        certifiedByName: currentUser.name || currentUser.displayName || 'Manager',
        certifiedByEmpNum: currentUser.empNum || '',
        outcome,
        reviewNotes: reviewNotes || '',
        retrainAreas: outcome === 'certified' ? [] : retrainAreas,
        scores: {
          phase2: scores.phase2,
          phase3: scores.phase3,
          phase4: scores.phase4,
          phase5: scores.phase5,
        },
        phase1Passed,
        phase1Notes: phase1Notes || undefined,
        totalScore,
        maxScore: TOTAL_POSSIBLE,
        phaseDetails: {
          phase1: { passed: phase1Passed, notes: phase1Notes },
          phase2: phase2Scores,
          phase3: phase3Checked,
          phase4: phase4Scores,
          phase5: phase5Scores,
        },
      })
      setSavedOk(true)
      setTimeout(() => navigate('/manager', { replace: true }), 1500)
    } catch (e) {
      console.error(e)
      setSaveError('Failed to save certification: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  const phases = [
    { num: 1, title: 'Training Review', passFail: true, passed: phase1Passed },
    { num: 2, title: 'Local Options', max: PHASE2_LOCAL_OPTIONS.maxScore, score: scores.phase2 },
    { num: 3, title: 'Food Menu', max: PHASE3_FOOD_MENU.targetScore, score: scores.phase3 },
    { num: 4, title: 'Bar', max: PHASE4_BAR.maxScore, score: scores.phase4 },
    { num: 5, title: 'Service', max: PHASE5_SERVICE.maxScore, score: scores.phase5 },
    { num: 6, title: 'Review', review: true },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/manager')}
              className="px-3 py-2 rounded-lg hover:bg-green-700"
            >
              ← Back
            </button>
            <h1 className="text-xl font-bold">🎓 Verbal Certification</h1>
          </div>
          <span className="text-green-200 truncate max-w-[140px] sm:max-w-none">{traineeName || traineeId}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6 flex flex-wrap gap-2">
          {phases.map((p) => (
            <button
              key={p.num}
              type="button"
              onClick={() => setActivePhase(p.num)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors shrink-0 text-xs sm:text-sm ${
                activePhase === p.num
                  ? 'bg-green-700 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
              }`}
            >
              {p.review
                ? 'Review & sign-off'
                : `Phase ${p.num}: ${p.passFail ? (p.passed === true ? '✅' : p.passed === false ? '❌' : '—') : `${p.score}/${p.max}`}`}
            </button>
          ))}
        </div>

        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-lg font-bold text-gray-800 dark:text-white">
            Total: {totalScore} / {TOTAL_POSSIBLE}
          </div>
        </div>

        {activePhase === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Phase 1 — Training Review</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">Discussion prompts — no numeric scoring.</p>
            <div className="space-y-2">
              {PHASE1_TRAINING.questions.map((q, idx) => (
                <div key={idx} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                  <p className="text-sm text-gray-800 dark:text-gray-200">{q}</p>
                </div>
              ))}
            </div>
            <div className="phase1-assessment space-y-3 pt-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Manager Notes (optional)</label>
              <textarea
                placeholder="Note any standout responses or concerns..."
                value={phase1Notes}
                onChange={(e) => setPhase1Notes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
              />
              <div className="phase1-pass-fail flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Overall Training Review:</span>
                <button
                  type="button"
                  onClick={() => setPhase1Passed(true)}
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors ${phase1Passed === true ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-green-100 dark:hover:bg-green-900/30'}`}
                >
                  ✅ Satisfactory
                </button>
                <button
                  type="button"
                  onClick={() => setPhase1Passed(false)}
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors ${phase1Passed === false ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30'}`}
                >
                  ❌ Needs Improvement
                </button>
              </div>
            </div>
          </div>
        )}

        {activePhase === 2 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Phase 2 — Local Options</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">Tap thumbs up or down for each item (1 pt each, max {PHASE2_LOCAL_OPTIONS.maxScore})</p>
            {PHASE2_LOCAL_OPTIONS.questions.map((q, idx) => {
              const val = phase2Scores[idx]
              return (
                <div key={idx} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                  <span className="text-sm text-gray-800 dark:text-gray-200 flex-1">{q}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-lg transition-colors ${val === 0 ? 'bg-red-100 ring-2 ring-red-400' : 'bg-gray-100 hover:bg-red-50'}`}
                      onClick={() => {
                        setPhase2Scores((prev) => {
                          const next = { ...prev, [idx]: 0 }
                          setScores((s) => ({ ...s, phase2: Object.values(next).reduce((a, b) => a + b, 0) }))
                          return next
                        })
                      }}
                      aria-label="Fail"
                    >
                      👎
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-lg transition-colors ${val === 1 ? 'bg-green-100 ring-2 ring-green-400' : 'bg-gray-100 hover:bg-green-50'}`}
                      onClick={() => {
                        setPhase2Scores((prev) => {
                          const next = { ...prev, [idx]: 1 }
                          setScores((s) => ({ ...s, phase2: Object.values(next).reduce((a, b) => a + b, 0) }))
                          return next
                        })
                      }}
                      aria-label="Pass"
                    >
                      👍
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {activePhase === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Phase 3 — Food Menu</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{PHASE3_FOOD_MENU.pointsPerItem} pts per item (max {PHASE3_FOOD_MENU.targetScore})</p>
            {PHASE3_FOOD_MENU.categories.map((cat, cIdx) => (
              <div key={cIdx} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
                <h3 className="font-semibold text-gray-800 dark:text-white mb-2">{cat.title}</h3>
                <div className="space-y-2">
                  {cat.items.map((item, iIdx) => {
                    const key = `${cIdx}-${iIdx}`
                    const checked = phase3Checked[key]
                    return (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!checked}
                          onChange={(e) => {
                            const next = { ...phase3Checked, [key]: e.target.checked }
                            setPhase3Checked(next)
                            const count = Object.values(next).filter(Boolean).length
                            const raw = count * PHASE3_FOOD_MENU.pointsPerItem
                            setScores((s) => ({ ...s, phase3: Math.min(raw, PHASE3_FOOD_MENU.targetScore) }))
                          }}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-800 dark:text-gray-200">{item}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {activePhase === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Phase 4 — Bar</h2>

            {/* Progress indicator row */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400 shrink-0">
                Item {phase4Step + 1} of {PHASE4_BAR.items.length}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-1.5 rounded-full bg-green-600 transition-all"
                  style={{ width: `${((phase4Step + 1) / PHASE4_BAR.items.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Current item card */}
            {(() => {
              const item = PHASE4_BAR.items[phase4Step]
              return (
                <div className="rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-5 shadow-sm">
                  <p className="font-bold text-gray-800 dark:text-white mb-1">{item.text}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Worth {item.points} pts</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={item.points}
                      value={phase4Scores[phase4Step] ?? ''}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        const val = isNaN(v) ? 0 : v
                        setPhase4Scores((prev) => {
                          const next = { ...prev, [phase4Step]: val }
                          const total = PHASE4_BAR.items.reduce((sum, it, i) => sum + (Number(next[i]) || 0), 0)
                          setScores((s) => ({ ...s, phase4: total }))
                          return next
                        })
                      }}
                      className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">/ {item.points}</span>
                  </div>
                </div>
              )
            })()}

            {/* Prev / Next nav row */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPhase4Step((s) => Math.max(0, s - 1))}
                disabled={phase4Step === 0}
                className="flex-1 py-3 rounded-xl border border-gray-300 bg-white dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPhase4Step((s) => Math.min(PHASE4_BAR.items.length - 1, s + 1))}
                disabled={phase4Step === PHASE4_BAR.items.length - 1}
                className="flex-1 py-3 rounded-xl bg-green-700 text-white font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>

            {/* Sticky Continue CTA — appears only when all Phase 4 items are scored */}
            {PHASE4_BAR.items.every((_, i) => phase4Scores[i] !== undefined && String(phase4Scores[i]) !== '') && (
              <div className="sticky bottom-4 z-10 mt-2">
                <button
                  type="button"
                  onClick={handleContinue}
                  className="w-full py-4 bg-green-700 text-white font-bold text-base rounded-xl shadow-lg shadow-green-900/30 hover:bg-green-800 active:bg-green-900 transition-colors"
                >
                  Continue to Phase 5 →
                </button>
              </div>
            )}
          </div>
        )}

        {activePhase === 5 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Phase 5 — Service</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">Tap thumbs up or down for each item (1 pt each, max {PHASE5_SERVICE.maxScore})</p>
            {PHASE5_SERVICE.questions.map((q, idx) => {
              const val = phase5Scores[idx]
              return (
                <div key={idx} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                  <span className="text-sm text-gray-800 dark:text-gray-200 flex-1">{q}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-lg transition-colors ${val === 0 ? 'bg-red-100 ring-2 ring-red-400' : 'bg-gray-100 hover:bg-red-50'}`}
                      onClick={() => {
                        const next = { ...phase5Scores, [idx]: 0 }
                        setPhase5Scores(next)
                        setScores((s) => ({ ...s, phase5: Object.values(next).reduce((a, b) => a + b, 0) }))
                      }}
                      aria-label="Fail"
                    >
                      👎
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-lg transition-colors ${val === 1 ? 'bg-green-100 ring-2 ring-green-400' : 'bg-gray-100 hover:bg-green-50'}`}
                      onClick={() => {
                        const next = { ...phase5Scores, [idx]: 1 }
                        setPhase5Scores(next)
                        setScores((s) => ({ ...s, phase5: Object.values(next).reduce((a, b) => a + b, 0) }))
                      }}
                      aria-label="Pass"
                    >
                      👍
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {activePhase === 6 && (
          <CertificationReview
            traineeName={traineeName}
            traineeId={traineeId}
            store={currentUser?.store}
            phaseMax={{
              phase2: PHASE2_LOCAL_OPTIONS.maxScore,
              phase3: PHASE3_FOOD_MENU.targetScore,
              phase4: PHASE4_BAR.maxScore,
              phase5: PHASE5_SERVICE.maxScore,
            }}
            scores={scores}
            phase1Passed={phase1Passed}
            phase1Notes={phase1Notes}
            totalScore={totalScore}
            maxScore={TOTAL_POSSIBLE}
            reviewNotes={reviewNotes}
            onReviewNotesChange={setReviewNotes}
            outcome={outcome}
            onOutcomeChange={setOutcome}
            retrainAreas={retrainAreas}
            onRetrainAreasChange={setRetrainAreas}
            attested={attested}
            onAttestedChange={setAttested}
            certifierName={currentUser?.name || currentUser?.displayName || 'Manager'}
            certifierEmpNum={currentUser?.empNum}
            saving={saving}
            error={saveError}
            onSubmit={handleCertify}
          />
        )}

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-3">
          {saveError && !isReviewPhase && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              {saveError}
            </div>
          )}
          {savedOk && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 font-medium">
              {outcome === 'certified'
                ? '✅ Trainee certified successfully. Returning to dashboard…'
                : '✅ Review saved — trainee stays on the roster. Returning to dashboard…'}
            </div>
          )}
          {!savedOk && !isReviewPhase && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={saving}
              className="px-8 py-3 bg-green-700 text-white font-bold rounded-xl hover:bg-green-800 disabled:opacity-50"
            >
              {activePhase === 5 ? 'Next: Review & sign-off →' : `Next: Phase ${activePhase + 1} →`}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
