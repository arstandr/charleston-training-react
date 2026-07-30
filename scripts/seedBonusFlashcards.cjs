/**
 * seedBonusFlashcards.cjs
 *
 * Seeds the 3 hardcoded bonus questions into Firestore as real flashcards
 * in the 'bonus-points' set, so they can be managed by admins in the
 * Flashcard Manager and are no longer hardcoded in the app.
 *
 * Safe to run multiple times — checks for existing bonusId before writing.
 *
 * Usage:
 *   node scripts/seedBonusFlashcards.cjs
 *   node scripts/seedBonusFlashcards.cjs --dry-run
 */

const admin = require('/Users/adamstandridge/Desktop/projects/charops-app/functions/node_modules/firebase-admin')
const serviceAccount = require('/Users/adamstandridge/Desktop/projects/service-account.json')

const DRY_RUN = process.argv.includes('--dry-run')

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQuizData(front, back, distractors) {
  const opts = shuffle([back, ...distractors])
  const ans = opts.findIndex((o) => o === back)
  return { q: front, opts, ans, exp: `Correct answer: ${back}` }
}

const BONUS_CARDS = [
  {
    bonusId: 'bonus_4rs',
    front: "What are the 4 R's of the Red Check Procedure?",
    back: "Remove, Report, Red Check, Run",
    distractors: [
      "Remove, Report, Re-plate, Run",
      "Remove, Re-cook, Red Check, Run",
      "Report, Remove, Red Check, Return",
    ],
  },
  {
    bonusId: 'bonus_pivot',
    front: "In the Pivot Point system, which seat is Position 1?",
    back: "The seat to the server's immediate left",
    distractors: [
      "The seat to the server's immediate right",
      "The seat directly across from the server",
      "The seat closest to the kitchen",
    ],
  },
  {
    bonusId: 'bonus_service_order',
    front: "When serving an entree, who do you serve first?",
    back: "The oldest Lady at the table",
    distractors: [
      "The oldest Gentleman at the table",
      "The guest closest to your right",
      "The guest who ordered first",
    ],
  },
]

async function main() {
  console.log(`\n🎯  Seed Bonus Flashcards`)
  console.log(`   dry-run: ${DRY_RUN}\n`)

  // Check which bonusIds already exist
  const existing = await db.collection('flashcards')
    .where('setId', '==', 'bonus-points')
    .where('status', '==', 'active')
    .get()

  const existingBonusIds = new Set()
  existing.docs.forEach((doc) => {
    const d = doc.data()
    if (d.bonusId) existingBonusIds.add(d.bonusId)
  })

  console.log(`📋  Found ${existingBonusIds.size} existing bonus cards: ${[...existingBonusIds].join(', ') || 'none'}\n`)

  let added = 0
  let skipped = 0

  for (const card of BONUS_CARDS) {
    if (existingBonusIds.has(card.bonusId)) {
      console.log(`⏭️   Skip  [${card.bonusId}] — already exists`)
      skipped++
      continue
    }

    const quizData = buildQuizData(card.front, card.back, card.distractors)

    const doc = {
      setId: 'bonus-points',
      front: card.front,
      back: card.back,
      status: 'active',
      isBonus: true,
      bonusId: card.bonusId,
      quizData,
      quizApproved: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (DRY_RUN) {
      console.log(`🔍  Would add [${card.bonusId}]: "${card.front}"`)
      console.log(`           opts: ${quizData.opts.join(' | ')}`)
      console.log(`           ans: ${quizData.opts[quizData.ans]}`)
    } else {
      const ref = db.collection('flashcards').doc()
      await ref.set(doc)
      console.log(`✅  Added  [${card.bonusId}] "${card.front}" → id: ${ref.id}`)
    }
    added++
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`✅  Added:   ${added}`)
  console.log(`⏭️   Skipped: ${skipped}`)
  if (DRY_RUN) console.log('\n⚠️  DRY RUN — no writes made')
  else console.log('\n✅  Done. Cards are live and quizApproved.')

  process.exit(0)
}

main().catch((e) => {
  console.error('\n💥 Fatal:', e.message)
  process.exit(1)
})
