import { useMemo } from 'react'
import { getInitials, getShiftProgressByTrainerSign } from '../utils/helpers'
import { analyzeTraineeRisk, getLastActivityDate } from '../utils/RiskEngine'

const TEST_ATTEMPTS_KEY = 'testAttempts'

function loadTestAttempts() {
  try {
    return JSON.parse(localStorage.getItem(TEST_ATTEMPTS_KEY) || '{}') || {}
  } catch (_) {
    return {}
  }
}

export default function TraineeCard({
  trainee,
  trainingData,
  testAttempts: testAttemptsProp,
  needsYouLabel,
  readiness,
  onOpen,
  onEditSchedule,
  onAssess,
  onInsight,
  onArchive,
  onResetAttempts,
  onPrintSummary,
  onEditTrainee,
  onAddNote,
  onViewDetails,
  onDeleteTrainee,
  variant,
}) {
  const { id, name, employeeNumber, store, certified, archived } = trainee
  const rec = useMemo(
    () => (trainingData && id ? { ...trainee, ...(trainingData[id] || {}) } : trainee),
    [trainee, trainingData, id]
  )
  const testAttempts = useMemo(() => testAttemptsProp ?? loadTestAttempts(), [testAttemptsProp])

  const { completedShifts, totalShifts } = getShiftProgressByTrainerSign(rec)
  const progressPct = totalShifts ? Math.round((completedShifts / totalShifts) * 100) : 0
  const lastActive = getLastActivityDate(rec)
  const lastActiveText = lastActive ? lastActive.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  const risk = useMemo(() => (!archived && !certified ? analyzeTraineeRisk(rec, { testAttempts }) : null), [rec, testAttempts, archived, certified])

  const statusBadge =
    archived ? { text: 'ARCHIVED', className: 'bg-red-50 text-red-700' }
    : certified ? { text: 'CERTIFIED', className: 'bg-green-50 text-green-700' }
    : risk
      ? {
          text: risk.level === 'high' ? 'HIGH RISK' : risk.level === 'medium' ? 'MEDIUM RISK' : 'LOW RISK',
          className:
            risk.level === 'high' ? 'bg-red-50 text-red-700' : risk.level === 'medium' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-700',
        }
      : { text: 'IN TRAINING', className: 'bg-gray-100 text-gray-700' }

  const isMint = variant === 'mint'

  const handleCardClick = () => {
    if (onViewDetails) onViewDetails(id)
    else onOpen?.(id)
  }

  return (
    <div
      className={`rounded-xl p-4 border shadow-sm cursor-pointer transition-colors ${isMint ? 'trainee-card-mint' : 'border-gray-200 bg-white hover:border-[var(--color-primary)]'}`}
      onClick={handleCardClick}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-14 h-14 rounded-full bg-[#1F4D1C] flex items-center justify-center text-white text-lg font-bold">
          {getInitials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-gray-800">{name || 'Unnamed'}</div>
          <div className="text-gray-500 text-sm">#{employeeNumber || id} · {store || '—'}</div>
          <div className="text-gray-400 text-xs mt-0.5">Last Active: {lastActiveText}</div>
          {readiness?.average != null && (
            <div className="text-gray-500 text-xs mt-0.5">
              Readiness: {readiness.average}{readiness.count > 1 ? ` (${readiness.count} shifts)` : ''}
            </div>
          )}
        </div>
      </div>
      {needsYouLabel && (
        <div className="mb-2">
          <span className="inline-block rounded px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-800">
            {needsYouLabel}
          </span>
        </div>
      )}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Shifts</span>
          <span>{completedShifts}/{totalShifts}</span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full bg-[var(--color-primary)] rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`inline-block px-2.5 py-1 rounded-xl text-xs font-bold ${statusBadge.className}`}>
          {statusBadge.text}
        </span>
        {risk?.drivers?.length > 0 && (
          <span className="text-xs text-gray-500" title={risk.drivers.join(', ')}>
            {risk.drivers.slice(0, 2).join(' · ')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" onClick={(e) => e.stopPropagation()}>
        {onEditSchedule && !archived && (
          <button type="button" className="btn btn-small" onClick={() => onEditSchedule(id)}>
            Schedule
          </button>
        )}
        {onAssess && !archived && (
          <button type="button" className="btn btn-small btn-secondary" onClick={(e) => { e.stopPropagation(); onAssess(id) }}>
            Assess
          </button>
        )}
        {onInsight && !archived && (
          <button type="button" className="btn btn-small btn-secondary" onClick={(e) => { e.stopPropagation(); onInsight(id) }}>
            Insight
          </button>
        )}
        {onEditTrainee && !archived && (
          <button type="button" className="btn btn-small btn-secondary" onClick={() => onEditTrainee(id)}>
            Edit
          </button>
        )}
        {onAddNote && !archived && (
          <button type="button" className="btn btn-small btn-secondary" onClick={() => onAddNote(id)}>
            Add note
          </button>
        )}
        {onViewDetails && !archived && (
          <button type="button" className="btn btn-small" onClick={(e) => { e.stopPropagation(); onViewDetails(id) }}>
            View details
          </button>
        )}
        {onArchive && (
          <button type="button" className="btn btn-small btn-secondary" onClick={() => onArchive(id)}>
            {archived ? 'Restore' : 'Archive'}
          </button>
        )}
        {onResetAttempts && !archived && (
          <button type="button" className="btn btn-small btn-secondary" onClick={() => onResetAttempts(id)}>
            Reset test attempts
          </button>
        )}
        {onPrintSummary && !archived && (
          <button type="button" className="btn btn-small btn-secondary" onClick={() => onPrintSummary(id)}>
            Print summary
          </button>
        )}
        {onDeleteTrainee && !archived && (
          <button type="button" className="btn btn-small btn-danger" onClick={() => onDeleteTrainee(id)}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
