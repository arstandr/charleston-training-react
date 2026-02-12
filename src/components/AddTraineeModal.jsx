import { useState } from 'react'
import { validateEmployeeNumber } from '../utils/helpers'

export default function AddTraineeModal({ open, store, onAdd, onClose }) {
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    let emp = employeeNumber.trim()
    let traineeName = name.trim()
    if (!emp) {
      setError('Enter an employee number.')
      return
    }
    if (!validateEmployeeNumber(emp)) {
      if (validateEmployeeNumber(traineeName) && /^[A-Za-z\s\-']+$/.test(emp)) {
        emp = traineeName
        traineeName = employeeNumber.trim()
      } else {
        setError('Employee number must be 3–10 digits (numbers only).')
        return
      }
    }
    const id = onAdd(emp, traineeName, store)
    if (id) {
      setEmployeeNumber('')
      setName('')
      onClose()
    } else {
      setError('A trainee with this employee number already exists for this store.')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-800">Add trainee</h2>
        <p className="mt-1 text-sm text-gray-500">{store || 'Westfield'} location</p>
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="mb-4">
            <label htmlFor="addTraineeEmp" className="mb-1 block text-sm font-medium text-gray-700">
              Employee number *
            </label>
            <p className="mb-1 text-xs text-gray-500">Numbers only, 3–10 digits (e.g. 5555)</p>
            <input
              id="addTraineeEmp"
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
            <label htmlFor="addTraineeName" className="mb-1 block text-sm font-medium text-gray-700">
              Name (optional)
            </label>
            <p className="mb-1 text-xs text-gray-500">Trainee&apos;s name (e.g. Sara Johnson)</p>
            <input
              id="addTraineeName"
              type="text"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sara Johnson"
            />
          </div>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn">
              Add trainee
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
