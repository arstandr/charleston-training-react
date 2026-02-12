import { useCallback, useMemo } from 'react'

const FLASHCARD_MASTERY_KEY = 'flashcard_mastery'

function loadStore() {
  try {
    const raw = localStorage.getItem(FLASHCARD_MASTERY_KEY) || '{}'
    return JSON.parse(raw) || {}
  } catch (_) {
    return {}
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(FLASHCARD_MASTERY_KEY, JSON.stringify(store))
  } catch (_) {}
}

export function useFlashcardMastery(traineeId) {
  const getMastery = useCallback(
    (cardId) => {
      if (!traineeId) return { status: null, struggleCount: 0, masteryCount: 0 }
      const store = loadStore()
      const key = `${traineeId}_${cardId}`
      const rec = store[key] || {}
      return {
        status: rec.status || null,
        struggleCount: rec.struggleCount || 0,
        masteryCount: rec.masteryCount || 0,
        lastSeen: rec.lastSeen,
      }
    },
    [traineeId]
  )

  const recordResult = useCallback(
    (cardId, result) => {
      if (!traineeId) return
      const store = loadStore()
      const key = `${traineeId}_${cardId}`
      const rec = store[key] || { struggleCount: 0, masteryCount: 0 }
      const now = Date.now()
      if (result === 'needsPractice' || result === 'struggle') {
        rec.struggleCount = (rec.struggleCount || 0) + 1
        rec.status = 'struggle'
      } else if (result === 'gotIt' || result === 'mastered') {
        rec.masteryCount = (rec.masteryCount || 0) + 1
        if (rec.masteryCount > 2) rec.status = 'mastered'
      }
      rec.lastSeen = now
      store[key] = rec
      saveStore(store)
    },
    [traineeId]
  )

  const getStruggleCards = useCallback(
    (setId) => {
      if (!traineeId) return []
      const store = loadStore()
      return Object.keys(store).filter((k) => {
        if (!k.startsWith(traineeId + '_')) return false
        const cardId = k.slice(traineeId.length + 1)
        return setId ? cardId.startsWith(setId + '_') || cardId === setId : true
      }).filter((k) => store[k].status === 'struggle').map((k) => k.slice(traineeId.length + 1))
    },
    [traineeId]
  )

  const getMasteredCards = useCallback(
    (setId) => {
      if (!traineeId) return []
      const store = loadStore()
      return Object.keys(store).filter((k) => {
        if (!k.startsWith(traineeId + '_')) return false
        const cardId = k.slice(traineeId.length + 1)
        return setId ? cardId.startsWith(setId + '_') || cardId === setId : true
      }).filter((k) => store[k].status === 'mastered').map((k) => k.slice(traineeId.length + 1))
    },
    [traineeId]
  )

  return useMemo(
    () => ({ getMastery, recordResult, getStruggleCards, getMasteredCards }),
    [getMastery, recordResult, getStruggleCards, getMasteredCards]
  )
}
