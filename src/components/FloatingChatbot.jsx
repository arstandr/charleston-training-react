import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getAllFlashcardSets, getActiveFlashcards, isQuizApproved } from '../services/flashcardService'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { logClientError, logFeatureUsage } from '../services/errorLogger'
import { submitChatbotFlag } from '../services/chatbotFlagsService'
import { reportQuizQuestionInaccuracy } from '../services/flashcardFlags'
import { buildGeminiProxyRequest } from '../services/ai'

const FUNCTIONS_BASE = 'https://us-central1-chartrain-20901.cloudfunctions.net'
// Match "quiz me", "test me on steaks", "practice", "quiz", "test" with optional " on <topic>"
const QUIZ_TRIGGER = /^(quiz\s*me|test\s*me|practice|quiz|test)(\s+on\s+(.+))?$/i
// Match image requests — order matters: more specific patterns first
const IMAGE_PATTERNS = [
  // "show me a/the picture/photo/image of X" — must come before generic "show me X"
  /^show\s+me\s+(?:a\s+|the\s+)?(?:picture|photo|image)\s+(?:of\s+)?(?:a\s+|the\s+|an\s+)?(.+?)[?!.\s]*$/i,
  // "what does X look like"
  /^what\s+does\s+(?:the\s+|a\s+|an\s+)?(.+?)\s+look\s*like[?!.\s]*$/i,
  // "picture/photo/image of X"
  /^(?:picture|photo|image)\s+of\s+(?:the\s+|a\s+|an\s+)?(.+?)[?!.\s]*$/i,
  // "can I see X" / "let me see X"
  /^(?:can\s+i|let\s+me)\s+see\s+(?:the\s+|a\s+|an\s+)?(.+?)[?!.\s]*$/i,
  // "show me X" (generic — last so it doesn't swallow "show me a picture of")
  /^show\s+me\s+(?:the\s+|a\s+|an\s+)?(.+?)[?!.\s]*$/i,
]
const QUIZ_SIZE = 5

// Map flashcard set IDs to practice test IDs (mirrors QuizzesPage)
const SET_TO_TEST = {
  'bar-beer': 'bar_test',
  'wines-cocktails': 'wines_test',
  'starters-soups-salads': 'soups_test',
  'steaks-specialties': 'steaks_test',
  'bonus-points': 'bonus_test',
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getFirstName(user) {
  const name = (user?.name || user?.displayName || user?.email || '').trim()
  if (!name) return null
  const first = name.split(/\s+/)[0]
  return first || null
}

/** Returns the single best-matching set whose title contains the topic (case-insensitive).
 *  Uses scored matching: exact substring > word overlap > singular/plural variants. */
function matchTopicToSet(topic, sets) {
  if (!topic?.trim() || !sets?.length) return null
  const t = topic.trim().toLowerCase()
  const words = t.split(/\s+/).filter((w) => w.length > 1)
  // Generate singular/plural variants: "steaks" -> "steak", "cocktail" -> "cocktails"
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
    // Exact word-boundary match (topic appears as a whole word in title)
    if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title)) score += 10
    // Word overlap scoring — each variant must match a whole word in title
    for (const v of variants) {
      if (titleWords.some(tw => tw === v)) score += 3
    }
    // Partial word match — topic word starts a title word or vice versa (min 4 chars to avoid false positives)
    for (const w of words) {
      if (w.length >= 4 && titleWords.some((tw) => tw.startsWith(w) || (w.startsWith(tw) && tw.length >= 4))) score += 2
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = s
    }
  }
  return bestScore >= 2 ? bestMatch : null
}

