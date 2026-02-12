import { NavLink } from 'react-router-dom'

export default function NavTabs({ tabs = [] }) {
  if (!tabs.length) return null
  return (
    <nav className="flex gap-2 border-b border-gray-200 mb-6">
      {tabs.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `px-4 py-2 rounded-t-lg font-medium ${isActive ? 'bg-white border border-b-0 border-gray-200 text-[var(--color-primary)]' : 'text-gray-600 hover:bg-gray-50'}`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
