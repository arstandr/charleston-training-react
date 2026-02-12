/**
 * Toast API service - calls Cloud Functions that proxy Toast POS API.
 * All Toast requests go through the proxy (no direct Toast API from client).
 * CORS for localhost is handled by the Cloud Function (Access-Control-Allow-Origin).
 */

const BASE = 'https://us-central1-chartrain-20901.cloudfunctions.net'

async function callFunction(name, params = {}, method = 'GET') {
  const url = new URL(`${BASE}/${name}`)
  if (method === 'GET') {
    Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)))
  }
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (method === 'POST' && Object.keys(params).length > 0) {
    options.body = JSON.stringify(params)
  }
  const res = await fetch(url.toString(), options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || data.message || `Toast API error: ${res.status}`)
  }
  return data
}

/**
 * Sync employees from Toast to Firestore (users collection).
 * Returns { success, totalEmployees, created, updated, skipped }.
 */
export async function syncEmployeesToFirestore(restaurantGuid) {
  return callFunction('syncEmployeesToFirestore', { restaurantGuid }, 'POST')
}

/**
 * Fetch employees from Toast (does not write to Firestore).
 * Returns { success, data: employees[] }.
 */
export async function getToastEmployees(restaurantGuid) {
  return callFunction('toastEmployees', { restaurantGuid }, 'GET')
}

/**
 * Fetch menus from Toast.
 * Returns { success, data }.
 */
export async function getToastMenus(restaurantGuid) {
  return callFunction('toastMenus', { restaurantGuid }, 'GET')
}

/**
 * Fetch shifts from Toast for a date range.
 * startDate, endDate: YYYY-MM-DD.
 */
export async function getToastShifts(restaurantGuid, startDate, endDate) {
  return callFunction('toastShifts', { restaurantGuid, startDate, endDate }, 'GET')
}

/**
 * Save Toast API credentials to Firestore via Cloud Function (admin only).
 * @param {{ clientId: string, clientSecret: string, restaurantGuid?: string, adminCode: string }} opts
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
export async function setToastCredentials({ clientId, clientSecret, restaurantGuid, adminCode }) {
  const res = await fetch(`${BASE}/setToastCredentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: (clientId || '').trim(),
      clientSecret: (clientSecret || '').trim(),
      restaurantGuid: restaurantGuid != null ? String(restaurantGuid).trim() : '',
      adminCode: String(adminCode || '').trim(),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { success: false, error: data.error || res.statusText }
  return { success: true, message: data.message }
}
