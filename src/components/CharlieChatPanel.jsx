/**
 * CharlieChatPanel — Glass morphism chat UI for Charlie AI assistant.
 * Handles message rendering, quiz rendering, image display, flagging, tool status.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getActiveFlashcards, getAllFlashcardSets, isQuizApproved } from '../services/flashcardService'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { submitChatbotFlag } from '../services/chatbotFlagsService'
import { reportQuizQuestionInaccuracy } from '../services/flashcardFlags'
import { logFeatureUsage } from '../services/errorLogger'
import { useTheme } from '../contexts/ThemeContext'

const QUIZ_SIZE = 5
const QUIZ_TRIGGER = /^(quiz\s*me|test\s*me|practice|quiz|test)(\s+on\s+(.+))?$/i
const IMAGE_PATTERNS = [
  /^show\s+me\s+(?:a\s+|the\s+)?(?:picture|photo|image)\s+(?:of\s+)?(?:a\s+|the\s+|an\s+)?(.+?)[?!.\s]*$/i,
  /^what\s+does\s+(?:the\s+|a\s+|an\s+)?(.+?)\s+look\s*like[?!.\s]*$/i,
  /^(?:picture|photo|image)\s+of\s+(?:the\s+|a\s+|an\s+)?(.+?)[?!.\s]*$/i,
  /^(?:can\s+i|let\s+me)\s+see\s+(?:the\s+|a\s+|an\s+)?(.+?)[?!.\s]*$/i,
  /^show\s+me\s+(?:the\s+|a\s+|an\s+)?(.+?)[?!.\s]*$/i,
]

const PRIMARY = '#4a7c59'

// SVG Icons
function SendIcon({ size = 18, color = 'white' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function FlagIcon({ size = 12, filled = false, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function scoreMatch(candidateName, searchName) {
  const a = candidateName.toLowerCase().trim()
  const b = searchName.toLowerCase().trim()
  if (!a || !b) return 0
  if (a === b) return 10
  if (a.includes(b)) return 7
  if (b.includes(a) && a.length >= 4) return 4
  const stopWords = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'or', 'in', 'on'])
  const aWords = a.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 1 && !stopWords.has(w))
  const bWords = b.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 1 && !stopWords.has(w))
  let wordHits = 0
  for (const bw of bWords) {
    for (const aw of aWords) {
      if (aw === bw) { wordHits += 3; break }
      if (aw.includes(bw) || bw.includes(aw)) { wordHits += 2; break }
    }
  }
  if (bWords.length > 0 && wordHits > 0) return Math.min(6, 1 + wordHits)
  return 0
}

function matchTopicToSet(topic, sets) {
  if (!topic?.trim() || !sets?.length) return null
  const t = topic.trim().toLowerCase()
  const words = t.split(/\s+/).filter((w) => w.length > 1)
  const variants = words.flatMap((w) => {
    const out = [w]
    if (w.endsWith('s') && w.length > 3) out.push(w.slice(0, -1))
    if (w.endsWith('es') && w.length > 4) out.push(w.slice(0, -2))
    if (!w.endsWith('s')) out.push(w + 's')
    return out
  })
  let bestMatch = null
  let bestScore = 0
  for (const s of sets) {
    const title = (s.title || s.name || s.id || '').toLowerCase()
    const titleWords = title.split(/[\s\-_&]+/).filter(w => w.length > 1)
    let score = 0
    if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title)) score += 10
    for (const v of variants) {
      if (titleWords.some(tw => tw === v)) score += 3
    }
    for (const w of words) {
      if (w.length >= 4 && titleWords.some((tw) => tw.startsWith(w) || (w.startsWith(tw) && tw.length >= 4))) score += 2
    }
    if (score > bestScore) { bestScore = score; bestMatch = s }
  }
  return bestScore >= 2 ? bestMatch : null
}

/**
 * Cross-set content search — finds quiz-eligible cards matching a topic keyword
 * across ALL flashcard sets by searching card fronts and backs.
 */
