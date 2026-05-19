import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ref, listAll, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase'
import {
  getAllFlashcards, getAllFlashcardSets, updateFlashcard,
  deleteFlashcard, batchDeleteFlashcards,
} from '../services/flashcardService'
import { getAllMenuStudioItems } from '../services/menuStudioService'
import { uploadFileToStorage } from '../services/imageService'
const MIN_CONTENT_LENGTH = 3

const SET_ID_COLORS = [
  'bg-emerald-100 text-emerald-800',
  'bg-blue-100 text-blue-800',
  'bg-amber-100 text-amber-800',
  'bg-purple-100 text-purple-800',
  'bg-rose-100 text-rose-800',
  'bg-sky-100 text-sky-800',
]

function normalizeFront(text) {
  return (text || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
}

function setDisplayName(setId, setTitles) {
  if (!setId) return '—'
  if (setTitles && setTitles[setId]) return setTitles[setId]
  return setId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function setBadgeColor(setId) {
  if (!setId) return SET_ID_COLORS[0]
  let n = 0
  for (let i = 0; i < setId.length; i++) n += setId.charCodeAt(i)
  return SET_ID_COLORS[Math.abs(n) % SET_ID_COLORS.length]
}

function formatCardBack(text) {
  if (!text || !String(text).trim()) return null
  const raw = String(text).trim()
  const lines = raw.split(/\n/)
  return (
    <div className="text-sm text-gray-700">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <br key={i} />
        const isBullet = /^[•·\-*]\s*/.test(trimmed)
        const content = trimmed.replace(/^[•·\-*]\s*/, '').trim() || trimmed
        if (isBullet) {
          return (
            <div key={i} className="flex gap-2 mt-1">
              <span className="text-gray-500 flex-shrink-0">•</span>
              <span>{content}</span>
            </div>
          )
        }
        return <div key={i} className="mt-1">{trimmed}</div>
      })}
    </div>
  )
}

