import { FLASHCARD_DATABASE } from '../data/flashcardDatabase'

const VERBAL_CERT_CARDS = FLASHCARD_DATABASE.verbal_cert || []
const PHASE_LABELS = [
  'Phase 1: Training & local options',
  'Phase 2: Food menu (soups, salads, sides, entrees)',
  'Phase 3: Bar (beer, spirits, wine, cocktails)',
  'Phase 4: Service standards & procedures',
]
const PHASE_SPLITS = [0, 17, 36, 53, VERBAL_CERT_CARDS.length] // rough split by topic

export default function VerbalCertChecklistModal({ open, onClose }) {
  if (!open) return null

  const phases = PHASE_LABELS.map((label, i) => ({
    label,
    items: VERBAL_CERT_CARDS.slice(PHASE_SPLITS[i], PHASE_SPLITS[i + 1]).map((c) => c.front),
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-green-50 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-800">Verbal certification checklist</h2>
          <button type="button" className="btn btn-small btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="px-6 py-2 text-sm text-gray-600 border-b border-gray-100">
          Full checklist for the verbal certification exam. Use &quot;Study for Certification&quot; to practice with flashcards.
        </p>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {phases.map((phase, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
              <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wide text-[var(--color-primary)]">
                {phase.label}
              </h3>
              <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700">
                {phase.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
