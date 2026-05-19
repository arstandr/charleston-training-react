import { useState } from 'react'
import { useConfirm } from '../../contexts/ConfirmContext'
import { getStoreDisplayName } from '../../constants'
import { formatWhenHuman, isSameCalendarDay } from '../../utils/helpers'
import { deleteTestLock } from '../../services/testLockService'

export default function ManagerOverviewView({
  store, storeStats,
  claimsCount, signOffsCount, actionItemsCount,
  needsYouQueue, testsToReview, unassignedShifts, headsUpAlerts,
  todaysFloor, thisWeekSchedule,
  staffAccounts,
  onApproveClaim, onDenyClaim,
  onSetViewTraineeDetailId, onSetAssessSignRow, onSetScheduleTraineeId,
  onSetResetAttemptsTraineeId, onSetResetAttemptsTestId,
  onReviewTest,
}) {
  const [expandedCard, setExpandedCard] = useState(null)
  const [unlockingId, setUnlockingId] = useState(null)
  const confirm = useConfirm()

  return (
    <>
      {/* Store Pulse */}
      <div className="glass rounded-2xl border-2 border-[var(--color-primary)] shadow-sm overflow-hidden p-5 mb-6">
        <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{getStoreDisplayName(store)}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{storeStats.trainees}</div>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Trainees</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-700">{storeStats.certified}</div>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Certified</div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{storeStats.trainers}</div>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Trainers</div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{storeStats.managers}</div>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Managers</div>
          </div>
        </div>
        <div className="mb-2">
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
            <span>Avg certification progress</span>
            <span>{storeStats.avgProgress}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${storeStats.avgProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stat Cards (5-card grid) — click to expand action items */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { key: 'claims', count: claimsCount, label: 'Pending claims', activeBg: 'bg-orange-50', activeBorder: 'border-orange-400', ring: 'ring-orange-300' },
          { key: 'signoffs', count: signOffsCount, label: 'Sign-offs', activeBg: 'bg-blue-50', activeBorder: 'border-blue-400', ring: 'ring-blue-300' },
          { key: 'tests', count: testsToReview.length, label: 'Failed tests (FYI)', activeBg: 'bg-purple-50', activeBorder: 'border-purple-400', ring: 'ring-purple-300' },
          { key: 'shifts', count: unassignedShifts.length, label: 'Unassigned shifts', activeBg: 'bg-red-50', activeBorder: 'border-red-400', ring: 'ring-red-300' },
          { key: 'headsup', count: headsUpAlerts.length, label: 'Heads up', activeBg: 'bg-red-50', activeBorder: 'border-red-300', ring: 'ring-red-200', spanMobile: true, pulse: true },
        ].map((card) => {
          const isActive = card.count > 0
          const isSelected = expandedCard === card.key
          return (
            <button
              key={card.key}
              type="button"
              className={`text-left rounded-xl border-2 p-5 transition-all ${
                card.spanMobile ? 'col-span-2 sm:col-span-1' : ''
              } ${
                isActive
                  ? `${card.activeBg} ${card.activeBorder} cursor-pointer hover:shadow-md ${isSelected ? `ring-2 ${card.ring} shadow-md` : ''} ${card.pulse ? 'animate-gentle-pulse' : ''}`
                  : 'glass opacity-50 cursor-default'
              }`}
              onClick={() => isActive && setExpandedCard((prev) => (prev === card.key ? null : card.key))}
            >
              <div className="text-2xl font-bold">{card.count}</div>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{card.label}</div>
            </button>
          )
        })}
      </div>

      {/* "View All" toggle */}
      {(actionItemsCount > 0 || headsUpAlerts.length > 0) && (
        <div className="mt-2 mb-4 text-right">
          <button
            type="button"
            className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
              expandedCard === 'all'
                ? 'bg-[var(--text-primary)] text-white'
                : 'hover:bg-[rgba(0,0,0,0.06)]'
            }`}
            style={expandedCard !== 'all' ? { background: 'rgba(0,0,0,0.04)', color: 'var(--text-secondary)' } : {}}
            onClick={() => setExpandedCard((prev) => (prev === 'all' ? null : 'all'))}
          >
            {expandedCard === 'all' ? 'Hide all' : `View all (${actionItemsCount + headsUpAlerts.length})`}
          </button>
        </div>
      )}
      {actionItemsCount === 0 && headsUpAlerts.length === 0 && <div className="mb-6" />}

      {/* Expandable Action Items Panel */}
      {expandedCard && (
        <div className="mb-6 rounded-xl glass p-4 animate-in">
          {/* Claims */}
          {(expandedCard === 'claims' || expandedCard === 'all') && needsYouQueue.filter((q) => q.type === 'claim').length > 0 && (
            <>
              {expandedCard === 'all' && <h4 className="text-xs font-bold uppercase tracking-wide text-orange-600 mb-2">Pending Claims</h4>}
              <ul className="space-y-2">
                {needsYouQueue.filter((q) => q.type === 'claim').map((item) => (
                  <li
                    key={`claim-${item.traineeId}-${item.shiftKey}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl glass p-4 shadow-sm border-l-4 border-l-orange-400"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{item.traineeName}</span>
                        <span className="inline-flex items-center rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">Pending Claim</span>
                      </div>
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {item.icon ? <span className="mr-1">{item.icon}</span> : null}
                        {item.shiftLabel} · Trainer claim · {formatWhenHuman(item.when)}
                      </div>
                      {item.pendingTrainer && (
                        <div className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Claimed by: {staffAccounts[item.pendingTrainer]?.name || `#${item.pendingTrainer}`}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-small bg-red-600 text-white hover:bg-red-700 border-0" onClick={() => onDenyClaim(item.traineeId, item.shiftKey)}>Deny</button>
                      <button type="button" className="btn btn-small bg-green-600 text-white hover:bg-green-700 border-0" onClick={() => onApproveClaim(item.traineeId, item.shiftKey)}>Approve</button>
                      <button type="button" className="btn btn-small btn-secondary" onClick={() => onSetViewTraineeDetailId(item.traineeId)}>View</button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {expandedCard === 'claims' && claimsCount === 0 && (
            <div className="text-center text-gray-500 text-sm py-6">No pending claims.</div>
          )}

          {/* Sign-offs */}
          {(expandedCard === 'signoffs' || expandedCard === 'all') && needsYouQueue.filter((q) => q.type === 'sign').length > 0 && (
            <>
              {expandedCard === 'all' && <h4 className={`text-xs font-bold uppercase tracking-wide text-blue-600 mb-2 ${needsYouQueue.some((q) => q.type === 'claim') ? 'mt-4' : ''}`}>Sign-offs</h4>}
              <ul className="space-y-2">
                {needsYouQueue.filter((q) => q.type === 'sign').map((item) => (
                  <li
                    key={`sign-${item.traineeId}-${item.shiftKey}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl glass p-4 shadow-sm border-l-4 border-l-blue-400"
                  >
                    <div>
                      <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{item.traineeName}</span>
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {item.icon ? <span className="mr-1">{item.icon}</span> : null}
                        {item.shiftLabel} · Sign-off needed · {formatWhenHuman(item.when)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-small" onClick={() => onSetAssessSignRow(item)}>Sign off</button>
                      <button type="button" className="btn btn-small btn-secondary" onClick={() => onSetViewTraineeDetailId(item.traineeId)}>View</button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {expandedCard === 'signoffs' && signOffsCount === 0 && (
            <div className="text-center text-gray-500 text-sm py-6">No sign-offs needed.</div>
          )}

          {/* Tests to review */}
          {(expandedCard === 'tests' || expandedCard === 'all') && testsToReview.length > 0 && (
            <>
              {expandedCard === 'all' && <h4 className={`text-xs font-bold uppercase tracking-wide text-purple-600 mb-2 ${(needsYouQueue.length > 0) ? 'mt-4' : ''}`}>Failed Tests <span className="normal-case font-normal text-gray-400">— FYI, no sign-off required</span></h4>}
              <ul className="space-y-2">
                {testsToReview.map((item) => (
                  <li
                    key={`test-${item.traineeId}-${item.testId}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl glass p-4 shadow-sm border-l-4 border-l-purple-400"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{item.traineeName}</span>
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${item.exhausted ? 'bg-red-100 text-red-800' : item.lastFailed && item.passed ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'}`}>
                          {item.exhausted ? 'Locked out' : item.lastFailed && item.passed ? 'Recent failure' : 'Failed test'}
                        </span>
                      </div>
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {item.testTitle} · {item.count}/{item.maxAttempts} attempts{item.scores.length ? ` · Last: ${item.scores[item.scores.length - 1]}%` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-small btn-secondary" onClick={() => onReviewTest?.(item.traineeId, item.testId)}>Review test</button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {expandedCard === 'tests' && testsToReview.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-6">No tests to review.</div>
          )}

          {/* Unassigned shifts */}
          {(expandedCard === 'shifts' || expandedCard === 'all') && unassignedShifts.length > 0 && (
            <>
              {expandedCard === 'all' && <h4 className={`text-xs font-bold uppercase tracking-wide text-red-600 mb-2 ${(needsYouQueue.length > 0 || testsToReview.length > 0) ? 'mt-4' : ''}`}>Unassigned Shifts</h4>}
              <ul className="space-y-2">
                {unassignedShifts.map((r) => (
                  <li
                    key={`unassigned-${r.traineeId}-${r.shiftKey}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl glass p-4 shadow-sm border-l-4 border-l-red-400"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{r.traineeName}</span>
                        <span className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Unassigned</span>
                      </div>
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {r.icon ? <span className="mr-1">{r.icon}</span> : null}
                        {r.shiftLabel} · {formatWhenHuman(r.when)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-small" onClick={() => onSetScheduleTraineeId(r.traineeId)}>Assign</button>
                      <button type="button" className="btn btn-small btn-secondary" onClick={() => onSetViewTraineeDetailId(r.traineeId)}>View</button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {expandedCard === 'shifts' && unassignedShifts.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-6">No unassigned shifts.</div>
          )}

          {/* Heads Up alerts */}
          {(expandedCard === 'headsup' || expandedCard === 'all') && headsUpAlerts.length > 0 && (
            <>
              {expandedCard === 'all' && <h4 className={`text-xs font-bold uppercase tracking-wide text-red-600 mb-2 ${(needsYouQueue.length > 0 || testsToReview.length > 0 || unassignedShifts.length > 0) ? 'mt-4' : ''}`}>Heads Up</h4>}
              <div className="space-y-2">
                {headsUpAlerts.map((alert, i) => {
                  const colorMap = {
                    red: 'border-l-red-500 bg-red-50',
                    amber: 'border-l-amber-500 bg-amber-50',
                    green: 'border-l-green-500 bg-green-50',
                  }
                  const emojiMap = {
                    stall: '\u26a0\ufe0f',
                    failed: '\ud83d\udea8',
                    lockout: '\ud83d\udd12',
                    near: '\ud83c\udf1f',
                    topTrainer: '\u2b50',
                  }
                  return (
                    <div
                      key={`alert-${i}`}
                      className={`rounded-lg border border-l-4 p-3 text-sm flex items-center justify-between gap-2 ${colorMap[alert.color] || 'bg-gray-50 border-l-gray-400'}`}
                    >
                      <div>
                        <span className="mr-1">{emojiMap[alert.type] || ''}</span>
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{alert.name}</span>
                        <span className="ml-1" style={{ color: 'var(--text-secondary)' }}>— {alert.detail}</span>
                        {alert.traineeId && (
                          <button
                            type="button"
                            className="ml-2 text-xs text-blue-600 hover:underline"
                            onClick={() => onSetViewTraineeDetailId(alert.traineeId)}
                          >
                            View
                          </button>
                        )}
                      </div>
                      {alert.type === 'lockout' && (
                        <button
                          type="button"
                          disabled={unlockingId === alert.lockId}
                          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 active:scale-[0.97] transition-all disabled:opacity-50"
                          onClick={async () => {
                            const yes = await confirm({ title: 'Unlock trainee?', message: `Unlock ${alert.name}? They will be able to resume testing.` })
                            if (!yes) return
                            setUnlockingId(alert.lockId)
                            try { await deleteTestLock(alert.lockId) } catch (e) { console.error('Unlock failed:', e) }
                            setUnlockingId(null)
                          }}
                        >
                          {unlockingId === alert.lockId ? 'Unlocking…' : 'Unlock'}
                        </button>
                      )}
                      {alert.type === 'failed' && (
                        <button
                          type="button"
                          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.97] transition-all"
                          onClick={() => { onSetResetAttemptsTraineeId(alert.traineeId); onSetResetAttemptsTestId(alert.testId || 'all') }}
                        >
                          Grant Retest
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {expandedCard === 'headsup' && headsUpAlerts.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-6">No alerts right now.</div>
          )}

          {/* "All" mode with nothing */}
          {expandedCard === 'all' && actionItemsCount === 0 && headsUpAlerts.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-6">You're all caught up! No pending actions.</div>
          )}
        </div>
      )}

      {/* Section 3: Today's Floor */}
      {todaysFloor.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-3 border-l-4 border-l-green-500 pl-3 text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
            Today's Floor ({todaysFloor.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {todaysFloor.map((r) => {
              const time = new Date(r.when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              const signed = !r.unsigned && !r.missingTrainer
              return (
                <button
                  key={`floor-${r.traineeId}-${r.shiftKey}`}
                  type="button"
                  className="flex items-center gap-3 rounded-xl glass p-3 shadow-sm text-left hover:border-[var(--color-primary)] transition-colors"
                  onClick={() => onSetViewTraineeDetailId(r.traineeId)}
                >
                  <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${signed ? 'bg-green-500' : r.missingTrainer ? 'bg-red-400' : 'bg-amber-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{r.traineeName}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {r.icon && <span className="mr-1">{r.icon}</span>}{r.shiftLabel} · {time}
                      {r.trainerName ? ` · ${r.trainerName}` : ''}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* This Week's Schedule — card rows */}
      <section className="mb-8">
        <h3 className="mb-3 border-l-4 border-l-blue-500 pl-3 text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          This Week's Schedule
        </h3>
        {thisWeekSchedule.length === 0 ? (
          <div className="rounded-xl px-6 py-10 text-center" style={{ background: 'rgba(255,255,255,0.3)', border: '0.5px solid var(--hairline)', color: 'var(--text-secondary)' }}>
            No shifts scheduled this week.
          </div>
        ) : (
          (() => {
            const grouped = {}
            thisWeekSchedule.forEach((r) => {
              const d = new Date(r.when)
              const key = d.toISOString().slice(0, 10)
              if (!grouped[key]) grouped[key] = { date: d, rows: [] }
              grouped[key].rows.push(r)
            })
            const days = Object.keys(grouped).sort()
            const today = new Date()
            return (
              <div className="space-y-4">
                {days.map((dayKey) => {
                  const { date, rows } = grouped[dayKey]
                  const isToday = isSameCalendarDay(date, today)
                  const dayLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                  return (
                    <div key={dayKey}>
                      <h4 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        {isToday ? `Today \u2014 ${dayLabel}` : dayLabel}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {rows.map((r) => {
                          const time = new Date(r.when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                          const signed = !r.unsigned && !r.missingTrainer
                          const borderColor = signed ? 'border-l-green-500' : r.missingTrainer ? 'border-l-red-400' : 'border-l-amber-400'
                          return (
                            <button
                              key={`${r.traineeId}-${r.shiftKey}`}
                              type="button"
                              className={`flex items-center gap-2 rounded-lg glass px-3 py-2 text-left text-sm shadow-sm border-l-4 ${borderColor} hover:border-[var(--color-primary)] transition-colors`}
                              onClick={() => onSetViewTraineeDetailId(r.traineeId)}
                            >
                              {r.icon && <span>{r.icon}</span>}
                              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{r.shiftLabel}</span>
                              <span style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{r.traineeName}</span>
                              <span style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
                              <span style={{ color: 'var(--text-tertiary)' }}>{time}</span>
                              {r.trainerName && (
                                <>
                                  <span style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
                                  <span style={{ color: 'var(--text-tertiary)' }}>{r.trainerName}</span>
                                </>
                              )}
                              <span className={`inline-block h-2 w-2 rounded-full ml-1 ${signed ? 'bg-green-500' : r.missingTrainer ? 'bg-red-400' : 'bg-amber-400'}`} />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()
        )}
      </section>
    </>
  )
}
