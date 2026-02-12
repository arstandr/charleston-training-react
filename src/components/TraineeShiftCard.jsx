import { SHIFT_META } from '../constants'
import { formatWhenHuman, getShiftStatus, isShiftComplete } from '../utils/helpers'

export default function TraineeShiftCard({
  shiftKey,
  rec,
  staffAccounts = {},
  onViewDetail,
  onStudyFlashcards,
  onPracticeTest,
  onTest,
}) {
  const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey, icon: '', flashcardSetId: null }
  const item = (rec?.schedule && rec.schedule[shiftKey]) || {}
  const whenStr = item.when ? formatWhenHuman(item.when) : 'Not scheduled'
  const getName = (emp) => {
    const r = staffAccounts[emp]
    return (r && r.name) ? r.name : (emp ? `#${emp}` : 'Not assigned yet')
  }
  const trainerName = item.trainer ? getName(item.trainer) : 'Not assigned yet'
  const status = getShiftStatus(rec, shiftKey)
  const complete = isShiftComplete(rec, shiftKey)

  let statusText = 'Not started'
  let statusColor = '#666'
  if (complete) {
    statusText = 'Complete'
    statusColor = '#2e7d32'
  } else if (status.trainerSigned && !status.managerSigned) {
    statusText = 'Waiting sign-off'
    statusColor = '#5e35b1'
  } else if (status.trainerSigned || status.managerSigned) {
    statusText = 'Waiting sign-off'
    statusColor = '#5e35b1'
  } else if (status.scheduled) {
    statusText = 'In progress'
    statusColor = '#e65100'
  }

  return (
    <div className="trainee-shift-card rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-bold text-gray-800">
            {meta.icon ? <span className="mr-1.5">{meta.icon}</span> : null}
            {meta.label}
          </div>
          <div className="mt-1 text-sm text-gray-600">{whenStr}</div>
          <div className="mt-0.5 text-sm text-gray-500">Trainer: {trainerName}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {meta.flashcardSetId && (
              <button
                type="button"
                className="btn btn-small text-sm"
                onClick={() => onStudyFlashcards?.(meta.flashcardSetId)}
                disabled={!onStudyFlashcards}
              >
                Flashcards
              </button>
            )}
            <button
              type="button"
              className="btn btn-small text-sm"
              onClick={() => onPracticeTest?.(shiftKey)}
              disabled={!onPracticeTest}
            >
              Practice Test
            </button>
            <button
              type="button"
              className="btn btn-small text-sm"
              onClick={() => onTest?.(shiftKey)}
              disabled={!onTest}
            >
              Test
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onViewDetail && (
            <button type="button" className="btn btn-small" onClick={() => onViewDetail(shiftKey)}>
              Details
            </button>
          )}
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: statusColor }}
          >
            {statusText}
          </span>
        </div>
      </div>
    </div>
  )
}
