/**
 * Chatbot Service - Queries knowledge base and generates responses
 */
import { collection, getDocs, query, where, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { callGemini } from './geminiService'

/**
 * Search knowledge base for relevant chunks (simple keyword matching)
 */
async function searchKnowledgeBase(searchQuery, maxResults = 5) {
  try {
    const kbRef = collection(db, 'chatbotKnowledge')
    const snapshot = await getDocs(kbRef)

    if (snapshot.empty) {
      return []
    }

    const searchTerms = searchQuery.toLowerCase().split(/\s+/).filter((term) => term.length > 2)
    const scoredChunks = []

    snapshot.forEach((docSnap) => {
      const data = docSnap.data()
      const content = (data.content || '').toLowerCase()

      let score = 0
      searchTerms.forEach((term) => {
        const occurrences = (content.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
        score += occurrences
      })

      const correctionBoost = data.isCorrection ? 10 : 0
      if (score > 0 || data.isCorrection) {
        scoredChunks.push({
          id: docSnap.id,
          score: score + correctionBoost,
          ...data,
        })
      }
    })

    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
  } catch (error) {
    console.warn('Knowledge base search error:', error?.message)
    return []
  }
}

/**
 * Query chatbot with context from knowledge base
 */
export async function queryChatbot(userMessage, userId, options = {}) {
  const {
    includeKnowledgeBase = true,
    maxKnowledgeChunks = 5,
    conversationHistory = [],
  } = options

  try {
    let contextChunks = []

    if (includeKnowledgeBase) {
      contextChunks = await searchKnowledgeBase(userMessage, maxKnowledgeChunks)
    }

    let systemInstruction = `You are a helpful training assistant for Charleston's Restaurant. You help staff learn about:
- Menu items, ingredients, and descriptions
- Service procedures and standards
- Bar and beverage knowledge
- Restaurant policies and procedures

Be friendly, concise, and practical. If you don't know something, say so honestly.`

    if (contextChunks.length > 0) {
      const contextText = contextChunks
        .map((chunk, idx) => `[Source ${idx + 1}: ${chunk.source || 'Unknown'}]\n${chunk.content}`)
        .join('\n\n---\n\n')

      systemInstruction += `\n\nRELEVANT INFORMATION FROM TRAINING MATERIALS:\n\n${contextText}`
    }

    let prompt = userMessage

    if (conversationHistory.length > 0) {
      const historyText = conversationHistory
        .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n')

      prompt = `${historyText}\n\nUser: ${userMessage}`
    }

    const response = await callGemini(prompt, userId, {
      systemInstruction,
      temperature: 0.7,
      maxTokens: 2048,
    })

    return {
      success: true,
      response,
      contextUsed: contextChunks.length,
      sources: [...new Set(contextChunks.map((c) => c.source).filter(Boolean))],
    }
  } catch (error) {
    console.warn('Chatbot query error:', error?.message)
    return {
      success: false,
      error: error.message || 'Failed to get response',
      response: null,
    }
  }
}

/**
 * Enhanced search with category filtering
 */
export async function searchKnowledgeByCategory(searchQuery, category, maxResults = 5) {
  try {
    const kbRef = collection(db, 'chatbotKnowledge')
    let q = query(kbRef)

    if (category && category !== 'all') {
      q = query(kbRef, where('type', '==', category))
    }

    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return []
    }

    const searchTerms = searchQuery.toLowerCase().split(/\s+/).filter((term) => term.length > 2)
    const scoredChunks = []

    snapshot.forEach((docSnap) => {
      const data = docSnap.data()
      const content = (data.content || '').toLowerCase()

      let score = 0
      searchTerms.forEach((term) => {
        const occurrences = (content.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
        score += occurrences
      })

      if (score > 0) {
        scoredChunks.push({
          id: docSnap.id,
          score,
          ...data,
        })
      }
    })

    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
  } catch (error) {
    console.error('Category search error:', error)
    return []
  }
}

/**
 * Get knowledge base statistics
 */
export async function getKnowledgeBaseStats() {
  try {
    const kbRef = collection(db, 'chatbotKnowledge')
    const snapshot = await getDocs(kbRef)

    const stats = {
      totalChunks: snapshot.size,
      totalTokens: 0,
      byType: {},
      bySources: {},
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data()

      stats.totalTokens += data.estimatedTokens || 0

      const type = data.type || 'unknown'
      stats.byType[type] = (stats.byType[type] || 0) + 1

      const source = data.source || 'unknown'
      stats.bySources[source] = (stats.bySources[source] || 0) + 1
    })

    return stats
  } catch (error) {
    console.error('Stats error:', error)
    return null
  }
}

/**
 * Add a chunk to the knowledge base (e.g. from admin correction or feedback fix)
 */
export async function addKnowledgeChunk(question, editedText, options = {}) {
  try {
    const { source = 'admin-correction', type = 'correction' } = options
    const kbRef = collection(db, 'chatbotKnowledge')
    const fullContent = question
      ? `Q: ${question}\n\nA: ${editedText}`
      : editedText
    await addDoc(kbRef, {
      content: fullContent,
      source,
      question: question || '',
      type,
      isCorrection: true,
      createdAt: serverTimestamp(),
      createdBy: options.createdBy || null,
    })
    return { success: true }
  } catch (error) {
    console.error('Add knowledge chunk error:', error)
    return { success: false, error: error?.message }
  }
}

export default {
  queryChatbot,
  searchKnowledgeBase,
  searchKnowledgeByCategory,
  getKnowledgeBaseStats,
  addKnowledgeChunk,
}
