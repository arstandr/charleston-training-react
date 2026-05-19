import { useState, useEffect, useCallback, useMemo } from 'react'
import { STORE_TO_TOAST_GUID } from '../constants'
import { getFromFirestore } from '../utils/firestore'

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
      getFromFirestore('config', 'toastStoreGuids'),
      getFromFirestore('config', 'toastMenuStore'),
    ]).then(([guidDoc, menuDoc]) => {
      if (cancelled) return
      const guids = guidDoc && typeof guidDoc === 'object'
        ? { ...STORE_TO_TOAST_GUID, ...guidDoc }
        : { ...STORE_TO_TOAST_GUID }
      const menu = menuDoc?.store || 'Westfield'
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
    const v = storeGuids[store] || STORE_TO_TOAST_GUID[store] || ''
    return typeof v === 'string' ? v.trim() : ''
  }, [storeGuids])

  const getMenuRestaurantGuid = useCallback(() => {
    const v = storeGuids[menuStore] || STORE_TO_TOAST_GUID[menuStore] || ''
    return typeof v === 'string' ? v.trim() : ''
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
