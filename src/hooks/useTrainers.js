import { useState, useCallback, useEffect } from 'react'
import { STAFF_LOGINS } from '../constants'
import { useStaffAccounts } from './useStaffAccounts'
import { useToastStoreGuids } from './useToastStoreGuids'
import { getTrainersByLocation } from '../services/trainerService'

const cache = {}

function loadStaffAccountsSync() {
  try {
    const raw = localStorage.getItem('staffAccounts_v1') || '{}'
    return JSON.parse(raw) || {}
  } catch (_) {
    return {}
  }
}

export function getTrainersForStore(staffAccounts, firestoreCache, store) {
  const staff = staffAccounts || loadStaffAccountsSync()
  let list = Object.entries(staff)
    .map(([empNum, rec]) => ({ empNum, ...rec }))
    .filter((r) => !r.archived && r.role === 'trainer' && (!store || (r.store || '') === (store || '')))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  if (list.length === 0) {
    list = Object.entries(STAFF_LOGINS)
      .filter(([, info]) => info && info.role === 'trainer' && (!store || (info.store || '') === (store || '')))
      .map(([empNum, info]) => ({ empNum, name: info.name || empNum, store: info.store || '', role: 'trainer' }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }
  const fromFirestore = (firestoreCache && firestoreCache[store]) || []
  const byEmp = {}
  const byToastGuid = {}
  const archivedTrainerIds = new Set()
  const archivedNameStore = new Set()
  Object.entries(staff || {}).forEach(([num, rec]) => {
    if (rec.archived && rec.role === 'trainer') {
      archivedTrainerIds.add(String(num))
      if (rec.toastGuid) archivedTrainerIds.add(String(rec.toastGuid))
      const key = `${(rec.name || '').trim().toLowerCase()}::${(rec.store || '').trim().toLowerCase()}`
      if (key) archivedNameStore.add(key)
    }
  })
  list.forEach((t) => {
    const emp = String(t.empNum || '')
    byEmp[emp] = t
    if (t.toastGuid) byToastGuid[String(t.toastGuid)] = t
  })
  fromFirestore.forEach((t) => {
    const emp = String(t.empNum || '')
    // Block by direct empNum/docId match to an archived entry
    if (archivedTrainerIds.has(emp)) return
    // Only block by name+store if the SAME empNum is also archived (avoids blocking a new
    // active trainer who shares a name with a previously archived trainer)
    const nameStoreKey = `${(t.name || '').trim().toLowerCase()}::${(store || t.store || '').trim().toLowerCase()}`
    if (nameStoreKey && archivedNameStore.has(nameStoreKey) && archivedTrainerIds.has(emp)) return
    if (byEmp[emp]) {
      byEmp[emp].firestoreDocId = emp
      if (t.starRating != null) byEmp[emp].starRating = t.starRating
      if (t.ratingsCount != null) byEmp[emp].ratingsCount = t.ratingsCount
      if (t.name && !byEmp[emp].name) byEmp[emp].name = t.name
      if (t.schedule && t.schedule.length > 0) byEmp[emp].schedule = t.schedule
      if (t.scheduleLastUpdated) byEmp[emp].scheduleLastUpdated = t.scheduleLastUpdated
      return
    }
    if (t.toastGuid && byToastGuid[String(t.toastGuid)]) {
      const existing = byToastGuid[String(t.toastGuid)]
      existing.firestoreDocId = emp
      if (t.starRating != null) existing.starRating = t.starRating
      if (t.ratingsCount != null) existing.ratingsCount = t.ratingsCount
      if (t.schedule && t.schedule.length > 0) existing.schedule = t.schedule
      if (t.scheduleLastUpdated) existing.scheduleLastUpdated = t.scheduleLastUpdated
      return
    }
    // Fallback: match by name+store — merge rating/schedule data into staffAccounts entry and skip creating a duplicate
    if (t.name) {
      const tNameLower = t.name.trim().toLowerCase()
      const tStoreLower = (store || t.store || '').toLowerCase()
      const nameFallback = Object.values(byEmp).find((e) =>
        (e.name || '').trim().toLowerCase() === tNameLower &&
        (e.store || '').toLowerCase() === tStoreLower
      )
      if (nameFallback) {
        nameFallback.firestoreDocId = emp
        if (t.starRating != null) nameFallback.starRating = t.starRating
        if (t.ratingsCount != null) nameFallback.ratingsCount = t.ratingsCount
        if (t.schedule && t.schedule.length > 0) nameFallback.schedule = t.schedule
        if (t.scheduleLastUpdated) nameFallback.scheduleLastUpdated = t.scheduleLastUpdated
        return
      }
    }
    if (staff[emp] && staff[emp].archived) return
    if (t.toastGuid && archivedTrainerIds.has(String(t.toastGuid))) return
    const entry = { empNum: emp, name: t.name || 'Trainer', store: store || t.store || '', role: 'trainer' }
    if (t.starRating != null) entry.starRating = t.starRating
    if (t.ratingsCount != null) entry.ratingsCount = t.ratingsCount
    if (t.toastGuid) entry.toastGuid = t.toastGuid
    if (t.schedule) entry.schedule = t.schedule
    if (t.scheduleLastUpdated) entry.scheduleLastUpdated = t.scheduleLastUpdated
    byEmp[emp] = entry
    if (entry.toastGuid) byToastGuid[String(entry.toastGuid)] = entry
  })
  return Object.values(byEmp).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export function useTrainers(store) {
  const { staffAccounts } = useStaffAccounts()
  const { getRestaurantGuid } = useToastStoreGuids()
  const [firestoreCache, setFirestoreCache] = useState(cache)

  const [lastSync, setLastSync] = useState(null)

  const loadTrainersFromFirestoreForStore = useCallback(async (s) => {
    const locationGuid = getRestaurantGuid(s || store)
    if (!locationGuid) return []
    try {
      const list = (await getTrainersByLocation(locationGuid)).map((t) => ({
        ...t,
        store: s || store,
      }))
      setFirestoreCache((prev) => ({ ...prev, [s || store]: list }))
      setLastSync(new Date().toISOString())
      return list
    } catch (e) {
      console.warn('[Trainers] Firestore load failed:', e?.message)
      return []
    }
  }, [store, getRestaurantGuid])

  const trainers = getTrainersForStore(staffAccounts, firestoreCache, store)

  return { trainers, loadTrainersFromFirestoreForStore, lastSync }
}
