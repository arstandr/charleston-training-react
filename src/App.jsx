import { Component } from 'react'
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { OrgProvider } from './contexts/OrgContext'
import { LoadingProvider } from './contexts/LoadingContext'
import { ConfirmProvider } from './contexts/ConfirmContext'
import { TestActiveProvider } from './contexts/TestActiveContext'
import { getUpdateSW } from './pwaRegistration'
import LoginPage from './pages/LoginPage'
import ManagerDashboard from './pages/ManagerDashboard'
import OwnerDashboard from './pages/OwnerDashboard'
import TrainerDashboard from './pages/TrainerDashboard'
import TraineeDashboard from './pages/TraineeDashboard'
import FlashcardsPage from './pages/FlashcardsPage'
import QuizzesPage from './pages/QuizzesPage'
import MenuManagementPage from './pages/MenuManagementPage'
import MenuStudioPage from './pages/MenuStudioPage'
import AnalyticsPage from './pages/AnalyticsPage'
import DataImportPage from './pages/DataImportPage'
import AdminPage from './pages/AdminPage'
import HelpButton from './components/HelpButton'

class ErrorBoundary extends Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(err) {
    return { hasError: true, error: err }
  }
  componentDidCatch(err, info) {
    console.error('App error:', err, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-gray-100">
          <div className="max-w-lg bg-white rounded-xl shadow-lg p-8">
            <h1 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h1>
            <p className="text-gray-700 mb-4">{this.state.error?.message || 'Unknown error'}</p>
            <button
              type="button"
              className="btn"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, loading } = useAuth()
  if (loading) return <div className="min-h-[40vh] flex items-center justify-center text-gray-600">Loading...</div>
  if (!currentUser) return <Navigate to="/login" replace />
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
  if (roles.length && !roles.some(r => (currentUser.role || '').includes(r))) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

const INSTALL_DISMISS_KEY = 'chartrain-pwa-install-dismissed'

function PWABanners() {
  const [showUpdate, setShowUpdate] = useState(false)
  const [installEvent, setInstallEvent] = useState(null)
  const [showInstall, setShowInstall] = useState(false)
  const [offline, setOffline] = useState(() => !navigator.onLine)

  useEffect(() => {
    const onNeedRefresh = () => setShowUpdate(true)
    window.addEventListener('pwa-need-refresh', onNeedRefresh)
    return () => window.removeEventListener('pwa-need-refresh', onNeedRefresh)
  }, [])

  useEffect(() => {
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    const onInstall = (e) => {
      e.preventDefault()
      setInstallEvent(e)
      try {
        if (localStorage.getItem(INSTALL_DISMISS_KEY) !== '1') setShowInstall(true)
      } catch (_) {}
    }
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => window.removeEventListener('beforeinstallprompt', onInstall)
  }, [])

  function handleRefresh() {
    const fn = getUpdateSW()
    if (typeof fn === 'function') fn()
    setShowUpdate(false)
    window.location.reload()
  }

  function handleInstall() {
    if (installEvent?.prompt) {
      installEvent.prompt()
      installEvent.userChoice?.then(() => setInstallEvent(null))
      setShowInstall(false)
    }
  }

  function dismissInstall() {
    setShowInstall(false)
    try { localStorage.setItem(INSTALL_DISMISS_KEY, '1') } catch (_) {}
  }

  return (
    <>
      {offline && (
        <div className="sticky top-0 z-[101] bg-gray-700 px-4 py-2 text-center text-white text-sm">
          You&apos;re offline. Some features may be unavailable.
        </div>
      )}
      {showUpdate && (
        <div className="sticky top-0 z-[100] flex items-center justify-between bg-amber-500 px-4 py-2 text-white shadow">
          <span>New version available.</span>
          <button type="button" className="rounded bg-white px-3 py-1 text-sm font-semibold text-amber-700" onClick={handleRefresh}>
            Refresh
          </button>
        </div>
      )}
      {showInstall && (
        <div className="sticky top-0 z-[99] flex items-center justify-between bg-[var(--color-primary)] px-4 py-2 text-white shadow">
          <span>Install Charleston&apos;s Training for quick access.</span>
          <div className="flex gap-2">
            <button type="button" className="rounded bg-white px-3 py-1 text-sm font-semibold text-[var(--color-primary)]" onClick={handleInstall}>
              Install
            </button>
            <button type="button" className="rounded border border-white px-3 py-1 text-sm" onClick={dismissInstall}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function DashboardRedirect() {
  const { currentUser } = useAuth()
  if (!currentUser) return <Navigate to="/login" replace />
  const role = (currentUser.role || '').toLowerCase()
  if (role === 'admin' || role === 'owner') return <Navigate to="/owner" replace />
  if (role.includes('manager')) return <Navigate to="/manager" replace />
  if (role.includes('trainer')) return <Navigate to="/trainer" replace />
  if (role === 'trainee') return <Navigate to="/trainee" replace />
  return <Navigate to="/manager" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardRedirect />} />
      <Route path="/manager" element={
        <ProtectedRoute allowedRoles={['manager', 'admin', 'owner']}>
          <ErrorBoundary><ManagerDashboard /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/owner" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><OwnerDashboard /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/trainer" element={
        <ProtectedRoute allowedRoles={['trainer', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><TrainerDashboard /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/trainee" element={
        <ProtectedRoute allowedRoles={['trainee']}>
          <ErrorBoundary><TraineeDashboard /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/flashcards" element={
        <ProtectedRoute allowedRoles={['trainee', 'trainer', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><FlashcardsPage /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/quizzes" element={
        <ProtectedRoute allowedRoles={['trainee', 'trainer', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><QuizzesPage /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/menu-management" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><MenuManagementPage /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/menu-studio" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><MenuStudioPage /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/analytics" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><AnalyticsPage /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/data-import" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><DataImportPage /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><AdminPage /></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function AppWithRouter() {
  const { loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        <p>Loading Charleston Training…</p>
      </div>
    )
  }
  return (
    <>
      <AppRoutes />
      <HelpButton />
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OrgProvider>
          <LoadingProvider>
            <ConfirmProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <TestActiveProvider>
              <PWABanners />
              <AppWithRouter />
            </TestActiveProvider>
          </BrowserRouter>
            </ConfirmProvider>
          </LoadingProvider>
        </OrgProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
