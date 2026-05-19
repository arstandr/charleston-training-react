import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import NavDropdown from './NavDropdown'
import RoleSelectorModal from './RoleSelectorModal'
import { subscribePendingFlagCount } from '../services/flashcardFlags'
import { subscribeUnresolvedFlagCount } from '../services/chatbotFlagsService'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import { useTrainingData } from '../hooks/useTrainingData'
import { useStaffAccounts } from '../hooks/useStaffAccounts'

/**
 * Owner nav: Overview | Analytics | Menu Studio ▾ | Admin ▾ | View As
 */
export default function OwnerNavBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, impersonate } = useAuth()
  const { stores } = useOrg()
  const { listTrainees } = useTrainingData()
  const { staffAccounts } = useStaffAccounts()
  const pathname = location.pathname || ''
  const hash = location.hash || ''
  const stateView = location.state?.view

  const [flashcardAlertCount, setFlashcardAlertCount] = useState(0)
  const [chatbotFlagCount, setChatbotFlagCount] = useState(0)
  const contentAlertCount = flashcardAlertCount + chatbotFlagCount
  const [showRolePicker, setShowRolePicker] = useState(false)

  const allTrainees = showRolePicker ? listTrainees({ store: null, includeArchived: false }) : []

  useEffect(() => {
    return subscribePendingFlagCount(setFlashcardAlertCount)
  }, [])

  useEffect(() => {
    return subscribeUnresolvedFlagCount(setChatbotFlagCount)
  }, [])

  const activeTab =
    pathname === '/owner' && (stateView === 'overview' || !stateView)
      ? 'overview'
      : pathname === '/analytics'
        ? 'analytics'
        : pathname === '/menu-studio'
          ? 'menu-studio'
          : pathname === '/flashcard-manager' && hash !== '#content-alerts'
            ? 'flashcard-manager'
            : pathname === '/admin/health'
              ? 'system-health'
              : pathname === '/flashcard-manager' && hash === '#content-alerts'
                ? 'content-alerts'
                : pathname === '/admin'
                  ? 'admin-settings'
                  : pathname === '/data-import'
                    ? 'data-import'
                    : 'overview'

  function goTo(id) {
    if (id === 'overview') navigate('/owner', { state: { view: 'overview' }, replace: true })
    else if (id === 'analytics') navigate('/analytics')
    else if (id === 'menu-studio') navigate('/menu-studio')
    else if (id === 'flashcard-manager') navigate('/flashcard-manager')
    else if (id === 'system-health') navigate('/admin/health')
    else if (id === 'content-alerts') navigate('/flashcard-manager#content-alerts')
    else if (id === 'admin-settings') navigate('/admin')
    else if (id === 'data-import') navigate('/data-import')
  }

  return (
    <nav
      className="relative z-20 flex items-center gap-2 px-6 py-3 bg-white border-b border-gray-100 mb-6 overflow-visible"
      role="navigation"
      aria-label="Owner dashboard navigation"
    >
      <button
        type="button"
        onClick={() => goTo('overview')}
        className={`
          px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap
          ${activeTab === 'overview'
            ? 'bg-[var(--color-primary)] text-white shadow-md shadow-green-900/20'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }
        `}
      >
        Overview
      </button>

      <button
        type="button"
        onClick={() => goTo('analytics')}
        className={`
          px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap
          ${activeTab === 'analytics'
            ? 'bg-[var(--color-primary)] text-white shadow-md shadow-green-900/20'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }
        `}
      >
        Analytics
      </button>

      <NavDropdown
        label="Menu Studio"
        activeTab={activeTab}
        onSelect={goTo}
        items={[
          { id: 'menu-studio', label: 'Menu Items', icon: '🍽', description: 'Toast sync, AI cleanup, images' },
          { id: 'flashcard-manager', label: 'Flashcard Manager', icon: '🃏', description: 'Cards, decks, content' },
        ]}
      />

      <NavDropdown
        label="Admin"
        activeTab={activeTab}
        onSelect={goTo}
        items={[
          { id: 'system-health', label: 'System Health', icon: '🏥', description: 'Firebase, Toast, Gemini status' },
          {
            id: 'content-alerts',
            label: 'Content Alerts',
            icon: '🚨',
            description: 'Flagged flashcards & chatbot responses',
            badge: contentAlertCount > 0 ? contentAlertCount : null,
          },
          { id: 'admin-settings', label: 'Settings', icon: '⚙️', description: 'Roles, config, claims' },
          { id: 'data-import', label: 'Data Import/Export', icon: '📤', description: 'Bulk operations' },
        ]}
      />

      <button
        type="button"
        onClick={() => setShowRolePicker(true)}
        className="ml-auto px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200 whitespace-nowrap border border-gray-200"
      >
        View As...
      </button>

      <RoleSelectorModal
        open={showRolePicker}
        staffUser={currentUser}
        stores={stores}
        trainees={allTrainees}
        staffAccounts={staffAccounts}
        onSelect={(selection) => {
          setShowRolePicker(false)
          if (selection.role === 'admin') {
            navigate('/owner', { replace: true })
            return
          }
          if (selection.role === 'manager') {
            impersonate({
              ...currentUser,
              role: 'manager',
              store: selection.store,
              ...(selection.name ? { name: selection.name } : {}),
              ...(selection.managerId ? { empNum: selection.managerId } : {}),
            })
            navigate('/manager', { replace: true })
          } else if (selection.role === 'trainer') {
            impersonate({
              ...currentUser,
              role: 'trainer',
              store: selection.store,
              ...(selection.name ? { name: selection.name } : {}),
              ...(selection.trainerId ? { empNum: selection.trainerId } : {}),
            })
            navigate('/trainer', { replace: true })
          } else if (selection.role === 'trainee') {
            impersonate({
              role: 'trainee',
              name: selection.name,
              store: selection.store,
              traineeId: selection.traineeId,
              id: selection.traineeId,
            })
            navigate('/trainee', { replace: true })
          }
        }}
        onCancel={() => setShowRolePicker(false)}
      />
    </nav>
  )
}
