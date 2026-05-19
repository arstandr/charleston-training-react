/**
 * One-time seed: Upselling Techniques flashcard set + 14 cards.
 * Run from Menu Studio or Admin. Idempotent — skips if set already exists.
 */
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const SET_ID = 'upselling'

const UPSELLING_SET = {
  id: SET_ID,
  title: 'Upselling Techniques',
  description: "DAD words, liquor upsells, and upselling strategies from the training manual",
  category: 'Service',
  icon: '💰',
  cardCount: 14,
  createdAt: serverTimestamp(),
}

const UPSELLING_CARDS = [
  { front: "Guest orders a vodka and tonic — what do you upsell?", back: "Grey Goose, Tito's, Belvedere, or Absolut" },
  { front: "What does ABC stand for in upselling?", back: "Angel's Envy, Basil Hayden, Woodford — our premium bourbons" },
  { front: "Guest orders a Manhattan or Old Fashioned — what do you upsell?", back: "Angel's Envy, Basil Hayden, or Woodford Reserve" },
  { front: "True or False: When featuring, including a bottle of wine pairing is the best way to increase sales", back: "TRUE — wine pairings are one of the highest-value upsells" },
  { front: "Guest orders a dessert — what should you upsell?", back: "Espresso Martini, Coffee, or Chocolatini" },
  { front: "Guest orders an entrée with no salad — how do you ring in the upsell salad?", back: "House $ or Caesar $ — ring it as a side salad add-on" },
  { front: "Guest orders a burger — what can you upsell?", back: "An extra burger patty" },
  { front: "Guest orders a cup of soup — what do you suggest for $1 more?", back: "Upgrade to a bowl of soup" },
  { front: "Prime Rib is available in what larger portion sizes?", back: "16oz, 18oz, 20oz, 22oz — always offer the larger cut" },
  { front: "What are the DAD words?", back: "Drinks, Appetizers, Desserts — always feature these to every table" },
  { front: "What salad add-ons can you upsell?", back: "Avocado, Anchovies, Bacon, Blue Cheese Crumbles, or Cheese" },
  { front: "When is the best time to feature to a table?", back: "On the first approach — guests are most receptive before they've decided" },
  { front: "What's the upselling goal as a server at Charleston's?", back: "Make the most money in the least amount of time with the least amount of effort" },
  { front: "Guest orders a team greet item — how do you upsell?", back: "Treat it as though it's yours — suggest your personal favorites with confidence" },
]

export async function seedUpsellingSet() {
  if (!db) throw new Error('Firestore not available')
  const setRef = doc(db, 'flashcardSets', SET_ID)
  const setSnap = await getDoc(setRef)
  if (setSnap.exists()) {
    return { created: false, alreadyExists: true, message: 'Upselling set already exists.' }
  }
  await setDoc(setRef, {
    ...UPSELLING_SET,
    title: UPSELLING_SET.title,
    description: UPSELLING_SET.description,
    category: UPSELLING_SET.category,
    icon: UPSELLING_SET.icon,
    cardCount: UPSELLING_SET.cardCount,
    createdAt: serverTimestamp(),
  })
  const coll = collection(db, 'flashcards')
  for (const card of UPSELLING_CARDS) {
    await addDoc(coll, {
      setId: SET_ID,
      front: card.front,
      back: card.back,
      status: 'active',
      source: 'hardcoded',
      cardType: 'standard',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
  return { created: true, message: `Upselling set and ${UPSELLING_CARDS.length} cards created.` }
}
