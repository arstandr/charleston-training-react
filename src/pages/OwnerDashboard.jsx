import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import { useConfirm } from '../contexts/ConfirmContext'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import StatCard from '../components/StatCard'
import { useStaffAccounts } from '../hooks/useStaffAccounts'
import { useTrainingData } from '../hooks/useTrainingData'
import {
  getCertificationProgress,
  getTrainerAssignedShifts,
  getPendingClaimsForStore,
  getShiftsAwaitingManagerSignOff,
  getManagerNeedsYouQueue,
  approveShiftClaim,
  denyShiftClaim,
  signShiftAsManager,
  getTraineeReadinessAggregate,
  formatWhenHuman,
  getInitials,
} from '../utils/helpers'
import ManagerTraineeDetailView from '../components/ManagerTraineeDetailView'
import ManagerAssessSignModal from '../components/ManagerAssessSignModal'
import { getTrainingDriftReport } from '../services/ai'
import { STAFF_LOGINS } from '../constants'
import { SkeletonCard } from '../components/SkeletonCard'

const ROLE_OPTIONS = ['trainer', 'manager', 'admin', 'owner']

export default function OwnerDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser } = useAuth()
  const { stores } = useOrg()
  const confirm = useConfirm()
  const { staffAccounts, saveStaffAccounts } = useStaffAccounts()
  const { trainingData, setTrainingData, saveTrainingData, listTrainees, trainingDataLoading } = useTrainingData()
  const empNum = currentUser?.empNum ?? currentUser?.employeeNumber ?? ''

  const [view, setView] = useState('overview')
  const [ownerStoreFilter, setOwnerStoreFilter] = useState(null)
  const [ownerReadinessFilter, setOwnerReadinessFilter] = useState('')
  const [viewTraineeDetailId, setViewTraineeDetailId] = useState(null)
  const [assessSignRow, setAssessSignRow] = useState(null)

  useEffect(() => {
    const stateView = location.state?.view
    if (stateView && ['overview', 'staff', 'trainees', 'pending'].includes(stateView)) {
      setView(stateView)
    }
  }, [location.state?.view])
  const [addStaffOpen, setAddStaffOpen] = useState(false)
  const [newEmpNum, setNewEmpNum] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('trainer')
  const [newStore, setNewStore] = useState(stores[0] || 'Westfield')
  const [addError, setAddError] = useState('')
  const [driftReport, setDriftReport] = useState(null)
  const [driftLoading, setDriftLoading] = useState(false)
  const [ownerSearch, setOwnerSearch] = useState('')

  // All trainees across all stores
  const allTrainees = useMemo(
    () => listTrainees({ store: null, includeArchived: false }),
    [trainingData]
  )

  // Per-store stats
  const storeStats = useMemo(() => {
    return stores.map((store) => {
      const storeTrainees = allTrainees.filter((t) => (t.store || '') === store)
      let certified = 0
      let totalProgress = 0
      storeTrainees.forEach((t) => {
        const prog = getCertificationProgress(t)
        totalProgress += prog.pct
        if (prog.done === prog.total) certified++
      })
      const avgProgress = storeTrainees.length
        ? Math.round(totalProgress / storeTrainees.length)
        : 0

      const storeStaff = Object.entries({ ...STAFF_LOGINS, ...staffAccounts })
        .filter(([, info]) => info && !info.archived && (info.store === store || info.store === 'All'))
        .map(([empNum, info]) => ({ empNum, ...info }))

      const trainerCount = storeStaff.filter((s) => s.role === 'trainer').length
      const managerCount = storeStaff.filter((s) => s.role === 'manager' || s.role === 'admin' || s.role === 'owner').length
      const pendingClaims = getPendingClaimsForStore(trainingData, store)
      const awaitingSignOff = getShiftsAwaitingManagerSignOff(trainingData, store)

      return {
        store,
        trainees: storeTrainees.length,
        certified,
        avgProgress,
        trainerCount,
        managerCount,
        pendingClaims: pendingClaims.length,
        awaitingSignOff: awaitingSignOff.length,
      }
    })
  }, [stores, allTrainees, staffAccounts, trainingData])

  // All staff (merged constants + Firestore)
  const allStaff = useMemo(() => {
    const merged = {}
    for (const [empNum, info] of Object.entries(STAFF_LOGINS)) {
      merged[empNum] = { empNum, ...info }
    }
    for (const [empNum, info] of Object.entries(staffAccounts)) {
      if (info && typeof info === 'object') {
        merged[empNum] = { ...(merged[empNum] || {}), empNum, ...info }
      }
    }
    return Object.values(merged)
      .filter((s) => !s.archived)
      .sort((a, b) => (a.store || '').localeCompare(b.store || '') || (a.name || '').localeCompare(b.name || ''))
  }, [staffAccounts])

  // Global aggregate
  const totals = useMemo(() => {
    const t = storeStats.reduce(
      (acc, s) => ({
        trainees: acc.trainees + s.trainees,
        certified: acc.certified + s.certified,
        pendingClaims: acc.pendingClaims + s.pendingClaims,
        awaitingSignOff: acc.awaitingSignOff + s.awaitingSignOff,
      }),
      { trainees: 0, certified: 0, pendingClaims: 0, awaitingSignOff: 0 }
    )
    return t
  }, [storeStats])

  // Pending queue (all stores or filtered by ownerStoreFilter)
  const needsYouQueue = useMemo(() => {
    const q = getManagerNeedsYouQueue(trainingData, ownerStoreFilter || null)
    const searchQ = (ownerSearch || '').toLowerCase().trim()
    if (!searchQ) return q
    return q.filter(
      (item) =>
        (item.traineeName || '').toLowerCase().includes(searchQ) ||
        String(item.traineeEmp || item.traineeId || '').toLowerCase().includes(searchQ)
    )
  }, [trainingData, ownerStoreFilter, ownerSearch])

  // Trainees list filtered by store, search, readiness (for trainees view)
  const filteredTraineesForView = useMemo(() => {
    let list = ownerStoreFilter ? allTrainees.filter((t) => (t.store || '') === ownerStoreFilter) : allTrainees
    const searchQ = (ownerSearch || '').toLowerCase().trim()
    if (searchQ) {
      list = list.filter(
        (t) =>
          (t.name || '').toLowerCase().includes(searchQ) ||
          String(t.employeeNumber || t.id || '').toLowerCase().includes(searchQ)
      )
    }
    if (!ownerReadinessFilter) return list
    if (ownerReadinessFilter === '5') {
      return list.filter((t) => {
        const prog = getCertificationProgress(t)
        return prog.done === prog.total
      })
    }
    return list.filter((t) => {
      const readiness = getTraineeReadinessAggregate(trainingData, t.id)
      const avg = readiness.average
      if (ownerReadinessFilter === '<3') return avg != null && avg < 3
      if (ownerReadinessFilter === '3-4') return avg != null && avg >= 3 && avg < 5
      return true
    })
  }, [allTrainees, ownerStoreFilter, ownerSearch, ownerReadinessFilter, trainingData])

  const staffAccountsForModal = useMemo(
    () => ({ ...STAFF_LOGINS, ...staffAccounts }),
    [staffAccounts]
  )

  function handleAddStaff(e) {
    e.preventDefault()
    setAddError('')
    const emp = newEmpNum.trim()
    if (!emp || !/^\d{3,10}$/.test(emp)) {
      setAddError('Employee number must be 3-10 digits.')
      return
    }
    if (!newName.trim()) {
      setAddError('Name is required.')
      return
    }
    const next = { ...staffAccounts }
    next[emp] = {
      ...(next[emp] || {}),
      name: newName.trim(),
      role: newRole,
      store: newStore,
      archived: false,
    }
    saveStaffAccounts(next)
    setNewEmpNum('')
    setNewName('')
    setNewRole('trainer')
    setAddStaffOpen(false)
  }

  function handleChangeRole(empNum, newRole) {
    const next = { ...staffAccounts }
    next[empNum] = { ...(next[empNum] || {}), role: newRole }
    saveStaffAccounts(next)
  }

  function handleChangeStore(empNum, newStore) {
    const next = { ...staffAccounts }
    next[empNum] = { ...(next[empNum] || {}), store: newStore }
    saveStaffAccounts(next)
  }

  function handleArchiveStaff(empNum) {
    const next = { ...staffAccounts }
    next[empNum] = { ...(next[empNum] || {}), archived: true }
    saveStaffAccounts(next)
  }

  function handleApproveClaim(traineeId, shiftKey) {
    const next = approveShiftClaim(trainingData, traineeId, shiftKey)
    setTrainingData(next)
    saveTrainingData(next)
  }

  function handleDenyClaim(traineeId, shiftKey) {
    const next = denyShiftClaim(trainingData, traineeId, shiftKey)
    setTrainingData(next)
    saveTrainingData(next)
  }

  function handleOwnerManagerSignOff(traineeId, shiftKey, payload = null) {
    if (!empNum) return
    const readiness = payload?.readiness ?? null
    const managerScore = payload?.managerScore ?? null
    const next = signShiftAsManager(trainingData, traineeId, shiftKey, empNum, readiness, managerScore)
    setTrainingData(next)
    saveTrainingData(next)
    setAssessSignRow(null)
  }

  return (
    <>
      <AppHeader />
      <div className="container mx-auto max-w-5xl px-4 pb-8">
        <div className="content-area">
          <h2 className="text-xl font-bold text-gray-800 mb-1">Owner Dashboard</h2>
          <p className="text-sm text-gray-600 mb-6">All locations</p>

          <OwnerNavBar />

          {/* Toolbar: store, readiness, search */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Store:</span>
              <select
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                value={ownerStoreFilter ?? ''}
                onChange={(e) => setOwnerStoreFilter(e.target.value === '' ? null : e.target.value)}
              >
                <option value="">All</option>
                {stores.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Readiness:</span>
              <select
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                value={ownerReadinessFilter}
                onChange={(e) => setOwnerReadinessFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="<3">Needs work (&lt;3)</option>
                <option value="3-4">Good (3–4)</option>
                <option value="5">Ready (5)</option>
              </select>
            </label>
            <input
              type="search"
              placeholder="Search by name or #"
              className="rounded border border-gray-300 px-3 py-2 text-sm max-w-xs"
              value={ownerSearch}
              onChange={(e) => setOwnerSearch(e.target.value)}
            />
          </div>

          {/* ===== OVERVIEW ===== */}
          {view === 'overview' && (
            <>
              {/* Global stats (clickable) */}
              <div className="dash-stat-grid mb-8">
                <StatCard
                  count={totals.trainees}
                  label="TRAINEES"
                  borderClass="border-blue"
                  onClick={() => setView('trainees')}
                />
                <StatCard
                  count={totals.certified}
                  label="CERTIFIED"
                  borderClass="border-green"
                  onClick={() => { setView('trainees'); setOwnerReadinessFilter('5') }}
                />
                <StatCard
                  count={allStaff.length}
                  label="STAFF"
                  borderClass="border-orange"
                  onClick={() => setView('staff')}
                />
                <StatCard
                  count={totals.pendingClaims + totals.awaitingSignOff}
                  label="NEEDS ACTION"
                  borderClass="border-red"
                  onClick={() => setView('pending')}
                />
              </div>

              {/* Per-store cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {storeStats.map((s) => (
                  <div
                    key={s.store}
                    className="rounded-2xl border-2 border-[var(--color-primary)] bg-gradient-to-br from-green-50 to-white p-5 shadow-sm"
                  >
                    <h3 className="text-lg font-bold text-gray-800 mb-3">{s.store}</h3>
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
                    {/* Action items */}
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
                ))}
              </div>

              {/* Training drift report (AI) */}
              <section className="mt-8 rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 text-lg font-bold text-gray-800">Training drift report</h3>
                <p className="mb-3 text-sm text-gray-600">AI summary comparing stores. Requires Gemini API key in Settings.</p>
                {driftReport && (
                  <div className="mb-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-800 whitespace-pre-wrap">{driftReport}</div>
                )}
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={driftLoading || storeStats.length === 0}
                  onClick={async () => {
                    setDriftLoading(true)
                    setDriftReport(null)
                    try {
                      const report = await getTrainingDriftReport(storeStats)
                      setDriftReport(report)
                    } catch (e) {
                      setDriftReport('Report unavailable. Check that the Gemini API key is set in Settings.')
                    } finally {
                      setDriftLoading(false)
                    }
                  }}
                >
                  {driftLoading ? 'Generating…' : 'Generate report'}
                </button>
              </section>
            </>
          )}

          {/* ===== STAFF ===== */}
          {view === 'staff' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">All Staff ({allStaff.length})</h3>
                <button type="button" className="btn btn-small" onClick={() => setAddStaffOpen(!addStaffOpen)}>
                  {addStaffOpen ? 'Cancel' : 'Add staff member'}
                </button>
              </div>

              {addStaffOpen && (
                <form onSubmit={handleAddStaff} className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Employee #</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newEmpNum}
                        onChange={(e) => setNewEmpNum(e.target.value)}
                        placeholder="e.g. 5555"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Full name"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Store</label>
                      <select
                        value={newStore}
                        onChange={(e) => setNewStore(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {stores.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        <option value="All">All locations</option>
                      </select>
                    </div>
                  </div>
                  {addError && <p className="text-red-600 text-sm mb-2">{addError}</p>}
                  <button type="submit" className="btn btn-small">Save</button>
                </form>
              )}

              {/* Staff table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Emp #</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Store</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allStaff.map((s) => (
                      <tr key={s.empNum} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
                              {getInitials(s.name)}
                            </div>
                            {s.name || 'Unnamed'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{s.empNum}</td>
                        <td className="px-4 py-3">
                          <select
                            value={s.role || 'trainer'}
                            onChange={(e) => handleChangeRole(s.empNum, e.target.value)}
                            className="rounded border border-gray-200 px-2 py-1 text-xs"
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={s.store || stores[0]}
                            onChange={(e) => handleChangeStore(s.empNum, e.target.value)}
                            className="rounded border border-gray-200 px-2 py-1 text-xs"
                          >
                            {stores.map((st) => (
                              <option key={st} value={st}>{st}</option>
                            ))}
                            <option value="All">All</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:text-red-800"
                            onClick={() => confirm('Archive this staff member? They can be restored from Archived employees.', 'Archive staff').then((ok) => ok && handleArchiveStaff(s.empNum))}
                          >
                            Archive
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ===== PENDING ===== */}
          {view === 'pending' && (
            <>
              <h3 className="mb-3 border-l-4 border-l-orange-500 pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                Pending approvals ({needsYouQueue.length})
              </h3>
              {needsYouQueue.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-10 text-center text-gray-600">
                  You're all caught up! No pending actions.
                </div>
              ) : (
                <ul className="space-y-2">
                  {needsYouQueue.map((item) => {
                    const isClaim = item.type === 'claim'
                    return (
                      <li
                        key={`${item.type}-${item.traineeId}-${item.shiftKey}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-[var(--color-primary)]"
                      >
                        <div>
                          <div className="font-bold text-gray-800">{item.traineeName}</div>
                          <div className="text-sm text-gray-600">
                            {item.icon ? <span className="mr-1">{item.icon}</span> : null}
                            {item.shiftLabel} · {isClaim ? 'Trainer claim' : 'Sign-off needed'} · {formatWhenHuman(item.when)}
                          </div>
                          {isClaim && item.pendingTrainer && (
                            <div className="mt-0.5 text-xs text-gray-500">
                              Claimed by: {staffAccountsForModal[item.pendingTrainer]?.name || `#${item.pendingTrainer}`}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {isClaim ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-small btn-secondary"
                                onClick={() => handleDenyClaim(item.traineeId, item.shiftKey)}
                              >
                                Deny
                              </button>
                              <button
                                type="button"
                                className="btn btn-small"
                                onClick={() => handleApproveClaim(item.traineeId, item.shiftKey)}
                              >
                                Approve
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-small"
                              onClick={() => setAssessSignRow(item)}
                            >
                              Assess &amp; sign
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-small btn-secondary"
                            onClick={() => setViewTraineeDetailId(item.traineeId)}
                          >
                            View
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          {/* ===== ALL TRAINEES ===== */}
          {view === 'trainees' && (
            <>
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                All Trainees ({filteredTraineesForView.length})
              </h3>
              {trainingDataLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              ) : ownerStoreFilter ? (
                <div className="space-y-2">
                  {filteredTraineesForView.map((t) => {
                    const prog = getCertificationProgress(t)
                    return (
                      <div
                        key={t.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                            {getInitials(t.name)}
                          </div>
                          <div>
                            <div className="font-bold text-gray-800">{t.name || t.id}</div>
                            <div className="text-xs text-gray-500">#{t.employeeNumber || '—'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-semibold text-gray-800">
                              {prog.done}/{prog.total}
                            </div>
                            <div className="text-xs text-gray-500">shifts done</div>
                          </div>
                          <div className="w-24">
                            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${prog.pct}%`,
                                  backgroundColor: prog.pct === 100 ? '#2e7d32' : 'var(--color-primary)',
                                }}
                              />
                            </div>
                            <div className="mt-0.5 text-right text-xs text-gray-500">{prog.pct}%</div>
                          </div>
                          {prog.done === prog.total && (
                            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
                              Certified
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                stores.map((store) => {
                  const storeTrainees = filteredTraineesForView.filter((t) => (t.store || '') === store)
                  if (storeTrainees.length === 0) return null
                  return (
                    <section key={store} className="mb-8">
                      <h4 className="mb-3 border-l-4 border-l-[var(--color-primary)] pl-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                        {store} ({storeTrainees.length})
                      </h4>
                      <div className="space-y-2">
                        {storeTrainees.map((t) => {
                          const prog = getCertificationProgress(t)
                          return (
                            <div
                              key={t.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                                  {getInitials(t.name)}
                                </div>
                                <div>
                                  <div className="font-bold text-gray-800">{t.name || t.id}</div>
                                  <div className="text-xs text-gray-500">#{t.employeeNumber || '—'}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className="text-sm font-semibold text-gray-800">
                                    {prog.done}/{prog.total}
                                  </div>
                                  <div className="text-xs text-gray-500">shifts done</div>
                                </div>
                                <div className="w-24">
                                  <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${prog.pct}%`,
                                        backgroundColor: prog.pct === 100 ? '#2e7d32' : 'var(--color-primary)',
                                      }}
                                    />
                                  </div>
                                  <div className="mt-0.5 text-right text-xs text-gray-500">{prog.pct}%</div>
                                </div>
                                {prog.done === prog.total && (
                                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
                                    Certified
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )
                })
              )}
              {!trainingDataLoading && filteredTraineesForView.length === 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
                  <p className="text-gray-600 mb-2">No trainees found.</p>
                  <p className="text-sm text-gray-500">Trainees are added by managers from the Manager dashboard or by syncing from Toast.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ManagerAssessSignModal
        open={!!assessSignRow}
        row={assessSignRow}
        onSign={(payload) => assessSignRow && handleOwnerManagerSignOff(assessSignRow.traineeId, assessSignRow.shiftKey, payload)}
        onClose={() => setAssessSignRow(null)}
      />

      {viewTraineeDetailId && (
        <ManagerTraineeDetailView
          traineeId={viewTraineeDetailId}
          trainee={trainingData[viewTraineeDetailId] ? { id: viewTraineeDetailId, ...trainingData[viewTraineeDetailId] } : null}
          trainingData={trainingData}
          staffAccounts={staffAccountsForModal}
          onClose={() => setViewTraineeDetailId(null)}
        />
      )}
    </>
  )
}
