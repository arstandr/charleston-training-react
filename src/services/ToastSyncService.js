/**
 * Toast POS Sync: Trainers + Schedules for Manager Dashboard.
 * - ensureToastToken: get/save session token via Cloud Function.
 * - syncTrainersFromToast: fetch employees + jobs, filter by "Trainer", upsert/archive in Firestore trainers collection.
 * - syncTrainerSchedules: fetch shifts for next 21 days, group by employee, cache in localStorage for Schedule Editor.
 */
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { STORE_TO_TOAST_GUID } from '../constants'
import { logClientError } from './errorLogger'

/**
 * Allowed role values for staffAccounts entries.
 * Any role written to staffAccounts that is not in this list is invalid and must be normalized.
 * Exported so callers can reference the same contract.
 */
export const ALLOWED_ROLES = ['trainee', 'trainer', 'manager', 'admin', 'owner']

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
 * If Toast has multiple records for the same person (same firstName+lastName),
 * picks one: newest modifiedDate wins, tiebreak by lowest externalEmployeeId.
 * @param {Array} employees - raw from Toast
 * @param {Array} jobs - raw from Toast (jobGuid -> title map or list)
 * @returns {Array} filtered employees with resolved jobTitle (one per person)
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
    if (emp.deleted === true) return // skip terminated employees
    const refs = emp.jobReferences ?? emp.jobs ?? []
    const refList = Array.isArray(refs) ? refs : (refs && refs.length ? refs : [])
    let isTrainer = false
    let jobTitle = ''
    for (const ref of refList) {
      const jGuid = ref.guid ?? ref.jobGuid ?? ref
      // Prefer jobMap lookup; fall back to title/name embedded on the reference itself
      // (some Toast jobs are defined at parent level and won't appear in location job list)
      const title = jobMap[String(jGuid)] ?? ref.title ?? ref.name ?? ''
      if (title && String(title).toLowerCase().includes('trainer')) {
        isTrainer = true
        jobTitle = title
        break
      }
    }
    if (isTrainer) {
      out.push({
        guid: emp.guid ?? emp.v2EmployeeGuid ?? emp.id,
        externalEmployeeId: String(emp.externalEmployeeId ?? emp.external_employee_id ?? emp.employeeNumber ?? '').trim(),
        firstName: emp.firstName ?? emp.first_name ?? '',
        lastName: emp.lastName ?? emp.last_name ?? '',
        email: emp.email ?? '',
        jobTitle: jobTitle || (emp.jobTitle ?? emp.job_title ?? 'Trainer'),
        modifiedDate: emp.modifiedDate ?? emp.modified_date ?? '',
      })
    }
  })
  return dedupeEmployeesByName(out, 'Trainer')
}

/**
 * Toast keeps duplicate employee records for the same person sometimes (e.g. James Uribe
 * #4547 + #45471 — both deleted=false). We pick exactly one per (firstName+lastName):
 *   1. Newest modifiedDate wins.
 *   2. Tiebreak: lowest numeric externalEmployeeId (the original — dupes are usually re-adds with higher numbers).
 *   3. Tiebreak: first one seen.
 * Logs skipped duplicates so they're auditable in the console.
 */
function dedupeEmployeesByName(list, label = 'Employee') {
  const groups = new Map()
  for (const item of list) {
    const key = `${(item.firstName || '').trim().toLowerCase()}|${(item.lastName || '').trim().toLowerCase()}`
    if (!key.replace('|', '')) {
      // No name at all — keep separate so we don't collapse anonymous records
      groups.set(`__nameless_${item.guid}`, [item])
      continue
    }
    const bucket = groups.get(key) || []
    bucket.push(item)
    groups.set(key, bucket)
  }
  const winners = []
  for (const [key, bucket] of groups.entries()) {
    if (bucket.length === 1) { winners.push(bucket[0]); continue }
    bucket.sort((a, b) => {
      const aMod = a.modifiedDate || ''
      const bMod = b.modifiedDate || ''
      if (aMod !== bMod) return aMod < bMod ? 1 : -1 // newer first
      const aNum = parseInt(a.externalEmployeeId, 10)
      const bNum = parseInt(b.externalEmployeeId, 10)
      if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum // lower first
      return 0
    })
    const [winner, ...losers] = bucket
    winners.push(winner)
    console.warn(`[ToastSync] ${label} dedup — keeping ${winner.firstName} ${winner.lastName} #${winner.externalEmployeeId} (guid=${winner.guid}, modified=${winner.modifiedDate || '?'}); skipping ${losers.length} duplicate Toast record(s):`,
      losers.map((l) => ({ empId: l.externalEmployeeId, guid: l.guid, modified: l.modifiedDate })))
  }
  return winners
}

