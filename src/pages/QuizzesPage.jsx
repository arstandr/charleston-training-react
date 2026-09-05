import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate, useLocation, Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import TraineeNavTabs from '../components/TraineeNavTabs'
import { useAuth } from '../contexts/AuthContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useTestActive } from '../contexts/TestActiveContext'
import { useTestAttempts } from '../hooks/useTestAttempts'
import { useQuizAttempts } from '../hooks/useQuizAttempts'
import { analyzeQuizResults } from '../services/quizIntelligenceService'
import QuizPerformanceInsights from '../components/QuizPerformanceInsights'
import { useFlashcardMastery } from '../hooks/useFlashcardMastery'
import { getSocraticHint } from '../services/ai'
import { tryAcquireLock, releaseLock } from '../services/testLock'
import { useTestLock } from '../contexts/TestLockContext'
import { celebratePerfectScore } from '../utils/celebrations'
import { getActiveFlashcards, isQuizApproved } from '../services/flashcardService'
import { reportQuizQuestionInaccuracy } from '../services/flashcardFlags'
import { TESTS, PRETTY_TEST_NAMES } from '../data/quizDatabase'
import { useGemini } from '../contexts/GeminiContext'
import { stableCardId } from '../utils/helpers'
import * as flashcardIntelligence from '../services/flashcardIntelligenceService'
import { logAuditEvent } from '../services/auditService'
import { buildAdaptiveOfficialTest, getNextInfiniteQuestion } from '../utils/quizAdaptive'
import {
  addWeakSpot,
  getWeakSpotsForPracticeTest,
  recordWeakSpotReview,
  weakSpotToQuizQuestion,
} from '../services/weakSpotsService'
import { getTestForShift } from '../data/shiftChecklistTemplates'
import { completePostShiftCheck } from '../services/postShiftCheckService'

const PRACTICE_QUESTION_COUNT = 10
const PRACTICE_QUESTION_COUNT_STRUGGLE = 20
const REGULAR_QUESTION_COUNT = 20
// Practice mode has no fixed length — it keeps generating questions — so this
// is a soft session checkpoint (progress bar + "keep going?" prompt), not a limit.
const PRACTICE_CHECKPOINT_SIZE = 10
const BONUS_QUESTION_COUNT = 3
const OFFICIAL_QUESTION_COUNT = REGULAR_QUESTION_COUNT + BONUS_QUESTION_COUNT
const OFFICIAL_PASSING_PERCENT = 75
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

// Bonus questions come exclusively from Firestore flashcard quizData (bonus-points deck).
// No hardcoded fallback — flashcards are the single source of truth.

/** All sets merged for verbal cert practice. */
const VERBAL_CERT_SET_IDS = ['starters-soups-salads', 'steaks-specialties', 'bar-beer', 'wines-cocktails']

/** Build questions from flashcard quizData only (single source of truth). */
function getMergedQuestions(testId, mode, practiceCount, flashcardDatabase) {
  if (testId === 'verbal_cert') {
    return getMergedQuestionsFromSets(VERBAL_CERT_SET_IDS, mode, Math.min(practiceCount, 25), flashcardDatabase)
  }
  const setId = TEST_TO_FLASHCARD_SET[testId]
  const all = []
  if (setId && flashcardDatabase?.[setId]) {
    flashcardDatabase[setId].forEach((card) => {
      if (card.quizData?.q && Array.isArray(card.quizData.opts) && isQuizApproved(card)) {
        all.push({
          ...card.quizData,
          cardId: card.id,
          cardFront: card.front,
          cardBack: card.back,
          source: 'flashcard',
        })
      }
    })
  }
  if (!all.length) return { questions: [], indices: [] }
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

function getMergedQuestionsFromSets(setIds, mode, practiceCount, flashcardDatabase) {
  const all = []
  for (const setId of setIds) {
    if (!flashcardDatabase?.[setId]) continue
    flashcardDatabase[setId].forEach((card) => {
      if (card.quizData?.q && Array.isArray(card.quizData.opts) && isQuizApproved(card)) {
        all.push({
          ...card.quizData,
          cardId: card.id,
          cardFront: card.front,
          cardBack: card.back,
          source: 'flashcard',
        })
      }
    })
  }
  if (!all.length) return { questions: [], indices: [] }
  const count = Math.min(practiceCount, all.length)
  const indices = all.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]]
  }
  const selected = indices.slice(0, count)
  const questions = selected.map((i) => all[i])
  return { questions, indices: selected }
}

function validateTest(test) {
  if (!test?.questions?.length) return test
  if (test.questions.length > OFFICIAL_QUESTION_COUNT) {
    console.error('Test has too many questions:', test.questions.length)
    return { ...test, questions: test.questions.slice(0, OFFICIAL_QUESTION_COUNT) }
  }
  if (test.questions.length < 10) {
    console.warn('Test has very few questions:', test.questions.length)
  }
  return test
}

