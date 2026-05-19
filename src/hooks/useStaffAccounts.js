import { useState, useCallback, useEffect } from 'react'
import { STAFF_ACCOUNTS_KEY, STAFF_LOGINS } from '../constants'
import { getFromFirestore, saveToFirestore, ensureStaffAccountsFromFirestore, updateDocFields } from '../utils/firestore'
import { updateTrainer } from '../services/trainerService'

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

  // Write each entry to its own `data.{empNum}` field path instead of replacing the whole
  // doc. This prevents stale browser tabs from clobbering other tabs' edits — a tab with an
  // outdated localStorage will only overwrite keys it knows about; entries added/changed by
  // other tabs survive.
  const saveStaffAccounts = useCallback(async (data) => {
    const payload = data || {}
    try {
      localStorage.setItem(STAFF_ACCOUNTS_KEY, JSON.stringify(payload))
    } catch (_) {}
    setStaffAccounts(payload)
    try {
      const cleaned = JSON.parse(JSON.stringify(payload))
      const updates = { updatedAt: new Date().toISOString() }
      for (const [k, v] of Object.entries(cleaned)) {
        if (v && typeof v === 'object') updates[`data.${k}`] = v
      }
      const ok = await updateDocFields('config', 'staffAccounts', updates)
      // Fallback: if the doc doesn't exist yet, fall back to the full-doc setter (creates it).
      if (!ok) {
        const created = await saveToFirestore('config', 'staffAccounts', { data: cleaned, updatedAt: updates.updatedAt })
        return created
      }
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
      staff[id] = { ...entry, archived: true }
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
