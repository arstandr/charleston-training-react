import { NavLink, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const TABS = [
  { to: '/trainee', label: 'Dashboard' },
  { to: '/flashcards', label: 'Flashcards' },
  { to: '/quizzes', label: 'Practice Tests', practiceTab: true },
  { to: { pathname: '/quizzes', hash: '#tests' }, label: 'Tests', testsTab: true },
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
    <nav className="flex flex-wrap gap-2 border-b border-gray-200 mb-6 bg-white/80 sticky top-0 z-10 -mx-4 px-4 py-2 rounded-b">
      {TABS.map((tab) => {
        const to = typeof tab.to === 'object' ? tab.to : { pathname: tab.to }
        const isActive = tab.testsTab
          ? location.pathname === '/quizzes' && location.hash === '#tests'
          : tab.practiceTab
            ? location.pathname === '/quizzes' && location.hash !== '#tests'
            : location.pathname === (typeof tab.to === 'string' ? tab.to : tab.to.pathname)
        return (
          <NavLink
            key={tab.label}
            to={to}
            className={() =>
              `px-4 py-2 rounded-t-lg font-medium border-b-2 -mb-px ${
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

