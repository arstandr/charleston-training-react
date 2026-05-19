import { Component, lazy, Suspense } from 'react'
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { logClientError } from './services/errorLogger'
import { subscribeToDoc } from './utils/firestore'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useTestActive } from './contexts/TestActiveContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { OrgProvider } from './contexts/OrgContext'
import { LoadingProvider } from './contexts/LoadingContext'
import { ConfirmProvider } from './contexts/ConfirmContext'
import { TestActiveProvider } from './contexts/TestActiveContext'
import { TestLockProvider } from './contexts/TestLockContext'
import TestLockOverlay from './components/TestLockOverlay'
import { GeminiProvider } from './contexts/GeminiContext'
import RateLimitIndicator from './components/RateLimitIndicator'
import { getUpdateSW } from './pwaRegistration'
import LoginPage from './pages/LoginPage'
import HelpButton from './components/HelpButton'
import FloatingChatbot from './components/FloatingChatbot'

const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'))
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'))
const TrainerDashboard = lazy(() => import('./pages/TrainerDashboard'))
const TraineeDashboard = lazy(() => import('./pages/TraineeDashboard'))
const HealthPage = lazy(() => import('./pages/HealthPage'))
const ShiftChecklistsPage = lazy(() => import('./pages/ShiftChecklistsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const MenuStudioPage = lazy(() => import('./pages/MenuStudioPage'))
const FlashcardManagerPage = lazy(() => import('./pages/FlashcardManagerPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const DataImportPage = lazy(() => import('./pages/DataImportPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const SystemHealthPage = lazy(() => import('./pages/SystemHealthPage'))
const ShiftDetailPage = lazy(() => import('./pages/ShiftDetailPage'))
const VerbalCertPage = lazy(() => import('./pages/VerbalCertPage'))
const TrainingShiftsPage = lazy(() => import('./pages/TrainingShiftsPage'))
const FlashcardsPage = lazy(() => import('./pages/FlashcardsPage'))
const QuizzesPage = lazy(() => import('./pages/QuizzesPage'))
const VerbalCertPracticePage = lazy(() => import('./pages/VerbalCertPracticePage'))

function LazyRoute({ children }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-[var(--color-primary)] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading…</p>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

function isChunkLoadError(error) {
  const msg = (error?.message || '') + (error?.toString?.() || '')
  // Also catches stale-chunk syndrome: browser requests old hash → gets SPA HTML → "Unexpected token '<'"
  return /Failed to fetch dynamically imported module|Loading chunk|Loading CSS chunk|Unexpected token '<'/i.test(msg)
}

class ErrorBoundary extends Component {
  state = { hasError: false, error: null, isChunkError: false }
  static getDerivedStateFromError(error) {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) }
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    if (isChunkLoadError(error)) {
      // Rate-limit the reload (max 1 per 30s) so a genuinely-unloadable chunk
      // surfaces the fallback UI instead of an infinite reload loop. Mirrors
      // the boot-guard's sessionStorage guard in index.html.
      let canReload = true
      try {
        const last = parseInt(sessionStorage.getItem('ct_boot_reload_at') || '0', 10)
        if (last && Date.now() - last < 30000) {
          canReload = false
        } else {
          sessionStorage.setItem('ct_boot_reload_at', String(Date.now()))
        }
      } catch (_) {
        // No sessionStorage — do not risk a reload loop.
        canReload = false
      }
      if (canReload) {
        window.location.reload()
        return
      }
      // Reloaded too recently — fall through to the fallback UI + report it.
      logClientError('general', 'chunk-load-reload-exhausted', error, {
        componentStack: errorInfo?.componentStack?.substring(0, 500) || null,
        source: 'capture_frontend',
      })
      return
    }
    logClientError('general', 'react-render-crash', error, {
      componentStack: errorInfo?.componentStack?.substring(0, 500) || null,
      source: 'capture_frontend',
    })
  }
  render() {
    if (this.state.hasError) {
      const { isChunkError } = this.state
      return (
        <div className="min-h-[40vh] flex items-center justify-center p-6 text-center bg-[var(--color-primary)]">
          <div>
            <div className="text-4xl mb-4">😵</div>
            <h2 className="text-lg font-bold text-white mb-2">
              {isChunkError ? 'Updating...' : 'Something went wrong'}
            </h2>
            <p className="text-sm text-white/90 mb-4">
              {isChunkError ? 'The app was updated. Reloading automatically...' : 'Something went wrong. Please refresh the page.'}
            </p>
            {!isChunkError && (
              <button
                type="button"
                className="px-6 py-2.5 rounded-xl bg-white text-[var(--color-primary)] font-semibold text-sm hover:bg-gray-100"
                onClick={() => window.location.reload()}
              >
                Refresh Page
              </button>
            )}
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
const APP_VERSION = '2026-03-25-v1'

function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')

  useEffect(() => {
    return subscribeToDoc('config', 'appVersion', (data) => {
      if (!data) return
      if (data.forceRefresh === true) {
        window.location.reload(true)
        return
      }
      const serverVersion = data.trainingAppVersion || ''
      if (serverVersion && serverVersion !== APP_VERSION) {
        setUpdateAvailable(true)
        setUpdateMessage(data.trainingMessage || 'A new version is available. Please refresh.')
      }
    })
  }, [])

  return { updateAvailable, updateMessage }
}

function UpdateBanner({ message }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
      color: 'white',
      padding: '20px',
      textAlign: 'center',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>⚠️ Update Available</div>
      <div style={{ fontSize: '14px', marginBottom: '14px', opacity: 0.95 }}>{message}</div>
      <button
        type="button"
        onClick={() => window.location.reload(true)}
        style={{
          background: 'white',
          color: '#dc2626',
          border: 'none',
          padding: '14px 40px',
          borderRadius: '12px',
          fontSize: '17px',
          fontWeight: 700,
          cursor: 'pointer',
          minWidth: '200px',
        }}
      >
        🔄 Update Now
      </button>
    </div>
  )
}

function VersionCheckBanner() {
  const { updateAvailable, updateMessage } = useVersionCheck()
  if (!updateAvailable) return null
  return <UpdateBanner message={updateMessage} />
}

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
  // Unknown/corrupted role — send back to login rather than looping through /manager
  return <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<ErrorBoundary><LoginPage /></ErrorBoundary>} />
      <Route path="/dashboard" element={<DashboardRedirect />} />
      <Route path="/manager" element={
        <ProtectedRoute allowedRoles={['manager', 'admin', 'owner']}>
          <ErrorBoundary><LazyRoute><ManagerDashboard /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/owner" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><LazyRoute><OwnerDashboard /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/trainer" element={
        <ProtectedRoute allowedRoles={['trainer', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><LazyRoute><TrainerDashboard /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/trainee/health" element={
        <ProtectedRoute allowedRoles={['trainee']}>
          <ErrorBoundary><LazyRoute><HealthPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/trainee" element={
        <ProtectedRoute allowedRoles={['trainee']}>
          <ErrorBoundary><LazyRoute><TraineeDashboard /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/checklists" element={
        <ProtectedRoute allowedRoles={['trainee', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><LazyRoute><ShiftChecklistsPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/training" element={
        <ProtectedRoute allowedRoles={['trainee', 'trainer', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><LazyRoute><TrainingShiftsPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/shift/:shiftId" element={
        <ProtectedRoute allowedRoles={['trainee', 'trainer', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><LazyRoute><ShiftDetailPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/verbal-cert/:traineeId" element={
        <ProtectedRoute allowedRoles={['manager', 'admin', 'owner']}>
          <ErrorBoundary><LazyRoute><VerbalCertPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute allowedRoles={['trainee', 'trainer', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><LazyRoute><ProfilePage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/flashcards" element={
        <ProtectedRoute allowedRoles={['trainee', 'trainer', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><LazyRoute><FlashcardsPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/quizzes" element={
        <ProtectedRoute allowedRoles={['trainee', 'trainer', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><LazyRoute><QuizzesPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/verbal-cert-practice" element={
        <ProtectedRoute allowedRoles={['trainee', 'trainer', 'manager', 'admin', 'owner']}>
          <ErrorBoundary><LazyRoute><VerbalCertPracticePage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/menu-management" element={<Navigate to="/menu-studio" replace />} />
      <Route path="/menu-studio" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><LazyRoute><MenuStudioPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/flashcard-manager" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><LazyRoute><FlashcardManagerPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/analytics" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><LazyRoute><AnalyticsPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/data-import" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><LazyRoute><DataImportPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><LazyRoute><AdminPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/admin/health" element={
        <ProtectedRoute allowedRoles={['admin', 'owner']}>
          <ErrorBoundary><LazyRoute><SystemHealthPage /></LazyRoute></ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function AppWithRouter() {
  const { loading, currentUser } = useAuth()
  const { isTestActive } = useTestActive()
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
      {!isTestActive && <HelpButton />}
      {currentUser && !isTestActive && <FloatingChatbot currentUser={currentUser} />}
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
        <OrgProvider>
          <LoadingProvider>
            <ConfirmProvider>
              <GeminiProvider>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <TestActiveProvider>
                    <TestLockProvider>
                      <VersionCheckBanner />
                      <PWABanners />
                      <AppWithRouter />
                      <TestLockOverlay />
                      <RateLimitIndicator />
                    </TestLockProvider>
                  </TestActiveProvider>
                </BrowserRouter>
              </GeminiProvider>
            </ConfirmProvider>
          </LoadingProvider>
        </OrgProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
