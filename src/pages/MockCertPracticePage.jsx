import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import TraineeNavTabs from '../components/TraineeNavTabs'
import { useAuth } from '../contexts/AuthContext'
import { PHASE2_LOCAL_OPTIONS, PHASE3_FOOD_MENU, PHASE4_BAR } from '../data/verbalCertQuestions'
import { PHASE2_ANSWERS, PHASE3_ANSWERS, PHASE4_ANSWERS } from '../data/verbalCertAnswers'
import { gradeMockCertAnswer } from '../services/ai'

const DAILY_CAP = 30
const CAP_KEY_PREFIX = 'mockCertGradesUsed_'

function todayCapKey(traineeId) {
  return `${CAP_KEY_PREFIX}${traineeId}_${new Date().toISOString().slice(0, 10)}`
}

function getGradesUsedToday(traineeId) {
  try {
    return parseInt(localStorage.getItem(todayCapKey(traineeId)) || '0', 10) || 0
  } catch (_) {
    return 0
  }
}

function incrementGradesUsedToday(traineeId) {
  try {
    localStorage.setItem(todayCapKey(traineeId), String(getGradesUsedToday(traineeId) + 1))
  } catch (_) {}
}

/** Flatten a phase into gradable {question, answer} pairs, skipping items with no reference answer yet. */
function buildGradableQuestions(phaseKey) {
  if (phaseKey === 'phase2') {
    return PHASE2_LOCAL_OPTIONS.questions
      .filter((q) => PHASE2_ANSWERS[q])
      .map((q) => ({ question: q, answer: PHASE2_ANSWERS[q] }))
  }
  if (phaseKey === 'phase3') {
    const out = []
    PHASE3_FOOD_MENU.categories.forEach((cat) => {
      cat.items.forEach((item) => {
        const answer = PHASE3_ANSWERS[item]
        if (answer) out.push({ question: item, answer })
      })
    })
    return out
  }
  if (phaseKey === 'phase4') {
    return PHASE4_BAR.items
      .filter((item) => PHASE4_ANSWERS[item.text])
      .map((item) => ({ question: item.text, answer: PHASE4_ANSWERS[item.text] }))
  }
  return []
}

const PHASES = [
  { key: 'phase2', label: 'Local Options' },
  { key: 'phase3', label: 'Food Menu' },
  { key: 'phase4', label: 'Bar' },
]