export default function FloatingChatbot({ currentUser }) {
  const firstName = getFirstName(currentUser) || 'there'

  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'bot', text: `Hey ${firstName}! 👋 I'm Charlie — think of me like a senior trainer in your pocket. Ask me anything about the menu, the line, expo, or policies. Or type "quiz me" for a quick 5-question round!` }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [knowledgeBase, setKnowledgeBase] = useState(null)
  const [kbError, setKbError] = useState(false)
  const [flashcardKnowledge, setFlashcardKnowledge] = useState('') // built from flashcard front/back
  const [allFlashcardCards, setAllFlashcardCards] = useState([]) // full flashcard data for image lookup
  const [menuStudioItems, setMenuStudioItems] = useState([]) // menuStudio items with images (fallback)
  const [flashcardSets, setFlashcardSets] = useState([]) // { id, title, ... } from flashcardSets collection
  const [quizState, setQuizState] = useState(null) // { cards: [], index: 0, score: 0, wrongCards: [] }
  const [diagnosticMode, setDiagnosticMode] = useState(false)
  const [pendingResponse, setPendingResponse] = useState(null) // { text, contents } when diagnostic intercept
  const [flaggingMsgIdx, setFlaggingMsgIdx] = useState(null)
  const [flaggedMsgIds, setFlaggedMsgIds] = useState(new Set())
  const lastActionRef = useRef(null) // tracks last action type: 'image', 'quiz', etc.
  const messagesEndRef = useRef(null)

  const role = (currentUser?.role || '').toLowerCase()
  const canDiagnostic = role === 'trainer' || role === 'manager' || role === 'admin' || role === 'owner'

  // Build knowledge base from flashcards (front = item name, back = ingredients/description)
  useEffect(() => {
    if (!currentUser) return
    async function loadKnowledge() {
      try {
        // Load flashcard sets for quiz topic picker
        const sets = await getAllFlashcardSets()
        setFlashcardSets(sets.filter((s) => s.id))

        // Load all active flashcards and build knowledge base
        const cards = await getActiveFlashcards()
        setAllFlashcardCards(cards)
        const knowledge = cards
          .filter((c) => c.front && c.back)
          .map((c) => `${c.front}: ${c.back}`)
          .join('\n')
        if (knowledge) {
          setFlashcardKnowledge(knowledge)
          setKnowledgeBase({ fromFlashcards: true })
        } else {
          setKbError(true)
        }

        // Load menuStudio items with images as fallback for image lookup
        try {
          const msSnap = await getDocs(collection(db, 'menuStudio'))
          const msItems = msSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((i) => i.imageUrl && typeof i.imageUrl === 'string' && i.imageUrl.startsWith('http') && !i.inGraveyard)
          setMenuStudioItems(msItems)
        } catch (_) {}

        // Also try cloud function knowledge base as supplemental
        try {
          const response = await fetch(FUNCTIONS_BASE + '/getKnowledgeBase')
          const result = await response.json()
          if (result.success && result.data && result.data.length > 0) {
            const trainingDoc = result.data.find((d) => d.id === 'training') || result.data[0]
            setKnowledgeBase(trainingDoc)
          }
        } catch (_) {
          // Flashcard knowledge is the primary source; cloud function is optional
        }
      } catch (error) {
        console.warn('Error loading chatbot knowledge:', error)
        setKbError(true)
      }
    }
    loadKnowledge()
  }, [currentUser])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function buildContext(kb) {
    const parts = []
    // Flashcard-based menu knowledge (primary source: item name → ingredients)
    if (flashcardKnowledge) {
      parts.push('MENU ITEMS AND INGREDIENTS (from flashcards — each line is "Item: description/ingredients"):\n' + flashcardKnowledge)
    }
    // Supplemental cloud function knowledge base
    if (kb && !kb.fromFlashcards) {
      if (kb.fullKnowledgeBase) parts.push(kb.fullKnowledgeBase)
      if (kb.menu) parts.push('MENU:\n' + (typeof kb.menu === 'string' ? kb.menu : JSON.stringify(kb.menu)))
      if (kb.policies) parts.push('POLICIES:\n' + (typeof kb.policies === 'string' ? kb.policies : JSON.stringify(kb.policies)))
      if (kb.procedures) parts.push('PROCEDURES:\n' + (typeof kb.procedures === 'string' ? kb.procedures : JSON.stringify(kb.procedures)))
      if (kb.definitions) parts.push('DEFINITIONS:\n' + (typeof kb.definitions === 'string' ? kb.definitions : JSON.stringify(kb.definitions)))
    }
    if (parts.length > 0) return parts.join('\n\n')
    return 'No knowledge base loaded. Answer based on general restaurant knowledge.'
  }

  const buildCharlieSystemPrompt = useCallback((context) => {
    return `You are Charlie, a friendly and experienced senior trainer at Charleston's Restaurant. You're texting a new hire like a supportive colleague — casual, warm, and never condescending.

PERSONALITY:
- Use the trainee's first name when you know it (they are "${firstName}").
- Sound like real texts: 1–3 short sentences max. No long paragraphs.
- Use restaurant lingo naturally when it fits: "the line", "expo", "86'd", "on the fly", "behind you", "all day", "fire", "heard".
- Encourage them: "You're getting it!", "That's exactly right.", "Almost — think about it this way...", "Nice."
- Gentle corrections only; never talk down.
- Occasional emoji is fine but don't overdo it.

CONTEXT (menu, procedures, policies):\n${context}


CRITICAL SERVICE PRIORITIES (every server must know this):
1. HOT FOOD — Priority #1. Hot food dies fast. Run it immediately, no exceptions.
2. COLD DRINKS — Priority #2. Guests notice an empty glass before anything else.
3. EVERYTHING ELSE — Priority #3. Side work, rolling, polishing — important but never before 1 and 2.
If a trainee asks about priorities, sequence, or "what should I do first", always reinforce this order.
If you don't know something, say so honestly in a friendly way. Keep every response brief and text-like.`
  }, [firstName])

  const startQuiz = useCallback(async (selectedSetId = null) => {
    setLoading(true)
    try {
      // Build question pool from flashcard quizData only (single source of truth)
      let pool = []

      try {
        let fcCards = await getActiveFlashcards()
        if (selectedSetId) fcCards = fcCards.filter(c => (c.setId || 'default') === selectedSetId)
        for (const card of fcCards) {
          if (card.quizData?.q && Array.isArray(card.quizData.opts) && typeof card.quizData.ans === 'number' && isQuizApproved(card)) {
            pool.push({ ...card.quizData, testId: card.setId || 'flashcard', source: 'flashcard', cardId: card.id })
          }
        }
      } catch (_) {}

      if (pool.length < 2) {
        setMessages(prev => [...prev, { role: 'bot', text: selectedSetId
          ? "Not enough practice questions for that topic yet — try another one! 📚"
          : "No practice questions available yet. 📚" }])
        setLoading(false)
        return
      }

      const questions = shuffle(pool).slice(0, QUIZ_SIZE)
      const firstMsg = buildPracticeQuizMessage(questions[0], 0)
      setMessages(prev => [...prev,
        { role: 'bot', text: `Sure! ${questions.length} quick questions from your practice tests — tap your answer. 👍` },
        firstMsg,
      ])
      setQuizState({ questions, index: 0, score: 0, wrongIds: [] })
    } catch (e) {
      console.error('Quiz start error:', e)
      logClientError('quiz', 'starting-quiz', e, { selectedSetId })
      setMessages(prev => [...prev, { role: 'bot', text: "Couldn't load questions right now. Try again in a sec!" }])
    } finally {
      setLoading(false)
    }
  }, [])

  /** Convert a quiz question { q, opts, ans, exp } into a chatbot quiz message. */
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

  const onQuizAnswer = useCallback(async (msgIndex, optionIndex) => {
    const msg = messages[msgIndex]
    if (!msg?.quizQuestion || !quizState) return
    const { options, explanation, questionIndex } = msg.quizQuestion
    const chosen = options[optionIndex]
    const correct = chosen?.correct === true
    const correctOption = options.find(o => o.correct)

    // Show the explanation from the practice test, or fall back to the correct answer text
    const expText = explanation || (correctOption ? correctOption.text : '')

    const wrongIds = correct ? quizState.wrongIds : [...quizState.wrongIds, questionIndex]
    const score = quizState.score + (correct ? 1 : 0)
    const nextIndex = quizState.index + 1

    const feedbackText = correct ? "That's exactly right! ✅" : "Almost — here's the right answer. ❌"
    setMessages(prev => [...prev,
      { role: 'bot', quizFeedback: { correct, explanation: expText, feedbackText } },
    ])

    if (nextIndex >= quizState.questions.length) {
      const total = quizState.questions.length
      let resultsText = `You got ${score}/${total}! `
      if (score === total) resultsText += '💪 Perfect round!'
      else if (wrongIds.length > 0) resultsText += 'Nice work — keep practicing the ones you missed!'
      else resultsText += 'Nice work!'
      setMessages(prev => [...prev, { role: 'bot', quizResults: { score, total, message: resultsText } }])
      logFeatureUsage('quiz', { score, total })
      setQuizState(null)
      return
    }

    const nextQ = quizState.questions[nextIndex]
    setMessages(prev => [...prev, buildPracticeQuizMessage(nextQ, nextIndex)])
    setQuizState({ ...quizState, index: nextIndex, score, wrongIds })
  }, [messages, quizState])

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMessage = input.trim()
    setInput('')

    const normalized = userMessage.replace(/\s+/g, ' ').trim()

    // Image lookup: "what does X look like", "show me X", "picture of X", etc.
    let imageItemName = null
    for (const pat of IMAGE_PATTERNS) {
      const m = normalized.match(pat)
      if (m && m[1]) { imageItemName = m[1].trim().toLowerCase(); break }
    }
    // Context-aware follow-ups: "how about a burger", "and the filet", "now show me X", "what about wings"
    if (!imageItemName && lastActionRef.current === 'image') {
      const followUp = normalized.match(
        /^(?:how\s+about|what\s+about|and\s+(?:the\s+|a\s+|an\s+)?|now\s+(?:the\s+|a\s+|an\s+)?|or\s+(?:the\s+|a\s+|an\s+)?|(?:the|a|an)\s+)(.+?)[?!.\s]*$/i
      )
      if (followUp && followUp[1]) { imageItemName = followUp[1].trim().toLowerCase() }
    }
    if (imageItemName) {
      const itemName = imageItemName
      if (itemName && allFlashcardCards.length > 0) {
        // Word-level scoring: handles "filet" matching "Hand Cut Filet"
        function scoreMatch(candidateName, searchName) {
          const a = candidateName.toLowerCase().trim()
          const b = searchName.toLowerCase().trim()
          if (!a || !b) return 0
          if (a === b) return 10 // exact
          if (a.includes(b)) return 7 // candidate contains full search
          if (b.includes(a) && a.length >= 4) return 4 // search contains full candidate
          // Word-level: check if any meaningful search word appears in candidate words
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

        let bestCard = null
        let bestScore = 0
        for (const c of allFlashcardCards) {
          const front = (c.front || '').toLowerCase().trim()
          if (!front) continue
          const score = scoreMatch(front, itemName)
          if (score > bestScore) { bestScore = score; bestCard = c }
        }
        // Helper: search menuStudio for an image by item name
        function findMenuStudioImage(name) {
          let best = null
          let bestMs = 0
          for (const item of menuStudioItems) {
            const msName = (item.name || '').toLowerCase().trim()
            if (!msName) continue
            const score = scoreMatch(msName, name)
            if (score > bestMs) { bestMs = score; best = item }
          }
          return best
        }

        if (bestCard) {
          let imgUrl = bestCard.imageUrl
          let imgSource = 'flashcard'
          // If flashcard has no image, check menuStudio as fallback
          if (!imgUrl || typeof imgUrl !== 'string' || !imgUrl.startsWith('http')) {
            const msMatch = findMenuStudioImage(itemName)
            if (msMatch) {
              imgUrl = msMatch.imageUrl
              imgSource = 'menuStudio'
            }
          }
          if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
            setMessages((prev) => [
              ...prev,
              { role: 'user', text: userMessage },
              { role: 'bot', text: `Here's ${bestCard.front}:`, imageUrl: imgUrl },
            ])
            lastActionRef.current = 'image'
            logFeatureUsage('chatbot-image', { item: bestCard.front, source: imgSource })
            return
          }
          // Card found but no image in flashcards or menuStudio
          setMessages((prev) => [
            ...prev,
            { role: 'user', text: userMessage },
            { role: 'bot', text: `I found "${bestCard.front}" in our flashcards but there's no picture for it yet. Here's what I know:\n\n${bestCard.back || 'No description available.'}` },
          ])
          lastActionRef.current = 'image'
          return
        }
        // No matching flashcard — check menuStudio for an image
        const msMatch = findMenuStudioImage(itemName)
        if (msMatch) {
          setMessages((prev) => [
            ...prev,
            { role: 'user', text: userMessage },
            { role: 'bot', text: `Here's ${msMatch.name}:`, imageUrl: msMatch.imageUrl },
          ])
          lastActionRef.current = 'image'
          logFeatureUsage('chatbot-image', { item: msMatch.name, source: 'menuStudio' })
          return
        }
        // Nothing found anywhere — still keep image context for retry
        setMessages((prev) => [
          ...prev,
          { role: 'user', text: userMessage },
          { role: 'bot', text: `I couldn't find a picture of "${itemName}" in our menu. Try the exact menu item name — or ask me about it and I'll tell you what I know!` },
        ])
        lastActionRef.current = 'image'
        return
      }
    }

    const quizMatch = normalized.match(QUIZ_TRIGGER)
    if (quizMatch) {
      lastActionRef.current = 'quiz'
      setMessages(prev => [...prev, { role: 'user', text: userMessage }])
      const topic = quizMatch[3]?.trim() || null
      if (topic) {
        const matchedSet = matchTopicToSet(topic, flashcardSets)
        if (matchedSet) {
          await startQuiz(matchedSet.id)
          return
        }
        setMessages(prev => [...prev, { role: 'bot', topicPicker: { sets: flashcardSets, noMatchTopic: topic } }])
        return
      }
      setMessages(prev => [...prev, { role: 'bot', topicPicker: { sets: flashcardSets } }])
      return
    }

    lastActionRef.current = 'chat'
    setMessages(prev => [...prev, { role: 'user', text: userMessage }])
    setLoading(true)

    try {
      const context = buildContext(knowledgeBase)
      const systemPrompt = buildCharlieSystemPrompt(context) + `\n\nUSER ROLE: ${currentUser?.role || 'trainee'}\n\nCurrent question from trainee: ${userMessage}\n\nReply in 1-3 short sentences, in character as Charlie.`

      const textOnlyMessages = messages.filter(m => m.role === 'user' || (m.role === 'bot' && m.text != null))
      const priorUserMessages = textOnlyMessages.filter(m => m.role === 'user')
      const priorBotMessages = textOnlyMessages.filter(m => m.role === 'bot').slice(1)

      const contents = []
      if (priorUserMessages.length === 0) {
        contents.push({ role: 'user', parts: [{ text: systemPrompt }] })
      } else {
        contents.push({ role: 'user', parts: [{ text: systemPrompt + '\n\nFirst user message: ' + priorUserMessages[0].text }] })
        for (let i = 0; i < priorBotMessages.length; i++) {
          contents.push({ role: 'model', parts: [{ text: priorBotMessages[i].text }] })
          if (i + 1 < priorUserMessages.length) {
            contents.push({ role: 'user', parts: [{ text: priorUserMessages[i + 1].text }] })
          }
        }
        contents.push({ role: 'user', parts: [{ text: userMessage }] })
      }

      const geminiBody = {
        contents,
        model: 'gemini-2.0-flash',
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 256,
        }
      }
      const { headers: geminiHeaders, body: geminiPayload } = await buildGeminiProxyRequest(geminiBody)
      const response = await fetch(FUNCTIONS_BASE + '/geminiProxy', {
        method: 'POST',
        headers: geminiHeaders,
        body: JSON.stringify(geminiPayload),
      })

      if (!response.ok) {
        if (response.status === 429) {
          setMessages(prev => [...prev, { role: 'bot', text: "I'm getting a lot of questions right now — give me about 30 seconds and try again!" }])
          setLoading(false)
          return
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'API returned ' + response.status)
      }

      const data = await response.json()
      const botResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, couldn't get that — try again?"
      if (diagnosticMode && canDiagnostic) {
        setPendingResponse({ text: botResponse, contents })
      } else {
        setMessages(prev => [...prev, { role: 'bot', text: botResponse }])
      }
      logFeatureUsage('chatbot', { messageLength: userMessage.length })
    } catch (error) {
      console.error('Chat error:', error)
      logClientError('chatbot', 'sending-message', error, { messageText: userMessage?.substring(0, 100) })
      setMessages(prev => [...prev, {
        role: 'bot',
        text: "Something went wrong on my end — try again in a sec? 🙏"
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleDiagnosticSendAsIs = () => {
    if (pendingResponse) {
      setMessages(prev => [...prev, { role: 'bot', text: pendingResponse.text }])
      setPendingResponse(null)
    }
  }

  const handleDiagnosticSendEdited = () => {
    const edited = document.getElementById('diagnostic-textarea')?.value
    if (pendingResponse && edited != null) {
      setMessages(prev => [...prev, { role: 'bot', text: edited }])
      setPendingResponse(null)
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

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function clearChat() {
    setQuizState(null)
    setPendingResponse(null)
    const firstName = getFirstName(currentUser) || 'there'
    setMessages([
      { role: 'bot', text: `Hey ${firstName}! 👋 I'm Charlie. Ask me anything about the menu or the line, or type "quiz me" for a quick 5-question round!` }
    ])
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-96 max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] flex flex-col mb-4 animate-slideUp">
          <div className="bg-gradient-to-r from-green-800 to-green-700 text-white p-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">👨‍🍳</span>
              <div>
                <h3 className="font-bold">Charlie</h3>
                <p className="text-xs opacity-90">
                  {flashcardKnowledge || knowledgeBase ? 'Your AI assistant' : kbError ? 'Limited mode' : 'Loading...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canDiagnostic && (
                <button
                  type="button"
                  onClick={() => setDiagnosticMode(!diagnosticMode)}
                  className={`rounded-full w-8 h-8 flex items-center justify-center text-sm ${diagnosticMode ? 'bg-orange-500' : 'hover:bg-white/20'}`}
                  title="Diagnostic mode"
                >
                  🔬
                </button>
              )}
              <button type="button" onClick={clearChat} className="text-white hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center text-sm" aria-label="Clear chat" title="Clear chat">🗑️</button>
              <button type="button" onClick={() => setIsOpen(false)} className="text-white hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center text-2xl" aria-label="Close">×</button>
            </div>
          </div>
          {diagnosticMode && canDiagnostic && (
            <div className="bg-orange-500 text-white px-4 py-2 text-xs font-bold text-center">DIAGNOSTIC MODE</div>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-700/50">
            {messages.map((msg, idx) => {
              if (msg.role === 'user') {
                return (
                  <div key={idx} className="flex justify-end">
                    <div className="max-w-[80%] p-3 rounded-2xl bg-green-800 text-white rounded-br-none">
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                )
              }
              if (msg.quizQuestion) {
                const q = msg.quizQuestion
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="relative max-w-[90%]">
                      <div className="p-3 rounded-2xl bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none shadow-sm">
                        <p className="text-sm font-medium mb-2">{q.question}</p>
                        <p className="text-xs text-gray-500 mb-2">Question {q.questionIndex + 1} of {QUIZ_SIZE}</p>
                        <div className="space-y-2">
                          {q.options.map((opt, oi) => {
                            const answered = messages[idx + 1]?.quizFeedback != null
                            return (
                              <button
                                key={oi}
                                type="button"
                                disabled={answered}
                                className="w-full text-left px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:border-green-600 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 text-sm transition-colors disabled:opacity-70 disabled:cursor-default"
                                onClick={() => !answered && onQuizAnswer(idx, oi)}
                              >
                                {opt.text}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      {/* Flag button — quiz questions had no way to report a bad one before this */}
                      <div className="absolute -bottom-1 right-1">
                        <button
                          type="button"
                          onClick={() => setFlaggingMsgIdx(flaggingMsgIdx === idx ? null : idx)}
                          className={`text-xs p-1 rounded ${flaggedMsgIds.has(idx) ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'}`}
                          title="Flag this question"
                        >
                          🚩
                        </button>
                        {flaggingMsgIdx === idx && (
                          <div className="absolute right-0 bottom-6 z-20 w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg text-left">
                            <p className="text-xs font-medium mb-2">What&apos;s wrong?</p>
                            {['Wrong information', 'Confusing', 'Outdated', 'Other'].map((r) => (
                              <button
                                key={r}
                                type="button"
                                className="block w-full text-left px-2 py-1 text-xs hover:bg-gray-100 rounded"
                                onClick={() => submitQuizFlag(idx, q, r)}
                              >
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
              if (msg.topicPicker) {
                const { sets, noMatchTopic } = msg.topicPicker
                const pickerSets = Array.isArray(sets) ? sets : flashcardSets
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="max-w-[90%] p-3 rounded-2xl bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none shadow-sm">
                      <p className="text-sm font-medium mb-2">
                        {noMatchTopic ? `No set matching "${noMatchTopic}" — pick one:` : 'What do you want to quiz on?'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startQuiz(null)}
                          disabled={loading}
                          className="px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:border-green-600 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 text-sm transition-colors disabled:opacity-70"
                        >
                          🎲 All Topics
                        </button>
                        {pickerSets.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => startQuiz(s.id)}
                            disabled={loading}
                            className="px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:border-green-600 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 text-sm transition-colors disabled:opacity-70"
                          >
                            {s.title || s.name || s.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              }
              if (msg.quizFeedback) {
                const f = msg.quizFeedback
                return (
                  <div key={idx} className="flex justify-start">
                    <div className={`max-w-[85%] p-3 rounded-2xl rounded-bl-none shadow-sm ${f.correct ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'}`}>
                      <p className="text-sm font-medium">{f.feedbackText}</p>
                      {!f.correct && f.explanation && <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{f.explanation}</p>}
                    </div>
                  </div>
                )
              }
              if (msg.quizResults) {
                const r = msg.quizResults
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="max-w-[85%] p-3 rounded-2xl bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none shadow-sm">
                      <p className="text-sm font-medium">{r.message}</p>
                    </div>
                  </div>
                )
              }
              return (
                <div key={idx} className="flex justify-start">
                  <div className="relative max-w-[80%]">
                    <div className="p-3 rounded-2xl bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none shadow-sm">
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                      {msg.imageUrl && (
                        <img
                          src={msg.imageUrl}
                          alt=""
                          className="mt-2 rounded-lg max-w-full max-h-48 object-contain"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <div className="absolute -bottom-1 right-1">
                      <button
                        type="button"
                        onClick={() => setFlaggingMsgIdx(flaggingMsgIdx === idx ? null : idx)}
                        className={`text-xs p-1 rounded ${flaggedMsgIds.has(idx) ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Flag this response"
                      >
                        🚩
                      </button>
                      {flaggingMsgIdx === idx && (
                        <div className="absolute right-0 bottom-6 z-20 w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg text-left">
                          <p className="text-xs font-medium mb-2">What&apos;s wrong?</p>
                          {['Wrong information', 'Confusing', 'Outdated', 'Other'].map((r) => (
                            <button
                              key={r}
                              type="button"
                              className="block w-full text-left px-2 py-1 text-xs hover:bg-gray-100 rounded"
                              onClick={() => submitFlag(idx, msg.text, r)}
                            >
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
            {pendingResponse && (
              <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 space-y-2">
                <p className="text-xs font-bold text-orange-800">Diagnostic: edit or send as-is</p>
                <textarea
                  id="diagnostic-textarea"
                  className="w-full h-24 p-2 text-sm border border-gray-300 rounded"
                  defaultValue={pendingResponse.text}
                />
                <div className="flex gap-2">
                  <button type="button" className="btn btn-small" onClick={handleDiagnosticSendAsIs}>Send as-is</button>
                  <button type="button" className="btn btn-small" onClick={handleDiagnosticSendEdited}>Send edited version</button>
                </div>
              </div>
            )}
            {loading && !pendingResponse && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-700 p-3 rounded-2xl rounded-bl-none shadow-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-b-2xl">
            <div className="flex gap-2">
              <input type="text" aria-label="Ask Charlie" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={handleKeyPress} placeholder="Ask Charlie..." className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-full focus:outline-none focus:border-green-800 dark:bg-gray-700 dark:text-white text-sm" disabled={loading} />
              <button type="button" onClick={sendMessage} disabled={loading || !input.trim()} className="bg-green-800 text-white w-12 h-12 rounded-full flex items-center justify-center hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">➤</button>
            </div>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="bg-green-800 text-white w-14 h-14 rounded-full shadow-lg hover:bg-green-700 flex items-center justify-center text-2xl transition-all hover:scale-110" aria-label={isOpen ? 'Close chat' : 'Open chat'}>💬</button>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
      `}</style>
    </div>
  )
}
