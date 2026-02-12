import { useState, useCallback, useEffect } from 'react'
import { db } from '../firebase'
import { STAFF_ACCOUNTS_KEY, STAFF_LOGINS } from '../constants'
import { getFromFirestore, saveToFirestore, ensureStaffAccountsFromFirestore } from '../utils/firestore'

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
    if (!db) return true
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
    let entry = staff[empNum]
    if (!entry) return false
    staff[empNum] = { ...entry, archived: true }
    setStaffAccounts({ ...staff })
    const ok = await saveStaffAccounts(staff)
    return ok
  }, [saveStaffAccounts])

  const restoreStaff = useCallback(async (empNum) => {
    const staff = loadFromStorage()
    if (!staff[empNum]) return false
    staff[empNum] = { ...staff[empNum], archived: false }
    await saveStaffAccounts(staff)
    setStaffAccounts(loadFromStorage())
    return true
  }, [saveStaffAccounts])

  return { staffAccounts, reload, saveStaffAccounts, loadStaffAccounts: loadFromStorage, archiveStaff, restoreStaff }
}
