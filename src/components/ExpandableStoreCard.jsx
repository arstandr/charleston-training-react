import { useState, useMemo } from 'react'
import { getStoreDisplayName, STAFF_LOGINS, SHIFT_TYPES, getRequiredShiftKeys } from '../constants'
import ArchivedEmployees from './ArchivedEmployees'
import {
  getCertificationProgress,
  getTraineeReadinessAggregate,
  getNextShift,
  isShiftComplete,
  getTrainerAssignedShifts,
  getTrainerRatingBreakdown,
  getInitials,
} from '../utils/helpers'

const ROLE_OPTIONS = ['trainer', 'manager', 'admin']

export default function ExpandableStoreCard({ store, storeStats, trainingData, staffAccounts, stores, onArchiveManager, onChangeManagerRole, onChangeManagerStore, archivedTrainees, archivedStaff, onRestoreTrainee, onRestoreStaff }) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('trainees')
  const [archivedOpen, setArchivedOpen] = useState(false)

  const mergedStaff = useMemo(
    () => ({ ...STAFF_LOGINS, ...staffAccounts }),
    [staffAccounts]
  )

  // Trainees at this store
  const storeTrainees = useMemo(() => {
    return Object.entries(trainingData || {})
      .filter(([, rec]) => rec && !rec.archived && (rec.store || '') === store)
      .map(([id, rec]) => ({ id, ...rec }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [trainingData, store])

  // Trainers at this store
  const storeTrainers = useMemo(() => {
    return Object.entries(mergedStaff)
      .filter(([, info]) => info && !info.archived && info.role === 'trainer' && (info.store === store || info.store === 'All'))
      .map(([empNum, info]) => ({ empNum, ...info }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [mergedStaff, store])

  // Managers/admins/owners at this store
  const storeManagers = useMemo(() => {
    return Object.entries(mergedStaff)
      .filter(([, info]) => {
        if (!info || info.archived) return false
        const r = info.role || ''
        return (r === 'manager' || r === 'admin' || r === 'owner') && (info.store === store || info.store === 'All')
      })
      .map(([empNum, info]) => ({ empNum, ...info }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [mergedStaff, store])

  const s = storeStats
  const tabs = [
    { id: 'trainees', label: `Trainees (${storeTrainees.length})` },
    { id: 'trainers', label: `Trainers (${storeTrainers.length})` },
    { id: 'managers', label: `Managers (${storeManagers.length})` },
  ]

  return (
    <div className="rounded-2xl border-2 border-[var(--color-primary)] bg-gradient-to-br from-green-50 to-white shadow-sm overflow-hidden">
      {/* Header - clickable */}
      <button
        type="button"
        className="w-full text-left p-5 flex items-start justify-between gap-4 hover:bg-green-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-800 mb-3">{getStoreDisplayName(store)}</h3>
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <div className="text-2xl font-bold text-gray-800">{s.trainees}</div>
              <div className="text-gray-500 text-xs">Trainees</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-700">{s.certified}</div>
              <div className="text-gray-500 text-xs">Certified</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-800">{s.trainerCount}</div>
              <div className="text-gray-500 text-xs">Trainers</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-800">{s.managerCount}</div>
              <div className="text-gray-500 text-xs">Managers</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mb-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Avg certification progress</span>
              <span>{s.avgProgress}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${s.avgProgress}%` }}
              />
            </div>
          </div>
          {/* Action badges */}
          {(s.pendingClaims > 0 || s.awaitingSignOff > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {s.pendingClaims > 0 && (
                <span className="inline-block rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-medium">
                  {s.pendingClaims} pending claim{s.pendingClaims !== 1 ? 's' : ''}
                </span>
              )}
              {s.awaitingSignOff > 0 && (
                <span className="inline-block rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 text-xs font-medium">
                  {s.awaitingSignOff} awaiting sign-off
                </span>
              )}
            </div>
          )}
        </div>
        {/* Chevron */}
        <svg
          className={`w-5 h-5 text-gray-400 mt-1 flex-shrink-0 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded area */}
      {expanded && (
        <div className="animate-slideDown border-t border-green-200">
          {/* Tab bar */}
          <div className="flex gap-1 px-5 pt-3 pb-0 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-[var(--color-primary)] border border-b-0 border-gray-200 -mb-px relative z-10'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content panels */}
          <div className="bg-white border-t border-gray-200 p-5 min-h-[120px]">
            {activeTab === 'trainees' && (
              <TraineePanel trainees={storeTrainees} trainingData={trainingData} mergedStaff={mergedStaff} />
            )}
            {activeTab === 'trainers' && (
              <TrainerPanel trainers={storeTrainers} trainingData={trainingData} store={store} />
            )}
            {activeTab === 'managers' && (
              <>
                <ManagerPanel managers={storeManagers} trainingData={trainingData} onArchive={onArchiveManager} onChangeRole={onChangeManagerRole} onChangeStore={onChangeManagerStore} stores={stores} />
                {(archivedTrainees?.length > 0 || archivedStaff?.length > 0) && (
                  <button
                    type="button"
                    className="mt-4 btn btn-small btn-secondary"
                    onClick={() => setArchivedOpen(true)}
                  >
                    Archived ({(archivedTrainees?.length || 0) + (archivedStaff?.length || 0)})
                  </button>
                )}
                <ArchivedEmployees
                  open={archivedOpen}
                  onClose={() => setArchivedOpen(false)}
                  archivedTrainees={archivedTrainees || []}
                  archivedStaff={archivedStaff || []}
                  trainingData={trainingData}
                  onRestoreTrainee={(id) => { onRestoreTrainee?.(id); setArchivedOpen(false) }}
                  onRestoreStaff={(emp) => { onRestoreStaff?.(emp); setArchivedOpen(false) }}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ====== Trainee Panel ====== */
function TraineePanel({ trainees, trainingData, mergedStaff }) {
  if (trainees.length === 0) {
    return <p className="text-gray-500 text-sm">No trainees at this location.</p>
  }

  return (
    <div className="space-y-3">
      {trainees.map((t) => {
        const prog = getCertificationProgress(t)
        const readiness = getTraineeReadinessAggregate(trainingData, t.id)
        const nextShift = getNextShift(t, mergedStaff)
        const testResults = t.testResults || []
        const avgScore = testResults.length
          ? Math.round(testResults.reduce((sum, r) => sum + (r.score || 0), 0) / testResults.length)
          : null

        // Determine training day based on first incomplete shift
        const shiftOrder = ['follow', 'rev1', 'rev2', 'rev3', 'foodrun', 'cert']
        let trainingDay = prog.done + 1
        if (trainingDay > prog.total) trainingDay = prog.total

        return (
          <div key={t.id} className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white flex-shrink-0">
                  {getInitials(t.name)}
                </div>
                <div>
                  <div className="font-bold text-gray-800">{t.name || t.id}</div>
                  <div className="text-xs text-gray-500">#{t.employeeNumber || '---'}</div>
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="text-gray-600">Day {trainingDay}</div>
                {readiness.average != null && (
                  <div className={`text-xs font-medium ${readiness.average >= 4 ? 'text-green-700' : readiness.average >= 3 ? 'text-amber-700' : 'text-red-700'}`}>
                    Readiness: {readiness.average}/5
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar — one segment per required shift (7 when a host shift is scheduled) */}
            <div className="flex gap-1 mb-2">
              {getRequiredShiftKeys(t).map((key) => {
                const done = isShiftComplete(t, key)
                return (
                  <div
                    key={key}
                    className={`h-2 flex-1 rounded-full ${done ? 'bg-green-500' : 'bg-gray-200'}`}
                    title={`${key}: ${done ? 'Complete' : 'Incomplete'}`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>{prog.done}/{prog.total} shifts complete</span>
              <span>{prog.pct}%</span>
            </div>

            {/* Extra details row */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-600">
              {avgScore != null && (
                <span>Avg test score: <span className="font-semibold">{avgScore}%</span></span>
              )}
              {nextShift && (
                <span>Next: <span className="font-semibold">{nextShift.label}</span></span>
              )}
              {prog.done === prog.total && (
                <span className="rounded-full bg-green-100 text-green-800 px-2 py-0.5 font-bold">Certified</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ====== Trainer Panel ====== */
function TrainerPanel({ trainers, trainingData, store }) {
  if (trainers.length === 0) {
    return <p className="text-gray-500 text-sm">No trainers at this location.</p>
  }

  return (
    <div className="space-y-3">
      {trainers.map((trainer) => {
        const breakdown = getTrainerRatingBreakdown(trainingData, trainer.empNum)
        const assigned = getTrainerAssignedShifts(trainingData, trainer.empNum, store)
        const completedShifts = assigned.filter((s) => s.trainerSigned && s.managerSigned).length
        const uniqueTrainees = [...new Set(assigned.map((s) => s.traineeId))]
        const traineeNames = [...new Set(assigned.map((s) => s.traineeName))]

        return (
          <div key={trainer.empNum} className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-bold text-white flex-shrink-0">
                  {getInitials(trainer.name)}
                </div>
                <div>
                  <div className="font-bold text-gray-800">{trainer.name || `#${trainer.empNum}`}</div>
                  <div className="text-xs text-gray-500">#{trainer.empNum}</div>
                </div>
              </div>
              <div className="text-right">
                {breakdown.overallAvg > 0 ? (
                  <div className="text-sm font-semibold text-amber-600">
                    {'★'.repeat(Math.round(breakdown.overallAvg))} {breakdown.overallAvg.toFixed(1)}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">No ratings</div>
                )}
                <div className="text-xs text-gray-500">{breakdown.count} rating{breakdown.count !== 1 ? 's' : ''}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-gray-600">
              <span>Shifts completed: <span className="font-semibold">{completedShifts}</span></span>
              <span>Trainees trained: <span className="font-semibold">{uniqueTrainees.length}</span></span>
            </div>

            {traineeNames.length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                Trainees: {traineeNames.join(', ')}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ====== Manager Panel ====== */
function ManagerPanel({ managers, trainingData, onArchive, onChangeRole, onChangeStore, stores }) {
  if (managers.length === 0) {
    return <p className="text-gray-500 text-sm">No managers at this location.</p>
  }

  return (
    <div className="space-y-3">
      {managers.map((mgr) => {
        // Count sign-offs by this manager
        let signOffCount = 0
        for (const rec of Object.values(trainingData || {})) {
          if (!rec || rec.archived) continue
          const schedule = rec.schedule || {}
          for (const item of Object.values(schedule)) {
            if (item?.managerSignedBy === mgr.empNum) signOffCount++
          }
        }

        return (
          <div key={mgr.empNum} className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-600 text-sm font-bold text-white flex-shrink-0">
                  {getInitials(mgr.name)}
                </div>
                <div>
                  <div className="font-bold text-gray-800">{mgr.name || `#${mgr.empNum}`}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {onChangeRole ? (
                      <select
                        value={mgr.role || 'manager'}
                        onChange={(e) => onChangeRole(mgr.empNum, e.target.value)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        mgr.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                        mgr.role === 'admin' ? 'bg-green-100 text-green-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {mgr.role}
                      </span>
                    )}
                    {onChangeStore && stores ? (
                      <select
                        value={mgr.store || stores[0]}
                        onChange={(e) => onChangeStore(mgr.empNum, e.target.value)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs"
                      >
                        {stores.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        <option value="All">All</option>
                      </select>
                    ) : null}
                    <span className="text-xs text-gray-500">#{mgr.empNum}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm text-gray-600">
                  <div className="font-semibold">{signOffCount}</div>
                  <div className="text-xs text-gray-500">sign-offs</div>
                </div>
                {onArchive && (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:text-red-800"
                    onClick={() => onArchive(mgr.empNum)}
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
