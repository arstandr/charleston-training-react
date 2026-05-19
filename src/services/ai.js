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
 * Generate a multiple-choice quiz question from a flashcard using Gemini.
 *
 * Rules:
 * - The correct answer is ALWAYS card.back verbatim — never reworded.
 * - If front already ends with "?", it is used as the question verbatim.
 * - If front is a term/label, Gemini frames it as a question (one call covers both tasks).
 * - Gemini only generates the 3 distractors (similar-but-wrong answers).
 * - siblingBacks: backs of other cards in the same set — passed in so Gemini can generate
 *   distractors that are grounded in real menu content rather than invented answers.
 *
 * Returns { q, opts, ans, exp } or null on failure.
 */
export async function autoGenerateQuizForCard(front, back, siblingBacks = []) {
  if (!front || !back) return null

  const frontIsQuestion = front.trim().endsWith('?')

  const siblingContext = siblingBacks.length > 0
    ? `\nFor inspiration, here are other real answers from the same flashcard set (do NOT copy them verbatim, but use them to understand the style and domain): ${siblingBacks.slice(0, 12).join(' | ')}`
    : ''

  const prompt = frontIsQuestion
    ? `You are building a restaurant training quiz.

FLASHCARD QUESTION (use EXACTLY, word for word): "${front}"
CORRECT ANSWER (use EXACTLY, word for word — do not change anything): "${back}"
${siblingContext}

Generate exactly 3 WRONG answers. Each wrong answer must:
- Match the style, length, and format of the correct answer
- Sound plausible to someone who did not study
- Be clearly wrong to someone who did study
- NOT be copied verbatim from the sibling answers above

Return ONLY a JSON object, no markdown, no explanation:
{"distractors": ["wrong 1", "wrong 2", "wrong 3"]}`
    : `You are building a restaurant training quiz.

FLASHCARD FRONT — this is a term, not a question yet: "${front}"
CORRECT ANSWER (use EXACTLY, word for word — do not change anything): "${back}"
${siblingContext}

Task 1: Write a clear, simple question that asks about the front term. Examples: "What is [term]?", "What comes with [term]?", "How is [term] prepared?". Pick the phrasing that best fits the correct answer.
Task 2: Generate exactly 3 WRONG answers. Each wrong answer must:
- Match the style, length, and format of the correct answer
- Sound plausible to someone who did not study
- Be clearly wrong to someone who did study
- NOT be copied verbatim from the sibling answers above

Return ONLY a JSON object, no markdown, no explanation:
{"q": "the question text", "distractors": ["wrong 1", "wrong 2", "wrong 3"]}`

  try {
    const response = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], {
      maxOutputTokens: 512,
      temperature: 0.4,
    })

    const cleaned = (typeof response === 'string' ? response : '')
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/\s*```/g, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    if (!Array.isArray(parsed.distractors) || parsed.distractors.length < 3) return null

    const question = frontIsQuestion ? front.trim() : (parsed.q || `What is ${front}?`)

    // Build opts with correct answer + 3 distractors, then shuffle
    const opts = [back, ...parsed.distractors.slice(0, 3)]
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]]
    }
    // ans points to wherever the correct answer landed after shuffle
    const ans = opts.findIndex((o) => o === back)

    return {
      q: question,
      opts,
      ans,
      exp: `Correct answer: ${back}`,
    }
  } catch (e) {
    console.warn('[QuizGen] Failed for "' + front + '":', e.message)
    return null
  }
}

/**
 * Reconcile a flashcard's back text with its quiz question.
 * Returns an enriched back string that covers all details tested by the quiz,
 * or null on failure.
 */
export async function reconcileCardBackWithQuiz(front, currentBack, quizQuestion, correctAnswer) {
  if (!front || !currentBack || !quizQuestion || !correctAnswer) return null

  const prompt = `Task: Update a restaurant training flashcard's BACK text so a trainee who studies it will be able to answer the quiz question correctly.

FLASHCARD FRONT: "${front}"
CURRENT FLASHCARD BACK: "${currentBack}"

QUIZ QUESTION: "${quizQuestion}"
CORRECT ANSWER: "${correctAnswer}"

RULES:
1. Keep ALL existing information from the current BACK — do not remove anything.
2. Add any specific details from the CORRECT ANSWER that are missing from the current BACK (e.g. counts, sizes, specific ingredients, preparation details).
3. Keep the tone and format consistent with the current BACK — short, factual, comma-separated details.
4. Do NOT add the quiz question itself or any quiz framing. Just the factual content.
5. If the current BACK already covers everything in the correct answer, return it unchanged.
6. Keep it concise — no more than 2-3 sentences or a short list.

Return ONLY the updated back text, no quotes, no preamble, no explanation.`

  try {
    return await callGemini([{ role: 'user', parts: [{ text: prompt }] }], {
      maxOutputTokens: 512,
      temperature: 0.2,
    })
  } catch (e) {
    console.warn('[Reconcile] Failed for "' + front + '":', e.message)
    return null
  }
}

/**
 * Reformat a flashcard's back text into a consistent bullet-point list.
 * Each detail gets its own line with a • prefix.
 * Returns the reformatted text, or null on failure.
 */
export async function reformatCardBackToBullets(front, currentBack) {
  if (!front || !currentBack) return null

  const prompt = `Task: Reformat this restaurant training flashcard's BACK text into a clean, consistent bullet-point list.

FLASHCARD FRONT: "${front}"
CURRENT BACK: "${currentBack}"

RULES:
1. Break the content into individual details, each on its own line starting with "• " (bullet character, not a dash).
2. Each bullet should be ONE specific detail (ingredient, preparation method, side, size, count, etc.).
3. Keep ALL existing information — do not remove, add, or change any facts.
4. Keep wording close to the original — just restructure into bullets.
5. If the back is ALREADY in bullet format with "• " on each line, return it unchanged.
6. Do NOT add a title or header — just the bullet list.
7. Combine closely related small details into one bullet when it reads naturally (e.g. "• Served with mashed potatoes and baked beans" rather than splitting into two bullets).

Return ONLY the reformatted bullet-point text, no quotes, no preamble, no explanation.`

  try {
    return await callGemini([{ role: 'user', parts: [{ text: prompt }] }], {
      maxOutputTokens: 512,
      temperature: 0.1,
    })
  } catch (e) {
    console.warn('[Reformat] Failed for "' + front + '":', e.message)
    return null
  }
}

/**
 * Generate a single menu item flashcard using category-specific template.
 * Returns { front, back } or null.
 */
export async function generateMenuItemFlashcard(itemName, description, price, category, subcategory, userNotes = '') {
  const { buildFlashcardPrompt } = await import('../utils/flashcardCategoryTemplates')
  const prompt = buildFlashcardPrompt(itemName, description, price, category, subcategory, userNotes)
  try {
    const raw = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], {
      maxOutputTokens: 800,
      temperature: 0.2,
    })
    const cleaned = (typeof raw === 'string' ? raw : '')
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/\s*```/g, '')
      .trim()
    const parsed = JSON.parse(cleaned)
    if (parsed?.front && parsed?.back) return { front: parsed.front, back: parsed.back }
    return null
  } catch (e) {
    console.warn('[FlashcardGen] Failed for "' + itemName + '":', e?.message)
    return null
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
