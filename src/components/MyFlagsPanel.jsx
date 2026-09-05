import { useEffect, useState } from 'react'
import { getFlagsForUser } from '../services/flashcardFlags'

const STATUS_LABEL = {
  pending: { text: 'Under review', className: 'bg-amber-100 text-amber-800' },
  fixed: { text: 'Fixed ✓', className: 'bg-green-100 text-green-800' },
  dismissed: { text: 'Reviewed — no change', className: 'bg-gray-100 text-gray-600' },
}

/** Shows a trainee the questions they've flagged and whether anything came of it. */
export default function MyFlagsPanel({ identifiers }) {
  const [flags, setFlags] = useState([])
  const key = (identifiers || []).filter(Boolean).join('|')

  useEffect(() => {
    if (!key) return
    getFlagsForUser(identifiers).then(setFlags).catch(() => setFlags([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (flags.length === 0) return null

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="font-semibold text-gray-800 mb-2">Questions you've flagged</h3>
      <div className="space-y-2">
        {flags.map((flag) => {
          const status = STATUS_LABEL[flag.status] || STATUS_LABEL.pending
          return (
            <div key={flag.id} className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-sm text-gray-700 flex-1">{flag.quizQuestion || flag.front || 'Flagged question'}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                {status.text}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
