import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { getAllFlashcardSets, getActiveFlashcards, getCustomFlashcardSets } from '../services/flashcardService'
import AppHeader from '../components/AppHeader'
import TraineeNavTabs from '../components/TraineeNavTabs'
import { useAuth } from '../contexts/AuthContext'
import { useFlashcardMastery } from '../hooks/useFlashcardMastery'
import { useFlashcardQuarantine } from '../hooks/useFlashcardQuarantine'
import { useGemini } from '../contexts/GeminiContext'
import * as flashcardIntelligence from '../services/flashcardIntelligenceService'
import { addWeakSpot, getWeakSpotsAsTempFlashcards, recordWeakSpotReview } from '../services/weakSpotsService'
import { celebrateMastery } from '../utils/celebrations'
import { logAuditEvent } from '../services/auditService'
import { getCategoryTemplate } from '../utils/flashcardCategoryTemplates'
import { flagManagerQuizQuestion } from '../services/flashcardFlags'

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

const MANAGER_QUESTION_TYPES = [
  {
    id: 'sell_me',
    template: (context) => `Sell me two of your favorite ${context.category?.toLowerCase() || 'menu items'}.`,
    hint: 'Describe the items as you would to a guest — include key ingredients and why you like them.',
  },
  {
    id: 'whats_in_it',
    template: (item) => `A guest asks about the ${item.front || item.itemName}. What do you tell them?`,
    hint: 'Include all main ingredients, preparation method, and any sides.',
  },
  {
    id: 'garnish',
    template: (item) => `What's the garnish on the ${item.front || item.itemName}?`,
    hint: 'Name the specific garnish items.',
    appliesTo: ['soup'],
  },
  {
    id: 'upsell',
    template: () => {
      const scenarios = [
        'A guest orders a vodka and tonic. What do you upsell?',
        'A guest orders a Manhattan. What bourbon do you suggest?',
        'A guest orders a burger. What can you upsell as an extra?',
        'A guest orders a cup of soup. What do you suggest for $1 more?',
        'A guest orders dessert. What drink do you pair with it?',
        'A guest orders an entrée without a salad. How do you ring in the upsell?',
      ]
      return scenarios[Math.floor(Math.random() * scenarios.length)]
    },
    hint: 'Think about what increases the check total.',
  },
  {
    id: 'identify',
    template: (item) => {
      const details = item.back || item.details || ''
      const ingredients = details.replace(/^-|^•/gm, '').split('\n').filter((l) => l.trim()).slice(0, 4).join(', ')
      return ingredients ? `I'm describing a menu item: ${ingredients}. What is it?` : 'What menu item has these components?'
    },
    hint: 'Name the menu item based on the description.',
  },
  {
    id: 'service',
    template: () => {
      const questions = [
        'What is our maximum greet time?',
        'How long to get first round of drinks out?',
        'Name the 7 Steps of Service.',
        'What does a perfect pre-bus consist of?',
        "What are the 4 R's for the Red Check Procedure?",
        "A guest's steak is undercooked. What do you do?",
        'What is Tile Talk and how is it effective?',
        'What is the 10-step rule?',
        'How do you check out with a Shift Leader?',
        'What is our Mission Statement?',
      ]
      return questions[Math.floor(Math.random() * questions.length)]
    },
    hint: "Think about Charleston's service standards.",
  },
  {
    id: 'wine',
    template: () => {
      const questions = [
        'What is our sweetest white wine?',
        'What is our driest red wine?',
        'How much wine do we pour per glass?',
        'A guest orders a martini. What three things do you ask?',
        "Name the 3 V's of wine presentation.",
        'Describe the proper wine bottle opening procedure.',
      ]
      return questions[Math.floor(Math.random() * questions.length)]
    },
    hint: 'Think about bar and wine service knowledge.',
  },
]

// Service review questions with known correct answers (from training manual)
const SERVICE_REVIEW_POOL = [
  { question: 'What is our maximum amount of time to greet a table?', correctAnswer: '30 seconds' },
  { question: 'How long do you have to get your first round of drinks to a table?', correctAnswer: '2 minutes' },
  { question: 'All alcoholic beverages and hot beverages automatically receive what?', correctAnswer: 'A beverage napkin (bev nap)' },
  { question: 'Who has the "right of way" when moving about in Charleston\'s?', correctAnswer: 'The Guest always has the right of way' },
  { question: 'How many "Hellos/Thank you\'s" should a Guest hear?', correctAnswer: '5 of each during their visit' },
  { question: 'If a Guest asks "where is the restroom?" — what do you do?', correctAnswer: 'Say "Absolutely, right this way" and walk them there' },
  { question: 'How often do we perform Restroom Checks?', correctAnswer: 'Every 30 minutes' },
  { question: 'Where should your hand be when carrying glassware?', correctAnswer: 'By the stem or the bottom third — never the rim' },
  { question: 'Do we automatically serve straws with our waters, tea & sodas?', correctAnswer: 'Yes for sodas and tea, no for water (request only)' },
  { question: 'What does manicure your table mean?', correctAnswer: 'Remove small items like straw wrappers, sugar packets, and empty ramekins' },
  { question: 'What does a perfect pre-bus consist of?', correctAnswer: 'Removing finished plates, used silverware, and empty glasses' },
  { question: 'What is our Mission Statement?', correctAnswer: "To Consistently Exceed Our Guests' Expectations" },
  { question: "What are the 4 R's of the Red Check Procedure?", correctAnswer: 'Remove, Report, Red Check, Run' },
  { question: 'What is the 10-step rule?', correctAnswer: 'Once check is down, stay within 10 steps to process payment immediately' },
  { question: 'What does "Full Hands In" mean?', correctAnswer: 'Always enter the kitchen with dirty dishes — never go in empty handed' },
]