/**
 * Returns true if a non-archived trainees/ doc exists for this employee number.
 * Used so a trainer who is also a trainee gets roles: ['trainer', 'trainee'] set
 * on their staffAccounts entry, enabling the role picker at login.
 * @param {string} empNum - employee number (externalEmployeeId)
 * @returns {Promise<boolean>}
 */
async function hasActiveTraineeDoc(empNum) {
  if (!empNum || !db) return false
  try {
    const q = query(
      collection(db, 'trainees'),
      where('employeeNumber', '==', empNum),
      where('archived', '==', false)
    )
    const snap = await getDocs(q)
    return !snap.empty
  } catch (_) {
    return false
  }
}

/**
 * Sync trainers from Toast to Firestore + staffAccounts.
 * Fetches employees + jobs, keeps only "Trainer" job titles, upserts to trainers collection; archives those no longer in Toast list.
 * When currentStaffAccounts is provided, also archives staffAccounts trainer entries no longer in Toast.
 * @param {string} restaurantGuid - Toast location GUID
 * @param {string} storeName - e.g. Westfield (for reference)
 * @param {Object} [currentStaffAccounts] - optional; if provided, stale trainers will be archived in it
 * @returns {Promise<{ count: number, created: number, updated: number, archived: number, staffAccounts?: Object }>}
 */
