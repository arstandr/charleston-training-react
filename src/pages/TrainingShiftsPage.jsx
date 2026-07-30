import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getShiftsForUser } from '../services/trainingShiftsService'
import { SHIFT_TYPES } from '../data/shiftChecklistTemplates'
import AppHeader from '../components/AppHeader'

export default function TrainingShiftsPage() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const userId = currentUser?.uid || currentUser?.id
  const role = (currentUser?.role || '').toLowerCase()
  const isTrainer = role === 'trainer' || role.includes('manager') || role === 'admin' || role === 'owner'

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    loadShifts()
  }, [userId, isTrainer])

  async function loadShifts() {
    try {
      setLoading(true)
      const list = await getShiftsForUser(userId, isTrainer)
      setShifts(list)
    } catch (error) {
      console.error('Error loading shifts:', error)
      setLoadError('Failed to load shifts. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">Loading shifts…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      <main className="max-w-4xl mx-auto p-6">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Training Shifts</h2>

        {loadError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{loadError}</div>
        )}
        {shifts.length === 0 && !loadError ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No shifts scheduled yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {shifts.map((shift) => {
              const shiftInfo = SHIFT_TYPES[shift.shiftType]
              const scheduledDate = shift.scheduledDate?.toDate?.()
                ?? (shift.scheduledDate ? new Date(shift.scheduledDate) : null)

              return (
                <button
                  key={shift.id}
                  type="button"
                  onClick={() => navigate(`/shift/${shift.id}`)}
                  className="w-full text-left bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-1"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-4xl">{shiftInfo?.icon}</div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                          {shiftInfo?.label}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-300">
                          {scheduledDate
                            ? scheduledDate.toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                              })
                            : 'No date'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        shift.status === 'completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                          : shift.status === 'in-progress'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
                      }`}
                    >
                      {shift.status === 'completed'
                        ? 'Completed'
                        : shift.status === 'in-progress'
                          ? 'In Progress'
                          : 'Scheduled'}
                    </span>
                  </div>
                  {shift.feedback?.strengths && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        <span className="font-semibold">Strengths:</span>{' '}
                        {shift.feedback.strengths.substring(0, 100)}
                        {shift.feedback.strengths.length > 100 ? '…' : ''}
                      </p>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
