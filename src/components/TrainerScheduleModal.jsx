export default function TrainerScheduleModal({ trainer, onClose }) {
  if (!trainer?.schedule || trainer.schedule.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="max-w-md rounded-xl bg-white p-6 dark:bg-gray-800">
          <h3 className="mb-4 text-xl font-bold">No Schedule</h3>
          <p className="text-gray-600 dark:text-gray-400">
            {trainer?.name || 'This trainer'} has no upcoming shifts scheduled.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg bg-gray-200 px-4 py-2 dark:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  // Sort shifts chronologically and group by date
  const sortedShifts = [...trainer.schedule].sort(
    (a, b) => new Date(a.startTime || a.inDate || a.date) - new Date(b.startTime || b.inDate || b.date),
  )
  const shiftsByDate = {}
  sortedShifts.forEach((shift) => {
    // Prefer startTime/inDate (includes time, parsed as local) over date-only string
    // (date-only strings like "2026-02-23" are parsed as UTC, off by 1 day in negative UTC offsets)
    const dateStr = shift.startTime || shift.inDate || shift.date
    const dateKey = new Date(dateStr).toLocaleDateString()
    if (!shiftsByDate[dateKey]) shiftsByDate[dateKey] = []
    shiftsByDate[dateKey].push(shift)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {trainer.name}'s Schedule
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">Next 14 days</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-3xl text-gray-500 hover:text-gray-700 dark:text-gray-400"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {Object.entries(shiftsByDate).map(([date, shifts]) => (
            <div key={date} className="mb-6">
              <h3 className="mb-3 text-lg font-bold text-gray-900 dark:text-white">{date}</h3>
              <div className="space-y-2">
                {shifts.map((shift, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700"
                  >
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {shift.jobName || 'Shift'}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {shift.startTime
                          ? new Date(shift.startTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                        {' - '}
                        {shift.endTime
                          ? new Date(shift.endTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </p>
                    </div>
                    {shift.startTime && shift.endTime && (
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {(
                          Math.round(
                            (new Date(shift.endTime) - new Date(shift.startTime)) / 1000 / 60 / 60 * 10
                          ) / 10
                        )}
                        h
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 p-6 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-gray-200 px-6 py-3 font-semibold text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
