import { useState, useEffect, useRef } from 'react'
import {
  fetchAllFlashcardMastery,
  fetchAllFlashcardSessions,
  fetchAllQuizAttempts,
  fetchAllUsers,
} from '../services/analyticsService'

export function useManagerAnalyticsData(view) {
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const analyticsLoadingRef = useRef(false)

  useEffect(() => {
    if (!view.startsWith('analytics:') || analyticsData || analyticsLoadingRef.current) return
    analyticsLoadingRef.current = true
    setAnalyticsLoading(true)
    Promise.all([
      fetchAllFlashcardMastery(),
      fetchAllFlashcardSessions(),
      fetchAllQuizAttempts(),
      fetchAllUsers(),
    ]).then(([mastery, sessions, quizzes, users]) => {
      setAnalyticsData({ mastery, sessions, quizzes, users })
    }).catch((err) => {
      console.error('[Analytics] Load failed:', err)
    }).finally(() => {
      setAnalyticsLoading(false)
      analyticsLoadingRef.current = false
    })
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps — ref guard prevents re-fetch

  return { analyticsData, analyticsLoading }
}
