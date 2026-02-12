import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, useLocation, Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import TraineeNavTabs from '../components/TraineeNavTabs'
import { useAuth } from '../contexts/AuthContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useTestActive } from '../contexts/TestActiveContext'
import { useTestAttempts } from '../hooks/useTestAttempts'
import { useFlashcardMastery } from '../hooks/useFlashcardMastery'
import { getSocraticHint, getExamHint } from '../services/ai'
import { tryAcquireLock, releaseLock } from '../services/testLock'
import { fireConfetti } from '../utils/confetti'
import { QUIZ_DATABASE, TESTS, PRETTY_TEST_NAMES } from '../data/quizDatabase'
import { FLASHCARD_DATABASE } from '../data/flashcardDatabase'
import { stableCardId } from '../utils/helpers'
import { buildAdaptiveOfficialTest, getNextInfiniteQuestion } from '../utils/quizAdaptive'

const PRACTICE_QUESTION_COUNT = 10
const PRACTICE_QUESTION_COUNT_STRUGGLE = 20
const OFFICIAL_QUESTION_COUNT = 28
const PRACTICE_SESSION_KEY = 'practiceTestSession'

const TEST_TO_FLASHCARD_SET = {
  bar_test: 'bar-beer',
  wines_test: 'wines-cocktails',
  soups_test: 'starters-soups-salads',
  steaks_test: 'steaks-specialties',
  bonus_test: 'bonus-points',
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getQuestions(testId, mode, practiceCount = PRACTICE_QUESTION_COUNT) {
  const quiz = QUIZ_DATABASE[testId]
  if (!quiz || !quiz.questions || !quiz.questions.length) return { questions: [], indices: [] }
  const all = quiz.questions
  const count = mode === 'practice' ? Math.min(practiceCount, all.length) : Math.min(OFFICIAL_QUESTION_COUNT, all.length)
  const indices = all.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]]
  }
  const selected = indices.slice(0, count)
  const questions = selected.map((i) => all[i])
  return { questions, indices: selected }
}

function prettyTestName(id) {
  if (!id) return ''
  return PRETTY_TEST_NAMES[id] || (TESTS.find((t) => t.id === id)?.title || id).replace(/\s*-\s*Final Test$/i, '').trim() || id
}

