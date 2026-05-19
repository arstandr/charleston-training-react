import AppHeader from '../components/AppHeader'
import { useAuth } from '../contexts/AuthContext'
import ProfilePhotoUpload from '../components/ProfilePhotoUpload'
import { Link } from 'react-router-dom'

export default function ProfilePage() {
  const { currentUser } = useAuth()

  if (!currentUser) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-md px-4 py-8 text-center text-gray-600">
          Sign in to manage your profile.
        </div>
      </>
    )
  }

  return (
    <>
      <AppHeader />
      <div className="container mx-auto max-w-md px-4 py-8">
        <nav className="mb-6">
          <Link to="/dashboard" className="text-[var(--color-primary)] hover:underline">
            ← Dashboard
          </Link>
        </nav>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Profile</h1>
        <ProfilePhotoUpload />
      </div>
    </>
  )
}
