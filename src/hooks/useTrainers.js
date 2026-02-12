import { useState, useCallback, useEffect } from 'react'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import { STAFF_LOGINS } from '../constants'
import { useStaffAccounts } from './useStaffAccounts'
import { useToastStoreGuids } from './useToastStoreGuids'

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
  list.forEach((t) => {
    const emp = String(t.empNum || '')
    byEmp[emp] = t
    if (t.toastGuid) byToastGuid[String(t.toastGuid)] = t
  })
  fromFirestore.forEach((t) => {
    const emp = String(t.empNum || '')
    if (byEmp[emp]) {
      if (t.starRating != null) byEmp[emp].starRating = t.starRating
      if (t.ratingsCount != null) byEmp[emp].ratingsCount = t.ratingsCount
      if (t.name && !byEmp[emp].name) byEmp[emp].name = t.name
      return
    }
    if (t.toastGuid && byToastGuid[String(t.toastGuid)]) {
      const existing = byToastGuid[String(t.toastGuid)]
      if (t.starRating != null) existing.starRating = t.starRating
      if (t.ratingsCount != null) existing.ratingsCount = t.ratingsCount
      return
    }
    if (staff[emp] && staff[emp].archived) return
    if (t.toastGuid && Object.keys(staff).some((k) => staff[k].toastGuid === t.toastGuid && staff[k].archived)) return
    const entry = { empNum: emp, name: t.name || 'Trainer', store: store || t.store || '', role: 'trainer' }
    if (t.starRating != null) entry.starRating = t.starRating
    if (t.ratingsCount != null) entry.ratingsCount = t.ratingsCount
    if (t.toastGuid) entry.toastGuid = t.toastGuid
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
    if (!locationGuid || !db) return []
    try {
      const q = query(
        collection(db, 'trainers'),
        where('locationGuid', '==', locationGuid),
        where('status', '==', 'active'),
        orderBy('rating', 'desc')
      )
      const snap = await getDocs(q)
      const list = snap.docs.map((d) => {
        const data = d.data()
        return {
          empNum: d.id,
          name: ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || 'Trainer',
          store: s || store,
          role: 'trainer',
          starRating: data.rating || 0,
          ratingsCount: data.totalRatings || 0,
          toastGuid: data.toastGuid,
        }
      })
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
