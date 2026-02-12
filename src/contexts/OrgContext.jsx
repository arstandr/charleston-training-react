import { createContext, useContext, useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'

const DEFAULT_ORG_ID = 'org_charlestons'

const defaultOrgData = {
  name: "Charleston's",
  slug: 'charlestons',
  stores: ['Westfield', 'Castleton'],
  toastGuids: {
    Westfield: '86326c13-2905-455f-924a-a970ba974785',
    Castleton: 'b2965271-1d9f-4507-a427-0451c2e54cbf',
  },
  branding: { appName: "Charleston's Training", logoUrl: null },
}

const OrgContext = createContext(null)

export function OrgProvider({ children }) {
  const { currentUser } = useAuth()
  const orgId = currentUser?.orgId ?? DEFAULT_ORG_ID
  const [orgData, setOrgData] = useState(defaultOrgData)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchOrg() {
      if (!db) {
        if (!cancelled) setOrgData(defaultOrgData)
        if (!cancelled) setLoading(false)
        return
      }
      try {
        const ref = doc(db, 'organizations', orgId)
        const snap = await getDoc(ref)
        if (cancelled) return
        if (snap.exists() && snap.data()) {
          const d = snap.data()
          setOrgData({
            name: d.name ?? defaultOrgData.name,
            slug: d.slug ?? defaultOrgData.slug,
            stores: Array.isArray(d.stores) ? d.stores : defaultOrgData.stores,
            toastGuids: d.toastGuids && typeof d.toastGuids === 'object' ? d.toastGuids : defaultOrgData.toastGuids,
            branding: d.branding && typeof d.branding === 'object'
              ? { appName: d.branding.appName ?? defaultOrgData.branding.appName, logoUrl: d.branding.logoUrl ?? null }
              : defaultOrgData.branding,
            createdAt: d.createdAt,
          })
        } else {
          setOrgData(defaultOrgData)
        }
      } catch (_) {
        if (!cancelled) setOrgData(defaultOrgData)
      }
      if (!cancelled) setLoading(false)
    }
    setLoading(true)
    fetchOrg()
    return () => { cancelled = true }
  }, [orgId])

  const value = {
    orgId,
    orgData,
    stores: orgData.stores,
    toastGuids: orgData.toastGuids,
    loading,
  }

  return (
    <OrgContext.Provider value={value}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
