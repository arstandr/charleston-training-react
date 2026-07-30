/**
 * Gemini AI Service - 100% Firestore.
 * API key: /config/geminiKey. Rate limiting: /users/{userId} (geminiRateLimited, geminiLiveRateLimited).
 */
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODEL = 'gemini-2.5-flash'
const CONFIG_DOC = 'geminiKey'

// ---------------------------------------------------------------------------
// API KEY (Firestore only)
// ---------------------------------------------------------------------------

/**
 * Get Gemini API key from Firestore. No localStorage.
 */
export async function getGeminiKey() {
  try {
    if (!db) return null
    const ref = doc(db, 'config', CONFIG_DOC)
    const snap = await getDoc(ref)
    if (snap.exists() && snap.data()?.key) return snap.data().key
    return null
  } catch (error) {
    console.error('Error getting Gemini key:', error)
    return null
  }
}

/**
 * Save Gemini API key to Firestore. No localStorage.
 */
export async function setGeminiKey(key) {
  const k = (key || '').trim()
  if (!k || !k.startsWith('AIzaSy')) {
    throw new Error('Invalid Gemini API key format')
  }
  try {
    if (!db) throw new Error('Firestore not available')
    const ref = doc(db, 'config', CONFIG_DOC)
    await setDoc(ref, {
      key: k,
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin',
    })
    return true
  } catch (error) {
    console.error('Error saving Gemini key:', error)
    throw error
  }
}

/**
 * Validate API key by making a test request.
 */
export async function validateGeminiKey(key) {
  const url = `${GEMINI_BASE}/${MODEL}:generateContent?key=${key}`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Test' }] }],
      }),
    })
    if (response.status === 200) return { valid: true }
    if (response.status === 400) return { valid: false, error: 'Invalid API key' }
    if (response.status === 429) return { valid: false, error: 'Rate limited' }
    return { valid: false, error: 'Unknown error' }
  } catch (error) {
    return { valid: false, error: error.message }
  }
}

// ---------------------------------------------------------------------------
// RATE LIMITING (Firestore: users/{userId})
// ---------------------------------------------------------------------------

