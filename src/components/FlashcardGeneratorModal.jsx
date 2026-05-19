import { useState, useRef, useEffect } from 'react'
import { useGemini } from '../contexts/GeminiContext'
import { createFlashcard, updateFlashcard } from '../services/flashcardService'
import { autoGenerateQuizForCard } from '../services/ai'

const CATEGORIES = [
  { id: 'steaks-specialties', label: 'Steaks & Specialties' },
  { id: 'starters-soups-salads', label: 'Starters, Soups & Salads' },
  { id: 'bar-beer', label: 'Bar & Beer' },
  { id: 'wines-cocktails', label: 'Wine & Cocktails' },
  { id: 'bonus-points', label: 'Bonus / Other' },
]

const STEPS = ['name', 'category', 'details', 'review']

export default function FlashcardGeneratorModal({ open, onClose, sets, onCardCreated }) {
  const { callGeminiJSON, isConfigured } = useGemini()
  const [step, setStep] = useState('name')
  const [itemName, setItemName] = useState('')
  const [category, setCategory] = useState('')
  const [details, setDetails] = useState({ description: '', ingredients: '', price: '', notes: '' })
  const [generatedCard, setGeneratedCard] = useState(null) // { front, back }
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [editSetId, setEditSetId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState(null)
  const [messages, setMessages] = useState([]) // chat-style messages
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (open) {
      setStep('name')
      setItemName('')
      setCategory('')
      setDetails({ description: '', ingredients: '', price: '', notes: '' })
      setGeneratedCard(null)
      setEditFront('')
      setEditBack('')
      setEditSetId(sets?.[0]?.id || '')
      setGenerating(false)
      setPublishing(false)
      setError(null)
      setMessages([{ role: 'ai', text: 'What menu item would you like to create a flashcard for?' }])
    }
  }, [open, sets])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function addMessage(role, text) {
    setMessages((prev) => [...prev, { role, text }])
  }

  function handleNameSubmit() {
    if (!itemName.trim()) return
    addMessage('user', itemName.trim())
    addMessage('ai', `Got it — "${itemName.trim()}". Which category does this belong to?`)
    setStep('category')
  }

  function handleCategorySelect(cat) {
    setCategory(cat.id)
    const matchingSet = sets.find((s) => s.id === cat.id)
    if (matchingSet) setEditSetId(matchingSet.id)
    addMessage('user', cat.label)
    addMessage('ai', `Now tell me about "${itemName.trim()}". Fill in what you know — AI will fill the gaps.`)
    setStep('details')
  }

  async function handleGenerateCard() {
    setGenerating(true)
    setError(null)
    addMessage('user', 'Generate the flashcard')

    const detailParts = []
    if (details.description) detailParts.push(`Description: ${details.description}`)
    if (details.ingredients) detailParts.push(`Ingredients: ${details.ingredients}`)
    if (details.price) detailParts.push(`Price: ${details.price}`)
    if (details.notes) detailParts.push(`Notes: ${details.notes}`)
    const detailText = detailParts.join('\n') || 'No details provided — use your restaurant knowledge.'

    try {
      const result = await callGeminiJSON(
        `You are a restaurant training flashcard creator. Generate a flashcard for a server to study.

MENU ITEM: "${itemName.trim()}"
CATEGORY: ${category || 'unknown'}
DETAILS PROVIDED:
${detailText}

Create a flashcard with:
- "front": The item name (short, what a server would search for)
- "back": 2-4 sentences covering: what it is, key ingredients, preparation notes, sides, allergens, and any upsell tips. Be specific and practical for a server memorizing the menu.

Return JSON: { "front": "...", "back": "..." }`,
        { temperature: 0.4, maxTokens: 800 }
      )

      if (result?.front && result?.back) {
        setGeneratedCard(result)
        setEditFront(result.front)
        setEditBack(result.back)
        addMessage('ai', 'Card generated! Review and edit below, then publish when ready.')
        setStep('review')
      } else {
        throw new Error('AI returned invalid card format')
      }
    } catch (err) {
      setError(err.message)
      addMessage('ai', `Generation failed: ${err.message}. You can try again or enter the card details manually.`)
    } finally {
      setGenerating(false)
    }
  }

  async function handlePublish() {
    if (!editFront.trim() || !editBack.trim()) return
    setPublishing(true)
    setError(null)

    try {
      // Create the flashcard
      const ref = await createFlashcard({
        front: editFront.trim(),
        back: editBack.trim(),
        setId: editSetId,
        status: 'active',
        source: 'ai_chat',
        updatedAt: new Date().toISOString(),
      })

      addMessage('ai', 'Card published! Generating quiz question...')

      // Auto-generate quiz question
      let quizData = null
      try {
        quizData = await autoGenerateQuizForCard(editFront.trim(), editBack.trim())
        if (quizData) {
          await updateFlashcard(ref.id, { quizData, updatedAt: new Date().toISOString() })
          addMessage('ai', 'Quiz question generated and attached! Card is ready for testing.')
        } else {
          addMessage('ai', 'Card published but quiz generation failed. You can generate it later from the Flashcard Manager.')
        }
      } catch (_) {
        addMessage('ai', 'Card published but quiz generation failed.')
      }

      onCardCreated?.({
        id: ref.id,
        front: editFront.trim(),
        back: editBack.trim(),
        setId: editSetId,
        status: 'active',
        source: 'ai_chat',
        quizData,
      })

      // Reset for next card after brief delay
      setTimeout(() => {
        setStep('name')
        setItemName('')
        setCategory('')
        setDetails({ description: '', ingredients: '', price: '', notes: '' })
        setGeneratedCard(null)
        setEditFront('')
        setEditBack('')
        setMessages((prev) => [...prev, { role: 'ai', text: 'Want to create another card? Type the next item name, or close this dialog.' }])
      }, 1500)
    } catch (err) {
      setError(err.message)
      addMessage('ai', `Publish failed: ${err.message}`)
    } finally {
      setPublishing(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">AI Card Generator</h3>
            <p className="text-xs text-gray-500">Chat-guided flashcard creation</p>
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-600 text-xl" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-0">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-[var(--color-primary)] text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input area based on step */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          {step === 'name' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                placeholder="e.g. Budweiser, NY Strip, Caesar Salad..."
                autoFocus
              />
              <button
                type="button"
                className="btn btn-small"
                onClick={handleNameSubmit}
                disabled={!itemName.trim()}
              >
                Next
              </button>
            </div>
          )}

          {step === 'category' && (
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:border-[var(--color-primary)] hover:bg-green-50 transition"
                  onClick={() => handleCategorySelect(cat)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-2">
              <input
                type="text"
                value={details.description}
                onChange={(e) => setDetails((d) => ({ ...d, description: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Brief description (e.g. 12oz bone-in ribeye, grilled)"
              />
              <input
                type="text"
                value={details.ingredients}
                onChange={(e) => setDetails((d) => ({ ...d, ingredients: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Key ingredients / sides (e.g. garlic butter, baked potato)"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={details.price}
                  onChange={(e) => setDetails((d) => ({ ...d, price: e.target.value }))}
                  className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Price"
                />
                <input
                  type="text"
                  value={details.notes}
                  onChange={(e) => setDetails((d) => ({ ...d, notes: e.target.value }))}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Allergens, upsell tips, etc."
                />
              </div>
              <button
                type="button"
                className="btn w-full"
                onClick={handleGenerateCard}
                disabled={generating || !isConfigured}
              >
                {generating ? 'Generating...' : 'Generate Flashcard'}
              </button>
              {!isConfigured && (
                <p className="text-xs text-red-500 text-center">Gemini API key not configured. Set it in Admin settings.</p>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-2">
              <input
                type="text"
                value={editFront}
                onChange={(e) => setEditFront(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold"
                placeholder="Front (item name)"
              />
              <textarea
                value={editBack}
                onChange={(e) => setEditBack(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm h-24 resize-y"
                placeholder="Back (details)"
              />
              <div className="flex gap-2">
                <select
                  value={editSetId}
                  onChange={(e) => setEditSetId(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {(sets || []).map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn flex-1"
                  onClick={handlePublish}
                  disabled={publishing || !editFront.trim() || !editBack.trim()}
                >
                  {publishing ? 'Publishing...' : 'Publish Card + Quiz'}
                </button>
              </div>
              <button
                type="button"
                className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
                onClick={() => {
                  addMessage('ai', 'Let me try again. Provide more details if you want a different result.')
                  setStep('details')
                }}
              >
                Regenerate
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 mt-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
