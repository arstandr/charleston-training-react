/**
 * useVigilData — loads vigil run data on mount (all three queries in parallel).
 */
import { useState, useEffect } from 'react'
import { getLatestVigilRun, getVigilRunHistory, getVigilPassRateTrend } from '../services/vigilService'

export default function useVigilData() {
  const [latestRun, setLatestRun] = useState(null)
  const [runHistory, setRunHistory] = useState([])
  const [passTrend, setPassTrend] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [latest, history, trend] = await Promise.all([
          getLatestVigilRun(),
          getVigilRunHistory(20),
          getVigilPassRateTrend(14),
        ])
        if (cancelled) return
        setLatestRun(latest)
        setRunHistory(history)
        setPassTrend(trend)
      } catch (e) {
        console.warn('[Vigil] Failed to load data:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { latestRun, runHistory, passTrend, loading }
}