export async function syncTrainersFromToast(restaurantGuid, storeName, currentStaffAccounts = null) {
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

  let docs
  try {
    const res = await fetch(`${API_BASE}/getTrainersByLocation?restaurantGuid=${encodeURIComponent(restaurantGuid)}`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || `getTrainersByLocation ${res.status}`)
    docs = Array.isArray(json.data) ? json.data : []
  } catch (e) {
    const wrap = new Error(`ToastSyncService getTrainersByLocation: ${e?.message || e}`)
    wrap.stack = e?.stack
    throw wrap
  }
  const byToastGuid = {}
  docs.forEach((d) => {
    const id = d.id
    const data = { ...d }
    delete data.id
    const guid = data.toastGuid ?? id
    if (guid) byToastGuid[String(guid)] = { id, ref: doc(db, 'trainers', id), data }
  })

  const toastGuidsInList = new Set(trainers.map((t) => String(t.guid)))
  let created = 0
  let updated = 0

  // Toast is the source of truth: if Toast says they're active, our system says they're active.
  // Any local archive flag on a trainer Toast still has is overridden (un-archived).
  // Toast-side duplicates are handled upstream in dedupeEmployeesByName.
  // Sync active status from Toast deleted flag to prevent auth bypass for terminated trainers.
  for (const t of trainers) {
    const guid = String(t.guid ?? '')
    if (!guid) continue
    const existing = byToastGuid[guid]
    const isDeletedInToast = t.deleted === true
    const active = !isDeletedInToast
    const payload = {
      firstName: t.firstName ?? '',
      lastName: t.lastName ?? '',
      jobTitle: t.jobTitle ?? 'Trainer',
      email: t.email ?? '',
      toastGuid: guid,
      locationGuid: restaurantGuid,
      status: active ? 'active' : 'archived',
      archived: isDeletedInToast,
      active,
      // employeeNumber is the human-readable emp# (externalEmployeeId from Toast).
      // Always written so trainer cards can display it regardless of doc ID shape.
      employeeNumber: t.externalEmployeeId ?? '',
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

  // Sync staffAccounts: create/update trainer entries + archive stale ones
  const toastEmpNums = new Set(trainers.map((t) => t.externalEmployeeId).filter(Boolean))
  let mergedAccounts = currentStaffAccounts ? { ...currentStaffAccounts } : {}

  // Build toastGuid -> existing staffAccounts key map so we can detect when a manager
  // has renamed an entry's key (e.g. swapped Toast Employee ID for POS access code).
  // Includes archived entries — Toast = truth, so we un-archive them in place.
  const guidToExistingKey = {}
  for (const [k, v] of Object.entries(mergedAccounts)) {
    if (v?.toastGuid) guidToExistingKey[String(v.toastGuid)] = k
  }

  // Create/update staffAccounts entry for each active trainer.
  // Toast = truth: if Toast has them, our system has them. Archive flag overridden.
  //
  // Dual-role detection: if this trainer also has an active (non-archived) trainees/ doc,
  // set roles: ['trainer', 'trainee'] so the role picker fires at login instead of routing
  // them silently to the trainer dashboard with no training access.
  for (const t of trainers) {
    const empNum = t.externalEmployeeId
    if (!empNum) continue
    const existingKey = guidToExistingKey[String(t.guid)]
    const targetKey = existingKey && existingKey !== empNum ? existingKey : empNum
    const existing = mergedAccounts[targetKey]
    // Don't demote admins/owners — those are role assignments, not Toast-derived
    if (existing && (existing.role === 'admin' || existing.role === 'owner')) continue
    const name = `${t.firstName} ${t.lastName}`.trim() || 'Trainer'

    // Check if this trainer is also actively going through training.
    // Only query when the entry is new or doesn't already carry the trainee role,
    // so we avoid a Firestore read on every sync for already-wired entries.
    const alreadyHasTraineeRole = (existing?.roles ?? []).includes('trainee')
    const isAlsoTrainee = alreadyHasTraineeRole || await hasActiveTraineeDoc(empNum)

    if (existing) {
      let existingRole = existing.role
      // Normalize invalid roles (e.g. legacy 'staff') before merging.
      if (existingRole && !ALLOWED_ROLES.includes(existingRole)) {
        const normalizedRole = isAlsoTrainee ? 'trainee' : 'trainer'
        console.warn(`[ToastSync] Invalid role "${existingRole}" on entry #${targetKey} — normalizing to "${normalizedRole}"`)
        logClientError('toastSync', 'invalid_role_normalized', new Error(`Invalid role: ${existingRole}`), { empNum: targetKey, oldRole: existingRole, normalizedRole })
        existingRole = normalizedRole
      }
      const hasOtherRole = existingRole && existingRole !== 'trainer'
      let updatedRoles
      if (hasOtherRole) {
        updatedRoles = [...new Set([...(existing.roles || [existingRole]), 'trainer'])]
      } else if (isAlsoTrainee) {
        updatedRoles = ['trainer', 'trainee']
      } else {
        updatedRoles = existing.roles
      }
      // Trainee-badge guard: if this person has an active trainee doc but is NOT in the Toast
      // trainer list (isAlsoTrainee=true, we are in the trainer loop so they ARE a trainer —
      // this guard applies to the role written, not the trainer filter). The badge rule:
      // trainee badge + trainer badge → trainer; trainee badge + no trainer badge → trainee.
      // Since we're in the trainer loop, they have the trainer badge — no demotion needed here.
      mergedAccounts[targetKey] = {
        ...existing,
        role: (hasOtherRole && existingRole === 'manager') ? existingRole : 'trainer',
        ...(updatedRoles?.length > 1 ? { roles: updatedRoles } : { roles: undefined }),
        name, archived: false, toastGuid: t.guid,
      }
    } else {
      mergedAccounts[targetKey] = {
        role: 'trainer',
        ...(isAlsoTrainee ? { roles: ['trainer', 'trainee'] } : {}),
        name, store: storeName, archived: false, toastGuid: t.guid,
      }
    }
  }

  // Archive staffAccounts trainer entries no longer in Toast (matched by toastGuid or externalEmployeeId)
  for (const [empNum, info] of Object.entries(mergedAccounts)) {
    if (info?.archived) continue
    if (info?.role !== 'trainer') continue
    if (info?.store !== storeName) continue
    // Archive if we can definitively match to Toast and they're gone
    const matchedByGuid = info.toastGuid && !toastGuidsInList.has(String(info.toastGuid))
    const matchedByEmpNum = empNum && toastEmpNums.size > 0 && !toastEmpNums.has(empNum)
    if (matchedByGuid || (matchedByEmpNum && !info.toastGuid)) {
      mergedAccounts[empNum] = { ...info, archived: true }
      archived++
    }
  }

  return { count: trainers.length, created, updated, archived, staffAccounts: mergedAccounts }
}

/**
 * Station / system / integration accounts (POS station logins, online-ordering bots, the
 * Lexi AI integration). These can carry a manager job code in Toast but are not real people.
 * NOTE: @example.com is NOT a station signal — Toast uses it as a placeholder email for
 * real employees who have no email on file. Only @toasttab.com / hilexi.ai are system domains.
 */
function isStationAccount(name, email) {
  const n = String(name || '').trim().toLowerCase()
  const e = String(email || '').trim().toLowerCase()
  if (/\b(default|online ordering|support|station|login|kiosk)\b/.test(n)) return true
  if (n.includes('charleston')) return true // e.g. "Charleston's Westfield" = store/POS account
  if (/@(toasttab\.com|hilexi\.ai)$/.test(e)) return true
  return false
}

/**
 * Filter employees to only those whose job title contains "Manager".
 * @param {Array} employees - raw from Toast
 * @param {Array} jobs - raw from Toast
 * @returns {Array} filtered employees with resolved jobTitle + externalEmployeeId
 */
function filterManagersFromEmployees(employees, jobs) {
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
    if (emp.deleted === true) return // skip terminated employees
    const refs = emp.jobReferences ?? emp.jobs ?? []
    const refList = Array.isArray(refs) ? refs : (refs && refs.length ? refs : [])
    let isManager = false
    let jobTitle = ''
    for (const ref of refList) {
      const jGuid = ref.guid ?? ref.jobGuid ?? ref
      // Fall back to title/name on the reference itself — parent-level Toast jobs
      // won't appear in the location job list but may have title embedded on jobReference
      const title = jobMap[String(jGuid)] ?? ref.title ?? ref.name ?? ''
      const lower = String(title).toLowerCase()
      if (title && (lower.includes('manager') || lower.includes('key hourly') || lower.includes('key manager'))) {
        isManager = true
        jobTitle = title
        break
      }
    }
    if (isManager) {
      const firstName = emp.firstName ?? emp.first_name ?? ''
      const lastName = emp.lastName ?? emp.last_name ?? ''
      // Drop POS station / online-ordering / integration accounts that carry a manager code.
      if (isStationAccount(`${firstName} ${lastName}`.trim(), emp.email)) return
      out.push({
        guid: emp.guid ?? emp.id,
        firstName,
        lastName,
        email: emp.email ?? '',
        externalEmployeeId: emp.externalEmployeeId ?? emp.external_employee_id ?? emp.employeeNumber ?? '',
        jobTitle: jobTitle || (emp.jobTitle ?? emp.job_title ?? 'Manager'),
        modifiedDate: emp.modifiedDate ?? emp.modified_date ?? '',
      })
    }
  })
  return dedupeEmployeesByName(out, 'Manager')
}

