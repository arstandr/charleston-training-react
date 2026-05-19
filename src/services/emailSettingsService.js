/**
 * Email settings service — per-store email configuration.
 * Settings stored in Firestore: emailSettings/{store}
 */

import { getFromFirestore, saveToFirestore } from '../utils/firestore'

const COLLECTION = 'emailSettings'
const FUNCTIONS_BASE = 'https://us-central1-chartrain-20901.cloudfunctions.net'

/**
 * Get email settings for a store.
 * @param {string} store - e.g. 'Westfield', 'Castleton'
 */
export async function getEmailSettings(store) {
  const data = await getFromFirestore(COLLECTION, store)
  return data || {
    enabled: false,
    dailyEnabled: false,
    weeklyEnabled: false,
    recipients: [],
    senderName: `${store} Training`,
    updatedAt: null,
  }
}

/**
 * Save email settings for a store.
 * @param {string} store
 * @param {object} settings
 */
export async function updateEmailSettings(store, settings) {
  return saveToFirestore(COLLECTION, store, {
    ...settings,
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Send a test email via Cloud Function HTTP endpoint.
 * @param {string} store - e.g. 'Westfield'
 * @param {'daily'|'weekly'} type
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function sendTestEmail(store, type) {
  const res = await fetch(`${FUNCTIONS_BASE}/sendTestTrainingEmail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, type }),
  })
  return res.json()
}
