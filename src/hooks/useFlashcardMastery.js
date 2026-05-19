import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import * as flashcardIntelligence from '../services/flashcardIntelligenceService'

/**
 * Flashcard mastery and progress - 100% Firestore via flashcardIntelligenceService.
 * Uses currentUser.uid (staff) or currentUser.id/traineeId (trainees with session tokens).
 * getMastery / getStruggleCards / getMasteredCards are sync (from in-memory cache).
 * recordResult, buildDeck, getStatistics are async.
 */
export function useFlashcardMastery(traineeIdParam) {
  const { currentUser } = useAuth()
  const userId = currentUser?.uid ?? currentUser?.id ?? currentUser?.traineeId
  const traineeId = traineeIdParam ?? currentUser?.traineeId ?? currentUser?.id ?? userId

  const [masteryRecords, setMasteryRecords] = useState([])
  const [progressRecords, setProgressRecords] = useState([])
  const [statistics, setStatistics] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadCache = useCallback(async () => {
    if (!userId) {
      setMasteryRecords([])
      setProgressRecords([])
      setStatistics(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [mastery, progress, stats] = await Promise.all([
        flashcardIntelligence.getAllMasteryForUser(userId),
        flashcardIntelligence.getAllProgressForUser(userId),
        flashcardIntelligence.getFlashcardStatistics(userId),
      ])
      setMasteryRecords(mastery || [])
      setProgressRecords(progress || [])
      setStatistics(stats || null)
    } catch (e) {
      console.error('useFlashcardMastery loadCache:', e)
      setMasteryRecords([])
      setProgressRecords([])
      setStatistics(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadCache()
  }, [loadCache])

  const masteryByKey = useMemo(() => {
    const map = {}
    masteryRecords.forEach((r) => {
      const key = `${userId}_${r.cardId}`
      map[key] = r
    })
    return map
  }, [userId, masteryRecords])

  const getMastery = useCallback(
    (cardId) => {
      if (!userId || !cardId) return { status: null, struggleCount: 0, masteryCount: 0, lastSeen: 0 }
      const key = `${userId}_${cardId}`
      const r = masteryByKey[key] || {}
      return {
        status: r.status || null,
        struggleCount: r.struggleCount || 0,
        masteryCount: r.masteryCount || 0,
        lastSeen: r.lastSeen,
      }
    },
    [userId, masteryByKey]
  )

  const recordResult = useCallback(
    async (cardId, result, currentSession = null) => {
      if (!userId || !cardId) return
      await flashcardIntelligence.recordFlashcardFeedback(userId, cardId, result, currentSession)
      await flashcardIntelligence.recordFlashcardMastery(userId, cardId, result)
      await loadCache()
    },
    [userId, loadCache]
  )

  const getStruggleCards = useCallback(
    (setId) => {
      if (!userId) return []
      return masteryRecords.filter((r) => r.status === 'struggle').map((r) => r.cardId)
    },
    [userId, masteryRecords]
  )

  const getMasteredCards = useCallback(
    (setId) => {
      if (!userId) return []
      return masteryRecords.filter((r) => r.status === 'mastered').map((r) => r.cardId)
    },
    [userId, masteryRecords]
  )

  // All card IDs with any mastery record (seen at least once, regardless of status)
  const getStudiedCardIds = useCallback(
    () => {
      if (!userId) return []
      return masteryRecords.map((r) => r.cardId)
    },
    [userId, masteryRecords]
  )

  const buildDeck = useCallback(
    async (setId, cards, focusMode, quarantinedCardIds, useLeitner = true) => {
      if (!userId) {
        const raw = (cards || []).map((card) => ({
          card,
          cardId: flashcardIntelligence.stableCardId(setId, card),
        }))
        const deck = flashcardIntelligence.filterQuarantinedCards(raw, quarantinedCardIds || new Set())
        return useLeitner ? { deck, sessionNumber: 1, allCaughtUp: false } : deck
      }
      const result = await flashcardIntelligence.buildStudyDeck(
        setId,
        cards || [],
        userId,
        !!focusMode,
        quarantinedCardIds || new Set(),
        useLeitner
      )
      return result
    },
    [userId]
  )

  const getStatistics = useCallback(async () => {
    if (!userId) return null
    const stats = await flashcardIntelligence.getFlashcardStatistics(userId)
    setStatistics(stats)
    return stats
  }, [userId])

  const getSavedSession = useCallback(() => {
    return userId ? flashcardIntelligence.getSavedSession(userId) : Promise.resolve(null)
  }, [userId])

  return useMemo(
    () => ({
      getMastery,
      recordResult,
      getStruggleCards,
      getMasteredCards,
      getStudiedCardIds,
      buildDeck,
      getStatistics,
      getSavedSession,
      statistics,
      loading,
      traineeId,
      userId,
      reload: loadCache,
    }),
    [
      getMastery,
      recordResult,
      getStruggleCards,
      getMasteredCards,
      getStudiedCardIds,
      buildDeck,
      getStatistics,
      getSavedSession,
      statistics,
      loading,
      traineeId,
      userId,
      loadCache,
    ]
  )
}
