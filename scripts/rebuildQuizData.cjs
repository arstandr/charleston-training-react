/**
 * rebuildQuizData.cjs
 *
 * Rebuilds quizData for every active flashcard so that:
 *   - correct answer = card.back verbatim (never reworded)
 *   - question = card.front verbatim (if ends with ?) OR Gemini-framed question
 *   - 3 distractors = AI-generated, similar in style to the correct answer
 *
 * Usage:
 *   node scripts/rebuildQuizData.cjs
 *   node scripts/rebuildQuizData.cjs --set bar-beer        (one set only)
 *   node scripts/rebuildQuizData.cjs --dry-run             (no writes)
 *   node scripts/rebuildQuizData.cjs --missing-only        (skip cards that already have quizData)
 */

const admin = require('/Users/adamstandridge/Desktop/projects/charops-app/functions/node_modules/firebase-admin')
const serviceAccount = require('/Users/adamstandridge/Desktop/projects/service-account.json')

// ── Config ────────────────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models'
const DELAY_MS     = 1200  // between cards — stay under Gemini rate limit
const BATCH_SIZE   = 490   // Firestore batch write limit

let GEMINI_API_KEY = null  // loaded from Firestore config/geminiApiKey at startup

// CLI args
const args = process.argv.slice(2)
const DRY_RUN    = args.includes('--dry-run')
const MISSING_ONLY = args.includes('--missing-only')
const setFlag = args.find(a => a.startsWith('--set='))
const TARGET_SET = setFlag ? setFlag.split('=')[1] : null

// ── Firebase init ─────────────────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})
const db = admin.firestore()

// ── Gemini call (with 429 retry) ─────────────────────────────────────────────
async function callGemini(prompt, retries = 3) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 429 && attempt < retries) {
      const wait = 5000 * (attempt + 1)  // 5s, 10s, 15s
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('No response from Gemini')
    return text.trim()
  }
  throw new Error('Max retries exceeded')
}

