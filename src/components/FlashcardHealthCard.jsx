import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import FlashcardCleanupModal from './FlashcardCleanupModal'

async function backfillCardCounts() {
  const setsSnap = await getDocs(collection(db, 'flashcardSets'))
  for (const setDoc of setsSnap.docs) {
    const setId = setDoc.id
    const cardsQuery = query(
      collection(db, 'flashcards'),
      where('setId', '==', setId)
    )
    const cardsSnap = await getDocs(cardsQuery)
    const count = cardsSnap.docs.filter((d) => d.data().status !== 'graveyarded').length
    await updateDoc(doc(db, 'flashcardSets', setId), {
      cardCount: count,
      cardCountUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

export default function FlashcardHealthCard({ reloadTrigger = 0, onRefresh }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCleanup, setShowCleanup] = useState(false)
  const [backfilling, setBackfilling] = useState(false)

  useEffect(() => {
    async function loadStats() {
      try {
        const snap = await getDocs(collection(db, 'flashcards'))
        const allCards = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        const active = allCards.filter((c) => c.status !== 'graveyarded')
        const frontMap = {}
        const duplicateIds = new Set()
        active.forEach((c) => {
          if (!c.front || !c.front.trim()) return
          const key = c.front.trim().toLowerCase()
          if (frontMap[key]) {
            duplicateIds.add(c.id)
            duplicateIds.add(frontMap[key])
          } else {
            frontMap[key] = c.id
          }
        })
        const missingImages = active.filter((c) => c.front && c.front.trim() && !c.imageUrl)
        const emptyCards = active.filter((c) => !c.front || !c.front.trim())
        const imageOnly = active.filter((c) => c.imageUrl && (!c.front || !c.front.trim()))
        setStats({
          total: active.length,
          duplicates: duplicateIds.size,
          missingImages: missingImages.length,
          emptyCards: emptyCards.length,
          imageOnly: imageOnly.length,
          sets: [...new Set(active.map((c) => c.setId).filter(Boolean))].length,
        })
      } catch (e) {
        console.warn('Flashcard health load failed', e)
        setStats({ total: 0, duplicates: 0, missingImages: 0, emptyCards: 0, imageOnly: 0, sets: 0 })
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [reloadTrigger])

  const isHealthy = stats && stats.duplicates === 0 && stats.emptyCards === 0

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🃏</span>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Flashcards</h3>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            isHealthy ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {loading ? '...' : isHealthy ? '✅ HEALTHY' : '⚠️ NEEDS ATTENTION'}
        </span>
      </div>
      {loading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
        </div>
      ) : stats ? (
        <div className="space-y-2.5">
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Active Cards:</span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {stats.total} across {stats.sets} sets
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Duplicates:</span>
            <span className={`font-semibold ${stats.duplicates > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.duplicates > 0 ? `⚠️ ${stats.duplicates} found` : '✅ None'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Missing Images:</span>
            <span className={`font-semibold ${stats.missingImages > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {stats.missingImages > 0 ? `📷 ${stats.missingImages}` : '✅ All set'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Empty Cards:</span>
            <span className={`font-semibold ${stats.emptyCards > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.emptyCards > 0 ? `🗑 ${stats.emptyCards} (need cleanup)` : '✅ None'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Orphan Images:</span>
            <span className={`font-semibold ${stats.imageOnly > 0 ? 'text-blue-600' : 'text-green-600'}`}>
              {stats.imageOnly > 0 ? `📎 ${stats.imageOnly} (can attach)` : '✅ None'}
            </span>
          </div>
          <div className="mt-4 pt-3 border-t space-y-2" style={{ borderColor: 'var(--hairline)' }}>
            <button
              type="button"
              onClick={() => setShowCleanup(true)}
              className="w-full px-3 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-semibold"
            >
              Review
            </button>
            <button
              type="button"
              disabled={backfilling}
              onClick={async () => {
                setBackfilling(true)
                try {
                  await backfillCardCounts()
                  alert('Card counts updated!')
                  onRefresh?.()
                } catch (e) {
                  console.error('Backfill failed:', e)
                  alert('Failed: ' + (e?.message || e))
                } finally {
                  setBackfilling(false)
                }
              }}
              className="w-full px-3 py-2 rounded-lg transition-colors text-sm font-semibold disabled:opacity-50" style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--text-secondary)' }}
            >
              {backfilling ? 'Updating…' : '🔄 Recalculate Card Counts'}
            </button>
          </div>
        </div>
      ) : null}
      <FlashcardCleanupModal
        isOpen={showCleanup}
        onClose={() => setShowCleanup(false)}
        onActionComplete={onRefresh}
      />
    </div>
  )
}
