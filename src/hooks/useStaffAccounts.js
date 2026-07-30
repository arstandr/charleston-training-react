import { useState, useCallback, useEffect } from 'react'
import { STAFF_ACCOUNTS_KEY, STAFF_LOGINS } from '../constants'
import { getFromFirestore, saveToFirestore, ensureStaffAccountsFromFirestore } from '../utils/firestore'
import { updateTrainer } from '../services/trainerService'
import { ALLOWED_ROLES } from '../services/ToastSyncService'
import { logClientError } from '../services/errorLogger'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STAFF_ACCOUNTS_KEY) || '{}'
    return JSON.parse(raw) || {}
  } catch (_) {
    return {}
  }
}

export function useStaffAccounts() {
  const [staffAccounts, setStaffAccounts] = useState(loadFromStorage)

  const reload = useCallback(() => {
    setStaffAccounts(loadFromStorage())
  }, [])

  useEffect(() => {
    let cancelled = false
    ensureStaffAccountsFromFirestore().then(() => {
      if (!cancelled) setStaffAccounts(loadFromStorage())
    })
    return () => { cancelled = true }
  }, [])

  const saveStaffAccounts = useCallback(async (data) => {
    const payload = data || {}
    try {
      localStorage.setItem(STAFF_ACCOUNTS_KEY, JSON.stringify(payload))
    } catch (_) {}
    setStaffAccounts(payload)
    try {
      const toSave = JSON.parse(JSON.stringify({ data: payload, updatedAt: new Date().toISOString() }))
      const ok = await saveToFirestore('config', 'staffAccounts', toSave)
      return ok
    } catch (e) {
      console.warn('[StaffAccounts] Firestore save failed:', e?.message)
      return false
    }
  }, [])

  const archiveStaff = useCallback(async (empNum) => {
    const staff = loadFromStorage()
    const id = String(empNum)
    let entry = staff[id]
    // If no staff entry (e.g. trainer came only from Firestore), create minimal one so we have a record
    if (!entry) {
      entry = { role: 'trainer', archived: true }
      staff[id] = entry
    } else {
      // Normalize invalid role before archiving — preserves the intent (archival) while fixing the role contract
      let roleToWrite = entry.role
      if (roleToWrite && !ALLOWED_ROLES.includes(roleToWrite)) {
        const normalizedRole = 'trainer'
        console.warn(`[archiveStaff] Invalid role "${roleToWrite}" on entry #${id} — normalizing to "${normalizedRole}"`)
        logClientError('toastSync', 'invalid_role_normalized', new Error(`Invalid role: ${roleToWrite}`), { empNum: id, oldRole: roleToWrite, normalizedRole })
        roleToWrite = normalizedRole
      }
      staff[id] = { ...entry, role: roleToWrite, archived: true }
    }
    setStaffAccounts({ ...staff })
    await saveStaffAccounts(staff)
    // Also mark the trainer doc in Firestore so they disappear from the trainer list
    try {
      await updateTrainer(id, { archived: true, status: 'archived' })
    } catch (e) {
      console.warn('[archiveStaff] Firestore trainer update failed:', e?.message)
    }
    return true
  }, [saveStaffAccounts])

  const restoreStaff = useCallback(async (empNum) => {
    const staff = loadFromStorage()
    const id = String(empNum)
    if (!staff[id]) return false
    staff[id] = { ...staff[id], archived: false }
    await saveStaffAccounts(staff)
    setStaffAccounts(loadFromStorage())
    // Clear archived flag on Firestore trainer doc so they show again
    try {
      await updateTrainer(id, { archived: false, status: 'active' })
    } catch (e) {
      console.warn('[restoreStaff] Firestore trainer update failed:', e?.message)
    }
    return true
  }, [saveStaffAccounts])

  return { staffAccounts, reload, saveStaffAccounts, loadStaffAccounts: loadFromStorage, archiveStaff, restoreStaff }
}
