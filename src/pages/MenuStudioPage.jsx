import { useState, useEffect, useMemo, useRef } from 'react'
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import MenuItemCard from '../components/MenuItemCard'
import SkeletonCards from '../components/SkeletonCard'
import { useToastStoreGuids } from '../hooks/useToastStoreGuids'
import { getToastMenus } from '../services/toast'
import { generateFlashcards } from '../services/ai'
import { processIncomingItems, runAiSemanticScan } from '../services/MenuIngestionService'
import { callGemini } from '../services/ai'

const COLLECTION = 'menuStudio'
const PENDING_MENU_STORAGE_KEY = 'charlestons_pending_menu_updates'

function flattenToastMenus(data) {
  const items = []
  if (!data || typeof data !== 'object') return items
  const menus = Array.isArray(data) ? data : data.menus || data.items || []
  for (const menu of menus) {
    const menuName = menu.name || menu.displayName || 'Menu'
    const groups = menu.menuItemGroups || menu.groups || []
    for (const grp of groups) {
      const cat = grp.name || grp.displayName || menuName
      const entries = grp.menuItems || grp.items || []
      for (const ent of entries) {
        const name = ent.name || ent.displayName || ent.description || ''
        const description = ent.description || ent.displayName || ''
        const guid = ent.guid ?? ent.id
        const imageUrl = ent.imageUrl ?? ent.image ?? ent.imageUrlLarge
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
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
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
  const [scanMenuError, setScanMenuError] = useState(null)
  const [scanMenuMessage, setScanMenuMessage] = useState(null)
  const [aiCleanupLoading, setAiCleanupLoading] = useState(false)
  const [aiCleanupMessage, setAiCleanupMessage] = useState(null)
  const [ghostNames, setGhostNames] = useState([])

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
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
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
    const set = new Set(items.map((i) => i.category || 'General'))
    return ['all', ...Array.from(set).sort()]
  }, [items])

  const filtered = useMemo(() => {
    let list = items.filter((i) => Boolean(i.inGraveyard) === showGraveyard)
    if (categoryTab !== 'all') list = list.filter((i) => (i.category || 'General') === categoryTab)
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter((i) => (i.name || '').toLowerCase().includes(s) || (i.description || '').toLowerCase().includes(s))
    }
    return list
  }, [items, categoryTab, search, showGraveyard])

  const ghostNamesSet = useMemo(() => new Set(ghostNames), [ghostNames])
  const isGhost = (item) => item.inGraveyard && ghostNamesSet.has(normName(item.name))

  async function handleSaveItem(id, data) {
    const ref = doc(db, COLLECTION, id)
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...data } : i)))
  }

  async function handleGraveyard(id) {
    await handleSaveItem(id, { inGraveyard: true })
  }

  async function handleRestore(id) {
    await handleSaveItem(id, { inGraveyard: false })
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
      const ref = collection(db, COLLECTION)
      for (const it of deduped.slice(0, 200)) {
        await addDoc(ref, {
          name: it.name,
          description: it.description || '',
          category: it.category || 'Toast',
          inGraveyard: false,
          source: 'toast',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      const snap = await getDocs(collection(db, COLLECTION))
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (e) {
      setToastImportError(e.message || 'Import failed')
    } finally {
      setToastImportLoading(false)
    }
  }

  async function handleScanMenu() {
    const restaurantGuid = getMenuRestaurantGuid()
    if (!restaurantGuid) {
      setScanMenuError('No Toast menu GUID configured. Set it in Admin → Settings.')
      return
    }
    setScanMenuLoading(true)
    setScanMenuError(null)
    setScanMenuMessage(null)
    try {
      const result = await getToastMenus(restaurantGuid)
      const data = result.data ?? result
      const flat = flattenToastMenus(data)
      const deduped = dedupeByName(flat)
      const imagePatchLog = []
      const { newItems, updatedItems, duplicates } = processIncomingItems(
        deduped,
        items,
        (dbItem, incomingItem, patch) => {
          imagePatchLog.push(`Updated image for ${dbItem?.name ?? dbItem?.front ?? 'item'}`)
        }
      )
      for (const u of updatedItems) {
        const ref = doc(db, COLLECTION, u.id)
        await updateDoc(ref, { ...u.patch, updatedAt: serverTimestamp() })
      }
      if (updatedItems.length > 0) {
        const snap = await getDocs(collection(db, COLLECTION))
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      }
      setPendingMenuUpdates((prev) => dedupeByName([...prev, ...newItems]))
      setGhostNames(computeGhostNames(items, deduped))
      const parts = []
      if (imagePatchLog.length > 0) parts.push(imagePatchLog.slice(0, 5).join('. ') + (imagePatchLog.length > 5 ? ` (+${imagePatchLog.length - 5} more)` : ''))
      if (duplicates.exact + duplicates.fuzzy > 0) parts.push(`${duplicates.exact} exact, ${duplicates.fuzzy} fuzzy duplicates skipped.`)
      if (newItems.length > 0) parts.push(`${newItems.length} new item(s) added to Pending.`)
      if (parts.length > 0) setScanMenuMessage(parts.join(' '))
      if (newItems.length === 0 && updatedItems.length === 0 && duplicates.exact + duplicates.fuzzy === 0) setScanMenuError('No new items found in Toast.')
    } catch (e) {
      setScanMenuError(e.message || 'Scan failed')
    } finally {
      setScanMenuLoading(false)
    }
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
    if (pendingMenuUpdates.length === 0) {
      setAiCleanupMessage('No pending items to scan.')
      return
    }
    setAiCleanupLoading(true)
    setAiCleanupMessage(null)
    try {
      const { duplicatePairs, error } = await runAiSemanticScan(pendingMenuUpdates, items, callGemini)
      if (error) {
        setAiCleanupMessage(`AI scan failed: ${error}`)
        return
      }
      const indicesToRemove = new Set(duplicatePairs.map((p) => p.pendingIndex))
      const imageUpdates = []
      for (const { databaseId, databaseItem, pendingItem } of duplicatePairs) {
        const incomingUrl = pendingItem?.imageUrl ?? pendingItem?.image
        const existingUrl = databaseItem?.imageUrl ?? databaseItem?.image
        if (incomingUrl && !existingUrl) {
          imageUpdates.push({ id: databaseId, imageUrl: incomingUrl })
        }
      }
      for (const u of imageUpdates) {
        const ref = doc(db, COLLECTION, u.id)
        await updateDoc(ref, { imageUrl: u.imageUrl, updatedAt: serverTimestamp() })
      }
      if (imageUpdates.length > 0) {
        const snap = await getDocs(collection(db, COLLECTION))
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      }
      setPendingMenuUpdates((prev) => prev.filter((_, i) => !indicesToRemove.has(i)))
      setAiCleanupMessage(
        indicesToRemove.size > 0
          ? `AI detected ${indicesToRemove.size} duplicate(s); moved to graveyard.${imageUpdates.length > 0 ? ` Updated images for ${imageUpdates.length} item(s).` : ''}`
          : 'No additional duplicates found.'
      )
    } catch (e) {
      setAiCleanupMessage(e?.message || 'AI cleanup failed')
    } finally {
      setAiCleanupLoading(false)
    }
  }

  async function handleAiGenerate() {
    const list = showGraveyard ? [] : filtered
    const text = list.slice(0, 50).map((i) => `${i.name}: ${i.description || ''}`).join('\n')
    if (!text.trim()) {
      setAiResult('Add or import menu items first.')
      return
    }
    setAiLoading(true)
    setAiResult(null)
    try {
      const cards = await generateFlashcards(text, 10)
      setAiResult(JSON.stringify(cards, null, 2))
    } catch (e) {
      setAiResult(`Error: ${e.message}`)
    } finally {
      setAiLoading(false)
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

          <div className="mb-6 flex flex-wrap items-center gap-4">
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
              disabled={aiLoading}
            >
              {aiLoading ? 'Generating…' : 'Generate flashcards (AI)'}
            </button>
            <label className="flex items-center gap-2">
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
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={handleAiSemanticCleanup}
                  disabled={aiCleanupLoading}
                >
                  {aiCleanupLoading ? 'Scanning…' : 'Run AI cleanup'}
                </button>
              </div>
              {aiCleanupMessage && (
                <p className="text-sm text-gray-700 mb-2" role="status">{aiCleanupMessage}</p>
              )}
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

          <div className="mb-4 flex flex-wrap items-center gap-2">
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
            <input
              type="text"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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

          {aiResult != null && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="font-bold text-gray-800 mb-2">Generated flashcards (copy to use)</h3>
              <pre className="max-h-64 overflow-auto text-xs text-gray-700 whitespace-pre-wrap">{aiResult}</pre>
              <button type="button" className="btn btn-small mt-2" onClick={() => setAiResult(null)}>
                Close
              </button>
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
                      <div className="min-w-0">
                        <span className="font-semibold text-gray-800">{item.name || 'Untitled'}</span>
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
                          <button type="button" className="btn btn-small btn-secondary" onClick={() => handleRestore(item.id)}>Restore</button>
                        ) : (
                          <button type="button" className="btn btn-small btn-secondary" onClick={() => handleGraveyard(item.id)}>To graveyard</button>
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
    </>
  )
}