export default function QuizzesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentUser } = useAuth()
  const traineeId = currentUser?.traineeId || currentUser?.id
  const confirm = useConfirm()
  const { setTestActive } = useTestActive()
  const { getAttempts, getRequiredScore, canTake, recordAttempt, getBestScore } = useTestAttempts(traineeId)
  const { getStruggleCards, getMastery, recordResult } = useFlashcardMastery(traineeId)

  const testId = searchParams.get('test')
  const mode = searchParams.get('mode') || 'practice'

  const [sessionState, setSessionState] = useState({
    questions: [],
    indices: [],
    index: 0,
    answers: [],
    chosen: null,
    showResult: false,
    streak: 0,
  })
  const [results, setResults] = useState(null)
  const [pendingOfficialTest, setPendingOfficialTest] = useState(null)
  const [hintsRemaining, setHintsRemaining] = useState(null)
  const [eliminatedOptions, setEliminatedOptions] = useState(new Set())
  const [socraticHint, setSocraticHint] = useState(null)
  const [socraticLoading, setSocraticLoading] = useState(false)
  const [examHint, setExamHint] = useState(null)
  const [examHintLoading, setExamHintLoading] = useState(false)
  const [lockError, setLockError] = useState(null)
  const [loadingNextPractice, setLoadingNextPractice] = useState(false)

  const generatedFromState = location.state?.generatedQuestions
  const quiz = testId === 'generated' ? { title: location.state?.fromSetTitle || 'AI Practice', questions: generatedFromState || [] } : (testId ? QUIZ_DATABASE[testId] : null)
  const currentQ = sessionState.questions[sessionState.index]
  const passingScore = mode === 'official' && testId && testId !== 'generated' && traineeId ? getRequiredScore(testId) : (quiz?.passing_score ?? 85)

  useEffect(() => {
    if (testId === 'generated' && generatedFromState?.length > 0 && sessionState.questions.length === 0) {
      setSessionState({ questions: generatedFromState, indices: generatedFromState.map((_, i) => i), index: 0, answers: [], chosen: null, showResult: false })
      return
    }
    if (!testId || !quiz?.questions?.length || sessionState.questions.length > 0) return
    if (mode === 'official') {
      const q = QUIZ_DATABASE[testId]
      const displayName = (q?.title || prettyTestName(testId)).replace(/\s*-\s*Final Test$/i, '').trim()
      setPendingOfficialTest({ id: testId, displayName })
      return
    }
    if (mode !== 'practice' || !traineeId) return
    try {
      const key = `${PRACTICE_SESSION_KEY}_${traineeId}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.testId === testId && saved.mode === 'practice') {
          const all = quiz.questions
          const questions = (saved.indices || []).map((i) => all[i]).filter(Boolean)
          if (questions.length > 0) {
            setSessionState({
              questions,
              indices: saved.indices || [],
              index: saved.index ?? 0,
              answers: Array.isArray(saved.answers) ? saved.answers : [],
              chosen: null,
              showResult: false,
              cardIds: [],
            })
            return
          }
        }
      }
      const data = { QUIZ_DATABASE, TEST_TO_FLASHCARD_SET, FLASHCARD_DATABASE, stableCardId }
      const { question, index: poolIndex, cardId } = getNextInfiniteQuestion(testId, traineeId, { getMastery }, [], data)
      if (!question) {
        const { questions: qs, indices: idx } = getQuestions(testId, mode, PRACTICE_QUESTION_COUNT)
        setSessionState({ questions: qs, indices: idx, index: 0, answers: [], chosen: null, showResult: false, streak: 0, cardIds: [] })
        if (traineeId) try { localStorage.setItem(key, JSON.stringify({ testId, mode: 'practice', indices: idx, index: 0, answers: [] })) } catch (_) {}
      } else {
        setSessionState({
          questions: [question],
          indices: [poolIndex],
          index: 0,
          answers: [],
          chosen: null,
          showResult: false,
          streak: 0,
          cardIds: [cardId],
        })
        if (traineeId) try { localStorage.setItem(key, JSON.stringify({ testId, mode: 'practice', indices: [poolIndex], index: 0, answers: [] })) } catch (_) {}
      }
    } catch (_) {}
  }, [testId, mode, traineeId])

  useEffect(() => {
    if (mode !== 'official' || !testId || !traineeId) return
    const onUnload = () => { releaseLock(traineeId) }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [mode, testId, traineeId])

  useEffect(() => {
    return () => setTestActive(false)
  }, [setTestActive])

  useEffect(() => {
    if (!traineeId || mode !== 'practice' || !testId || sessionState.questions.length === 0) return
    if (results) return
    if (sessionState.indices.length === 0) return
    try {
      const key = `${PRACTICE_SESSION_KEY}_${traineeId}`
      localStorage.setItem(
        key,
        JSON.stringify({
          testId,
          mode: 'practice',
          indices: sessionState.indices,
          index: sessionState.index,
          answers: sessionState.answers,
        })
      )
    } catch (_) {}
  }, [traineeId, testId, mode, sessionState.index, sessionState.answers, sessionState.indices, sessionState.questions.length, results])

  const HINTS_PER_OFFICIAL_TEST = 2

  const startQuiz = (id, m, restored = null) => {
    setPendingOfficialTest(null)
    setHintsRemaining(m === 'official' ? HINTS_PER_OFFICIAL_TEST : null)
    setEliminatedOptions(new Set())
    if (m === 'official') setTestActive(true)
    if (restored) {
      setSearchParams({ test: id, mode: m })
      setSessionState({
        questions: restored.questions,
        indices: restored.indices || [],
        index: restored.index,
        answers: restored.answers || [],
        chosen: null,
        showResult: false,
      })
      setResults(null)
      return
    }
    const setId = TEST_TO_FLASHCARD_SET[id]
    const struggleCount = setId && traineeId ? getStruggleCards(setId).length : 0
    const practiceCount = struggleCount > 0 ? PRACTICE_QUESTION_COUNT_STRUGGLE : PRACTICE_QUESTION_COUNT
    let questions, indices
    if (m === 'official' && traineeId) {
      const out = buildAdaptiveOfficialTest(id, traineeId, { getAttempts, getMastery }, {
        QUIZ_DATABASE,
        TEST_TO_FLASHCARD_SET,
        FLASHCARD_DATABASE,
        stableCardId,
      })
      questions = out.questions
      indices = out.indices
    } else {
      const out = getQuestions(id, m, practiceCount)
      questions = out.questions
      indices = out.indices
    }
    setSearchParams({ test: id, mode: m })
    setSessionState({ questions, indices, index: 0, answers: [], chosen: null, showResult: false })
    setResults(null)
    if (traineeId && m === 'practice') {
      try {
        const key = `${PRACTICE_SESSION_KEY}_${traineeId}`
        localStorage.setItem(key, JSON.stringify({ testId: id, mode: m, indices, index: 0, answers: [] }))
      } catch (_) {}
    }
  }

  const confirmStartOfficial = (id) => {
    setLockError(null)
    const q = QUIZ_DATABASE[id]
    const displayName = (q?.title || prettyTestName(id)).replace(/\s*-\s*Final Test$/i, '').trim()
    setPendingOfficialTest({ id, displayName })
  }

  const startOfficialWithLock = async () => {
    if (!pendingOfficialTest || !traineeId) return
    const deviceAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined
    let acquired = false
    try {
      const result = await tryAcquireLock(traineeId, pendingOfficialTest.id, deviceAgent)
      acquired = result.acquired
      if (!acquired) {
        setLockError(result.reason || 'Could not acquire lock. You can still start below (lock may be disabled).')
      } else {
        setLockError(null)
      }
    } catch (e) {
      setLockError(e?.message || 'Lock check failed. You can still start the test.')
    }
    startQuiz(pendingOfficialTest.id, 'official')
  }

  const exitQuiz = () => {
    setTestActive(false)
    if (mode === 'official' && traineeId) {
      releaseLock(traineeId)
    }
    setSearchParams({})
    setResults(null)
    if (traineeId) {
      try {
        localStorage.removeItem(`${PRACTICE_SESSION_KEY}_${traineeId}`)
      } catch (_) {}
    }
  }

  const handleExitQuiz = async () => {
    const inProgress = sessionState.questions.length > 0 && (sessionState.answers.length > 0 || sessionState.index > 0)
    if (inProgress) {
      const ok = await confirm('Leave quiz? Your progress will be lost.', 'Exit quiz')
      if (!ok) return
    }
    exitQuiz()
  }

  const handleSelectAnswer = (choiceIndex) => {
    if (sessionState.showResult) return
    const correct = currentQ.ans === choiceIndex
    const nextStreak = correct ? (sessionState.streak || 0) + 1 : 0
    if (mode === 'practice' && traineeId && recordResult && sessionState.cardIds?.[sessionState.index]) {
      recordResult(sessionState.cardIds[sessionState.index], correct ? 'gotIt' : 'needsPractice')
    }
    setSessionState((s) => ({
      ...s,
      chosen: choiceIndex,
      showResult: true,
      answers: [...s.answers, { choiceIndex, correct }],
      streak: nextStreak,
    }))
    setEliminatedOptions(new Set())
  }

  const endPracticeAndShowResults = () => {
    setTestActive(false)
    const totalCorrect = sessionState.answers.reduce((n, a) => n + (a.correct ? 1 : 0), 0)
    const total = sessionState.questions.length
    const score = total ? Math.round((totalCorrect / total) * 100) : 0
    const required = mode === 'official' && testId && traineeId ? getRequiredScore(testId) : passingScore
    const passed = score >= required
    const hintsUsed = mode === 'official' && hintsRemaining != null ? HINTS_PER_OFFICIAL_TEST - hintsRemaining : undefined
    if (testId && mode === 'official' && traineeId) recordAttempt(testId, score, passed, hintsUsed != null ? { hintsUsed } : undefined)
    if (traineeId) releaseLock(traineeId)
    if (score >= 100) fireConfetti({ count: 40, duration: 2500 })
    setResults({ score, passed, totalCorrect, total })
    if (traineeId) try { localStorage.removeItem(`${PRACTICE_SESSION_KEY}_${traineeId}`) } catch (_) {}
  }

  const handleNext = () => {
    setSocraticHint(null)
    setExamHint(null)
    setEliminatedOptions(new Set())
    if (sessionState.index >= sessionState.questions.length - 1) {
      if (mode === 'official') {
        endPracticeAndShowResults()
      } else {
        setLoadingNextPractice(true)
        const data = { QUIZ_DATABASE, TEST_TO_FLASHCARD_SET, FLASHCARD_DATABASE, stableCardId }
        const history = (sessionState.indices || []).slice(-4)
        const { question: nextQ, index: nextPoolIndex, cardId: nextCardId } = getNextInfiniteQuestion(testId, traineeId, { getMastery }, history, data)
        setLoadingNextPractice(false)
        if (nextQ != null) {
          setSessionState((s) => ({
            ...s,
            questions: [...s.questions, nextQ],
            indices: [...(s.indices || []), nextPoolIndex],
            cardIds: [...(s.cardIds || []), nextCardId],
            index: s.questions.length,
            chosen: null,
            showResult: false,
          }))
          if (traineeId) {
            try {
              localStorage.setItem(
                `${PRACTICE_SESSION_KEY}_${traineeId}`,
                JSON.stringify({ testId, mode: 'practice', indices: [...(sessionState.indices || []), nextPoolIndex], index: sessionState.questions.length, answers: sessionState.answers })
              )
            } catch (_) {}
          }
        } else {
          endPracticeAndShowResults()
        }
      }
    } else {
      setSessionState((s) => ({
        ...s,
        index: s.index + 1,
        chosen: null,
        showResult: false,
      }))
    }
  }

  const useHint = () => {
    if (sessionState.showResult || !currentQ) return
    if (hintsRemaining !== null && hintsRemaining <= 0) return
    const opts = currentQ.opts || []
    const correctIndex = typeof currentQ.ans === 'number' ? currentQ.ans : 0
    const wrongIndices = opts.map((_, i) => i).filter((i) => i !== correctIndex && !eliminatedOptions.has(i))
    if (wrongIndices.length === 0) return
    const toEliminate = wrongIndices[Math.floor(Math.random() * wrongIndices.length)]
    setEliminatedOptions((prev) => new Set([...prev, toEliminate]))
    if (hintsRemaining !== null) setHintsRemaining((h) => (h != null ? h - 1 : 0))
  }

  const requestSocraticHint = async () => {
    if (sessionState.showResult || socraticLoading || !currentQ) return
    setSocraticHint(null)
    setSocraticLoading(true)
    try {
      const hint = await getSocraticHint(currentQ.q, currentQ.opts, currentQ.ans)
      setSocraticHint(hint)
    } catch (e) {
      setSocraticHint('Unable to load hint. Try "Guide Me" to eliminate a wrong answer.')
    } finally {
      setSocraticLoading(false)
    }
  }

  const requestExamHint = async () => {
    if (sessionState.showResult || examHintLoading || !currentQ) return
    if (hintsRemaining != null && hintsRemaining <= 0) {
      alert('No hints remaining')
      return
    }
    setExamHint(null)
    setExamHintLoading(true)
    try {
      const correctAnswer = (currentQ.opts || [])[currentQ.ans]
      const hint = await getExamHint(currentQ.q, correctAnswer ?? '')
      setExamHint(hint)
      if (hintsRemaining != null) setHintsRemaining((h) => Math.max(0, (h ?? 0) - 1))
    } catch (e) {
      setExamHint('Unable to load hint. Please try again.')
    } finally {
      setExamHintLoading(false)
    }
  }


  function StudyNav() {
    return (
      <nav className="study-nav">
        <button type="button" className="link-style bg-transparent border-0 cursor-pointer p-0" onClick={() => navigate('/trainee')}>
          ← Dashboard
        </button>
        <span className="text-gray-400">·</span>
        <Link to="/flashcards">Flashcards</Link>
        <span className="text-gray-400">·</span>
        <span className="font-semibold text-gray-800">Practice Tests &amp; Tests</span>
      </nav>
    )
  }

  if (!testId) {
    const allIds = Object.keys(QUIZ_DATABASE || {})
    const practiceTestIds = allIds
    const officialTestIds = allIds.filter((id) => id !== 'bonus_test')
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <h2 className="study-page-title text-xl">Practice Tests &amp; Tests</h2>

          <div className="rounded-b-xl bg-white px-4 py-6 shadow-sm">
          {/* Practice Tests section */}
          <section className="mb-10">
            <h3 className="mb-1 text-lg font-bold text-gray-800">Practice Tests</h3>
            <p className="mb-4 text-sm text-gray-600">
              Quick practice. Take as many times as you want!
            </p>
            <p className="mb-4 text-xs text-gray-500">10 random questions — unlimited attempts</p>
            <div className="space-y-4">
              {practiceTestIds.map((id) => {
                const q = QUIZ_DATABASE[id]
                const displayName = (q?.title || prettyTestName(id)).replace(/\s*-\s*Final Test$/i, '').trim()
                const practiceTitle = id === 'bonus_test' ? 'Bonus Points' : `${displayName} Practice`
                return (
                  <div key={id} className="rounded-xl border border-gray-200 border-l-4 border-l-[var(--color-primary)] bg-white p-4 shadow-sm">
                    <h4 className="font-bold text-gray-800">{practiceTitle}</h4>
                    <p className="mt-1 text-sm text-gray-500">
                      {id === 'bonus_test' ? 'Extra practice from service standards, procedures, and policy' : '10 Random Questions'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 items-center">
                      <button type="button" className="btn btn-small" onClick={() => startQuiz(id, 'practice')}>
                        Practice test
                      </button>
                      {TEST_TO_FLASHCARD_SET[id] && (
                        <Link
                          to={`/flashcards?set=${encodeURIComponent(TEST_TO_FLASHCARD_SET[id])}`}
                          className="btn btn-small btn-secondary"
                        >
                          Flashcards for this test
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Official Tests section */}
          <section id="tests" className="mb-6">
            <h3 className="mb-1 text-lg font-bold text-gray-800">Official Tests</h3>
            <p className="mb-2 text-sm text-gray-600">
              28 Core + 5 Bonus per test. Pass/fail on core only (85%). Attempt 1: 85% to pass | Attempt 2: 90% to pass.
            </p>
            <p className="mb-4 text-xs text-gray-500">Full comprehensive tests — 2 attempts</p>
            <div className="space-y-4">
              {officialTestIds.map((id) => {
                const q = QUIZ_DATABASE[id]
                const { count, passed } = getAttempts(id)
                const best = getBestScore(id)
                const officialAllowed = canTake(id)
                const displayName = (q?.title || prettyTestName(id)).replace(/\s*-\s*Final Test$/i, '').trim()
                return (
                  <div key={id} className="rounded-xl border border-gray-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm">
                    <h4 className="font-bold text-gray-800">{displayName}</h4>
                    <p className="mt-1 text-sm text-gray-500">
                      Attempts: {count}/2 · Best: {best}%{passed ? ' (Passed)' : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">Pass: 85% first attempt, 90% second attempt</p>
                    <div className="mt-4 flex flex-wrap gap-2 items-center">
                      <button type="button" className="btn btn-small" onClick={() => startQuiz(id, 'practice')}>
                        Practice test
                      </button>
                      {TEST_TO_FLASHCARD_SET[id] && (
                        <Link
                          to={`/flashcards?set=${encodeURIComponent(TEST_TO_FLASHCARD_SET[id])}`}
                          className="btn btn-small btn-secondary"
                        >
                          Flashcards for this test
                        </Link>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => officialAllowed.allowed ? confirmStartOfficial(id) : undefined}
                        disabled={!officialAllowed.allowed}
                        title={!officialAllowed.allowed ? officialAllowed.reason : ''}
                      >
                        Take Test
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
          </div>

          {/* Official test start confirmation modal */}
          {pendingOfficialTest && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="max-w-md rounded-xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-bold text-gray-800">Start official test?</h3>
                <p className="mt-2 text-gray-600">
                  This will count toward your 2 attempts. ({pendingOfficialTest.displayName})
                </p>
                {lockError && (
                  <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{lockError}</p>
                )}
                <div className="mt-6 flex gap-3 justify-end">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setPendingOfficialTest(null)
                      setLockError(null)
                      setSearchParams({})
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={startOfficialWithLock}
                  >
                    Start Test
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    )
  }

  if (results) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-2xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <div className="content-area text-center py-10">
            <h2 className="text-xl font-bold text-gray-800">Results</h2>
            <div
              className={`mx-auto mt-6 flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white ${
                results.passed ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              {results.score}%
            </div>
            <p className={`mt-4 text-lg font-semibold ${results.passed ? 'text-green-600' : 'text-red-600'}`}>
              {results.passed ? 'Passed' : 'Not passed'}
            </p>
            <p className="mt-2 text-gray-600">
              {results.totalCorrect} / {results.total} correct
            </p>
            {mode === 'official' && !results.passed && (
              <p className="mt-2 text-sm text-gray-500">Passing score: {passingScore}%</p>
            )}
            <button type="button" className="btn mt-6" onClick={handleExitQuiz}>
              Back to Practice Tests
            </button>
          </div>
        </div>
      </>
    )
  }

  if (!currentQ) {
    const hasTestInUrl = testId && quiz?.questions?.length > 0
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-2xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <div className="content-area text-center py-12">
            <p className="text-4xl mb-3" aria-hidden="true">&#128161;</p>
            <p className="text-gray-600 font-medium">
              {hasTestInUrl ? 'Questions not loaded yet.' : 'No questions available.'}
            </p>
            {hasTestInUrl && (
              <div className="mt-4 flex flex-wrap gap-3 justify-center">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => startQuiz(testId, 'practice')}
                >
                  Start practice test
                </button>
                {traineeId && (
                  <button
                    type="button"
                    className="btn btn-small btn-secondary"
                    onClick={() => confirmStartOfficial(testId)}
                  >
                    Start official test
                  </button>
                )}
              </div>
            )}
            <button type="button" className="btn btn-secondary btn-small mt-6" onClick={handleExitQuiz}>
              ← Back to Practice Tests
            </button>
          </div>
        </div>
      </>
    )
  }

  const labels = ['A', 'B', 'C', 'D']
  const showExplanation = sessionState.showResult

  return (
    <>
      <AppHeader />
        <div className="container mx-auto max-w-2xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <div className="content-area rounded-xl px-6 py-6">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" className="btn btn-secondary btn-small" onClick={handleExitQuiz}>
              ← Exit
            </button>
          <span className="text-sm text-gray-600">
            {mode === 'practice' ? `Question ${sessionState.index + 1}` : `${sessionState.index + 1} / ${sessionState.questions.length}`}
            {mode === 'practice' && sessionState.streak > 0 && (
              <span className="ml-2 text-amber-600">Streak: {sessionState.streak}</span>
            )}
          </span>
        </div>
        <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
            style={{ width: mode === 'practice' ? '100%' : `${((sessionState.index + 1) / sessionState.questions.length) * 100}%` }}
          />
        </div>
        <h2 className="mb-4 text-center text-lg font-bold text-gray-800">{quiz?.title || testId}</h2>
        <div className="quiz-question-card rounded-xl border-2 border-gray-200 bg-white p-6 shadow-sm">
          <p className="mb-4 font-medium text-gray-800">{currentQ.q}</p>
          {mode === 'official' ? (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="text-sm text-[var(--color-primary)] font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={requestExamHint}
                disabled={showExplanation || examHintLoading || (hintsRemaining != null && hintsRemaining <= 0)}
              >
                {examHintLoading ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5 align-middle" aria-hidden />
                    <span>Loading…</span>
                  </>
                ) : (
                  `💡 Get a Hint (${hintsRemaining ?? 0} remaining)`
                )}
              </button>
            </div>
          ) : (
            (hintsRemaining === null || hintsRemaining > 0) && (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="text-sm text-[var(--color-primary)] font-medium hover:underline"
                  onClick={useHint}
                  disabled={showExplanation}
                >
                  💡 Eliminate wrong answer
                </button>
                <button
                  type="button"
                  className="text-sm text-[var(--color-primary)] font-medium hover:underline disabled:opacity-50"
                  onClick={requestSocraticHint}
                  disabled={showExplanation || socraticLoading}
                >
                  {socraticLoading ? '…' : '💬 AI hint'}
                </button>
              </div>
            )
          )}
          {examHint && mode === 'official' && (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-300 p-3 text-sm text-amber-900" role="alert">
              <strong>Hint:</strong> {examHint}
            </div>
          )}
          {socraticHint && mode === 'practice' && (
            <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-gray-800">
              <strong>Hint:</strong> {socraticHint}
            </div>
          )}
          <div className="space-y-2">
            {(currentQ.opts || []).map((opt, i) => {
              const eliminated = eliminatedOptions.has(i)
              let bg = 'bg-gray-50 hover:bg-gray-100 border-gray-200'
              if (eliminated) bg = 'bg-gray-100 border-gray-200 opacity-60 cursor-default'
              if (showExplanation) {
                if (i === currentQ.ans) bg = 'bg-green-100 border-green-500'
                else if (i === sessionState.chosen) bg = 'bg-red-100 border-red-500'
              }
              return (
                <button
                  key={i}
                  type="button"
                  className={`quiz-option w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${bg}`}
                  onClick={() => !eliminated && handleSelectAnswer(i)}
                  disabled={showExplanation || eliminated}
                >
                  <span className="font-semibold">{labels[i]}.</span> {opt}
                  {eliminated && <span className="ml-2 text-gray-500 text-sm">(eliminated)</span>}
                </button>
              )
            })}
          </div>
          {showExplanation && currentQ.exp && (
            <div className="mt-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
              <strong>Explanation:</strong> {currentQ.exp}
            </div>
          )}
        </div>
        {showExplanation && (
          <div className="mt-6 flex justify-center gap-3 flex-wrap">
            <button type="button" className="btn" onClick={handleNext} disabled={loadingNextPractice}>
              {loadingNextPractice ? 'Loading…' : mode === 'practice' ? 'Next Question →' : (sessionState.index >= sessionState.questions.length - 1 ? 'See Results' : 'Next Question →')}
            </button>
            {mode === 'practice' && (
              <button type="button" className="btn btn-secondary" onClick={endPracticeAndShowResults}>
                End practice
              </button>
            )}
          </div>
        )}
          </div>
      </div>
    </>
  )
}
