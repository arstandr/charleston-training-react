import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTestLock } from '../contexts/TestLockContext'

/**
 * Zero-dependency shell: only React. Content loads in a separate chunk via dynamic import.
 */
export default function FlashcardsPage() {
  const { currentUser } = useAuth()
  const { isTestActive, isMySession } = useTestLock()
  const [Content, setContent] = useState(null)
  const [err, setErr] = useState(null)

  const isTrainee = (currentUser?.role || '').toLowerCase() === 'trainee'
  const flashcardsLocked = isTrainee && isTestActive && !isMySession

  useEffect(() => {
    let cancelled = false
    import('./FlashcardsPageContent').then((m) => {
      if (!cancelled) setContent(() => m.default)
    }).catch((e) => {
      if (!cancelled) setErr(e)
    })
    return () => { cancelled = true }
  }, [])

  if (flashcardsLocked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center p-6">
        <div>
          <span className="text-4xl">🔒</span>
          <h2 className="text-lg font-bold text-gray-900 mt-4">Flashcards Locked</h2>
          <p className="text-sm text-gray-500 mt-2">
            Complete your active test before studying flashcards.
          </p>
        </div>
      </div>
    )
  }
  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gray-100">
        <p className="text-red-600">Failed to load flashcards. Refresh the page.</p>
      </div>
    )
  }
  if (!Content) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-4">
        <div className="animate-pulse flex gap-3 items-center w-full max-w-sm">
          <div className="w-12 h-12 rounded-lg bg-gray-200 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-3/4" />
            <div className="h-2 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      </div>
    )
  }
  return <Content />
}
