import { collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'auditLog'

/**
 * Log an audit event to Firestore.
 */
export async function logAuditEvent(userId, userName, action, details = {}) {
  if (!userId || !db) return
  try {
    const date = new Date().toISOString().split('T')[0]
    await addDoc(collection(db, COLLECTION), {
      userId,
      userName: userName || 'Unknown',
      action: action || 'unknown',
      details: details && typeof details === 'object' ? details : {},
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      timestamp: new Date().toISOString(),
      date,
    })
  } catch (e) {
    console.error('Error logging audit event:', e)
  }
}

/**
 * Get audit logs for a user.
 */
export async function getAuditLogsForUser(userId, limitCount = 50) {
  if (!userId || !db) return []
  try {
    const q = query(
      collection(db, COLLECTION),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    )
    const snapshot = await getDocs(q)
    const logs = []
    snapshot.forEach((d) => logs.push({ id: d.id, ...d.data() }))
    return logs
  } catch (e) {
    console.error('Error getting audit logs:', e)
    return []
  }
}

/**
 * Get all audit logs (admin). Requires composite index on auditLog: timestamp desc.
 */
export async function getAllAuditLogs(limitCount = 100) {
  if (!db) return []
  try {
    const q = query(
      collection(db, COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    )
    const snapshot = await getDocs(q)
    const logs = []
    snapshot.forEach((d) => logs.push({ id: d.id, ...d.data() }))
    return logs
  } catch (e) {
    console.error('Error getting all audit logs:', e)
    return []
  }
}

/**
 * Get audit logs by action type.
 */
export async function getAuditLogsByAction(action, limitCount = 100) {
  if (!db) return []
  try {
    const q = query(
      collection(db, COLLECTION),
      where('action', '==', action),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    )
    const snapshot = await getDocs(q)
    const logs = []
    snapshot.forEach((d) => logs.push({ id: d.id, ...d.data() }))
    return logs
  } catch (e) {
    console.error('Error getting audit logs by action:', e)
    return []
  }
}