export async function isGeminiRateLimited(userId) {
  if (!userId || !db) return false
  try {
    const ref = doc(db, 'users', userId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return false
    const limitedUntil = snap.data()?.geminiRateLimited
    if (!limitedUntil) return false
    const now = Date.now()
    if (now < limitedUntil) return true
    await updateDoc(ref, { geminiRateLimited: null })
    return false
  } catch (e) {
    if (e?.code !== 'permission-denied') console.warn('Rate limit check failed:', e?.message)
    return false
  }
}

export async function isGeminiLiveRateLimited(userId) {
  if (!userId || !db) return false
  try {
    const ref = doc(db, 'users', userId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return false
    const limitedUntil = snap.data()?.geminiLiveRateLimited
    if (!limitedUntil) return false
    const now = Date.now()
    if (now < limitedUntil) return true
    await updateDoc(ref, { geminiLiveRateLimited: null })
    return false
  } catch (e) {
    if (e?.code !== 'permission-denied') console.warn('Rate limit check failed:', e?.message)
    return false
  }
}

export async function setGeminiRateLimited(userId, durationMs = 60000) {
  if (!userId || !db) return
  try {
    const ref = doc(db, 'users', userId)
    const limitUntil = Date.now() + durationMs
    await setDoc(ref, { geminiRateLimited: limitUntil, updatedAt: new Date().toISOString() }, { merge: true })
  } catch (e) {
    if (e?.code !== 'permission-denied') console.warn('Rate limit check failed:', e?.message)
  }
}

export async function setGeminiLiveRateLimited(userId, durationMs = 300000) {
  if (!userId || !db) return
  try {
    const ref = doc(db, 'users', userId)
    const limitUntil = Date.now() + durationMs
    await setDoc(ref, { geminiLiveRateLimited: limitUntil, updatedAt: new Date().toISOString() }, { merge: true })
  } catch (e) {
    if (e?.code !== 'permission-denied') console.warn('Rate limit check failed:', e?.message)
  }
}

/**
 * Get time remaining on rate limit (seconds). Async, reads from Firestore.
 */
export async function getRateLimitRemaining(userId) {
  if (!userId || !db) return { standard: 0, live: 0, isLimited: false }
  try {
    const ref = doc(db, 'users', userId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return { standard: 0, live: 0, isLimited: false }
    const data = snap.data()
    const now = Date.now()
    const standardRemaining = data.geminiRateLimited
      ? Math.max(0, Math.ceil((data.geminiRateLimited - now) / 1000))
      : 0
    const liveRemaining = data.geminiLiveRateLimited
      ? Math.max(0, Math.ceil((data.geminiLiveRateLimited - now) / 1000))
      : 0
    return {
      standard: standardRemaining,
      live: liveRemaining,
      isLimited: standardRemaining > 0 || liveRemaining > 0,
    }
  } catch (e) {
    if (e?.code === 'permission-denied') return { standard: 0, live: 0, isLimited: false }
    console.error('Error getting rate limit remaining:', e)
    return { standard: 0, live: 0, isLimited: false }
  }
}

// ---------------------------------------------------------------------------
// CORE API (requires userId for rate limiting)
// ---------------------------------------------------------------------------

/**
 * Make a request to Gemini API. Rate limits stored in Firestore per userId.
 */
export async function callGemini(prompt, userId, options = {}) {
  const {
    temperature = 0.7,
    maxTokens = 2048,
    systemInstruction = null,
    timeout = 30000,
  } = options

  if (await isGeminiRateLimited(userId)) {
    const remaining = await getRateLimitRemaining(userId)
    throw new Error(`Rate limited. Wait ${remaining.standard}s`)
  }
  if (await isGeminiLiveRateLimited(userId)) {
    const remaining = await getRateLimitRemaining(userId)
    throw new Error(`Live rate limited. Wait ${remaining.live}s`)
  }

  const apiKey = await getGeminiKey()
  if (!apiKey) throw new Error('Gemini API key not configured')

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  }
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  const url = `${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.status === 429) {
      await setGeminiRateLimited(userId, 60000)
      throw new Error('Rate limited by Gemini API. Wait 1 minute.')
    }
    if (response.status === 503) {
      await setGeminiLiveRateLimited(userId, 300000)
      throw new Error('Gemini API overloaded. Wait 5 minutes.')
    }
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (text != null) return text
    throw new Error('Invalid response format from Gemini')
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - Gemini API took too long')
    }
    throw error
  }
}

/**
 * Make a request to Gemini Vision API (text + image). Rate limits stored in Firestore per userId.
 */
export async function callGeminiVision(prompt, base64Data, mimeType, userId, options = {}) {
  const {
    temperature = 0.7,
    maxTokens = 2048,
    systemInstruction = null,
    timeout = 30000,
  } = options

  if (await isGeminiRateLimited(userId)) {
    const remaining = await getRateLimitRemaining(userId)
    throw new Error(`Rate limited. Wait ${remaining.standard}s`)
  }
  if (await isGeminiLiveRateLimited(userId)) {
    const remaining = await getRateLimitRemaining(userId)
    throw new Error(`Live rate limited. Wait ${remaining.live}s`)
  }

  const apiKey = await getGeminiKey()
  if (!apiKey) throw new Error('Gemini API key not configured')

  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: prompt },
      ],
    }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  }
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  const url = `${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.status === 429) {
      await setGeminiRateLimited(userId, 60000)
      throw new Error('Rate limited by Gemini API. Wait 1 minute.')
    }
    if (response.status === 503) {
      await setGeminiLiveRateLimited(userId, 300000)
      throw new Error('Gemini API overloaded. Wait 5 minutes.')
    }
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (text != null) return text
    throw new Error('Invalid response format from Gemini')
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - Gemini API took too long')
    }
    throw error
  }
}

