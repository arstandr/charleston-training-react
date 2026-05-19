import { collection, getDocs, updateDoc, doc, query, where, limit, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'notifications'

/** Subscribe to notifications for a user (real-time, max 20). Returns unsubscribe fn. */
export function subscribeNotifications(userId, callback) {
  if (!db || !userId) return () => {}
  const q = query(collection(db, COLLECTION), where('userId', '==', userId), limit(20))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, () => callback([]))
}

/** Load all notifications for a user (client-side filter). */
export async function getNotificationsForUser(userId, maxResults = 50) {
  if (!db || !userId) return []
  const snap = await getDocs(query(collection(db, COLLECTION), where('userId', '==', userId), limit(maxResults)))
  const list = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
  list.sort((a, b) => {
    const ta = a.timestamp?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0
    const tb = b.timestamp?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0
    return tb - ta
  })
  return list
}

/** Mark a single notification as read. */
export async function markNotificationRead(docId) {
  if (!db || !docId) return
  await updateDoc(doc(db, COLLECTION, docId), { read: true })
}
