import { useState, useEffect, useCallback } from 'react'
import { getQuarantinedCardIds, reportCardInaccuracy } from '../services/flashcardFlags'

/**
 * Returns quarantined card IDs (from pending flags) and a function to report a card as inaccurate.
 */
export function useFlashcardQuarantine() {
  const [quarantinedCardIds, setQuarantinedCardIds] = useState(new Set())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const ids = await getQuarantinedCardIds()
      setQuarantinedCardIds(ids)
    } catch (_) {
      setQuarantinedCardIds(new Set())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const reportInaccuracy = useCallback(
    async ({ setId, cardId, front, back, reason, reportedBy }) => {
      await reportCardInaccuracy({ setId, cardId, front, back, reason, reportedBy })
      setQuarantinedCardIds((prev) => new Set([...prev, cardId]))
    },
    []
  )

  return { quarantinedCardIds, loading, refresh, reportInaccuracy }
}