/**
 * Call Gemini Vision with JSON response format.
 */
export async function callGeminiVisionJSON(prompt, base64Data, mimeType, userId, options = {}) {
  const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`
  const response = await callGeminiVision(jsonPrompt, base64Data, mimeType, userId, options)
  let jsonText = response.trim()
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```\n?/g, '')
  }
  try {
    return JSON.parse(jsonText)
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('Gemini returned invalid JSON: ' + e.message)
    throw e
  }
}

/**
 * Classify a food/drink image using Gemini Vision. Returns { description, keywords[], category }.
 */
export async function classifyFoodImage(base64Data, mimeType, userId) {
  const prompt = `You are a restaurant menu image classifier. Analyze this image and identify the food or drink item shown.

Return JSON with:
- "description": 1-sentence description (e.g. "A grilled 12oz ribeye steak with garlic butter")
- "keywords": 3-8 lowercase keywords for search matching (item name, ingredients, style)
- "category": ONE of: steaks, chicken, seafood, burgers-sandwiches, starters-appetizers, soups-salads, desserts, cocktails, wine, beer, spirits, sides, other`

  return callGeminiVisionJSON(prompt, base64Data, mimeType, userId, {
    temperature: 0.3,
    maxTokens: 500,
  })
}

/**
 * Call Gemini with JSON response format.
 */
export async function callGeminiJSON(prompt, userId, options = {}) {
  const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`
  const response = await callGemini(jsonPrompt, userId, options)
  let jsonText = response.trim()
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```\n?/g, '')
  }
  try {
    return JSON.parse(jsonText)
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('Gemini returned invalid JSON: ' + e.message)
    throw e
  }
}

// ---------------------------------------------------------------------------
// AI GENERATION (all take userId for rate limiting)
// ---------------------------------------------------------------------------

export async function generateQuizQuestions(flashcards, userId, count = 10, difficulty = 'medium') {
  const flashcardContext = (flashcards || [])
    .slice(0, 50)
    .map((card) => `Title: ${card.title || 'Card'}\nContent: ${card.front}\nAnswer: ${card.back}`)
    .join('\n\n')

  const prompt = `You are a restaurant training quiz generator. Generate ${count} multiple choice questions based on these flashcards.

FLASHCARDS:
${flashcardContext || 'No cards provided.'}

Requirements:
- Difficulty level: ${difficulty}
- Each question must have 4 options (A, B, C, D)
- Mark the correct answer (index 0-3)
- Questions should test practical knowledge
- Mix of memorization and application questions

Respond ONLY with valid JSON in this exact format:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Why this is correct",
      "difficulty": "medium",
      "relatedFlashcardTitle": "Title of related flashcard"
    }
  ]
}`

  return callGeminiJSON(prompt, userId, { temperature: 0.8, maxTokens: 3000 })
}

export async function generateFlashcardSuggestions(topic, existingFlashcards = [], count = 5, userId) {
  const existingTitles = (existingFlashcards || []).map((c) => c.title || c.front).filter(Boolean).join(', ')

  const prompt = `You are a restaurant training content creator. Generate ${count} flashcard suggestions about: ${topic}

${existingTitles ? `AVOID these existing topics: ${existingTitles}` : ''}

Requirements:
- Focus on practical, job-relevant information
- Clear, concise front (question/prompt)
- Detailed, helpful back (answer/explanation)
- Include specific details (ingredients, procedures, etc.)

Respond ONLY with valid JSON:
{
  "flashcards": [
    {
      "title": "Short descriptive title",
      "front": "Question or prompt",
      "back": "Detailed answer or explanation",
      "category": "Category name",
      "tags": ["tag1", "tag2"]
    }
  ]
}`

  return callGeminiJSON(prompt, userId, { temperature: 0.7, maxTokens: 2000 })
}

