import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAttemptsForUser, createQuizAttempt } from '../services/quizAttemptsService'

const MAX_ATTEMPTS_LOAD = 500

export function useQuizAttempts() {
  const { currentUser } = useAuth()
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const effectiveUserId = currentUser?.uid ?? currentUser?.id ?? currentUser?.traineeId

  const loadAttempts = useCallback(async () => {
    if (!effectiveUserId) {
      setAttempts([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await getAttemptsForUser(effectiveUserId, MAX_ATTEMPTS_LOAD)
      setAttempts(list)
    } catch (e) {
      console.error('useQuizAttempts load error:', e)
      setError(e.message || 'Failed to load quiz attempts')
      setAttempts([])
    } finally {
      setLoading(false)
    }
  }, [effectiveUserId])

  useEffect(() => {
    loadAttempts()
  }, [loadAttempts])

  const logAttempt = useCallback(
    async (attemptData) => {
      if (!effectiveUserId) return
      const payload = {
        userId: effectiveUserId,
        timestamp: new Date().toISOString(),
        questionId: attemptData.questionId,
        quizId: attemptData.quizId,
        correct: !!attemptData.correct,
        topic: attemptData.topic ?? undefined,
        category: attemptData.category ?? attemptData.topic ?? undefined,
        timeSpent: attemptData.timeSpent,
        selectedAnswer: attemptData.selectedAnswer,
        quizSessionId: attemptData.quizSessionId,
        empNum: currentUser.empNum ?? undefined,
        traineeId: currentUser.traineeId ?? currentUser.id ?? undefined,
      }
      try {
        await createQuizAttempt(payload)
        setAttempts((prev) => [{ ...payload }, ...prev].slice(0, MAX_ATTEMPTS_LOAD))
      } catch (e) {
        console.error('useQuizAttempts logAttempt error:', e)
      }
    },
    [currentUser, effectiveUserId]
  )

  const logAttempts = useCallback(
    async (attemptsArray) => {
      if (!effectiveUserId || !attemptsArray?.length) return
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const payloads = attemptsArray.map((a) => ({
        userId: effectiveUserId,
        timestamp: new Date().toISOString(),
        questionId: a.questionId,
        quizId: a.quizId,
        correct: !!a.correct,
        topic: a.topic ?? undefined,
        category: a.category ?? a.topic ?? undefined,
        timeSpent: a.timeSpent,
        selectedAnswer: a.selectedAnswer,
        quizSessionId: a.quizSessionId ?? sessionId,
        empNum: currentUser.empNum ?? undefined,
        traineeId: currentUser.traineeId ?? currentUser.id ?? undefined,
        // Review fields (only present for official tests)
        ...(a.questionText != null && { questionText: a.questionText }),
        ...(a.options != null && { options: a.options }),
        ...(a.correctIndex != null && { correctIndex: a.correctIndex }),
        ...(a.explanation != null && { explanation: a.explanation }),
        ...(a.isBonus != null && { isBonus: a.isBonus }),
      }))
      // Write in parallel chunks of 5 to avoid overwhelming Firestore
      const CHUNK = 5
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunk = payloads.slice(i, i + CHUNK)
        await Promise.all(chunk.map((p) => createQuizAttempt(p).catch((e) => {
          console.error('useQuizAttempts logAttempts item error:', e)
        })))
      }
      await loadAttempts()
    },
    [currentUser, effectiveUserId, loadAttempts]
  )

  const getQuestionAttempts = useCallback(
    (questionId) => {
      return attempts.filter((a) => a.questionId === questionId)
    },
    [attempts]
  )

  const getQuizAttempts = useCallback(
    (quizId) => {
      return attempts.filter((a) => a.quizId === quizId)
    },
    [attempts]
  )

  return {
    attempts,
    loading,
    error,
    logAttempt,
    logAttempts,
    getQuestionAttempts,
    getQuizAttempts,
    reload: loadAttempts,
  }
}
