import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  getAllFlashcardSets, getAllFlashcards, updateFlashcard,
  createFlashcard, deleteFlashcard, batchUpdateFlashcards,
  isQuizApproved,
} from '../services/flashcardService'
import { getFromFirestore, saveToFirestore } from '../utils/firestore'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import { useAuth } from '../contexts/AuthContext'
import { autoGenerateQuizForCard, reconcileCardBackWithQuiz, reformatCardBackToBullets } from '../services/ai'
import { getPendingFlags, dismissFlag, fixAndRestoreFlag, deleteFlag, reportQuizGenerationFailed } from '../services/flashcardFlags'
import { subscribeChatbotFlags, resolveChatbotFlag } from '../services/chatbotFlagsService'
import { downloadAndStoreImage, isFirebaseStorageUrl, uploadFileToStorage } from '../services/imageService'
import FlashcardGeneratorModal from '../components/FlashcardGeneratorModal'

const ORPHAN_TEST_TITLES = {
  bar_test: 'Bar & Beer Knowledge',
  wines_test: 'Wine & Cocktail Knowledge',
  soups_test: 'Starters, Soups, Salads & Sandwiches',
  steaks_test: 'Steaks, Specialties, Chicken & Desserts',
  bonus_test: 'Bonus Points',
}

const ORPHANED_QUESTIONS = [
  { testId: 'bar_test', setId: 'bar-beer', q: 'What are our draft beer sizes?', a: '16oz and 20oz' },
  { testId: 'bar_test', setId: 'bar-beer', q: 'What is HOUSE vodka?', a: 'Deep Eddys' },
  { testId: 'bar_test', setId: 'bar-beer', q: 'What ID do we accept?', a: 'Government issued ID with photo and expiration date' },
  { testId: 'bar_test', setId: 'bar-beer', q: 'Which juices do we fresh squeeze?', a: 'Orange and grapefruit' },
  { testId: 'bar_test', setId: 'bar-beer', q: 'What does UP mean?', a: 'Shaken through ice then strained' },
  { testId: 'bar_test', setId: 'bar-beer', q: 'What does NEAT mean?', a: 'Room temperature, no ice' },
  { testId: 'bar_test', setId: 'bar-beer', q: 'What does ON THE ROCKS mean?', a: 'Poured over ice' },
  { testId: 'wines_test', setId: 'wines-cocktails', q: 'Josh Cellars Cabernet pairs with?', a: 'Red protein (beef, lamb)' },
  { testId: 'wines_test', setId: 'wines-cocktails', q: 'Charles Krug Chardonnay pairs with?', a: 'White protein (chicken, fish)' },
  { testId: 'wines_test', setId: 'wines-cocktails', q: 'Where is The Prisoner from?', a: 'Napa Valley California' },
  { testId: 'wines_test', setId: 'wines-cocktails', q: 'Where is Kiona from?', a: 'Columbia Valley WA' },
  { testId: 'wines_test', setId: 'wines-cocktails', q: 'Where is Joseph Drouhin Macon-Villages from?', a: 'Burgundy France' },
  { testId: 'wines_test', setId: 'wines-cocktails', q: 'What in Lemon Drop Martini?', a: 'Deep Eddys lemon vodka, Cointreau, lemon juice, simple syrup, sugar rim' },
  { testId: 'wines_test', setId: 'wines-cocktails', q: 'What in Cranberry Spiced Mule?', a: 'Deep Eddy Vodka, lime juice, cranberry juice, cinnamon, ginger beer' },
  { testId: 'wines_test', setId: 'wines-cocktails', q: 'What in Peach Bellini?', a: 'Champagne, rum, peach schnapps, peach puree' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'What describes our Queso?', a: 'Melted cheese, green chilies, peppers, spicy sausage, salsa, fresh tortilla chips' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'What describes Spinach Artichoke Dip?', a: 'Spinach, artichokes, parmesan sauce, melted jack cheese, salsa, sour cream, fresh tortilla chips' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'How many shrimp in Shrimp Cargot?', a: '6 shrimp' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'Which TWO soups are served daily in season?', a: 'Chili and Tomato Basil' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'Should soup go out first or last?', a: 'First unless requested otherwise' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'House/Caesar NC means?', a: 'No charge - complimentary with steaks/fish' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'House/Caesar SUB means and costs?', a: 'Substitute salad for side - $3 upcharge' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'House/Caesar RED means and costs?', a: '$9 upcharge - add salad AND keep side' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'House/Caesar AL means and costs?', a: '$10 a la carte salad alone' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'What is IN our House Salad?', a: 'Head lettuce, romaine, red cabbage, green cabbage, field greens, carrots, eggs, bacon, croutons, tomato' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'What 4 things different on Chicken Club Salad vs House?', a: 'Avocado, green onions, lightly fried chicken, dressing on side' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: "What in Walt's Champagne Chicken Salad?", a: 'Sunflower seeds, strawberries, spiced pecans, pineapple, feta, dates, croutons, grilled chicken, champagne vinaigrette' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'MEDIUM WELL is?', a: 'Hot slightly pink' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'What does PLAIN mean?', a: 'Just meat and bun - no sauce OR vegetables' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'What describes our Cheeseburger?', a: 'House-made egg bun, cheddar, mayo, lettuce tomato pickle diced onion, standard with fries' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'What describes Grilled Chicken Avocado Club?', a: 'Blackened chicken, swiss, avocado, bacon, sprouts, tomatoes on wheatberry with honey mustard, fries' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'What describes Famous French Dip?', a: 'French bread, shaved prime rib, mayo, au jus' },
  { testId: 'soups_test', setId: 'starters-soups-salads', q: 'What describes Grilled Cheese?', a: 'Parmesan crusted sourdough, fontina cheddar white cheddar, served with tomato soup' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'Which describes Hand-cut Filet?', a: '7oz center cut with vegetable medley and house or caesar' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What comes standard with Charleston Ribeye?', a: 'Mashed potatoes and fried onion straws' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What size is Top Sirloin and what are standard sides?', a: '10oz with mashed potatoes' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What size slab are BBQ Baby Back Ribs?', a: '14-16oz' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What describes Meatloaf?', a: 'Ground beef, pork sausage, mixed cheeses with tomato brown sauce, mashed and carrots' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'How many catfish filets in Catfish Platter and what size?', a: '3 filets (3-5oz each)' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What describes Short Smoked Salmon?', a: '8oz salmon, mustard sauce, cucumber relish, vegetable medley and salad' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What describes Blackened Red Fish Tacos?', a: '2 corn tortillas, 4oz blackened red fish, coleslaw, avocado aioli, pickled red onions, cilantro, jack cheese, rice and beans with 2 limes' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'How many shrimp in Shrimp Scampi?', a: '8 shrimp' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'How many shrimp in Shrimp Skewer?', a: '7 jumbo shrimp' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What describes Oven Roasted Chicken?', a: 'Half herb rubbed chicken with mashed and baked beans' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'How many ounces is Chicken Tender Platter?', a: '9oz tenders' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'How many chicken breasts in Chicken Fried Chicken?', a: '2 breasts' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What describes Parmesan Crusted Chicken?', a: 'Two breasts, parmesan-walnut-pecan crust, marinara, on angel hair with herbal salad' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What describes Chicken Piccata?', a: 'Two 3oz breasts, artichokes, asparagus, grape tomatoes, lemon caper butter sauce, on angel hair with vegetables' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What describes Roast Beef Croissant?', a: 'Butter croissant, sliced roast beef, mayo, lettuce, tomato with fries' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What TWO things come with EVERY kids meal?', a: 'Beverage and chocolate chip cookie with ice cream' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What wood do we cook over?', a: 'Hickory wood' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'What three ingredients in Parmesan Crusted Chicken crust?', a: 'Parmesan, walnuts and pecans' },
  { testId: 'steaks_test', setId: 'steaks-specialties', q: 'How many ounces is Chicken Marsala chicken total?', a: '9oz (three 3oz breasts)' },
  { testId: 'bonus_test', setId: 'bonus-points', q: "What are the 4 R's of the Red Check Procedure?", a: 'Remove, Report, Red Check, Run' },
  { testId: 'bonus_test', setId: 'bonus-points', q: "According to the '10 Step Rule', what must you do after dropping the check?", a: 'Stay within 10 feet of the table to process payment if they are ready' },
  { testId: 'bonus_test', setId: 'bonus-points', q: "What is the 'Dime Lip' standard?", a: "Beverages should be filled to a dime's width below the rim" },
  { testId: 'bonus_test', setId: 'bonus-points', q: 'In the Pivot Point system, which seat is Position 1?', a: "The seat to the server's immediate left" },
  { testId: 'bonus_test', setId: 'bonus-points', q: "What does 'Full Hands In' mean?", a: 'Entering the kitchen with dirty dishes' },
  { testId: 'bonus_test', setId: 'bonus-points', q: 'How do you handle a refill for a Fountain Drink (Coke)?', a: 'Remove the old glass when delivering the fresh one' },
  { testId: 'bonus_test', setId: 'bonus-points', q: 'Where are employees allowed to smoke on property?', a: 'Nowhere' },
  { testId: 'bonus_test', setId: 'bonus-points', q: 'When serving an entree, who do you serve first?', a: 'The oldest Lady' },
  { testId: 'bonus_test', setId: 'bonus-points', q: "What defines a 'Big Top' regarding server assignment?", a: 'More than 12 guests requires two servers' },
  { testId: 'bonus_test', setId: 'bonus-points', q: "What is the difference between 'Pre-bussing' and 'Manicuring'?", a: 'Pre-bussing is plates/glasses; Manicuring is small debris (straws, wrappers)' },
  { testId: 'bonus_test', setId: 'bonus-points', q: 'If a guest asks where the restroom is, what do you do?', a: "Say 'Right this way' and walk them there" },
  { testId: 'bonus_test', setId: 'bonus-points', q: 'When refilling coffee at the table, you should:', a: 'Pick up the mug and turn slightly away from the guest' },
  { testId: 'bonus_test', setId: 'bonus-points', q: 'When do you present the check at LUNCH?', a: 'Once the entree has arrived (Check Back/Check Down)' },
]

