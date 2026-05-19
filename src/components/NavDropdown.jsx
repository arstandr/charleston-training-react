import { useState, useEffect, useRef } from 'react'

/**
 * Reusable nav dropdown: hover/click to open, click outside to close.
 * items: [{ id, label, icon?, description?, badge? }]
 * activeTab: current route/tab id for highlighting
 * onSelect: (id) => void
 */
export default function NavDropdown({ label, items, activeTab, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const isActive = items.some((item) => !item.separator && item.id === activeTab)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold
          transition-all duration-200 whitespace-nowrap
          ${isActive
            ? 'bg-[var(--color-primary)] text-white shadow-md shadow-green-900/20'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }
        `}
      >
        {label}
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 min-w-[220px] bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-100 py-2 z-[9999]">
          {items.map((item, idx) =>
            item.separator ? (
              <div key={`sep-${idx}`} className="border-t border-gray-100 my-1" />
            ) : (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id)
                setOpen(false)
              }}
              className={`
                w-full text-left px-4 py-3 text-sm font-medium transition-colors
                flex items-center gap-3
                ${activeTab === item.id
                  ? 'text-[var(--color-primary)] bg-green-50/80'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              {item.icon != null && (
                <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              )}
              <div className="flex-1 min-w-0">
                <div>{item.label}</div>
                {item.description && (
                  <div className="text-xs text-gray-400 font-normal mt-0.5">{item.description}</div>
                )}
              </div>
              {item.badge != null && item.badge > 0 && (
                <span className="ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-600 flex-shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
