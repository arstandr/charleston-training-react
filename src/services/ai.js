/**
 * AI service - calls Gemini via Cloud Function proxy only (no direct Gemini from client).
 * CORS for localhost is handled by the Cloud Function.
 * Used for Socratic hints, quiz generation, flashcard generation, training drift audit.
 */

const FUNCTIONS_BASE = 'https://us-central1-chartrain-20901.cloudfunctions.net'
const GEMINI_PROXY_URL = FUNCTIONS_BASE + '/geminiProxy'

/**
 * Low-level Gemini call (for proxy). Returns response text.
 * Used by Menu Ingestion AI semantic scan and other features.
 */
export async function callGemini(contents, generationConfig = {}) {
  const res = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: Array.isArray(contents) ? contents : [{ role: 'user', parts: [{ text: contents }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7, ...generationConfig },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 429) throw new Error('AI is busy (rate limit). Please wait a moment and try again.')
    throw new Error(data.error || 'Gemini request failed')
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (text == null) throw new Error('No response from Gemini')
  return text.trim()
}

/**
 * Exam-tutor hint: subtle nudge for official test (no answer words). Used for "Get a Hint" during official test.
 */
export async function getExamHint(questionText, correctAnswer) {
  const prompt = `You are a helpful tutor proctoring an exam. The student is stuck on this question:
"${questionText}"
The correct answer is "${correctAnswer}".

Provide a subtle, single-sentence hint that points them in the right direction without giving away the answer directly.
Do NOT use the words from the answer options.`
  return callGemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 256, temperature: 0.4 })
}

/**
 * Get a Socratic-style hint for a quiz question (don't give the answer; guide the learner).
 */
export async function getSocraticHint(questionText, options, correctIndex) {
  const correctLabel = options && options[correctIndex] != null ? options[correctIndex] : '(correct answer)'
  const prompt = `You are a patient tutor. A trainee is answering this multiple-choice question. Do NOT give the answer. Give one short Socratic hint (1-2 sentences) that nudges them toward the right idea without revealing "${correctLabel}". Be encouraging.

Question: ${questionText}
Options: ${(options || []).map((o, i) => `${i + 1}. ${o}`).join(' ')}

Reply with only the hint, no preamble.`
  return callGemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 256, temperature: 0.5 })
}

/**
 * Generate quiz questions from flashcard content. Returns array of { q, opts, ans, exp }.
 */
export async function generateQuizQuestions(flashcardSetName, cards, count = 5) {
  const cardTexts = (cards || []).slice(0, 30).map((c) => `Front: ${c.front}\nBack: ${c.back}`).join('\n\n')
  const prompt = `Generate exactly ${count} multiple-choice quiz questions (with 4 options each) based on these flashcards. For each question return a JSON object with: "q" (question text), "opts" (array of 4 option strings), "ans" (index 0-3 of correct option), "exp" (brief explanation). Return a JSON array of these objects, nothing else. No markdown, no code block.

Flashcard set: ${flashcardSetName}

${cardTexts || 'No cards provided.'}`
  const raw = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 2048, temperature: 0.6 })
  try {
    const cleaned = raw.replace(/^[\s\S]*?\[/, '[').replace(/\][\s\S]*$/, ']')
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed.slice(0, count) : []
  } catch (_) {
    return []
  }
}

/**
 * Generate flashcards from pasted text or menu descriptions.
 */
export async function generateFlashcards(sourceText, count = 10) {
  const prompt = `Convert the following content into flashcard pairs. For each pair return an object with "front" (term/item name) and "back" (definition/details). Return a JSON array of exactly up to ${count} such objects. No other text.

Content:
${(sourceText || '').slice(0, 4000)}`
  const raw = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 2048, temperature: 0.5 })
  try {
    const cleaned = raw.replace(/^[\s\S]*?\[/, '[').replace(/\][\s\S]*$/, ']')
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

/**
 * Generate a short training drift / health report comparing stores (for Owner Dashboard).
 */
export async function getTrainingDriftReport(storeSummaries) {
  const text = JSON.stringify(storeSummaries || [], null, 2).slice(0, 3000)
  const prompt = `As a training manager, write a brief 2-4 sentence "Training drift report" summarizing this data. Highlight any store that is behind, at risk, or doing well. Be concise and actionable.

Data (JSON):
${text}`
  return callGemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 512, temperature: 0.4 })
}

/**
 * Senior manager assessment of a trainee: verdict, evidence, action (3 sentences).
 */
export async function getTraineeAssessment(traineeName, readinessScoreLabel, testScoresText) {
  const prompt = `Act as a Senior Restaurant Manager. Assess this trainee's readiness.
Name: ${traineeName}
Readiness Score: ${readinessScoreLabel}
Test Scores: ${testScoresText}

Write a 3-sentence assessment:

Verdict: Are they ready for the floor?

Evidence: Cite specific strengths or consistent issues.

Action: What should the manager focus on next?`
  return callGemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 512, temperature: 0.4 })
}

