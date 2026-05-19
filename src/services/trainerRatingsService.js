/**
 * Trainer Ratings Service — all Firestore operations for the trainerRatings collection.
 */
import { collection, query, where, getDocs, orderBy, addDoc, doc, updateDoc, limit } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Get aggregate rating summary for a trainer (average + count).
 * Used by TrainerCard.
 */
export async function getTrainerRatingsSummary(trainerId) {
  if (!db || !trainerId) return null
  const q = query(collection(db, 'trainerRatings'), where('trainerId', '==', trainerId))
  const snapshot = await getDocs(q)

  if (snapshot.empty) return null

  let totalScore = 0
  let count = 0
  snapshot.forEach((doc) => {
    const data = doc.data()
    if (data.average != null) {
      totalScore += data.average
      count++
    }
  })

  return {
    averageRating: count > 0 ? (totalScore / count).toFixed(1) : null,
    totalRatings: count,
  }
}

/**
 * Get all ratings for a trainer, ordered by ratedAt desc.
 * Used by TrainerRatingBreakdownModal.
 */
export async function getTrainerRatingsDetailed(trainerId) {
  if (!db || !trainerId) return []
  const q = query(
    collection(db, 'trainerRatings'),
    where('trainerId', '==', trainerId),
    orderBy('ratedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Check if a rating already exists for a specific shift + trainee.
 * Used by ShiftDetailPage.
 */
export async function getExistingRating(shiftId, traineeId) {
  if (!db || !shiftId || !traineeId) return null
  const q = query(
    collection(db, 'trainerRatings'),
    where('shiftId', '==', shiftId),
    where('traineeId', '==', traineeId),
    limit(1)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

/**
 * Submit a new trainer rating.
 */
export async function submitTrainerRating(ratingData) {
  if (!db) throw new Error('Database not available')
  return addDoc(collection(db, 'trainerRatings'), {
    ...ratingData,
    createdAt: new Date().toISOString(),
  })
}

/**
 * Update an existing trainer rating.
 */
export async function updateTrainerRating(ratingId, ratingData) {
  if (!db) throw new Error('Database not available')
  return updateDoc(doc(db, 'trainerRatings', ratingId), ratingData)
}