function buildContentQuiz(topic, allCards) {
  if (!topic?.trim() || !allCards?.length) return []
  const t = topic.trim().toLowerCase()
  const words = t.split(/\s+/).filter(w => w.length > 1)
  // Build singular/plural variants
  const variants = words.flatMap(w => {
    const out = [w]
    if (w.endsWith('s') && w.length > 3) out.push(w.slice(0, -1))
    if (w.endsWith('es') && w.length > 4) out.push(w.slice(0, -2))
    if (!w.endsWith('s')) out.push(w + 's')
    return out
  })

  const scored = []
  for (const card of allCards) {
    if (!card.quizData?.q || !Array.isArray(card.quizData.opts) || typeof card.quizData.ans !== 'number') continue
    if (!isQuizApproved(card)) continue

    const front = (card.front || '').toLowerCase()
    const back = (card.back || '').toLowerCase()
    let score = 0

    // Exact phrase matches
    if (front.includes(t)) score += 10
    if (back.includes(t)) score += 5

    // Word variant matches
    for (const v of variants) {
      if (front.includes(v)) score += 3
      if (back.includes(v)) score += 2
    }

    if (score > 0) {
      scored.push({
        ...card.quizData,
        testId: card.setId || 'flashcard',
        source: 'flashcard',
        cardId: card.id,
        _score: score,
      })
    }
  }

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, 10)
    .map(({ _score, ...rest }) => rest)
}

