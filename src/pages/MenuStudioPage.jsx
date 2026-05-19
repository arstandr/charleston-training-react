import { useState, useEffect, useMemo, useRef } from 'react'
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  doc,
  serverTimestamp,
  increment,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import MenuItemCard from '../components/MenuItemCard'
import SkeletonCards from '../components/SkeletonCard'
import { useToastStoreGuids } from '../hooks/useToastStoreGuids'
import { getToastMenus } from '../services/toast'
import { callGemini } from '../services/ai'
import { downloadAndStoreImage, isFirebaseStorageUrl, uploadFileToStorage } from '../services/imageService'
import { processIncomingItems, runAiSemanticScan, consolidateSizeVariants } from '../services/MenuIngestionService'
import { getCategoryTemplate } from '../utils/flashcardCategoryTemplates'
import { query, where } from 'firebase/firestore'
import { seedUpsellingSet } from '../services/upsellingSeed'
import AiFlashcardWizard from '../components/AiFlashcardWizard'

const COLLECTION = 'menuStudio'
const PENDING_MENU_STORAGE_KEY = 'charlestons_pending_menu_updates'

function flattenToastMenus(data) {
  const items = []
  if (!data || typeof data !== 'object') return items
  const menus = Array.isArray(data) ? data : data.menus || data.items || []
  for (const menu of menus) {
    const menuName = menu.name || menu.posName || menu.displayName || 'Menu'
    const groups = menu.menuGroups || menu.menuItemGroups || menu.groups || []
    for (const grp of groups) {
      const cat = grp.name || grp.posName || grp.displayName || menuName
      const entries = grp.menuItems || grp.items || []
      for (const ent of entries) {
        const name = ent.name || ent.posName || ent.displayName || ''
        const description = ent.description || ''
        const guid = ent.guid ?? ent.id
        const imageUrl = ent.imageUrl ?? ent.image ?? ent.imageUrlLarge ?? ent.highResImage
        if (name) {
          items.push({
            name,
            description: description || '',
            category: cat,
            ...(guid != null && { guid: String(guid) }),
            ...(imageUrl && { imageUrl: String(imageUrl) }),
          })
        }
      }
    }
  }
  return items
}