function CardDisplay({ card, setTitles, compareWith, label, editable, onSaveCard, onImageClick }) {
  const [editingField, setEditingField] = useState(null)
  const [draft, setDraft] = useState('')
  const hasImage = !!(card.imageUrl && card.imageUrl.trim())
  const otherHasImage = compareWith && !!(compareWith.imageUrl && compareWith.imageUrl.trim())
  const imageDiff = compareWith && hasImage !== otherHasImage
  const frontDiff = compareWith && (card.front || '').trim() !== (compareWith.front || '').trim()
  const backDiff = compareWith && (card.back || '').trim() !== (compareWith.back || '').trim()
  const setDiff = compareWith && (card.setId || '') !== (compareWith.setId || '')

  const saveFront = useCallback(() => {
    if (editingField !== 'front' || !onSaveCard) return
    const trimmed = (draft || '').trim()
    onSaveCard(card.id, { front: trimmed || '' }).then(() => setEditingField(null))
  }, [editingField, draft, onSaveCard, card.id])

  const saveBack = useCallback(() => {
    if (editingField !== 'back' || !onSaveCard) return
    onSaveCard(card.id, { back: (draft || '').trim() || '' }).then(() => setEditingField(null))
  }, [editingField, draft, onSaveCard, card.id])

  const startEditFront = () => {
    if (!editable || !onSaveCard) return
    setEditingField('front')
    setDraft((card.front || '').trim())
  }
  const startEditBack = () => {
    if (!editable || !onSaveCard) return
    setEditingField('back')
    setDraft((card.back || '').trim())
  }

  return (
    <div className={`rounded-xl border-2 bg-white overflow-hidden ${imageDiff || frontDiff || backDiff || setDiff ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}>
      {label && (
        <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-500 uppercase">{label}</span>
        </div>
      )}
      <div className="p-4">
        {editingField === 'front' ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveFront}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveFront() } }}
            className="w-full font-bold text-gray-900 mb-2 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] outline-none"
            placeholder="Front / title"
            autoFocus
          />
        ) : (
          <h3
            className={`font-bold text-gray-900 mb-2 break-words ${frontDiff ? 'bg-amber-50 -mx-2 px-2 py-1 rounded' : ''} ${editable ? 'cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1' : ''}`}
            onClick={startEditFront}
            title={editable ? 'Click to edit' : undefined}
          >
            {(card.front || '').trim() || '(empty)'}
          </h3>
        )}
        {editingField === 'back' ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveBack}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveBack() } }}
            className="w-full text-sm text-gray-700 mb-3 min-h-[4rem] px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] outline-none resize-y"
            placeholder="Back / description"
            autoFocus
          />
        ) : (
          <div
            className={`mb-3 min-h-[2rem] ${backDiff ? 'bg-amber-50 -mx-2 px-2 py-1 rounded' : ''} ${editable ? 'cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1' : ''}`}
            onClick={startEditBack}
            title={editable ? 'Click to edit' : undefined}
          >
            {formatCardBack(card.back) || <span className="text-gray-400 italic">No back content</span>}
          </div>
        )}
        <div className="mb-3">
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${setBadgeColor(card.setId)} ${setDiff ? 'ring-2 ring-amber-400' : ''}`}>
            {setDisplayName(card.setId, setTitles)}
          </span>
        </div>
        <div
          className={`mt-2 ${imageDiff ? 'ring-2 ring-amber-400 rounded-lg p-1' : ''} ${onImageClick ? 'cursor-pointer' : ''}`}
          onClick={onImageClick ? () => onImageClick(card) : undefined}
          role={onImageClick ? 'button' : undefined}
          title={onImageClick ? 'Click to change image' : undefined}
        >
          {hasImage ? (
            <img src={card.imageUrl} alt="" className="w-full h-28 object-cover rounded-lg bg-gray-100" />
          ) : (
            <div className="w-full h-28 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-medium hover:bg-gray-200 transition-colors">
              {onImageClick ? 'No image — click to add' : 'No image'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FlashcardCleanupModal({ isOpen, onClose, onActionComplete }) {
  const [activeTab, setActiveTab] = useState('duplicates')
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState({ total: 0, completed: 0 })
  const [initialTotals, setInitialTotals] = useState(null)

  // Duplicates
  const [duplicatePairs, setDuplicatePairs] = useState([])
  const [duplicateIndex, setDuplicateIndex] = useState(0)
  const [duplicateBusy, setDuplicateBusy] = useState(false)

  // Empty cards
  const [emptyCards, setEmptyCards] = useState([])
  const [emptySkipped, setEmptySkipped] = useState(new Set())
  const [emptyBusy, setEmptyBusy] = useState(false)

  // Missing images
  const [missingImageCards, setMissingImageCards] = useState([])
  const [missingImageSkipped, setMissingImageSkipped] = useState(new Set())
  const [missingImageBusy, setMissingImageBusy] = useState(false)

  // Orphan images
  const [orphanImages, setOrphanImages] = useState([])
  const [orphanRemoved, setOrphanRemoved] = useState(new Set())
  const [orphanBusy, setOrphanBusy] = useState(false)
  const [attachPickerCardId, setAttachPickerCardId] = useState(null)
  const [allCardsForPicker, setAllCardsForPicker] = useState([])
  const [setTitles, setSetTitles] = useState({})
  const [savedToast, setSavedToast] = useState(null)
  const [imagePickerForCardId, setImagePickerForCardId] = useState(null)
  const imageFileInputRef = useRef(null)
  const [showImagePickerModal, setShowImagePickerModal] = useState(false)
  const [imagePickerSearch, setImagePickerSearch] = useState('')

  const loadAllData = useCallback(async () => {
    if (!isOpen) return
    setLoading(true)
    try {
      const [allCards, menuItems, setsList] = await Promise.all([
        getAllFlashcards(),
        getAllMenuStudioItems(),
        getAllFlashcardSets(),
      ])
      const titles = {}
      setsList.forEach((s) => {
        if (s.id && s.title) titles[s.id] = s.title
      })
      setSetTitles(titles)
      const activeCards = allCards.filter((c) => c.status !== 'graveyarded')

      const keyToIds = {}
      activeCards.forEach((c) => {
        const key = normalizeFront(c.front)
        if (!key) return
        if (!keyToIds[key]) keyToIds[key] = []
        keyToIds[key].push(c.id)
      })
      const pairs = []
      Object.values(keyToIds).forEach((ids) => {
        const uniq = [...new Set(ids)]
        for (let i = 0; i < uniq.length; i++) {
          for (let j = i + 1; j < uniq.length; j++) {
            const a = activeCards.find((c) => c.id === uniq[i])
            const b = activeCards.find((c) => c.id === uniq[j])
            if (a && b) pairs.push({ a, b })
          }
        }
      })
      setDuplicatePairs(pairs)
      setDuplicateIndex(0)

      const empty = activeCards.filter((c) => {
        const f = (c.front || '').trim()
        const b = (c.back || '').trim()
        return !f || !b || f.length < MIN_CONTENT_LENGTH || b.length < MIN_CONTENT_LENGTH
      })
      setEmptyCards(empty)
      setEmptySkipped(new Set())

      const withFront = activeCards.filter((c) => (c.front || '').trim().length >= MIN_CONTENT_LENGTH)
      const noImage = withFront.filter((c) => !c.imageUrl || !c.imageUrl.trim())
      const menuWithImage = menuItems.filter((i) => i.imageUrl || i.image)
      const normalize = (t) => normalizeFront(t)
      const missingWithSuggestion = noImage.map((card) => {
        const cardNorm = normalize(card.front)
        const match = menuWithImage.find((m) => {
          const name = m.name || m.posName || m.displayName || m.title || m.front || ''
          return cardNorm && normalize(name) === cardNorm
        })
        return {
          card,
          suggestedImage: match ? (match.imageUrl || match.image || match.imageUrlLarge || match.highResImage || '').trim() : null,
          menuItemName: match ? (match.name || match.posName || match.displayName || match.title || '') : null,
        }
      })
      setMissingImageCards(missingWithSuggestion)
      setMissingImageSkipped(new Set())

      const referencedUrls = new Set()
      activeCards.forEach((c) => {
        if (c.imageUrl) referencedUrls.add(c.imageUrl)
      })
      menuItems.forEach((m) => {
        const u = m.imageUrl || m.image
        if (u) referencedUrls.add(u)
      })

      const listRef = ref(storage, 'menu-images')
      let storageItems = []
      try {
        const result = await listAll(listRef)
        storageItems = result.items || []
      } catch (_) {
        storageItems = []
      }
      const orphanList = []
      for (const itemRef of storageItems) {
        try {
          const url = await getDownloadURL(itemRef)
          if (!referencedUrls.has(url)) {
            orphanList.push({ fullPath: itemRef.fullPath, ref: itemRef, url })
          }
        } catch (_) {}
      }
      setOrphanImages(orphanList)
      setOrphanRemoved(new Set())
      setAllCardsForPicker(activeCards.filter((c) => c.setId))
      setInitialTotals({
        duplicates: pairs.length,
        empty: empty.length,
        missingImages: missingWithSuggestion.length,
        orphanImages: orphanList.length,
      })
    } catch (e) {
      console.error('Flashcard cleanup load failed', e)
    } finally {
      setLoading(false)
    }
  }, [isOpen])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  useEffect(() => {
    const init = initialTotals || { duplicates: 0, empty: 0, missingImages: 0, orphanImages: 0 }
    const dupResolved = init.duplicates - duplicatePairs.length
    const emptyResolved = init.empty - emptyCards.length + emptySkipped.size
    const missingResolved = missingImageSkipped.size + (init.missingImages - missingImageCards.length)
    const orphanResolved = init.orphanImages - orphanImages.length + orphanRemoved.size

    const total = init.duplicates + init.empty + init.missingImages + init.orphanImages
    const completed = dupResolved + emptyResolved + missingResolved + orphanResolved
    setProgress({ total: Math.max(total, 1), completed: Math.min(completed, total) })
  }, [
    initialTotals,
    duplicatePairs.length,
    emptyCards.length,
    emptySkipped.size,
    missingImageCards.length,
    missingImageSkipped.size,
    orphanImages.length,
    orphanRemoved.size,
  ])

  const notifyAction = () => {
    onActionComplete?.()
  }

  const showSavedToast = useCallback(() => {
    setSavedToast('Saved')
    setTimeout(() => setSavedToast(null), 2500)
  }, [])

  const updateCardInState = useCallback((cardId, updates) => {
    setDuplicatePairs((prev) =>
      prev.map((pair) => ({
        a: pair.a.id === cardId ? { ...pair.a, ...updates } : pair.a,
        b: pair.b.id === cardId ? { ...pair.b, ...updates } : pair.b,
      }))
    )
    setEmptyCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, ...updates } : c)))
    setMissingImageCards((prev) =>
      prev.map((e) => (e.card.id === cardId ? { ...e, card: { ...e.card, ...updates } } : e))
    )
  }, [])

  const handleSaveCard = useCallback(
    async (cardId, updates) => {
      try {
        await updateFlashcard(cardId, { ...updates, updatedAt: new Date().toISOString() })
        updateCardInState(cardId, updates)
        showSavedToast()
      } catch (e) {
        console.error('Save card failed', e)
      }
    },
    [updateCardInState, showSavedToast]
  )

  const handleImageClick = useCallback((card) => {
    setImagePickerForCardId(card.id)
    setShowImagePickerModal(true)
    setImagePickerSearch('')
  }, [])

  const handleImageFileSelected = useCallback(
    async (ev) => {
      const file = ev.target.files?.[0]
      const cardId = imagePickerForCardId
      ev.target.value = ''
      setImagePickerForCardId(null)
      if (!file || !cardId || !file.type.startsWith('image/')) return
      try {
        const url = await uploadFileToStorage(file, cardId)
        await updateFlashcard(cardId, { imageUrl: url, updatedAt: new Date().toISOString() })
        updateCardInState(cardId, { imageUrl: url })
        setMissingImageCards((prev) => prev.filter((e) => e.card.id !== cardId))
        showSavedToast()
      } catch (e) {
        console.error('Image upload failed', e)
      }
    },
    [imagePickerForCardId, updateCardInState, showSavedToast]
  )

  const handlePickExistingImage = useCallback(
    async (imageUrl) => {
      const cardId = imagePickerForCardId
      setShowImagePickerModal(false)
      setImagePickerForCardId(null)
      if (!cardId || !imageUrl) return
      try {
        await updateFlashcard(cardId, { imageUrl, updatedAt: new Date().toISOString() })
        updateCardInState(cardId, { imageUrl })
        setMissingImageCards((prev) => prev.filter((e) => e.card.id !== cardId))
        showSavedToast()
      } catch (e) {
        console.error('Failed to assign image', e)
      }
    },
    [imagePickerForCardId, updateCardInState, showSavedToast]
  )

  const handleUploadNewFromModal = useCallback(() => {
    setShowImagePickerModal(false)
    setTimeout(() => imageFileInputRef.current?.click(), 0)
  }, [])

  const existingImages = useMemo(() => {
    const cards = (allCardsForPicker || []).filter(c => c.imageUrl && c.imageUrl.trim())
    const seen = new Set()
    return cards.filter(c => {
      if (seen.has(c.imageUrl)) return false
      seen.add(c.imageUrl)
      return true
    })
  }, [allCardsForPicker])

  const handleDuplicateAction = async (action) => {
    const pair = duplicatePairs[duplicateIndex]
    if (!pair || duplicateBusy) return
    setDuplicateBusy(true)
    try {
      const { a, b } = pair
      if (action === 'keepA') {
        await deleteFlashcard(b.id)
        setDuplicatePairs((prev) => prev.filter((_, i) => i !== duplicateIndex))
      } else if (action === 'keepB') {
        await deleteFlashcard(a.id)
        setDuplicatePairs((prev) => prev.filter((_, i) => i !== duplicateIndex))
      } else if (action === 'deleteBoth') {
        await deleteFlashcard(a.id)
        await deleteFlashcard(b.id)
        setDuplicatePairs((prev) => prev.filter((_, i) => i !== duplicateIndex))
      } else if (action === 'merge') {
        // Prefer the card with quizData; if both have it, prefer the one with a question
        const quizData = (a.quizData && a.quizData.q) ? a.quizData
          : (b.quizData && b.quizData.q) ? b.quizData
          : a.quizData || b.quizData || null
        const merged = {
          front: (a.front && a.front.length >= (b.front || '').length ? a.front : b.front) || a.front || b.front,
          back: (a.back && a.back.length >= (b.back || '').length ? a.back : b.back) || a.back || b.back,
          setId: a.setId || b.setId,
          status: a.status || b.status || 'active',
          imageUrl: a.imageUrl || b.imageUrl || null,
          ...(quizData ? { quizData } : {}),
          updatedAt: new Date().toISOString(),
        }
        await updateFlashcard(a.id, merged)
        await deleteFlashcard(b.id)
        setDuplicatePairs((prev) => prev.filter((_, i) => i !== duplicateIndex))
      }
      setDuplicateIndex((i) => Math.min(i, Math.max(0, duplicatePairs.length - 2)))
      notifyAction()
    } catch (e) {
      console.error('Duplicate action failed', e)
    } finally {
      setDuplicateBusy(false)
    }
  }

  const handleEmptyDelete = async (cardId) => {
    if (emptyBusy) return
    setEmptyBusy(true)
    try {
      await deleteFlashcard(cardId)
      setEmptyCards((prev) => prev.filter((c) => c.id !== cardId))
      notifyAction()
    } catch (e) {
      console.error('Delete empty failed', e)
    } finally {
      setEmptyBusy(false)
    }
  }

  const handleEmptySkip = (cardId) => {
    setEmptySkipped((prev) => new Set([...prev, cardId]))
  }

  const handleEmptyDeleteAll = async () => {
    if (!window.confirm(`Delete all ${emptyCards.length} empty cards? This cannot be undone.`)) return
    setEmptyBusy(true)
    try {
      await batchDeleteFlashcards(emptyCards.map((c) => c.id))
      setEmptyCards([])
      notifyAction()
    } catch (e) {
      console.error('Bulk delete failed', e)
    } finally {
      setEmptyBusy(false)
    }
  }

  const handleMissingAttach = async (cardId, url) => {
    if (missingImageBusy) return
    setMissingImageBusy(true)
    try {
      await updateFlashcard(cardId, { imageUrl: url || '', updatedAt: new Date().toISOString() })
      setMissingImageCards((prev) => prev.filter((e) => e.card.id !== cardId))
      notifyAction()
    } catch (e) {
      console.error('Attach image failed', e)
    } finally {
      setMissingImageBusy(false)
    }
  }

  const handleMissingSkip = (cardId) => {
    setMissingImageSkipped((prev) => new Set([...prev, cardId]))
  }

  const handleMissingUpload = async (cardId, file) => {
    if (!file || missingImageBusy) return
    setMissingImageBusy(true)
    try {
      const url = await uploadFileToStorage(file, cardId)
      await updateFlashcard(cardId, { imageUrl: url, updatedAt: new Date().toISOString() })
      setMissingImageCards((prev) => prev.filter((e) => e.card.id !== cardId))
      notifyAction()
    } catch (e) {
      console.error('Upload failed', e)
    } finally {
      setMissingImageBusy(false)
    }
  }

  const handleOrphanDelete = async (itemRef) => {
    if (orphanBusy) return
    setOrphanBusy(true)
    try {
      await deleteObject(itemRef)
      setOrphanImages((prev) => prev.filter((o) => o.ref !== itemRef))
      setOrphanRemoved((prev) => new Set([...prev, itemRef.fullPath]))
      notifyAction()
    } catch (e) {
      console.error('Delete orphan failed', e)
    } finally {
      setOrphanBusy(false)
    }
  }

  const handleOrphanAttach = (url) => {
    setAttachPickerCardId(url)
  }

  const handleOrphanAttachToCard = async (cardId, imageUrl) => {
    if (orphanBusy || !cardId) return
    setOrphanBusy(true)
    try {
      await updateFlashcard(cardId, { imageUrl, updatedAt: new Date().toISOString() })
      setOrphanImages((prev) => prev.filter((o) => o.url !== imageUrl))
      setOrphanRemoved((prev) => new Set([...prev, imageUrl]))
      setAttachPickerCardId(null)
      notifyAction()
    } catch (e) {
      console.error('Attach to card failed', e)
    } finally {
      setOrphanBusy(false)
    }
  }

  const handleOrphanDeleteAll = async () => {
    if (!window.confirm(`Delete all ${orphanImages.length} orphan images from storage? This cannot be undone.`)) return
    setOrphanBusy(true)
    try {
      for (const o of orphanImages) {
        await deleteObject(o.ref)
      }
      setOrphanImages([])
      setOrphanRemoved(new Set())
      notifyAction()
    } catch (e) {
      console.error('Bulk delete orphans failed', e)
    } finally {
      setOrphanBusy(false)
    }
  }

  if (!isOpen) return null

  const currentPair = duplicatePairs[duplicateIndex]
  const progressPct = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileSelected}
      />
      {savedToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium shadow-lg animate-pulse">
          {savedToast}
        </div>
      )}
      {showImagePickerModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => { setShowImagePickerModal(false); setImagePickerForCardId(null) }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-lg font-bold text-gray-900">Add Image</h3>
              <button onClick={() => { setShowImagePickerModal(false); setImagePickerForCardId(null) }} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            </div>
            <div className="px-4 pt-4 pb-2">
              <button
                onClick={handleUploadNewFromModal}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--color-primary)] text-white rounded-lg font-semibold hover:opacity-90 transition-opacity"
              >
                📷 Upload New Image
              </button>
            </div>
            <div className="px-4 py-2">
              <input
                type="text"
                placeholder="Search by card name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={imagePickerSearch}
                onChange={e => setImagePickerSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-auto px-4 pb-4">
              {orphanImages.length > 0 && (
                <>
                  <h4 className="text-sm font-bold text-amber-700 mt-3 mb-2">📦 Unassigned Images ({orphanImages.filter(o => !orphanRemoved.has(o.fullPath)).length})</h4>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                    {orphanImages
                      .filter(o => !orphanRemoved.has(o.fullPath))
                      .map((orphan) => (
                        <button
                          key={orphan.fullPath}
                          onClick={() => handlePickExistingImage(orphan.url)}
                          className="group relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-[var(--color-primary)] hover:shadow-md transition-all"
                        >
                          <img src={orphan.url} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 bg-black/60 px-2 py-1 rounded">Select</span>
                          </div>
                        </button>
                      ))}
                  </div>
                </>
              )}
              <h4 className="text-sm font-bold text-gray-700 mt-3 mb-2">🖼️ Existing Card Images ({existingImages.length})</h4>
              {existingImages.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">No existing images found</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {existingImages
                    .filter(c => {
                      if (!imagePickerSearch.trim()) return true
                      const q = imagePickerSearch.toLowerCase()
                      return (c.front || c.name || '').toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q)
                    })
                    .slice(0, 60)
                    .map((card) => (
                      <button
                        key={card.id}
                        onClick={() => handlePickExistingImage(card.imageUrl)}
                        className="group relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-[var(--color-primary)] hover:shadow-md transition-all"
                      >
                        <img src={card.imageUrl} alt="" className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                          <p className="text-white text-[10px] font-semibold truncate">{card.front || card.name || 'Untitled'}</p>
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            ← Close
          </button>
          <h2 className="text-lg font-bold text-gray-900">Flashcard Cleanup</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-48">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Overall progress</p>
          </div>
        </div>
      </div>

      <div className="flex border-b border-gray-200 bg-white px-4">
        {['duplicates', 'empty', 'missingImages', 'orphanImages'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab === 'duplicates' && `Duplicates (${duplicatePairs.length})`}
            {tab === 'empty' && `Empty Cards (${emptyCards.length})`}
            {tab === 'missingImages' && `Missing Images (${missingImageCards.length})`}
            {tab === 'orphanImages' && `Orphan Images (${orphanImages.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : activeTab === 'duplicates' && (
          <div className="max-w-4xl mx-auto">
            {currentPair ? (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  {(initialTotals?.duplicates ?? duplicatePairs.length) - duplicatePairs.length} of {initialTotals?.duplicates ?? duplicatePairs.length} duplicates reviewed
                </p>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <CardDisplay
                    card={currentPair.a}
                    setTitles={setTitles}
                    compareWith={currentPair.b}
                    label="Card A"
                    editable
                    onSaveCard={handleSaveCard}
                    onImageClick={handleImageClick}
                  />
                  <CardDisplay
                    card={currentPair.b}
                    setTitles={setTitles}
                    compareWith={currentPair.a}
                    label="Card B"
                    editable
                    onSaveCard={handleSaveCard}
                    onImageClick={handleImageClick}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-small" onClick={() => handleDuplicateAction('keepA')} disabled={duplicateBusy}>Keep A</button>
                  <button type="button" className="btn btn-small" onClick={() => handleDuplicateAction('keepB')} disabled={duplicateBusy}>Keep B</button>
                  <button type="button" className="btn btn-small bg-blue-600 text-white" onClick={() => handleDuplicateAction('merge')} disabled={duplicateBusy}>Merge</button>
                  <button type="button" className="btn btn-small bg-red-600 text-white" onClick={() => handleDuplicateAction('deleteBoth')} disabled={duplicateBusy}>Delete Both</button>
                </div>
              </>
            ) : (
              <p className="text-gray-600">No duplicate pairs to review.</p>
            )}
          </div>
        )}

        {activeTab === 'empty' && !loading && (
          <div className="max-w-4xl mx-auto">
            <p className="text-sm text-gray-600 mb-4">
              {emptyCards.filter((c) => !emptySkipped.has(c.id)).length} empty or very short cards remaining
            </p>
            <div className="mb-4 flex gap-2">
              <button type="button" className="btn bg-red-600 text-white" onClick={handleEmptyDeleteAll} disabled={emptyBusy || emptyCards.length === 0}>
                Delete All Empty Cards
              </button>
            </div>
            <ul className="space-y-4">
              {emptyCards.filter((c) => !emptySkipped.has(c.id)).map((c) => (
                <li key={c.id} className="flex gap-4 items-start">
                  <div className="flex-1 min-w-0">
                    <CardDisplay
                      card={c}
                      setTitles={setTitles}
                      editable
                      onSaveCard={handleSaveCard}
                      onImageClick={handleImageClick}
                    />
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button type="button" className="btn btn-small btn-secondary" onClick={() => handleEmptySkip(c.id)}>Skip</button>
                    <button type="button" className="btn btn-small bg-red-600 text-white" onClick={() => handleEmptyDelete(c.id)} disabled={emptyBusy}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
            {emptyCards.length === 0 && <p className="text-gray-600">No empty cards.</p>}
          </div>
        )}

        {activeTab === 'missingImages' && !loading && (
          <div className="max-w-4xl mx-auto">
            <p className="text-sm text-gray-600 mb-4">
              {missingImageCards.filter((e) => !missingImageSkipped.has(e.card.id)).length} cards missing images (with optional menu match)
            </p>
            <ul className="space-y-6">
              {missingImageCards.filter((e) => !missingImageSkipped.has(e.card.id)).map((e) => (
                <li key={e.card.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <CardDisplay
                      card={e.card}
                      setTitles={setTitles}
                      editable
                      onSaveCard={handleSaveCard}
                      onImageClick={handleImageClick}
                    />
                  </div>
                  <div className="p-4 bg-gray-50">
                    {e.suggestedImage && (
                      <div className="flex items-center gap-4 mb-3">
                        <img src={e.suggestedImage} alt="" className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Suggested from menu</p>
                          <p className="text-sm text-gray-600">{e.menuItemName}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {e.suggestedImage && (
                        <button type="button" className="btn btn-small" onClick={() => handleMissingAttach(e.card.id, e.suggestedImage)} disabled={missingImageBusy}>
                          Attach Suggested Image
                        </button>
                      )}
                      <label className="btn btn-small btn-secondary cursor-pointer">
                        Upload New
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(ev) => { const f = ev.target.files?.[0]; if (f) handleMissingUpload(e.card.id, f); ev.target.value = ''; }}
                        />
                      </label>
                      <button type="button" className="btn btn-small btn-secondary" onClick={() => handleMissingSkip(e.card.id)}>Skip</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {missingImageCards.length === 0 && <p className="text-gray-600">No cards missing images.</p>}
          </div>
        )}

        {activeTab === 'orphanImages' && !loading && (
          <div className="max-w-4xl mx-auto">
            <p className="text-sm text-gray-600 mb-4">
              {orphanImages.length} images in storage not referenced by any card or menu item
            </p>
            <div className="mb-4">
              <button type="button" className="btn bg-red-600 text-white" onClick={handleOrphanDeleteAll} disabled={orphanBusy || orphanImages.length === 0}>
                Delete All Orphans
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {orphanImages.map((o) => (
                <div key={o.fullPath} className="rounded-xl border border-gray-200 bg-white p-2">
                  <img src={o.url} alt="" className="w-full h-24 object-cover rounded-lg" />
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn btn-small btn-secondary text-xs" onClick={() => handleOrphanAttach(o.url)}>Attach to Card</button>
                    <button type="button" className="btn btn-small bg-red-600 text-white text-xs" onClick={() => handleOrphanDelete(o.ref)} disabled={orphanBusy}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
            {orphanImages.length === 0 && <p className="text-gray-600">No orphan images.</p>}
          </div>
        )}
      </div>

      {attachPickerCardId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-auto p-4">
            <h3 className="font-bold text-gray-900 mb-2">Attach image to card</h3>
            <p className="text-xs text-gray-500 mb-3">Select a flashcard to attach this image to.</p>
            <ul className="space-y-3 max-h-96 overflow-auto">
              {allCardsForPicker.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full text-left rounded-xl border-2 border-gray-200 hover:border-[var(--color-primary)] hover:bg-gray-50 p-3 transition-colors"
                    onClick={() => {
                      handleOrphanAttachToCard(c.id, attachPickerCardId)
                    }}
                  >
                    <p className="font-bold text-gray-900 text-sm break-words">{(c.front || '').trim() || '(no front)'}</p>
                    <span className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${setBadgeColor(c.setId)}`}>
                      {setDisplayName(c.setId, setTitles)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-secondary mt-4" onClick={() => setAttachPickerCardId(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
