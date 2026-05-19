import { useState, useEffect } from 'react'
import { getAllFlashcardSets, getAllFlashcards } from '../services/flashcardService'
import { getFromFirestore, saveToFirestore } from '../utils/firestore'
import { getPendingFlags } from '../services/flashcardFlags'
import { subscribeChatbotFlags } from '../services/chatbotFlagsService'

export default function useFlashcardManagerData() {
  const [sets, setSets] = useState([])
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [chatbotFlags, setChatbotFlags] = useState([])
  const [dismissedOrphans, setDismissedOrphans] = useState(new Set())

  // Load dismissed orphans from Firestore on mount
  useEffect(() => {
    getFromFirestore('config', 'dismissedOrphans').then((data) => {
      if (data?.indexes) {
        setDismissedOrphans(new Set(data.indexes))
      }
    }).catch(() => {})
  }, [])

  async function persistDismissedOrphans(nextSet) {
    setDismissedOrphans(nextSet)
    try { await saveToFirestore('config', 'dismissedOrphans', { indexes: [...nextSet], updatedAt: new Date().toISOString() }) } catch {}
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [setsList, cardsList] = await Promise.all([
          getAllFlashcardSets(),
          getAllFlashcards(),
        ])
        setsList.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
        setSets(setsList)
        setCards(cardsList)
      } catch (e) {
        console.error('Load failed:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    async function loadAlerts() {
      setAlertsLoading(true)
      try {
        const reports = await getPendingFlags()
        setAlerts(reports)
      } catch (e) {
        console.error('Failed to load alerts:', e)
      } finally {
        setAlertsLoading(false)
      }
    }
    loadAlerts()
  }, [])

  useEffect(() => {
    return subscribeChatbotFlags(setChatbotFlags)
  }, [])

  return {
    sets,
    setSets,
    cards,
    setCards,
    loading,
    alerts,
    setAlerts,
    alertsLoading,
    chatbotFlags,
    dismissedOrphans,
    persistDismissedOrphans,
  }
}
