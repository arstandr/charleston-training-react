import { useState, useEffect, useRef, useCallback } from 'react'
import * as flashcardIntelligence from '../services/flashcardIntelligenceService'
import { addWeakSpot, getWeakSpotsAsTempFlashcards, recordWeakSpotReview } from '../services/weakSpotsService'
import { celebrateMastery } from '../utils/celebrations'
import { logAuditEvent } from '../services/auditService'
import { useManagerAssessment } from './useManagerAssessment'

/**
 * useFlashcardSession
 *
 * Encapsulates all flashcard study session state and logic:
 *   - Deck building (with weak spots injection)
 *   - Session state (current index, flipped card)
 *   - Feedback handling (gotIt / needsPractice, deck reordering)
 *   - Keyboard shortcuts (Space/Enter = flip, Arrow keys = navigate, 1/2 = feedback)
 *   - Touch/swipe handlers
 *   - Session logging / audit trail
 *   - Manager "Quiz Me" mode (question queue, answer submission, flagging)
 *
 * @param {object} params
 * @param {string|null}  params.setId              - Active flashcard set ID (from URL ?set=)
 * @param {boolean}      params.focusMode           - Whether focus mode is active (from URL ?focus=1)
 * @param {object}       params.flashcardData       - { sets: [], database: {} } from parent
 * @param {object|null}  params.currentUser         - currentUser from AuthContext
 * @param {string|null}  params.traineeId           - Resolved trainee ID
 * @param {string|null}  params.userId              - Resolved user ID (uid or id)
 * @param {Function}     params.buildDeck           - From useFlashcardMastery
 * @param {Function}     params.recordResult        - From useFlashcardMastery
 * @param {Function}     params.getSavedSession     - From useFlashcardMastery
 * @param {string[]|Set} params.quarantinedCardIds  - From useFlashcardQuarantine
 * @param {number|null}  params.resumeIndex         - Index to resume from (location.state?.resumeIndex)
 * @param {Function}     params.reportInaccuracy    - From useFlashcardQuarantine
 * @param {Function}     params.onExitSession       - Called when session exits (clears URL params, etc.)
 */
