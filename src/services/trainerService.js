import { collection, doc, getDocs, setDoc, query, where, limit } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'trainers'

/** Update a trainer document (merge). */
export async function updateTrainer(trainerId, data) {
  if (!db || !trainerId) return
  await setDoc(doc(db, COLLECTION, trainerId), data, { merge: true })
}

/** Load all trainer documents from Firestore. */
export async function getAllTrainers() {
  if (!db) return []
  const snap = await getDocs(query(collection(db, COLLECTION), limit(200)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Load trainers for a specific store by locationGuid.
 * Filters out archived trainers and sorts by rating desc.
 */
export async function getTrainersByLocation(locationGuid) {
  if (!db || !locationGuid) return []
  const snap = await getDocs(query(collection(db, COLLECTION), limit(500)))
  return snap.docs
    .filter((d) => {
      const data = d.data()
      return (data.locationGuid || '') === locationGuid
        && (data.status || '') !== 'archived'
        && data.archived !== true
    })
    .sort((a, b) => (b.data().rating || 0) - (a.data().rating || 0))
    .map((d) => {
      const data = d.data()
      // employeeNumber is the human-readable emp# (e.g. "4074").
      // For new-shape docs, doc ID is the Toast GUID — never a valid emp#.
      // For legacy-shape docs, doc ID is a Firestore auto-ID — also never valid.
      // We always prefer the stored employeeNumber/empNum field over d.id.
      const employeeNumber = data.employeeNumber || data.empNum || data.externalEmployeeId || null
      return {
        empNum: employeeNumber,
        firestoreDocId: d.id,
        name: ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || 'Trainer',
        role: 'trainer',
        starRating: data.rating || 0,
        ratingsCount: data.totalRatings || 0,
        toastGuid: data.toastGuid,
        schedule: Array.isArray(data.schedule) ? data.schedule : [],
        scheduleLastUpdated: data.scheduleLastUpdated || null,
      }
    })
}
