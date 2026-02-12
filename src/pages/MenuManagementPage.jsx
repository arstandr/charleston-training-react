import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import { useToastStoreGuids } from '../hooks/useToastStoreGuids'
import { getToastMenus } from '../services/toast'

export default function MenuManagementPage() {
  const { currentUser } = useAuth()
  const { getMenuRestaurantGuid, menuStore } = useToastStoreGuids()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [menuData, setMenuData] = useState(null)

  async function handlePullMenus() {
    const restaurantGuid = getMenuRestaurantGuid()
    if (!restaurantGuid) {
      setError('No Toast menu GUID configured. Set it in Admin → Settings → per-store GUIDs and choose Menu store.')
      return
    }
    setLoading(true)
    setError(null)
    setMenuData(null)
    try {
      const result = await getToastMenus(restaurantGuid)
      setMenuData(result.data ?? result)
    } catch (err) {
      setError(err.message || 'Failed to fetch menus from Toast.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AppHeader />
      <div className="container mx-auto px-4 pb-8">
        <OwnerNavBar />
        <div className="content-area">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Menu Management</h2>
          <p className="text-gray-600 text-sm mb-6">
            Pull menus from Toast POS for this location. To import items into your training content and manage graveyard, use Menu Studio.
          </p>
          <div className="mb-6">
            <Link to="/menu-studio" className="btn btn-small">
              Open Menu Studio
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-6">
            <span className="text-sm text-gray-600">Menu source: <strong>{menuStore}</strong> (set in Admin → Settings)</span>
            <button
              type="button"
              className="btn btn-small"
              onClick={handlePullMenus}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Pull menus from Toast'}
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {menuData && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="font-bold text-gray-800 mb-2">Menus from Toast</h3>
              <pre className="text-xs text-gray-700 overflow-auto max-h-[60vh] whitespace-pre-wrap">
                {typeof menuData === 'object' ? JSON.stringify(menuData, null, 2) : String(menuData)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