// ── Robust JSON extraction ────────────────────────────────────────────────────
function extractJson(raw, debugLabel = '') {
  // Strip markdown fences
  let s = raw.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '').trim()
  // Find first { and last } to extract the object
  const start = s.indexOf('{')
  const end   = s.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in response')
  s = s.slice(start, end + 1)

  // Sanitize literal control characters inside JSON string values.
  // Gemini sometimes embeds real newlines/tabs in multi-line distractors.
  // Replace them with a space so the JSON is valid.
  s = s.replace(/[\u0000-\u001F\u007F]/g, (ch) => {
    if (ch === '\n') return ' '
    if (ch === '\r') return ' '
    if (ch === '\t') return ' '
    return ''
  })

  try {
    return JSON.parse(s)
  } catch (e) {
    // Common Gemini bug: array closed with } instead of ]}
    // e.g. {"distractors": ["a", "b", "c"} → fix to {"distractors": ["a", "b", "c"]}
    const fixed = s.replace(/(")\s*\}(\s*)$/, '$1]}$2')
    try {
      return JSON.parse(fixed)
    } catch (_) {
      if (debugLabel) console.error(`\n[DEBUG ${debugLabel}] Raw Gemini output:\n${raw}\n`)
      throw e
    }
  }
}

// ── Core quiz generation (matches ai.js logic exactly) ───────────────────────
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function generateQuiz(front, back, siblingBacks = []) {
  const frontIsQuestion = front.trim().endsWith('?')

  // Sanitize back for prompt injection only — double quotes in back would
  // confuse Gemini about where the answer value starts/ends.
  // The actual stored correct answer is always the original `back`.
  const backForPrompt = back.replace(/"/g, "'")

  const siblingContext = siblingBacks.length > 0
    ? `\nFor inspiration, here are other real answers from the same flashcard set (do NOT copy them verbatim, but use them to understand the style and domain): ${siblingBacks.slice(0, 12).join(' | ')}`
    : ''

  const prompt = frontIsQuestion
    ? `You are building a restaurant training quiz.

FLASHCARD QUESTION (use EXACTLY, word for word): "${front}"
CORRECT ANSWER (use EXACTLY, word for word — do not change anything): "${backForPrompt}"
${siblingContext}

Generate exactly 3 WRONG answers. Each wrong answer must:
- Match the style, length, and format of the correct answer
- Sound plausible to someone who did not study
- Be clearly wrong to someone who did study
- NOT be copied verbatim from the sibling answers above
- NEVER contain double-quote characters (use single quotes if needed)

Return ONLY a JSON object, no markdown, no explanation:
{"distractors": ["wrong 1", "wrong 2", "wrong 3"]}`
    : `You are building a restaurant training quiz.

FLASHCARD FRONT — this is a term, not a question yet: "${front}"
CORRECT ANSWER (use EXACTLY, word for word — do not change anything): "${backForPrompt}"
${siblingContext}

Task 1: Write a clear, simple question that asks about the front term. Examples: "What is [term]?", "What comes with [term]?", "How is [term] prepared?". Pick the phrasing that best fits the correct answer.
Task 2: Generate exactly 3 WRONG answers. Each wrong answer must:
- Match the style, length, and format of the correct answer
- Sound plausible to someone who did not study
- Be clearly wrong to someone who did study
- NOT be copied verbatim from the sibling answers above
- NEVER contain double-quote characters (use single quotes if needed)

Return ONLY a JSON object, no markdown, no explanation:
{"q": "the question text", "distractors": ["wrong 1", "wrong 2", "wrong 3"]}`

  const raw = await callGemini(prompt)
  const parsed = extractJson(raw, front)

  if (!Array.isArray(parsed.distractors) || parsed.distractors.length < 3) {
    throw new Error('Bad Gemini response: ' + JSON.stringify(parsed))
  }

  const question = frontIsQuestion ? front.trim() : (parsed.q || `What is ${front}?`)
  const opts = shuffle([back, ...parsed.distractors.slice(0, 3)])
  const ans = opts.findIndex(o => o === back)

  return { q: question, opts, ans, exp: `Correct answer: ${back}` }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Load Gemini API key from Firestore
  const keyDoc = await db.collection('config').doc('geminiApiKey').get()
  GEMINI_API_KEY = keyDoc.data()?.key
  if (!GEMINI_API_KEY) {
    console.error('❌  No Gemini API key found in Firestore config/geminiApiKey')
    process.exit(1)
  }
  console.log(`🔑  Gemini key loaded (${GEMINI_API_KEY.slice(0, 10)}...)`)

  console.log(`\n🚀  Rebuild Quiz Data`)
  console.log(`   dry-run:      ${DRY_RUN}`)
  console.log(`   missing-only: ${MISSING_ONLY}`)
  console.log(`   target set:   ${TARGET_SET || 'all'}`)
  console.log('')

  // 1. Load all active flashcards
  let q = db.collection('flashcards').where('status', '==', 'active')
  if (TARGET_SET) q = q.where('setId', '==', TARGET_SET)
  const snap = await q.get()

  const allCards = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.front && c.back)

  // Group by setId for sibling context
  const bySet = {}
  for (const c of allCards) {
    if (!bySet[c.setId]) bySet[c.setId] = []
    bySet[c.setId].push(c)
  }

  // Filter to cards that need work
  const toProcess = MISSING_ONLY
    ? allCards.filter(c => !c.quizData?.q)
    : allCards

  console.log(`📚  ${allCards.length} active cards loaded across ${Object.keys(bySet).length} sets`)
  console.log(`🔧  ${toProcess.length} cards to process${MISSING_ONLY ? ' (missing-only)' : ''}`)
  console.log('')

  let succeeded = 0
  let failed = 0
  let skipped = 0
  const errors = []

  // Batch writer
  let batch = db.batch()
  let batchCount = 0

  async function flushBatch() {
    if (batchCount === 0) return
    if (!DRY_RUN) await batch.commit()
    batch = db.batch()
    batchCount = 0
  }

  for (let i = 0; i < toProcess.length; i++) {
    const card = toProcess[i]
    const siblingBacks = (bySet[card.setId] || [])
      .filter(c => c.id !== card.id && c.back)
      .map(c => c.back)

    const pct = Math.round(((i + 1) / toProcess.length) * 100)
    process.stdout.write(`\r[${pct}%] ${i + 1}/${toProcess.length}  ${card.front.slice(0, 50).padEnd(50)}`)

    try {
      const quizData = await generateQuiz(card.front, card.back, siblingBacks)

      if (DRY_RUN) {
        // Just validate — don't write
        if (quizData.opts[quizData.ans] !== card.back) {
          throw new Error(`ans mismatch: opts[${quizData.ans}]="${quizData.opts[quizData.ans]}" !== back="${card.back}"`)
        }
      } else {
        const ref = db.collection('flashcards').doc(card.id)
        batch.update(ref, {
          quizData,
          quizApproved: false,
          updatedAt: new Date().toISOString(),
        })
        batchCount++
        if (batchCount >= BATCH_SIZE) await flushBatch()
      }

      succeeded++
    } catch (e) {
      failed++
      errors.push({ cardId: card.id, front: card.front, error: e.message })
    }

    // Rate limit pause (skip after last card)
    if (i < toProcess.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  await flushBatch()
  process.stdout.write('\n\n')

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('─'.repeat(60))
  console.log(`✅  Succeeded: ${succeeded}`)
  console.log(`❌  Failed:    ${failed}`)
  if (skipped) console.log(`⏭️   Skipped:   ${skipped}`)
  if (DRY_RUN) console.log('\n⚠️  DRY RUN — no writes made')
  else console.log('\n✅  All writes committed to Firestore')
  console.log('\nCards marked quizApproved: false — review under "Pending Quiz Approval" in Flashcard Manager.')

  if (errors.length > 0) {
    console.log('\nFailed cards:')
    errors.forEach(e => console.log(`  • [${e.cardId}] "${e.front}" — ${e.error}`))
  }

  process.exit(0)
}

main().catch(e => {
  console.error('\n💥 Fatal error:', e.message)
  process.exit(1)
})
