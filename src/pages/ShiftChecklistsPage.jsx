import AppHeader from '../components/AppHeader'
import TraineeNavTabs from '../components/TraineeNavTabs'
import { useAuth } from '../contexts/AuthContext'
import ShiftChecklistComponent from '../components/ShiftChecklistComponent'
import { Link } from 'react-router-dom'

export default function ShiftChecklistsPage() {
  const { currentUser } = useAuth()
  const traineeId = currentUser?.traineeId || currentUser?.id

  return (
    <>
      <AppHeader />
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm p-2">
          {currentUser?.role === 'trainee' && <TraineeNavTabs />}
          <nav className="mb-4 px-4 pt-4">
            <Link to="/trainee" className="text-[var(--color-primary)] hover:underline">
              ← Dashboard
            </Link>
          </nav>
          {traineeId ? (
            <ShiftChecklistComponent traineeId={traineeId} />
          ) : (
            <div className="p-6 text-center text-gray-600">
              Sign in as a trainee to use shift checklists.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
