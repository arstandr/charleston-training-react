import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { auth } from '../firebase'
import { useNotifications } from '../hooks/useNotifications'

const DARK_MODE_KEY = 'chartrain-dark-mode'

function roleLabel(role) {
  if (!role) return 'User'
  const r = String(role).toLowerCase()
  if (r === 'admin' || r === 'owner') return 'Admin'
  if (r.includes('manager')) return 'Manager'
  if (r.includes('trainer')) return 'Trainer'
  if (r === 'trainee') return 'Trainee'
  return role
}

function roleClass(role) {
  if (!role) return 'role-badge'
  const r = String(role).toLowerCase()
  if (r === 'admin' || r === 'owner') return 'role-badge role-admin'
  if (r.includes('manager')) return 'role-badge role-manager'
  if (r.includes('trainer')) return 'role-badge role-trainer'
  if (r === 'trainee') return 'role-badge role-trainee'
  return 'role-badge'
}

export default function AppHeader() {
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  const [authUid, setAuthUid] = useState(() => auth.currentUser?.uid ?? null)
  const { items: notificationItems, unreadCount, markAsRead, markAllRead } = useNotifications(authUid)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef(null)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setAuthUid(u?.uid ?? null))
    return () => unsub()
  }, [])

  useEffect(() => {
    function close(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    if (notifOpen) {
      document.addEventListener('click', close)
      return () => document.removeEventListener('click', close)
    }
  }, [notifOpen])

  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem(DARK_MODE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) {
      root.classList.add('dark-mode')
    } else {
      root.classList.remove('dark-mode')
    }
    try {
      localStorage.setItem(DARK_MODE_KEY, darkMode ? '1' : '0')
    } catch (_) {}
  }, [darkMode])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="app-header">
      <div className="app-header-brand">Charleston&apos;s Training</div>
      <div className="app-header-greeting text-center">
        <span id="userName" className="text-lg font-semibold text-white">
          {currentUser?.name || 'User'}
        </span>
      </div>
      <div className="app-header-actions flex items-center gap-2">
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            className="app-header-btn app-header-btn-logout relative"
            title="Notifications"
            aria-label="Notifications"
          >
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                <span className="font-semibold text-gray-800">Notifications</span>
                {unreadCount > 0 && (
                  <button type="button" className="text-xs text-[var(--color-primary)]" onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-auto">
                {notificationItems.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">No notifications</p>
                ) : (
                  notificationItems.slice(0, 20).map((n) => (
                    <div
                      key={n.id}
                      className={`border-b border-gray-100 px-3 py-2 text-sm ${n.read ? 'bg-white text-gray-600' : 'bg-gray-50 font-medium text-gray-800'}`}
                    >
                      <div className="font-medium">{n.title || 'Notification'}</div>
                      <p className="mt-0.5">{n.message}</p>
                      {!n.read && (
                        <button
                          type="button"
                          className="mt-1 text-xs text-[var(--color-primary)]"
                          onClick={() => markAsRead(n.id)}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          className="app-header-btn app-header-btn-logout"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
        <span className={roleClass(currentUser?.role)}>{roleLabel(currentUser?.role)}</span>
        <button type="button" onClick={handleLogout} className="app-header-btn app-header-btn-logout">
          Log out
        </button>
      </div>
    </header>
  )
}