export default function FlashcardManagerPage() {
  const { currentUser } = useAuth()
  const location = useLocation()
  const [sets, setSets] = useState([])
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSet, setSelectedSet] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showGraveyard, setShowGraveyard] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [addingCard, setAddingCard] = useState(false)
  const [message, setMessage] = useState(null)
  const [quizGenProgress, setQuizGenProgress] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [editQueue, setEditQueue] = useState([])
  const [editQueueIndex, setEditQueueIndex] = useState(0)
  const [attachModal, setAttachModal] = useState(null)
  const [attachSearch, setAttachSearch] = useState('')
  const [attachResults, setAttachResults] = useState([])
  const [chatbotFlags, setChatbotFlags] = useState([])
  const [editingFlagId, setEditingFlagId] = useState(null)
  const [editingFlagText, setEditingFlagText] = useState('')
  const [editingFlagNote, setEditingFlagNote] = useState('')
  const [showGenerator, setShowGenerator] = useState(false)
  const [attachLoading, setAttachLoading] = useState(false)
  const [attachError, setAttachError] = useState(null)
  const [queueMessage, setQueueMessage] = useState(null)
  const [dismissedOrphans, setDismissedOrphans] = useState(new Set())
  const [orphanCreating, setOrphanCreating] = useState(null)
  const [showDuplicates, setShowDuplicates] = useState(false)

  const isImageOnly = (card) => card.imageUrl && (!card.front || card.front.trim() === '')

  // Load dismissed orphans from Firestore on mount
  useEffect(() => {
    getFromFirestore('config', 'dismissedOrphans').then((data) => {
      if (data?.indexes) {
        setDismissedOrphans(new Set(data.indexes))
      }
    }).catch(() => {})
  }, [])

  async function persistDismissedOrphans(nextSet) {
    setDismissedOrphans(nextSet)
    try { await saveToFirestore('config', 'dismissedOrphans', { indexes: [...nextSet], updatedAt: new Date().toISOString() }) } catch {}
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [setsList, cardsList] = await Promise.all([
          getAllFlashcardSets(),
          getAllFlashcards(),
        ])
        setsList.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
        setSets(setsList)

        setCards(cardsList)
      } catch (e) {
        console.error('Load failed:', e)
        setMessage('Error loading flashcards: ' + (e?.message || 'Check console.'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    async function loadAlerts() {
      setAlertsLoading(true)
      try {
        const reports = await getPendingFlags()
        setAlerts(reports)
      } catch (e) {
        console.error('Failed to load alerts:', e)
      } finally {
        setAlertsLoading(false)
      }
    }
    loadAlerts()
  }, [])

  useEffect(() => {
    return subscribeChatbotFlags(setChatbotFlags)
  }, [])

  useEffect(() => {
    if ((location.hash || '') === '#content-alerts') {
      document.getElementById('content-alerts')?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [location.hash])


  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (showGraveyard ? c.status !== 'graveyarded' : c.status === 'graveyarded') return false
      if (selectedSet !== 'all' && c.setId !== selectedSet) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (c.front || '').toLowerCase().includes(q) || (c.back || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [cards, selectedSet, searchQuery, showGraveyard])

  const setCounts = useMemo(() => {
    const counts = {}
    cards.filter((c) => c.status === 'active').forEach((c) => {
      counts[c.setId] = (counts[c.setId] || 0) + 1
    })
    return counts
  }, [cards])

  const remainingOrphans = useMemo(() => {
    const cardFronts = new Set(
      cards.filter((c) => c.status !== 'graveyarded').map((c) => (c.front || '').toLowerCase().trim())
    )
    return ORPHANED_QUESTIONS.map((o, i) => ({ ...o, _idx: i }))
      .filter((o) => !dismissedOrphans.has(o._idx))
      .filter((o) => !cardFronts.has(o.q.toLowerCase().trim()))
  }, [cards, dismissedOrphans])

  const duplicateGroups = useMemo(() => {
    const active = cards.filter((c) => c.status === 'active' && c.front?.trim())
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const groups = {}
    active.forEach((card) => {
      const key = normalize(card.front)
      if (!key) return
      if (!groups[key]) groups[key] = []
      groups[key].push(card)
    })
    return Object.values(groups).filter((g) => g.length > 1)
  }, [cards])

  async function handleSaveCard(cardId, updates) {
    if (updates.imageUrl && !isFirebaseStorageUrl(updates.imageUrl)) {
      try {
        updates.imageUrl = await downloadAndStoreImage(updates.imageUrl, cardId)
      } catch (e) {
        console.warn('Image storage failed, keeping original URL:', e.message)
      }
    }
    const card = cards.find((c) => c.id === cardId)
    if (card?.status === 'quarantined') {
      updates.status = 'active'
    }
    const saveData = { ...updates, updatedAt: new Date().toISOString() }
    if (card) {
      // Card exists — update it
      await updateFlashcard(cardId, saveData)
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, ...saveData } : c)))
    } else {
      // Card doesn't exist locally (e.g. from a content alert) — create it
      const newCardData = { ...saveData, status: saveData.status || 'active', source: 'restored' }
      const ref = await createFlashcard(newCardData)
      setCards((prev) => [...prev, { id: ref.id, ...newCardData }])
    }
    setEditingCard(null)

    const cardAlerts = alerts.filter((a) => (a.cardId || a.id) === cardId)
    if (cardAlerts.length > 0) {
      try {
        for (const a of cardAlerts) {
          await fixAndRestoreFlag(a.id)
        }
        setAlerts((prev) => prev.filter((a) => (a.cardId || a.id) !== cardId))
      } catch (flagErr) {
        console.error('Failed to resolve flag (card was still saved):', flagErr)
      }
      setMessage('Card fixed and restored!')
    } else {
      setMessage('Card updated!')
    }
    setTimeout(() => setMessage(null), 2000)
  }

  async function handleGraveyardCard(cardId) {
    try {
      const card = cards.find((c) => c.id === cardId) || editQueue.find((c) => c.id === cardId)
      const currentStatus = card?.status || 'active'
      const newStatus = currentStatus === 'graveyarded' ? 'active' : 'graveyarded'
      const updates = {
        status: newStatus,
        graveyardedAt: newStatus === 'graveyarded' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      }
      await updateFlashcard(cardId, updates)
      setCards((prev) => {
        const exists = prev.some((c) => c.id === cardId)
        if (exists) return prev.map((c) => (c.id === cardId ? { ...c, ...updates } : c))
        // Card wasn't in local state (e.g. from content alert) — add it
        return [...prev, { ...(card || { id: cardId }), ...updates }]
      })
      setEditingCard(null)
      setMessage(newStatus === 'graveyarded' ? 'Card moved to graveyard.' : 'Card restored!')
      setTimeout(() => setMessage(null), 2000)
    } catch (e) {
      setMessage('Failed to graveyard card: ' + (e?.message || 'Unknown error'))
      setTimeout(() => setMessage(null), 4000)
    }
  }

  async function handleBulkGraveyard() {
    if (selectedIds.size === 0) return
    const confirmed = window.confirm(
      `Graveyard ${selectedIds.size} card(s)? They can be restored later.`
    )
    if (!confirmed) return
    const ids = [...selectedIds]
    await batchUpdateFlashcards(ids, {
      status: 'graveyarded',
      graveyardedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setCards((prev) =>
      prev.map((c) => (selectedIds.has(c.id) ? { ...c, status: 'graveyarded', graveyardedAt: new Date() } : c))
    )
    setSelectedIds(new Set())
    setSelectMode(false)
    setMessage(`Graveyarded ${ids.length} card(s).`)
    setTimeout(() => setMessage(null), 3000)
  }

  function handleBulkEdit() {
    if (selectedIds.size === 0) return
    const queue = filtered.filter((c) => selectedIds.has(c.id))
    setEditQueue(queue)
    setEditQueueIndex(0)
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function handleAttachImage(sourceCard, targetCard) {
    setAttachLoading(true)
    setAttachError(null)
    try {
      await updateFlashcard(targetCard.id, {
        imageUrl: sourceCard.imageUrl,
        updatedAt: new Date().toISOString(),
      })
      await updateFlashcard(sourceCard.id, {
        status: 'graveyarded',
        graveyardedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setCards((prev) =>
        prev.map((c) => {
          if (c.id === targetCard.id) return { ...c, imageUrl: sourceCard.imageUrl }
          if (c.id === sourceCard.id) return { ...c, status: 'graveyarded', graveyardedAt: new Date() }
          return c
        })
      )
      setAttachModal(null)
      setAttachSearch('')
      setAttachResults([])
      setMessage('Image attached and orphan card graveyarded.')
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      console.error('Failed to attach image:', e)
      setAttachError('Failed to attach: ' + (e?.message || 'Unknown error'))
    } finally {
      setAttachLoading(false)
    }
  }

  async function handleAddCard(newCard) {
    try {
      const ref = await createFlashcard({
        ...newCard,
        status: 'active',
        source: 'manual',
        quizApproved: false,
        updatedAt: new Date().toISOString(),
      })
      setCards((prev) => [...prev, { id: ref.id, ...newCard, status: 'active', source: 'manual', quizApproved: false }])
      setAddingCard(false)
      setMessage('Card added! Generating quiz question...')

      const newCardSiblingBacks = cards
        .filter((c) => c.setId === newCard.setId && c.back)
        .map((c) => c.back)
      autoGenerateQuizForCard(newCard.front, newCard.back, newCardSiblingBacks)
        .then(async (quizData) => {
          if (quizData) {
            await updateFlashcard(ref.id, { quizData, quizApproved: false, updatedAt: new Date().toISOString() })
            setCards((prev) => prev.map((c) => (c.id === ref.id ? { ...c, quizData, quizApproved: false } : c)))
            setMessage('Card added with quiz question — pending approval.')
          } else {
            reportQuizGenerationFailed({ cardId: ref.id, front: newCard.front, back: newCard.back, setId: newCard.setId }).catch(() => {})
            setMessage('Card added. Quiz generation failed — a Content Alert has been created.')
          }
          setTimeout(() => setMessage(null), 4000)
        })
        .catch(() => {
          reportQuizGenerationFailed({ cardId: ref.id, front: newCard.front, back: newCard.back, setId: newCard.setId }).catch(() => {})
          setMessage('Card added. Quiz generation failed — a Content Alert has been created.')
          setTimeout(() => setMessage(null), 4000)
        })
    } catch (e) {
      setMessage('Error: ' + e.message)
    }
  }

  async function handleGenerateAllMissingQuizzes() {
    const missing = cards.filter(
      (c) => c.status === 'active' && c.front && c.back && (!c.quizData || !c.quizData.q)
    )
    if (missing.length === 0) {
      setMessage('All cards already have quiz questions!')
      setTimeout(() => setMessage(null), 3000)
      return
    }
    const confirmed = window.confirm(
      `Generate quiz questions for ${missing.length} cards? This will use the AI API.`
    )
    if (!confirmed) return

    setQuizGenProgress({ done: 0, total: missing.length, current: '' })
    let succeeded = 0
    let failed = 0

    for (let i = 0; i < missing.length; i++) {
      const card = missing[i]
      setQuizGenProgress({ done: i, total: missing.length, current: card.front })
      const siblingBacks = cards
        .filter((c) => c.setId === card.setId && c.id !== card.id && c.back)
        .map((c) => c.back)

      try {
        const quizData = await autoGenerateQuizForCard(card.front, card.back, siblingBacks)
        if (quizData) {
          await updateFlashcard(card.id, { quizData, quizApproved: false, updatedAt: new Date().toISOString() })
          setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, quizData, quizApproved: false } : c)))
          succeeded++
        } else {
          failed++
        }
      } catch (_) {
        failed++
      }

      if (i < missing.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    setQuizGenProgress(null)
    setMessage(
      `Quiz generation complete: ${succeeded} created, ${failed} failed out of ${missing.length} cards.`
    )
    setTimeout(() => setMessage(null), 5000)
  }

  async function handleRegenerateAllQuizzes() {
    const withQuiz = cards.filter(
      (c) => c.status === 'active' && c.front && c.back && c.quizData?.q
    )
    if (withQuiz.length === 0) {
      setMessage('No cards with quiz questions to regenerate.')
      setTimeout(() => setMessage(null), 3000)
      return
    }
    const confirmed = window.confirm(
      `Regenerate ALL ${withQuiz.length} quiz questions with the updated prompt? This will overwrite existing questions and mark them pending approval.\n\nThis uses the AI API and will take several minutes.`
    )
    if (!confirmed) return

    setQuizGenProgress({ done: 0, total: withQuiz.length, current: '' })
    let succeeded = 0
    let failed = 0

    for (let i = 0; i < withQuiz.length; i++) {
      const card = withQuiz[i]
      setQuizGenProgress({ done: i, total: withQuiz.length, current: card.front })
      const siblingBacks = cards
        .filter((c) => c.setId === card.setId && c.id !== card.id && c.back)
        .map((c) => c.back)

      try {
        const quizData = await autoGenerateQuizForCard(card.front, card.back, siblingBacks)
        if (quizData) {
          await updateFlashcard(card.id, { quizData, quizApproved: false, updatedAt: new Date().toISOString() })
          setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, quizData, quizApproved: false } : c)))
          succeeded++
        } else {
          failed++
        }
      } catch (_) {
        failed++
      }

      if (i < withQuiz.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    setQuizGenProgress(null)
    setMessage(
      `Regeneration complete: ${succeeded} updated, ${failed} failed. Check "Pending Quiz Approval" to review.`
    )
    setTimeout(() => setMessage(null), 6000)
  }

  async function handleRebuildAllQuizzes() {
    const allActive = cards.filter((c) => c.status === 'active' && c.front && c.back)
    if (allActive.length === 0) {
      setMessage('No active cards to rebuild.')
      setTimeout(() => setMessage(null), 3000)
      return
    }
    const confirmed = window.confirm(
      `Rebuild quiz questions for ALL ${allActive.length} active cards?\n\nThis rewrites every card so the correct answer is the EXACT text on the flashcard back — no paraphrasing. 3 similar wrong answers will be generated for each.\n\nAll cards will be marked pending approval afterward. This will take several minutes.`
    )
    if (!confirmed) return

    setQuizGenProgress({ done: 0, total: allActive.length, current: '' })
    let succeeded = 0
    let failed = 0

    for (let i = 0; i < allActive.length; i++) {
      const card = allActive[i]
      setQuizGenProgress({ done: i, total: allActive.length, current: card.front })
      const siblingBacks = cards
        .filter((c) => c.setId === card.setId && c.id !== card.id && c.back)
        .map((c) => c.back)

      try {
        const quizData = await autoGenerateQuizForCard(card.front, card.back, siblingBacks)
        if (quizData) {
          await updateFlashcard(card.id, { quizData, quizApproved: false, updatedAt: new Date().toISOString() })
          setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, quizData, quizApproved: false } : c)))
          succeeded++
        } else {
          failed++
        }
      } catch (_) {
        failed++
      }

      if (i < allActive.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    setQuizGenProgress(null)
    setMessage(
      `Rebuild complete: ${succeeded} cards updated, ${failed} failed. Review under "Pending Quiz Approval".`
    )
    setTimeout(() => setMessage(null), 7000)
  }

  async function handleReconcileBacksWithQuizzes() {
    const withQuiz = cards.filter(
      (c) => c.status === 'active' && c.front && c.back && c.quizData?.q && c.quizData?.opts && typeof c.quizData?.ans === 'number' && !c.quizReconciled
    )
    if (withQuiz.length === 0) {
      setMessage('No cards with quiz questions to reconcile.')
      setTimeout(() => setMessage(null), 3000)
      return
    }
    const confirmed = window.confirm(
      `Update ${withQuiz.length} flashcard backs to include details tested by their quiz questions?\n\nThis uses AI to enrich each card's back text so studying the flashcard covers what the quiz asks. Existing back content is preserved.\n\nThis will take several minutes.`
    )
    if (!confirmed) return

    setQuizGenProgress({ done: 0, total: withQuiz.length, current: '' })
    let updated = 0
    let unchanged = 0
    let failed = 0

    for (let i = 0; i < withQuiz.length; i++) {
      const card = withQuiz[i]
      const correctAnswer = card.quizData.opts[card.quizData.ans] || ''
      setQuizGenProgress({ done: i, total: withQuiz.length, current: card.front })

      try {
        const newBack = await reconcileCardBackWithQuiz(card.front, card.back, card.quizData.q, correctAnswer)
        if (newBack && newBack.trim() !== card.back.trim()) {
          await updateFlashcard(card.id, { back: newBack.trim(), quizReconciled: true, updatedAt: new Date().toISOString() })
          setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, back: newBack.trim(), quizReconciled: true } : c)))
          updated++
        } else {
          await updateFlashcard(card.id, { quizReconciled: true, updatedAt: new Date().toISOString() })
          setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, quizReconciled: true } : c)))
          unchanged++
        }
      } catch (_) {
        failed++
      }

      if (i < withQuiz.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    setQuizGenProgress(null)
    setMessage(
      `Reconciliation complete: ${updated} backs enriched, ${unchanged} already covered, ${failed} failed.`
    )
    setTimeout(() => setMessage(null), 6000)
  }

  const FOOD_SET_IDS = new Set(['starters-soups-salads', 'steaks-specialties'])

  async function handleReformatToBullets() {
    const foodCards = cards.filter(
      (c) => c.status === 'active' && c.front && c.back && FOOD_SET_IDS.has(c.setId)
    )
    // Skip cards already in bullet format (every non-empty line starts with •)
    const needsReformat = foodCards.filter((c) => {
      const lines = c.back.split('\n').filter((l) => l.trim())
      return lines.length < 2 || !lines.every((l) => l.trim().startsWith('•'))
    })
    if (needsReformat.length === 0) {
      setMessage('All food cards are already in bullet format!')
      setTimeout(() => setMessage(null), 3000)
      return
    }
    const confirmed = window.confirm(
      `Reformat ${needsReformat.length} food card backs to bullet-point format?\n\nThis uses AI to convert comma-separated text into clean • bullet lists. Existing content is preserved.\n\nThis will take several minutes.`
    )
    if (!confirmed) return

    setQuizGenProgress({ done: 0, total: needsReformat.length, current: '' })
    let updated = 0
    let unchanged = 0
    let failed = 0

    for (let i = 0; i < needsReformat.length; i++) {
      const card = needsReformat[i]
      setQuizGenProgress({ done: i, total: needsReformat.length, current: card.front })

      try {
        const newBack = await reformatCardBackToBullets(card.front, card.back)
        if (newBack && newBack.trim() !== card.back.trim()) {
          await updateFlashcard(card.id, { back: newBack.trim(), updatedAt: new Date().toISOString() })
          setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, back: newBack.trim() } : c)))
          updated++
        } else {
          unchanged++
        }
      } catch (_) {
        failed++
      }

      if (i < needsReformat.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    setQuizGenProgress(null)
    setMessage(
      `Reformat complete: ${updated} cards updated, ${unchanged} already formatted, ${failed} failed.`
    )
    setTimeout(() => setMessage(null), 6000)
  }

  async function handleCreateFromOrphan(orphan) {
    setOrphanCreating(orphan._idx)
    try {
      const ref = await createFlashcard({
        front: orphan.q, back: orphan.a, setId: orphan.setId,
        category: 'Menu', status: 'active', source: 'orphan-recovery',
        quizApproved: false, updatedAt: new Date().toISOString(),
      })
      setCards((prev) => [...prev, { id: ref.id, front: orphan.q, back: orphan.a, setId: orphan.setId, category: 'Menu', status: 'active', source: 'orphan-recovery', quizApproved: false }])
      {
        const next = new Set(dismissedOrphans); next.add(orphan._idx)
        persistDismissedOrphans(next)
      }
      setMessage('Flashcard created! Generating quiz question...')
      const orphanSiblingBacks = cards.filter((c) => c.setId === orphan.setId && c.back).map((c) => c.back)
      autoGenerateQuizForCard(orphan.q, orphan.a, orphanSiblingBacks)
        .then(async (quizData) => {
          if (quizData) {
            await updateFlashcard(ref.id, { quizData, quizApproved: false, updatedAt: new Date().toISOString() })
            setCards((prev) => prev.map((c) => (c.id === ref.id ? { ...c, quizData, quizApproved: false } : c)))
            setMessage('Flashcard created with quiz question — pending approval.')
          } else {
            setMessage('Flashcard created. Quiz generation failed — try "Generate Missing Quizzes" later.')
          }
          setTimeout(() => setMessage(null), 4000)
        })
        .catch(() => {
          setMessage('Flashcard created. Quiz generation failed — try "Generate Missing Quizzes" later.')
          setTimeout(() => setMessage(null), 4000)
        })
    } catch (e) {
      setMessage('Error creating flashcard: ' + e.message)
      setTimeout(() => setMessage(null), 4000)
    } finally {
      setOrphanCreating(null)
    }
  }

  async function handleCreateAllOrphans() {
    if (remainingOrphans.length === 0) return
    if (!window.confirm(`Create ${remainingOrphans.length} flashcards from orphaned questions? You can generate quiz questions afterward with "Generate Missing Quizzes".`)) return
    let succeeded = 0, failed = 0
    const newDismissed = new Set(dismissedOrphans)
    setQuizGenProgress({ done: 0, total: remainingOrphans.length, current: '' })
    for (let i = 0; i < remainingOrphans.length; i++) {
      const orphan = remainingOrphans[i]
      setQuizGenProgress({ done: i, total: remainingOrphans.length, current: orphan.q })
      try {
        const ref = await createFlashcard({
          front: orphan.q, back: orphan.a, setId: orphan.setId,
          category: 'Menu', status: 'active', source: 'orphan-recovery',
          quizApproved: false, updatedAt: new Date().toISOString(),
        })
        setCards((prev) => [...prev, { id: ref.id, front: orphan.q, back: orphan.a, setId: orphan.setId, category: 'Menu', status: 'active', source: 'orphan-recovery', quizApproved: false }])
        newDismissed.add(orphan._idx)
        succeeded++
      } catch {
        failed++
      }
    }
    persistDismissedOrphans(newDismissed)
    setQuizGenProgress(null)
    setMessage(`Created ${succeeded} flashcards (${failed} failed). Use "Generate Missing Quizzes" to add quiz questions, then approve them.`)
    setTimeout(() => setMessage(null), 6000)
  }

  function handleDismissOrphan(idx) {
    const next = new Set(dismissedOrphans); next.add(idx)
    persistDismissedOrphans(next)
  }

  async function handleFixExternalImages() {
    const external = cards.filter((c) => c.imageUrl && !isFirebaseStorageUrl(c.imageUrl))
    if (external.length === 0) {
      setMessage('All images are already stored in Firebase!')
      setTimeout(() => setMessage(null), 3000)
      return
    }
    if (
      !window.confirm(
        `Found ${external.length} cards with external image URLs. Store them permanently in Firebase Storage?`
      )
    )
      return
    let fixed = 0
    let failed = 0
    for (const card of external) {
      try {
        const newUrl = await downloadAndStoreImage(card.imageUrl, card.id)
        if (newUrl !== card.imageUrl) {
          await updateFlashcard(card.id, {
            imageUrl: newUrl,
            updatedAt: new Date().toISOString(),
          })
          setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, imageUrl: newUrl } : c)))
          fixed++
        }
      } catch (_) {
        failed++
      }
    }
    setMessage(`Image migration: ${fixed} stored, ${failed} failed.`)
    setTimeout(() => setMessage(null), 5000)
  }

  function handleFixAndRestore(alert) {
    const cardId = alert.cardId || alert.id
    const card = cards.find((c) => c.id === cardId)
    // If card exists locally, edit it; otherwise build a synthetic card from alert data
    const editCard = card || {
      id: cardId,
      front: alert.front || '',
      back: alert.back || '',
      setId: alert.setId || (sets[0]?.id || ''),
      imageUrl: null,
      status: 'quarantined',
    }
    setEditQueue([editCard])
    setEditQueueIndex(0)
    setMessage(
      'Editing card "' + (alert.front || editCard.front || '') + '" — save your changes to restore it.'
    )
  }

  async function handleDismissAlert(alert) {
    try {
      const cardId = alert.cardId || alert.id
      const card = cards.find((c) => c.id === cardId)
      // Only update the flashcard if it exists locally; it may have been deleted
      if (card) {
        await updateFlashcard(cardId, {
          status: 'active',
          updatedAt: new Date().toISOString(),
        })
        setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: 'active' } : c)))
      }
      await deleteFlag(alert.id)
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
      setMessage('Alert dismissed.')
      setTimeout(() => setMessage(null), 2000)
    } catch (e) {
      setMessage('Error dismissing: ' + e.message)
    }
  }

  async function handleDeleteCardFromAlert(alert) {
    if (!window.confirm('Permanently delete "' + (alert.front || '') + '"? This cannot be undone.')) return
    try {
      const cardId = alert.cardId || alert.id
      const card = cards.find((c) => c.id === cardId)
      // Only delete the flashcard if it exists; it may already be gone
      if (card) {
        await deleteFlashcard(cardId)
        setCards((prev) => prev.filter((c) => c.id !== cardId))
      }
      await deleteFlag(alert.id)
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
      setMessage(card ? 'Card permanently deleted.' : 'Alert removed (card was already deleted).')
      setTimeout(() => setMessage(null), 2000)
    } catch (e) {
      setMessage('Error: ' + e.message)
    }
  }

  return (
    <>
      <AppHeader title="Flashcard Manager" />
      <OwnerNavBar />
      <main className="max-w-5xl mx-auto p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
        {/* Row 1: Title + action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flashcard Manager</h1>
            <p className="text-sm text-gray-600">
              {cards.filter((c) => c.status === 'active').length} active cards across {sets.length} sets
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-small" onClick={() => setAddingCard(true)}>
              + Add card
            </button>
            <button type="button" className="btn btn-small" onClick={() => setShowGenerator(true)}>
              AI Generate
            </button>
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={handleRebuildAllQuizzes}
              disabled={quizGenProgress !== null}
              title="Rewrites all quiz questions so the correct answer exactly matches the flashcard back. Run this once after updating card content."
            >
              Rebuild Quiz Questions
            </button>
            {duplicateGroups.length > 0 && (
              <button
                type="button"
                className={`btn btn-small ${showDuplicates ? 'ring-2 ring-offset-2 ring-orange-500 bg-orange-50' : 'btn-secondary'}`}
                onClick={() => setShowDuplicates(!showDuplicates)}
              >
                🔍 Duplicates ({duplicateGroups.reduce((n, g) => n + g.length, 0) - duplicateGroups.length})
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Search bar — full width */}
        <div className="mb-4">
          <input
            type="search"
            placeholder="Search cards by front, back, or set…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm placeholder-gray-400 focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
          />
        </div>

        {/* Row 3: Select mode + set filter tabs + graveyard toggle */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`btn btn-small ${selectMode ? 'ring-2 ring-offset-2 ring-green-600 bg-green-50' : 'btn-secondary'}`}
            onClick={() => {
              if (selectMode) {
                setSelectMode(false)
                setSelectedIds(new Set())
              } else {
                setSelectMode(true)
              }
            }}
          >
            {selectMode ? `✓ Selecting (${selectedIds.size})` : '☐ Select'}
          </button>
          <button
            type="button"
            className="btn btn-small btn-secondary"
            onClick={() => {
              const emptyIds = new Set(
                cards
                  .filter((c) => c.status !== 'graveyarded' && (!c.front || !c.front.trim()))
                  .map((c) => c.id)
              )
              setSelectedIds(emptyIds)
              setSelectMode(true)
            }}
          >
            Select Empty (
            {cards.filter((c) => c.status !== 'graveyarded' && (!c.front || !c.front.trim())).length})
          </button>
          <div className="h-6 w-px bg-gray-200 mx-1" />
          <button
            type="button"
            className={`btn btn-small ${selectedSet === 'all' ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : 'btn-secondary'}`}
            onClick={() => setSelectedSet('all')}
          >
            All ({cards.filter((c) => (showGraveyard ? c.status === 'graveyarded' : c.status !== 'graveyarded')).length})
          </button>
          {sets.map((set) => (
            <button
              key={set.id}
              type="button"
              className={`btn btn-small ${selectedSet === set.id ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : 'btn-secondary'}`}
              onClick={() => setSelectedSet(set.id)}
            >
              {set.title} ({setCounts[set.id] ?? 0})
            </button>
          ))}
          <div className="ml-auto">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showGraveyard} onChange={(e) => setShowGraveyard(e.target.checked)} />
              <span className="text-sm text-gray-600">Show graveyard</span>
            </label>
          </div>
        </div>

        {/* Row 4: Bulk actions when cards selected */}
        {selectedIds.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
            <span className="text-sm font-semibold text-blue-800">
              {selectedIds.size} card{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setSelectedIds(new Set(filtered.map((c) => c.id)))}
            >
              Select All Visible ({filtered.length})
            </button>
            <button type="button" className="btn btn-small btn-secondary" onClick={() => setSelectedIds(new Set())}>
              Clear Selection
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
              onClick={handleBulkGraveyard}
            >
              🗑 Graveyard Selected ({selectedIds.size})
            </button>
            <button type="button" className="btn btn-small" onClick={handleBulkEdit}>
              ✏️ Edit Selected ({selectedIds.size})
            </button>
          </div>
        )}

        {quizGenProgress && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-blue-800">
                Generating: {quizGenProgress.done}/{quizGenProgress.total}
              </span>
              <span className="text-xs text-blue-600 truncate max-w-xs">{quizGenProgress.current}</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${quizGenProgress.total ? (quizGenProgress.done / quizGenProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* message displayed in the status bar below */}

        {/* Duplicate Cards */}
        {showDuplicates && duplicateGroups.length > 0 && (
          <div className="mb-4 rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-orange-800 flex items-center gap-2">
                🔍 Duplicate Cards ({duplicateGroups.length} group{duplicateGroups.length !== 1 ? 's' : ''}, {duplicateGroups.reduce((n, g) => n + g.length, 0)} cards total)
              </h3>
              <button
                type="button"
                className="text-xs text-orange-600 hover:text-orange-800 underline"
                onClick={() => setShowDuplicates(false)}
              >
                Hide
              </button>
            </div>
            <p className="text-xs text-orange-600 mb-3">Cards with identical front text (ignoring case/punctuation). Keep the best version and graveyard the rest.</p>
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {duplicateGroups.map((group, gi) => (
                <div key={gi} className="rounded-lg border border-orange-200 bg-white p-3">
                  <p className="text-xs font-bold text-orange-700 mb-2">
                    &quot;{group[0].front}&quot;
                    <span className="font-normal text-orange-500 ml-2">({group.length} copies)</span>
                  </p>
                  <div className="space-y-2">
                    {group.map((card) => (
                      <div key={card.id} className="flex items-start gap-3 p-2 rounded-lg border border-gray-100 bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-orange-100 text-orange-600">{card.setId}</span>
                            {card.source && card.source !== 'hardcoded' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-600">{card.source}</span>
                            )}
                            {card.quizData?.q && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-green-50 text-green-600">has quiz</span>
                            )}
                            {card.imageUrl && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-600">has image</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{(card.back || '').slice(0, 150)}{(card.back || '').length > 150 ? '...' : ''}</p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            type="button"
                            className="px-2 py-1 text-[11px] rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                            onClick={() => { setEditQueue([card]); setEditQueueIndex(0) }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-[11px] rounded bg-red-50 text-red-600 hover:bg-red-100"
                            onClick={() => handleGraveyardCard(card.id)}
                          >
                            Graveyard
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content Alerts */}
        <div id="content-alerts" className="mb-6">
          {alertsLoading && (
            <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-sm">Loading content alerts…</div>
          )}
          {!alertsLoading && alerts.length > 0 && (
            <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-red-800 flex items-center gap-2">
                  ⚠️ Content Alerts ({alerts.length})
                </h3>
                <p className="text-xs text-red-600">Quarantined cards are hidden from trainees until resolved.</p>
              </div>
              <div className="space-y-3">
                {alerts.map((alert, idx) => (
                  <div key={alert.id} className="bg-white rounded-lg border border-red-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-800">{alert.front || 'Unknown card'}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-700">{alert.setId || ''}</span>
                          {alert.flagType === 'quiz' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold">Quiz Flag</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1 italic">&quot;{(alert.back || '').slice(0, 200)}{(alert.back || '').length > 200 ? '…' : ''}&quot;</p>
                        {alert.flagType === 'quiz' && alert.quizQuestion && (
                          <div className="mt-2 p-2 rounded bg-purple-50 border border-purple-100">
                            <p className="text-xs font-semibold text-purple-900 mb-1">Quiz Question:</p>
                            <p className="text-xs text-gray-800 mb-1">{alert.quizQuestion}</p>
                            {Array.isArray(alert.quizOptions) && alert.quizOptions.length > 0 && (
                              <div className="space-y-0.5 mb-1">
                                {alert.quizOptions.map((opt, i) => {
                                  const isCorrect = opt === alert.quizCorrectAnswer
                                  const isChosen = opt === alert.selectedAnswer
                                  let cls = 'text-gray-600'
                                  if (isCorrect) cls = 'font-bold text-green-700'
                                  else if (isChosen) cls = 'font-bold text-red-600'
                                  return (
                                    <p key={i} className={`text-xs ${cls}`}>
                                      {String.fromCharCode(65 + i)}. {opt}
                                      {isCorrect && ' (correct)'}
                                      {isChosen && !isCorrect && ' (trainee chose)'}
                                    </p>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mt-2 p-2 rounded bg-red-50 border border-red-100">
                          <p className="text-xs text-red-800">
                            <strong>Reporter:</strong> {alert.reportedBy || 'Unknown'}
                          </p>
                          <p className="text-xs text-red-700 mt-0.5">
                            <strong>Issue:</strong> {alert.reason || 'No reason given'}
                          </p>
                          <p className="text-[10px] text-red-400 mt-0.5">
                            {alert.reportedAt ? new Date(alert.reportedAt).toLocaleDateString() : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
                        onClick={() => handleFixAndRestore(alert)}
                      >
                        ✏️ Fix & Restore
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                        onClick={() => handleDismissAlert(alert)}
                      >
                        Dismiss (Not an error)
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition"
                        onClick={() => handleDeleteCardFromAlert(alert)}
                      >
                        🗑️ Delete card permanently
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!alertsLoading && alerts.length === 0 && chatbotFlags.filter((f) => !f.resolved).length === 0 && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2">
              {message || '✅ All clear — no reported content issues.'}
            </div>
          )}
          {message && (alertsLoading || alerts.length > 0 || chatbotFlags.filter((f) => !f.resolved).length > 0) && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">{message}</div>
          )}

          {/* Pending Quiz Approval */}
          {(() => {
            const pendingApproval = cards.filter((c) => c.status === 'active' && c.quizApproved === false && c.quizData?.q)
            if (pendingApproval.length === 0) return null
            return (
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-blue-800 flex items-center gap-2">
                    📋 Pending Quiz Approval ({pendingApproval.length})
                  </h3>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                    onClick={async () => {
                      const ids = pendingApproval.map((c) => c.id)
                      await batchUpdateFlashcards(ids, { quizApproved: true, updatedAt: new Date().toISOString() })
                      setCards((prev) => prev.map((c) => ids.includes(c.id) ? { ...c, quizApproved: true } : c))
                      setMessage(`Approved ${ids.length} quiz questions.`)
                      setTimeout(() => setMessage(null), 3000)
                    }}
                  >
                    Approve All ({pendingApproval.length})
                  </button>
                </div>
                <p className="text-xs text-blue-600 mb-3">AI-generated quiz questions awaiting review. Approved questions appear in practice and official tests.</p>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {pendingApproval.map((card) => (
                    <div key={card.id} className="bg-white rounded-lg border border-blue-100 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-800 text-sm">{card.front || 'Unknown card'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700">{card.setId || ''}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{(card.back || '').slice(0, 120)}{(card.back || '').length > 120 ? '...' : ''}</p>
                          <div className="mt-2 p-2 rounded bg-gray-50 border border-gray-100">
                            <p className="text-sm font-medium text-gray-800">{card.quizData.q}</p>
                            <div className="mt-1 space-y-0.5">
                              {(card.quizData.opts || []).map((opt, i) => (
                                <p key={i} className={`text-xs ${i === card.quizData.ans ? 'font-bold text-green-700' : 'text-gray-600'}`}>
                                  {String.fromCharCode(65 + i)}. {opt} {i === card.quizData.ans ? ' ✓' : ''}
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
                          onClick={async () => {
                            await updateFlashcard(card.id, { quizApproved: true, updatedAt: new Date().toISOString() })
                            setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, quizApproved: true } : c))
                            setMessage('Quiz question approved!')
                            setTimeout(() => setMessage(null), 2000)
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                          onClick={() => {
                            setEditQueue([card])
                            setEditQueueIndex(0)
                          }}
                        >
                          Edit & Approve
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition"
                          onClick={async () => {
                            await updateFlashcard(card.id, { quizData: null, quizApproved: false, updatedAt: new Date().toISOString() })
                            setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, quizData: null, quizApproved: false } : c))
                            setMessage('Quiz question rejected — card moved to missing quiz list.')
                            setTimeout(() => setMessage(null), 3000)
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Missing Quiz Questions */}
          {(() => {
            const missingQuiz = cards.filter((c) => c.status === 'active' && c.front && c.back && (!c.quizData || !c.quizData.q))
            const failedFlags = alerts.filter((a) => a.reason === 'quiz_generation_failed')
            if (missingQuiz.length === 0 && failedFlags.length === 0) return null
            return (
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-amber-800 flex items-center gap-2">
                    🧪 Missing Quiz Questions ({missingQuiz.length})
                  </h3>
                </div>
                <p className="text-xs text-amber-600 mb-3">Active cards without quiz questions. These won't appear in practice or official tests.</p>
                {failedFlags.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {failedFlags.map((flag) => (
                      <div key={flag.id} className="bg-white rounded-lg border border-red-100 p-3 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-bold text-red-700">Generation Failed:</span>
                          <span className="text-xs text-gray-700 ml-1">{flag.front || 'Unknown card'}</span>
                        </div>
                        <button
                          type="button"
                          className="px-2 py-1 text-xs font-medium rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition"
                          onClick={async () => {
                            const card = cards.find((c) => c.id === flag.cardId)
                            if (!card) return
                            setMessage('Retrying quiz generation...')
                            try {
                              const retrySiblingBacks = cards.filter((c) => c.setId === card.setId && c.id !== card.id && c.back).map((c) => c.back)
                              const quizData = await autoGenerateQuizForCard(card.front, card.back, retrySiblingBacks)
                              if (quizData) {
                                await updateFlashcard(card.id, { quizData, quizApproved: false, updatedAt: new Date().toISOString() })
                                setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, quizData, quizApproved: false } : c))
                                await deleteFlag(flag.id)
                                setAlerts((prev) => prev.filter((a) => a.id !== flag.id))
                                setMessage('Quiz generated — pending approval.')
                              } else {
                                setMessage('Generation failed again.')
                              }
                            } catch (_) {
                              setMessage('Generation failed again.')
                            }
                            setTimeout(() => setMessage(null), 3000)
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {missingQuiz.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {missingQuiz.slice(0, 20).map((card) => (
                      <div key={card.id} className="bg-white rounded-lg border border-amber-100 p-3 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-gray-800">{card.front}</span>
                          <span className="text-[10px] ml-1 text-gray-400">{card.setId}</span>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition"
                            onClick={async () => {
                              setMessage('Generating quiz for ' + card.front + '...')
                              try {
                                const singleSiblingBacks = cards.filter((c) => c.setId === card.setId && c.id !== card.id && c.back).map((c) => c.back)
                                const quizData = await autoGenerateQuizForCard(card.front, card.back, singleSiblingBacks)
                                if (quizData) {
                                  await updateFlashcard(card.id, { quizData, quizApproved: false, updatedAt: new Date().toISOString() })
                                  setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, quizData, quizApproved: false } : c))
                                  setMessage('Quiz generated — pending approval.')
                                } else {
                                  setMessage('Generation failed — AI returned empty result.')
                                }
                              } catch (err) {
                                setMessage('Generation failed: ' + (err?.message || 'unknown error'))
                              }
                              setTimeout(() => setMessage(null), 4000)
                            }}
                          >
                            Generate Quiz
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                            onClick={async () => {
                              await updateFlashcard(card.id, { status: 'graveyarded', updatedAt: new Date().toISOString() })
                              setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, status: 'graveyarded' } : c))
                              setMessage('Card archived.')
                              setTimeout(() => setMessage(null), 2000)
                            }}
                          >
                            Archive
                          </button>
                        </div>
                      </div>
                    ))}
                    {missingQuiz.length > 20 && (
                      <p className="text-xs text-amber-600 text-center">...and {missingQuiz.length - 20} more. Use "Generate Missing Quizzes" button above.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Orphaned Questions */}
          {remainingOrphans.length > 0 && (
            <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-violet-800 flex items-center gap-2">
                  📦 Orphaned Questions ({remainingOrphans.length})
                </h3>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
                  onClick={handleCreateAllOrphans}
                  disabled={quizGenProgress !== null}
                >
                  Create All Flashcards ({remainingOrphans.length})
                </button>
              </div>
              <p className="text-xs text-violet-600 mb-3">
                Legacy quiz questions with no matching flashcard. Create a flashcard to reinstate them in quizzes.
              </p>
              {Object.entries(
                remainingOrphans.reduce((groups, o) => {
                  const key = o.testId
                  if (!groups[key]) groups[key] = { title: ORPHAN_TEST_TITLES[key] || key, items: [] }
                  groups[key].items.push(o)
                  return groups
                }, {})
              ).map(([testId, group]) => (
                <div key={testId} className="mb-4">
                  <h4 className="text-xs font-bold text-violet-700 mb-2 flex items-center gap-2">
                    {group.title}
                    <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-violet-100 text-violet-600">{testId}</span>
                    <span className="text-[10px] font-normal text-violet-500">({group.items.length})</span>
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {group.items.map((orphan) => (
                      <div key={orphan._idx} className="bg-white rounded-lg border border-violet-100 p-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{orphan.q}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{orphan.a}</p>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-violet-50 text-violet-500 mt-1 inline-block">{orphan.setId}</span>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs font-medium rounded bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-50"
                            onClick={() => handleCreateFromOrphan(orphan)}
                            disabled={orphanCreating === orphan._idx}
                          >
                            {orphanCreating === orphan._idx ? 'Creating...' : 'Create Flashcard'}
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
                            onClick={() => handleDismissOrphan(orphan._idx)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Chatbot Flags */}
          {chatbotFlags.filter((f) => !f.resolved).length > 0 && (
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-amber-800 flex items-center gap-2">
                  🚩 Chatbot Flags ({chatbotFlags.filter((f) => !f.resolved).length})
                </h3>
                <p className="text-xs text-amber-600">Trainees flagged these chatbot responses as incorrect or confusing.</p>
              </div>
              <div className="space-y-3">
                {chatbotFlags.filter((f) => !f.resolved).map((flag) => (
                  <div key={flag.id} className="bg-white rounded-lg border border-amber-100 p-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800">{flag.traineeName || flag.traineeId || 'Unknown'}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">{flag.flagReason || 'Flagged'}</span>
                        <span className="text-[10px] text-gray-400">
                          {flag.flaggedAt ? new Date(flag.flaggedAt?.toMillis?.() || flag.flaggedAt).toLocaleDateString() : ''}
                        </span>
                      </div>

                      {editingFlagId === flag.id ? (
                        <div className="mt-2 space-y-2">
                          <label className="block text-xs font-semibold text-gray-700">Corrected response:</label>
                          <textarea
                            value={editingFlagText}
                            onChange={(e) => setEditingFlagText(e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-y"
                          />
                          <label className="block text-xs font-semibold text-gray-700">Note (optional):</label>
                          <input
                            type="text"
                            value={editingFlagNote}
                            onChange={(e) => setEditingFlagNote(e.target.value)}
                            placeholder="e.g. Updated pricing, fixed ingredient list..."
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
                              onClick={async (e) => {
                                const btn = e.currentTarget
                                btn.disabled = true
                                btn.textContent = 'Saving...'
                                try {
                                  await resolveChatbotFlag(flag.id, currentUser?.name || 'admin', {
                                    correctedText: editingFlagText.trim(),
                                    resolvedNote: editingFlagNote.trim() || null,
                                  })
                                  setEditingFlagId(null)
                                } catch (err) {
                                  console.error('Resolve chatbot flag error:', err)
                                  alert('Failed to save: ' + (err?.message || err))
                                  btn.disabled = false
                                  btn.textContent = 'Save & Resolve'
                                }
                              }}
                            >
                              Save & Resolve
                            </button>
                            <button
                              type="button"
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                              onClick={() => setEditingFlagId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600 mt-1 italic border-l-2 border-amber-200 pl-3">
                          &quot;{(flag.messageText || '').slice(0, 300)}{(flag.messageText || '').length > 300 ? '...' : ''}&quot;
                        </p>
                      )}
                    </div>

                    {editingFlagId !== flag.id && (
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                          onClick={() => {
                            setEditingFlagId(flag.id)
                            setEditingFlagText(flag.messageText || '')
                            setEditingFlagNote('')
                          }}
                        >
                          Edit & Resolve
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                          onClick={async (e) => {
                            const btn = e.currentTarget
                            btn.disabled = true
                            btn.textContent = 'Resolving...'
                            try {
                              await resolveChatbotFlag(flag.id, currentUser?.name || 'admin')
                              setEditingFlagId(null)
                            } catch (err) {
                              console.error('Resolve chatbot flag error:', err)
                              alert('Failed to resolve: ' + (err?.message || err))
                              btn.disabled = false
                              btn.textContent = 'Dismiss'
                            }
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading flashcards…</div>
        ) : sets.length === 0 && cards.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p className="font-medium text-amber-900">No flashcard sets or cards found.</p>
            <p className="text-sm text-amber-800 mt-2">
              If you expect data, run the seed function to migrate cards to Firestore: deploy{' '}
              <code className="bg-amber-100 px-1 rounded">functions:seedFlashcardsToFirestore</code> then call it once
              (e.g. via Firebase console or curl). The page reads from the <code className="bg-amber-100 px-1 rounded">flashcards</code> and{' '}
              <code className="bg-amber-100 px-1 rounded">flashcardSets</code> collections.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((card) => (
              <div
                key={card.id}
                data-card-id={card.id}
                className={`group flex items-start gap-3 p-4 rounded-xl border transition-all hover:shadow-md ${
                  card.status === 'graveyarded' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-100 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(card.id)}
                  onChange={(e) => {
                    e.stopPropagation()
                    setSelectedIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(card.id)) next.delete(card.id)
                      else next.add(card.id)
                      return next
                    })
                  }}
                  className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0 mt-0.5 cursor-pointer"
                  aria-label={selectedIds.has(card.id) ? `Deselect ${card.front}` : `Select ${card.front}`}
                />
                {card.imageUrl ? (
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                    <img
                      src={card.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-gray-300 text-lg" aria-hidden>📷</span>
                  </div>
                )}

                {editingCard === card.id ? (
                  <EditCardForm card={card} onSave={async (id, updates) => {
                    try { await handleSaveCard(id, updates) } catch (e) {
                      setMessage('Error saving: ' + (e?.message || 'Unknown error'))
                      setTimeout(() => setMessage(null), 4000)
                    }
                  }} onCancel={() => setEditingCard(null)} sets={sets}
                  orphanCards={cards.filter((c) => c.status !== 'graveyarded' && isImageOnly(c))} />
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 text-sm">{card.front || '(no text)'}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">{card.setId}</span>
                      {card.source && card.source !== 'hardcoded' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-600">{card.source}</span>
                      )}
                      {isImageOnly(card) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                          📷 Image only
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {(card.back || '').substring(0, 120)}
                      {(card.back || '').length > 120 ? '…' : ''}
                    </p>
                  </div>
                )}

                {editingCard !== card.id && (
                  <div className="flex gap-1 flex-shrink-0 flex-wrap items-center">
                    {isImageOnly(card) && (
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAttachModal({ sourceCard: card })
                          setAttachSearch('')
                          setAttachResults([])
                        }}
                      >
                        📎 Attach to card…
                      </button>
                    )}
                    <button
                      type="button"
                      className="px-2 py-1 text-[11px] rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                      onClick={() => setEditingCard(card.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 text-[11px] rounded bg-red-50 text-red-600 hover:bg-red-100"
                      onClick={() => handleGraveyardCard(card.id)}
                    >
                      {card.status === 'graveyarded' ? 'Restore' : 'Graveyard'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && <div className="text-center text-gray-400 py-12">No cards found.</div>}
          </div>
        )}

        </div>

        {addingCard && <AddCardModal sets={sets} onSave={handleAddCard} onCancel={() => setAddingCard(false)} />}

        {showGenerator && (
          <FlashcardGeneratorModal
            open={showGenerator}
            onClose={() => setShowGenerator(false)}
            sets={sets}
            onCardCreated={(newCard) => {
              setCards((prev) => [...prev, newCard])
            }}
          />
        )}

        {/* Attach orphan image to card modal */}
        {attachModal && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => { setAttachModal(null); setAttachSearch(''); setAttachResults([]) }}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 text-center border-b border-gray-100">
                <div className="inline-block rounded-2xl overflow-hidden shadow-lg shadow-black/10 border-4 border-white mb-4">
                  <img
                    src={attachModal.sourceCard.imageUrl}
                    alt="Orphan image"
                    className="w-28 h-28 object-cover"
                  />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Attach This Image</h3>
                <p className="text-sm text-gray-500 mt-1">Search for a flashcard to add this image to</p>
              </div>

              <div className="p-4">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                    placeholder="Search flashcards by name…"
                    value={attachSearch}
                    onChange={(e) => {
                      const query = e.target.value
                      setAttachSearch(query)
                      if (query.trim().length >= 2) {
                        const q = query.toLowerCase()
                        const matches = cards
                          .filter(
                            (c) =>
                              c.id !== attachModal.sourceCard.id &&
                              c.status !== 'graveyarded' &&
                              c.front &&
                              c.front.trim() &&
                              ((c.front || '').toLowerCase().includes(q) || (c.back || '').toLowerCase().includes(q))
                          )
                          .slice(0, 8)
                        setAttachResults(matches)
                      } else {
                        setAttachResults([])
                      }
                    }}
                    autoFocus
                  />
                </div>
              </div>

              {attachError && (
                <div className="mx-4 mb-2 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">{attachError}</div>
              )}
              {attachLoading && (
                <div className="mx-4 mb-2 p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">Attaching image...</div>
              )}

              <div className="max-h-72 overflow-y-auto px-4 pb-2">
                {attachSearch.trim().length >= 2 && attachResults.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-400">No matching cards found</p>
                  </div>
                )}
                {attachResults.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`w-full flex items-center gap-3 p-3 mb-2 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-all text-left group ${attachLoading ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={() => handleAttachImage(attachModal.sourceCard, card)}
                    disabled={attachLoading}
                  >
                    <div className="w-11 h-11 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
                      {card.imageUrl ? (
                        <img src={card.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">📷</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{card.front}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {card.setId} • {card.imageUrl ? 'Has image (will replace)' : 'No image'}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="text-blue-600 text-xs font-semibold bg-blue-50 px-2.5 py-1 rounded-lg">
                        {card.imageUrl ? 'Replace' : 'Add'} →
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                <button
                  type="button"
                  onClick={() => { setAttachModal(null); setAttachSearch(''); setAttachResults([]); setAttachError(null) }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  disabled={attachLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit queue modal */}
        {editQueue.length > 0 && editQueue[editQueueIndex] && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-gray-800">
                  Editing {editQueueIndex + 1} of {editQueue.length}
                </h3>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600 text-xl"
                  onClick={() => {
                    setEditQueue([])
                    setEditQueueIndex(0)
                  }}
                >
                  ✕
                </button>
              </div>
              {queueMessage && (
                <div className={`mb-3 p-2 rounded-lg text-xs ${
                  queueMessage.type === 'error'
                    ? 'bg-red-50 border border-red-200 text-red-700'
                    : 'bg-green-50 border border-green-200 text-green-700'
                }`}>{queueMessage.text}</div>
              )}
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-4">
                <div
                  className="bg-green-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${((editQueueIndex + 1) / editQueue.length) * 100}%` }}
                />
              </div>
              <EditCardForm
                card={editQueue[editQueueIndex]}
                sets={sets}
                orphanCards={cards.filter((c) => c.status !== 'graveyarded' && isImageOnly(c))}
                isLastInQueue={editQueueIndex >= editQueue.length - 1}
                onSave={async (id, updates) => {
                  setQueueMessage(null)
                  try {
                    await handleSaveCard(id, updates)
                    setEditQueueIndex((prev) => {
                      if (prev < editQueue.length - 1) {
                        setQueueMessage({ type: 'success', text: 'Saved!' })
                        setTimeout(() => setQueueMessage(null), 2000)
                        return prev + 1
                      }
                      setEditQueue([])
                      setQueueMessage(null)
                      return 0
                    })
                  } catch (e) {
                    console.error('Queue save error:', e)
                    setQueueMessage({ type: 'error', text: 'Error saving: ' + (e?.message || 'Unknown error') })
                  }
                }}
                onCancel={null}
                onSkip={() => {
                  setEditQueueIndex((prev) => {
                    if (prev < editQueue.length - 1) return prev + 1
                    setEditQueue([])
                    return 0
                  })
                }}
                onGraveyard={async () => {
                  const cardId = editQueue[editQueueIndex].id
                  await handleGraveyardCard(cardId)
                  // Also dismiss any content alerts for this card
                  const cardAlerts = alerts.filter((a) => (a.cardId || a.id) === cardId)
                  for (const a of cardAlerts) {
                    try {
                      await deleteFlag(a.id)
                    } catch (_) {}
                  }
                  if (cardAlerts.length > 0) {
                    setAlerts((prev) => prev.filter((a) => (a.cardId || a.id) !== cardId))
                  }
                  setEditQueueIndex((prev) => {
                    if (prev < editQueue.length - 1) return prev + 1
                    setEditQueue([])
                    return 0
                  })
                }}
              />
              <div className="flex justify-between mt-4">
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  disabled={editQueueIndex === 0}
                  onClick={() => setEditQueueIndex(editQueueIndex - 1)}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={() => {
                    if (editQueueIndex < editQueue.length - 1) setEditQueueIndex(editQueueIndex + 1)
                    else {
                      setEditQueue([])
                      setEditQueueIndex(0)
                    }
                  }}
                >
                  {editQueueIndex < editQueue.length - 1 ? 'Skip →' : 'Done'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}

function EditCardForm({ card, onSave, onCancel, sets, onSkip, onGraveyard, orphanCards = [], isLastInQueue }) {
  const [front, setFront] = useState(card?.front || '')
  const [back, setBack] = useState(card?.back || '')
  const [setId, setSetId] = useState(card?.setId || '')
  const [imageUrl, setImageUrl] = useState(card?.imageUrl || '')
  const [imageOpen, setImageOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [imageSearch, setImageSearch] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    setFront(card?.front || '')
    setBack(card?.back || '')
    setSetId(card?.setId || '')
    setImageUrl(card?.imageUrl || '')
    setImageOpen(false)
    setSaving(false)
    setUrlInput('')
    setImageSearch('')
  }, [card?.id])

  const imageSearchResults = useMemo(() => {
    if (!orphanCards.length) return []
    if (!imageSearch.trim()) return orphanCards.slice(0, 20)
    const q = imageSearch.toLowerCase()
    return orphanCards
      .filter((o) => {
        if ((o.front || '').toLowerCase().includes(q)) return true
        if ((o.imageUrl || '').toLowerCase().includes(q)) return true
        return false
      })
      .slice(0, 20)
  }, [imageSearch, orphanCards])

  function handleDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  async function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) await handleFileUpload(file)
  }

  async function handleFileUpload(file) {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const url = await uploadFileToStorage(file, card?.id || 'upload')
      setImageUrl(url)
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  function handleUrlPaste() {
    const url = urlInput.trim()
    if (url && url.startsWith('http')) {
      setImageUrl(url)
      setUrlInput('')
    }
  }

  const queueMode = onSkip != null

  return (
    <div className="flex-1 space-y-2">
      <input
        type="text"
        value={front}
        onChange={(e) => setFront(e.target.value)}
        className="input input-sm w-full rounded border border-gray-300 px-2 py-1"
        placeholder="Front text"
      />
      <textarea
        value={back}
        onChange={(e) => setBack(e.target.value)}
        className="input input-sm w-full h-20 resize-y rounded border border-gray-300 px-2 py-1"
        placeholder="Back text"
      />
      <div className="flex gap-2 items-center">
        <select
          value={setId}
          onChange={(e) => setSetId(e.target.value)}
          className="input input-sm rounded border border-gray-300 px-2 py-1"
        >
          {sets.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      </div>

      {/* Action buttons — placed before image panel so they're always visible */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="btn btn-small"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await onSave(card.id, { front, back, setId, imageUrl: imageUrl || null })
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Saving...' : queueMode && !isLastInQueue ? 'Save & Next' : 'Save'}
        </button>
        {queueMode && (
          <>
            <button type="button" className="btn btn-small btn-secondary" onClick={onSkip}>
              Skip
            </button>
            <button
              type="button"
              className="btn btn-small"
              style={{ background: '#dc2626', color: 'white' }}
              onClick={onGraveyard}
            >
              Graveyard
            </button>
          </>
        )}
        {!queueMode && onCancel && (
          <button type="button" className="btn btn-small btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      {/* Collapsible Image Panel */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition text-left text-sm"
          onClick={() => setImageOpen(!imageOpen)}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
          ) : (
            <span className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0 text-xs">?</span>
          )}
          <span className="flex-1 font-medium text-gray-700">
            {imageUrl ? 'Image attached' : 'No image'} {imageOpen ? '(collapse)' : '(expand)'}
          </span>
          <span className="text-gray-400">{imageOpen ? '\u25B2' : '\u25BC'}</span>
        </button>

        {imageOpen && (
          <div className="p-3 space-y-3 border-t border-gray-100">
            {/* Current image preview */}
            {imageUrl && (
              <div className="flex items-center gap-3">
                <img src={imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" onError={(e) => { e.target.style.display = 'none' }} />
                <button type="button" className="text-xs text-red-500 hover:text-red-700" onClick={() => setImageUrl('')}>
                  Remove image
                </button>
              </div>
            )}

            {/* Drag & drop zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all text-xs ${
                dragActive ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
              } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]) }}
              />
              {uploading ? (
                <span className="text-gray-500">Uploading...</span>
              ) : (
                <span className="text-gray-500">Drop image here or click to browse</span>
              )}
            </div>

            {/* URL paste input */}
            <div className="flex gap-1">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleUrlPaste() } }}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                placeholder="Paste image URL..."
              />
              <button type="button" className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600" onClick={handleUrlPaste}>
                Set
              </button>
            </div>

            {/* Search available images */}
            {orphanCards.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Search available images ({orphanCards.length})</p>
                <input
                  type="text"
                  value={imageSearch}
                  onChange={(e) => setImageSearch(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs mb-2"
                  placeholder="Search by name, category, or keyword..."
                />
                {imageSearch.trim() && imageSearchResults.length === 0 && (
                  <p className="text-[10px] text-gray-400 mb-1">No images match &ldquo;{imageSearch}&rdquo;</p>
                )}
                {imageSearchResults.length > 0 && (
                  <div className="flex gap-2 flex-wrap max-h-40 overflow-y-auto p-1">
                    {imageSearchResults.map((orphan) => (
                      <button
                        key={orphan.id}
                        type="button"
                        title={orphan.front || 'Click to use this image'}
                        onClick={() => { setImageUrl(orphan.imageUrl); setImageSearch('') }}
                        className="relative group"
                      >
                        <img
                          src={orphan.imageUrl}
                          alt={orphan.front || ''}
                          className="w-14 h-14 rounded-lg object-cover border-2 border-gray-200 hover:border-blue-500 transition shadow-sm"
                          onError={(e) => { e.target.parentElement.style.display = 'none' }}
                        />
                      </button>
                    ))}
                    {imageSearchResults.length >= 20 && !imageSearch.trim() && (
                      <p className="w-full text-[10px] text-gray-400 mt-1">Type to filter — showing first 20 of {orphanCards.length}</p>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>

    </div>
  )
}

function AddCardModal({ sets, onSave, onCancel }) {
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [setId, setSetId] = useState(sets[0]?.id || '')
  const [imageUrl, setImageUrl] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
        <h3 className="font-bold text-gray-800 mb-4">Add New Flashcard</h3>
        <div className="space-y-3">
          <input
            type="text"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            className="input w-full rounded border border-gray-300 px-3 py-2"
            placeholder="Front (item name)"
          />
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            className="input w-full h-24 resize-y rounded border border-gray-300 px-3 py-2"
            placeholder="Back (description/details)"
          />
          <select
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
            className="input w-full rounded border border-gray-300 px-3 py-2"
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="input w-full rounded border border-gray-300 px-3 py-2"
            placeholder="Image URL (optional)"
          />
        </div>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            className="btn"
            onClick={() =>
              onSave({
                front,
                back,
                setId,
                category: sets.find((s) => s.id === setId)?.category || 'Menu',
                imageUrl: imageUrl || null,
              })
            }
            disabled={!front.trim()}
          >
            Add Card
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
