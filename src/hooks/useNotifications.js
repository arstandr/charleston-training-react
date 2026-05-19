import { useState, useEffect } from 'react'
import { getNotificationsForUser, markNotificationRead } from '../services/notificationService'

const LIMIT = 50
const POLL_MS = 30000

export function useNotifications(uid) {
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!uid) {
      setItems([])
      setUnreadCount(0)
      return
    }
    let cancelled = false
    async function fetchList() {
      if (cancelled) return
      try {
        const list = await getNotificationsForUser(uid, LIMIT)
        if (!cancelled) {
          setItems(list)
          setUnreadCount(list.filter((x) => !x.read).length)
        }
      } catch (err) {
        console.error('[useNotifications] Fetch failed:', err?.message || err)
        if (!cancelled) setItems([])
        if (!cancelled) setUnreadCount(0)
      }
    }
    fetchList()
    const interval = setInterval(fetchList, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [uid])

  async function markAsRead(docId) {
    if (!docId) return
    try {
      await markNotificationRead(docId)
    } catch (_) {}
  }

  async function markAllRead() {
    const unread = items.filter((x) => !x.read)
    for (const it of unread) {
      await markAsRead(it.id)
    }
  }

  return { items, unreadCount, markAsRead, markAllRead }
}