function dedupeByName(items) {
  const seen = new Set()
  return items.filter((i) => {
    const key = `${(i.name || '').toLowerCase().trim()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normName(name) {
  return (name || '').toLowerCase().trim()
}

/** Graveyarded items whose name appears in the Toast menu list = "ghosts" (returned to menu) */
function computeGhostNames(items, toastFlatList) {
  const graveyarded = items.filter((i) => i.inGraveyard)
  const toastNames = new Set((toastFlatList || []).map((it) => normName(it.name)))
  return graveyarded.filter((i) => toastNames.has(normName(i.name))).map((i) => normName(i.name))
}

export default function MenuStudioPage() {
  const { currentUser } = useAuth()
  const store = currentUser?.store || 'Westfield'
  const { getMenuRestaurantGuid } = useToastStoreGuids()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoryTab, setCategoryTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showGraveyard, setShowGraveyard] = useState(false)
  const [viewMode, setViewMode] = useState('list')
  const [editingItemId, setEditingItemId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', category: 'General' })
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCat, setNewCat] = useState('General')
  const [toastImportLoading, setToastImportLoading] = useState(false)
  const [toastImportError, setToastImportError] = useState(null)
  const [generatedCards, setGeneratedCards] = useState([])
  const [defaultTargetSet, setDefaultTargetSet] = useState('')
  const [upsellingSeedMessage, setUpsellingSeedMessage] = useState(null)
  const [flashcardSets, setFlashcardSets] = useState([])
  const [pendingMenuUpdates, setPendingMenuUpdates] = useState(() => {
    try {
      const raw = localStorage.getItem(PENDING_MENU_STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        return Array.isArray(arr) ? arr : []
      }
    } catch (_) {}
    return []
  })
  const [scanMenuLoading, setScanMenuLoading] = useState(false)
  const [showAiWizard, setShowAiWizard] = useState(false)
  const [scanMenuError, setScanMenuError] = useState(null)
  const [scanMenuMessage, setScanMenuMessage] = useState(null)
  const [aiCleanupLoading, setAiCleanupLoading] = useState(false)
  const [aiCleanupMessage, setAiCleanupMessage] = useState(null)
  const [ghostNames, setGhostNames] = useState([])
  const [reviewQueue, setReviewQueue] = useState([])
  const [reviewVisible, setReviewVisible] = useState(false)
  const [confirmRemoveImageItem, setConfirmRemoveImageItem] = useState(null)
  const [imageGalleryOpen, setImageGalleryOpen] = useState(false)
  const [imageGalleryTargetItemId, setImageGalleryTargetItemId] = useState(null)
  const [gallerySearch, setGallerySearch] = useState('')
  const [galleryUploading, setGalleryUploading] = useState(false)
  const [imagePickerTab, setImagePickerTab] = useState('gallery')
  const [galleryItems, setGalleryItems] = useState([])
  const [galleryItemsLoading, setGalleryItemsLoading] = useState(false)
  const [previewFlippedIndex, setPreviewFlippedIndex] = useState(null)

  useEffect(() => {
    try {
      localStorage.setItem(PENDING_MENU_STORAGE_KEY, JSON.stringify(pendingMenuUpdates))
    } catch (_) {}
  }, [pendingMenuUpdates])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const ref = collection(db, COLLECTION)
        const snap = await getDocs(ref)
        if (cancelled) return
        const allItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

        // Reconcile: cross-reference against existing flashcards by name
        const fcSnap = await getDocs(query(collection(db, 'flashcards'), where('status', '==', 'active')))
        if (cancelled) return
        const fcNames = new Set()
        for (const d of fcSnap.docs) {
          const data = d.data()
          const name = data?.front || data?.name || ''
          if (name) fcNames.add(normalizeForComparison(name))
        }

        // Mark menu items that already have flashcards
        const toMark = allItems.filter((i) => !i.hasFlashcards && fcNames.has(normalizeForComparison(i.name)))
        if (toMark.length > 0) {
          console.log(`🔄 Auto-reconciling ${toMark.length} menu items with existing flashcards`)
          for (const item of toMark) {
            try {
              await updateDoc(doc(db, COLLECTION, item.id), { hasFlashcards: true, updatedAt: serverTimestamp() })
            } catch (_) {}
          }
        }

        const list = allItems
          .filter((i) => !i.hasFlashcards && !fcNames.has(normalizeForComparison(i.name)))
        list.sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''))
        setItems(list)
      } catch (_) {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const [upsellingSetExists, setUpsellingSetExists] = useState(false)

  useEffect(() => {
    async function loadSets() {
      try {
        const snap = await getDocs(collection(db, 'flashcardSets'))
        const sets = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        setFlashcardSets(sets)
        setUpsellingSetExists(sets.some((s) => s.id === 'upselling'))
      } catch (e) {
        console.error('Failed to load flashcard sets:', e)
      }
    }
    loadSets()
  }, [])

  const ghostFetchedOnce = useRef(false)
  useEffect(() => {
    if (ghostFetchedOnce.current || items.length === 0) return
    const restaurantGuid = getMenuRestaurantGuid()
    if (!restaurantGuid) return
    ghostFetchedOnce.current = true
    let cancelled = false
    async function fetchAndDetectGhosts() {
      try {
        const result = await getToastMenus(restaurantGuid)
        if (cancelled) return
        const data = result.data ?? result
        const flat = flattenToastMenus(data)
        const deduped = dedupeByName(flat)
        setGhostNames(computeGhostNames(items, deduped))
      } catch (_) {
        if (!cancelled) setGhostNames([])
      }
    }
    fetchAndDetectGhosts()
    return () => { cancelled = true }
  }, [items, getMenuRestaurantGuid])

  const categories = useMemo(() => {
    const visibleItems = showGraveyard
      ? items
      : items.filter((i) => !i.inGraveyard)
    const set = new Set(visibleItems.map((i) => i.category || 'General'))
    return ['all', ...Array.from(set).sort()]
  }, [items, showGraveyard])

  useEffect(() => {
    if (categoryTab !== 'all' && !categories.includes(categoryTab)) {
      setCategoryTab('all')
    }
  }, [categories, categoryTab])

  const filtered = useMemo(() => {
    let list = items.filter((i) => Boolean(i.inGraveyard) === showGraveyard)
    if (categoryTab !== 'all') list = list.filter((i) => (i.category || 'General') === categoryTab)
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter((i) => (i.name || '').toLowerCase().includes(s) || (i.description || '').toLowerCase().includes(s))
    }
    list = consolidateSizeVariants(list)
    return list
  }, [items, categoryTab, search, showGraveyard])

  const ghostNamesSet = useMemo(() => new Set(ghostNames), [ghostNames])
  const isGhost = (item) => item.inGraveyard && ghostNamesSet.has(normName(item.name))

  useEffect(() => {
    if (!imageGalleryOpen || !imageGalleryTargetItemId) {
      setGalleryItems([])
      return
    }
    let cancelled = false
    setGalleryItemsLoading(true)
    getDocs(collection(db, COLLECTION))
      .then((snap) => {
        if (cancelled) return
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((i) => i.imageUrl && String(i.imageUrl).trim())
        setGalleryItems(list)
      })
      .catch(() => {
        if (!cancelled) setGalleryItems([])
      })
      .finally(() => {
        if (!cancelled) setGalleryItemsLoading(false)
      })
    return () => { cancelled = true }
  }, [imageGalleryOpen, imageGalleryTargetItemId])

  async function handleSaveItem(id, data) {
    const ref = doc(db, COLLECTION, id)
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...data } : i)))
  }

  async function handleGraveyard(idOrItem) {
    const item = typeof idOrItem === 'object' ? idOrItem : { id: idOrItem }
    const ids = item._variantIds || [item.id]
    for (const id of ids) {
      await updateDoc(doc(db, COLLECTION, id), { inGraveyard: true, updatedAt: serverTimestamp() })
    }
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, inGraveyard: true } : i)))
  }

  async function handleRestore(idOrItem) {
    const item = typeof idOrItem === 'object' ? idOrItem : { id: idOrItem }
    const ids = item._variantIds || [item.id]
    for (const id of ids) {
      await updateDoc(doc(db, COLLECTION, id), { inGraveyard: false, updatedAt: serverTimestamp() })
    }
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, inGraveyard: false } : i)))
  }

  async function handleConfirmRemoveImage() {
    const item = confirmRemoveImageItem
    if (!item?.id) { setConfirmRemoveImageItem(null); return }
    const imageUrlToClear = item.imageUrl
    try {
      await updateDoc(doc(db, COLLECTION, item.id), { imageUrl: null, updatedAt: serverTimestamp() })
      const fcSnap = await getDocs(query(collection(db, 'flashcards'), where('imageUrl', '==', imageUrlToClear)))
      for (const d of fcSnap.docs) {
        await updateDoc(doc(db, 'flashcards', d.id), { imageUrl: null, updatedAt: serverTimestamp() })
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, imageUrl: null } : i)))
    } catch (e) {
      console.error('Remove image failed:', e)
    }
    setConfirmRemoveImageItem(null)
  }

  function handleRemoveImage(item) {
    setConfirmRemoveImageItem(item)
  }

  function handleAddOrChangeImage(item) {
    setImageGalleryTargetItemId(item.id)
    setGallerySearch('')
    setImagePickerTab('gallery')
    setImageGalleryOpen(true)
  }

  async function handleSelectGalleryImage(url) {
    if (!imageGalleryTargetItemId) return
    try {
      await updateDoc(doc(db, COLLECTION, imageGalleryTargetItemId), { imageUrl: url, updatedAt: serverTimestamp() })
      setItems((prev) => prev.map((i) => (i.id === imageGalleryTargetItemId ? { ...i, imageUrl: url } : i)))
    } catch (e) {
      console.error('Set image failed:', e)
    }
    setImageGalleryOpen(false)
    setImageGalleryTargetItemId(null)
  }

  async function handleGalleryUpload(file) {
    if (!file || !imageGalleryTargetItemId) return
    setGalleryUploading(true)
    try {
      const url = await uploadFileToStorage(file, imageGalleryTargetItemId)
      await handleSelectGalleryImage(url)
    } catch (e) {
      console.error('Upload failed:', e)
    } finally {
      setGalleryUploading(false)
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return
    const ref = collection(db, COLLECTION)
    await addDoc(ref, {
      name: newName.trim(),
      description: newDesc.trim(),
      category: newCat.trim() || 'General',
      inGraveyard: false,
      source: 'manual',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setNewName('')
    setNewDesc('')
    setNewCat('General')
    setAddOpen(false)
    const snap = await getDocs(collection(db, COLLECTION))
    setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }

  async function handleToastImport() {
    const restaurantGuid = getMenuRestaurantGuid()
    if (!restaurantGuid) {
      setToastImportError('No Toast menu GUID configured. Set it in Admin → Settings → per-store GUIDs and choose Menu store.')
      return
    }
    setToastImportLoading(true)
    setToastImportError(null)
    try {
      const result = await getToastMenus(restaurantGuid)
      const data = result.data ?? result
      const flat = flattenToastMenus(data)
      const deduped = dedupeByName(flat)

      if (deduped.length === 0) {
        setToastImportError('No menu items found in Toast response.')
        return
      }

      if (items.length === 0) {
        const ref = collection(db, COLLECTION)
        let imported = 0
        for (const it of deduped.slice(0, 500)) {
          await addDoc(ref, {
            name: it.name,
            description: it.description || '',
            category: it.category || 'Toast',
            inGraveyard: false,
            source: 'toast',
            ...(it.guid != null && { toastGuid: String(it.guid) }),
            ...(it.imageUrl && { imageUrl: String(it.imageUrl) }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
          imported++
        }
        const snap = await getDocs(collection(db, COLLECTION))
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setScanMenuMessage(`Imported ${imported} items from Toast.`)
      } else {
        const imagePatchLog = []
        const { newItems, updatedItems, duplicates } = processIncomingItems(
          deduped,
          items,
          (dbItem, incomingItem, patch) => {
            imagePatchLog.push(`Updated image for ${dbItem?.name ?? 'item'}`)
          }
        )
        for (const u of updatedItems) {
          const ref = doc(db, COLLECTION, u.id)
          await updateDoc(ref, { ...u.patch, updatedAt: serverTimestamp() })
        }
        if (newItems.length > 0) {
          setPendingMenuUpdates((prev) => dedupeByName([...prev, ...newItems]))
        }
        if (updatedItems.length > 0) {
          const snap = await getDocs(collection(db, COLLECTION))
          setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        }
        setGhostNames(computeGhostNames(items, deduped))
        const parts = []
        if (imagePatchLog.length > 0) parts.push(`Updated images for ${imagePatchLog.length} item(s).`)
        if (duplicates.exact + duplicates.fuzzy > 0) parts.push(`${duplicates.exact} exact + ${duplicates.fuzzy} fuzzy duplicates skipped.`)
        if (newItems.length > 0) parts.push(`${newItems.length} new item(s) added to Pending.`)
        if (parts.length > 0) setScanMenuMessage(parts.join(' '))
        if (newItems.length === 0 && updatedItems.length === 0 && duplicates.exact + duplicates.fuzzy === 0) {
          setScanMenuMessage('All Toast items already exist in Menu Studio.')
        }
      }
    } catch (e) {
      setToastImportError(e.message || 'Import failed')
    } finally {
      setToastImportLoading(false)
    }
  }

  function normalizeForComparison(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  }

  /**
   * Build a flat array of all flashcard names for duplicate detection (Firestore only).
   */
  async function buildFlashcardComparisonList() {
    const cards = []
    try {
      const snap = await getDocs(query(collection(db, 'flashcards'), where('status', '==', 'active')))
      for (const d of snap.docs) {
        const data = d.data()
        const name = data?.front || data?.name || ''
        if (name) {
          cards.push({
            id: d.id,
            name,
            front: name,
            source: 'firestore-flashcard',
            imageUrl: data?.imageUrl || '',
          })
        }
      }
    } catch (e) {
      console.warn('Could not load Firestore flashcards for comparison:', e.message)
    }
    console.log('📚 Loaded', cards.length, 'flashcards for comparison')
    return cards
  }

  async function getAllFlashcardNames() {
    const names = new Set()
    try {
      const snap = await getDocs(query(collection(db, 'flashcards'), where('status', '==', 'active')))
      for (const d of snap.docs) {
        const data = d.data()
        const name = data?.front || data?.name || ''
        if (name) names.add(normalizeForComparison(name))
      }
    } catch (e) {
      console.warn('Could not load Firestore flashcards:', e.message)
    }
    return names
  }

  /**
   * Use Gemini to match unmatched Toast items against flashcard names.
   * Returns array of { toastIndex, flashcardName, confidence, reasoning }
   */
  async function aiMatchItems(unmatchedItems, flashcardNames) {
    if (!unmatchedItems.length || !flashcardNames.length) return []
    const allMatches = []
    const BATCH_SIZE = 30
    for (let i = 0; i < unmatchedItems.length; i += BATCH_SIZE) {
      const batch = unmatchedItems.slice(i, i + BATCH_SIZE)
      const toastList = batch
        .map(
          (item, idx) =>
            `${i + idx}. "${item.toastItem.name}"${item.toastItem.description ? ' — ' + item.toastItem.description.slice(0, 60) : ''}`
        )
        .join('\n')
      const fcList = flashcardNames.join('\n')
      const prompt = `You are a restaurant menu expert. Your job is to identify when two differently-named items are actually the SAME dish or drink.

EXISTING FLASHCARD NAMES:
${fcList}

NEW TOAST ITEMS (index. "name" — description):
${toastList}

For each Toast item, determine if it matches any existing flashcard — even if the names are quite different. Think like a restaurant manager who knows:
- "Hand Cut Ribeye" and "HAND CUT RIBEYE" are the same
- "10oz CENTER CUT FILET" and "Hand-cut Filet" are the same steak (just different size/cut descriptions)
- "GRILLED PORK CHOPS" and "Grilled Pork Chops" are the same
- "WALTS CHAMPAGNE CHICKEN SALAD" and "Walt's Chicken Salad" could be the same
- "DYNAMITE SHRIMP" could be the same as "Firecracker Shrimp" (both are spicy fried shrimp appetizers)
- Size variants like "CUP OF TOMATO SOUP" and "BOWL OF TOMATO SOUP" match "Tomato Soup"
- "KIDS" versions are different items (KIDS BURGER ≠ regular Burger)
- Drinks with the same base name but different preparations ARE the same (MODELO ESPECIAL draft vs bottle)

Respond ONLY with a JSON array. For each Toast item that matches a flashcard:
{"toastIndex": number, "flashcardName": "exact name from flashcard list", "confidence": "high" or "medium", "reasoning": "brief explanation"}

If a Toast item has NO match, do NOT include it. Only include actual matches.
If there are no matches at all, respond with: []

No markdown fences, no other text. Just the JSON array.`
      try {
        const response = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], {
          maxOutputTokens: 4096,
          temperature: 0.1,
        })
        const rawText = (typeof response === 'string' ? response : '').trim()
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
        console.log('🤖 AI match batch response (first 500 chars):', cleaned.slice(0, 500))
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0])
            if (Array.isArray(parsed)) allMatches.push(...parsed)
          } catch (parseErr) {
            console.warn('AI match JSON parse failed:', parseErr.message)
          }
        }
      } catch (e) {
        console.error('AI matching batch error:', e.message)
      }
    }
    return allMatches
  }

  async function handleScanMenu() {
    const restaurantGuid = getMenuRestaurantGuid()
    if (!restaurantGuid) {
      setScanMenuError('No Toast menu GUID configured.')
      return
    }
    setScanMenuLoading(true)
    setScanMenuError(null)
    setScanMenuMessage(null)
    setReviewQueue([])
    setReviewVisible(false)

    try {
      const result = await getToastMenus(restaurantGuid)
      const data = result.data ?? result
      const flat = flattenToastMenus(data)
      const deduped = dedupeByName(flat)

      // Consolidate size variants BEFORE duplicate checking: e.g. "6oz J LOHR CHARDONNAY", "9oz J LOHR CHARDONNAY"
      // become one "J LOHR CHARDONNAY" which then matches flashcard "J Lohr Chardonnay"
      function consolidateSizeVariantsLocal(itemList) {
        const SIZE_PREFIX = /^(?:(\d+(?:\.\d+)?)\s*oz|BTL|BOTTLE|PINT|QT|QUART|HALF)\s+/i
        const SIZE_SUFFIX = /\s+(?:(\d+(?:\.\d+)?)\s*oz|BTL|BOTTLE|PINT|QT|QUART|HALF)$/i
        const groups = new Map()

        for (const item of itemList) {
          const name = (item.name || '').trim()
          let baseName = name
          let size = null
          const prefixMatch = name.match(SIZE_PREFIX)
          if (prefixMatch) {
            size = prefixMatch[0].trim()
            baseName = name.replace(SIZE_PREFIX, '').trim()
          } else {
            const suffixMatch = name.match(SIZE_SUFFIX)
            if (suffixMatch) {
              size = suffixMatch[0].trim()
              baseName = name.replace(SIZE_SUFFIX, '').trim()
            }
          }
          const key = baseName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
          if (!groups.has(key)) {
            groups.set(key, { baseName, items: [], sizes: [], bestItem: null })
          }
          const group = groups.get(key)
          group.items.push(item)
          if (size) {
            group.sizes.push(size.replace(/^BTL$/i, 'Bottle').replace(/^PINT$/i, 'Pint').replace(/^QT$/i, 'Quart'))
          }
          if (!group.bestItem || (item.description && !group.bestItem.description) || (item.imageUrl && !group.bestItem.imageUrl)) {
            group.bestItem = item
          }
        }

        const resultList = []
        for (const [, group] of groups) {
          if (group.items.length === 1) {
            resultList.push(group.items[0])
          } else if (group.sizes.length > 0) {
            const sizeList = [...new Set(group.sizes)].sort((a, b) => {
              const na = parseFloat(a)
              const nb = parseFloat(b)
              if (!isNaN(na) && !isNaN(nb)) return na - nb
              return a.localeCompare(b)
            }).join(', ')
            const rep = { ...group.bestItem }
            rep.name = group.baseName
            rep.description = ((rep.description || '') + '\nAvailable in: ' + sizeList).trim()
            rep._consolidatedFrom = group.items.map((i) => i.name)
            const images = group.items.map((i) => i.imageUrl).filter(Boolean)
            if (images.length > 0) rep.imageUrl = images[0]
            resultList.push(rep)
            console.log('🔗 Consolidated ' + group.items.length + ' variants → "' + group.baseName + '" (' + sizeList + ')')
          } else {
            resultList.push(...group.items)
          }
        }
        console.log('📦 Consolidation: ' + itemList.length + ' items → ' + resultList.length + ' (merged ' + (itemList.length - resultList.length) + ' size variants)')
        return resultList
      }

      const consolidated = consolidateSizeVariantsLocal(deduped)

      const allFlashcardNames = []
      try {
        const fcSnap = await getDocs(query(collection(db, 'flashcards'), where('status', '==', 'active')))
        for (const fcDoc of fcSnap.docs) {
          const d = fcDoc.data()
          if (d?.front || d?.name) {
            allFlashcardNames.push({
              id: fcDoc.id,
              name: d.front || d.name,
              source: 'firestore-flashcard',
              setId: d.setId || '',
              imageUrl: d.imageUrl || '',
            })
          }
        }
      } catch (e) {
        console.warn('Could not load Firestore flashcards:', e.message)
      }

      const menuStudioNames = items.map((i) => ({
        id: i.id,
        name: i.name || i.front || '',
        source: 'menuStudio',
        imageUrl: i.imageUrl || '',
        inGraveyard: i.inGraveyard || false,
      }))
      const comparisonPool = [...allFlashcardNames, ...menuStudioNames]

      console.log('📚 Comparison pool:', {
        flashcards: allFlashcardNames.length,
        menuStudio: menuStudioNames.length,
        total: comparisonPool.length,
        toastItems: consolidated.length,
      })

      const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
      function levenshtein(a, b) {
        if (!a.length) return b.length
        if (!b.length) return a.length
        const matrix = []
        for (let i = 0; i <= b.length; i++) matrix[i] = [i]
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j
        for (let i = 1; i <= b.length; i++) {
          for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
          }
        }
        return matrix[b.length][a.length]
      }
      function similarity(s1, s2) {
        const a = normalize(s1)
        const b = normalize(s2)
        if (!a && !b) return 1
        if (!a || !b) return 0
        const maxLen = Math.max(a.length, b.length)
        return 1 - levenshtein(a, b) / maxLen
      }

      const queue = []
      for (const toastItem of consolidated) {
        const normToast = normalize(toastItem.name)
        let bestMatch = null
        let bestScore = 0
        let matchType = 'new'

        for (const comp of comparisonPool) {
          const normComp = normalize(comp.name)
          if (normToast === normComp) {
            bestMatch = comp
            bestScore = 1.0
            matchType = 'exact'
            break
          }
          const score = similarity(toastItem.name, comp.name)
          if (score > bestScore) {
            bestScore = score
            bestMatch = comp
          }
        }

        if (matchType !== 'exact' && bestScore >= 0.7) {
          matchType = 'fuzzy'
        } else if (matchType !== 'exact') {
          matchType = 'new'
          bestMatch = null
          bestScore = 0
        }

        queue.push({
          toastItem,
          matchType,
          matchScore: Math.round(bestScore * 100),
          matchedTo: bestMatch,
          status: 'pending',
        })
      }

      // 5. AI matching for remaining unmatched items
      const unmatchedEntries = queue.filter((q) => q.matchType === 'new')
      if (unmatchedEntries.length > 0 && unmatchedEntries.length <= 200) {
        setScanMenuMessage(`String matching done. Running AI on ${unmatchedEntries.length} unmatched items...`)
        const uniqueFcNames = [...new Set(comparisonPool.map((c) => c.name))].sort()
        try {
          const aiMatches = await aiMatchItems(unmatchedEntries, uniqueFcNames)
          console.log('🤖 AI found', aiMatches.length, 'additional matches')
          for (const match of aiMatches) {
            const actualEntry = unmatchedEntries[match.toastIndex]
            if (actualEntry && actualEntry.matchType === 'new' && match.flashcardName) {
              const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
              const fcMatch =
                comparisonPool.find(
                  (c) => norm(c.name) === norm(match.flashcardName)
                ) ||
                comparisonPool.find(
                  (c) =>
                    c.name.toLowerCase().includes(match.flashcardName.toLowerCase()) ||
                    match.flashcardName.toLowerCase().includes(c.name.toLowerCase())
                )
              if (fcMatch) {
                actualEntry.matchType = 'ai'
                actualEntry.matchScore = match.confidence === 'high' ? 95 : 80
                actualEntry.matchedTo = fcMatch
                actualEntry.aiReasoning = match.reasoning
                actualEntry.aiConfidence = match.confidence
              }
            }
          }
        } catch (e) {
          console.warn('AI matching failed:', e.message)
        }
      }

      queue.sort((a, b) => {
        const order = { new: 0, ai: 1, fuzzy: 2, exact: 3 }
        return (order[a.matchType] ?? 4) - (order[b.matchType] ?? 4)
      })

      const counts = {
        new: queue.filter((q) => q.matchType === 'new').length,
        ai: queue.filter((q) => q.matchType === 'ai').length,
        fuzzy: queue.filter((q) => q.matchType === 'fuzzy').length,
        exact: queue.filter((q) => q.matchType === 'exact').length,
      }
      console.log('📋 Final review queue:', counts)

      setReviewQueue(queue)
      setReviewVisible(true)
      setScanMenuMessage(
        `Found ${consolidated.length} Toast items: ${counts.new} new, ${counts.ai} AI-matched, ${counts.fuzzy} fuzzy matches, ${counts.exact} exact matches.`
      )
    } catch (e) {
      setScanMenuError(e.message || 'Scan failed')
    } finally {
      setScanMenuLoading(false)
    }
  }

  async function handleKeepCurrentName(queueIdx) {
    const entry = reviewQueue[queueIdx]
    if (!entry?.matchedTo) return
    const imageUrl = entry.toastItem?.imageUrl
    if (imageUrl && entry.matchedTo.id) {
      try {
        const permanentUrl = isFirebaseStorageUrl(imageUrl)
          ? imageUrl
          : await downloadAndStoreImage(imageUrl, entry.matchedTo.id)
        const collectionName = entry.matchedTo.source === 'firestore-flashcard' ? 'flashcards' : 'menuStudio'
        const ref = doc(db, collectionName, entry.matchedTo.id)
        await updateDoc(ref, {
          imageUrl: permanentUrl,
          imageUpdatedAt: serverTimestamp(),
          ...(collectionName === 'menuStudio' ? { updatedAt: serverTimestamp() } : {}),
        })
        console.log('🖼️ Updated image on:', entry.matchedTo.name)
      } catch (e) {
        console.warn('Image update failed:', e.message)
      }
    }
    setReviewQueue((prev) =>
      prev.map((q, i) => (i === queueIdx ? { ...q, status: 'approved', action: 'kept' } : q))
    )
  }

  async function handleRenameToToast(queueIdx) {
    const entry = reviewQueue[queueIdx]
    if (!entry?.matchedTo) return
    const newName = entry.toastItem.name
    const imageUrl = entry.toastItem?.imageUrl
    if (entry.matchedTo.id) {
      try {
        const collectionName = entry.matchedTo.source === 'firestore-flashcard' ? 'flashcards' : 'menuStudio'
        const updateData = { updatedAt: serverTimestamp() }
        if (collectionName === 'flashcards') {
          updateData.front = newName
        } else {
          updateData.name = newName
        }
        if (imageUrl) {
          updateData.imageUrl = isFirebaseStorageUrl(imageUrl)
            ? imageUrl
            : await downloadAndStoreImage(imageUrl, entry.matchedTo.id)
          updateData.imageUpdatedAt = serverTimestamp()
        }
        const ref = doc(db, collectionName, entry.matchedTo.id)
        await updateDoc(ref, updateData)
        console.log('✏️ Renamed + updated:', entry.matchedTo.name, '→', newName)
      } catch (e) {
        console.warn('Rename failed:', e.message)
      }
    }
    setReviewQueue((prev) =>
      prev.map((q, i) => (i === queueIdx ? { ...q, status: 'approved', action: 'renamed' } : q))
    )
  }

  function handleNotAMatch(queueIdx) {
    setReviewQueue((prev) =>
      prev.map((q, i) =>
        i === queueIdx ? { ...q, matchType: 'new', matchedTo: null, status: 'dismissed' } : q
      )
    )
  }

  async function handleApplyAllMatches() {
    const matches = reviewQueue.filter(
      (q) => q.matchedTo && q.status !== 'dismissed' && q.status !== 'approved'
    )
    if (matches.length === 0) return
    setScanMenuMessage(`Applying ${matches.length} matches...`)
    let imageCount = 0
    for (let i = 0; i < matches.length; i++) {
      const entry = matches[i]
      const imageUrl = entry.toastItem?.imageUrl
      if (imageUrl && entry.matchedTo?.id && !entry.matchedTo?.imageUrl) {
        try {
          const permanentUrl = isFirebaseStorageUrl(imageUrl)
            ? imageUrl
            : await downloadAndStoreImage(imageUrl, entry.matchedTo.id)
          const collectionName = entry.matchedTo.source === 'firestore-flashcard' ? 'flashcards' : 'menuStudio'
          const ref = doc(db, collectionName, entry.matchedTo.id)
          await updateDoc(ref, {
            imageUrl: permanentUrl,
            imageUpdatedAt: serverTimestamp(),
          })
          imageCount++
        } catch (e) {}
      }
    }
    setReviewQueue((prev) =>
      prev.map((q) =>
        q.matchedTo && q.status !== 'dismissed' ? { ...q, status: 'approved', action: 'kept' } : q
      )
    )
    try {
      const snap = await getDocs(collection(db, COLLECTION))
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (e) {}
    setScanMenuMessage(`Applied ${matches.length} matches. Updated ${imageCount} images.`)
  }

  async function handlePublishPendingItem(idx) {
    const it = pendingMenuUpdates[idx]
    if (!it) return
    const ref = collection(db, COLLECTION)
    await addDoc(ref, {
      name: it.name,
      description: it.description || '',
      category: it.category || 'Toast',
      inGraveyard: false,
      source: 'toast',
      ...(it.guid != null && { toastGuid: String(it.guid) }),
      ...(it.imageUrl && { imageUrl: String(it.imageUrl) }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setPendingMenuUpdates((prev) => prev.filter((_, i) => i !== idx))
    const snap = await getDocs(collection(db, COLLECTION))
    setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }

  async function handlePublishAllPending() {
    const ref = collection(db, COLLECTION)
    for (const it of pendingMenuUpdates) {
      await addDoc(ref, {
        name: it.name,
        description: it.description || '',
        category: it.category || 'Toast',
        inGraveyard: false,
        source: 'toast',
        ...(it.guid != null && { toastGuid: String(it.guid) }),
        ...(it.imageUrl && { imageUrl: String(it.imageUrl) }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
    setPendingMenuUpdates([])
    const snap = await getDocs(collection(db, COLLECTION))
    setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }

  function handleDismissPendingItem(idx) {
    setPendingMenuUpdates((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleAiSemanticCleanup() {
    setAiCleanupLoading(true)
    setAiCleanupMessage(null)
    try {
      // Step 1: Load all flashcard names for comparison
      const flashcardList = await buildFlashcardComparisonList()
      const fcNormNames = new Map()
      for (const fc of flashcardList) {
        fcNormNames.set(normalizeForComparison(fc.name), fc)
      }

      // Step 2: String-match menu studio items against flashcards (exact + fuzzy)
      const activeItems = items.filter((i) => !i.inGraveyard)
      let stringMatched = 0
      const remainingItems = []
      for (const item of activeItems) {
        const normName = normalizeForComparison(item.name)
        // Exact match
        if (fcNormNames.has(normName)) {
          try {
            await updateDoc(doc(db, COLLECTION, item.id), { hasFlashcards: true, updatedAt: serverTimestamp() })
            stringMatched++
          } catch (_) {}
          continue
        }
        // Fuzzy match (>= 85% similarity)
        let fuzzyHit = false
        for (const [fcNorm] of fcNormNames) {
          if (!fcNorm || !normName) continue
          const maxLen = Math.max(fcNorm.length, normName.length)
          if (maxLen === 0) continue
          let dist = 0
          const a = normName, b = fcNorm
          const matrix = []
          for (let i = 0; i <= b.length; i++) matrix[i] = [i]
          for (let j = 0; j <= a.length; j++) matrix[0][j] = j
          for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
              const cost = a[j - 1] === b[i - 1] ? 0 : 1
              matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
            }
          }
          dist = matrix[b.length][a.length]
          const sim = 1 - dist / maxLen
          if (sim >= 0.85) {
            fuzzyHit = true
            break
          }
        }
        if (fuzzyHit) {
          try {
            await updateDoc(doc(db, COLLECTION, item.id), { hasFlashcards: true, updatedAt: serverTimestamp() })
            stringMatched++
          } catch (_) {}
          continue
        }
        remainingItems.push(item)
      }

      if (stringMatched > 0) {
        console.log(`🔤 String matching found ${stringMatched} menu items with existing flashcards`)
      }

      // Step 3: Also reconcile pending menu updates
      let pendingRemoved = 0
      if (pendingMenuUpdates.length > 0) {
        const pendingIndicesToRemove = new Set()
        for (let i = 0; i < pendingMenuUpdates.length; i++) {
          const pName = normalizeForComparison(pendingMenuUpdates[i].name)
          if (fcNormNames.has(pName)) {
            pendingIndicesToRemove.add(i)
          }
        }
        if (pendingIndicesToRemove.size > 0) {
          pendingRemoved = pendingIndicesToRemove.size
          setPendingMenuUpdates((prev) => prev.filter((_, i) => !pendingIndicesToRemove.has(i)))
        }
      }

      // Step 4: AI semantic scan for remaining unmatched items
      let aiMatched = 0
      let imagesPatched = 0
      if (remainingItems.length > 0) {
        setAiCleanupMessage(`Found ${stringMatched} exact/fuzzy matches. Running AI on ${remainingItems.length} remaining items...`)
        const itemsForAi = remainingItems.map((i) => ({ name: i.name, description: i.description, category: i.category, imageUrl: i.imageUrl, guid: i.toastGuid, _id: i.id }))
        const comparisonList = [...flashcardList]
        const { duplicatePairs, error } = await runAiSemanticScan(itemsForAi, comparisonList, callGemini)
        if (error) {
          setAiCleanupMessage(`String matched ${stringMatched}. AI scan failed: ${error}`)
          // Still reload items to reflect string matches
          const snap = await getDocs(collection(db, COLLECTION))
          setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => !i.hasFlashcards).sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')))
          return
        }

        for (const { pendingIndex, databaseId, databaseItem, pendingItem } of duplicatePairs) {
          const menuItem = remainingItems[pendingIndex]
          if (menuItem?.id) {
            try {
              await updateDoc(doc(db, COLLECTION, menuItem.id), { hasFlashcards: true, updatedAt: serverTimestamp() })
              aiMatched++
            } catch (_) {}
          }
          // Patch image if incoming has one and the flashcard doesn't
          const incomingUrl = pendingItem?.imageUrl ?? pendingItem?.image
          const existingUrl = databaseItem?.imageUrl ?? databaseItem?.image
          if (incomingUrl && !existingUrl && databaseId) {
            try {
              const permanentUrl = isFirebaseStorageUrl(incomingUrl)
                ? incomingUrl
                : await downloadAndStoreImage(incomingUrl, databaseId)
              const colName = databaseItem?.source === 'firestore-flashcard' ? 'flashcards' : COLLECTION
              await updateDoc(doc(db, colName, databaseId), { imageUrl: permanentUrl, updatedAt: serverTimestamp() })
              imagesPatched++
            } catch (_) {}
          }
        }
      }

      // Reload items to reflect all changes
      const snap = await getDocs(collection(db, COLLECTION))
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => !i.hasFlashcards).sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')))

      const totalFound = stringMatched + aiMatched + pendingRemoved
      const parts = []
      if (stringMatched > 0) parts.push(`${stringMatched} exact/fuzzy match${stringMatched !== 1 ? 'es' : ''}`)
      if (aiMatched > 0) parts.push(`${aiMatched} AI match${aiMatched !== 1 ? 'es' : ''}`)
      if (pendingRemoved > 0) parts.push(`${pendingRemoved} pending item${pendingRemoved !== 1 ? 's' : ''} removed`)
      if (imagesPatched > 0) parts.push(`${imagesPatched} image${imagesPatched !== 1 ? 's' : ''} updated`)

      setAiCleanupMessage(
        totalFound > 0
          ? `Marked ${stringMatched + aiMatched} item${stringMatched + aiMatched !== 1 ? 's' : ''} as having flashcards. ${parts.join(', ')}.`
          : 'No duplicates found — all menu items are unique.'
      )
    } catch (e) {
      setAiCleanupMessage(e?.message || 'AI cleanup failed')
    } finally {
      setAiCleanupLoading(false)
    }
  }

  function handleAiGenerate() {
    const list = showGraveyard ? [] : filtered
    if (list.length === 0) {
      setScanMenuMessage('Add or import menu items first.')
      return
    }
    setShowAiWizard(true)
  }

  async function handlePublishSelectedFlashcards() {
    const toPublish = generatedCards.filter((c) => c.selected && c.targetSet)
    if (toPublish.length === 0) return
    let published = 0
    const cat = (targetSet) => flashcardSets.find((s) => s.id === targetSet)?.category || 'Menu'
    for (const card of toPublish) {
      try {
        const targetSet = card.targetSet
        const category = cat(targetSet)
        const mainCardRef = await addDoc(collection(db, 'flashcards'), {
          front: card.front,
          back: card.back || '',
          setId: targetSet,
          category,
          imageUrl: card.imageUrl || null,
          toastGuid: null,
          status: 'active',
          source: 'ai-menu-studio',
          cardType: 'standard',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        published++
        await setDoc(doc(db, 'flashcardSets', targetSet), { cardCount: increment(1), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {})
        await addDoc(collection(db, 'flashcards'), {
          front: card.back || '',
          back: card.front,
          setId: targetSet,
          category,
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
        await setDoc(doc(db, 'flashcardSets', targetSet), { cardCount: increment(1), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {})
        if (card.itemId) {
          try {
            await updateDoc(doc(db, COLLECTION, card.itemId), {
              hasFlashcards: true,
              flashcardsUpdatedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          } catch (_) {}
        }
      } catch (e) {
        console.error('Failed to publish card:', card.front, e)
      }
    }
    if (toPublish.some((c) => c.itemId)) {
      const snap = await getDocs(collection(db, COLLECTION))
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => !i.hasFlashcards).sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')))
    }
    setGeneratedCards((prev) => prev.filter((c) => !c.selected || !c.targetSet))
    setDefaultTargetSet('')
    setScanMenuMessage(`Published ${published} flashcard${published !== 1 ? 's' : ''} (standard + reverse) successfully!`)
  }

  async function handlePublishGeneratedCards() {
    const toPublish = generatedCards.filter((c) => c.selected && c.targetSet)
    if (toPublish.length === 0) return
    await handlePublishSelectedFlashcards()
  }

  async function handleSaveGeneratedFlashcards() {
    const cards = generatedCards.filter((c) => c.selected && c.front)
    if (cards.length === 0) return
    try {
      const categoryName = categoryTab !== 'all' ? categoryTab : 'Menu Knowledge'
      const setDoc = {
        title: `${categoryName} Flashcards`,
        category: 'Menu',
        description: `AI-generated from Menu Studio — ${categoryName}`,
        cards: cards.map((c) => ({
          front: c.front || '',
          back: c.back || '',
          ...(c.imageUrl && { imageUrl: c.imageUrl }),
        })).filter((c) => c.front && c.back),
        source: 'ai-menu-studio',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      await addDoc(collection(db, 'customFlashcardSets'), setDoc)
      setGeneratedCards([])
      setDefaultTargetSet('')
      setScanMenuMessage(`Saved ${setDoc.cards.length} flashcards to "${setDoc.title}"`)
    } catch (e) {
      setScanMenuError(`Failed to save flashcards: ${e.message}`)
    }
  }

  return (
    <>
      <AppHeader />
      <div className="container mx-auto px-4 pb-8">
        <OwnerNavBar />
        <div className="content-area">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Menu Studio</h2>
          <p className="text-gray-600 text-sm mb-6">
            Manage menu items, import from Toast, and generate flashcards with AI.
          </p>

          {ghostNames.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 flex flex-wrap items-center justify-between gap-2" role="alert">
              <span className="text-amber-900 font-medium">
                {ghostNames.length} discarded item{ghostNames.length !== 1 ? 's have' : ' has'} returned to the live menu.
              </span>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setShowGraveyard(true)}
              >
                View graveyard
              </button>
            </div>
          )}

          {/* Action buttons row */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-small" onClick={() => setAddOpen(true)}>
              Add item
            </button>
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={handleToastImport}
              disabled={toastImportLoading}
            >
              {toastImportLoading ? 'Importing…' : 'Import from Toast'}
            </button>
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={handleScanMenu}
              disabled={scanMenuLoading}
            >
              {scanMenuLoading ? 'Scanning…' : 'Check for new items'}
            </button>
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={handleAiGenerate}
            >
              Generate flashcards (AI)
            </button>
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={handleAiSemanticCleanup}
              disabled={aiCleanupLoading}
            >
              {aiCleanupLoading ? 'AI Scanning…' : 'Run AI cleanup'}
            </button>
            {!upsellingSetExists && (
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={async () => {
                try {
                  const result = await seedUpsellingSet()
                  setUpsellingSeedMessage(result.message)
                  if (result.created || result.alreadyExists) {
                    setUpsellingSetExists(true)
                    if (result.created) {
                      const snap = await getDocs(collection(db, 'flashcardSets'))
                      setFlashcardSets(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
                    }
                  }
                } catch (e) {
                  setUpsellingSeedMessage(`Error: ${e?.message || 'Failed'}`)
                }
                setTimeout(() => setUpsellingSeedMessage(null), 4000)
              }}
            >
              Add Upselling Set
            </button>
            )}
            {upsellingSeedMessage && (
              <span className="text-sm text-gray-600">{upsellingSeedMessage}</span>
            )}
            <label className="flex items-center gap-2 ml-auto">
              <input
                type="checkbox"
                checked={showGraveyard}
                onChange={(e) => setShowGraveyard(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                {ghostNames.length > 0 ? `Graveyard (${ghostNames.length} Returned)` : 'Show graveyard'}
              </span>
            </label>
          </div>

          {/* Search bar (full width) */}
          <div className="mb-3">
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm placeholder-gray-400 focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              placeholder="Search items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* View toggle + category tabs */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex gap-1 mr-3 border-r border-gray-200 pr-3">
              <button
                type="button"
                className={`btn btn-small ${viewMode === 'list' ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : 'btn-secondary'}`}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
              <button
                type="button"
                className={`btn btn-small ${viewMode === 'gallery' ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : 'btn-secondary'}`}
                onClick={() => setViewMode('gallery')}
              >
                Gallery
              </button>
            </div>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`btn btn-small ${categoryTab === cat ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : 'btn-secondary'}`}
                onClick={() => setCategoryTab(cat)}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>

          {toastImportError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {toastImportError}
            </div>
          )}
          {scanMenuError && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert" aria-live="polite">
              {scanMenuError}
            </div>
          )}
          {scanMenuMessage && !scanMenuError && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status" aria-live="polite">
              {scanMenuMessage}
            </div>
          )}
          {aiCleanupMessage && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800" role="status" aria-live="polite">
              {aiCleanupMessage}
            </div>
          )}

          {pendingMenuUpdates.length > 0 && (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4" aria-live="polite">
              <h3 className="font-bold text-gray-800 mb-2">Pending from Toast ({pendingMenuUpdates.length})</h3>
              <p className="text-sm text-gray-600 mb-3">Review and publish or dismiss. Use AI cleanup to find semantic duplicates.</p>
              <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" className="btn btn-small" onClick={handlePublishAllPending}>
                  Publish all
                </button>
                <button type="button" className="btn btn-small btn-secondary" onClick={() => setPendingMenuUpdates([])}>
                  Dismiss all
                </button>
              </div>
              <ul className="space-y-2 max-h-64 overflow-auto">
                {pendingMenuUpdates.map((it, idx) => (
                  <li key={`${it.name}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white p-2 text-sm">
                    <span className="font-medium text-gray-800">{it.name}</span>
                    {it.category && <span className="text-gray-500">{it.category}</span>}
                    <div className="flex gap-1">
                      <button type="button" className="btn btn-small" onClick={() => handlePublishPendingItem(idx)}>
                        Publish
                      </button>
                      <button type="button" className="btn btn-small btn-secondary" onClick={() => handleDismissPendingItem(idx)}>
                        Dismiss
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reviewVisible && reviewQueue.length > 0 && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">
                  Scan Results ({reviewQueue.length} items)
                </h3>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-small" onClick={handleApplyAllMatches}>
                    ✅ Apply all matches &amp; patch images
                  </button>
                  <button type="button" className="btn btn-small btn-secondary" onClick={() => setReviewVisible(false)}>
                    Close
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mb-4 flex-wrap">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                  🟢 {reviewQueue.filter((q) => q.matchType === 'new').length} New
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                  🟣 {reviewQueue.filter((q) => q.matchType === 'ai').length} AI Matched
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                  🟡 {reviewQueue.filter((q) => q.matchType === 'fuzzy').length} Fuzzy Match
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                  🔴 {reviewQueue.filter((q) => q.matchType === 'exact').length} Exact Match
                </span>
              </div>

              <div className="space-y-2 max-h-[70vh] overflow-auto">
                {reviewQueue.map((entry, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      entry.status === 'dismissed'
                        ? 'opacity-40 border-gray-200 bg-gray-50'
                        : entry.matchType === 'new'
                          ? 'border-green-200 bg-green-50/50'
                          : entry.matchType === 'ai'
                            ? 'border-purple-200 bg-purple-50/50'
                            : entry.matchType === 'fuzzy'
                              ? 'border-yellow-200 bg-yellow-50/50'
                              : 'border-red-200 bg-red-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {entry.toastItem.imageUrl ? (
                        <img
                          src={entry.toastItem.imageUrl}
                          alt=""
                          className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-400 text-[10px] text-center leading-tight">
                          No image
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-800 text-sm">{entry.toastItem.name}</span>
                          {entry.matchType === 'new' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-200 text-green-900">
                              NEW — NEEDS FLASHCARD
                            </span>
                          )}
                          {entry.matchType === 'exact' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-200 text-red-900">
                              EXACT MATCH
                            </span>
                          )}
                          {entry.matchType === 'fuzzy' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-200 text-yellow-900">
                              ~{entry.matchScore}% MATCH
                            </span>
                          )}
                          {entry.matchType === 'ai' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-200 text-purple-900">
                              🤖 AI MATCH ({entry.aiConfidence})
                            </span>
                          )}
                        </div>

                        {entry.matchedTo && (
                          <div className="text-xs mt-1.5 p-2 rounded bg-white/70 border border-gray-100">
                            <span className="text-gray-500">Matches → </span>
                            <strong className="text-gray-700">&quot;{entry.matchedTo.name}&quot;</strong>
                            <span className="ml-1 text-gray-400 text-[10px]">
                              ({entry.matchedTo.source === 'flashcard' ? '📚 Flashcard' : entry.matchedTo.source === 'firestore-flashcard' ? '📚 Firestore' : '📋 Menu Studio'})
                            </span>
                            {entry.aiReasoning && (
                              <div className="text-gray-400 text-[10px] mt-0.5 italic">
                                AI: {entry.aiReasoning}
                              </div>
                            )}
                          </div>
                        )}

                        {entry.matchedTo && entry.status === 'pending' && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <button
                              type="button"
                              className="px-2 py-1 text-[11px] font-medium rounded bg-blue-100 text-blue-800 hover:bg-blue-200 transition"
                              onClick={() => handleKeepCurrentName(idx)}
                            >
                              ✅ Keep &quot;{entry.matchedTo.name}&quot; {entry.toastItem.imageUrl ? '+ add image' : ''}
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 text-[11px] font-medium rounded bg-orange-100 text-orange-800 hover:bg-orange-200 transition"
                              onClick={() => handleRenameToToast(idx)}
                            >
                              ✏️ Rename to &quot;{entry.toastItem.name}&quot; {entry.toastItem.imageUrl ? '+ add image' : ''}
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 text-[11px] font-medium rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                              onClick={() => handleNotAMatch(idx)}
                            >
                              ❌ Not a match
                            </button>
                          </div>
                        )}

                        {entry.status === 'approved' && entry.action === 'kept' && (
                          <div className="mt-2 text-[11px] font-medium text-green-600">
                            ✅ Confirmed — kept as &quot;{entry.matchedTo?.name}&quot; {entry.toastItem.imageUrl ? '(image updated)' : ''}
                          </div>
                        )}
                        {entry.status === 'approved' && entry.action === 'renamed' && (
                          <div className="mt-2 text-[11px] font-medium text-orange-600">
                            ✏️ Renamed to &quot;{entry.toastItem.name}&quot; {entry.toastItem.imageUrl ? '(image updated)' : ''}
                          </div>
                        )}
                        {entry.status === 'dismissed' && (
                          <span className="text-[10px] text-gray-400 mt-1 inline-block">Marked as not a match</span>
                        )}

                        {entry.toastItem.description && (
                          <p className="text-[11px] text-gray-400 mt-1.5 truncate max-w-xl">{entry.toastItem.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {addOpen && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-bold text-gray-800 mb-2">New menu item</h3>
              <input
                className="mb-2 w-full max-w-md rounded border border-gray-300 px-2 py-1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
              />
              <textarea
                className="mb-2 w-full max-w-md rounded border border-gray-300 px-2 py-1"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description"
                rows={2}
              />
              <input
                className="mb-3 w-full max-w-md rounded border border-gray-300 px-2 py-1"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="Category"
              />
              <div className="flex gap-2">
                <button type="button" className="btn btn-small" onClick={handleAdd}>
                  Save
                </button>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setAddOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {generatedCards.length > 0 && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">
                  Generated Flashcards ({generatedCards.filter((c) => c.selected).length}/{generatedCards.length} selected)
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-small btn-secondary"
                    onClick={() => setGeneratedCards((prev) => prev.map((c) => ({ ...c, selected: true })))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-secondary"
                    onClick={() => setGeneratedCards((prev) => prev.map((c) => ({ ...c, selected: false })))}
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              <div className="mb-4 flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Default deck:</label>
                <select
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm"
                  value={defaultTargetSet}
                  onChange={(e) => {
                    const val = e.target.value
                    setDefaultTargetSet(val)
                    setGeneratedCards((prev) => prev.map((c) => (c.targetSet === '' ? { ...c, targetSet: val } : c)))
                  }}
                >
                  <option value="">— Pick a deck —</option>
                  {flashcardSets.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                {generatedCards.map((card, idx) => {
                  const isFlipped = previewFlippedIndex === idx
                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border-2 p-4 transition-all ${
                        card.selected ? 'border-green-500 bg-green-50/30' : 'border-gray-200 bg-gray-50 opacity-60'
                      }`}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={card.selected}
                          onChange={() => setGeneratedCards((prev) => prev.map((c, i) => (i === idx ? { ...c, selected: !c.selected } : c)))}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div
                          className="flex-1 min-h-[120px] cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition-all hover:border-gray-300"
                          onClick={() => setPreviewFlippedIndex((prev) => (prev === idx ? null : idx))}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setPreviewFlippedIndex((prev) => (prev === idx ? null : idx))
                            }
                          }}
                          aria-label={isFlipped ? 'Tap to show front' : 'Tap to see back'}
                        >
                          {!isFlipped ? (
                            <>
                              {card.imageUrl && (
                                <img src={card.imageUrl} alt="" className="w-full h-28 object-cover rounded-lg mb-2" />
                              )}
                              <p className="font-bold text-gray-800 text-sm">{card.front}</p>
                              <p className="text-xs text-gray-500 mt-1">Tap to see back →</p>
                            </>
                          ) : (
                            <>
                              <div className="text-gray-800 text-xs whitespace-pre-line line-clamp-6">
                                {card.back || ''}
                              </div>
                              <p className="text-xs text-gray-500 mt-1">← Tap to flip back</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPreviewFlippedIndex((prev) => (prev === idx ? null : idx))
                          }}
                        >
                          {isFlipped ? '✅ View' : '👁 Preview'}
                        </button>
                        <select
                          className="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-xs"
                          value={card.targetSet}
                          onChange={(e) => setGeneratedCards((prev) => prev.map((c, i) => (i === idx ? { ...c, targetSet: e.target.value } : c)))}
                        >
                          <option value="">— Pick deck —</option>
                          {flashcardSets.map((s) => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={!generatedCards.some((c) => c.selected && c.targetSet)}
                  onClick={handlePublishSelectedFlashcards}
                >
                  Publish selected ({generatedCards.filter((c) => c.selected && c.targetSet).length})
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={() => { setGeneratedCards([]); setDefaultTargetSet('') }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <SkeletonCards count={6} />
          ) : viewMode === 'list' ? (
            <div className="space-y-1">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border px-4 py-3 ${isGhost(item) ? 'border-red-400 bg-red-50/50' : item.inGraveyard ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'}`}
                >
                  {editingItemId === item.id ? (
                    <div>
                      <input
                        className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Name"
                      />
                      <textarea
                        className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        value={editForm.description}
                        onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Description"
                        rows={2}
                      />
                      <input
                        className="mb-3 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        value={editForm.category}
                        onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                        placeholder="Category"
                      />
                      <div className="flex gap-2">
                        <button type="button" className="btn btn-small" onClick={() => { handleSaveItem(item.id, editForm); setEditingItemId(null) }}>
                          Save
                        </button>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditingItemId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        {item.imageUrl ? (
                          <div className="relative flex-shrink-0">
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(item)}
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-xs leading-none hover:bg-red-700"
                              aria-label="Remove image"
                            >
                              ×
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddOrChangeImage(item)}
                              className="absolute inset-0 rounded-lg bg-black/0 hover:bg-black/20 flex items-center justify-center text-white text-xs"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddOrChangeImage(item)}
                            className="w-10 h-10 rounded-lg border border-dashed border-gray-300 text-gray-400 text-xs hover:border-gray-400 hover:text-gray-600 flex-shrink-0"
                          >
                            + Image
                          </button>
                        )}
                        <span className="font-semibold text-gray-800">{item.name || 'Untitled'}</span>
                        {item._sizeLabel && (
                          <span className="text-xs text-blue-600 font-medium">{item._sizeLabel}</span>
                        )}
                        {item._variantIds?.length > 1 && (
                          <span className="text-[10px] text-gray-400">({item._variantIds.length} sizes combined)</span>
                        )}
                        {isGhost(item) && (
                          <span className="ml-2 rounded bg-red-200 px-2 py-0.5 text-xs font-medium text-red-900">Returned to menu</span>
                        )}
                        {item.category && <span className="ml-2 text-xs text-gray-500">{item.category}</span>}
                        {item.description && <p className="mt-0.5 truncate text-sm text-gray-600 max-w-md">{item.description}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" className="btn btn-small" onClick={() => { setEditingItemId(item.id); setEditForm({ name: item.name || '', description: item.description || '', category: item.category || 'General' }) }}>
                          Edit
                        </button>
                        {item.inGraveyard ? (
                          <button type="button" className="btn btn-small btn-secondary" onClick={() => handleRestore(item)}>Restore</button>
                        ) : (
                          <button type="button" className="btn btn-small btn-secondary" onClick={() => handleGraveyard(item)}>To graveyard</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  inGraveyard={!!item.inGraveyard}
                  isGhost={isGhost(item)}
                  onEdit={handleSaveItem}
                  onGraveyard={handleGraveyard}
                  onRestore={handleRestore}
                  onRemoveImage={handleRemoveImage}
                  onAddOrChangeImage={handleAddOrChangeImage}
                />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-gray-600 mb-4">No items yet. Add manually or import from Toast.</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" className="btn btn-small" onClick={() => setAddOpen(true)}>
                  Add item
                </button>
                <button type="button" className="btn btn-small btn-secondary" onClick={handleToastImport} disabled={toastImportLoading}>
                  {toastImportLoading ? 'Importing…' : 'Import from Toast'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Remove image confirmation */}
      {confirmRemoveImageItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-800">Remove image from this item?</h3>
            <p className="mt-2 text-sm text-gray-600">Any flashcards using this image will also have their image cleared.</p>
            <div className="mt-6 flex gap-3 justify-end">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmRemoveImageItem(null)}>Cancel</button>
              <button type="button" className="btn bg-red-600 hover:bg-red-700 text-white" onClick={handleConfirmRemoveImage}>Remove image</button>
            </div>
          </div>
        </div>
      )}

      {/* Image gallery picker modal: Gallery tab + Upload tab */}
      {imageGalleryOpen && imageGalleryTargetItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="gallery-title">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap">
              <h2 id="gallery-title" className="text-lg font-bold text-gray-800">Choose image</h2>
              <button type="button" className="text-gray-500 hover:text-gray-700" onClick={() => { setImageGalleryOpen(false); setImageGalleryTargetItemId(null) }} aria-label="Close">×</button>
            </div>
            <div className="flex border-b border-gray-200">
              <button
                type="button"
                onClick={() => setImagePickerTab('gallery')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${imagePickerTab === 'gallery' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-gray-600 hover:text-gray-800'}`}
              >
                Gallery
              </button>
              <button
                type="button"
                onClick={() => setImagePickerTab('upload')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${imagePickerTab === 'upload' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-gray-600 hover:text-gray-800'}`}
              >
                Upload
              </button>
            </div>
            {imagePickerTab === 'gallery' && (
              <>
                <div className="p-4 border-b border-gray-200">
                  <input
                    type="text"
                    value={gallerySearch}
                    onChange={(e) => setGallerySearch(e.target.value)}
                    placeholder="Search by item name..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {galleryItemsLoading ? (
                    <p className="text-sm text-gray-500 py-4">Loading gallery…</p>
                  ) : (
                    (() => {
                      const filteredGallery = galleryItems.filter((i) =>
                        (i.name || '').toLowerCase().includes(gallerySearch.toLowerCase().trim())
                      )
                      return (
                        <>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                            {filteredGallery.map((i) => (
                              <button
                                key={i.id}
                                type="button"
                                onClick={() => handleSelectGalleryImage(i.imageUrl)}
                                className="relative rounded-lg overflow-hidden border-2 border-gray-200 hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] aspect-square bg-gray-100"
                              >
                                <img src={i.imageUrl} alt={i.name || ''} className="w-full h-full object-cover" />
                                <span className="block truncate text-xs p-1 bg-white/90 absolute bottom-0 left-0 right-0">{i.name || 'Item'}</span>
                              </button>
                            ))}
                          </div>
                          {filteredGallery.length === 0 && (
                            <p className="text-sm text-gray-500 py-4">{gallerySearch ? 'No matching images.' : 'No images in menu yet. Use the Upload tab to add one.'}</p>
                          )}
                        </>
                      )
                    })()
                  )}
                </div>
              </>
            )}
            {imagePickerTab === 'upload' && (
              <div className="flex-1 overflow-y-auto p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Upload new image</label>
                <input
                  type="file"
                  accept="image/*"
                  disabled={galleryUploading}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-white file:cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleGalleryUpload(file)
                    e.target.value = ''
                  }}
                />
                {galleryUploading && <p className="mt-2 text-sm text-gray-500">Uploading…</p>}
              </div>
            )}
          </div>
        </div>
      )}
      <AiFlashcardWizard
        open={showAiWizard}
        onClose={() => setShowAiWizard(false)}
        items={showGraveyard ? [] : filtered}
        flashcardSets={flashcardSets}
        onPublished={async (count) => {
          setScanMenuMessage(`Published ${count} card${count !== 1 ? 's' : ''} (standard + reverse) via AI Wizard!`)
          try {
            const snap = await getDocs(collection(db, COLLECTION))
            setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => !i.hasFlashcards).sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')))
            const setSnap = await getDocs(collection(db, 'flashcardSets'))
            setFlashcardSets(setSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
          } catch (_) {}
        }}
      />
    </>
  )
}
