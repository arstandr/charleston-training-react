import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// Cache current user info so error logger doesn't need context
let _currentUser = null
export function setErrorLoggerUser(user) {
  _currentUser = user
}

/**
 * Log an error to Firestore clientErrors collection.
 * @param {string} feature - Which feature: 'quiz', 'chatbot', 'schedule', 'flashcards', 'login', 'sync', 'general'
 * @param {string} action - What the user was doing: 'taking quiz', 'sending message', 'loading schedule'
 * @param {Error|string} error - The error object or message
 * @param {object} meta - Optional extra data: { cardId, setId, shiftKey, etc }
 */
export async function logClientError(feature, action, error, meta = {}) {
  try {
    const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown error')
    const stack = error?.stack?.substring(0, 1500) || null

    await addDoc(collection(db, 'clientErrors'), {
      feature,
      action,
      message: errorMessage,
      stack,
      url: typeof window !== 'undefined' ? window.location.pathname : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent?.substring(0, 200) : '',
      // User context
      userName: _currentUser?.name || _currentUser?.displayName || null,
      userRole: _currentUser?.role || null,
      userEmpNum: _currentUser?.empNum || _currentUser?.id || null,
      userStore: _currentUser?.store || null,
      // Extra metadata
      ...meta,
      timestamp: serverTimestamp(),
    })
  } catch (_) {
    // Never let error logging cause errors
  }
}

/**
 * Log a feature usage event (not an error — just tracking that a feature was used successfully).
 * Writes to `featureUsage` collection.
 */
export async function logFeatureUsage(feature, meta = {}) {
  try {
    await addDoc(collection(db, 'featureUsage'), {
      feature,
      userName: _currentUser?.name || _currentUser?.displayName || null,
      userRole: _currentUser?.role || null,
      userStore: _currentUser?.store || null,
      ...meta,
      timestamp: serverTimestamp(),
    })
  } catch (_) {}
}

/**
 * Push a critical alert visible on the System Health dashboard.
 * @param {string} source - Where the alert came from: 'toast-api', 'gemini', 'firestore', 'cloud-function', 'client', 'manual'
 * @param {string} message - Human-readable description: "Toast API auth token expired", "Gemini quota exceeded"
 * @param {string} severity - 'critical' (red) | 'warning' (amber)
 * @param {object} meta - Optional extra data: { functionName, errorCode, suggestion }
 */
export async function pushCriticalAlert(source, message, severity = 'critical', meta = {}) {
  try {
    await addDoc(collection(db, 'criticalAlerts'), {
      source,
      message,
      severity,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: serverTimestamp(),
      userName: _currentUser?.name || _currentUser?.displayName || null,
      userRole: _currentUser?.role || null,
      ...meta,
    })
  } catch (_) {}
}

/**
 * Resolve a critical alert by doc ID.
 * @param {string} alertId - Firestore document ID
 */
export async function resolveCriticalAlert(alertId) {
  try {
    await updateDoc(doc(db, 'criticalAlerts', alertId), {
      resolved: true,
      resolvedBy: _currentUser?.name || _currentUser?.displayName || 'Unknown',
      resolvedAt: serverTimestamp(),
    })
  } catch (_) {}
}
