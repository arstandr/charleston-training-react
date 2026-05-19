import { useState, useEffect, useMemo } from 'react'
import {
  fetchAllFlashcardMastery,
  fetchAllFlashcardSessions,
  fetchAllQuizAttempts,
} from '../services/analyticsService'
import { loadTestResults } from '../services/quizAttemptsService'

export function useBulkTraineeStats(store, traineeIds) {
  const [allTraineeTestResults, setAllTraineeTestResults] = useState({})
  const [allFlashcardStats, setAllFlashcardStats] = useState(null)
  const [allPracticeTestStats, setAllPracticeTestStats] = useState(null)

  // Stable key so effect only re-runs when the actual trainee list changes
  const traineeKey = useMemo(() => traineeIds.join(','), [traineeIds])

  // Load test results for all trainees (for locked-out indicator on cards)
  // Chunked to avoid N+1 Firestore reads
  useEffect(() => {
    if (!traineeIds.length) return
    let cancelled = false
    async function loadChunked() {
      const CHUNK = 10
      const map = {}
      for (let i = 0; i < traineeIds.length; i += CHUNK) {
        if (cancelled) return
        const chunk = traineeIds.slice(i, i + CHUNK)
        const results = await Promise.all(chunk.map((id) => loadTestResults(id).then((r) => ({ id, r })).catch(() => ({ id, r: {} }))))
        for (const { id, r } of results) {
          for (const [testId, data] of Object.entries(r)) {
            map[`${id}_${testId}`] = data
          }
        }
      }
      if (!cancelled) setAllTraineeTestResults(map)
    }
    loadChunked()
    return () => { cancelled = true }
  }, [store, traineeKey])

  // Bulk-fetch flashcard + quiz stats for readiness scores
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAllFlashcardMastery(), fetchAllFlashcardSessions(), fetchAllQuizAttempts()])
      .then(([mastery, sessions, quizAttempts]) => {
        if (cancelled) return
        // Compute per-trainee flashcard stats
        const fcByUser = {}
        mastery.forEach((doc) => {
          // doc.id format: userId_cardId
          const idx = doc.id.indexOf('_')
          if (idx <= 0) return
          const uid = doc.id.slice(0, idx)
          if (!fcByUser[uid]) fcByUser[uid] = { totalCards: 0, masteredCards: 0, totalSessions: 0 }
          fcByUser[uid].totalCards++
          if (doc.status === 'mastered') fcByUser[uid].masteredCards++
        })
        sessions.forEach((s) => {
          const uid = s.userId
          if (!uid) return
          if (!fcByUser[uid]) fcByUser[uid] = { totalCards: 0, masteredCards: 0, totalSessions: 0 }
          fcByUser[uid].totalSessions++
        })
        setAllFlashcardStats(fcByUser)

        // Compute per-trainee practice test stats
        const qtByUser = {}
        quizAttempts.forEach((a) => {
          const uid = a.userId || ''
          if (!uid) return
          if (!qtByUser[uid]) qtByUser[uid] = { totalAttempts: 0, totalCorrect: 0 }
          qtByUser[uid].totalAttempts++
          if (a.correct) qtByUser[uid].totalCorrect++
        })
        const ptStats = {}
        for (const [uid, data] of Object.entries(qtByUser)) {
          ptStats[uid] = {
            totalAttempts: data.totalAttempts,
            correctPct: data.totalAttempts ? Math.round((data.totalCorrect / data.totalAttempts) * 100) : 0,
          }
        }
        setAllPracticeTestStats(ptStats)
      })
      .catch((e) => { console.error('[Analytics] Bulk stats load failed:', e) })
    return () => { cancelled = true }
  }, [store, traineeKey])

  return { allTraineeTestResults, setAllTraineeTestResults, allFlashcardStats, allPracticeTestStats }
}
