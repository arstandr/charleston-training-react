import { useState, useMemo } from 'react'
import { getStoreDisplayName } from '../constants'

function getStaffForStore(staffAccounts, store, role) {
  return Object.entries(staffAccounts || {})
    .filter(([, info]) => {
      if (!info || info.archived) return false
      const r = (info.role || '').toLowerCase()
      const s = info.store || ''
      return r === role && s === store
    })
    .map(([empNum, info]) => ({ empNum, name: info.name || empNum, store: info.store }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export default function RoleSelectorModal({ open, staffUser, stores, trainees, staffAccounts, onSelect, onCancel }) {
  const [screen, setScreen] = useState('main')
  const [traineeSearch, setTraineeSearch] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [selectedStore, setSelectedStore] = useState(null)

  const filteredTrainees = useMemo(() => {
    if (!trainees?.length) return []
    const q = traineeSearch.toLowerCase().trim()
    const list = trainees.filter((t) => !t.archived)
    if (!q) return list
    return list.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        String(t.employeeNumber || t.id || '').toLowerCase().includes(q)
    )
  }, [trainees, traineeSearch])

  const staffForStore = useMemo(() => {
    if (!selectedStore) return []
    const role = screen === 'trainerSelect' ? 'trainer' : 'manager'
    return getStaffForStore(staffAccounts, selectedStore, role)
  }, [staffAccounts, selectedStore, screen])

  const filteredStaff = useMemo(() => {
    const q = staffSearch.toLowerCase().trim()
    if (!q) return staffForStore
    return staffForStore.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        String(s.empNum || '').includes(q)
    )
  }, [staffForStore, staffSearch])

  if (!open) return null

  function goBack() {
    if (screen === 'trainerSelect') {
      setScreen('trainer')
      setSelectedStore(null)
      setStaffSearch('')
    } else if (screen === 'managerSelect') {
      setScreen('main')
      setSelectedStore(null)
      setStaffSearch('')
    } else {
      setScreen('main')
      setStaffSearch('')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-[#1F4D1C] to-[#2d6b28] px-6 py-4 text-white">
          <h2 className="text-lg font-bold">Welcome, {staffUser?.name || 'Admin'}</h2>
          <p className="text-sm text-white/80">Choose how you want to view the app</p>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {screen === 'main' && (
            <div className="space-y-3">
              <button
                type="button"
                className="w-full text-left rounded-xl border-2 border-[var(--color-primary)] bg-green-50 p-4 hover:bg-green-100 transition-colors"
                onClick={() => onSelect({ role: 'admin' })}
              >
                <div className="font-bold text-gray-800">Admin Dashboard</div>
                <div className="text-sm text-gray-600">Full owner view across all stores</div>
              </button>

              {stores.map((store) => (
                <button
                  key={`mgr-${store}`}
                  type="button"
                  className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    setSelectedStore(store)
                    setStaffSearch('')
                    setScreen('managerSelect')
                  }}
                >
                  <div className="font-bold text-gray-800">{getStoreDisplayName(store)} Manager</div>
                  <div className="text-sm text-gray-600">Manager view for {getStoreDisplayName(store)}</div>
                </button>
              ))}

              <button
                type="button"
                className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
                onClick={() => setScreen('trainer')}
              >
                <div className="font-bold text-gray-800">Trainer</div>
                <div className="text-sm text-gray-600">View as a trainer at a specific store</div>
              </button>

              <button
                type="button"
                className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
                onClick={() => setScreen('trainee')}
              >
                <div className="font-bold text-gray-800">Trainee</div>
                <div className="text-sm text-gray-600">View the app as a specific trainee</div>
              </button>
            </div>
          )}

          {screen === 'trainer' && (
            <div className="space-y-3">
              <button
                type="button"
                className="text-sm text-[var(--color-primary)] font-medium mb-2"
                onClick={() => setScreen('main')}
              >
                &larr; Back
              </button>
              <h3 className="font-bold text-gray-800">Select a store</h3>
              {stores.map((store) => (
                <button
                  key={`trainer-${store}`}
                  type="button"
                  className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    setSelectedStore(store)
                    setStaffSearch('')
                    setScreen('trainerSelect')
                  }}
                >
                  <div className="font-bold text-gray-800">{getStoreDisplayName(store)} Trainer</div>
                </button>
              ))}
            </div>
          )}

          {screen === 'trainerSelect' && (
            <div className="space-y-3">
              <button
                type="button"
                className="text-sm text-[var(--color-primary)] font-medium mb-2"
                onClick={goBack}
              >
                &larr; Back
              </button>
              <h3 className="font-bold text-gray-800">Select a trainer at {getStoreDisplayName(selectedStore)}</h3>
              <input
                type="search"
                placeholder="Search by name or emp #"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredStaff.length === 0 ? (
                  <div>
                    <p className="text-sm text-gray-500 py-2">No trainers found at this store.</p>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg border border-dashed border-gray-300 px-3 py-2 hover:bg-gray-50 transition-colors text-sm text-gray-600"
                      onClick={() => onSelect({ role: 'trainer', store: selectedStore })}
                    >
                      Continue as generic trainer at {getStoreDisplayName(selectedStore)}
                    </button>
                  </div>
                ) : (
                  filteredStaff.map((s) => (
                    <button
                      key={s.empNum}
                      type="button"
                      className="w-full text-left rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors"
                      onClick={() => onSelect({ role: 'trainer', store: selectedStore, trainerId: s.empNum, name: s.name })}
                    >
                      <span className="font-medium text-gray-800">{s.name}</span>
                      <span className="ml-2 text-xs text-gray-500">#{s.empNum}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {screen === 'managerSelect' && (
            <div className="space-y-3">
              <button
                type="button"
                className="text-sm text-[var(--color-primary)] font-medium mb-2"
                onClick={goBack}
              >
                &larr; Back
              </button>
              <h3 className="font-bold text-gray-800">Select a manager at {getStoreDisplayName(selectedStore)}</h3>
              <input
                type="search"
                placeholder="Search by name or emp #"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredStaff.length === 0 ? (
                  <div>
                    <p className="text-sm text-gray-500 py-2">No managers found at this store.</p>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg border border-dashed border-gray-300 px-3 py-2 hover:bg-gray-50 transition-colors text-sm text-gray-600"
                      onClick={() => onSelect({ role: 'manager', store: selectedStore })}
                    >
                      Continue as generic manager at {getStoreDisplayName(selectedStore)}
                    </button>
                  </div>
                ) : (
                  filteredStaff.map((s) => (
                    <button
                      key={s.empNum}
                      type="button"
                      className="w-full text-left rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors"
                      onClick={() => onSelect({ role: 'manager', store: selectedStore, managerId: s.empNum, name: s.name })}
                    >
                      <span className="font-medium text-gray-800">{s.name}</span>
                      <span className="ml-2 text-xs text-gray-500">#{s.empNum}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {screen === 'trainee' && (
            <div className="space-y-3">
              <button
                type="button"
                className="text-sm text-[var(--color-primary)] font-medium mb-2"
                onClick={() => setScreen('main')}
              >
                &larr; Back
              </button>
              <h3 className="font-bold text-gray-800">Select a trainee</h3>
              <input
                type="search"
                placeholder="Search by name or emp #"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={traineeSearch}
                onChange={(e) => setTraineeSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredTrainees.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">No trainees found.</p>
                ) : (
                  filteredTrainees.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="w-full text-left rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors"
                      onClick={() => onSelect({ role: 'trainee', traineeId: t.id, name: t.name, store: t.store })}
                    >
                      <span className="font-medium text-gray-800">{t.name || t.id}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        #{t.employeeNumber || t.id}
                        {t.store ? ` · ${getStoreDisplayName(t.store)}` : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={onCancel}
          >
            Cancel (go to Admin Dashboard)
          </button>
        </div>
      </div>
    </div>
  )
}
