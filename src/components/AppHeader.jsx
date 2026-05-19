import { useEffect, useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { auth } from '../firebase'
import { useNotifications } from '../hooks/useNotifications'
import ThemeToggle from './ThemeToggle'
import ProfileAvatar from './ProfileAvatar'

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
  const { currentUser, logout, exitImpersonation } = useAuth()
  const realRole = (currentUser?._realUser?.role || '').toLowerCase()
  const isImpersonating = currentUser?._impersonating === true && (realRole === 'admin' || realRole === 'owner')
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

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function handleExitImpersonation() {
    exitImpersonation()
    navigate('/owner', { replace: true })
  }

  function handleSwitchRole() {
    exitImpersonation()
    navigate('/login', { replace: true, state: { switchRole: true } })
  }

  return (
    <>
      {isImpersonating && (
        <div className="bg-amber-500 text-white text-center text-sm font-medium px-4 py-2 flex items-center justify-center gap-3 flex-wrap">
          <span>
            Viewing as {roleLabel(currentUser?.role)}
            {currentUser?.store ? ` at ${currentUser.store}` : ''}
            {currentUser?.name ? ` (${currentUser.name})` : ''}
          </span>
          <button
            type="button"
            className="rounded bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30 transition-colors"
            onClick={handleSwitchRole}
          >
            Switch Role
          </button>
          <button
            type="button"
            className="rounded bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30 transition-colors"
            onClick={handleExitImpersonation}
          >
            Exit to Admin &rarr;
          </button>
        </div>
      )}
    <header className="app-header">
      <div className="app-header-brand">
        Charleston&apos;s Training
        {['admin', 'owner'].includes(String(currentUser?.role).toLowerCase()) && (
          <span className="hidden sm:inline ml-2 text-xs font-normal opacity-80" title={`Build: ${typeof __BUILD_AT__ !== 'undefined' ? __BUILD_AT__ : 'dev'}`}>
            (build {typeof __BUILD_AT__ !== 'undefined' ? new Date(__BUILD_AT__).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'dev'})
          </span>
        )}
      </div>
      <div className="app-header-greeting flex items-center justify-center gap-2">
        <Link to="/profile" className="flex items-center gap-2 text-white hover:opacity-90">
          <ProfileAvatar user={currentUser} size="sm" />
          <span id="userName" className="text-lg font-semibold">
            {currentUser?.name || 'User'}
          </span>
        </Link>
      </div>
      <div className="app-header-actions flex items-center gap-2">
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            className="app-header-btn app-header-btn-logout relative"
            style={unreadCount === 0 ? { opacity: 0.6 } : undefined}
            title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'No notifications'}
            aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'No notifications'}
          >
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full z-[9999] mt-1 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
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
        <ThemeToggle />
        <span className={`hidden sm:inline ${roleClass(currentUser?.role)}`}>{roleLabel(currentUser?.role)}</span>
        <button type="button" onClick={handleLogout} className="app-header-btn app-header-btn-logout min-h-[44px]">
          Log out
        </button>
      </div>
    </header>
    </>
  )
}
