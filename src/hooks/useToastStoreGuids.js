import { useState, useEffect, useCallback, useMemo } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { STORE_TO_TOAST_GUID } from '../constants'

const DEFAULT_STORES = Object.keys(STORE_TO_TOAST_GUID)

/**
 * Loads per-store Toast GUIDs and "menu store" from Firestore config.
 * - config/toastStoreGuids: { Westfield: guid, Castleton: guid }
 * - config/toastMenuStore: { store: 'Westfield' } — which store's GUID to use for Menu Studio / Menu Management only
 * Everything else (employees, shifts, etc.) uses the store-specific GUID.
 */
export function useToastStoreGuids() {
  const [storeGuids, setStoreGuids] = useState(() => ({ ...STORE_TO_TOAST_GUID }))
  const [menuStore, setMenuStore] = useState('Westfield')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getDoc(doc(db, 'config', 'toastStoreGuids')),
      getDoc(doc(db, 'config', 'toastMenuStore')),
    ]).then(([guidSnap, menuSnap]) => {
      if (cancelled) return
      const guids = guidSnap.exists && guidSnap.data() && typeof guidSnap.data() === 'object'
        ? { ...STORE_TO_TOAST_GUID, ...guidSnap.data() }
        : { ...STORE_TO_TOAST_GUID }
      const menu = menuSnap.exists && menuSnap.data()?.store
        ? menuSnap.data().store
        : 'Westfield'
      setStoreGuids(guids)
      setMenuStore(menu)
    }).catch(() => {
      if (!cancelled) setStoreGuids({ ...STORE_TO_TOAST_GUID })
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const getRestaurantGuid = useCallback((store) => {
    return storeGuids[store] || STORE_TO_TOAST_GUID[store] || ''
  }, [storeGuids])

  const getMenuRestaurantGuid = useCallback(() => {
    return storeGuids[menuStore] || STORE_TO_TOAST_GUID[menuStore] || ''
  }, [storeGuids, menuStore])

  return {
    storeGuids,
    menuStore,
    loading,
    getRestaurantGuid,
    getMenuRestaurantGuid,
    storeNames: DEFAULT_STORES,
  }
}
