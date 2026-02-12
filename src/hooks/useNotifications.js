import { useState, useEffect } from 'react'
import { collection, query, where, limit, onSnapshot, updateDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'notifications'
const LIMIT = 50

export function useNotifications(uid) {
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!uid || !db) {
      setItems([])
      setUnreadCount(0)
      return
    }
    const ref = collection(db, COLLECTION)
    const q = query(ref, where('userId', '==', uid), limit(LIMIT))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        list.sort((a, b) => {
          const ta = a.timestamp?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0
          const tb = b.timestamp?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0
          return tb - ta
        })
        setItems(list)
        setUnreadCount(list.filter((x) => !x.read).length)
      },
      (err) => {
        console.warn('[useNotifications]', err?.message)
        setItems([])
        setUnreadCount(0)
      }
    )
    return () => unsub()
  }, [uid])

  async function markAsRead(docId) {
    if (!docId || !db) return
    try {
      await updateDoc(doc(db, COLLECTION, docId), { read: true })
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
