import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useNavigate, useLocation, Link } from 'react-router-dom'

const FLASHCARD_SESSION_KEY = 'flashcardSession'
import AppHeader from '../components/AppHeader'
import TraineeNavTabs from '../components/TraineeNavTabs'
import { useAuth } from '../contexts/AuthContext'
import { useFlashcardMastery } from '../hooks/useFlashcardMastery'
import { useFlashcardQuarantine } from '../hooks/useFlashcardQuarantine'
import { FLASHCARD_SETS, FLASHCARD_DATABASE } from '../data/flashcardDatabase'
import { stableCardId } from '../utils/helpers'

/** Build study deck: struggle first, then rest. Gatekeeper for content integrity—filters out quarantined card IDs so reported cards are hidden for all users. */
function buildStudyDeck(setId, focusModeOnly, getStruggleCards, quarantinedCardIds = new Set()) {
  const cards = FLASHCARD_DATABASE[setId] || []
  const struggleIds = new Set(getStruggleCards(setId))
  const withIds = cards
    .map((card) => ({ card, cardId: stableCardId(setId, card) }))
    .filter((e) => !quarantinedCardIds.has(e.cardId))
  const struggle = withIds.filter((e) => struggleIds.has(e.cardId))
  const rest = withIds.filter((e) => !struggleIds.has(e.cardId))
  if (focusModeOnly) return struggle
  return [...struggle, ...rest]
}

function cleanJeopardyText(description, answer) {
  if (!description || !answer) return description || ''
  const name = String(answer).trim()
  if (!name) return description
  let out = String(description)
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  out = out.replace(new RegExp(escaped + '\\s*[\\-–:]?\\s*', 'gi'), ' ')
  out = out.replace(new RegExp('\\b' + escaped + '\\b', 'gi'), ' ')
  const words = name.split(/\s+/).filter((w) => w.length > 1)
  for (const word of words) {
    const wEsc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp('\\b' + wEsc + '\\b', 'gi'), ' ')
  }
  out = out.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n\n+/g, '\n').trim()
  const lines = out.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  const filtered = lines.filter((line) => {
    const lower = line.toLowerCase()
    const nameLower = name.toLowerCase()
    if (lower === nameLower || lower.startsWith(nameLower + ' ') || lower.startsWith(nameLower + ':') || lower.startsWith(nameLower + '-')) return false
    const lineWords = line.split(/\s+/)
    if (lineWords.length <= 2 && words.some((w) => lower.includes(w.toLowerCase()))) return false
    return true
  })
  out = filtered.join('\n').trim()
  return out || '(Details hidden — guess the item)'
}

function Flashcard({ card, isFlipped, onFlip, jeopardy = false }) {
  let displayFront = jeopardy ? card.back : card.front
  let displayBack = jeopardy ? card.front : card.back
  if (jeopardy && displayFront) displayFront = cleanJeopardyText(displayFront, card.front)
  return (
    <div
      className="flashcard-container cursor-pointer perspective-1000"
      onClick={onFlip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onFlip()}
    >
      <div className={`flashcard-inner relative w-full h-64 ${isFlipped ? 'flipped' : ''}`}>
        <div className="flashcard-face flashcard-front absolute inset-0 flex flex-col rounded-xl border-2 border-[var(--color-primary)] bg-white p-6 shadow-lg backface-hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{jeopardy ? 'The Ingredients / Details' : 'The Item'}</p>
          <p className="text-center text-lg font-medium text-gray-900 whitespace-pre-wrap flex-1 flex items-center justify-center">{displayFront}</p>
        </div>
        <div className="flashcard-face flashcard-back absolute inset-0 flex flex-col rounded-xl border-2 border-[var(--color-primary)] bg-green-50 p-6 shadow-lg backface-hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">{jeopardy ? 'The Item Name' : 'The Details'}</p>
          <p className="text-center text-base text-gray-800 whitespace-pre-wrap flex-1 flex items-center justify-center">{displayBack}</p>
        </div>
      </div>
    </div>
  )
}

