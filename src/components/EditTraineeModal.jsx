import { useState, useEffect } from 'react'
import { validateEmployeeNumber } from '../utils/helpers'

export default function EditTraineeModal({ open, trainee, stores = [], onSave, onClose }) {
  const [name, setName] = useState('')
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [store, setStore] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (trainee) {
      setName(trainee.name || '')
      setEmployeeNumber(String(trainee.employeeNumber ?? ''))
      setStore(trainee.store || (stores[0] || 'Westfield'))
    }
  }, [trainee, stores])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    const emp = employeeNumber.trim()
    if (!emp) {
      setError('Employee number is required.')
      return
    }
    if (!validateEmployeeNumber(emp)) {
      setError('Employee number must be 3–10 digits (numbers only).')
      return
    }
    const newId = onSave(trainee?.id, { name: name.trim(), employeeNumber: emp, store: store || stores[0] || 'Westfield' })
    if (newId != null) {
      onClose()
    } else {
      setError('Another trainee already has that employee number at that store.')
    }
  }

  if (!open || !trainee) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800">Edit trainee</h2>
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="mb-4">
            <label htmlFor="editTraineeName" className="mb-1 block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              id="editTraineeName"
              type="text"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sara Johnson"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="editTraineeEmp" className="mb-1 block text-sm font-medium text-gray-700">
              Employee number *
            </label>
            <input
              id="editTraineeEmp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              placeholder="e.g. 5555"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="editTraineeStore" className="mb-1 block text-sm font-medium text-gray-700">
              Store
            </label>
            <select
              id="editTraineeStore"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={store}
              onChange={(e) => setStore(e.target.value)}
            >
              {(stores.length ? stores : ['Westfield', 'Castleton']).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
