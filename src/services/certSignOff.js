import { httpsCallable, getFunctions } from 'firebase/functions'
import { app } from '../firebase'

/**
 * Close out a verbal certification. Thin wrapper around the certifyTraineeCert
 * Cloud Function — the callable checks the caller's role from their own custom
 * claims and performs the write server-side, so a trainer can no longer forge a
 * certification straight through Firestore rules.
 *
 * certifierEmpNum/certifierUid are no longer read from here — the server derives
 * both from the authenticated caller.
 */
export async function closeOutCertification({
  traineeId,
  outcome,
  totalScore,
  maxScore,
  reviewNotes,
  retrainAreas = [],
  archiveOnCertify = true,
}) {
  const fn = httpsCallable(getFunctions(app), 'certifyTraineeCert')
  try {
    const result = await fn({
      traineeId,
      outcome,
      totalScore,
      maxScore,
      reviewNotes,
      retrainAreas,
      archiveOnCertify,
    })
    return result.data?.attempt
  } catch (e) {
    throw new Error(e?.message || 'Could not write the certification to the trainee record. Nothing was saved — try again.')
  }
}