export default function MockCertPracticePage() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const traineeId = currentUser?.traineeId || currentUser?.id

  const [phaseKey, setPhaseKey] = useState(null)
  const [index, setIndex] = useState(0)
  const [answerText, setAnswerText] = useState('')
  const [grading, setGrading] = useState(false)
  const [result, setResult] = useState(null) // last grade result
  const [sessionResults, setSessionResults] = useState([]) // all grades this session
  const [capReached, setCapReached] = useState(() => getGradesUsedToday(traineeId) >= DAILY_CAP)

  const questions = useMemo(() => (phaseKey ? buildGradableQuestions(phaseKey) : []), [phaseKey])
  const current = questions[index]
  const isLast = index >= questions.length - 1
  const done = phaseKey && index >= questions.length

  function startPhase(key) {
    setPhaseKey(key)
    setIndex(0)
    setAnswerText('')
    setResult(null)
    setSessionResults([])
  }

  async function submitAnswer() {
    if (!answerText.trim() || grading) return
    if (getGradesUsedToday(traineeId) >= DAILY_CAP) {
      setCapReached(true)
      return
    }
    setGrading(true)
    try {
      const graded = await gradeMockCertAnswer(current.question, current.answer, answerText)
      incrementGradesUsedToday(traineeId)
      setResult(graded)
      setSessionResults((prev) => [...prev, { question: current.question, graded }])
    } catch (_) {
      setResult({ feedback: "Couldn't grade that one — try Next and keep going.", correct: null })
    } finally {
      setGrading(false)
    }
  }

  function next() {
    setAnswerText('')
    setResult(null)
    setIndex((i) => i + 1)
  }

  function exitToPicker() {
    setPhaseKey(null)
    setIndex(0)
    setAnswerText('')
    setResult(null)
    setSessionResults([])
  }

  const nailedCount = sessionResults.filter((r) => {
    const g = r.graded
    if (!g) return false
    if (g.correct != null) return g.correct === true
    return (g.missedItems || []).length === 0
  }).length

  return (
    <>
      <AppHeader />
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {currentUser?.role === 'trainee' && <TraineeNavTabs />}
        <div className="flex items-center gap-3 mb-4">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => (phaseKey ? exitToPicker() : navigate('/verbal-cert-practice'))}>
            ← Back
          </button>
          <h1 className="text-lg font-bold text-gray-800">🎙️ Mock Cert Practice</h1>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Type your answer like you're saying it out loud to a manager — an AI partner grades it on substance, not exact wording. Nothing here is saved or counts toward your real certification.
        </p>

        {capReached && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">
            You've used today's practice limit ({DAILY_CAP} graded answers). Come back tomorrow for more, or keep reviewing flashcards in the meantime.
          </div>
        )}

        {!phaseKey && (
          <div className="space-y-2">
            {PHASES.map((p) => {
              const count = buildGradableQuestions(p.key).length
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={capReached || count === 0}
                  onClick={() => startPhase(p.key)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-[var(--color-primary)] hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="font-semibold text-gray-800">{p.label}</span>
                  <span className="ml-2 text-xs text-gray-500">{count} questions available</span>
                </button>
              )
            })}
          </div>
        )}

        {phaseKey && !done && current && (
          <div className="rounded-xl border-2 border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-gray-400 mb-2">Question {index + 1} of {questions.length}</p>
            <p className="font-medium text-gray-800 mb-3">{current.question}</p>

            {!result ? (
              <>
                <textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Type your answer here…"
                  rows={4}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm"
                  disabled={grading}
                />
                <button
                  type="button"
                  onClick={submitAnswer}
                  disabled={grading || !answerText.trim()}
                  className="mt-3 w-full py-3 bg-[var(--color-primary)] text-white font-semibold rounded-xl disabled:opacity-50"
                >
                  {grading ? 'Grading…' : 'Submit answer'}
                </button>
              </>
            ) : (
              <>
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 mb-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">You said:</p>
                  <p className="text-sm text-gray-700">{answerText}</p>
                </div>
                <div className={`rounded-lg border px-3 py-2.5 ${result.correct === false || (result.missedItems || []).length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                  {result.coveredItems && (
                    <div className="mb-1.5">
                      {result.coveredItems.map((it, i) => (
                        <p key={i} className="text-sm text-green-800">✓ {it}</p>
                      ))}
                      {(result.missedItems || []).map((it, i) => (
                        <p key={i} className="text-sm text-amber-800">— {it} (missed)</p>
                      ))}
                    </div>
                  )}
                  <p className="text-sm text-gray-700">{result.feedback}</p>
                </div>
                <button
                  type="button"
                  onClick={next}
                  className="mt-3 w-full py-3 bg-[var(--color-primary)] text-white font-semibold rounded-xl"
                >
                  {isLast ? 'See summary' : 'Next question →'}
                </button>
              </>
            )}
          </div>
        )}

        {done && (
          <div className="rounded-xl border-2 border-gray-200 bg-white p-6 text-center">
            <h2 className="text-xl font-bold text-gray-800">Nice work!</h2>
            <p className="mt-2 text-gray-600">{nailedCount} of {sessionResults.length} nailed it completely</p>
            <div className="mt-6 flex gap-2 justify-center">
              <button type="button" className="btn btn-secondary" onClick={exitToPicker}>Practice another section</button>
              <button type="button" className="btn" onClick={() => navigate('/trainee')}>Done</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
