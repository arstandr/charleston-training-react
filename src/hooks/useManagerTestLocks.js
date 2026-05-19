import { useState, useEffect, useMemo } from 'react'
import { getAllActiveTestSessions, subscribeToAllLocks } from '../services/testLockService'

export function useManagerTestLocks() {
  const [testLocksOpen, setTestLocksOpen] = useState(false)
  const [activeLocks, setActiveLocks] = useState([])
  const [testLocksLoading, setTestLocksLoading] = useState(false)
  const [realtimeLocks, setRealtimeLocks] = useState([])

  useEffect(() => {
    if (!testLocksOpen) return
    let cancelled = false
    setTestLocksLoading(true)
    getAllActiveTestSessions()
      .then((list) => {
        if (!cancelled) setActiveLocks(list)
      })
      .catch(() => {
        if (!cancelled) setActiveLocks([])
      })
      .finally(() => {
        if (!cancelled) setTestLocksLoading(false)
      })
    return () => { cancelled = true }
  }, [testLocksOpen])

  // Real-time subscription to test locks (for Heads Up lockout alerts)
  useEffect(() => {
    const unsub = subscribeToAllLocks((locks) => setRealtimeLocks(locks))
    return () => unsub()
  }, [])

  const lockedOutUsers = useMemo(() =>
    realtimeLocks.filter((l) => l.lockedOut),
    [realtimeLocks]
  )

  return { testLocksOpen, setTestLocksOpen, activeLocks, setActiveLocks, testLocksLoading, realtimeLocks, lockedOutUsers }
}
