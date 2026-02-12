/**
 * Toast POS Sync: Trainers + Schedules for Manager Dashboard.
 * - ensureToastToken: get/save session token via Cloud Function.
 * - syncTrainersFromToast: fetch employees + jobs, filter by "Trainer", upsert/archive in Firestore trainers collection.
 * - syncTrainerSchedules: fetch shifts for next 21 days, group by employee, cache in localStorage for Schedule Editor.
 */
import { collection, getDocs, doc, setDoc, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { STORE_TO_TOAST_GUID } from '../constants'

const API_BASE = 'https://us-central1-chartrain-20901.cloudfunctions.net'
const TOAST_TOKEN_KEY = 'toastAccessToken'
const TOKEN_EXPIRY_KEY = 'toastAccessTokenExpires'
const TOKEN_TTL_MS = 55 * 60 * 1000 // 55 min, refresh before 1h

/**
 * Ensure we have a valid Toast session token. Uses localStorage.
 * If missing/expired, calls POST toastAuth and saves the token.
 * @returns {Promise<string>} accessToken
 */
export async function ensureToastToken() {
  try {
    const token = localStorage.getItem(TOAST_TOKEN_KEY)
    const expires = parseInt(localStorage.getItem(TOKEN_EXPIRY_KEY) || '0', 10)
    if (token && Date.now() < expires) return token
  } catch (_) {}

  const res = await fetch(`${API_BASE}/toastAuth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || `Toast auth failed: ${res.status}`)
  if (!data.success || !data.accessToken) throw new Error('No access token returned')

  const token = String(data.accessToken)
  try {
    localStorage.setItem(TOAST_TOKEN_KEY, token)
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + TOKEN_TTL_MS))
  } catch (_) {}
  return token
}

function apiGet(path, params = {}, token = null) {
  const url = new URL(`${API_BASE}/${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  })
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(url.toString(), { method: 'GET', headers }).then((r) => r.json().catch(() => ({})))
}

/**
 * Filter employees to only those whose job title contains "Trainer".
 * @param {Array} employees - raw from Toast
 * @param {Array} jobs - raw from Toast (jobGuid -> title map or list)
 * @returns {Array} filtered employees with resolved jobTitle
 */
function filterTrainersFromEmployees(employees, jobs) {
  const jobMap = {}
  if (Array.isArray(jobs)) {
    jobs.forEach((j) => {
      const guid = j.guid ?? j.id
      const title = j.title ?? j.name ?? ''
      if (guid) jobMap[String(guid)] = title
    })
  } else if (jobs && typeof jobs === 'object') {
    Object.entries(jobs).forEach(([guid, t]) => { jobMap[String(guid)] = typeof t === 'string' ? t : (t?.title ?? t?.name ?? '') })
  }

  const out = []
  ;(Array.isArray(employees) ? employees : []).forEach((emp) => {
    const refs = emp.jobReferences ?? emp.jobs ?? []
    const refList = Array.isArray(refs) ? refs : (refs && refs.length ? refs : [])
    let isTrainer = false
    let jobTitle = ''
    for (const ref of refList) {
      const jGuid = ref.guid ?? ref.jobGuid ?? ref
      const title = jobMap[String(jGuid)] ?? ''
      if (title && String(title).toLowerCase().includes('trainer')) {
        isTrainer = true
        jobTitle = title
        break
      }
    }
    if (isTrainer) {
      out.push({
        guid: emp.guid ?? emp.id,
        firstName: emp.firstName ?? emp.first_name ?? '',
        lastName: emp.lastName ?? emp.last_name ?? '',
        email: emp.email ?? '',
        jobTitle: jobTitle || (emp.jobTitle ?? emp.job_title ?? 'Trainer'),
      })
    }
  })
  return out
}

/**
 * Sync trainers from Toast to Firestore.
 * Fetches employees + jobs, keeps only "Trainer" job titles, upserts to trainers collection; archives those no longer in Toast list.
 * @param {string} restaurantGuid - Toast location GUID
 * @param {string} storeName - e.g. Westfield (for reference)
 * @returns {Promise<{ count: number, created: number, updated: number, archived: number }>}
 */
export async function syncTrainersFromToast(restaurantGuid, storeName) {
  const token = await ensureToastToken()

  const [empRes, jobRes] = await Promise.all([
    apiGet('toastEmployees', { restaurantGuid }, token),
    apiGet('toastJobs', { restaurantGuid }, token),
  ])

  const employeesRaw = empRes.data ?? empRes.employees ?? empRes ?? []
  const jobsRaw = jobRes.data ?? jobRes.jobs ?? jobRes ?? []
  const trainers = filterTrainersFromEmployees(
    Array.isArray(employeesRaw) ? employeesRaw : [employeesRaw],
    Array.isArray(jobsRaw) ? jobsRaw : jobsRaw
  )

  if (!db) return { count: trainers.length, created: 0, updated: 0, archived: 0 }

  const coll = collection(db, 'trainers')
  const q = query(
    where('locationGuid', '==', restaurantGuid)
  )
  const snap = await getDocs(q)
  const byToastGuid = {}
  snap.docs.forEach((d) => {
    const data = d.data()
    const guid = data.toastGuid ?? d.id
    if (guid) byToastGuid[String(guid)] = { id: d.id, ref: doc(db, 'trainers', d.id), data }
  })

  const toastGuidsInList = new Set(trainers.map((t) => String(t.guid)))
  let created = 0
  let updated = 0

  for (const t of trainers) {
    const guid = String(t.guid ?? '')
    if (!guid) continue
    const existing = byToastGuid[guid]
    const payload = {
      firstName: t.firstName ?? '',
      lastName: t.lastName ?? '',
      jobTitle: t.jobTitle ?? 'Trainer',
      email: t.email ?? '',
      toastGuid: guid,
      locationGuid: restaurantGuid,
      status: 'active',
    }
    if (existing) {
      await setDoc(existing.ref, {
        ...payload,
        rating: existing.data.rating ?? 0,
        totalRatings: existing.data.totalRatings ?? 0,
      }, { merge: true })
      updated++
    } else {
      await setDoc(doc(db, 'trainers', guid), {
        ...payload,
        rating: 0,
        totalRatings: 0,
      })
      created++
    }
  }

  let archived = 0
  for (const guid of Object.keys(byToastGuid)) {
    if (toastGuidsInList.has(guid)) continue
    const { ref } = byToastGuid[guid]
    await setDoc(ref, { status: 'archived' }, { merge: true })
    archived++
  }

  return { count: trainers.length, created, updated, archived }
}

const TRAINER_SCHEDULES_KEY_PREFIX = 'trainerSchedules_'

/**
 * Format date for Toast API: strict ISO with timezone (e.g. 2023-10-27T00:00:00.000+0000).
 */
function toToastIso(date) {
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  const y = d.getUTCFullYear()
  const m = pad(d.getUTCMonth() + 1)
  const day = pad(d.getUTCDate())
  return `${y}-${m}-${day}T00:00:00.000+0000`
}

/**
 * Sync trainer schedules from Toast for the next 21 days and cache in localStorage.
 * @param {string} restaurantGuid - Toast location GUID
 * @param {string} storeName - e.g. Westfield (used for localStorage key)
 * @returns {Promise<{ shiftCount: number, startDate: string, endDate: string }>}
 */
export async function syncTrainerSchedules(restaurantGuid, storeName) {
  const token = await ensureToastToken()

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 21)

  const startDate = toToastIso(start)
  const endDate = toToastIso(end)

  const res = await apiGet('toastShifts', { restaurantGuid, startDate, endDate }, token)
  const raw = res.data ?? res.shifts ?? res
  const shifts = Array.isArray(raw) ? raw : (raw && raw.body ? raw.body : [])

  const byEmployee = {}
  shifts.forEach((s) => {
    const empRef = s.employeeReference ?? s.employee ?? s
    const guid = empRef.guid ?? empRef.id ?? 'unknown'
    if (!byEmployee[guid]) byEmployee[guid] = []
    byEmployee[guid].push(s)
  })

  const key = `${TRAINER_SCHEDULES_KEY_PREFIX}${storeName || 'Default'}`
  try {
    localStorage.setItem(key, JSON.stringify(byEmployee))
  } catch (_) {}

  return {
    shiftCount: shifts.length,
    startDate: startDate.slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  }
}

/**
 * Get cached trainer schedules for a store (for Schedule Editor conflict warnings).
 * @param {string} storeName
 * @returns {Object} map of employeeGuid -> shifts[]
 */
export function getCachedTrainerSchedules(storeName) {
  try {
    const raw = localStorage.getItem(`${TRAINER_SCHEDULES_KEY_PREFIX}${storeName || 'Default'}`)
    return raw ? JSON.parse(raw) : {}
  } catch (_) {
    return {}
  }
}

export { STORE_TO_TOAST_GUID, API_BASE }