export default function FlashcardsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentUser } = useAuth()
  const traineeId = currentUser?.traineeId || currentUser?.id
  const { getMastery, recordResult, getStruggleCards } = useFlashcardMastery(traineeId)
  const { quarantinedCardIds, reportInaccuracy } = useFlashcardQuarantine()

  const setId = searchParams.get('set')
  const focusMode = searchParams.get('focus') === '1'

  const [sessionState, setSessionState] = useState({ index: 0, flipped: false })
  const [completed, setCompleted] = useState(false)
  const [isJeopardyMode, setIsJeopardyMode] = useState(false)
  const [toast, setToast] = useState(null)
  const [sessionDeck, setSessionDeck] = useState([])
  const [reportingInaccurate, setReportingInaccurate] = useState(false)
  const [reportErrorModal, setReportErrorModal] = useState(false)
  const [reportReason, setReportReason] = useState('')

  const deck = useMemo(() => {
    if (!setId) return []
    return buildStudyDeck(setId, focusMode, getStruggleCards, quarantinedCardIds)
  }, [setId, focusMode, getStruggleCards, quarantinedCardIds])

  useEffect(() => {
    if (deck.length > 0) setSessionDeck(deck)
  }, [deck])

  const resumeIndex = location.state?.resumeIndex
  useEffect(() => {
    if (setId && resumeIndex != null && resumeIndex >= 0 && deck.length > 0) {
      setSessionState((s) => ({ ...s, index: Math.min(resumeIndex, deck.length - 1) }))
      setSessionDeck(deck)
    }
  }, [setId, resumeIndex, deck.length])

  const displayDeck = sessionDeck.length > 0 ? sessionDeck : deck
  const currentEntry = displayDeck[sessionState.index]

  useEffect(() => {
    if (!traineeId || !setId || displayDeck.length === 0 || completed) return
    try {
      const key = `${FLASHCARD_SESSION_KEY}_${traineeId}`
      localStorage.setItem(
        key,
        JSON.stringify({
          setId,
          focusMode,
          index: sessionState.index,
        })
      )
    } catch (_) {}
  }, [traineeId, setId, focusMode, sessionState.index, displayDeck.length, completed])

  const setMeta = FLASHCARD_SETS.find((s) => s.id === setId)
  const struggleCount = setId && traineeId ? getStruggleCards(setId).length : 0

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleFlip = () => setSessionState((s) => ({ ...s, flipped: !s.flipped }))
  const handleFeedback = (result) => {
    if (currentEntry && traineeId) {
      recordResult(currentEntry.cardId, result)
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
  }

  const startSession = (id, focus = false) => {
    setSearchParams(focus ? { set: id, focus: '1' } : { set: id })
    setSessionState({ index: 0, flipped: false })
    setSessionDeck([])
    setCompleted(false)
  }
  const exitSession = () => {
    setSearchParams({})
    setSessionDeck([])
    setCompleted(false)
    if (traineeId) {
      try {
        localStorage.removeItem(`${FLASHCARD_SESSION_KEY}_${traineeId}`)
      } catch (_) {}
    }
  }

  function StudyNav() {
    return (
      <nav className="study-nav">
        <button type="button" className="link-style bg-transparent border-0 cursor-pointer p-0" onClick={() => navigate('/trainee')}>
          ← Dashboard
        </button>
        <span className="text-gray-400">·</span>
        <span className="font-semibold text-gray-800">Flashcards</span>
        <span className="text-gray-400">·</span>
        <Link to="/quizzes">Practice Tests</Link>
        <span className="text-gray-400">·</span>
        <Link to="/quizzes#tests">Tests</Link>
      </nav>
    )
  }

  if (!setId) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <h2 className="study-page-title text-xl">Flashcards</h2>
          <div className="rounded-b-xl bg-white px-4 py-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FLASHCARD_SETS.map((set) => {
              const count = (FLASHCARD_DATABASE[set.id] || []).length
              const struggleCount = traineeId ? getStruggleCards(set.id).length : 0
              return (
                <div
                  key={set.id}
                  className="rounded-xl border border-gray-200 border-l-4 border-l-[var(--color-primary)] bg-white p-4 shadow-sm"
                >
                  <h3 className="font-bold text-gray-800">{set.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{set.description}</p>
                  <p className="mt-2 text-sm text-gray-500">
                    {count} cards
                    {struggleCount > 0 && (
                      <span className="ml-2 text-orange-600">· {struggleCount} need practice</span>
                    )}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-small" onClick={() => startSession(set.id)}>
                      Study
                    </button>
                    {struggleCount > 0 && (
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => startSession(set.id, true)}
                      >
                        Focus mode
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </div>
        </div>
      </>
    )
  }

  if (deck.length === 0) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <div className="content-area text-center py-12">
            <p className="text-4xl mb-3" aria-hidden="true">&#128161;</p>
            <p className="text-gray-600 font-medium">
              {focusMode ? 'No cards need practice in this set.' : 'No cards in this set.'}
            </p>
            <button type="button" className="btn btn-secondary btn-small mt-6" onClick={exitSession}>
              ← Back to sets
            </button>
          </div>
        </div>
      </>
    )
  }

  if (completed) {
    if (traineeId) {
      try {
        localStorage.removeItem(`${FLASHCARD_SESSION_KEY}_${traineeId}`)
      } catch (_) {}
    }
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <div className="content-area text-center py-12">
            <p className="text-5xl mb-4 text-[var(--color-primary)]" aria-hidden="true">✓</p>
            <h2 className="text-xl font-bold text-gray-800">Session complete</h2>
            <p className="mt-2 text-gray-600">You went through {displayDeck.length} card(s).</p>
            <button type="button" className="btn mt-6" onClick={exitSession}>
              Back to sets
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <AppHeader />
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {currentUser?.role === 'trainee' && <TraineeNavTabs />}
        <StudyNav />
        <div className="mb-4 flex items-center justify-between">
          <button type="button" className="btn btn-secondary btn-small" onClick={exitSession}>
            ← Exit
          </button>
          <span className="text-sm text-gray-600">
            Card {sessionState.index + 1} of {displayDeck.length}
            {struggleCount > 0 && ` · ${struggleCount} need practice`}
          </span>
        </div>
        <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
            style={{ width: `${displayDeck.length ? ((sessionState.index + 1) / displayDeck.length) * 100 : 0}%` }}
          />
        </div>
        <div className="study-session-header">
          <h2 className="study-session-header-title mb-2 text-center text-lg font-bold">{setMeta?.title || setId}</h2>
          <p className="study-session-header-subtitle mb-1 text-center text-sm font-medium">
            {isJeopardyMode ? 'Jeopardy Mode (Answer → Question)' : 'Standard Mode'}
          </p>
          <p className="study-session-header-desc mb-4 text-center max-w-lg mx-auto">
            Try to recall the answer before flipping. Cards you mark &quot;Need practice&quot; are saved and shown first next time—and in Focus mode you only see those cards. Practice tests for those topics give you more questions.
          </p>
          <div className="flex justify-center">
            <button
              type="button"
              className={`btn btn-small ${isJeopardyMode ? 'bg-[#5e35b1] border-[#5e35b1] text-white' : 'bg-white/20 border-white text-white hover:bg-white/30'}`}
              onClick={() => setIsJeopardyMode((v) => !v)}
              title="Reverse: show details first, guess the item"
            >
              {isJeopardyMode ? 'Jeopardy Mode ✓' : 'Jeopardy Mode'}
            </button>
          </div>
        </div>
        <Flashcard
          card={currentEntry.card}
          isFlipped={sessionState.flipped}
          onFlip={handleFlip}
          jeopardy={isJeopardyMode}
        />
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleFeedback('needsPractice')}
          >
            🧠 Need Practice
          </button>
          <button type="button" className="btn" onClick={() => handleFeedback('gotIt')}>
            Got it
          </button>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500">Data Check</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="btn btn-small border-2 border-green-600 bg-white text-green-700 hover:bg-green-50"
              onClick={() => showToast('✅ Accurate')}
            >
              ✅ Accurate
            </button>
            <button
              type="button"
              className="btn btn-small border-2 border-red-500 bg-white text-red-600 hover:bg-red-50"
              disabled={reportingInaccurate}
              onClick={() => setReportErrorModal(true)}
            >
              ❌ Report Error
            </button>
          </div>
        </div>
        {reportErrorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !reportingInaccurate && setReportErrorModal(false)}>
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Report Error</h3>
              <p className="text-sm text-gray-600 mb-3">This card will be quarantined and hidden until an admin reviews. Describe the issue:</p>
              <input
                type="text"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm mb-4"
                placeholder="e.g. Price changed, wrong ingredient, typo"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn btn-secondary btn-small" onClick={() => { setReportErrorModal(false); setReportReason('') }} disabled={reportingInaccurate}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={reportingInaccurate}
                  onClick={async () => {
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
                  }}
                >
                  {reportingInaccurate ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </>
  )
}