/** Get bonus questions from flashcard DB only — no hardcoded fallback. */
function getFixedBonusQuestions(flashcardDatabase) {
  const dbCards = flashcardDatabase?.['bonus-points']?.filter(
    (c) => c.isBonus && c.bonusId && c.quizData?.q && Array.isArray(c.quizData.opts) && isQuizApproved(c)
  )
  if (!dbCards?.length) return []
  return dbCards.map((c) => {
    const bq = { ...c.quizData, isBonus: true, bonusId: c.bonusId, cardId: c.id }
    // Shuffle option order so correct answer isn't always first
    const idxs = bq.opts.map((_, i) => i)
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]]
    }
    const shuffledOpts = idxs.map((i) => bq.opts[i])
    const newAns = idxs.indexOf(bq.ans)
    return { ...bq, opts: shuffledOpts, ans: newAns }
  })
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
  const { startTestLock, endTestLock } = useTestLock()
  const { hydrating: attemptsHydrating, getAttempts, getUsedBonusIds, getRequiredScore, canTake, recordAttempt, getBestScore } = useTestAttempts(traineeId)
  const { attempts: quizAttempts, logAttempts } = useQuizAttempts()
  const { getStruggleCards, getMastery, recordResult, userId } = useFlashcardMastery(traineeId)
  const { generateQuizQuestions, isConfigured: geminiConfigured, rateLimitStatus: geminiRateLimitStatus } = useGemini()

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  // Read trainer "ready to test" flags from training data
  const trainerReadyToTest = useMemo(() => {
    if (!traineeId) return {}
    try {
      const raw = localStorage.getItem('trainingData') || '{}'
      const td = JSON.parse(raw)
      return td[traineeId]?.readyToTest || {}
    } catch (_) {
      return {}
    }
  }, [traineeId])

  const testId = searchParams.get('test')
  const mode = searchParams.get('mode') || 'practice'
  const shiftParam = searchParams.get('shift')
  const postShiftCheckId = searchParams.get('postShiftCheck')

  // When arriving via shift link (e.g. from checklist), set testId from shift
  useEffect(() => {
    if (!shiftParam || mode !== 'practice' || testId) return
    const config = getTestForShift(shiftParam)
    if (!config) return
    const targetTestId = config.quizTestId ?? 'verbal_cert'
    setSearchParams((p) => {
      const next = new URLSearchParams(p)
      next.set('test', targetTestId)
      next.set('mode', 'practice')
      next.set('shift', shiftParam)
      return next
    })
  }, [shiftParam, mode, testId, setSearchParams])

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
  /** Preloaded official questions for the pending test (built when modal opens). */
  const [preloadedOfficialQuestions, setPreloadedOfficialQuestions] = useState(null)
  const [hintsRemaining, setHintsRemaining] = useState(null)
  const [eliminatedOptions, setEliminatedOptions] = useState(new Set())
  const [socraticHint, setSocraticHint] = useState(null)
  const [socraticLoading, setSocraticLoading] = useState(false)
  const [lockError, setLockError] = useState(null)
  const [loadingNextPractice, setLoadingNextPractice] = useState(false)
  const [loadingOfficialStart, setLoadingOfficialStart] = useState(false)
  const [flashcardDatabase, setFlashcardDatabase] = useState({})
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [flagPromptOpen, setFlagPromptOpen] = useState(false)
  const [flagReason, setFlagReason] = useState('')
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState(new Set())
  const [flagSubmitting, setFlagSubmitting] = useState(false)
  const [flagConfirmMsg, setFlagConfirmMsg] = useState(null)

  useEffect(() => {
    getActiveFlashcards()
      .then((cards) => {
        const database = {}
        cards.forEach((card) => {
          if (!database[card.setId]) database[card.setId] = []
          database[card.setId].push(card)
        })
        setFlashcardDatabase(database)
      })
      .catch(() => setFlashcardDatabase({}))
  }, [])

  const generatedFromState = location.state?.generatedQuestions
  const testMeta = testId ? TESTS.find((t) => t.id === testId) : null
  const quiz = testId === 'generated'
    ? { title: location.state?.fromSetTitle || 'AI Practice', questions: generatedFromState || [] }
    : testId === 'verbal_cert'
      ? { title: 'Verbal Certification', subtitle: 'All menu and service knowledge', questions: [] }
      : testMeta ? { title: testMeta.title, passing_score: testMeta.passing_score, questions: [] } : null
  const currentQ = sessionState.questions[sessionState.index]
  const passingScore = mode === 'official' && testId && testId !== 'generated' && traineeId ? getRequiredScore(testId) : (quiz?.passing_score ?? 85)

  /** Preload official test questions in the background when the confirmation modal is shown. */
  async function preloadOfficialQuestions(id) {
    if (!traineeId || !id) return
    try {
      const { count: attemptCount } = getAttempts(id)
      const isThirdAttempt = attemptCount >= 2
      const out = buildAdaptiveOfficialTest(id, traineeId, { getAttempts, getMastery }, {
        TEST_TO_FLASHCARD_SET,
        FLASHCARD_DATABASE: flashcardDatabase,
        stableCardId,
      })
      const regularQuestions = (out.questions || []).slice(0, REGULAR_QUESTION_COUNT)
      const regularIndices = (out.indices || []).slice(0, regularQuestions.length)
      // 3rd+ attempt: no bonus questions
      const bonusTagged = isThirdAttempt ? [] : getFixedBonusQuestions(flashcardDatabase)
      const bonusQuestionIds = bonusTagged.map((b) => b.bonusId)
      const regularTagged = regularQuestions.map((q, i) => ({ ...q, isBonus: false, poolIndex: regularIndices[i] ?? i }))
      const combined = shuffle([...regularTagged, ...bonusTagged])
      const questions = combined
      const indices = combined.map((q) => (q.isBonus ? q.bonusId : q.poolIndex))
      setPreloadedOfficialQuestions({ questions, indices, bonusQuestionIds, isThirdAttempt })
    } catch (_) {
      setPreloadedOfficialQuestions(null)
    }
  }

  useEffect(() => {
    if (testId === 'generated' && generatedFromState?.length > 0 && sessionState.questions.length === 0) {
      setSessionState({ questions: generatedFromState, indices: generatedFromState.map((_, i) => i), index: 0, answers: [], chosen: null, showResult: false })
      return
    }
    const hasTest = testId === 'verbal_cert' || !!TESTS.find((t) => t.id === testId) || quiz?.questions?.length > 0
    if (!testId || !hasTest || sessionState.questions.length > 0) return
    if (mode === 'official') {
      const displayName = prettyTestName(testId)
      setPendingOfficialTest({ id: testId, displayName })
      preloadOfficialQuestions(testId)
      return
    }
    if (mode !== 'practice' || !traineeId) return
    try {
      const key = `${PRACTICE_SESSION_KEY}_${traineeId}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.testId === testId && saved.mode === 'practice') {
          const questions = Array.isArray(saved.questions) && saved.questions.length > 0
            ? saved.questions
            : (quiz?.questions?.length ? (saved.indices || []).map((i) => quiz.questions[i]).filter(Boolean) : [])
          if (questions.length > 0) {
            setSessionState({
              questions,
              indices: saved.indices ?? questions.map((_, i) => i),
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
      const data = { TEST_TO_FLASHCARD_SET, FLASHCARD_DATABASE: flashcardDatabase, stableCardId }
      const { question, index: poolIndex, cardId } = getNextInfiniteQuestion(testId, traineeId, { getMastery }, [], data)
      if (!question) {
        const { questions: qs, indices: idx } = getMergedQuestions(testId, mode, PRACTICE_QUESTION_COUNT, flashcardDatabase)
        const setId = testId === 'verbal_cert' ? null : TEST_TO_FLASHCARD_SET[testId]
        const uid = currentUser?.uid
        if (uid) {
          getWeakSpotsForPracticeTest(uid, setId, 5).then((weakSpots) => {
            const weakQs = weakSpots.map(weakSpotToQuizQuestion).filter(Boolean)
            const combined = weakQs.length > 0 ? shuffle([...qs, ...weakQs]) : qs
            const cardIds = combined.map((q) => q.weakSpotId || null)
            setSessionState({ questions: combined, indices: combined.map((_, i) => i), index: 0, answers: [], chosen: null, showResult: false, streak: 0, cardIds })
            if (traineeId) try { localStorage.setItem(key, JSON.stringify({ testId, mode: 'practice', indices: combined.map((_, i) => i), index: 0, answers: [], questions: combined })) } catch (_) {}
          }).catch((err) => {
            console.warn('Weak spots for practice test failed (e.g. missing Firestore index), loading without weak spot questions:', err)
            setSessionState({ questions: qs, indices: idx, index: 0, answers: [], chosen: null, showResult: false, streak: 0, cardIds: [] })
            if (traineeId) try { localStorage.setItem(key, JSON.stringify({ testId, mode: 'practice', indices: idx, index: 0, answers: [], questions: qs })) } catch (_) {}
          })
        } else {
          setSessionState({ questions: qs, indices: idx, index: 0, answers: [], chosen: null, showResult: false, streak: 0, cardIds: [] })
          if (traineeId) try { localStorage.setItem(key, JSON.stringify({ testId, mode: 'practice', indices: idx, index: 0, answers: [], questions: qs })) } catch (_) {}
        }
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
        if (traineeId) try { localStorage.setItem(key, JSON.stringify({ testId, mode: 'practice', indices: [poolIndex], index: 0, answers: [], questions: [question] })) } catch (_) {}
      }
    } catch (_) {}
  }, [testId, mode, traineeId, currentUser?.uid])

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
          questions: sessionState.questions,
        })
      )
    } catch (_) {}
  }, [traineeId, testId, mode, sessionState.index, sessionState.answers, sessionState.indices, sessionState.questions.length, results])

  const testInProgress = !!(testId && sessionState.questions.length > 0 && !results)
  useEffect(() => {
    if (!testInProgress) return
    const dummyState = { testLock: true }
    window.history.pushState(dummyState, '', window.location.href)
    const onPop = () => {
      window.history.pushState(dummyState, '', window.location.href)
    }
    window.addEventListener('popstate', onPop)
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [testInProgress])

  const HINTS_PER_OFFICIAL_TEST = 2

  const startQuiz = async (id, m, restored = null) => {
    if (m === 'official' && pendingOfficialTest?.id === id && preloadedOfficialQuestions) {
      const { questions, indices, bonusQuestionIds, isThirdAttempt } = preloadedOfficialQuestions
      setPreloadedOfficialQuestions(null)
      setPendingOfficialTest(null)
      // 3rd+ attempt: no hints
      setHintsRemaining(isThirdAttempt ? 0 : HINTS_PER_OFFICIAL_TEST)
      setEliminatedOptions(new Set())
      setTestActive(true)
      setSearchParams({ test: id, mode: m })
      setSessionState({ questions, indices, index: 0, answers: [], chosen: null, showResult: false, bonusQuestionIds: bonusQuestionIds || [] })
      setResults(null)
      return
    }
    setPendingOfficialTest(null)
    const { count: attemptCount } = m === 'official' && traineeId ? getAttempts(id) : { count: 0 }
    const isThirdAttempt = attemptCount >= 2
    setHintsRemaining(m === 'official' ? (isThirdAttempt ? 0 : HINTS_PER_OFFICIAL_TEST) : null)
    setEliminatedOptions(new Set())
    setTestActive(true)
    if (restored) {
      const validated = validateTest({ questions: restored.questions })
      setSearchParams({ test: id, mode: m })
      setSessionState({
        questions: validated.questions || restored.questions,
        indices: restored.indices || [],
        index: restored.index,
        answers: restored.answers || [],
        chosen: null,
        showResult: false,
        bonusQuestionIds: restored.bonusQuestionIds || [],
      })
      setResults(null)
      return
    }
    const setId = TEST_TO_FLASHCARD_SET[id]
    const struggleCount = setId && traineeId ? getStruggleCards(setId).length : 0
    const practiceCount = struggleCount > 0 ? PRACTICE_QUESTION_COUNT_STRUGGLE : PRACTICE_QUESTION_COUNT
    let questions, indices, bonusQuestionIds = []
    if (m === 'official' && traineeId) {
      setLoadingOfficialStart(true)
      try {
        const out = buildAdaptiveOfficialTest(id, traineeId, { getAttempts, getMastery }, {
          TEST_TO_FLASHCARD_SET,
          FLASHCARD_DATABASE: flashcardDatabase,
          stableCardId,
        })
        const regularQuestions = (out.questions || []).slice(0, REGULAR_QUESTION_COUNT)
        const regularIndices = (out.indices || []).slice(0, regularQuestions.length)
        // 3rd+ attempt: no bonus questions
        const bonusTagged = isThirdAttempt ? [] : getFixedBonusQuestions(flashcardDatabase)
        bonusQuestionIds = bonusTagged.map((b) => b.bonusId)
        const regularTagged = regularQuestions.map((q, i) => ({ ...q, isBonus: false, poolIndex: regularIndices[i] ?? i }))
        const combined = shuffle([...regularTagged, ...bonusTagged])
        questions = combined
        indices = combined.map((q) => (q.isBonus ? q.bonusId : q.poolIndex))
      } catch (e) {
        console.error('[Quiz] Failed to build official test:', e?.message)
        // Fall back to hardcoded questions only
        const fallback = getMergedQuestions(id, m, REGULAR_QUESTION_COUNT, flashcardDatabase)
        questions = fallback.questions
        indices = fallback.indices
      } finally {
        setLoadingOfficialStart(false)
      }
    } else {
      const out = getMergedQuestions(id, m, practiceCount, flashcardDatabase)
      questions = out.questions
      indices = out.indices
    }
    setSearchParams({ test: id, mode: m })
    setSessionState({ questions, indices, index: 0, answers: [], chosen: null, showResult: false, bonusQuestionIds })
    setResults(null)
    if (traineeId && m === 'practice') {
      try {
        const key = `${PRACTICE_SESSION_KEY}_${traineeId}`
        localStorage.setItem(key, JSON.stringify({ testId: id, mode: m, indices, index: 0, answers: [], questions }))
      } catch (_) {}
    }
  }

  const confirmStartOfficial = (id) => {
    setLockError(null)
    const displayName = prettyTestName(id)
    setPendingOfficialTest({ id, displayName })
    preloadOfficialQuestions(id)
  }

  const startOfficialWithLock = async () => {
    if (!pendingOfficialTest || !traineeId) return
    // Double-check attempt limit (Firestore hydration may have updated since button render)
    const eligibility = canTake(pendingOfficialTest.id)
    if (!eligibility.allowed) {
      setLockError(eligibility.reason || 'You cannot take this test right now.')
      return
    }
    const deviceAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined
    let acquired = false
    try {
      const result = await tryAcquireLock(traineeId, pendingOfficialTest.id, deviceAgent)
      acquired = result.acquired
      if (!acquired) {
        setLockError(result.reason || 'Could not acquire lock. You can still start below (lock may be disabled).')
      } else {
        setLockError(null)
        await startTestLock(pendingOfficialTest.id, pendingOfficialTest.displayName)
      }
    } catch (e) {
      setLockError(e?.message || 'Lock check failed. You can still start the test.')
    }
    await startQuiz(pendingOfficialTest.id, 'official')
  }

  const exitQuiz = () => {
    setTestActive(false)
    if (mode === 'official' && traineeId) {
      releaseLock(traineeId)
      endTestLock()
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
    // Practice mode with at least one answered question: don't just discard it —
    // score what's been answered so far and show the same results screen a
    // finished practice session gets. Official mode is unchanged: leaving mid-test
    // stays "progress lost" (the anti-cheat lock release below already assumes that).
    const willScorePartial = mode === 'practice' && sessionState.answers.length > 0
    if (inProgress) {
      const ok = await confirm(
        willScorePartial ? "End practice here? We'll save your results so far." : 'Leave quiz? Your progress will be lost.',
        'Exit quiz'
      )
      if (!ok) return
    }
    if (willScorePartial) {
      endPracticeAndShowResults()
      return
    }
    exitQuiz()
  }

  const handleSelectAnswer = (choiceIndex) => {
    if (sessionState.showResult) return
    const correct = currentQ.ans === choiceIndex
    const nextStreak = correct ? (sessionState.streak || 0) + 1 : 0
    setSessionState((s) => ({
      ...s,
      chosen: choiceIndex,
      showResult: true,
      answers: [...s.answers, { choiceIndex, correct }],
      streak: nextStreak,
    }))
    setEliminatedOptions(new Set())
    if (mode === 'practice' && currentQ?.weakSpotId) {
      recordWeakSpotReview(currentQ.weakSpotId, correct).catch(() => {})
    }
    if (mode === 'practice' && userId && recordResult && sessionState.cardIds?.[sessionState.index]) {
      recordResult(sessionState.cardIds[sessionState.index], correct ? 'gotIt' : 'needsPractice').catch(() => {})
    }
  }

  const endPracticeAndShowResults = () => {
    try {
    setTestActive(false)
    // Only count questions that were actually answered
    const answeredCount = sessionState.answers.length
    const total = mode === 'practice' ? answeredCount : sessionState.questions.length
    const questionsToScore = sessionState.questions.slice(0, total)
    const regularTotal = questionsToScore.filter((q) => !q.isBonus).length
    const bonusTotal = questionsToScore.filter((q) => q.isBonus).length
    let regularCorrect = 0
    let bonusCorrect = 0
    questionsToScore.forEach((q, i) => {
      const correct = sessionState.answers[i]?.correct ?? false
      if (correct) {
        if (q.isBonus) bonusCorrect++
        else regularCorrect++
      }
    })
    const totalCorrect = regularCorrect + bonusCorrect
    // Use dynamic passing percent: 75% for attempt 1, 80% for attempt 2, 90% for attempt 3+
    const effectivePassingPercent = (mode === 'official' && testId) ? getRequiredScore(testId) : OFFICIAL_PASSING_PERCENT
    const passingScoreCount = mode === 'official' && regularTotal > 0
      ? Math.ceil(regularTotal * (effectivePassingPercent / 100))
      : Math.ceil(total * (OFFICIAL_PASSING_PERCENT / 100))
    const passed = mode === 'official' && regularTotal > 0 ? regularCorrect >= passingScoreCount : totalCorrect >= passingScoreCount
    const score = total ? Math.round((totalCorrect / total) * 100) : 0
    const regularPercentage = regularTotal ? Math.round((regularCorrect / regularTotal) * 100) : 0
    const overallPercentage = total ? Math.round((totalCorrect / total) * 100) : 0
    const hintsUsed = mode === 'official' && hintsRemaining != null ? HINTS_PER_OFFICIAL_TEST - hintsRemaining : undefined
    const bonusQuestionIds = sessionState.bonusQuestionIds || []
    // Server grades this independently from cardId + the selected option TEXT
    // (never a client-computed score/passed, never an option index — bonus
    // question options are shuffled client-side, so text is what survives the
    // round-trip). testReviews is now written by the Cloud Function too.
    const answersForGrading = questionsToScore.map((q, i) => ({
      cardId: q?.cardId || null,
      questionId: q?.bonusId ? `bonus_${q.bonusId}` : (sessionState.indices && sessionState.indices[i] !== undefined ? `${testId}_${sessionState.indices[i]}` : `${testId}_${i}`),
      selectedText: typeof sessionState.answers[i]?.choiceIndex === 'number' ? (q?.opts?.[sessionState.answers[i].choiceIndex] ?? null) : null,
      isBonus: !!q?.isBonus,
    }))
    if (testId && mode === 'official' && traineeId) {
      recordAttempt(testId, score, passed, { hintsUsed, bonusQuestionIds, answers: answersForGrading })
    }

    if (traineeId) releaseLock(traineeId)
    if (mode === 'official') endTestLock()
    if (score >= 100) celebratePerfectScore()

    const topic = testId || 'generated'
    const quizSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    // Sliced to questionsToScore (answered-so-far in practice mode) — an early
    // exit must not log the remaining, never-seen questions as missed/wrong.
    const answers = questionsToScore.map((_, i) => {
      const a = sessionState.answers[i]
      const q = questionsToScore[i]
      const questionId = q?.bonusId ? `bonus_${q.bonusId}` : (testId === 'generated' ? `generated_${i}` : (sessionState.indices && sessionState.indices[i] !== undefined ? `${testId}_${sessionState.indices[i]}` : `${testId}_${i}`))
      return {
        questionId,
        correct: a?.correct ?? false,
        timeSpent: undefined,
        selectedAnswer: a?.choiceIndex,
        topic,
      }
    })
    const analytics = analyzeQuizResults(sessionState.questions, answers, quizAttempts)
    const attemptsToLog = answers.map((a, i) => {
      const q = sessionState.questions[i]
      const base = {
        ...a,
        quizId: testId,
        quizSessionId,
        score,
        totalQuestions: total,
      }
      // Embed question details for official tests so managers can review later
      if (mode === 'official' && q) {
        base.questionText = q.q ?? q.question ?? ''
        base.options = q.opts || []
        base.correctIndex = typeof q.ans === 'number' ? q.ans : 0
        base.explanation = q.exp || ''
        base.isBonus = !!q.isBonus
      }
      return base
    })
    if (traineeId) logAttempts(attemptsToLog)

    setResults({
      score,
      passed,
      totalCorrect,
      total,
      regularCorrect,
      regularTotal,
      bonusCorrect,
      bonusTotal,
      regularPercentage,
      overallPercentage,
      passingScore: passingScoreCount,
      insights: analytics.insights,
      missedTopics: analytics.missedTopics,
      performanceLevel: analytics.performanceLevel,
    })
    if (traineeId) try { localStorage.removeItem(`${PRACTICE_SESSION_KEY}_${traineeId}`) } catch (_) {}

    // Sync missed questions to flashcard “needs practice” so they appear in focus mode
    // (sliced to questionsToScore — same early-exit reasoning as `answers` above)
    const missedResults = questionsToScore
      .map((q, i) => ({ question: q?.q ?? q?.question ?? '', correct: sessionState.answers[i]?.correct ?? false, testId }))
      .filter((r) => !r.correct && r.question)
    if (userId && missedResults.length > 0) {
      flashcardIntelligence.syncQuizToFlashcards(missedResults, userId, flashcardDatabase, TEST_TO_FLASHCARD_SET)
    }
    // Save missed practice test questions to weakSpots for spaced repetition
    if (mode === 'practice' && currentUser?.uid && testId && testId !== 'generated') {
      const setId = TEST_TO_FLASHCARD_SET[testId] || ''
      questionsToScore.forEach((q, i) => {
        const correct = sessionState.answers[i]?.correct ?? false
        if (correct || q?.isBonus) return
        const questionText = q?.q ?? q?.question ?? ''
        if (!questionText) return
        const opts = q?.opts || []
        const ansIdx = typeof q?.ans === 'number' ? q.ans : 0
        const choiceIdx = sessionState.answers[i]?.choiceIndex
        const correctAnswer = opts[ansIdx] ?? ''
        const wrongAnswer = typeof choiceIdx === 'number' && opts[choiceIdx] != null ? opts[choiceIdx] : ''
        addWeakSpot(currentUser.uid ?? currentUser.id ?? currentUser.traineeId, {
          questionText,
          correctAnswer,
          wrongAnswer,
          setId,
          source: 'practiceTest',
          opts,
          ans: ansIdx,
          exp: q?.exp ?? '',
        }).catch(() => {})
      })
    }
    const effUid = currentUser?.uid ?? currentUser?.id ?? currentUser?.traineeId
    if (effUid) {
      logAuditEvent(effUid, currentUser.name, 'quiz_completed', { quizId: testId, score, passed, totalQuestions: total })
    }
    // Complete post-shift knowledge check if this was triggered from one
    if (postShiftCheckId) {
      completePostShiftCheck(postShiftCheckId).catch(() => {})
    }
    } catch (err) {
      console.error('[Quiz] endPracticeAndShowResults failed:', err)
      // Show a minimal results screen so the trainee isn't left on a blank page
      const answeredCount = sessionState.answers.length
      const correctCount = sessionState.answers.filter((a) => a?.correct).length
      const score = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0
      setResults({
        score,
        passed: false,
        totalCorrect: correctCount,
        total: answeredCount,
        regularCorrect: correctCount,
        regularTotal: answeredCount,
        bonusCorrect: 0,
        bonusTotal: 0,
        regularPercentage: score,
        overallPercentage: score,
        passingScore: 0,
        insights: [],
        missedTopics: [],
        performanceLevel: 'unknown',
        saveError: true,
      })
      if (traineeId) try { localStorage.removeItem(`${PRACTICE_SESSION_KEY}_${traineeId}`) } catch (_) {}
    }
  }

  const fetchNextPracticeQuestion = () => {
    setLoadingNextPractice(true)
    const data = { TEST_TO_FLASHCARD_SET, FLASHCARD_DATABASE: flashcardDatabase, stableCardId }
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
          const nextQuestions = [...sessionState.questions, nextQ]
          localStorage.setItem(
            `${PRACTICE_SESSION_KEY}_${traineeId}`,
            JSON.stringify({ testId, mode: 'practice', indices: [...(sessionState.indices || []), nextPoolIndex], index: sessionState.questions.length, answers: sessionState.answers, questions: nextQuestions })
          )
        } catch (_) {}
      }
    } else {
      endPracticeAndShowResults()
    }
  }

  const handleNext = () => {
    setSocraticHint(null)
    setEliminatedOptions(new Set())
    setFlagPromptOpen(false)
    setFlagReason('')
    if (sessionState.index >= sessionState.questions.length - 1) {
      if (mode === 'official') {
        endPracticeAndShowResults()
        return
      }
      const atCheckpoint = sessionState.answers.length > 0 && sessionState.answers.length % PRACTICE_CHECKPOINT_SIZE === 0
      if (atCheckpoint) {
        confirm(
          `You've answered ${sessionState.answers.length} questions. Tap OK to keep practicing, or Cancel to see your results now.`,
          'Nice work!'
        ).then((keepGoing) => {
          if (keepGoing) fetchNextPracticeQuestion()
          else endPracticeAndShowResults()
        })
        return
      }
      fetchNextPracticeQuestion()
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

  async function handleFlagQuestion(reason) {
    if (!currentQ || flagSubmitting) return
    setFlagSubmitting(true)
    try {
      const opts = currentQ.opts || []
      const correctIdx = typeof currentQ.ans === 'number' ? currentQ.ans : 0
      await reportQuizQuestionInaccuracy({
        cardId: currentQ.cardId || '',
        front: currentQ.cardFront || '',
        back: currentQ.cardBack || '',
        quizQuestion: currentQ.q || '',
        quizOptions: opts,
        quizCorrectAnswer: opts[correctIdx] || '',
        selectedAnswer: typeof sessionState.chosen === 'number' ? (opts[sessionState.chosen] || '') : '',
        reason: reason || 'Flagged as inaccurate',
        reportedBy: currentUser?.name || currentUser?.traineeId || traineeId || '',
      })
      setFlaggedQuestionIds((prev) => new Set([...prev, currentQ.cardId || sessionState.index]))
      setFlagConfirmMsg('Question flagged — it will be reviewed by an admin.')
      setTimeout(() => setFlagConfirmMsg(null), 4000)
    } catch (e) {
      setFlagConfirmMsg('Failed to flag question. Please try again.')
      setTimeout(() => setFlagConfirmMsg(null), 3000)
    } finally {
      setFlagSubmitting(false)
      setFlagPromptOpen(false)
      setFlagReason('')
    }
  }

  async function handleGenerateQuiz() {
    if (!geminiConfigured) {
      setGenerateError('Configure Gemini API key in Admin settings first.')
      return
    }
    if (geminiRateLimitStatus?.isLimited) {
      const s = geminiRateLimitStatus.standard || geminiRateLimitStatus.live
      setGenerateError(`AI rate limited. Wait ${s}s and try again.`)
      return
    }
    setGenerateError(null)
    setGenerating(true)
    try {
      const flashcards = []
      for (const [setId, cards] of Object.entries(flashcardDatabase || {})) {
        if (!Array.isArray(cards)) continue
        cards.slice(0, 15).forEach((c) => {
          flashcards.push({ title: setId, front: c.front || '', back: c.back || '' })
        })
      }
      const result = await generateQuizQuestions(flashcards.slice(0, 80), 10, 'medium')
      const raw = result?.questions || []
      const mapped = raw.map((q) => ({
        q: q.question || q.q || '',
        opts: q.options || q.opts || [],
        ans: typeof q.correctAnswer === 'number' ? q.correctAnswer : (q.ans ?? 0),
        exp: q.explanation || q.exp || '',
      })).filter((x) => x.q && x.opts?.length >= 2)
      if (mapped.length === 0) {
        setGenerateError('No valid questions generated. Try again.')
        return
      }
      navigate('/quizzes?test=generated&mode=practice', {
        state: { generatedQuestions: mapped, fromSetTitle: 'AI Practice' },
        replace: false,
      })
    } catch (err) {
      setGenerateError(err.message || 'Generation failed.')
    } finally {
      setGenerating(false)
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
    const allIds = TESTS.map((t) => t.id)
    const practiceTestIds = allIds
    const officialTestIds = allIds.filter((id) => id !== 'bonus_test')
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <h2 className="study-page-title text-xl">Practice Tests &amp; Tests</h2>

          <QuizPerformanceInsights />

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
                const displayName = prettyTestName(id)
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
              20 regular + 3 bonus = 23 questions. Bonus questions are extra credit.
            </p>
            <p className="mb-4 text-xs text-gray-500">Full comprehensive tests — 2 attempts · Pass: 80% attempt 1, 85% attempt 2, 90% attempt 3</p>
            <div className="space-y-4">
              {officialTestIds.map((id) => {
                const { count, passed, maxAttempts } = getAttempts(id)
                const best = getBestScore(id)
                const officialAllowed = canTake(id)
                const displayName = prettyTestName(id)
                const isThird = count >= 2
                return (
                  <div key={id} className={`rounded-xl border border-gray-200 border-l-4 ${isThird && !passed ? 'border-l-red-500' : 'border-l-blue-500'} bg-white p-4 shadow-sm`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-800">{displayName}</h4>
                      {trainerReadyToTest[id] && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Trainer cleared ✓</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      Attempts: {count}/{maxAttempts} · Best: {best}%{passed ? ' (Passed)' : ''}
                    </p>
                    {isThird && !passed ? (
                      <p className="mt-0.5 text-xs font-bold text-red-600">Attempt {count + 1}: Must score 90% — no bonus questions, no hints</p>
                    ) : count === 1 ? (
                      <p className="mt-0.5 text-xs text-gray-500">This attempt: must score 85%</p>
                    ) : (
                      <p className="mt-0.5 text-xs text-gray-500">This attempt: must score 80%</p>
                    )}
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
                        {attemptsHydrating ? (
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                            Checking…
                          </span>
                        ) : 'Take Test'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
          </div>

          {/* Official test start confirmation modal */}
          {pendingOfficialTest && (() => {
            const { count: modalAttemptCount, maxAttempts: modalMax } = getAttempts(pendingOfficialTest.id)
            const modalIsThird = modalAttemptCount >= 2
            const modalRequired = getRequiredScore(pendingOfficialTest.id)
            const modalPassCount = Math.ceil(REGULAR_QUESTION_COUNT * modalRequired / 100)
            return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="max-w-md rounded-xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-bold text-gray-800">{pendingOfficialTest.displayName}</h3>
                <p className="mt-1 text-sm text-gray-500">Attempt {modalAttemptCount + 1} of {modalMax}</p>

                <div className={`mt-4 rounded-lg border p-4 ${modalIsThird ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                  <p className={`text-sm font-semibold mb-2 ${modalIsThird ? 'text-red-800' : 'text-blue-800'}`}>
                    {modalIsThird ? 'Final attempt — stricter rules apply' : 'What to expect'}
                  </p>
                  <ul className={`text-sm space-y-1 ${modalIsThird ? 'text-red-700' : 'text-blue-700'}`}>
                    <li>• {modalIsThird ? `${REGULAR_QUESTION_COUNT} questions — no bonus questions` : `${REGULAR_QUESTION_COUNT} questions + ${BONUS_QUESTION_COUNT} bonus`}</li>
                    <li>• Must score <strong>{modalRequired}%</strong> ({modalPassCount}/{REGULAR_QUESTION_COUNT} regular) to pass</li>
                    {modalIsThird ? (
                      <li>• No hints available</li>
                    ) : (
                      <li>• {HINTS_PER_OFFICIAL_TEST} hints available</li>
                    )}
                    <li>• Test is locked to this device until complete</li>
                  </ul>
                </div>

                {lockError && (
                  <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{lockError}</p>
                )}
                {loadingOfficialStart && (
                  <p className="mt-3 text-sm text-gray-600">Loading questions…</p>
                )}
                <div className="mt-6 flex gap-3 justify-end">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setPendingOfficialTest(null)
                      setPreloadedOfficialQuestions(null)
                      setLockError(null)
                      setSearchParams({})
                    }}
                    disabled={loadingOfficialStart}
                  >
                    Study First
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={startOfficialWithLock}
                    disabled={loadingOfficialStart}
                  >
                    {loadingOfficialStart ? 'Loading…' : "I'm Ready"}
                  </button>
                </div>
              </div>
            </div>
          )})()}
        </div>
      </>
    )
  }

  if (results) {
    const badgeLabel = results.performanceLevel === 'excellent' ? 'Excellent' : results.performanceLevel === 'good' ? 'Good' : results.performanceLevel === 'fair' ? 'Fair' : 'Needs improvement'
    const badgeClass = results.performanceLevel === 'excellent' ? 'bg-green-100 text-green-800' : results.performanceLevel === 'good' ? 'bg-blue-100 text-blue-800' : results.performanceLevel === 'fair' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-2xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <div className="content-area text-center py-10">
            <h2 className="text-xl font-bold text-gray-800">Results</h2>
            {results.saveError && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 text-left">
                Your score was calculated but could not be fully saved. Ask your manager if you need to retake this test.
              </div>
            )}
            <div
              className={`mx-auto mt-6 flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white ${
                results.passed ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              {results.score}%
            </div>
            {mode === 'official' && (
              <p className={`mt-4 text-lg font-semibold ${results.passed ? 'text-green-600' : 'text-red-600'}`}>
                {results.passed ? 'Passed' : 'Not passed'}
              </p>
            )}
            {results.performanceLevel && (
              <p className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-medium ${badgeClass}`}>
                {badgeLabel}
              </p>
            )}
            <p className="mt-2 text-gray-600">
              {results.totalCorrect} / {results.total} correct
            </p>
            {mode === 'official' && results.regularTotal != null && results.bonusTotal != null && (
              <div className="mt-4 max-w-md mx-auto text-left rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 mb-2">Score breakdown</h3>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-700">Regular:</span>
                  <span className="font-semibold text-green-800">{results.regularCorrect} / {results.regularTotal}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div className="bg-green-700 h-2 rounded-full" style={{ width: `${results.regularPercentage ?? 0}%` }} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Bonus (extra credit):</span>
                  <span className="font-semibold text-yellow-600">+{results.bonusCorrect} / {results.bonusTotal}</span>
                </div>
                {results.bonusCorrect > 0 && (
                  <p className="mt-2 text-sm text-yellow-800">You earned {results.bonusCorrect} bonus point{results.bonusCorrect > 1 ? 's' : ''}.</p>
                )}
              </div>
            )}
            {mode === 'official' && !results.passed && results.passingScore != null && (
              <p className="mt-2 text-sm text-gray-500">Needed {results.passingScore} regular correct ({passingScore}%) to pass</p>
            )}
            {results.insights && results.insights.length > 0 && (
              <div className="mt-6 text-left rounded-xl border border-gray-200 bg-gray-50 p-4">
                <h3 className="font-semibold text-gray-800 mb-2">Insights</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                  {results.insights.map((insight, i) => (
                    <li key={i}>{insight.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {results.missedTopics && results.missedTopics.length > 0 && (
              <div className="mt-4 text-left rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="font-semibold text-amber-900 mb-2">Topics to review</h3>
                <ul className="space-y-1 text-amber-800 text-sm">
                  {results.missedTopics.map((t, i) => (
                    <li key={i}>{t.topic} ({t.questionsMissed} missed)</li>
                  ))}
                </ul>
              </div>
            )}
            <button type="button" className="btn mt-6" onClick={() => navigate('/trainee')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </>
    )
  }

  if (!currentQ) {
    const hasTestInUrl = testId && (testId === 'verbal_cert' || !!TESTS.find((t) => t.id === testId))
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
                {traineeId && (() => {
                  const fallbackAllowed = canTake(testId)
                  return (
                    <button
                      type="button"
                      className="btn btn-small btn-secondary"
                      onClick={() => fallbackAllowed.allowed ? confirmStartOfficial(testId) : undefined}
                      disabled={!fallbackAllowed.allowed}
                      title={!fallbackAllowed.allowed ? fallbackAllowed.reason : ''}
                    >
                      {attemptsHydrating ? (
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                          Checking…
                        </span>
                      ) : 'Start official test'}
                    </button>
                  )
                })()}
              </div>
            )}
            <button type="button" className="btn btn-secondary btn-small mt-6" onClick={() => navigate('/trainee')}>
              ← Back to Dashboard
            </button>
          </div>
        </div>
        {/* Official test start confirmation modal (when no currentQ) */}
        {pendingOfficialTest && (() => {
          const { count: mc2, maxAttempts: mm2 } = getAttempts(pendingOfficialTest.id)
          const mi2 = mc2 >= 2
          const req2 = getRequiredScore(pendingOfficialTest.id)
          const passCount2 = Math.ceil(REGULAR_QUESTION_COUNT * req2 / 100)
          return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-gray-800">{pendingOfficialTest.displayName}</h3>
              <p className="mt-1 text-sm text-gray-500">Attempt {mc2 + 1} of {mm2}</p>

              <div className={`mt-4 rounded-lg border p-4 ${mi2 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                <p className={`text-sm font-semibold mb-2 ${mi2 ? 'text-red-800' : 'text-blue-800'}`}>
                  {mi2 ? 'Final attempt — stricter rules apply' : 'What to expect'}
                </p>
                <ul className={`text-sm space-y-1 ${mi2 ? 'text-red-700' : 'text-blue-700'}`}>
                  <li>• {mi2 ? `${REGULAR_QUESTION_COUNT} questions — no bonus questions` : `${REGULAR_QUESTION_COUNT} questions + ${BONUS_QUESTION_COUNT} bonus`}</li>
                  <li>• Must score <strong>{req2}%</strong> ({passCount2}/{REGULAR_QUESTION_COUNT} regular) to pass</li>
                  {mi2 ? (
                    <li>• No hints available</li>
                  ) : (
                    <li>• {HINTS_PER_OFFICIAL_TEST} hints available</li>
                  )}
                  <li>• Test is locked to this device until complete</li>
                </ul>
              </div>

              {lockError && (
                <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{lockError}</p>
              )}
              {loadingOfficialStart && (
                <p className="mt-3 text-sm text-gray-600">Loading questions…</p>
              )}
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setPendingOfficialTest(null)
                    setPreloadedOfficialQuestions(null)
                    setLockError(null)
                    setSearchParams({})
                  }}
                  disabled={loadingOfficialStart}
                >
                  Study First
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={startOfficialWithLock}
                  disabled={loadingOfficialStart}
                >
                  {loadingOfficialStart ? 'Loading…' : "I'm Ready"}
                </button>
              </div>
            </div>
          </div>
          )
        })()}
      </>
    )
  }

  const labels = ['A', 'B', 'C', 'D']
  const showExplanation = sessionState.showResult

  return (
    <>
      {!testInProgress && <AppHeader />}
        <div className="container mx-auto max-w-2xl px-4 py-6">
          {!testInProgress && currentUser?.role === 'trainee' && <TraineeNavTabs />}
          {!testInProgress && <StudyNav />}
          <div className="content-area rounded-xl px-6 py-6">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowExitConfirm(true)}>
              Exit Test
            </button>
          <span className="text-sm text-gray-600">
            {mode === 'practice' ? `Question ${sessionState.index + 1} of this round` : `${sessionState.index + 1} / ${sessionState.questions.length}`}
            {mode === 'practice' && sessionState.streak > 0 && (
              <span className="ml-2 text-amber-600">Streak: {sessionState.streak}</span>
            )}
          </span>
        </div>
        <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
            style={{
              // Practice never has a fixed length (it keeps generating questions) —
              // show progress toward the next 10-question checkpoint instead of a
              // permanently-full bar that implied a finish line that doesn't exist.
              width: mode === 'practice'
                ? `${(((sessionState.index % PRACTICE_CHECKPOINT_SIZE) + 1) / PRACTICE_CHECKPOINT_SIZE) * 100}%`
                : `${((sessionState.index + 1) / sessionState.questions.length) * 100}%`,
            }}
          />
        </div>
        <div className="mb-4 text-center">
          <h2 className="text-lg font-bold text-gray-800">
            {mode === 'practice'
              ? `${prettyTestName(testId) || quiz?.title || testId} - Practice Test`
              : (quiz?.title || testId)}
          </h2>
          {(quiz?.subtitle || (shiftParam && getTestForShift(shiftParam)?.subtitle)) && (
            <p className="text-sm text-gray-500 mt-1">{quiz?.subtitle || getTestForShift(shiftParam)?.subtitle}</p>
          )}
        </div>
        <div className={`quiz-question-card rounded-xl border-2 p-6 shadow-sm ${currentQ.isBonus ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-400' : 'border-gray-200 bg-white'}`}>
          {currentQ.isBonus && (
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3 py-1 bg-amber-400 text-amber-900 rounded-full text-xs font-bold">
                BONUS QUESTION
              </span>
              <span className="text-xs text-gray-600">Extra credit — not required to pass</span>
            </div>
          )}
          {mode === 'practice' && currentQ.tier === 'struggle' && (
            <div className="flex items-center gap-1.5 mb-3 text-xs font-medium text-orange-700">
              <span aria-hidden>🎯</span>
              <span>You've struggled with this one before — that's why it's back</span>
            </div>
          )}
          <p className="mb-4 font-medium text-gray-800">{currentQ.q}</p>
          {mode === 'official' ? (
            (hintsRemaining === null || hintsRemaining > 0) && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--color-primary)] text-sm text-[var(--color-primary)] font-medium hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  onClick={useHint}
                  disabled={showExplanation}
                  title="Eliminates one wrong answer — official tests don't offer AI-guided hints"
                >
                  💡 Eliminate a wrong answer ({hintsRemaining ?? 0} left)
                </button>
              </div>
            )
          ) : (
            (hintsRemaining === null || hintsRemaining > 0) && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--color-primary)] text-sm text-[var(--color-primary)] font-medium hover:bg-green-50 disabled:opacity-50 transition-colors"
                  onClick={useHint}
                  disabled={showExplanation}
                >
                  💡 Eliminate an answer
                </button>
                <button
                  type="button"
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--color-primary)] text-sm text-[var(--color-primary)] font-medium hover:bg-green-50 disabled:opacity-50 transition-colors"
                  onClick={requestSocraticHint}
                  disabled={showExplanation || socraticLoading}
                >
                  {socraticLoading ? '…' : '💬 Ask for a hint'}
                </button>
              </div>
            )
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
          {showExplanation && currentQ.cardId && !flaggedQuestionIds.has(currentQ.cardId || sessionState.index) && (
            <div className="mt-3">
              {!flagPromptOpen ? (
                <button
                  type="button"
                  className="text-xs text-red-500 hover:text-red-700 underline"
                  onClick={() => setFlagPromptOpen(true)}
                >
                  Flag this question
                </button>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-800 mb-2">Why is this question wrong?</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['Wrong answer', 'Bad question', 'Typo', 'Outdated info'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`px-2.5 py-2 min-h-[44px] text-xs rounded-full border transition ${flagReason === r ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-300 hover:bg-red-100'}`}
                        onClick={() => setFlagReason(r)}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg mb-2"
                    placeholder="Or type your own reason…"
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                    maxLength={200}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="px-3 py-2 min-h-[44px] text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                      onClick={() => handleFlagQuestion(flagReason)}
                      disabled={!flagReason.trim() || flagSubmitting}
                    >
                      {flagSubmitting ? 'Submitting…' : 'Submit Flag'}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 min-h-[44px] text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                      onClick={() => { setFlagPromptOpen(false); setFlagReason('') }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {showExplanation && flaggedQuestionIds.has(currentQ.cardId || sessionState.index) && (
            <p className="mt-3 text-xs text-green-700">Question flagged for review.</p>
          )}
          {flagConfirmMsg && (
            <p className="mt-2 text-xs text-green-700 font-medium">{flagConfirmMsg}</p>
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
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="exit-test-title">
          <div className="max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 id="exit-test-title" className="text-lg font-bold text-gray-800">Exit test?</h3>
            <p className="mt-2 text-sm text-gray-600">
              {mode === 'official'
                ? 'Are you sure? Your progress will be lost. This will not count as an attempt — you can retake the test.'
                : 'Are you sure? Your progress will be lost.'}
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowExitConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  setShowExitConfirm(false)
                  exitQuiz()
                }}
              >
                Exit Test
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
