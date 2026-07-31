import { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { SHIFT_TYPES, SHIFT_META, HOST_SHIFT_KEY, shiftNeedsTrainer } from '../constants'

const DEFAULT_TIME = '17:00' // fallback when no per-shift default
const PRIMARY_GREEN = '#1F4D1C'

const SHIFT_DEFAULT_TIMES = {
  host: '16:00',
  follow: '10:00',
  rev1: '10:00',
  rev2: '16:00',
  rev3: '16:00',
  rev4: '16:00',
  foodrun: '16:00',
  cert: '', // leave blank — manager will fill in
}

function formatRating(trainer) {
  const r = trainer?.starRating
  if (r != null && !isNaN(Number(r))) return Number(r).toFixed(1)
  return 'New'
}

function ratingDisplay(trainer) {
  const val = formatRating(trainer)
  return val === 'New' ? `☆ ${val}` : `⭐ ${val}`
}

function ScheduleWarning({ title, message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in">
        <div className="text-center mb-4">
          <span className="text-4xl">⚠️</span>
          <h3 className="text-lg font-bold text-gray-900 mt-2">{title}</h3>
        </div>
        <p className="text-sm text-gray-600 text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50"
          >
            Pick someone else
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600"
          >
            Assign anyway
          </button>
        </div>
      </div>
    </div>
  )
}

function getDoubleBookedTrainers(dateStr, currentTraineeId, allTrainingData) {
  const booked = {}
  const targetDate = (dateStr || '').split('T')[0]
  if (!targetDate) return booked

  Object.entries(allTrainingData || {}).forEach(([tid, data]) => {
    if (tid === currentTraineeId || !data?.schedule) return
    if (data.archived) return
    const traineeName = data.name || tid

    Object.entries(data.schedule).forEach(([shiftKey, item]) => {
      if (!item?.when || !item?.trainer) return
      const itemDate = (typeof item.when === 'string' ? item.when : '').split('T')[0]
      if (itemDate === targetDate) {
        booked[item.trainer] = {
          traineeName,
          shiftLabel: SHIFT_META[shiftKey]?.label || shiftKey,
          shiftKey,
        }
      }
    })
  })
  return booked
}

function checkRepeatTrainer(trainerEmpNum, currentShiftKey, localSchedule) {
  const ALLOWED_PAIR = ['follow', 'rev3']
  for (const shift of SHIFT_TYPES) {
    if (shift.key === currentShiftKey) continue
    const item = localSchedule[shift.key]
    if (item?.trainer === trainerEmpNum) {
      const pairKeys = [currentShiftKey, shift.key].sort()
      const isAllowedRepeat = pairKeys[0] === 'follow' && pairKeys[1] === 'rev3'
      return {
        isRepeat: true,
        isAllowedRepeat,
        existingShiftKey: shift.key,
        existingShiftLabel: SHIFT_META[shift.key]?.label || shift.key,
      }
    }
  }
  return null
}

function isTrainerAvailable(trainer, dateStr) {
  if (!trainer.schedule || !Array.isArray(trainer.schedule) || trainer.schedule.length === 0) {
    return { available: false, noData: true }
  }
  const targetDate = (dateStr || '').split('T')[0]
  if (!targetDate) return { available: false, noData: true }
  const matchingShifts = trainer.schedule.filter((shift) => {
    const shiftDate = (shift.inDate || shift.date || shift.startTime || '').toString().split('T')[0]
    return shiftDate === targetDate
  })
  if (matchingShifts.length === 0) return { available: false, noData: false }
  return {
    available: true,
    shifts: matchingShifts,
    timeRange: formatShiftTimeRange(matchingShifts[0]),
  }
}

function formatShiftTimeRange(shift) {
  try {
    const start = new Date(shift.inDate || shift.startTime || shift.date)
    const end = new Date(shift.outDate || shift.endTime || shift.date)
    const fmt = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return fmt(start) + ' – ' + fmt(end)
  } catch (e) {
    return 'Scheduled'
  }
}

function getSortedTrainersForShift(trainers, dateStr, usedTrainerMap, currentShiftKey, doubleBookedMap) {
  const available = []
  const doubleBooked = []
  const unavailable = []

  trainers.forEach((t) => {
    const status = isTrainerAvailable(t, dateStr)
    const isUsed = (usedTrainerMap[t.empNum] || []).length > 0
    const isAllowedRepeat = currentShiftKey === 'rev3' && (usedTrainerMap[t.empNum] || []).includes('follow')
    const bookingConflict = doubleBookedMap[t.empNum] || null

    const entry = { ...t, ...status, isUsed, isAllowedRepeat, bookingConflict, usedShifts: usedTrainerMap[t.empNum] || [] }
    if (bookingConflict) doubleBooked.push(entry)
    else if (status.available) available.push(entry)
    else unavailable.push(entry)
  })

  const sortFn = (a, b) => {
    if (a.isUsed && !a.isAllowedRepeat && (!b.isUsed || b.isAllowedRepeat)) return 1
    if ((!a.isUsed || a.isAllowedRepeat) && b.isUsed && !b.isAllowedRepeat) return -1
    return (b.starRating || 0) - (a.starRating || 0)
  }
  available.sort(sortFn)
  doubleBooked.sort(sortFn)
  unavailable.sort(sortFn)
  return { available, doubleBooked, unavailable }
}

function autoAssignTrainers(localSchedule, trainers, managers, traineeId, allTrainingData) {
  const newSchedule = { ...localSchedule }
  const usedTrainerMap = {}
  let followTrainerEmpNum = null

  SHIFT_TYPES.forEach((shift) => {
    const item = newSchedule[shift.key]
    if (item?.trainer) {
      if (!usedTrainerMap[item.trainer]) usedTrainerMap[item.trainer] = []
      usedTrainerMap[item.trainer].push(shift.key)
      if (shift.key === 'follow') followTrainerEmpNum = item.trainer
    }
  })

  SHIFT_TYPES.forEach((shift) => {
    const item = newSchedule[shift.key]
    if (!item?.when || item.trainer) return
    if (!shiftNeedsTrainer(shift.key)) return  // Host and food run are worked without a trainer
    if (shift.key === 'rev4') return  // Don't auto-assign optional 4th reverse

    if (shift.key === 'cert') {
      // Do NOT auto-assign — leave blank for manager to pick
      return
    }

    const dateStr = item.when
    const doubleBookedMap = getDoubleBookedTrainers(dateStr, traineeId, allTrainingData)
    const { available, unavailable } = getSortedTrainersForShift(trainers, dateStr, usedTrainerMap, shift.key, doubleBookedMap)

    let pick = null
    if (shift.key === 'rev3' && followTrainerEmpNum) {
      const followTrainerInAvailable = available.find((t) => t.empNum === followTrainerEmpNum)
      if (followTrainerInAvailable) pick = followTrainerInAvailable
    }
    if (!pick) {
      pick = available.find((t) => {
        const isUsed = usedTrainerMap[t.empNum]?.length > 0
        const isAllowedRepeat = shift.key === 'rev3' && usedTrainerMap[t.empNum]?.includes('follow')
        return !isUsed || isAllowedRepeat
      }) || available[0] || unavailable.find((t) => !doubleBookedMap[t.empNum] && !(usedTrainerMap[t.empNum]?.length > 0)) || unavailable.find((t) => !doubleBookedMap[t.empNum]) || null
    }

    if (pick) {
      newSchedule[shift.key] = { ...item, trainer: pick.empNum }
      if (!usedTrainerMap[pick.empNum]) usedTrainerMap[pick.empNum] = []
      usedTrainerMap[pick.empNum].push(shift.key)
      if (shift.key === 'follow') followTrainerEmpNum = pick.empNum
    }
  })
  return newSchedule
}

/** Shift keys in plan order, with the optional host shift dropped when it isn't being used. */
function planShiftKeys(includeHost) {
  return SHIFT_TYPES.map((s) => s.key).filter((k) => includeHost || k !== HOST_SHIFT_KEY)
}

/**
 * Lay the plan out one shift per day starting from `startDateStr` (day 1).
 * With the host shift it is an 8-day plan; without it the remaining shifts pull
 * back a day each and it collapses to the original 7 days.
 */
function assignDatesFromStart(schedule, startDateStr, includeHost) {
  const [y, m, d] = startDateStr.split('-').map(Number)
  if (!y || !m || !d) return schedule
  const out = { ...schedule }
  planShiftKeys(includeHost).forEach((key, dayOffset) => {
    const date = new Date(y, m - 1, d + dayOffset)
    const datePart =
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0')
    const timePart = SHIFT_DEFAULT_TIMES[key]
    const when = timePart ? datePart + 'T' + timePart + ':00' : datePart
    out[key] = { ...(out[key] || {}), when }
  })
  if (!includeHost) out[HOST_SHIFT_KEY] = { ...(out[HOST_SHIFT_KEY] || {}), when: '' }
  return out
}

function formatDayLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const ScheduleEditor = forwardRef(function ScheduleEditor(
  { traineeId, schedule = {}, trainers = [], managers = [], allTrainingData = {}, traineeHsSchedule = [], onSave, onSaveAndCloseRequest },
  ref
) {
  const [localSchedule, setLocalSchedule] = useState(() => {
    const s = {}
    SHIFT_TYPES.forEach((shift) => {
      s[shift.key] = schedule[shift.key] || { when: '', trainer: '' }
    })
    return s
  })
  const [openDropdownKey, setOpenDropdownKey] = useState(null)
  const [trainerSearch, setTrainerSearch] = useState('')
  const [toastMessage, setToastMessage] = useState(null)
  const [warningPending, setWarningPending] = useState(null)
  const dropdownRef = useRef(null)

  const hasTrainersWithSchedules = useMemo(() => trainers.some((t) => t.schedule && t.schedule.length > 0), [trainers])

  const traineeShiftsByDate = useMemo(() => {
    const map = {}
    if (Array.isArray(traineeHsSchedule)) {
      traineeHsSchedule.forEach(shift => {
        const d = (shift.inDate || shift.date || shift.startTime || '').split('T')[0]
        if (d) map[d] = shift
      })
    }
    return map
  }, [traineeHsSchedule])

  const usedTrainerMap = useMemo(() => {
    const map = {}
    SHIFT_TYPES.forEach((shift) => {
      const item = localSchedule[shift.key]
      if (item?.trainer) {
        if (!map[item.trainer]) map[item.trainer] = []
        map[item.trainer].push(shift.key)
      }
    })
    return map
  }, [localSchedule])

  function setShift(key, field, value) {
    setLocalSchedule((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value },
    }))
    if (field === 'trainer') {
      setOpenDropdownKey(null)
      setTrainerSearch('')
    }
  }

  function applyTrainerSelection(shiftKey, trainerEmpNum) {
    setWarningPending(null)
    setShift(shiftKey, 'trainer', trainerEmpNum)
  }

  function handleSelectTrainer(shiftKey, trainer, isDoubleBooked, repeatInfo) {
    if (isDoubleBooked) {
      setWarningPending({
        type: 'doubleBook',
        shiftKey,
        trainer,
        traineeName: trainer.bookingConflict?.traineeName,
        shiftLabel: trainer.bookingConflict?.shiftLabel,
        onConfirm: () => applyTrainerSelection(shiftKey, trainer.empNum),
        onCancel: () => setWarningPending(null),
      })
      return
    }
    if (repeatInfo?.isRepeat && !repeatInfo?.isAllowedRepeat) {
      setWarningPending({
        type: 'repeat',
        shiftKey,
        trainer,
        existingShiftLabel: repeatInfo.existingShiftLabel,
        onConfirm: () => applyTrainerSelection(shiftKey, trainer.empNum),
        onCancel: () => setWarningPending(null),
      })
      return
    }
    applyTrainerSelection(shiftKey, trainer.empNum)
  }

  function setStartDate(dateStr) {
    if (!dateStr) return
    const withDates = assignDatesFromStart(localSchedule, dateStr, true)
    const withTrainers = autoAssignTrainers(withDates, trainers, managers, traineeId, allTrainingData)
    setLocalSchedule(withTrainers)
    const manualNeeded = []
    if (!withTrainers.foodrun?.trainer) manualNeeded.push('Food Run')
    if (!withTrainers.cert?.trainer) manualNeeded.push('Cert')
    const manualNote = manualNeeded.length > 0 ? ` · Manually assign: ${manualNeeded.join(', ')}` : ''
    setToastMessage(`✅ Dates set and trainers auto-assigned${manualNote}`)
    setTimeout(() => setToastMessage(null), 5000)
  }

  function handleAutoAssign() {
    const newSchedule = autoAssignTrainers(localSchedule, trainers, managers, traineeId, allTrainingData)
    setLocalSchedule(newSchedule)
    const followTrainer = trainers.find((t) => t.empNum === newSchedule.follow?.trainer)
    const followName = followTrainer?.name || 'Follow trainer'
    // Build a clear message about what's still unassigned
    const manualNeeded = []
    if (!newSchedule.foodrun?.trainer) manualNeeded.push('Food Run')
    if (!newSchedule.cert?.trainer) manualNeeded.push('Cert')
    const manualNote = manualNeeded.length > 0 ? ` · Manually assign: ${manualNeeded.join(', ')}` : ''
    setToastMessage(`✅ Trainers auto-assigned — ${followName} gets Follow + 3rd Reverse${manualNote}`)
    setTimeout(() => setToastMessage(null), 5000)
  }

  function handleSave() {
    onSave?.(traineeId, localSchedule)
  }

  useImperativeHandle(ref, () => ({
    saveAndClose() {
      onSave?.(traineeId, localSchedule)
      onSaveAndCloseRequest?.()
    },
  }), [traineeId, localSchedule, onSave, onSaveAndCloseRequest])

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpenDropdownKey(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hostScheduled = !!localSchedule[HOST_SHIFT_KEY]?.when
  const planDayCount = planShiftKeys(hostScheduled).length
  const firstWhen = SHIFT_TYPES.map((s) => localSchedule[s.key]?.when).find(Boolean)
  const weekStart = firstWhen ? new Date(firstWhen.split('T')[0]) : new Date()
  const weekDates = Array.from({ length: planDayCount }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
  const todayStr = new Date().toISOString().split('T')[0]

  const assignedCount = SHIFT_TYPES.filter((s) => shiftNeedsTrainer(s.key) && localSchedule[s.key]?.trainer).length
  const totalNeedingTrainer = SHIFT_TYPES.filter((s) => shiftNeedsTrainer(s.key) && s.key !== 'cert').length
  const certCount = localSchedule.cert?.trainer ? 1 : 0
  const trainerSlots = totalNeedingTrainer + certCount
  const assignedTrainers = [...new Set(SHIFT_TYPES.map((s) => localSchedule[s.key]?.trainer).filter(Boolean))]
  const avgRating =
    assignedTrainers.length > 0
      ? (
          assignedTrainers.reduce((sum, empNum) => {
            const t = trainers.find((x) => x.empNum === empNum) || managers.find((x) => x.empNum === empNum)
            return sum + (parseFloat(t?.starRating) || 0)
          }, 0) / assignedTrainers.length
        ).toFixed(1)
      : '—'
  const followTrainer = trainers.find((t) => t.empNum === localSchedule.follow?.trainer)
  const notScheduledCount = SHIFT_TYPES.filter((s) => {
    const item = localSchedule[s.key]
    if (!item?.when || !item?.trainer || !shiftNeedsTrainer(s.key)) return false
    const t = s.key === 'cert' ? managers.find((m) => m.empNum === item.trainer) : trainers.find((x) => x.empNum === item.trainer)
    const status = t && s.key !== 'cert' ? isTrainerAvailable(t, item.when) : { available: true }
    return !status.available && !status.noData
  }).length

  const doubleBookCount = (() => {
    let count = 0
    SHIFT_TYPES.forEach((s) => {
      if (!shiftNeedsTrainer(s.key) || !localSchedule[s.key]?.when || !localSchedule[s.key]?.trainer) return
      const doubleBooked = getDoubleBookedTrainers(localSchedule[s.key].when, traineeId, allTrainingData)
      if (doubleBooked[localSchedule[s.key].trainer]) count++
    })
    return count
  })()

  const dateRangeStr =
    firstWhen &&
    (() => {
      const first = new Date(firstWhen)
      const last = new Date(first)
      last.setDate(last.getDate() + planDayCount - 1)
      return (
        first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' – ' +
        last.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      )
    })()

  return (
    <div className="schedule-editor-premium">
      {warningPending && (
        <ScheduleWarning
          title={warningPending.type === 'doubleBook' ? 'Trainer Double-Booked' : 'Repeat Trainer'}
          message={
            warningPending.type === 'doubleBook'
              ? `${warningPending.trainer?.name || 'This trainer'} is already scheduled to train ${warningPending.traineeName || 'another trainee'} on ${warningPending.shiftLabel || 'a shift'} this day. Double-booking means they can't give full attention to either trainee.`
              : `${warningPending.trainer?.name || 'This trainer'} is already assigned to this trainee's ${warningPending.existingShiftLabel || 'another shift'}. Using the same trainer for multiple shifts limits exposure to different training styles.`
          }
          onConfirm={warningPending.onConfirm}
          onCancel={warningPending.onCancel}
        />
      )}

      {toastMessage && (
        <div
          className="mb-4 rounded-lg px-4 py-2 text-sm text-white shadow-lg animate-[fadeIn_0.3s_ease-out]"
          style={{ backgroundColor: PRIMARY_GREEN }}
        >
          {toastMessage}
        </div>
      )}

      {!hasTrainersWithSchedules && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>⚠️</span>
          <span>Sync trainer schedules from the dashboard for smart availability</span>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-gray-700">Set Start Date</label>
          <input
            type="date"
            className="min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1F4D1C] focus:outline-none focus:ring-2 focus:ring-[#1F4D1C]/20"
            value={firstWhen ? firstWhen.split('T')[0] : ''}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        {firstWhen && hasTrainersWithSchedules && (
          <button
            type="button"
            className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: PRIMARY_GREEN }}
            onClick={handleAutoAssign}
          >
            ⚡ Auto-Assign Trainers
          </button>
        )}
      </div>

      <div className="mb-6 overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-xl border border-gray-200 bg-gray-50/80 p-2">
          {weekDates.map((d) => {
            const dateStr = d.toISOString().split('T')[0]
            const isToday = dateStr === todayStr
            const dots = SHIFT_TYPES.map((s) => {
              const item = localSchedule[s.key]
              const hasDate = item?.when && item.when.startsWith(dateStr)
              const needsTrainer = shiftNeedsTrainer(s.key)
              const hasTrainer = item?.trainer && needsTrainer
              let color = 'bg-gray-300'
              if (hasDate && !needsTrainer) color = 'bg-gray-400'
              else if (hasDate && hasTrainer) color = 'bg-green-500'
              else if (hasDate) color = 'bg-amber-500'
              return <div key={s.key} className={`h-1.5 w-1.5 rounded-full ${color}`} title={SHIFT_META[s.key]?.label} />
            })
            return (
              <div
                key={dateStr}
                className={`flex flex-col items-center rounded-lg px-2 py-1.5 ${isToday ? 'bg-[#1F4D1C]/10 ring-1 ring-[#1F4D1C]/30' : ''}`}
              >
                <span className="text-[10px] font-medium text-gray-500">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span className="text-xs font-bold text-gray-800">{d.getDate()}</span>
                <div className="mt-1 flex gap-0.5">{dots}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-4">
        {SHIFT_TYPES.map((s, idx) => {
          const item = localSchedule[s.key] || {}
          const meta = SHIFT_META[s.key] || {}
          const isCert = s.key === 'cert'
          const isHost = s.key === HOST_SHIFT_KEY
          const needsTrainer = shiftNeedsTrainer(s.key)
          const hasDate = !!item.when
          const hasTrainer = !!item.trainer
          const selectedTrainer = isCert ? managers.find((m) => m.empNum === item.trainer) : trainers.find((t) => t.empNum === item.trainer)
          const availability = selectedTrainer && !isCert ? isTrainerAvailable(selectedTrainer, item.when) : { available: true }
          const doubleBookedForThis = hasDate && hasTrainer && needsTrainer && getDoubleBookedTrainers(item.when, traineeId, allTrainingData)[item.trainer]
          let statusBadge = !hasDate ? '📅 Set date' : !hasTrainer && needsTrainer ? '🔍 Needs trainer' : doubleBookedForThis ? '🚫 Double-booked' : availability.available ? '✅ Confirmed' : availability.noData ? '📋 No schedule data' : '⚠️ Trainer off'
          let borderColor = !hasDate ? 'border-gray-200' : !hasTrainer && needsTrainer ? 'border-red-300' : doubleBookedForThis ? 'border-red-400' : availability.available ? 'border-green-500' : 'border-amber-400'
          const isOptional = s.required === false
          // Day number reflects the plan as laid out — without a host shift, Follow is day 1 again.
          const planIdx = planShiftKeys(hostScheduled).indexOf(s.key)
          const dayNumber = planIdx >= 0 ? planIdx + 1 : idx + 1

          return (
            <div
              key={s.key}
              className={`rounded-xl border-l-4 bg-white p-4 shadow-sm transition-all ${borderColor} ${isOptional ? 'border-dashed' : ''}`}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
                    style={{ backgroundColor: `${PRIMARY_GREEN}20`, color: PRIMARY_GREEN }}
                  >
                    {isCert ? '🎓' : s.key === 'foodrun' ? '🍽️' : dayNumber}
                  </span>
                  <div>
                    <div className="font-bold text-gray-800">
                      {meta.icon} {meta.label || s.label}
                    </div>
                    <div className="text-xs text-gray-500">{isOptional ? 'Optional' : 'Required Session'}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-600">{hasDate ? formatDayLabel(item.when) : '—'}</div>
                  <span className="inline-block rounded px-2 py-0.5 text-xs font-medium text-gray-600 bg-gray-100">{statusBadge}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-4">
                <div className="min-w-[150px]">
                  <label className="mb-1 block text-xs font-medium text-gray-500">Date</label>
                  <input
                    type="date"
                    className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1F4D1C] focus:outline-none"
                    value={(item.when || '').slice(0, 10)}
                    onChange={(e) => {
                      const datePart = e.target.value
                      // The host shift is day 1 of the plan. Adding it pushes the rest out a day;
                      // clearing it pulls them back so the plan collapses to its original 7 days.
                      if (s.key === HOST_SHIFT_KEY) {
                        const hadDate = !!(item.when || '').slice(0, 10)
                        if (!datePart && hadDate) {
                          setLocalSchedule((prev) => assignDatesFromStart(prev, (item.when || '').slice(0, 10), false))
                          setToastMessage('✅ Host shift removed — plan collapsed back to 7 days')
                          setTimeout(() => setToastMessage(null), 5000)
                          return
                        }
                        if (datePart && !hadDate) {
                          setLocalSchedule((prev) => assignDatesFromStart(prev, datePart, true))
                          setToastMessage('✅ Host shift added as day 1 — plan is now 8 days')
                          setTimeout(() => setToastMessage(null), 5000)
                          return
                        }
                      }
                      const timePart = item.when?.includes('T') ? item.when.slice(11, 16) : (SHIFT_DEFAULT_TIMES[s.key] || DEFAULT_TIME)
                      const when = datePart ? (timePart ? datePart + 'T' + timePart + ':00' : datePart) : ''
                      setShift(s.key, 'when', when)
                    }}
                  />
                  {(() => {
                    const dateStr = (item.when || '').slice(0, 10)
                    if (!dateStr) return null
                    const traineeShift = traineeShiftsByDate[dateStr]
                    if (traineeShift) {
                      const start = traineeShift.inDate ? new Date(traineeShift.inDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
                      const end = traineeShift.outDate ? new Date(traineeShift.outDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
                      return <div className="mt-1 text-xs text-green-700 font-medium">✅ Trainee working {start && end ? `${start}–${end}` : 'this day'}</div>
                    }
                    if (Object.keys(traineeShiftsByDate).length > 0) {
                      return <div className="mt-1 text-xs text-amber-600">⚠️ Trainee not on schedule</div>
                    }
                    return null
                  })()}
                </div>
                <div className="min-w-[120px]">
                  <label className="mb-1 block text-xs font-medium text-gray-500">Time</label>
                  <input
                    type="time"
                    className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1F4D1C] focus:outline-none"
                    value={
                      s.key === 'cert'
                        ? (item.when?.includes('T') ? item.when.slice(11, 16) : '')
                        : (item.when?.includes('T') ? item.when.slice(11, 16) : (SHIFT_DEFAULT_TIMES[s.key] || DEFAULT_TIME))
                    }
                    onChange={(e) => {
                      const datePart = (item.when || '').slice(0, 10) || new Date().toISOString().slice(0, 10)
                      const timeVal = e.target.value
                      const when = timeVal ? datePart + 'T' + timeVal.slice(0, 5) + ':00' : datePart
                      setShift(s.key, 'when', when)
                    }}
                  />
                </div>

                {!needsTrainer ? (
                  <div className="flex min-h-[44px] items-center rounded-lg bg-gray-100 px-4 text-sm text-gray-500">
                    {isHost ? 'No Trainer, Checklist, or Test' : 'No Trainer Needed'}
                  </div>
                ) : isCert ? (
                  <div className="min-w-[200px]">
                    <label className="mb-1 block text-xs font-medium text-gray-500">Manager</label>
                    <select
                      className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1F4D1C] focus:outline-none"
                      value={item.trainer || ''}
                      onChange={(e) => setShift(s.key, 'trainer', e.target.value)}
                    >
                      <option value="">— Select Manager —</option>
                      {managers.map((m) => (
                        <option key={m.empNum} value={m.empNum}>{m.name || m.empNum}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="relative min-w-[280px] flex-1" ref={openDropdownKey === s.key ? dropdownRef : null}>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Trainer</label>
                    <button
                      type="button"
                      className="flex min-h-[44px] w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm focus:border-[#1F4D1C] focus:outline-none"
                      onClick={() => setOpenDropdownKey(openDropdownKey === s.key ? null : s.key)}
                    >
                      {selectedTrainer ? (
                        <>
                          <span>
                            {ratingDisplay(selectedTrainer)} {selectedTrainer.name || selectedTrainer.empNum}{' '}
                            {doubleBookedForThis ? (
                              <span className="text-red-600">🚫 Training {doubleBookedForThis.traineeName} ({doubleBookedForThis.shiftLabel})</span>
                            ) : availability.available ? (
                              <span className="text-green-600">✅ Working {availability.timeRange}</span>
                            ) : availability.noData ? (
                              <span className="text-gray-500">📋 No schedule data</span>
                            ) : (
                              <span className="text-amber-600">⚠️ Not scheduled this day</span>
                            )}
                          </span>
                          <span className="text-gray-400">Change ▾</span>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-500">🔍 Select Trainer...</span>
                          <span className="text-gray-400">Auto-pick ▾</span>
                        </>
                      )}
                    </button>

                    {openDropdownKey === s.key && (() => {
                      const doubleBookedMap = getDoubleBookedTrainers(item.when, traineeId, allTrainingData)
                      const { available, doubleBooked, unavailable } = getSortedTrainersForShift(trainers, item.when, usedTrainerMap, s.key, doubleBookedMap)
                      const searchLower = (trainerSearch || '').toLowerCase().trim()
                      const filterT = (list) =>
                        searchLower
                          ? list.filter((t) => (t.name || t.empNum || '').toString().toLowerCase().includes(searchLower))
                          : list
                      const filteredAvailable = filterT(available)
                      const filteredDoubleBooked = filterT(doubleBooked)
                      const filteredUnavailable = filterT(unavailable)
                      const recommended = available.find((t) => !t.isUsed || t.isAllowedRepeat) || available[0]
                      return (
                        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 shadow-xl transition-all">
                          <div className="px-3 pb-2 border-b border-gray-100">
                            <input
                              type="text"
                              placeholder="Search trainer..."
                              value={trainerSearch}
                              onChange={(e) => setTrainerSearch(e.target.value)}
                              className="w-full min-h-[40px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1F4D1C] focus:outline-none focus:ring-2 focus:ring-[#1F4D1C]/20"
                            />
                          </div>
                          {filteredAvailable.length > 0 && (
                            <div className="px-3 py-1">
                              <div className="text-xs font-semibold text-green-700">✅ AVAILABLE — Working this day</div>
                              {filteredAvailable.map((t) => (
                                <button
                                  key={t.empNum}
                                  type="button"
                                  className={`mt-1 flex w-full items-center justify-between rounded-lg border-l-4 border-green-500 bg-white px-3 py-2.5 text-left text-sm hover:bg-green-50 min-h-[44px] ${t.empNum === recommended?.empNum ? 'ring-1 ring-green-400' : ''}`}
                                  onClick={() => handleSelectTrainer(s.key, t, false, checkRepeatTrainer(t.empNum, s.key, localSchedule))}
                                >
                                  <span>
                                    {ratingDisplay(t)} {t.name || t.empNum}{' '}
                                    {t.isUsed && !t.isAllowedRepeat && `🔄 (assigned Day ${t.usedShifts?.length ? SHIFT_TYPES.findIndex((x) => x.key === t.usedShifts[0]) + 1 : '—'})`}
                                    {t.empNum === recommended?.empNum && <span className="ml-1 text-green-600 text-xs">⚡ Recommended</span>}
                                  </span>
                                  <span className="text-xs text-gray-500">{t.timeRange}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {filteredDoubleBooked.length > 0 && (
                            <div className="mt-2 border-t border-gray-100 px-3 py-1">
                              <div className="text-xs font-semibold text-red-700">🚫 BOOKED — Training another trainee this day</div>
                              {filteredDoubleBooked.map((t) => (
                                <button
                                  key={t.empNum}
                                  type="button"
                                  className="mt-1 flex w-full items-center justify-between rounded-lg border-l-4 border-red-400 bg-red-50/50 px-3 py-2.5 text-left text-sm text-gray-500 min-h-[44px]"
                                  onClick={() => handleSelectTrainer(s.key, t, true, null)}
                                >
                                  <span>
                                    {ratingDisplay(t)} {t.name || t.empNum}
                                  </span>
                                  <span className="text-xs">Training &quot;{t.bookingConflict?.traineeName}&quot; ({t.bookingConflict?.shiftLabel}) [BLOCKED]</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {filteredUnavailable.length > 0 && (
                            <div className="mt-2 border-t border-gray-100 px-3 py-1">
                              <div className="text-xs font-semibold text-gray-500">⚪ NOT SCHEDULED — Off this day</div>
                              {filteredUnavailable.map((t) => (
                                <button
                                  key={t.empNum}
                                  type="button"
                                  className="mt-1 flex w-full items-center justify-between rounded-lg border-l-4 border-gray-300 bg-gray-50 px-3 py-2.5 text-left text-sm hover:bg-gray-100 min-h-[44px]"
                                  onClick={() => handleSelectTrainer(s.key, t, false, checkRepeatTrainer(t.empNum, s.key, localSchedule))}
                                >
                                  <span>{ratingDisplay(t)} {t.name || t.empNum}</span>
                                  <span className="text-xs text-gray-400">Not working</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {searchLower && filteredAvailable.length === 0 && filteredDoubleBooked.length === 0 && filteredUnavailable.length === 0 && (
                            <div className="px-3 py-4 text-sm text-gray-500 text-center">No trainers found</div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="mb-4 font-semibold text-gray-800">Training Plan Summary</div>
        <ul className="space-y-1 text-sm text-gray-600">
          {dateRangeStr && <li>📅 {dateRangeStr} ({planDayCount} days)</li>}
          <li>✅ {assignedCount}/{trainerSlots} trainers assigned</li>
          <li>⭐ Avg trainer rating: {avgRating}</li>
          {followTrainer && <li>🔄 {followTrainer.name}: Follow + 3rd Reverse</li>}
          {notScheduledCount > 0 && <li className="text-amber-600">⚠️ {notScheduledCount} trainer(s) not scheduled their day</li>}
          <li className={doubleBookCount > 0 ? 'text-red-600' : ''}>🚫 {doubleBookCount} double-booking conflict(s)</li>
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="min-h-[44px] rounded-xl px-8 py-3 font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: PRIMARY_GREEN }}
            onClick={handleSave}
          >
            💾 Save Schedule
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-in { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  )
})

export default ScheduleEditor
