import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import TraineeNavTabs from '../components/TraineeNavTabs'
import { useAuth } from '../contexts/AuthContext'
import { PHASE2_LOCAL_OPTIONS, PHASE3_FOOD_MENU, PHASE4_BAR } from '../data/verbalCertQuestions'
import { PHASE2_ANSWERS, PHASE3_ANSWERS, PHASE4_ANSWERS } from '../data/verbalCertAnswers'
import { TRAINING_SCENARIOS } from '../data/standardsData'
import { gradeMockCertAnswer, getGuestRoleplayReply } from '../services/ai'

const DAILY_CAP = 30
const CAP_KEY_PREFIX = 'mockCertGradesUsed_'
const ROLEPLAY_TURN_CAP = 8

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

  const [scenario, setScenario] = useState(null)
  const [chat, setChat] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [roleplayDone, setRoleplayDone] = useState(false)
  const [roleplayError, setRoleplayError] = useState(false)

  const isRoleplay = phaseKey === 'roleplay'
  const questions = useMemo(() => (phaseKey && !isRoleplay ? buildGradableQuestions(phaseKey) : []), [phaseKey, isRoleplay])
  const current = questions[index]
  const isLast = index >= questions.length - 1
  const done = phaseKey && !isRoleplay && index >= questions.length

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
    setScenario(null)
    setChat([])
    setChatInput('')
    setRoleplayDone(false)
    setRoleplayError(false)
  }

  function splitCoachNote(reply) {
    const idx = reply.indexOf('COACH:')
    if (idx === -1) return [reply.trim(), null]
    return [reply.slice(0, idx).trim(), reply.slice(idx + 'COACH:'.length).trim()]
  }

  async function startRoleplay() {
    if (getGradesUsedToday(traineeId) >= DAILY_CAP) {
      setCapReached(true)
      return
    }
    const scn = TRAINING_SCENARIOS[Math.floor(Math.random() * TRAINING_SCENARIOS.length)]
    setPhaseKey('roleplay')
    setScenario(scn)
    setChat([])
    setChatInput('')
    setRoleplayDone(false)
    setRoleplayError(false)
    setChatSending(true)
    try {
      const opening = await getGuestRoleplayReply([], scn, false)
      incrementGradesUsedToday(traineeId)
      setChat([{ role: 'guest', text: opening.trim() }])
    } catch (_) {
      setRoleplayError(true)
    } finally {
      setChatSending(false)
    }
  }

  async function sendRoleplayMessage(text) {
    if (!text.trim() || chatSending || roleplayDone) return
    if (getGradesUsedToday(traineeId) >= DAILY_CAP) {
      setCapReached(true)
      return
    }
    const nextHistory = [...chat, { role: 'trainee', text: text.trim() }]
    setChat(nextHistory)
    setChatInput('')
    setRoleplayError(false)
    setChatSending(true)
    const traineeTurns = nextHistory.filter((m) => m.role === 'trainee').length
    const isFinalTurn = traineeTurns >= ROLEPLAY_TURN_CAP
    try {
      const reply = await getGuestRoleplayReply(nextHistory, scenario, isFinalTurn)
      incrementGradesUsedToday(traineeId)
      const [guestLine, coachLine] = splitCoachNote(reply)
      setChat((prev) => [...prev, { role: 'guest', text: guestLine }])
      if (coachLine) {
        setChat((prev) => [...prev, { role: 'coach', text: coachLine }])
        setRoleplayDone(true)
      }
    } catch (_) {
      setRoleplayError(true)
    } finally {
      setChatSending(false)
    }
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
            <button
              type="button"
              disabled={capReached}
              onClick={startRoleplay}
              className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-[var(--color-primary)] hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="font-semibold text-gray-800">🎭 Guest Role-Play</span>
              <span className="ml-2 text-xs text-gray-500">improvise a live scenario with an AI guest</span>
            </button>
          </div>
        )}

        {isRoleplay && (
          <div className="rounded-xl border-2 border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-gray-400 mb-2">{scenario?.title}</p>
            <div className="space-y-2 mb-3 max-h-96 overflow-y-auto">
              {chat.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === 'coach'
                      ? 'rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800'
                      : m.role === 'trainee'
                        ? 'rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-gray-800 ml-8'
                        : 'rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-800 mr-8'
                  }
                >
                  {m.role === 'coach' && <span className="font-semibold">Coach: </span>}
                  {m.text}
                </div>
              ))}
              {chatSending && <p className="text-xs text-gray-400">…</p>}
              {roleplayError && <p className="text-xs text-red-500">Couldn't reach the AI guest — try sending again.</p>}
            </div>
            {!roleplayDone ? (
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendRoleplayMessage(chatInput)}
                  placeholder="Respond to the guest…"
                  className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg text-sm"
                  disabled={chatSending}
                />
                <button
                  type="button"
                  onClick={() => sendRoleplayMessage(chatInput)}
                  disabled={chatSending || !chatInput.trim()}
                  className="btn disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            ) : (
              <button type="button" onClick={exitToPicker} className="mt-1 w-full py-3 bg-[var(--color-primary)] text-white font-semibold rounded-xl">
                Practice another scenario
              </button>
            )}
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
