import { useState, useEffect, memo } from 'react'
import { getTrainerRatingsSummary } from '../services/trainerRatingsService'

export default memo(function TrainerCard({ trainer, onEdit, onFeedback, onClick, onArchive }) {
  const {
    empNum,
    name,
    toastGuid,
    starRating = 0,
    ratingsCount = 0,
    shiftsThisWeek = 0,
    assignedCount = 0,
    effectivenessPct,
    schedule = [],
  } = trainer

  const hasSchedule = schedule && schedule.length > 0
  // Prefer startTime/inDate over date-only string to avoid UTC timezone off-by-one
  const getShiftDate = (s) => new Date(s.startTime || s.inDate || s.date)
  const todayStart = new Date(new Date().toDateString())
  const upcomingShifts = hasSchedule
    ? schedule.filter((s) => getShiftDate(s) >= todayStart).length
    : 0
  const upcomingShiftsList = hasSchedule
    ? schedule
        .filter((s) => getShiftDate(s) >= todayStart)
        .sort((a, b) => getShiftDate(a) - getShiftDate(b))
        .slice(0, 14)
    : []

  const [firestoreRatings, setFirestoreRatings] = useState(null)
  const [ratingsLoading, setRatingsLoading] = useState(true)
  const [showSchedule, setShowSchedule] = useState(false)

  // A valid display number is numeric-only or a short code (1-6 digits).
  // Toast GUIDs (uuid format) and Firestore auto-IDs (20-char alphanumeric) are never valid emp#s.
  // This guard prevents doc IDs leaking into the display if the employeeNumber field is missing.
  const isValidEmpNum = empNum && /^\d{1,6}$/.test(String(empNum).trim())
  const displayEmpNum = isValidEmpNum ? empNum : null

  const trainerId = toastGuid || empNum

  useEffect(() => {
    if (!trainerId) {
      setRatingsLoading(false)
      return
    }
    getTrainerRatingsSummary(trainerId)
      .then((result) => setFirestoreRatings(result))
      .catch((error) => {
        console.error('Error loading trainer ratings:', error)
        setFirestoreRatings(null)
      })
      .finally(() => setRatingsLoading(false))
  }, [trainerId])

  // Prefer Firestore ratings when available; fall back to trainingData (starRating/ratingsCount)
  const displayRating = firestoreRatings?.averageRating ?? (ratingsCount > 0 ? Number(starRating).toFixed(1) : null)
  const displayCount = firestoreRatings?.totalRatings ?? ratingsCount

  const stars =
    '★'.repeat(Math.round(parseFloat(displayRating) || 0)) +
    '☆'.repeat(5 - Math.round(parseFloat(displayRating) || 0))
  const initial = (name || 'T').charAt(0).toUpperCase()

  function handleCardClick() {
    if (onClick) onClick(trainer)
    else if (onFeedback) onFeedback(empNum)
  }

  return (
    <div
      className="relative cursor-pointer rounded-2xl border-2 border-[#f57c00] p-5 shadow-md"
      style={{
        background: 'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
        boxShadow: '0 4px 12px rgba(245,124,0,0.15)',
      }}
      onClick={handleCardClick}
      title="Click to see rating breakdown"
    >
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {hasSchedule && (
          <span
            className="rounded-lg bg-blue-500 px-2 py-0.5 text-xs font-bold text-white"
            title={`${upcomingShifts} upcoming shift(s)`}
            onClick={(e) => e.stopPropagation()}
          >
            📅 {upcomingShifts}
          </span>
        )}
        {effectivenessPct != null && assignedCount > 0 && (
          <span
            className="rounded-lg bg-green-600 px-2 py-0.5 text-xs font-bold text-white"
            title="Effectiveness: % of assigned shifts with manager sign-off"
          >
            Eff: {effectivenessPct}%
          </span>
        )}
        <span className="rounded-xl bg-[#f57c00] px-2.5 py-1 text-xs font-bold text-white">
          TRAINER
        </span>
      </div>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f57c00] text-xl font-bold text-white">
          {initial}
        </div>
        <div>
          <div className="font-bold text-gray-800">{name || 'Unnamed'}</div>
          <div className="text-xs text-gray-500">
            {displayEmpNum ? `#${displayEmpNum}` : 'No #'}
          </div>
        </div>
      </div>
      <div className="mb-3">
        <div
          className="text-lg tracking-wider text-[#f57c00]"
          title={`${displayRating || '—'} avg (${displayCount} ratings)`}
        >
          {stars}
        </div>
        <div className="text-xs text-gray-500">
          {ratingsLoading ? (
            <span className="inline-block h-4 w-32 animate-pulse rounded bg-gray-200" />
          ) : displayRating ? (
            `${displayRating} avg (${displayCount} rating${displayCount !== 1 ? 's' : ''}) · Click for breakdown`
          ) : (
            'No ratings yet · Click for details'
          )}
        </div>
      </div>
      <div className="mb-3 text-sm text-gray-600">
        Shifts this week: <strong>{shiftsThisWeek}</strong> · Assigned Trainees:{' '}
        <strong>{assignedCount}</strong>
      </div>
      {/* Expandable Upcoming Schedule */}
      {hasSchedule && (
        <div className="mb-3" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            onClick={() => setShowSchedule(!showSchedule)}
          >
            <span>📅</span>
            <span>{showSchedule ? 'Hide' : 'View'} Schedule ({upcomingShifts} upcoming)</span>
            <span className="text-[10px]">{showSchedule ? '▲' : '▼'}</span>
          </button>
          {showSchedule && (
            <div className="mt-2 space-y-1 max-h-44 overflow-y-auto rounded-lg border border-gray-200 p-2 bg-white/80">
              {upcomingShiftsList.length === 0 ? (
                <div className="text-xs text-gray-400 italic py-1">No upcoming shifts found</div>
              ) : (
                upcomingShiftsList.map((shift, i) => {
                  const date = getShiftDate(shift)
                  const endDate = shift.endTime ? new Date(shift.endTime) : null
                  const dayStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                  const endStr = endDate ? endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
                  const isToday = date.toDateString() === new Date().toDateString()
                  const isTomorrow = date.toDateString() === new Date(Date.now() + 86400000).toDateString()
                  return (
                    <div
                      key={i}
                      className={`text-xs px-2.5 py-1.5 rounded-md flex justify-between items-center ${
                        isToday ? 'bg-green-100 text-green-800 font-semibold border border-green-200' :
                        isTomorrow ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                        'bg-gray-50 text-gray-600 border border-gray-100'
                      }`}
                    >
                      <span>{isToday ? '🟢 Today' : isTomorrow ? '🔵 Tomorrow' : dayStr}</span>
                      <span>{timeStr}{endStr ? ` – ${endStr}` : ''}</span>
                      {shift.jobName && (
                        <span className="text-[10px] text-gray-400 truncate max-w-[80px]">{shift.jobName}</span>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {onEdit && (
          <button
            type="button"
            className="btn btn-small min-w-[80px] flex-1"
            onClick={() => onEdit(empNum)}
          >
            Edit
          </button>
        )}
        {(onClick || onFeedback) && (
          <button
            type="button"
            className="btn btn-small btn-secondary min-w-[80px] flex-1"
            onClick={(e) => {
              e.stopPropagation()
              if (onFeedback) onFeedback(empNum)
              else if (onClick) onClick(trainer)
            }}
          >
            View feedback
          </button>
        )}
        {onArchive && (
          <button
            type="button"
            className="btn btn-small btn-danger"
            onClick={() => onArchive(empNum)}
          >
            Archive
          </button>
        )}
      </div>
    </div>
  )
})