/**
 * Generate a short personalized coach tip for a trainee. Suggests opening the Help chat and typing "Quiz me" or "Upsell me" when relevant.
 */
export async function getCoachTip(traineeSummary) {
  const prompt = `You are a supportive restaurant training coach. Based on this trainee's summary, give a "Coach's Tip" (2-4 sentences). Be encouraging and specific.

LOGIC:
1. If they have failed tests or are new: Tell them to open the Help chat (?) and type "Quiz me" to practice.
2. If they are passing but not yet certified: Suggest opening the Help chat and typing "Upsell me" to practice specific liquor brands and service.
3. Otherwise: Give a general tip (e.g. "Full Hands In", or studying their Need Practice topics).

Do not include STALLED_ALERT or any prefix. Reply with the coach tip only (plain text).`

  const fullPrompt = `${prompt}

Trainee summary:
${(traineeSummary || '').slice(0, 2000)}`
  return callGemini([{ role: 'user', parts: [{ text: fullPrompt }] }], { maxOutputTokens: 512, temperature: 0.5 })
}

/**
 * Generate a short morning briefing / greeting for the trainee, encouraging focus on struggle topics.
 */
export async function getMorningBriefing(traineeName, struggleTopicNames = []) {
  const topics = struggleTopicNames.length ? struggleTopicNames.slice(0, 5).join(', ') : 'your study materials'
  const prompt = `Write a 1-2 sentence encouraging morning greeting for a server trainee named ${traineeName || 'there'}. Mention focusing today on: ${topics}. Be brief and warm. No preamble.`
  return callGemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 150, temperature: 0.6 })
}

/**
 * Handbook / ? chat: 5-mode brain (Upsell, Quiz me, Translate, Sommelier, Handbook Q&A). Uses knowledge base and history.
 * @param {string} userMessage - Latest user question
 * @param {{ role: string, content: string }[]} history - Previous messages (user/model)
 * @param {string} knowledgeBase - Full handbook/knowledge text
 * @returns {Promise<string>} AI reply
 */
export async function chatWithHandbook(userMessage, history = [], knowledgeBase = '') {
  const historyText = (history || [])
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n')
  const knowledge = (knowledgeBase || '').trim() || 'No handbook content available.'
  const userInput = String(userMessage || '').replace(/`/g, "'").slice(0, 2000)

  const prompt = `You are the Charleston's AI Trainer. Detect the user's intent and choose ONE mode.

MODE 1 – UPSELL SIMULATOR
Trigger: "Upsell me", "Practice upsell", or similar.
Action: Act as a Guest. Order a generic item (e.g. "I'll have a Vodka Tonic"). Wait for them to suggest a premium brand. Reply in character as the guest only (short). Do not break character to explain.

MODE 2 – INSTANT QUIZZER
Trigger: "Quiz me", "Test me", "Ask me a question".
Action: Ask ONE tricky multiple-choice question (4 options) based on the KNOWLEDGE BASE. Format: "Question: ... A) ... B) ... C) ... D) ..." Wait for their answer; do not give the answer yet. Reply with only the question.

MODE 3 – TRANSLATOR
Trigger: "Translate X to [Language]" or "How do I say X in [Language]".
Action: Translate the restaurant term accurately. Reply with the translation and brief pronunciation if helpful.

MODE 4 – SOMMELIER
Trigger: "What pairs with...", "Wine for...", "Recommend a wine for...".
Action: Suggest a pairing from the menu / knowledge base. Be concise.

MODE 5 – HANDBOOK Q&A (Default)
Trigger: Any other question.
Action: Answer from the KNOWLEDGE BASE. For menu modifications use: Plain = meat & bread only; Dry = no sauces; Naked = no produce. If discussing an item, state if it becomes Dry, Naked, or Plain.

KNOWLEDGE BASE:
${knowledge}

CONVERSATION HISTORY:
${historyText || '(none)'}

User's latest input: "${userInput}"

Reply according to the mode that best matches the user's input. Be concise.`
  return callGemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 1024, temperature: 0.5 })
}

/**
 * Check if Gemini is configured (optional - for UI to show/hide AI features).
 */
export async function checkGeminiConfigured() {
  try {
    const res = await fetch(GEMINI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with OK' }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    })
    const data = await res.json()
    return res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text != null
  } catch (_) {
    return false
  }
}

/**
 * Save Gemini API key to Firestore via Cloud Function (admin only).
 * @param {string} key - Gemini API key
 * @param {string} adminCode - Admin code (e.g. '0000')
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
export async function setGeminiKeyToFirestore(key, adminCode) {
  const res = await fetch(FUNCTIONS_BASE + '/setGeminiKey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: (key || '').trim(), adminCode: String(adminCode || '').trim() }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { success: false, error: data.error || res.statusText }
  return { success: true, message: data.message }
}
