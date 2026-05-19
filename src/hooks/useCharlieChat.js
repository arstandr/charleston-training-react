/**
 * useCharlieChat — Custom hook for Charlie AI assistant.
 * Manages conversation state, Cloud Function calls, and tool execution loop.
 */
import { useState, useCallback, useRef } from 'react'
import { callCharlieChat, buildSystemPrompt, buildToolDefinitions } from '../services/charlieService'
import { executeTool } from '../services/charlieTools'
import { logClientError, logFeatureUsage } from '../services/errorLogger'

const MAX_TOOL_ROUNDS = 3
const MAX_HISTORY = 20

function getFirstName(user) {
  const name = (user?.name || user?.displayName || user?.email || '').trim()
  if (!name) return null
  return name.split(/\s+/)[0] || null
}

/**
 * @param {object} currentUser - User object from AuthContext
 * @param {string} categoryInfo - Optional summary of flashcard categories for system prompt
 */
export default function useCharlieChat(currentUser, categoryInfo = '') {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [toolStatus, setToolStatus] = useState(null) // e.g., "Looking up your progress..."
  const initializedRef = useRef(false)

  const firstName = getFirstName(currentUser) || 'there'
  const role = (currentUser?.role || 'trainee').toLowerCase()
  const userId = currentUser?.traineeId || currentUser?.id || currentUser?.uid
  const traineeId = currentUser?.traineeId || currentUser?.id || null
  // Read sessionToken lazily inside sendMessage — not here at render time.
  // Capturing it here causes stale closures if auth hydration hasn't finished yet.

  // Initialize greeting on first use
  if (!initializedRef.current) {
    initializedRef.current = true
    const greeting = `Hey ${firstName}! I'm Charlie — your AI training assistant. Ask me anything about the menu, the line, or policies. I can also look up your progress, quiz you, or help you study!`
    setMessages([{ role: 'bot', text: greeting }])
  }

  /**
   * Build Gemini contents array from conversation history + system prompt.
   */
  const buildContents = useCallback((userMessage, extraToolResults = null) => {
    const systemPrompt = buildSystemPrompt(role, firstName, categoryInfo)

    // Get text-only message history for context
    const textMessages = messages.filter(
      (m) => (m.role === 'user' && m.text) || (m.role === 'bot' && m.text)
    )

    // Keep last N messages for context
    const recentHistory = textMessages.slice(-MAX_HISTORY)

    const contents = []

    if (recentHistory.length === 0) {
      // First message
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt + '\n\nUser message: ' + userMessage }],
      })
    } else {
      // Build conversation with system prompt in first message
      const firstUserMsg = recentHistory.find((m) => m.role === 'user') || null
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt + '\n\nFirst message: ' + (firstUserMsg?.text || userMessage) }],
      })

      // Add remaining history as alternating user/model
      let lastRole = 'user'
      for (const msg of recentHistory) {
        if (firstUserMsg && msg === firstUserMsg) continue
        const geminiRole = msg.role === 'user' ? 'user' : 'model'
        // Ensure alternating roles
        if (geminiRole === lastRole) continue
        contents.push({
          role: geminiRole,
          parts: [{ text: msg.text }],
        })
        lastRole = geminiRole
      }

      // Add current user message
      if (lastRole === 'model' || lastRole === 'user') {
        // Ensure last is user
        if (lastRole === 'user') {
          // Need a model response placeholder
          contents.push({ role: 'model', parts: [{ text: '...' }] })
        }
        contents.push({
          role: 'user',
          parts: [{ text: userMessage }],
        })
      }
    }

    // If we have tool results to send back
    if (extraToolResults) {
      contents.push({
        role: 'model',
        parts: extraToolResults.functionCalls.map((fc) => ({
          functionCall: { name: fc.name, args: fc.args },
        })),
      })
      contents.push({
        role: 'user',
        parts: extraToolResults.results.map((r) => ({
          functionResponse: { name: r.name, response: r.response },
        })),
      })
    }

    return contents
  }, [messages, role, firstName, categoryInfo])

  /**
   * Process Gemini response — extract text and/or tool calls.
   */
  const processResponse = useCallback((data) => {
    const candidate = data?.data?.candidates?.[0]
    if (!candidate) return { text: "Sorry, I couldn't process that. Try again?", toolCalls: [] }

    const parts = candidate.content?.parts || []
    let text = ''
    const toolCalls = []

    for (const part of parts) {
      if (part.text) text += part.text
      if (part.functionCall) {
        toolCalls.push({
          name: part.functionCall.name,
          args: part.functionCall.args || {},
        })
      }
    }

    return { text: text.trim(), toolCalls }
  }, [])

  /**
   * Execute tool calls and return results.
   */
  const executeTools = useCallback(async (toolCalls) => {
    const results = []
    for (const tc of toolCalls) {
      const toolLabel = {
        searchFlashcards: 'Searching flashcards...',
        getFlashcardCategories: 'Loading categories...',
        getMyProgress: 'Checking your progress...',
        getMyQuizScores: 'Looking up your scores...',
        getMyWeakAreas: 'Finding your weak spots...',
        getMyStudyHistory: 'Loading study history...',
        getStudyRecommendation: 'Building study plan...',
        getTraineeList: 'Loading trainee list...',
        getTraineeProgress: 'Looking up trainee data...',
        compareTrainees: 'Comparing trainees...',
        logStudySession: 'Recording session...',
        saveQuizResult: 'Saving quiz result...',
        getManagerActionItems: 'Checking your action items...',
        getTeamReadiness: 'Reviewing team progress...',
        getContentHealth: 'Checking content health...',
        approveClaim: 'Approving claim...',
        denyClaim: 'Denying claim...',
        signOffShift: 'Signing off shift...',
        createFlashcard: 'Creating flashcard...',
        editFlashcard: 'Updating flashcard...',
        graveyardFlashcard: 'Removing flashcard...',
        restoreFlashcard: 'Restoring flashcard...',
        generateQuizForCard: 'Generating quiz question...',
        approveQuiz: 'Approving quiz...',
        bulkCreateFlashcards: 'Generating flashcards...',
        getPendingQuizApprovals: 'Loading pending quizzes...',
      }[tc.name] || `Running ${tc.name}...`

      setToolStatus(toolLabel)

      const result = await executeTool(tc.name, tc.args, { userId, role, store: currentUser?.store, empNum: currentUser?.empNum })
      results.push({
        name: tc.name,
        response: { result: JSON.stringify(result) },
      })
    }
    setToolStatus(null)
    return results
  }, [userId, role, currentUser?.store, currentUser?.empNum])

  /**
   * Send a message and handle the response (including tool call loops).
   */
  const sendMessage = useCallback(async (userText) => {
    if (!userText?.trim() || loading) return

    const trimmed = userText.trim()

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    setLoading(true)

    try {
      const tools = buildToolDefinitions(role)
      let contents = buildContents(trimmed)
      let round = 0
      let finalText = ''

      while (round < MAX_TOOL_ROUNDS) {
        round++

        // Read sessionToken fresh each call — avoids stale closure from initial render
        const freshSessionToken = sessionStorage.getItem('sessionToken') || null

        // Trainee with no session token or traineeId — fail fast with a clear message
        if (role === 'trainee' && (!freshSessionToken || !traineeId)) {
          setMessages((prev) => [...prev, { role: 'bot', text: "Looks like your session expired. Try refreshing the page!" }])
          setLoading(false)
          return
        }

        const response = await callCharlieChat(
          contents,
          tools,
          role === 'trainee' ? traineeId : null,
          role === 'trainee' ? freshSessionToken : null,
        )

        const { text, toolCalls } = processResponse(response)

        if (toolCalls.length === 0) {
          // No tools — we have our final response
          finalText = text || "Sorry, I couldn't get that. Try again?"
          break
        }

        // Gemini returned only tool calls with text — save text for context but keep looping
        if (text) finalText = text

        // Execute tools
        const toolResults = await executeTools(toolCalls)

        // Build new contents with tool results for next round
        contents = buildContents(trimmed, {
          functionCalls: toolCalls,
          results: toolResults,
        })
      }

      setMessages((prev) => [...prev, { role: 'bot', text: finalText }])
      logFeatureUsage('charlie-chat', { role, messageLength: trimmed.length, rounds: round })
    } catch (error) {
      console.error('Charlie chat error:', error)
      logClientError('charlie', 'sending-message', error, { messageText: trimmed?.substring(0, 100) })

      let errorMsg = "Something went wrong on my end — try again in a sec?"
      if (error?.code === 'resource-exhausted' || error?.message?.includes('rate limit') || error?.message?.includes('Too many')) {
        errorMsg = "I'm getting a lot of questions right now — give me about 30 seconds and try again!"
      } else if (error?.code === 'unauthenticated' || error?.code === 'functions/unauthenticated') {
        errorMsg = "Looks like your session expired. Try refreshing the page!"
      }

      setMessages((prev) => [...prev, { role: 'bot', text: errorMsg }])
    } finally {
      setLoading(false)
      setToolStatus(null)
    }
  }, [loading, buildContents, processResponse, executeTools, role, traineeId])

  /**
   * Clear chat and reset to greeting.
   */
  const clearChat = useCallback(() => {
    const greeting = `Hey ${firstName}! I'm Charlie. Ask me anything about the menu or the line, or I can look up your progress and quiz you!`
    setMessages([{ role: 'bot', text: greeting }])
  }, [firstName])

  return {
    messages,
    loading,
    toolStatus,
    sendMessage,
    clearChat,
    setMessages,
  }
}
