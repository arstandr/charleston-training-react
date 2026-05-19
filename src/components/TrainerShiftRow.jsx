import { formatWhenHuman } from '../utils/helpers'

export default function TrainerShiftRow({ row, onOpenDetail, onRateSignOff, health }) {
  const {
    traineeName,
    shiftLabel,
    icon,
    when,
    trainerSigned,
    managerSigned,
    testsStatus,
    checklistComplete = true,
    checklistProgress,
    failedTestTitles = [],
  } = row
  const whenStr = when ? formatWhenHuman(when) : '—'
  const testsOk = testsStatus === 'passed'
  const canSignOff = testsOk && !trainerSigned
  const blockers = []
  if (!testsOk && failedTestTitles?.length) blockers.push(...failedTestTitles.map((t) => `Needs: ${t}`))
  if (!checklistComplete) {
    const prog = checklistProgress
    blockers.push(prog?.total ? `Checklist: ${prog.checked}/${prog.total}` : 'Checklist incomplete')
  }
  const quizAvg = health?.quizAvg

  const handleRowClick = (e) => {
    if (onOpenDetail && !e.target.closest('button')) onOpenDetail(row)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleRowClick(e)}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-1"
    >
      <div className="min-w-0">
        <div className="font-bold text-gray-800">{traineeName}</div>
        <div className="mt-0.5 text-sm text-gray-600">
          {icon ? <span className="mr-1">{icon}</span> : null}
          {shiftLabel}
        </div>
        <div className="mt-0.5 text-sm text-gray-500">{whenStr}</div>
        {quizAvg != null && (
          <div className="mt-0.5 text-xs text-gray-500">Quiz avg: {quizAvg}%</div>
        )}
        {blockers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {blockers.map((b) => (
              <span key={b} className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                {b}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              testsStatus === 'passed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            Tests: {testsStatus === 'passed' ? '✓' : '—'}
          </span>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              checklistComplete ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            Checklist: {checklistComplete ? '✓' : checklistProgress?.total ? `${checklistProgress.checked}/${checklistProgress.total}` : '—'}
          </span>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              trainerSigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Trainer: {trainerSigned ? '✓' : '—'}
          </span>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              managerSigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Manager: {managerSigned ? '✓' : '—'}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {onOpenDetail && (
          <button type="button" className="btn btn-small btn-secondary" onClick={() => onOpenDetail(row)}>
            Open Details
          </button>
        )}
        {onRateSignOff && !trainerSigned && (
          <button
            type="button"
            className={`btn btn-small${!canSignOff ? ' btn-secondary' : ''}`}
            onClick={() => onRateSignOff(row)}
            title={!canSignOff ? 'Complete required tests first' : 'Rate & sign off'}
          >
            Rate &amp; Sign Off
          </button>
        )}
        {trainerSigned && (
          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            Signed ✓
          </span>
        )}
      </div>
    </div>
  )
}
