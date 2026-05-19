import { collection, getDocs, query, limit } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'menuStudio'

/** Load all menu studio items. */
export async function getAllMenuStudioItems() {
  if (!db) return []
  const snap = await getDocs(query(collection(db, COLLECTION), limit(500)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
