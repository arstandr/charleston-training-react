import { createContext, useContext, useState, useEffect, useRef } from 'react'
import * as geminiService from '../services/geminiService'
import { useAuth } from './AuthContext'

const GeminiContext = createContext(null)

export function useGemini() {
  const context = useContext(GeminiContext)
  if (!context) {
    throw new Error('useGemini must be used within GeminiProvider')
  }
  return context
}

export function GeminiProvider({ children }) {
  const { currentUser } = useAuth()
  const userId = currentUser?.uid || currentUser?.id
  const rateLimitUserIdRef = useRef(null)

  const [apiKey, setApiKey] = useState(null)
  const [isConfigured, setIsConfigured] = useState(false)
  const [rateLimitStatus, setRateLimitStatus] = useState({ isLimited: false, standard: 0, live: 0 })
  const [loading, setLoading] = useState(true)

  // Only fetch Gemini key when user is authenticated (avoids permission-denied on login page)
  useEffect(() => {
    if (!userId) {
      setApiKey(null)
      setIsConfigured(false)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    geminiService.getGeminiKey().then((key) => {
      if (!cancelled) {
        setApiKey(key)
        setIsConfigured(!!key)
      }
    }).catch(() => {
      if (!cancelled) setIsConfigured(false)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      rateLimitUserIdRef.current = null
      setRateLimitStatus({ isLimited: false, standard: 0, live: 0 })
      return
    }
    rateLimitUserIdRef.current = userId
    const update = () => {
      if (rateLimitUserIdRef.current !== userId) return
      geminiService.getRateLimitRemaining(userId).then((status) => {
        if (rateLimitUserIdRef.current !== userId) return
        setRateLimitStatus({
          isLimited: status.isLimited,
          standard: status.standard,
          live: status.live,
        })
      })
    }
    update()
    const interval = setInterval(update, 1000)
    return () => {
      rateLimitUserIdRef.current = null
      clearInterval(interval)
    }
  }, [userId])

  async function loadApiKey() {
    const key = await geminiService.getGeminiKey()
    setApiKey(key)
    setIsConfigured(!!key)
  }

  async function saveApiKey(key) {
    try {
      await geminiService.setGeminiKey(key)
      setApiKey(key)
      setIsConfigured(true)
      return { success: true }
    } catch (error) {
      console.error('Error saving Gemini key:', error)
      return { success: false, error: error.message }
    }
  }

  async function validateKey(key) {
    return geminiService.validateGeminiKey(key)
  }

  const value = {
    apiKey,
    isConfigured,
    rateLimitStatus,
    loading,
    saveApiKey,
    validateKey,
    reloadKey: loadApiKey,
    callGemini: (prompt, options) => geminiService.callGemini(prompt, userId, options),
    callGeminiJSON: (prompt, options) => geminiService.callGeminiJSON(prompt, userId, options),
    generateQuizQuestions: (flashcards, count, difficulty) =>
      geminiService.generateQuizQuestions(flashcards, userId, count, difficulty),
    generateFlashcardSuggestions: (topic, existing, count) =>
      geminiService.generateFlashcardSuggestions(topic, existing, count, userId),
    analyzeMenuItem: (name, desc, ingredients) =>
      geminiService.analyzeMenuItem(name, desc, ingredients, userId),
    generateTrainingFromDocument: (text, type) =>
      geminiService.generateTrainingFromDocument(text, userId, type),
    smartSearch: (query, flashcards) =>
      geminiService.smartSearch(query, flashcards, userId),
    identifyKnowledgeGaps: (results, flashcards) =>
      geminiService.identifyKnowledgeGaps(results, flashcards, userId),
    callGeminiVision: (prompt, base64Data, mimeType, options) =>
      geminiService.callGeminiVision(prompt, base64Data, mimeType, userId, options),
    callGeminiVisionJSON: (prompt, base64Data, mimeType, options) =>
      geminiService.callGeminiVisionJSON(prompt, base64Data, mimeType, userId, options),
    classifyFoodImage: (base64Data, mimeType) =>
      geminiService.classifyFoodImage(base64Data, mimeType, userId),
  }

  return (
    <GeminiContext.Provider value={value}>
      {children}
    </GeminiContext.Provider>
  )
}