export function useFlashcardSession({
  setId,
  focusMode,
  flashcardData,
  currentUser,
  traineeId,
  userId,
  buildDeck,
  recordResult,
  getSavedSession,
  quarantinedCardIds,
  resumeIndex,
  reportInaccuracy,
  onExitSession,
}) {
  // ─── Core session state ────────────────────────────────────────────────────
  const [sessionState, setSessionState] = useState({ index: 0, flipped: false })
  const [completed, setCompleted] = useState(false)
  const [sessionDeck, setSessionDeck] = useState([])
  const [deckLoading, setDeckLoading] = useState(false)
  const [allCaughtUp, setAllCaughtUp] = useState(false)
  const [savedSession, setSavedSession] = useState(null)

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const sessionNumberRef = useRef(1)
  const sessionStartTimeRef = useRef(null)
  const hasLoggedCompletionRef = useRef(false)
  const sessionResultsRef = useRef({ gotIt: 0, needsPractice: 0 })

  // ─── UI state ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null)
  const [feedbackLock, setFeedbackLock] = useState(false)
  const [isJeopardyMode, setIsJeopardyMode] = useState(false)
  const [swipeHintDismissed, setSwipeHintDismissed] = useState(() => {
    try {
      return localStorage.getItem('flashcardSwipeHintSeen') === 'true'
    } catch {
      return false
    }
  })

  // ─── Report error modal state ──────────────────────────────────────────────
  const [reportingInaccurate, setReportingInaccurate] = useState(false)
  const [reportErrorModal, setReportErrorModal] = useState(false)
  const [reportReason, setReportReason] = useState('')

  // ─── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  // ─── Derived ───────────────────────────────────────────────────────────────
  const displayDeck = sessionDeck
  const currentEntry = displayDeck[sessionState.index]

  // ─── Manager quiz (extracted hook) ────────────────────────────────────────
  const {
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
  } = useManagerAssessment({ displayDeck, currentUser, showToast })

  // ─── Deck building effect ──────────────────────────────────────────────────
  useEffect(() => {
    if (!setId) {
      setSessionDeck([])
      setDeckLoading(false)
      return
    }
    let cancelled = false
    setDeckLoading(true)
    setSessionDeck([])
    sessionResultsRef.current = { gotIt: 0, needsPractice: 0 }
    buildDeck(setId, flashcardData.database[setId] || [], focusMode, quarantinedCardIds, true).then(async (result) => {
      try {
        const deck = Array.isArray(result) ? result : (result?.deck || [])
        const allCaughtUpFlag = result?.allCaughtUp === true
        if (result?.sessionNumber != null) sessionNumberRef.current = result.sessionNumber

        if (cancelled) {
          setDeckLoading(false)
          return
        }
        setAllCaughtUp(allCaughtUpFlag)

        if (allCaughtUpFlag && deck.length === 0) {
          if (!cancelled) setDeckLoading(false)
          return
        }

        const uid = currentUser?.uid
        if (uid && deck.length > 0) {
          try {
            const tempCards = await getWeakSpotsAsTempFlashcards(uid)
            const tempEntries = tempCards.map((t) => ({
              card: { front: t.front, back: t.back },
              cardId: `weakSpot_${t.weakSpotId}`,
              isWeakSpot: true,
              weakSpotId: t.weakSpotId,
            }))
            if (!cancelled) setSessionDeck([...tempEntries, ...deck])
          } catch (err) {
            console.warn('Weak spots failed (e.g. missing Firestore index), using deck without weak spots:', err)
            if (!cancelled) setSessionDeck(deck)
          }
        } else {
          if (!cancelled) setSessionDeck(deck)
        }
        if (!cancelled) {
          sessionStartTimeRef.current = Date.now()
          setDeckLoading(false)
        }
      } catch (err) {
        console.warn('Deck build failed:', err)
        if (!cancelled) {
          setSessionDeck([])
          setDeckLoading(false)
        }
      }
    }).catch((err) => {
      console.warn('Deck build failed:', err)
      if (!cancelled) setDeckLoading(false)
    })
    return () => { cancelled = true }
  }, [setId, focusMode, buildDeck, quarantinedCardIds, flashcardData.database, currentUser?.uid])

  // ─── Resume index effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (setId && resumeIndex != null && resumeIndex >= 0 && sessionDeck.length > 0) {
      setSessionState((s) => ({ ...s, index: Math.min(resumeIndex, sessionDeck.length - 1) }))
    }
  }, [setId, resumeIndex, sessionDeck.length])

  // ─── Persist session progress (throttled: every 5th card to reduce writes) ─
  useEffect(() => {
    if (!userId || !setId || sessionDeck.length === 0 || completed) return
    // Write at index 0 (session start) and every 5th advance; skip intermediate cards
    if (sessionState.index > 0 && sessionState.index % 5 !== 0) return
    const cardIds = sessionDeck.map((e) => e.cardId)
    flashcardIntelligence.persistFlashcardSession(userId, setId, focusMode, cardIds, sessionState.index)
  }, [userId, setId, focusMode, sessionState.index, sessionDeck, completed])

  // ─── Load saved session (when on set picker / no active set) ──────────────
  useEffect(() => {
    if (setId || !userId) return
    getSavedSession().then((data) => setSavedSession(data || null))
  }, [setId, userId, getSavedSession])

  // ─── Preload images for upcoming cards ────────────────────────────────────
  useEffect(() => {
    if (!setId || !sessionDeck.length) return
    const currentIdx = sessionState.index
    const preloadCount = 5
    const database = flashcardData.database[setId] || []
    for (let i = 1; i <= preloadCount; i++) {
      const nextIdx = currentIdx + i
      if (nextIdx >= sessionDeck.length) break
      const entry = sessionDeck[nextIdx]
      const card = entry?.card ?? database.find((c) => c.id === entry?.cardId)
      const imageUrl = card?.imageUrl || card?.image
      if (imageUrl) {
        const img = new Image()
        img.src = imageUrl
      }
    }
  }, [sessionState.index, sessionDeck, setId, flashcardData.database])

  // ─── Session completion logging ────────────────────────────────────────────
  useEffect(() => {
    if (!completed || !userId || !setId || hasLoggedCompletionRef.current) return
    hasLoggedCompletionRef.current = true
    const timeSpentSec = (Date.now() - (sessionStartTimeRef.current || Date.now())) / 1000
    const category = flashcardData.sets.find((s) => s.id === setId)?.title || setId
    flashcardIntelligence.logFlashcardSession(userId, setId, category, sessionDeck.length, 100, timeSpentSec, {
      gotIt: sessionResultsRef.current.gotIt,
      needsPractice: sessionResultsRef.current.needsPractice,
      traineeId: traineeId || '',
    })
    flashcardIntelligence.clearFlashcardSession(userId)
    logAuditEvent(userId, currentUser?.name, 'flashcard_session', { setId, cardsViewed: sessionDeck.length, percentComplete: 100, timeSpent: timeSpentSec })
    celebrateMastery()
  }, [completed, userId, setId, sessionDeck.length, currentUser?.name, flashcardData.sets, traineeId])

  // ─── Flip handler ──────────────────────────────────────────────────────────
  const handleFlip = useCallback(() => setSessionState((s) => ({ ...s, flipped: !s.flipped })), [])

  // ─── Feedback handler ──────────────────────────────────────────────────────
  const handleFeedback = useCallback(
    async (result) => {
      if (feedbackLock) return
      setFeedbackLock(true)
      if (result === 'gotIt') sessionResultsRef.current.gotIt++
      else if (result === 'needsPractice') sessionResultsRef.current.needsPractice++
      const isWeakSpot = currentEntry?.isWeakSpot && currentEntry?.weakSpotId
      if (isWeakSpot) {
        recordWeakSpotReview(currentEntry.weakSpotId, result === 'gotIt').catch(() => {})
      } else if (currentEntry && userId) {
        recordResult(currentEntry.cardId, result, sessionNumberRef.current).catch((err) =>
          console.warn('Failed to save flashcard result:', err)
        )
        if (result === 'needsPractice' && setId) {
          addWeakSpot(userId, {
            questionText: currentEntry.card?.front ?? '',
            correctAnswer: currentEntry.card?.back ?? '',
            wrongAnswer: '',
            setId,
            source: 'flashcard',
          }).catch(() => {})
        }
      }
      if (result === 'gotIt') {
        showToast('Saved.')
      }
      if (result === 'needsPractice' && displayDeck.length > 0) {
        const i = sessionState.index
        const restWithoutI = [...displayDeck.slice(0, i), ...displayDeck.slice(i + 1)]
        const insertAt = Math.min(i + 4, restWithoutI.length)
        const newDeck = [...restWithoutI.slice(0, insertAt), { ...currentEntry }, ...restWithoutI.slice(insertAt)]
        setSessionDeck(newDeck)
        showToast('↺ Saved for quick retry.')
        setSessionState({ index: i, flipped: false })
        setTimeout(() => setFeedbackLock(false), 300)
        return
      }
      if (result === 'needsPractice') {
        showToast("Saved — you'll see this card first next time.")
      }
      if (sessionState.index >= displayDeck.length - 1) {
        setCompleted(true)
      } else {
        setSessionState({ index: sessionState.index + 1, flipped: false })
      }
      setTimeout(() => setFeedbackLock(false), 300)
    },
    [currentEntry, userId, recordResult, displayDeck, sessionState.index, feedbackLock, setId, showToast]
  )

  // ─── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!setId || displayDeck.length === 0 || completed) return
    const onKeyDown = (e) => {
      if (e.target?.closest?.('input') || e.target?.closest?.('textarea')) return
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (sessionState.index > 0) setSessionState((s) => ({ ...s, index: s.index - 1, flipped: false }))
          break
        case 'ArrowRight':
          e.preventDefault()
          if (sessionState.index < displayDeck.length - 1) setSessionState((s) => ({ ...s, index: s.index + 1, flipped: false }))
          break
        case ' ':
        case 'Enter':
          e.preventDefault()
          setSessionState((s) => ({ ...s, flipped: !s.flipped }))
          break
        case '1':
          e.preventDefault()
          handleFeedback('gotIt')
          break
        case '2':
          e.preventDefault()
          handleFeedback('needsPractice')
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setId, displayDeck.length, completed, sessionState.index, handleFeedback])

  // ─── Touch/swipe handlers ──────────────────────────────────────────────────
  const touchStart = useRef({ x: 0, y: 0 })
  const touchEnd = useRef({ x: 0, y: 0 })
  const handleTouchStart = useCallback((e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])
  const handleTouchEnd = useCallback(
    (e) => {
      touchEnd.current = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
      const dx = touchEnd.current.x - touchStart.current.x
      const dy = touchEnd.current.y - touchStart.current.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) handleFeedback('gotIt')
        else handleFeedback('needsPractice')
      }
    },
    [handleFeedback]
  )

  // ─── Report inaccuracy handler ─────────────────────────────────────────────
  const handleReportInaccuracy = useCallback(async () => {
    if (!currentEntry || !setId || !traineeId) return
    setReportingInaccurate(true)
    try {
      await reportInaccuracy({
        setId,
        cardId: currentEntry.cardId,
        front: currentEntry.card?.front,
        back: currentEntry.card?.back,
        reason: reportReason.trim() || 'Flagged as inaccurate',
        reportedBy: traineeId,
      })
      showToast('Card quarantined. It will be removed until an admin reviews.')
      setReportErrorModal(false)
      setReportReason('')
      const i = sessionState.index
      const restWithoutI = [...displayDeck.slice(0, i), ...displayDeck.slice(i + 1)]
      setSessionDeck(restWithoutI)
      if (restWithoutI.length === 0) setCompleted(true)
      else setSessionState({ index: Math.min(i, restWithoutI.length - 1), flipped: false })
    } catch (_) {
      showToast('Failed to report. Try again.')
    } finally {
      setReportingInaccurate(false)
    }
  }, [currentEntry, setId, traineeId, reportReason, displayDeck, sessionState.index, reportInaccuracy, showToast])

  // ─── Study all cards anyway (override allCaughtUp) ─────────────────────────
  const studyAllAnyway = useCallback(async () => {
    setDeckLoading(true)
    try {
      const result = await buildDeck(setId, flashcardData.database[setId] || [], focusMode, quarantinedCardIds, false)
      const deck = Array.isArray(result) ? result : (result?.deck || [])
      setAllCaughtUp(false)
      setSessionDeck(deck)
    } finally {
      setDeckLoading(false)
    }
  }, [buildDeck, setId, flashcardData.database, focusMode, quarantinedCardIds])

  // ─── Reset session state when starting a new session ──────────────────────
  const resetSessionState = useCallback(() => {
    hasLoggedCompletionRef.current = false
    setSessionState({ index: 0, flipped: false })
    setSessionDeck([])
    setCompleted(false)
    resetManagerState()
  }, [resetManagerState])

  // ─── Exit session ──────────────────────────────────────────────────────────
  const exitSession = useCallback(() => {
    hasLoggedCompletionRef.current = false
    setSessionDeck([])
    setCompleted(false)
    resetManagerState()
    if (userId) {
      flashcardIntelligence.clearFlashcardSession(userId)
    }
    if (onExitSession) onExitSession()
  }, [userId, onExitSession, resetManagerState])

  return {
    // ── Core session state ──────────────────────────────────────────────────
    sessionState,
    setSessionState,
    completed,
    setCompleted,
    sessionDeck,
    setSessionDeck,
    deckLoading,
    setDeckLoading,
    allCaughtUp,
    setAllCaughtUp,
    savedSession,
    displayDeck,
    currentEntry,

    // ── UI state ────────────────────────────────────────────────────────────
    toast,
    showToast,
    feedbackLock,
    isJeopardyMode,
    setIsJeopardyMode,
    swipeHintDismissed,
    setSwipeHintDismissed,

    // ── Report error state ──────────────────────────────────────────────────
    reportingInaccurate,
    reportErrorModal,
    setReportErrorModal,
    reportReason,
    setReportReason,
    handleReportInaccuracy,

    // ── Handlers ────────────────────────────────────────────────────────────
    handleFlip,
    handleFeedback,
    handleTouchStart,
    handleTouchEnd,

    // ── Session lifecycle ───────────────────────────────────────────────────
    resetSessionState,
    exitSession,
    studyAllAnyway,

    // ── Manager quiz ────────────────────────────────────────────────────────
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
  }
}