const RECALL_TEMPLATES = [
  (front) => `Tell me about ${front} — what should you know?`,
  (front) => `A guest asks about ${front}. What do you tell them?`,
  (front) => `What are the key details for ${front}?`,
  (front) => `Walk me through ${front}.`,
  (front) => `Pop quiz: ${front} — go!`,
  (front) => `What can you tell me about ${front}?`,
]

/** Forgiving answer matching — any meaningful part of the answer counts. */
function isAnswerClose(userAnswer, correctAnswer) {
  if (!userAnswer?.trim() || !correctAnswer) return false
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  const user = norm(userAnswer)
  const correct = norm(correctAnswer)
  if (!user) return false
  if (user === correct) return true
  // User's text found inside correct answer (min 3 chars)
  if (user.length >= 3 && correct.includes(user)) return true
  // Check against each line of multi-line answers
  const lines = correctAnswer.split(/[\n•]/).map((l) => norm(l)).filter((l) => l.length > 0)
  for (const line of lines) {
    if (user.length >= 3 && line.includes(user)) return true
    if (line.length >= 3 && user.includes(line)) return true
  }
  // Number matching: user typed a number that appears in the answer
  const userNums = user.match(/\d+/g) || []
  const correctNums = correct.match(/\d+/g) || []
  if (userNums.length > 0 && userNums.some((n) => correctNums.includes(n))) return true
  // Word overlap: significant words (3+ chars, not stop words)
  const stops = new Set(['the', 'and', 'for', 'are', 'was', 'not', 'you', 'our', 'with', 'that', 'this', 'from', 'they', 'been', 'have', 'will'])
  const userWords = user.split(' ').filter((w) => w.length >= 3 && !stops.has(w))
  if (userWords.length > 0) {
    const matches = userWords.filter((w) => correct.includes(w))
    if (matches.length > 0 && matches.length >= Math.ceil(userWords.length * 0.4)) return true
  }
  return false
}

