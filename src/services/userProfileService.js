import { collection, doc, getDoc, setDoc, getDocs, query, where, limit } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'users'

/** Get a user profile by ID. */
export async function getUserProfile(userId) {
  if (!db || !userId) return null
  const snap = await getDoc(doc(db, COLLECTION, userId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/** Update fields on a user profile (merge). Creates doc if it doesn't exist. */
export async function updateUserProfile(userId, data) {
  if (!db || !userId) return
  await setDoc(doc(db, COLLECTION, userId), data, { merge: true })
}

/** Find a user doc by empNum (tries both Number and String). Returns uid or null. */
export async function findUserByEmpNum(empNum) {
  if (!db || empNum == null) return null
  const q1 = query(collection(db, COLLECTION), where('empNum', '==', Number(empNum)), limit(1))
  const snap1 = await getDocs(q1)
  if (!snap1.empty) return snap1.docs[0].id
  const q2 = query(collection(db, COLLECTION), where('empNum', '==', String(empNum)), limit(1))
  const snap2 = await getDocs(q2)
  return snap2.empty ? null : snap2.docs[0].id
}
