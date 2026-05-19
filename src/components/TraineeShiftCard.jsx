import { SHIFT_META } from '../constants'
import { formatWhenHuman, getShiftStatus, isShiftComplete, getShiftRequiredTestIds } from '../utils/helpers'
import { PRETTY_TEST_NAMES } from '../data/quizDatabase'

export default function TraineeShiftCard({
  shiftKey,
  rec,
  staffAccounts = {},
  traineeId,
  testAttempts,
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

  // Test status per required test
  const requiredTestIds = getShiftRequiredTestIds(shiftKey, traineeId)
  const testStatuses = requiredTestIds.map((testId) => {
    const data = testAttempts?.getAttempts?.(testId) || { count: 0, scores: [], passed: false }
    const prettyName = PRETTY_TEST_NAMES[testId] || testId.replace(/_/g, ' ')
    return { testId, prettyName, ...data }
  })
  const hasTests = testStatuses.length > 0
  const anyFailed = hasTests && testStatuses.some((t) => t.count > 0 && !t.passed)

  // Determine if the shift date is in the future
  const isFutureShift = (() => {
    if (!item.when) return false
    try {
      const shiftDate = new Date(item.when)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      shiftDate.setHours(0, 0, 0, 0)
      return shiftDate.getTime() > today.getTime()
    } catch (_) { return false }
  })()

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
  } else if (hasTests && anyFailed) {
    statusText = 'Tests pending'
    statusColor = '#c62828'
  } else if (status.scheduled && isFutureShift) {
    statusText = 'Upcoming'
    statusColor = '#1976d2'
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
          {hasTests && (
            <div className="mt-2 space-y-1">
              {testStatuses.map((t) => (
                <div key={t.testId} className="flex items-center gap-2 text-xs">
                  {t.passed ? (
                    <span className="text-green-600 font-semibold">&#10003; Passed</span>
                  ) : t.count > 0 ? (
                    <span className="text-red-600 font-semibold">&#10007; {t.count} attempt{t.count !== 1 ? 's' : ''} (best: {Math.max(...t.scores)}%)</span>
                  ) : (
                    <span className="text-gray-400">&#9675; Not taken</span>
                  )}
                  <span className="text-gray-500">{t.prettyName}</span>
                </div>
              ))}
            </div>
          )}
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
              Sign off
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