export default function CharlieChatPanel({
  messages,
  setMessages,
  loading,
  toolStatus,
  onSendMessage,
  currentUser,
}) {
  const [input, setInput] = useState('')
  const [quizState, setQuizState] = useState(null)
  const [flashcardSets, setFlashcardSets] = useState([])
  const [allFlashcardCards, setAllFlashcardCards] = useState([])
  const [menuStudioItems, setMenuStudioItems] = useState([])
  const [flaggingMsgIdx, setFlaggingMsgIdx] = useState(null)
  const [flaggedMsgIds, setFlaggedMsgIds] = useState(new Set())
  const lastActionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const { isDark } = useTheme()

  // Glass style helpers
  const glassBubble = isDark
    ? { background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.08)' }
    : { background: 'rgba(255,255,255,0.72)', border: '0.5px solid rgba(0,0,0,0.06)' }
  const glassInput = isDark
    ? { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }
    : { background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.06)' }

  // Load flashcard data for image lookup and quiz
  useEffect(() => {
    if (!currentUser) return
    async function load() {
      try {
        const [sets, cards] = await Promise.all([getAllFlashcardSets(), getActiveFlashcards()])
        setFlashcardSets(sets.filter((s) => s.id))
        setAllFlashcardCards(cards)
        try {
          const msSnap = await getDocs(collection(db, 'menuStudio'))
          setMenuStudioItems(
            msSnap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((i) => i.imageUrl && typeof i.imageUrl === 'string' && i.imageUrl.startsWith('http') && !i.inGraveyard)
          )
        } catch (_) {}
      } catch (e) {
        console.warn('CharlieChatPanel: error loading flashcards', e?.message)
      }
    }
    load()
  }, [currentUser])

  // Reset quiz state when conversation is cleared (messages reset to just greeting)
  useEffect(() => {
    if (messages.length <= 1) setQuizState(null)
  }, [messages.length])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, toolStatus])

  // --- Image lookup ---
  const tryImageLookup = useCallback((userMessage) => {
    const normalized = userMessage.replace(/\s+/g, ' ').trim()
    let imageItemName = null
    for (const pat of IMAGE_PATTERNS) {
      const m = normalized.match(pat)
      if (m && m[1]) { imageItemName = m[1].trim().toLowerCase(); break }
    }
    if (!imageItemName && lastActionRef.current === 'image') {
      const followUp = normalized.match(
        /^(?:how\s+about|what\s+about|and\s+(?:the\s+|a\s+|an\s+)?|now\s+(?:the\s+|a\s+|an\s+)?|or\s+(?:the\s+|a\s+|an\s+)?|(?:the|a|an)\s+)(.+?)[?!.\s]*$/i
      )
      if (followUp && followUp[1]) imageItemName = followUp[1].trim().toLowerCase()
    }
    if (!imageItemName || allFlashcardCards.length === 0) return false

    let bestCard = null, bestScore = 0
    for (const c of allFlashcardCards) {
      const score = scoreMatch(c.front || '', imageItemName)
      if (score > bestScore) { bestScore = score; bestCard = c }
    }
    const findMsImage = (name) => {
      let best = null, bestMs = 0
      for (const item of menuStudioItems) {
        const s = scoreMatch(item.name || '', name)
        if (s > bestMs) { bestMs = s; best = item }
      }
      return best
    }

    if (bestCard) {
      let imgUrl = bestCard.imageUrl
      let imgSource = 'flashcard'
      if (!imgUrl || typeof imgUrl !== 'string' || !imgUrl.startsWith('http')) {
        const ms = findMsImage(imageItemName)
        if (ms) { imgUrl = ms.imageUrl; imgSource = 'menuStudio' }
      }
      if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
        setMessages((prev) => [...prev,
          { role: 'user', text: userMessage },
          { role: 'bot', text: `Here's ${bestCard.front}:`, imageUrl: imgUrl },
        ])
        lastActionRef.current = 'image'
        logFeatureUsage('chatbot-image', { item: bestCard.front, source: imgSource })
        return true
      }
      setMessages((prev) => [...prev,
        { role: 'user', text: userMessage },
        { role: 'bot', text: `I found "${bestCard.front}" but there's no picture yet. Here's what I know:\n\n${bestCard.back || 'No description available.'}` },
      ])
      lastActionRef.current = 'image'
      return true
    }
    const msMatch = findMsImage(imageItemName)
    if (msMatch) {
      setMessages((prev) => [...prev,
        { role: 'user', text: userMessage },
        { role: 'bot', text: `Here's ${msMatch.name}:`, imageUrl: msMatch.imageUrl },
      ])
      lastActionRef.current = 'image'
      logFeatureUsage('chatbot-image', { item: msMatch.name, source: 'menuStudio' })
      return true
    }
    setMessages((prev) => [...prev,
      { role: 'user', text: userMessage },
      { role: 'bot', text: `I couldn't find a picture of "${imageItemName}". Try the exact menu item name \u2014 or ask me about it!` },
    ])
    lastActionRef.current = 'image'
    return true
  }, [allFlashcardCards, menuStudioItems, setMessages])

  // --- Quiz (multiple choice from flashcard quizData) ---
  function buildPracticeQuizMessage(question, questionIndex) {
    const options = question.opts.map((text, i) => ({ text, correct: i === question.ans }))
    return {
      role: 'bot',
      quizQuestion: {
        question: question.q,
        options: shuffle(options),
        explanation: question.exp || '',
        questionIndex,
        cardId: question.cardId || '',
      },
    }
  }

  const startQuiz = useCallback(async (selectedSetId = null, preBuiltPool = null) => {
    let pool = []

    if (preBuiltPool && preBuiltPool.length > 0) {
      // Use pre-built pool from content search
      pool = preBuiltPool
    } else {
      try {
        let fcCards = await getActiveFlashcards()
        if (selectedSetId) fcCards = fcCards.filter(c => (c.setId || 'default') === selectedSetId)
        for (const card of fcCards) {
          if (card.quizData?.q && Array.isArray(card.quizData.opts) && typeof card.quizData.ans === 'number' && isQuizApproved(card)) {
            pool.push({ ...card.quizData, testId: card.setId || 'flashcard', source: 'flashcard', cardId: card.id })
          }
        }
      } catch (_) {}
    }

    if (pool.length < 2) {
      setMessages(prev => [...prev, { role: 'bot', text: selectedSetId
        ? "Not enough practice questions for that topic yet \u2014 try another one!"
        : "No practice questions available yet." }])
      return
    }

    // Weakness-weighted selection: prioritize cards the user struggles with
    let questions
    const userId = currentUser?.traineeId || currentUser?.id
    if (pool.length > QUIZ_SIZE && userId) {
      try {
        const { getAllProgressForUser } = await import('../services/flashcardIntelligenceService')
        const progressRecords = await getAllProgressForUser(userId)
        const progressMap = {}
        progressRecords.forEach(r => { progressMap[r.cardId] = r })

        // Split into struggling (high needsPracticeCount) vs rest
        const struggling = []
        const rest = []
        for (const item of pool) {
          const p = progressMap[item.cardId]
          if (p && (p.needsPracticeCount || 0) > 0) {
            struggling.push({ ...item, _weight: p.needsPracticeCount })
          } else {
            rest.push(item)
          }
        }

        // Target ~60% struggling, ~40% random
        const struggleTarget = Math.min(struggling.length, Math.ceil(QUIZ_SIZE * 0.6))
        const restTarget = QUIZ_SIZE - struggleTarget

        const picked = [
          ...shuffle(struggling.sort((a, b) => b._weight - a._weight).slice(0, Math.max(struggleTarget * 2, struggling.length))).slice(0, struggleTarget),
          ...shuffle(rest).slice(0, restTarget),
        ].map(({ _weight, ...item }) => item)

        questions = shuffle(picked).slice(0, QUIZ_SIZE)
      } catch {
        // Fallback to pure random
        questions = shuffle(pool).slice(0, QUIZ_SIZE)
      }
    } else {
      questions = shuffle(pool).slice(0, QUIZ_SIZE)
    }

    setMessages(prev => [...prev,
      { role: 'bot', text: `Sure! ${questions.length} quick questions \u2014 tap your answer.` },
      buildPracticeQuizMessage(questions[0], 0),
    ])
    setQuizState({ questions, index: 0, score: 0, wrongIds: [] })
  }, [setMessages, currentUser])

  const onQuizAnswer = useCallback((msgIndex, optionIndex) => {
    const msg = messages[msgIndex]
    if (!msg?.quizQuestion || !quizState) return
    const { options, explanation, questionIndex } = msg.quizQuestion
    const chosen = options[optionIndex]
    const correct = chosen?.correct === true
    const correctOption = options.find(o => o.correct)
    const expText = explanation || (correctOption ? correctOption.text : '')
    const wrongIds = correct ? quizState.wrongIds : [...quizState.wrongIds, questionIndex]
    const score = quizState.score + (correct ? 1 : 0)
    const nextIndex = quizState.index + 1

    setMessages(prev => [...prev,
      { role: 'bot', quizFeedback: { correct, explanation: expText, feedbackText: correct ? "That's exactly right!" : "Almost \u2014 here's the right answer." } },
    ])

    if (nextIndex >= quizState.questions.length) {
      const total = quizState.questions.length
      let resultsText = `You got ${score}/${total}! `
      if (score === total) resultsText += 'Perfect round!'
      else resultsText += 'Nice work \u2014 keep practicing the ones you missed!'
      setMessages(prev => [...prev, { role: 'bot', quizResults: { score, total, message: resultsText } }])
      logFeatureUsage('quiz', { score, total })
      setQuizState(null)
      return
    }
    const nextQ = quizState.questions[nextIndex]
    setMessages(prev => [...prev, buildPracticeQuizMessage(nextQ, nextIndex)])
    setQuizState({ ...quizState, index: nextIndex, score, wrongIds })
  }, [messages, quizState, setMessages])

  // --- Send handler ---
  async function handleSend() {
    if (!input.trim() || loading) return
    const userMessage = input.trim()
    setInput('')

    if (tryImageLookup(userMessage)) return

    const normalized = userMessage.replace(/\s+/g, ' ').trim()
    const quizMatch = normalized.match(QUIZ_TRIGGER)
    if (quizMatch) {
      lastActionRef.current = 'quiz'
      setMessages(prev => [...prev, { role: 'user', text: userMessage }])
      const topic = quizMatch[3]?.trim() || null
      if (topic) {
        // 1. Try exact set match (fast path)
        const matchedSet = matchTopicToSet(topic, flashcardSets)
        if (matchedSet) {
          await startQuiz(matchedSet.id)
          return
        }
        // 2. Try cross-set content search
        const contentPool = buildContentQuiz(topic, allFlashcardCards)
        if (contentPool.length >= 2) {
          await startQuiz(null, contentPool)
          return
        }
        // 3. Fallback: topic picker
        setMessages(prev => [...prev, { role: 'bot', topicPicker: { sets: flashcardSets, noMatchTopic: topic } }])
        return
      }
      setMessages(prev => [...prev, { role: 'bot', topicPicker: { sets: flashcardSets } }])
      return
    }

    lastActionRef.current = 'chat'
    onSendMessage(userMessage)
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function submitFlag(msgIdx, messageText, reason) {
    if (!currentUser) return
    try {
      await submitChatbotFlag({
        traineeId: currentUser.traineeId || currentUser.id,
        traineeUid: currentUser.uid || currentUser.id,
        traineeName: currentUser.name || currentUser.displayName,
        orgId: currentUser.orgId || 'org_charlestons',
        messageText: messageText || '',
        flagReason: reason || 'Other',
        flagDetails: '',
      })
      setFlaggedMsgIds(prev => new Set([...prev, msgIdx]))
      setFlaggingMsgIdx(null)
    } catch (err) {
      console.error('submitFlag error:', err)
    }
  }

  // Quiz questions had no flag path at all before this — routed through the same
  // reportQuizQuestionInaccuracy the main Quizzes page uses (it quarantines the
  // underlying flashcard, unlike submitChatbotFlag's general chat-quality report,
  // and shows up in the trainee's "questions you've flagged" dashboard panel).
  async function submitQuizFlag(msgIdx, quizQuestion, reason) {
    if (!currentUser) return
    try {
      const correctOption = quizQuestion.options.find((o) => o.correct)
      await reportQuizQuestionInaccuracy({
        cardId: quizQuestion.cardId || '',
        quizQuestion: quizQuestion.question || '',
        quizOptions: quizQuestion.options.map((o) => o.text),
        quizCorrectAnswer: correctOption?.text || '',
        reason: reason || 'Flagged as inaccurate',
        reportedBy: currentUser.name || currentUser.traineeId || currentUser.id || '',
      })
      setFlaggedMsgIds(prev => new Set([...prev, msgIdx]))
      setFlaggingMsgIdx(null)
    } catch (err) {
      console.error('submitQuizFlag error:', err)
    }
  }

  // --- Render ---
  return (
    <>
      {/* Messages area — transparent so parent glass shows through */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, idx) => {
          // User message
          if (msg.role === 'user') {
            return (
              <div key={idx} className="flex justify-end">
                <div className="max-w-[80%] p-3 rounded-2xl rounded-br-sm text-white" style={{ background: PRIMARY }}>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            )
          }

          // Quiz question
          if (msg.quizQuestion) {
            const q = msg.quizQuestion
            return (
              <div key={idx} className="flex justify-start">
                <div className="relative max-w-[90%]">
                  <div className="p-3 rounded-2xl rounded-bl-sm text-gray-800 dark:text-gray-200" style={glassBubble}>
                    <p className="text-sm font-medium mb-2">{q.question}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Question {q.questionIndex + 1} of {QUIZ_SIZE}</p>
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => {
                        const answered = messages[idx + 1]?.quizFeedback != null
                        return (
                          <button key={oi} type="button" disabled={answered}
                            className="w-full text-left px-3 py-2 rounded-xl text-sm transition-all disabled:opacity-70 disabled:cursor-default"
                            style={{
                              border: `1.5px solid ${PRIMARY}20`,
                              background: 'transparent',
                            }}
                            onMouseEnter={(e) => { if (!answered) { e.currentTarget.style.borderColor = `${PRIMARY}60`; e.currentTarget.style.background = `${PRIMARY}08` } }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${PRIMARY}20`; e.currentTarget.style.background = 'transparent' }}
                            onClick={() => !answered && onQuizAnswer(idx, oi)}>
                            {opt.text}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {/* Flag button — quiz questions had no way to report a bad one before this */}
                  <div className="absolute -bottom-1 right-1">
                    <button type="button"
                      onClick={() => setFlaggingMsgIdx(flaggingMsgIdx === idx ? null : idx)}
                      className={`p-1 rounded transition-colors ${flaggedMsgIds.has(idx) ? 'text-red-500' : 'text-gray-400 hover:text-gray-500 dark:hover:text-gray-300'}`}
                      title="Flag this question">
                      <FlagIcon size={12} filled={flaggedMsgIds.has(idx)} color={flaggedMsgIds.has(idx) ? '#ef4444' : 'currentColor'} />
                    </button>
                    {flaggingMsgIdx === idx && (
                      <div
                        className="absolute right-0 bottom-6 z-20 w-48 rounded-xl p-2 text-left"
                        style={{
                          background: isDark ? 'rgba(31,41,55,0.92)' : 'rgba(255,255,255,0.95)',
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                          border: isDark ? '0.5px solid rgba(255,255,255,0.1)' : '0.5px solid rgba(0,0,0,0.08)',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                        }}
                      >
                        <p className="text-xs font-medium mb-2 text-gray-700 dark:text-gray-300">What&apos;s wrong?</p>
                        {['Wrong information', 'Confusing', 'Outdated', 'Other'].map((r) => (
                          <button key={r} type="button"
                            className="block w-full text-left px-2 py-1.5 text-xs rounded-lg text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            onClick={() => submitQuizFlag(idx, q, r)}>
                            {r}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          // Topic picker
          if (msg.topicPicker) {
            const { sets, noMatchTopic } = msg.topicPicker
            const pickerSets = Array.isArray(sets) ? sets : flashcardSets
            return (
              <div key={idx} className="flex justify-start">
                <div className="max-w-[90%] p-3 rounded-2xl rounded-bl-sm text-gray-800 dark:text-gray-200" style={glassBubble}>
                  <p className="text-sm font-medium mb-2">
                    {noMatchTopic ? `No set matching "${noMatchTopic}" \u2014 pick one:` : 'What do you want to quiz on?'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => startQuiz(null)} disabled={loading}
                      className="px-3 py-1.5 rounded-full text-sm font-medium transition-all disabled:opacity-70"
                      style={{ background: `${PRIMARY}12`, color: PRIMARY, border: `1px solid ${PRIMARY}20` }}>
                      All Topics
                    </button>
                    {pickerSets.map((s) => (
                      <button key={s.id} type="button" onClick={() => startQuiz(s.id)} disabled={loading}
                        className="px-3 py-1.5 rounded-full text-sm font-medium transition-all disabled:opacity-70"
                        style={{ background: `${PRIMARY}12`, color: PRIMARY, border: `1px solid ${PRIMARY}20` }}>
                        {s.title || s.name || s.id}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          }

          // Quiz feedback
          if (msg.quizFeedback) {
            const f = msg.quizFeedback
            const feedbackBg = f.correct
              ? (isDark ? 'rgba(74,124,89,0.15)' : 'rgba(74,124,89,0.08)')
              : (isDark ? 'rgba(217,119,6,0.15)' : 'rgba(217,119,6,0.08)')
            const feedbackBorder = f.correct
              ? `0.5px solid ${isDark ? 'rgba(74,124,89,0.25)' : 'rgba(74,124,89,0.15)'}`
              : `0.5px solid ${isDark ? 'rgba(217,119,6,0.25)' : 'rgba(217,119,6,0.15)'}`
            return (
              <div key={idx} className="flex justify-start">
                <div className="max-w-[85%] p-3 rounded-2xl rounded-bl-sm" style={{ background: feedbackBg, border: feedbackBorder }}>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{f.feedbackText}</p>
                  {!f.correct && f.explanation && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{f.explanation}</p>}
                </div>
              </div>
            )
          }

          // Quiz results
          if (msg.quizResults) {
            const r = msg.quizResults
            return (
              <div key={idx} className="flex justify-start">
                <div className="max-w-[85%] p-3 rounded-2xl rounded-bl-sm text-gray-800 dark:text-gray-200" style={glassBubble}>
                  <p className="text-sm font-medium">{r.message}</p>
                </div>
              </div>
            )
          }

          // Regular bot message
          return (
            <div key={idx} className="flex justify-start">
              <div className="relative max-w-[80%]">
                <div className="p-3 rounded-2xl rounded-bl-sm text-gray-800 dark:text-gray-200" style={glassBubble}>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} alt="" className="mt-2 rounded-xl max-w-full max-h-48 object-contain" loading="lazy" />
                  )}
                </div>
                {/* Flag button */}
                <div className="absolute -bottom-1 right-1">
                  <button type="button"
                    onClick={() => setFlaggingMsgIdx(flaggingMsgIdx === idx ? null : idx)}
                    className={`p-1 rounded transition-colors ${flaggedMsgIds.has(idx) ? 'text-red-500' : 'text-gray-400 hover:text-gray-500 dark:hover:text-gray-300'}`}
                    title="Flag this response">
                    <FlagIcon size={12} filled={flaggedMsgIds.has(idx)} color={flaggedMsgIds.has(idx) ? '#ef4444' : 'currentColor'} />
                  </button>
                  {flaggingMsgIdx === idx && (
                    <div
                      className="absolute right-0 bottom-6 z-20 w-48 rounded-xl p-2 text-left"
                      style={{
                        background: isDark ? 'rgba(31,41,55,0.92)' : 'rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: isDark ? '0.5px solid rgba(255,255,255,0.1)' : '0.5px solid rgba(0,0,0,0.08)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                      }}
                    >
                      <p className="text-xs font-medium mb-2 text-gray-700 dark:text-gray-300">What&apos;s wrong?</p>
                      {['Wrong information', 'Confusing', 'Outdated', 'Other'].map((r) => (
                        <button key={r} type="button"
                          className="block w-full text-left px-2 py-1.5 text-xs rounded-lg text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          onClick={() => submitFlag(idx, msg.text, r)}>
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Tool status — glass pill with pulse dot */}
        {toolStatus && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full" style={glassBubble}>
              <div className="relative w-2 h-2">
                <div className="absolute inset-0 rounded-full animate-ping" style={{ background: PRIMARY, opacity: 0.4 }} />
                <div className="absolute inset-0 rounded-full" style={{ background: PRIMARY }} />
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">{toolStatus}</p>
            </div>
          </div>
        )}

        {/* Typing dots — glass bubble */}
        {loading && !toolStatus && (
          <div className="flex justify-start">
            <div className="p-3 rounded-2xl rounded-bl-sm" style={glassBubble}>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: `${PRIMARY}60` }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: `${PRIMARY}60`, animationDelay: '0.1s' }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: `${PRIMARY}60`, animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3" style={{ borderTop: isDark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(0,0,0,0.06)' }}>
        <div className="flex gap-2 items-end">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask Charlie..."
            className="flex-1 px-4 py-2.5 rounded-xl text-sm text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 transition-shadow"
            style={{
              ...glassInput,
              focusRingColor: `${PRIMARY}40`,
            }}
            onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${PRIMARY}30` }}
            onBlur={(e) => { e.currentTarget.style.boxShadow = 'none' }}
            disabled={loading}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 shrink-0"
            style={{ background: PRIMARY }}
          >
            <SendIcon size={16} />
          </button>
        </div>
      </div>
    </>
  )
}
