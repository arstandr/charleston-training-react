import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

/** Create a verbal certification record. */
export async function createVerbalCertification(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, 'verbalCertifications'), {
    ...data,
    certifiedAt: serverTimestamp(),
  })
  return ref.id
}
