import { useNavigate, useLocation } from 'react-router-dom'

/**
 * Shared navigation bar for Owner Dashboard and all admin/owner pages.
 * Kept visible on /owner, /admin, /analytics, /data-import, /menu-management, /menu-studio
 * so the nav is consistent regardless of which link is clicked.
 * Menu Studio is not included here (access via Menu Management → Open Menu Studio).
 */
export default function OwnerNavBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname || ''
  const search = location.search || ''
  const tab = new URLSearchParams(search).get('tab')
  const stateView = location.state?.view

  const isOwner = pathname === '/owner'
  const isOverview = isOwner && (stateView === 'overview' || !stateView)
  const isStaff = isOwner && stateView === 'staff'
  const isTrainees = isOwner && stateView === 'trainees'
  const isAnalytics = pathname === '/analytics'
  const isDataImport = pathname === '/data-import'
  const isAdmin = pathname === '/admin' && tab !== 'alerts'
  const isAlerts = pathname === '/admin' && tab === 'alerts'
  const isMenuManagement = pathname === '/menu-management' || pathname === '/menu-studio'

  const btn = (active, label, onClick) => (
    <button
      type="button"
      key={label}
      className={`btn btn-small ${active ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : 'btn-secondary'}`}
      onClick={onClick}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-wrap gap-2 mb-6" role="navigation" aria-label="Owner dashboard navigation">
      {btn(isOverview, 'Overview', () => navigate('/owner', { state: { view: 'overview' }, replace: true }))}
      {btn(isStaff, 'Staff', () => navigate('/owner', { state: { view: 'staff' }, replace: true }))}
      {btn(isTrainees, 'All Trainees', () => navigate('/owner', { state: { view: 'trainees' }, replace: true }))}
      {btn(isAnalytics, 'Analytics', () => navigate('/analytics'))}
      {btn(isDataImport, 'Data import/export', () => navigate('/data-import'))}
      {btn(isAdmin, 'Admin', () => navigate('/admin'))}
      {btn(isAlerts, 'Content Alerts', () => navigate('/admin?tab=alerts'))}
      {btn(isMenuManagement, 'Menu Management', () => navigate('/menu-management'))}
    </div>
  )
}
