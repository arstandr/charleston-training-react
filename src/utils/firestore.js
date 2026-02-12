import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { STAFF_ACCOUNTS_KEY } from '../constants'

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
  try {
    if (!db) return false
    const ref = doc(db, collectionId, docId)
    await setDoc(ref, data, { merge: true })
    return true
  } catch (e) {
    console.warn('[Firestore] save failed:', e?.message)
    return false
  }
}

export async function ensureStaffAccountsFromFirestore() {
  try {
    const docSnap = await getFromFirestore('config', 'staffAccounts')
    if (!docSnap || typeof docSnap !== 'object') return
    const staffData = (docSnap.data && typeof docSnap.data === 'object') ? docSnap.data : {}
    let local = {}
    try {
      local = JSON.parse(localStorage.getItem(STAFF_ACCOUNTS_KEY) || '{}') || {}
    } catch (_) {}
    Object.keys(staffData).forEach((empNum) => {
      const remote = staffData[empNum]
      if (remote && typeof remote === 'object') {
        if (!local[empNum]) local[empNum] = {}
        Object.keys(remote).forEach((k) => { local[empNum][k] = remote[k] })
      }
    })
    try {
      localStorage.setItem(STAFF_ACCOUNTS_KEY, JSON.stringify(local))
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
    let local = {}
    try {
      local = JSON.parse(localStorage.getItem('trainingData') || '{}') || {}
    } catch (_) {}
    Object.keys(remote).forEach((id) => { local[id] = remote[id] })
    try {
      localStorage.setItem('trainingData', JSON.stringify(local))
    } catch (_) {}
  } catch (e) {
    console.warn('[TrainingData] Hydrate failed:', e?.message)
  }
}
