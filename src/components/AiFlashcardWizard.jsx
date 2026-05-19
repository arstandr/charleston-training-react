import { useState, useCallback, useRef } from 'react'
import { generateMenuItemFlashcard, autoGenerateQuizForCard } from '../services/ai'
import {
  collection,
  addDoc,
  setDoc,
  doc,
  updateDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'menuStudio'

/**
 * AI Flashcard Generation Wizard — item selection → per-item qualifying/generation → batch review → publish.
 */
export default function AiFlashcardWizard({ open, onClose, items, flashcardSets, onPublished }) {
  // Phase: select-items | qualifying | generating | preview | batch-review | publishing | done
  const [phase, setPhase] = useState('select-items')

  // Item selection
  const [selectedItemIds, setSelectedItemIds] = useState(new Set())
  const [selectSearch, setSelectSearch] = useState('')

  // Per-item iteration
  const [currentIdx, setCurrentIdx] = useState(0) // index into selectedItems (not items)
  const [userNotes, setUserNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [previewFront, setPreviewFront] = useState('')
  const [previewBack, setPreviewBack] = useState('')

  // Approved cards
  const approvedRef = useRef([]) // ref to avoid stale closure
  const [approvedCards, setApprovedCards] = useState([])

  // Batch review
  const [selectedDeck, setSelectedDeck] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishedCount, setPublishedCount] = useState(0)

  // Derived: items the user selected, in order
  const selectedItems = items.filter((i) => selectedItemIds.has(i.id))
  const currentItem = selectedItems[currentIdx] || null
  const totalSelected = selectedItems.length

  const reset = useCallback(() => {
    setPhase('select-items')
    setSelectedItemIds(new Set())
    setSelectSearch('')
    setCurrentIdx(0)
    setUserNotes('')
    setGenerating(false)
    setError(null)
    setPreviewFront('')
    setPreviewBack('')
    approvedRef.current = []
    setApprovedCards([])
    setSelectedDeck('')
    setPublishing(false)
    setPublishedCount(0)
  }, [])

  function handleClose() {
    reset()
    onClose()
  }

  // --- Item selection ---
  function toggleItem(id) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedItemIds(new Set(items.map((i) => i.id)))
  }

  function deselectAll() {
    setSelectedItemIds(new Set())
  }

  function startGeneration() {
    if (selectedItemIds.size === 0) return
    setCurrentIdx(0)
    setUserNotes('')
    setError(null)
    setPhase('qualifying')
  }

  // --- Per-item flow ---
  function advanceToNext() {
    const next = currentIdx + 1
    if (next >= totalSelected) {
      // All selected items processed
      if (approvedRef.current.length > 0) {
        setPhase('batch-review')
      } else {
        setPhase('done')
        setPublishedCount(0)
      }
    } else {
      setCurrentIdx(next)
      setPhase('qualifying')
      setUserNotes('')
      setError(null)
      setPreviewFront('')
      setPreviewBack('')
    }
  }

  function handleSkip() {
    advanceToNext()
  }

  async function handleGenerate() {
    if (!currentItem) return
    setPhase('generating')
    setGenerating(true)
    setError(null)

    try {
      const result = await generateMenuItemFlashcard(
        currentItem.name,
        currentItem.description || '',
        currentItem.price,
        currentItem.category || '',
        currentItem.subcategory || currentItem.category || '',
        userNotes.trim()
      )
      if (result?.front && result?.back) {
        setPreviewFront(result.front)
        setPreviewBack(result.back)
        setPhase('preview')
      } else {
        setError('AI returned an empty card. Try adding more details or skip this item.')
        setPhase('qualifying')
      }
    } catch (e) {
      setError(e.message || 'Generation failed')
      setPhase('qualifying')
    } finally {
      setGenerating(false)
    }
  }

  function findImageForCard(item, allItems) {
    if (item.imageUrl || item.image) return item.imageUrl || item.image
    const f = (item.name || '').toLowerCase()
    const match = allItems.find(
      (i) => i.id !== item.id && i.imageUrl && (f.includes((i.name || '').toLowerCase()) || (i.name || '').toLowerCase().includes(f))
    )
    return match?.imageUrl || null
  }

  function handleApprove() {
    const imageUrl = findImageForCard(currentItem, items)
    const newCard = {
      front: previewFront,
      back: previewBack,
      imageUrl,
      itemId: currentItem.id || null,
      itemName: currentItem.name,
      category: currentItem.category || 'Menu',
    }
    approvedRef.current = [...approvedRef.current, newCard]
    setApprovedCards(approvedRef.current)
    advanceToNext()
  }

  function handleRemoveCard(idx) {
    approvedRef.current = approvedRef.current.filter((_, i) => i !== idx)
    setApprovedCards([...approvedRef.current])
  }

  function handleEditCard(idx, field, value) {
    setApprovedCards((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)))
    approvedRef.current = approvedRef.current.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
  }

  // --- Publish ---
  async function handlePublishAll() {
    if (!selectedDeck || approvedCards.length === 0) return
    setPublishing(true)
    setError(null)
    let published = 0
    const deckCategory = flashcardSets.find((s) => s.id === selectedDeck)?.category || 'Menu'

    try {
      for (const card of approvedCards) {
        const mainCardRef = await addDoc(collection(db, 'flashcards'), {
          front: card.front,
          back: card.back || '',
          setId: selectedDeck,
          category: deckCategory,
          imageUrl: card.imageUrl || null,
          toastGuid: null,
          status: 'active',
          source: 'ai-menu-studio',
          cardType: 'standard',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        published++

        await setDoc(doc(db, 'flashcardSets', selectedDeck), { cardCount: increment(1), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {})

        await addDoc(collection(db, 'flashcards'), {
          front: card.back || '',
          back: card.front,
          setId: selectedDeck,
          category: deckCategory,
          imageUrl: card.imageUrl || null,
          toastGuid: null,
          status: 'active',
          source: 'ai-menu-studio',
          cardType: 'reverse',
          linkedTo: mainCardRef.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        published++

        await setDoc(doc(db, 'flashcardSets', selectedDeck), { cardCount: increment(1), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {})

        if (card.itemId) {
          try {
            await updateDoc(doc(db, COLLECTION, card.itemId), {
              hasFlashcards: true,
              flashcardsUpdatedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          } catch (_) {}
        }

        try {
          const quiz = await autoGenerateQuizForCard(card.front, card.back)
          if (quiz) {
            await updateDoc(doc(db, 'flashcards', mainCardRef.id), { quizData: quiz, updatedAt: serverTimestamp() })
          }
        } catch (_) {}
      }

      setPublishedCount(approvedCards.length)
      setPhase('done')
      onPublished?.(approvedCards.length)
    } catch (e) {
      console.error('[AiWizard] Publish error:', e)
      setError(e.message || 'Publishing failed')
    } finally {
      setPublishing(false)
    }
  }

  if (!open) return null

  // Filtered items for selection search
  const filteredForSelect = selectSearch.trim()
    ? items.filter((i) => (i.name || '').toLowerCase().includes(selectSearch.toLowerCase()))
    : items

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">
              {phase === 'select-items' ? 'Select Items' : phase === 'batch-review' ? 'Review & Publish' : phase === 'done' ? 'Complete' : 'AI Flashcard Generator'}
            </h3>
            {phase === 'select-items' && (
              <p className="text-xs text-gray-500">{selectedItemIds.size} of {items.length} selected</p>
            )}
            {(phase === 'qualifying' || phase === 'generating' || phase === 'preview') && totalSelected > 0 && (
              <p className="text-xs text-gray-500">Item {currentIdx + 1} of {totalSelected}</p>
            )}
            {phase === 'batch-review' && (
              <p className="text-xs text-gray-500">{approvedCards.length} card{approvedCards.length !== 1 ? 's' : ''} ready</p>
            )}
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-600 text-xl" onClick={handleClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Progress bar (during per-item phases) */}
        {(phase === 'qualifying' || phase === 'generating' || phase === 'preview') && totalSelected > 0 && (
          <div className="h-1.5 bg-gray-100">
            <div
              className="h-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${Math.min(100, (currentIdx / totalSelected) * 100)}%` }}
            />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">

          {/* SELECT ITEMS PHASE */}
          {phase === 'select-items' && (
            <div>
              <p className="text-sm text-gray-600 mb-3">Pick which items you want to create flashcards for:</p>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                placeholder="Search items..."
                value={selectSearch}
                onChange={(e) => setSelectSearch(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2 mb-3">
                <button type="button" className="text-xs text-[var(--color-primary)] font-medium hover:underline" onClick={selectAll}>
                  Select all
                </button>
                <span className="text-gray-300">|</span>
                <button type="button" className="text-xs text-gray-500 font-medium hover:underline" onClick={deselectAll}>
                  Deselect all
                </button>
              </div>
              <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                {filteredForSelect.map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                      selectedItemIds.has(item.id) ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedItemIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-200 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-800">{item.name}</span>
                      {item.category && <span className="ml-2 text-xs text-gray-400">{item.category}</span>}
                    </div>
                  </label>
                ))}
                {filteredForSelect.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No items match your search.</p>
                )}
              </div>
            </div>
          )}

          {/* QUALIFYING PHASE */}
          {phase === 'qualifying' && currentItem && (
            <div>
              <div className="flex gap-4 mb-5">
                {currentItem.imageUrl ? (
                  <img
                    src={currentItem.imageUrl}
                    alt=""
                    className="w-24 h-24 rounded-xl object-cover flex-shrink-0"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400 text-xs">
                    No image
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="font-bold text-gray-800 text-lg">{currentItem.name}</h4>
                  {currentItem.category && (
                    <p className="text-sm text-gray-500">Category: {currentItem.category}</p>
                  )}
                  {currentItem.price && (
                    <p className="text-sm text-gray-500">Price: ${currentItem.price}</p>
                  )}
                  {currentItem.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-3">{currentItem.description}</p>
                  )}
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">
                What do you want me to know about {currentItem.name}?
              </label>
              <textarea
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent resize-y"
                rows={3}
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="e.g. comes with 2 sides, 8oz portion, gluten-free option available, popular upsell is the loaded version..."
                autoFocus
              />

              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </div>
          )}

          {/* GENERATING PHASE */}
          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-gray-200 border-t-[var(--color-primary)] rounded-full animate-spin mb-4" />
              <p className="text-gray-600 text-sm">Generating flashcard for <strong>{currentItem?.name}</strong>...</p>
            </div>
          )}

          {/* PREVIEW PHASE */}
          {phase === 'preview' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Front</label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold mb-4 focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                value={previewFront}
                onChange={(e) => setPreviewFront(e.target.value)}
              />

              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Back</label>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm h-40 resize-y focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                value={previewBack}
                onChange={(e) => setPreviewBack(e.target.value)}
              />

              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </div>
          )}

          {/* BATCH REVIEW PHASE */}
          {phase === 'batch-review' && (
            <div>
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Choose a deck <span className="text-red-500">*</span>
                </label>
                <select
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${
                    !selectedDeck ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                  value={selectedDeck}
                  onChange={(e) => setSelectedDeck(e.target.value)}
                >
                  <option value="">-- Pick a deck --</option>
                  {flashcardSets.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
                {!selectedDeck && (
                  <p className="text-xs text-red-500 mt-1">Select a deck before publishing.</p>
                )}
              </div>

              {approvedCards.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No cards to review. All items were skipped.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {approvedCards.map((card, idx) => (
                    <div key={idx} className="rounded-xl border border-gray-200 p-3 relative">
                      <button
                        type="button"
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs hover:bg-red-200"
                        onClick={() => handleRemoveCard(idx)}
                        aria-label="Remove card"
                      >
                        &times;
                      </button>
                      {card.imageUrl && (
                        <img src={card.imageUrl} alt="" className="w-full h-24 object-cover rounded-lg mb-2" onError={(e) => { e.target.style.display = 'none' }} />
                      )}
                      <input
                        type="text"
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-semibold mb-1"
                        value={card.front}
                        onChange={(e) => handleEditCard(idx, 'front', e.target.value)}
                      />
                      <textarea
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs h-20 resize-y"
                        value={card.back}
                        onChange={(e) => handleEditCard(idx, 'back', e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            </div>
          )}

          {/* DONE PHASE */}
          {phase === 'done' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="text-4xl mb-3">&#10003;</div>
              <h4 className="text-lg font-bold text-gray-800 mb-1">
                {publishedCount > 0 ? `Published ${publishedCount} card${publishedCount !== 1 ? 's' : ''}!` : 'All done!'}
              </h4>
              <p className="text-sm text-gray-500">
                {publishedCount > 0
                  ? 'Standard + reverse pairs and quiz questions have been created.'
                  : 'No cards were approved in this session.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/50 flex items-center justify-between gap-3">
          {phase === 'select-items' && (
            <>
              <button type="button" className="btn btn-secondary btn-small" onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={startGeneration}
                disabled={selectedItemIds.size === 0}
              >
                Continue ({selectedItemIds.size}) &rarr;
              </button>
            </>
          )}

          {phase === 'qualifying' && (
            <>
              <button type="button" className="btn btn-secondary btn-small" onClick={handleSkip}>
                Skip
              </button>
              <button type="button" className="btn btn-small" onClick={handleGenerate}>
                Generate &rarr;
              </button>
            </>
          )}

          {phase === 'generating' && (
            <span className="text-sm text-gray-500">Please wait...</span>
          )}

          {phase === 'preview' && (
            <>
              <button type="button" className="btn btn-secondary btn-small" onClick={handleSkip}>
                Skip
              </button>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary btn-small" onClick={handleGenerate} disabled={generating}>
                  Regenerate
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={handleApprove}
                  disabled={!previewFront.trim() || !previewBack.trim()}
                >
                  Approve &rarr;
                </button>
              </div>
            </>
          )}

          {phase === 'batch-review' && (
            <>
              <button type="button" className="btn btn-secondary btn-small" onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={handlePublishAll}
                disabled={publishing || !selectedDeck || approvedCards.length === 0}
              >
                {publishing ? 'Publishing...' : `Publish All (${approvedCards.length})`}
              </button>
            </>
          )}

          {phase === 'done' && (
            <button type="button" className="btn btn-small ml-auto" onClick={handleClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
