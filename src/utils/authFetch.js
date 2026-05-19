import { auth } from '../firebase'

/** fetch() wrapper that attaches Firebase Auth ID token as Bearer header */
export async function authFetch(url, options = {}) {
  const headers = { ...options.headers }
  const user = auth.currentUser
  if (user) {
    try {
      const token = await user.getIdToken()
      headers['Authorization'] = `Bearer ${token}`
    } catch (_) {}
  }
  return fetch(url, { ...options, headers })
}