/**
 * Sync managers from Toast into staffAccounts.
 * Fetches employees + jobs, keeps only "Manager" job titles, merges into provided staffAccounts object.
 * Does NOT persist — caller handles saving to Firestore/localStorage.
 * @param {string} restaurantGuid - Toast location GUID
 * @param {string} storeName - e.g. Westfield
 * @param {Object} currentStaffAccounts - current staffAccounts to merge into
 * @returns {Promise<{ count: number, created: number, updated: number, staffAccounts: Object }>}
 */
export async function syncManagersFromToast(restaurantGuid, storeName, currentStaffAccounts = {}) {
  const token = await ensureToastToken()

  const [empRes, jobRes] = await Promise.all([
    apiGet('toastEmployees', { restaurantGuid }, token),
    apiGet('toastJobs', { restaurantGuid }, token),
  ])

  const employeesRaw = empRes.data ?? empRes.employees ?? empRes ?? []
  const jobsRaw = jobRes.data ?? jobRes.jobs ?? jobRes ?? []
  const managers = filterManagersFromEmployees(
    Array.isArray(employeesRaw) ? employeesRaw : [employeesRaw],
    Array.isArray(jobsRaw) ? jobsRaw : jobsRaw
  )

  const merged = { ...currentStaffAccounts }
  let created = 0
  let updated = 0
  let archived = 0
  const createdNames = []

  const toastEmpNums = new Set(managers.map((m) => String(m.externalEmployeeId || '').trim()).filter(Boolean))
  const toastGuids = new Set(managers.map((m) => String(m.guid || '')).filter(Boolean))
  const toastNames = new Set(managers.map((m) => `${m.firstName} ${m.lastName}`.trim().toLowerCase()).filter(Boolean))

  // toastGuid/name -> existing staffAccounts key. Lets a manager whose Toast record has a
  // blank or changed Employee ID still match their existing entry (incl. archived ones) —
  // the manager equivalent of the trainer sync's guid sticky-key guard. Without this, a
  // Toast record with a blank Employee ID silently archives a real, current manager.
  const guidToKey = {}
  const nameToKey = {}
  for (const [k, v] of Object.entries(merged)) {
    if (v?.toastGuid) guidToKey[String(v.toastGuid)] = k
    if (v?.name) nameToKey[String(v.name).trim().toLowerCase()] = k
  }

  // Toast = truth: a current Manager / Key Hourly / Key Manager job code => active manager.
  // Local archive flag is overridden. Admin/owner role assignments are preserved.
  // Sync active status from Toast deleted flag to prevent auth bypass for terminated employees.
  for (const m of managers) {
    const empNum = String(m.externalEmployeeId || '').trim()
    const guid = String(m.guid || '')
    const name = `${m.firstName} ${m.lastName}`.trim() || 'Manager'
    const isDeletedInToast = m.deleted === true
    const active = !isDeletedInToast

    // Resolve a stable key: an existing entry (by guid, then name), else the Toast Employee ID.
    // A brand-new manager whose Toast record has a blank Employee ID can't be keyed — skip
    // (caller surfaces these as "needs an Employee ID in Toast").
    const targetKey = (guid && guidToKey[guid]) || nameToKey[name.toLowerCase()] || empNum
    if (!targetKey) continue

    const existing = merged[targetKey]
    if (existing && (existing.role === 'admin' || existing.role === 'owner')) continue

    if (existing) {
      let existingRole = existing.role
      // Normalize invalid roles (e.g. legacy 'staff') before merging.
      if (existingRole && !ALLOWED_ROLES.includes(existingRole)) {
        const normalizedRole = 'manager'
        console.warn(`[ToastSync] Invalid role "${existingRole}" on entry #${targetKey} — normalizing to "${normalizedRole}"`)
        logClientError('toastSync', 'invalid_role_normalized', new Error(`Invalid role: ${existingRole}`), { empNum: targetKey, oldRole: existingRole, normalizedRole })
        existingRole = normalizedRole
      }
      const hasOtherRole = existingRole && existingRole !== 'manager'
      const updatedRoles = hasOtherRole
        ? [...new Set([...(existing.roles || [existingRole]), 'manager'])]
        : existing.roles
      merged[targetKey] = {
        ...existing,
        role: 'manager',
        ...(updatedRoles?.length > 1 ? { roles: updatedRoles } : { roles: undefined }),
        name, store: existing.store || storeName,
        archived: false, toastGuid: existing.toastGuid || guid,
        active,
      }
      updated++
    } else {
      merged[targetKey] = { role: 'manager', name, store: storeName, archived: false, toastGuid: guid, active }
      createdNames.push(name)
      created++
    }
  }

  // Archive managers at this store no longer job-coded as a manager in Toast.
  // Exempt anyone still matched to Toast by guid, Employee ID, or name — Toast keeps the same
  // person under separate per-store records, so a single entry's guid won't match every sync.
  for (const [empNum, info] of Object.entries(merged)) {
    if (info?.archived) continue
    if (info?.role === 'admin' || info?.role === 'owner') continue
    if (info?.role !== 'manager') continue
    if (info?.store !== storeName) continue
    const matched = (info.toastGuid && toastGuids.has(String(info.toastGuid))) ||
      toastEmpNums.has(empNum) ||
      (info.name && toastNames.has(String(info.name).trim().toLowerCase()))
    if (matched) continue
    merged[empNum] = { ...info, archived: true }
    archived++
  }

  return { count: managers.length, created, updated, archived, createdNames, staffAccounts: merged }
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
    endDate: endDate.slice(0, 10),
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
