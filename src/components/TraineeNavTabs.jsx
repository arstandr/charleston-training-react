import { NavLink, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const TABS = [
  { to: '/trainee', label: 'Dashboard' },
  { to: '/trainee/health', label: 'Health' },
  { to: '/flashcards', label: 'Flashcards' },
  { to: '/quizzes', label: 'Practice Tests', practiceTab: true },
  { to: { pathname: '/quizzes', hash: '#tests' }, label: 'Tests', testsTab: true },
  { to: '/verbal-cert-practice', label: 'Cert Prep' },
]

export default function TraineeNavTabs() {
  const location = useLocation()

  useEffect(() => {
    if (location.hash === '#tests') {
      const el = document.getElementById('tests')
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [location.pathname, location.hash])

  return (
    <nav className="flex overflow-x-auto scrollbar-hide gap-2 border-b border-gray-200 mb-6 bg-white/80 sticky top-0 z-10 -mx-4 px-4 py-2 rounded-b">
      {TABS.map((tab) => {
        const to = typeof tab.to === 'object' ? tab.to : { pathname: tab.to }
        const searchParams = new URLSearchParams(location.search)
        const isOfficialMode = searchParams.get('mode') === 'official'
        const isActive = tab.testsTab
          ? location.pathname === '/quizzes' && (location.hash === '#tests' || isOfficialMode)
          : tab.practiceTab
            ? location.pathname === '/quizzes' && location.hash !== '#tests' && !isOfficialMode
            : tab.to.pathname === '/trainee/health'
              ? location.pathname === '/trainee/health'
              : location.pathname === (typeof tab.to === 'string' ? tab.to : tab.to.pathname)
        return (
          <NavLink
            key={tab.label}
            to={to}
            className={() =>
              `flex-shrink-0 whitespace-nowrap min-h-[44px] flex items-center px-4 py-2 rounded-t-lg font-medium border-b-2 -mb-px ${
                isActive
                  ? 'bg-white border border-b-0 border-gray-200 text-[var(--color-primary)] border-[var(--color-primary)]'
                  : 'text-gray-600 hover:bg-gray-50 border-transparent'
              }`
            }
          >
            {tab.label}
          </NavLink>
        )
      })}
    </nav>
  )
}

