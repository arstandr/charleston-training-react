import { doc, getDoc, setDoc, updateDoc, onSnapshot, deleteField } from 'firebase/firestore'
import { db } from '../firebase'
import { STAFF_ACCOUNTS_KEY } from '../constants'

export { deleteField }

const DEFAULT_ORG_ID = 'org_charlestons'

export async function getFromFirestore(collectionId, docId) {
  try {
    if (!db) return null
    const ref = doc(db, collectionId, docId)
    const snap = await getDoc(ref)
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  } catch (e) {
    console.warn('[Firestore] get failed:', e?.message)
    return null
  }
}

export async function saveToFirestore(collectionId, docId, data) {
  if (!db) return false
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const ref = doc(db, collectionId, docId)
      await setDoc(ref, data, { merge: true })
      return true
    } catch (e) {
      const isRetryable = e?.code === 'unavailable' || e?.code === 'deadline-exceeded' || e?.code === 'resource-exhausted'
      if (isRetryable && attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 500 + Math.random() * 200
        console.warn(`[Firestore] save retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delay)}ms:`, e?.message)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      console.error('[Firestore] save FAILED:', e?.message, e?.code, e)
      return false
    }
  }
  return false
}

/** Subscribe to a single Firestore doc in real-time. Returns unsubscribe fn. */
export function subscribeToDoc(collectionId, docId, callback) {
  if (!db) return () => {}
  return onSnapshot(doc(db, collectionId, docId), (snap) => {
    callback(snap.exists() ? snap.data() : null)
  })
}

/** Update specific fields on a doc using dot-notation paths (supports deleteField sentinels). */
export async function updateDocFields(collectionId, docId, fields) {
  try {
    if (!db) return false
    await updateDoc(doc(db, collectionId, docId), fields)
    return true
  } catch (e) {
    console.error('[Firestore] updateFields FAILED:', e?.message, e?.code)
    return false
  }
}

export async function ensureStaffAccountsFromFirestore() {
  try {
    const docSnap = await getFromFirestore('config', 'staffAccounts')
    if (!docSnap || typeof docSnap !== 'object') return
    const { id: _id, data: dataKey, ...rest } = docSnap
    const staffData = (dataKey && typeof dataKey === 'object') ? dataKey : (typeof rest === 'object' ? rest : {})
    // Full replace — Firestore is source of truth; stale/deleted local entries must not persist
    try {
      localStorage.setItem(STAFF_ACCOUNTS_KEY, JSON.stringify(staffData))
    } catch (_) {}
  } catch (e) {
    console.warn('[StaffAccounts] Hydrate failed:', e?.message)
  }
}

export async function ensureTrainingDataFromFirestore() {
  try {
    const docSnap = await getFromFirestore('config', 'trainingData')
    if (!docSnap || typeof docSnap !== 'object') return
    const { id: _id, data: dataKey, ...rest } = docSnap
    const remote = dataKey && typeof dataKey === 'object' ? dataKey : rest
    if (typeof remote !== 'object') return
    // Firestore is the source of truth — write directly to localStorage
    try {
      localStorage.setItem('trainingData', JSON.stringify(remote))
    } catch (_) {}
  } catch (e) {
    console.warn('[TrainingData] Hydrate failed:', e?.message)
  }
}
