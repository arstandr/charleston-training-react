import { getStoreDisplayName } from '../../constants'

export default function ManagerTeamSchedulesView({ allSchedulesData, allSchedulesLoading, allSchedulesError, onRefresh }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-bold text-gray-800">Team Schedules</h3>
        <button
          type="button"
          className="btn btn-small"
          disabled={allSchedulesLoading}
          onClick={onRefresh}
        >
          {allSchedulesLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {allSchedulesError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-red-800 text-sm">
          {allSchedulesError}
        </div>
      )}
      {allSchedulesData && (
        <>
          {['Westfield', 'Castleton'].map((storeName) => {
            const people = allSchedulesData.schedules?.[storeName] || []
            return (
              <section key={storeName} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <h4 className="border-b border-gray-200 bg-gray-50 px-4 py-2 font-bold text-gray-800">
                  {getStoreDisplayName(storeName)} ({people.length} with schedules)
                </h4>
                {people.length === 0 ? (
                  <p className="px-4 py-3 text-gray-500 text-sm">No schedules synced yet. Use Sync dropdown → Sync Schedules.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {people.map((person) => {
                      const shifts = Array.isArray(person.schedule) ? person.schedule : Object.values(person.schedule || {})
                      const sorted = [...shifts].sort((a, b) => (a.date || a.inTime || '').localeCompare(b.date || b.inTime || ''))
                      return (
                        <div key={person.id || person.employeeNumber} className="px-4 py-3">
                          <div className="font-semibold text-gray-800">
                            {person.name || 'Unknown'}
                            {person.employeeNumber && <span className="ml-1 text-gray-500 font-normal">#{person.employeeNumber}</span>}
                            {person.role && <span className="ml-2 text-xs text-gray-500">({person.role})</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {sorted.slice(0, 14).map((shift, i) => {
                              const date = shift.date || '—'
                              const inTime = shift.inTime ? (typeof shift.inTime === 'string' && shift.inTime.includes('T') ? new Date(shift.inTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : shift.inTime) : '?'
                              const outTime = shift.outTime ? (typeof shift.outTime === 'string' && shift.outTime.includes('T') ? new Date(shift.outTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : shift.outTime) : '?'
                              const job = shift.jobName || ''
                              return (
                                <span key={i} className="text-xs bg-gray-100 rounded px-2 py-0.5">
                                  {date} {inTime}–{outTime}{job ? ` · ${job}` : ''}
                                </span>
                              )
                            })}
                            {sorted.length > 14 && <span className="text-xs text-gray-500">+{sorted.length - 14} more</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
          {allSchedulesData.unmatched?.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
              <h4 className="border-b border-amber-200 px-4 py-2 font-bold text-amber-900">
                Unmatched ({allSchedulesData.unmatched.length})
              </h4>
              <p className="px-4 py-2 text-sm text-amber-800">These Toast employees have shifts but could not be matched to trainees/users.</p>
              <ul className="px-4 pb-3 list-disc list-inside text-sm text-amber-800">
                {allSchedulesData.unmatched.map((u) => (
                  <li key={u.toastGuid}>
                    {u.toastGuid?.substring(0, 8)}… ({getStoreDisplayName(u.store)}) — {u.shiftCount} shifts
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