function Flashcard({ card, isFlipped, onFlip, jeopardy = false }) {
  if (!card) return null
  let displayFront = jeopardy ? card.back : card.front
  let displayBack = jeopardy ? card.front : card.back
  if (jeopardy && displayFront) displayFront = cleanJeopardyText(displayFront, card.front)

  const showImageOnFront = card.imageUrl && !jeopardy
  const showImageOnBack = card.imageUrl && jeopardy

  return (
    <div
      className="flashcard-container cursor-pointer perspective-1000"
      onClick={onFlip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onFlip()}
    >
      <div className={`flashcard-inner relative w-full min-h-[300px] sm:min-h-[400px] ${isFlipped ? 'flipped' : ''}`}>
        {/* FRONT */}
        <div className="flashcard-face flashcard-front absolute inset-0 flex flex-col rounded-2xl border-2 border-[var(--color-primary)] bg-white overflow-hidden shadow-xl backface-hidden min-h-[300px] sm:min-h-[400px]">
          {showImageOnFront && (
            <div className="h-[150px] sm:h-[200px] w-full flex-shrink-0 flex items-center justify-center bg-gray-100 overflow-hidden">
              <img
                src={card.imageUrl}
                alt=""
                className="max-h-[150px] sm:max-h-[200px] max-w-full w-auto object-contain"
                onError={(e) => { e.target.parentElement.style.display = 'none' }}
              />
            </div>
          )}
          <div className="flex-1 flex flex-col px-6 py-4 min-h-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-primary)]/60 mb-2 flex-shrink-0">
              {jeopardy ? '🔄 The Details' : '🃏 The Item'}
            </p>
            <p className="text-center text-lg font-semibold text-gray-900 whitespace-pre-wrap flex-1 flex items-center justify-center leading-snug min-h-0">
              {displayFront}
            </p>
            <p className="text-center text-[10px] text-gray-400 mt-2 flex-shrink-0">
              {card.imageUrl && '📸 Photo from menu · '}Tap to flip
            </p>
          </div>
        </div>
        {/* BACK */}
        <div className="flashcard-face flashcard-back absolute inset-0 flex flex-col rounded-2xl border-2 border-[var(--color-primary)] bg-gradient-to-br from-green-50 to-emerald-50 overflow-hidden shadow-xl backface-hidden min-h-[300px] sm:min-h-[400px]">
          {showImageOnBack && (
            <div className="h-[150px] sm:h-[200px] w-full flex-shrink-0 flex items-center justify-center bg-gray-100 overflow-hidden">
              <img
                src={card.imageUrl}
                alt=""
                className="max-h-[150px] sm:max-h-[200px] max-w-full w-auto object-contain"
                onError={(e) => { e.target.parentElement.style.display = 'none' }}
              />
            </div>
          )}
          <div className="flex-1 flex flex-col px-6 py-4 min-h-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/60 mb-2 flex-shrink-0">
              {jeopardy ? '✅ The Item' : '✅ The Details'}
            </p>
            <p className="text-center text-base text-gray-800 whitespace-pre-wrap flex-1 flex items-center justify-center leading-relaxed min-h-0">
              {displayBack}
            </p>
            <p className="text-center text-[10px] text-gray-500 mt-2 flex-shrink-0">Tap to flip</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FlashcardsPageContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentUser } = useAuth()
  const traineeId = currentUser?.traineeId || currentUser?.id
  const {
    getMastery,
    recordResult,
    getStruggleCards,
    buildDeck,
    getStatistics,
    getSavedSession,
    statistics,
    userId,
  } = useFlashcardMastery(traineeId)
  const { quarantinedCardIds, reportInaccuracy } = useFlashcardQuarantine()
  const { generateFlashcardSuggestions, callGeminiJSON, isConfigured: geminiConfigured } = useGemini()

  const [flashcardData, setFlashcardData] = useState({ sets: [], database: {} })
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setDataLoading(true)
      try {
        const [setsResult, cardsResult, customResult] = await Promise.allSettled([
          getAllFlashcardSets(),
          getActiveFlashcards(),
          getCustomFlashcardSets(),
        ])
        if (cancelled) return
        const setsRaw = setsResult.status === 'fulfilled' ? setsResult.value : []
        const cardsRaw = cardsResult.status === 'fulfilled' ? cardsResult.value : []
        const customRaw = customResult.status === 'fulfilled' ? customResult.value : []
        if (setsResult.status === 'rejected') console.warn('Flashcard sets load failed:', setsResult.reason)
        if (cardsResult.status === 'rejected') console.warn('Flashcards load failed:', cardsResult.reason)
        if (customResult.status === 'rejected') console.warn('Custom flashcard sets load failed:', customResult.reason)
        const sets = setsRaw
          .filter((s) => s.status !== 'hidden')
          .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
        const database = {}
        for (const card of cardsRaw) {
          if (!database[card.setId]) database[card.setId] = []
          database[card.setId].push(card)
        }
        for (const set of sets) {
          set.cardCount = (database[set.id] || []).length
        }
        const customSets = customRaw.map((d) => ({
          id: d.id,
          title: d.title || 'Custom',
          category: d.category || 'Menu',
          cardCount: (d.cards || []).length,
          source: 'custom',
        }))
        for (const d of customRaw) {
          database[d.id] = d.cards || []
        }
        if (!cancelled) {
          setFlashcardData({
            sets: [...sets, ...customSets],
            database,
          })
        }
        if (!cancelled && sets.length === 0 && customSets.length === 0) {
          try {
            const m = await import('../data/flashcardDatabase')
            if (!cancelled) {
              setFlashcardData({
                sets: m.FLASHCARD_SETS || [],
                database: m.FLASHCARD_DATABASE || {},
              })
            }
          } catch (_) {}
        }
      } catch (e) {
        console.warn('Flashcard load error:', e)
        try {
          const m = await import('../data/flashcardDatabase')
          if (!cancelled) {
            setFlashcardData({
              sets: m.FLASHCARD_SETS || [],
              database: m.FLASHCARD_DATABASE || {},
            })
          }
        } catch (_) {}
      } finally {
        if (!cancelled) setDataLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const [generatingSuggestions, setGeneratingSuggestions] = useState(false)
  const [suggestionsTopic, setSuggestionsTopic] = useState('Menu Items')
  const [suggestions, setSuggestions] = useState([])
  const [suggestionsError, setSuggestionsError] = useState(null)

  const setId = searchParams.get('set')
  const focusMode = searchParams.get('focus') === '1'

  const [sessionState, setSessionState] = useState({ index: 0, flipped: false })
  const [completed, setCompleted] = useState(false)
  const [isJeopardyMode, setIsJeopardyMode] = useState(false)
  const [toast, setToast] = useState(null)
  const [sessionDeck, setSessionDeck] = useState([])
  const [deckLoading, setDeckLoading] = useState(false)
  const [savedSession, setSavedSession] = useState(null)
  const [allCaughtUp, setAllCaughtUp] = useState(false)
  const sessionNumberRef = useRef(1)
  const sessionStartTimeRef = useRef(null)
  const hasLoggedCompletionRef = useRef(false)
  const [reportingInaccurate, setReportingInaccurate] = useState(false)
  const [reportErrorModal, setReportErrorModal] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [feedbackLock, setFeedbackLock] = useState(false)

  const [studyMode, setStudyMode] = useState('flashcards')
  const [managerQuestion, setManagerQuestion] = useState(null)
  const [managerAnswer, setManagerAnswer] = useState('')
  const [managerSelectedOption, setManagerSelectedOption] = useState(null)
  const [showManagerFeedback, setShowManagerFeedback] = useState(false)
  const [managerFeedback, setManagerFeedback] = useState(null)
  const [managerScore, setManagerScore] = useState({ correct: 0, total: 0 })
  const [managerLoading, setManagerLoading] = useState(false)
  const [managerFlagging, setManagerFlagging] = useState(false)

  const PRELOAD_AHEAD = 3
  const managerQuestionQueueRef = useRef([])
  const managerCardDeckRef = useRef([])
  const managerNextCardIndexRef = useRef(0)
  const managerQueueFillingRef = useRef(false)

  useEffect(() => {
    if (!setId) {
      setSessionDeck([])
      setDeckLoading(false)
      return
    }
    let cancelled = false
    setDeckLoading(true)
    setSessionDeck([])
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

  const resumeIndex = location.state?.resumeIndex
  useEffect(() => {
    if (setId && resumeIndex != null && resumeIndex >= 0 && sessionDeck.length > 0) {
      setSessionState((s) => ({ ...s, index: Math.min(resumeIndex, sessionDeck.length - 1) }))
    }
  }, [setId, resumeIndex, sessionDeck.length])

  useEffect(() => {
    if (!userId || !setId || sessionDeck.length === 0 || completed) return
    const cardIds = sessionDeck.map((e) => e.cardId)
    flashcardIntelligence.persistFlashcardSession(userId, setId, focusMode, cardIds, sessionState.index)
  }, [userId, setId, focusMode, sessionState.index, sessionDeck, completed])

  useEffect(() => {
    if (setId || !userId) return
    getSavedSession().then((data) => setSavedSession(data || null))
  }, [setId, userId, getSavedSession])

  const displayDeck = sessionDeck
  const currentEntry = displayDeck[sessionState.index]

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

  useEffect(() => {
    if (!completed || !userId || !setId || hasLoggedCompletionRef.current) return
    hasLoggedCompletionRef.current = true
    const timeSpentSec = (Date.now() - (sessionStartTimeRef.current || Date.now())) / 1000
    const category = flashcardData.sets.find((s) => s.id === setId)?.title || setId
    flashcardIntelligence.logFlashcardSession(userId, setId, category, sessionDeck.length, 100, timeSpentSec)
    flashcardIntelligence.clearFlashcardSession(userId)
    logAuditEvent(userId, currentUser?.name, 'flashcard_session', { setId, cardsViewed: sessionDeck.length, percentComplete: 100, timeSpent: timeSpentSec })
    celebrateMastery()
  }, [completed, userId, setId, sessionDeck.length, currentUser?.name, flashcardData.sets])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }
  const handleFlip = useCallback(() => setSessionState((s) => ({ ...s, flipped: !s.flipped })), [])
  const handleFeedback = useCallback(
    async (result) => {
      if (feedbackLock) return
      setFeedbackLock(true)
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
    [currentEntry, userId, recordResult, displayDeck, sessionState.index, feedbackLock, setId]
  )

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

  const [swipeHintDismissed, setSwipeHintDismissed] = useState(() => {
    try {
      return localStorage.getItem('flashcardSwipeHintSeen') === 'true'
    } catch {
      return false
    }
  })

  const setMeta = flashcardData.sets.find((s) => s.id === setId)
  const struggleCount = setId && traineeId ? getStruggleCards(setId).length : 0

  async function handleGenerateSuggestions() {
    if (!geminiConfigured) {
      setSuggestionsError('Configure Gemini API key in Admin settings first.')
      return
    }
    setSuggestionsError(null)
    setGeneratingSuggestions(true)
    setSuggestions([])
    try {
      const existingFlashcards = []
      for (const [sid, cards] of Object.entries(flashcardData.database || {})) {
        if (!Array.isArray(cards)) continue
        cards.slice(0, 20).forEach((c) => {
          existingFlashcards.push({
            title: (c.front || '').slice(0, 50),
            front: c.front || '',
            back: c.back || '',
          })
        })
      }
      const result = await generateFlashcardSuggestions(suggestionsTopic.trim() || 'Menu Items', existingFlashcards, 5)
      setSuggestions(result?.flashcards || [])
    } catch (err) {
      setSuggestionsError(err.message || 'Failed to generate suggestions.')
    } finally {
      setGeneratingSuggestions(false)
    }
  }

  /** Entries that have a card, for manager quiz. Each has cardId and card. */
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

  /** Generate a single chat-style question for an entry — no options needed. */
  function generateOneManagerQuestion(entry) {
    const { cardId, card } = entry
    const front = (card.front || '').slice(0, 80)
    const back = card.back || ''

    // ~20% service review question
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

    // ~80% flashcard recall with manager voice
    const template = RECALL_TEMPLATES[Math.floor(Math.random() * RECALL_TEMPLATES.length)]
    return {
      cardId,
      question: template(front),
      correctAnswer: back,
      fullAnswer: back,
      questionType: 'recall',
    }
  }

  /** Background: keep question queue filled up to PRELOAD_AHEAD. */
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

  /** Start quiz from the current deck's cards. */
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

    // Generate first question immediately, prefill rest
    const first = generateOneManagerQuestion(shuffled[0])
    managerNextCardIndexRef.current = 1
    setManagerQuestion(first)
    fillManagerQueue()
  }

  /** Show next question from queue or generate on the fly. */
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

  /** Submit typed answer and check with forgiving matching. */
  function submitManagerAnswer() {
    if (!managerQuestion || showManagerFeedback || !managerAnswer.trim()) return
    const isCorrect =
      isAnswerClose(managerAnswer, managerQuestion.correctAnswer) ||
      isAnswerClose(managerAnswer, managerQuestion.fullAnswer)
    setManagerFeedback({
      score: isCorrect ? '✅' : '❌',
      feedback: isCorrect ? 'Correct!' : 'Not quite — here\'s the answer:',
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
      setToast('Thanks! This question has been flagged for review.')
      setTimeout(() => {
        showNextManagerQuestion()
        setManagerFlagging(false)
      }, 1500)
    } catch (e) {
      setToast('Could not flag. Try again.')
      setManagerFlagging(false)
    }
  }

  const startSession = (id, focus = false) => {
    hasLoggedCompletionRef.current = false
    setSearchParams(focus ? { set: id, focus: '1' } : { set: id })
    setSessionState({ index: 0, flipped: false })
    setSessionDeck([])
    setCompleted(false)
    setStudyMode('flashcards')
    setManagerQuestion(null)
    setManagerAnswer('')
    setShowManagerFeedback(false)
    setManagerFeedback(null)
    setManagerScore({ correct: 0, total: 0 })
  }
  const exitSession = useCallback(() => {
    hasLoggedCompletionRef.current = false
    setSearchParams({})
    setSessionDeck([])
    setCompleted(false)
    setStudyMode('flashcards')
    if (userId) {
      flashcardIntelligence.clearFlashcardSession(userId)
    }
  }, [userId])

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

  function LoadingSkeleton({ lines = 3 }) {
    return (
      <div className="space-y-3 animate-pulse p-4">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex gap-3 items-center">
            <div className="w-12 h-12 rounded-lg bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-2 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (dataLoading) {
    return (
      <>
        <AppHeader title="Flashcards" />
        <div className="min-h-[40vh] container mx-auto max-w-4xl px-4 py-6">
          <LoadingSkeleton lines={6} />
        </div>
      </>
    )
  }

  if (flashcardData.sets.length === 0) {
    return (
      <>
        <AppHeader />
        <div className="min-h-[40vh] flex items-center justify-center text-gray-600">
          No flashcard sets found. Run the seed function to migrate cards to Firestore.
        </div>
      </>
    )
  }

  if (!setId) {
    const rawStats = statistics
    // Compute total cards from database (not just progress records) for accurate summary
    const dbTotalCards = flashcardData.sets.reduce((sum, s) => sum + (flashcardData.database[s.id] || []).length, 0)
    // Fallback: when Firestore cards haven't loaded, use set.cardCount metadata
    let effectiveTotalCards = dbTotalCards
    if (dbTotalCards === 0 && flashcardData.sets.length > 0) {
      effectiveTotalCards = flashcardData.sets.reduce((sum, s) => sum + (s.cardCount || 0), 0)
    }
    const dbStruggleCards = flashcardData.sets.reduce((sum, s) => sum + (traineeId ? getStruggleCards(s.id).length : 0), 0)
    const stats = rawStats ? {
      ...rawStats,
      totalCards: effectiveTotalCards || rawStats.totalCards,
      masteryRate: effectiveTotalCards > 0 ? ((effectiveTotalCards - dbStruggleCards) / effectiveTotalCards) : rawStats.masteryRate,
    } : rawStats
    const setForResume = savedSession?.setId ? flashcardData.sets.find((s) => s.id === savedSession.setId) : null
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <h2 className="study-page-title text-xl text-white">Flashcards</h2>
          {savedSession && setForResume && (
            <div className="mb-4 rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary)] p-4 text-white">
              <p className="text-sm font-medium text-white mb-2">Resume your last session</p>
              <p className="text-sm text-white mb-2">
                {setForResume.title}
                {savedSession.focusMode ? ' (Focus mode)' : ''} · Card {((savedSession.currentIndex || 0) + 1)} of {((savedSession.cardIds || []).length) || '?'}
              </p>
              <button
                type="button"
                className="btn btn-small text-white border-white hover:bg-white/20"
                onClick={() =>
                  navigate('/flashcards', {
                    search: savedSession.focusMode ? `?set=${savedSession.setId}&focus=1` : `?set=${savedSession.setId}`,
                    state: { resumeIndex: savedSession.currentIndex ?? 0 },
                  })
                }
              >
                Resume
              </button>
            </div>
          )}
          {stats && (
            <section className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-bold text-gray-800 mb-2">Your progress</h3>
              <div className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2 lg:grid-cols-4">
                <span>Total cards: {stats.totalCards ?? 0}</span>
                <span>Mastered: {stats.masteredCards ?? 0}</span>
                <span>Need practice: {stats.needsPracticeCards ?? 0}</span>
                <span>Mastery rate: {typeof stats.masteryRate === 'number' ? Math.round(stats.masteryRate * 100) : 0}%</span>
              </div>
              {(stats.averageGotIt != null || (stats.struggleTopics?.length > 0) || (stats.strongTopics?.length > 0)) && (
                <div className="mt-2 text-sm text-gray-600">
                  {typeof stats.averageGotIt === 'number' && <span>Avg "Got it": {Math.round(stats.averageGotIt * 100)}%</span>}
                  {stats.struggleTopics?.length > 0 && (
                    <span className="ml-2">
                      Struggle topics: {stats.struggleTopics.map((id) => flashcardData.sets.find((s) => s.id === id)?.title || id).join(', ')}
                    </span>
                  )}
                  {stats.strongTopics?.length > 0 && (
                    <span className="ml-2">
                      Strong: {stats.strongTopics.map((id) => flashcardData.sets.find((s) => s.id === id)?.title || id).join(', ')}
                    </span>
                  )}
                </div>
              )}
            </section>
          )}
          <div className="rounded-b-xl bg-white px-4 py-6 shadow-sm">
          {currentUser?.role !== 'trainee' && (
          <section className="mb-8 rounded-xl border border-gray-200 border-l-4 border-l-purple-500 bg-purple-50/30 p-4">
            <h3 className="font-bold text-gray-800 mb-2">AI Suggest Flashcards</h3>
            <p className="text-sm text-gray-600 mb-3">Generate flashcard ideas based on a topic. Suggestions are read-only; use them as inspiration.</p>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                type="text"
                className="rounded border border-gray-300 px-3 py-2 text-sm w-48"
                placeholder="e.g. Menu Items, Bar procedures"
                value={suggestionsTopic}
                onChange={(e) => { setSuggestionsTopic(e.target.value); setSuggestionsError(null) }}
              />
              <button
                type="button"
                onClick={handleGenerateSuggestions}
                disabled={generatingSuggestions || !geminiConfigured}
                className="btn btn-small bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {generatingSuggestions ? 'Generating…' : 'AI Suggest Flashcards'}
              </button>
              {!geminiConfigured && <span className="text-xs text-gray-200">Configure Gemini in Admin settings.</span>}
            </div>
            {suggestionsError && (
              <p className="text-sm text-red-600 mb-2">{suggestionsError}</p>
            )}
            {suggestions.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">Suggestions:</p>
                {suggestions.map((card, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                    <p className="font-medium text-gray-800">{card.title || card.front}</p>
                    <p className="text-gray-600 mt-1">{card.front}</p>
                    <p className="text-gray-700 mt-1 border-t border-gray-100 pt-1">{card.back}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {flashcardData.sets.map((set) => {
              const count = (flashcardData.database[set.id] || []).length
              const needPractice = traineeId ? getStruggleCards(set.id).length : 0
              const masteryPct = count > 0 ? Math.round(((count - needPractice) / count) * 100) : 0
              return (
                <div
                  key={set.id}
                  className="relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #1F4D1C 0%, #2D5016 60%, #3E6B28 100%)' }}
                >
                  <div className="p-5 pb-3 cursor-pointer" onClick={() => startSession(set.id)}>
                    <div className="flex items-start justify-between">
                      <h3 className="text-white font-bold text-base leading-snug pr-2">{set.title}</h3>
                      <span className="flex-shrink-0 bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                        {count}
                      </span>
                    </div>
                    <p className="text-white/70 text-xs mt-2 leading-relaxed">{set.description}</p>
                    {masteryPct > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] text-white/60 mb-1">
                          <span>Mastery</span>
                          <span className="font-bold text-white/90">{masteryPct}%</span>
                        </div>
                        <div className="w-full bg-white/20 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full transition-all duration-500"
                            style={{
                              width: `${masteryPct}%`,
                              background: masteryPct >= 80 ? '#4ade80' : masteryPct >= 50 ? '#fbbf24' : '#f87171',
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {needPractice > 0 && (
                      <p className="text-amber-300 text-[11px] font-medium mt-2">
                        🧠 {needPractice} card{needPractice !== 1 ? 's' : ''} need practice
                      </p>
                    )}
                  </div>
                  <div className="flex border-t border-white/10">
                    <button
                      type="button"
                      className="flex-1 py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition min-h-[44px]"
                      onClick={() => startSession(set.id)}
                    >
                      Study
                    </button>
                    <div className="w-px bg-white/10" />
                    <button
                      type="button"
                      className="flex-1 py-2.5 text-xs font-semibold text-amber-300 hover:bg-white/10 transition min-h-[44px]"
                      onClick={() => startSession(set.id, true)}
                    >
                      Focus Mode
                    </button>
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

  if (setId && allCaughtUp && sessionDeck.length === 0) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <div className="content-area text-center py-12 space-y-3">
            <span className="text-5xl" aria-hidden="true">🎉</span>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">You&apos;re all caught up!</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No cards due for review right now. Come back later for spaced review.
            </p>
            <button
              type="button"
              onClick={async () => {
                setDeckLoading(true)
                try {
                  const result = await buildDeck(setId, flashcardData.database[setId] || [], focusMode, quarantinedCardIds, false)
                  const deck = Array.isArray(result) ? result : (result?.deck || [])
                  setAllCaughtUp(false)
                  setSessionDeck(deck)
                } finally {
                  setDeckLoading(false)
                }
              }}
              className="mt-4 px-6 py-2 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
            >
              Study all cards anyway
            </button>
            <div className="pt-4">
              <button type="button" className="btn btn-secondary btn-small" onClick={exitSession}>
                ← Back to sets
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (setId && !deckLoading && sessionDeck.length === 0) {
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

  if (setId && deckLoading) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <div className="content-area p-4">
            <LoadingSkeleton lines={5} />
          </div>
        </div>
      </>
    )
  }

  if (completed) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 py-6">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <div className="content-area text-center py-16">
            <div className="text-6xl mb-4" aria-hidden="true">🎉</div>
            <h2 className="text-2xl font-bold text-gray-800">Session Complete!</h2>
            <p className="mt-2 text-gray-500">
              You reviewed {displayDeck.length} card{displayDeck.length !== 1 ? 's' : ''}.
            </p>
            {struggleCount > 0 && (
              <p className="mt-2 text-amber-600 font-medium">
                🧠 {struggleCount} card{struggleCount !== 1 ? 's' : ''} marked for extra practice
              </p>
            )}
            <div className="flex justify-center gap-3 mt-8 flex-wrap">
              <button type="button" className="btn min-h-[44px] active:scale-95 transition-transform" onClick={exitSession}>
                Back to Sets
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-[44px] active:scale-95 transition-transform"
                onClick={() => startSession(setId, true)}
              >
                Focus Mode (practice cards)
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (!currentEntry) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl px-4 py-6 text-center">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <StudyNav />
          <div className="content-area p-4">
            <LoadingSkeleton lines={5} />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="container mx-auto max-w-2xl px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <button type="button" className="btn btn-secondary btn-small min-h-[44px]" onClick={exitSession}>
            ← Exit
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all min-h-[36px] ${
                studyMode === 'flashcards'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setStudyMode('flashcards')}
            >
              📇 Cards
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all min-h-[36px] ${
                studyMode === 'manager'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setStudyMode('manager')}
            >
              👔 Quiz Me
            </button>
            {studyMode === 'flashcards' && (
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all min-h-[36px] ${
                  isJeopardyMode
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                onClick={() => setIsJeopardyMode((v) => !v)}
              >
                {isJeopardyMode ? '🔄 Jeopardy ✓' : '🔄 Jeopardy'}
              </button>
            )}
          </div>
        </div>
        <div className="text-center mb-3">
          <h2 className="text-base font-bold text-white">
            {studyMode === 'manager' ? '👔 Quiz Me Like a Manager' : (setMeta?.title || setId)}
          </h2>
          <div className="flex items-center justify-center gap-3 mt-1">
            {studyMode === 'flashcards' && (
            <span className="text-xs text-white">
              Card {sessionState.index + 1} of {displayDeck.length}
            </span>
            )}
            {studyMode === 'flashcards' && struggleCount > 0 && (
              <span className="text-xs text-amber-300 font-medium">
                🧠 {struggleCount} need practice
              </span>
            )}
          </div>
        </div>
        {studyMode === 'flashcards' && (
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${displayDeck.length ? ((sessionState.index + 1) / displayDeck.length) * 100 : 0}%` }}
          />
        </div>
        )}
        {studyMode === 'flashcards' && currentEntry?.leitnerBox != null && (
          <div className="flex items-center justify-center gap-1 text-xs text-gray-400 dark:text-gray-500 mb-2">
            {[1, 2, 3, 4, 5].map((box) => (
              <div
                key={box}
                className={`w-2 h-2 rounded-full ${box <= (currentEntry.leitnerBox || 1) ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'}`}
              />
            ))}
          </div>
        )}

        {studyMode === 'manager' ? (
          <div className="space-y-4">
            {managerScore.total > 0 && (
              <div className="flex items-center justify-center gap-4 text-sm">
                <span className="font-bold text-gray-700">
                  Score: {managerScore.correct}/{managerScore.total}
                </span>
                <span
                  className={`font-bold ${
                    managerScore.correct / managerScore.total >= 0.8
                      ? 'text-green-600'
                      : managerScore.correct / managerScore.total >= 0.5
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}
                >
                  ({Math.round((managerScore.correct / managerScore.total) * 100)}%)
                </span>
              </div>
            )}

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">👔</span>
                <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Manager asks…</span>
              </div>

              {managerQuestion ? (
                <p className="text-lg font-semibold text-gray-900 leading-relaxed">
                  &quot;{managerQuestion.question}&quot;
                </p>
              ) : (
                <p className="text-gray-500 italic">Press &quot;Next Question&quot; to start</p>
              )}
            </div>

            {managerQuestion && !showManagerFeedback && (
              <form onSubmit={(e) => { e.preventDefault(); submitManagerAnswer() }} className="space-y-2">
                <input
                  type="text"
                  value={managerAnswer}
                  onChange={(e) => setManagerAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-400 focus:outline-none text-gray-800"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!managerAnswer.trim()}
                  className="w-full py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-all min-h-[44px]"
                >
                  Submit Answer
                </button>
              </form>
            )}

            {showManagerFeedback && managerFeedback && managerQuestion && (
              <div
                className={`rounded-2xl p-5 border-2 ${
                  managerFeedback.score === '✅' ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                }`}
              >
                <div className="text-3xl text-center mb-2">{managerFeedback.score}</div>
                <p className="text-sm text-gray-800 text-center font-medium">{managerFeedback.feedback}</p>

                {managerAnswer && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Your answer:</p>
                    <p className="text-sm text-gray-600 italic">{managerAnswer}</p>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Correct answer:</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{managerQuestion.fullAnswer || managerQuestion.correctAnswer}</p>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={showNextManagerQuestion}
                    disabled={managerLoading}
                    className="flex-1 py-2.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-all min-h-[44px]"
                  >
                    Next Question
                  </button>
                  <button
                    type="button"
                    onClick={handleManagerFlag}
                    disabled={managerFlagging}
                    className="py-2.5 px-4 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-100 text-sm min-h-[44px]"
                  >
                    Flag this question
                  </button>
                </div>
              </div>
            )}

            {!managerQuestion && (
              <button
                type="button"
                onClick={startManagerQuiz}
                disabled={managerLoading}
                className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-all"
              >
                {managerLoading ? '⏳ Loading…' : '🎯 Start Quiz'}
              </button>
            )}
          </div>
        ) : (
        <>
        <div style={{ overscrollBehavior: 'none', touchAction: 'pan-x' }}>
          <div
            className="flashcard-touch-area"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <Flashcard
              card={currentEntry?.card}
              isFlipped={sessionState.flipped}
              onFlip={handleFlip}
              jeopardy={isJeopardyMode}
            />
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              className="flex-1 py-4 rounded-2xl text-base font-bold bg-amber-500 text-white active:bg-amber-600 active:scale-[0.98] transition-all touch-manipulation"
              style={{ minHeight: '52px' }}
              onClick={() => handleFeedback('needsPractice')}
            >
              ✕ Need practice
            </button>
            <button
              type="button"
              className="flex-1 py-4 rounded-2xl text-base font-bold bg-green-600 text-white active:bg-green-700 active:scale-[0.98] transition-all touch-manipulation"
              style={{ minHeight: '52px' }}
              onClick={() => handleFeedback('gotIt')}
            >
              ✓ Got it
            </button>
          </div>
          {!swipeHintDismissed && sessionState.index === 0 && (
            <div className="text-center text-xs text-gray-400 mt-2 animate-pulse">
              👈 Swipe left for &quot;Need practice&quot; · Swipe right for &quot;Got it&quot; 👉
              <button
                type="button"
                className="block mx-auto mt-1 text-[10px] text-gray-300 underline touch-manipulation"
                onClick={() => {
                  try {
                    localStorage.setItem('flashcardSwipeHintSeen', 'true')
                  } catch (_) {}
                  setSwipeHintDismissed(true)
                }}
              >
                Got it, don&apos;t show again
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex justify-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-[11px] rounded-lg text-green-600 hover:bg-green-50 transition min-h-[44px]"
              onClick={() => showToast('✅ Marked as accurate')}
            >
              ✅ Accurate
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-[11px] rounded-lg text-red-500 hover:bg-red-50 transition min-h-[44px]"
              disabled={reportingInaccurate}
              onClick={() => setReportErrorModal(true)}
            >
              ❌ Report Error
            </button>
          </div>
        </div>
        {reportErrorModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => !reportingInaccurate && setReportErrorModal(false)}>
            <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl max-h-[90vh] overflow-auto p-6 pb-safe" onClick={(e) => e.stopPropagation()}>
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
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-gray-900 px-5 py-3 text-sm text-white shadow-2xl animate-[fadeIn_0.3s_ease-out]">
            {toast}
          </div>
        )}
        </>
        )}
      </div>
    </>
  )
}