export async function analyzeMenuItem(itemName, description, ingredients = [], userId) {
  const prompt = `You are a restaurant training expert. Analyze this menu item and suggest key training points:

ITEM: ${itemName}
DESCRIPTION: ${description}
INGREDIENTS: ${Array.isArray(ingredients) ? ingredients.join(', ') : ingredients}

Provide training suggestions covering:
- Key ingredients and allergens
- Preparation notes
- Common customer questions
- Upsell opportunities
- Dietary modifications

Respond ONLY with valid JSON:
{
  "keyPoints": ["point 1", "point 2"],
  "allergens": ["allergen 1"],
  "commonQuestions": ["question 1"],
  "upsellSuggestions": ["suggestion 1"],
  "modifications": ["modification 1"]
}`

  return callGeminiJSON(prompt, userId, { temperature: 0.6, maxTokens: 1500 })
}

export async function generateTrainingFromDocument(documentText, userId, contentType = 'flashcards') {
  const text = (documentText || '').substring(0, 5000)
  const prompt = `You are a restaurant training content creator. Extract key training points from this document and create ${contentType}:

DOCUMENT:
${text}${(documentText || '').length > 5000 ? '...(truncated)' : ''}

Create comprehensive training content covering:
- Menu items and descriptions
- Preparation procedures
- Service standards
- Important policies

${contentType === 'flashcards' ? `
Respond with valid JSON:
{
  "flashcards": [
    {
      "title": "Title",
      "front": "Question",
      "back": "Answer",
      "category": "Category"
    }
  ]
}` : `
Respond with valid JSON:
{
  "questions": [
    {
      "question": "Question?",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "explanation": "Why correct"
    }
  ]
}`}`

  return callGeminiJSON(prompt, userId, { temperature: 0.7, maxTokens: 4000 })
}

export async function smartSearch(query, flashcards, userId) {
  const flashcardContext = (flashcards || [])
    .slice(0, 50)
    .map((card, idx) => `[${idx}] ${(card.title || card.front)}: ${card.front} | ${card.back}`)
    .join('\n')

  const prompt = `You are a search assistant. A user asked: "${query}"

Find the most relevant flashcards from this list:
${flashcardContext}

Return the indices of the top 5 most relevant flashcards.

Respond ONLY with valid JSON:
{
  "results": [0, 5, 12, 18, 23],
  "reasoning": "Why these cards match the query"
}`

  return callGeminiJSON(prompt, userId, { temperature: 0.3, maxTokens: 500 })
}

export async function identifyKnowledgeGaps(quizResults, flashcards, userId) {
  const failedQuestions = (quizResults || []).filter((r) => !r.correct).map((r) => r.question)
  const flashcardTitles = (flashcards || []).map((c) => c.title || c.front).join(', ')

  const prompt = `You are a training analyst. Identify knowledge gaps based on failed quiz questions:

FAILED QUESTIONS:
${failedQuestions.join('\n') || '(none)'}

AVAILABLE FLASHCARDS:
${flashcardTitles || '(none)'}

Analyze and recommend:
1. Which topics need more study
2. Which flashcards to review
3. Suggested study order

Respond ONLY with valid JSON:
{
  "weakTopics": ["topic 1", "topic 2"],
  "recommendedFlashcards": ["title 1", "title 2"],
  "studyPlan": "Suggested approach",
  "estimatedReviewTime": "30 minutes"
}`

  return callGeminiJSON(prompt, userId, { temperature: 0.5, maxTokens: 1000 })
}

export default {
  getGeminiKey,
  setGeminiKey,
  validateGeminiKey,
  isGeminiRateLimited,
  isGeminiLiveRateLimited,
  setGeminiRateLimited,
  setGeminiLiveRateLimited,
  getRateLimitRemaining,
  callGemini,
  callGeminiJSON,
  callGeminiVision,
  callGeminiVisionJSON,
  classifyFoodImage,
  generateQuizQuestions,
  generateFlashcardSuggestions,
  analyzeMenuItem,
  generateTrainingFromDocument,
  smartSearch,
  identifyKnowledgeGaps,
}
