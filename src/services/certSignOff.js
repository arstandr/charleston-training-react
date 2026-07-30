import { saveToFirestore } from '../utils/firestore'

/**
 * Close out a verbal certification against the trainee's own doc.
 *
 * Writes are merge:true, so the nested `schedule.cert` map is deep-merged and
 * the other five shifts are left alone.
 *
 * On a pass this is what actually completes training — before this existed,
 * the `cert` shift was never signed, so trainees sat at 5/6 forever.
 */
export async function closeOutCertification({
  traineeId,
  certifierEmpNum,
  certifierUid,
  outcome,
  totalScore,
  maxScore,
  reviewNotes,
  retrainAreas = [],
  archiveOnCertify = true,
}) {
  const now = new Date().toISOString()
  const passed = outcome === 'certified'

  const attempt = {
    result: passed ? 'pass' : 'fail',
    at: now,
    by: String(certifierEmpNum || ''),
    totalScore,
    maxScore,
    notes: reviewNotes || '',
    ...(passed ? {} : { retrainAreas }),
  }

  const payload = {
    verbalCert: {
      completed: passed,
      completedAt: passed ? now : null,
      completedBy: passed ? String(certifierEmpNum || '') : null,
      certifiedBy: certifierUid || '',
      lastAttemptAt: now,
      outcome,
      totalScore,
      maxScore,
      notes: reviewNotes || '',
      retrainAreas: passed ? [] : retrainAreas,
    },
    updatedAt: now,
  }

  if (passed) {
    // Sign the Certification shift both ways — the certifying manager is the
    // one in the room, so they satisfy the trainer signature too.
    payload.schedule = {
      cert: {
        trainerSignedAt: now,
        trainerSignedBy: String(certifierEmpNum || ''),
        managerSignedAt: now,
        managerSignedBy: String(certifierEmpNum || ''),
      },
    }
    if (archiveOnCertify) {
      payload.archived = true
      payload.archivedReason = 'certified'
      payload.archivedAt = now
    }
  }

  await saveToFirestore('trainees', traineeId, payload)
  return attempt
}
