import { useState, useEffect, useRef } from 'react'
import { getAllMenuStudioItems, updateMenuItem } from '../services/menuStudioService'
import { getActiveFlashcards, getAllFlashcardSets } from '../services/flashcardService'
import { getToastMenus } from '../services/toast'
import { useToastStoreGuids } from './useToastStoreGuids'
import {
  flattenToastMenus,
  dedupeByName,
  computeGhostNames,
  normalizeForComparison,
} from '../utils/menuStudioHelpers'

/**
 * Extracts all data-loading logic from MenuStudioPage.
 *
 * @param {object} options
 * @param {boolean} options.imageGalleryOpen - whether the image gallery modal is open
 * @param {string|null} options.imageGalleryTargetItemId - the item id targeted by the gallery modal
 *
 * Returns all loaded data state + their setters (page needs setters for optimistic updates).
 */
export function useMenuStudioData({ imageGalleryOpen, imageGalleryTargetItemId } = {}) {
  const { getMenuRestaurantGuid } = useToastStoreGuids()

  // --- Menu studio items ---
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  // --- Flashcard sets + upselling set tracking ---
  const [flashcardSets, setFlashcardSets] = useState([])
  const [upsellingSetExists, setUpsellingSetExists] = useState(false)

  // --- Ghost / missing items ---
  const [ghostNames, setGhostNames] = useState([])

  // --- Image gallery ---
  const [galleryItems, setGalleryItems] = useState([])
  const [galleryItemsLoading, setGalleryItemsLoading] = useState(false)

  // Prevent re-fetching ghosts on every items change — only fetch once after first load
  const ghostFetchedOnce = useRef(false)

  // -----------------------------------------------------------------------
  // Effect: load menu studio items from Firestore and reconcile flashcards
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const allItems = await getAllMenuStudioItems()
        if (cancelled) return

        // Reconcile: cross-reference against existing flashcards by name
        const activeCards = await getActiveFlashcards()
        if (cancelled) return
        const fcNames = new Set()
        for (const card of activeCards) {
          const name = card.front || card.name || ''
          if (name) fcNames.add(normalizeForComparison(name))
        }

        // Mark menu items that already have flashcards
        const toMark = allItems.filter((i) => !i.hasFlashcards && fcNames.has(normalizeForComparison(i.name)))
        if (toMark.length > 0) {
          console.log(`🔄 Auto-reconciling ${toMark.length} menu items with existing flashcards`)
          for (const item of toMark) {
            try {
              await updateMenuItem(item.id, { hasFlashcards: true })
            } catch (_) {}
          }
        }

        const list = allItems
          .filter((i) => !i.hasFlashcards && !fcNames.has(normalizeForComparison(i.name)))
        list.sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''))
        if (!cancelled) setItems(list)
      } catch (_) {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // -----------------------------------------------------------------------
  // Effect: load flashcard sets (for AI wizard deck picker, upselling check)
  // -----------------------------------------------------------------------
  useEffect(() => {
    async function loadSets() {
      try {
        const sets = (await getAllFlashcardSets()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        setFlashcardSets(sets)
        setUpsellingSetExists(sets.some((s) => s.id === 'upselling'))
      } catch (e) {
        console.error('Failed to load flashcard sets:', e)
      }
    }
    loadSets()
  }, [])

  // -----------------------------------------------------------------------
  // Effect: detect ghost items (items discarded locally but still on Toast menu)
  // Runs once after items first load. Depends on items + restaurantGuid.
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Effect: load gallery items when the image gallery modal opens
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!imageGalleryOpen || !imageGalleryTargetItemId) {
      setGalleryItems([])
      return
    }
    let cancelled = false
    setGalleryItemsLoading(true)
    getAllMenuStudioItems()
      .then((allItems) => {
        if (cancelled) return
        setGalleryItems(allItems.filter((i) => i.imageUrl && String(i.imageUrl).trim()))
      })
      .catch(() => {
        if (!cancelled) setGalleryItems([])
      })
      .finally(() => {
        if (!cancelled) setGalleryItemsLoading(false)
      })
    return () => { cancelled = true }
  }, [imageGalleryOpen, imageGalleryTargetItemId])

  return {
    // Items
    items,
    setItems,
    loading,
    // Flashcard sets
    flashcardSets,
    setFlashcardSets,
    upsellingSetExists,
    setUpsellingSetExists,
    // Ghosts
    ghostNames,
    setGhostNames,
    // Gallery
    galleryItems,
    galleryItemsLoading,
  }
}
