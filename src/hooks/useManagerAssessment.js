import { useState, useRef, useCallback } from 'react'
import { flagManagerQuizQuestion } from '../services/flashcardFlags'
import { isAnswerClose, SERVICE_REVIEW_POOL, RECALL_TEMPLATES } from '../utils/flashcardStudyHelpers'

const PRELOAD_AHEAD = 3

/**
 * useManagerAssessment
 *
 * Encapsulates all "Quiz Me Like a Manager" logic:
 *   - Question queue generation (service review + recall from flashcard deck)
 *   - Answer submission and scoring
 *   - Question flagging
 *
 * Extracted from useFlashcardSession — zero functionality changes.
 *
 * @param {object} params
 * @param {Array}          params.displayDeck   - Current session deck entries (each has { card, cardId })
 * @param {object|null}    params.currentUser   - currentUser from AuthContext (used for flagging)
 * @param {Function}       params.showToast     - Toast display function from parent hook
 */
export function useManagerAssessment({ displayDeck, currentUser, showToast }) {
  // ─── State ────────────────────────────────────────────────────────────────
  const [studyMode, setStudyMode] = useState('flashcards')
  const [managerQuestion, setManagerQuestion] = useState(null)
  const [managerAnswer, setManagerAnswer] = useState('')
  const [managerSelectedOption, setManagerSelectedOption] = useState(null)
  const [showManagerFeedback, setShowManagerFeedback] = useState(false)
  const [managerFeedback, setManagerFeedback] = useState(null)
  const [managerScore, setManagerScore] = useState({ correct: 0, total: 0 })
  const [managerLoading, setManagerLoading] = useState(false)
  const [managerFlagging, setManagerFlagging] = useState(false)

  // ─── Refs ─────────────────────────────────────────────────────────────────
  const managerQuestionQueueRef = useRef([])
  const managerCardDeckRef = useRef([])
  const managerNextCardIndexRef = useRef(0)
  const managerQueueFillingRef = useRef(false)

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function getManagerEntries() {
    return displayDeck.filter((e) => e?.card).map((e) => {
      const card = e.card
      const front = (card.cardType === 'reverse' ? (card.back || '').trim() : (card.front || '').trim()) || card.front
      const back = (card.cardType === 'reverse' ? (card.front || '').trim() : (card.back || '').trim()) || card.back
      return { cardId: e.cardId, card: { ...card, front, back } }
    })
  }

  function shuffleArray(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function generateOneManagerQuestion(entry) {
    const { cardId, card } = entry
    const front = (card.front || '').slice(0, 80)
    const back = card.back || ''

    if (Math.random() < 0.20) {
      const idx = Math.floor(Math.random() * SERVICE_REVIEW_POOL.length)
      const item = SERVICE_REVIEW_POOL[idx]
      return {
        cardId: `service_review_${idx}`,
        question: item.question,
        correctAnswer: item.correctAnswer,
        fullAnswer: item.correctAnswer,
        questionType: 'service_review',
      }
    }

    const template = RECALL_TEMPLATES[Math.floor(Math.random() * RECALL_TEMPLATES.length)]
    return {
      cardId,
      question: template(front),
      correctAnswer: back,
      fullAnswer: back,
      questionType: 'recall',
    }
  }

  function fillManagerQueue() {
    if (managerQueueFillingRef.current) return
    const deck = managerCardDeckRef.current
    if (!deck.length) return

    managerQueueFillingRef.current = true
    let i = managerNextCardIndexRef.current
    while (i < deck.length && managerQuestionQueueRef.current.length < PRELOAD_AHEAD) {
      managerQuestionQueueRef.current.push(generateOneManagerQuestion(deck[i]))
      i++
      managerNextCardIndexRef.current = i
    }
    managerQueueFillingRef.current = false
  }

  // ─── Public functions ─────────────────────────────────────────────────────
  function startManagerQuiz() {
    setShowManagerFeedback(false)
    setManagerAnswer('')
    setManagerSelectedOption(null)
    setManagerFeedback(null)
    const entries = getManagerEntries()
    if (!entries.length) {
      setManagerQuestion({ question: 'No cards available for this set.', correctAnswer: '' })
      return
    }

    const shuffled = shuffleArray(entries)
    managerCardDeckRef.current = shuffled
    managerQuestionQueueRef.current = []
    managerNextCardIndexRef.current = 0
    managerQueueFillingRef.current = false

    const first = generateOneManagerQuestion(shuffled[0])
    managerNextCardIndexRef.current = 1
    setManagerQuestion(first)
    fillManagerQueue()
  }

  function showNextManagerQuestion() {
    setShowManagerFeedback(false)
    setManagerAnswer('')
    setManagerSelectedOption(null)
    setManagerFeedback(null)

    const queue = managerQuestionQueueRef.current
    const deck = managerCardDeckRef.current
    const nextIndex = managerNextCardIndexRef.current

    if (queue.length > 0) {
      setManagerQuestion(queue.shift())
      fillManagerQueue()
      return
    }
    if (nextIndex < deck.length) {
      const entry = deck[nextIndex]
      managerNextCardIndexRef.current = nextIndex + 1
      setManagerQuestion(generateOneManagerQuestion(entry))
      fillManagerQueue()
      return
    }
    setManagerQuestion(null)
  }

  function submitManagerAnswer() {
    if (!managerQuestion || showManagerFeedback || !managerAnswer.trim()) return
    const isCorrect =
      isAnswerClose(managerAnswer, managerQuestion.correctAnswer) ||
      isAnswerClose(managerAnswer, managerQuestion.fullAnswer)
    setManagerFeedback({
      score: isCorrect ? '\u2705' : '\u274C',
      feedback: isCorrect ? 'Correct!' : "Not quite \u2014 here's the answer:",
    })
    setShowManagerFeedback(true)
    setManagerScore((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }))
  }

  async function handleManagerFlag() {
    if (!managerQuestion?.cardId || managerFlagging) return
    setManagerFlagging(true)
    try {
      await flagManagerQuizQuestion({
        cardId: managerQuestion.cardId,
        flaggedBy: currentUser?.uid || '',
        questionText: managerQuestion.question,
        displayedAnswer: managerQuestion.correctAnswer,
      })
      showToast('Thanks! This question has been flagged for review.')
      setTimeout(() => {
        showNextManagerQuestion()
        setManagerFlagging(false)
      }, 1500)
    } catch (e) {
      showToast('Could not flag. Try again.')
      setManagerFlagging(false)
    }
  }

  /**
   * Reset all manager quiz state. Called by parent hook when starting
   * a new session or exiting.
   */
  const resetManagerState = useCallback(() => {
    setStudyMode('flashcards')
    setManagerQuestion(null)
    setManagerAnswer('')
    setShowManagerFeedback(false)
    setManagerFeedback(null)
    setManagerScore({ correct: 0, total: 0 })
  }, [])

  return {
    studyMode,
    setStudyMode,
    managerQuestion,
    managerAnswer,
    setManagerAnswer,
    managerSelectedOption,
    setManagerSelectedOption,
    showManagerFeedback,
    managerFeedback,
    managerScore,
    managerLoading,
    managerFlagging,
    startManagerQuiz,
    showNextManagerQuestion,
    submitManagerAnswer,
    handleManagerFlag,
    resetManagerState,
  }
}
