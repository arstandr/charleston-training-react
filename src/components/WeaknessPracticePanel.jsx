import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWeaknessReport } from '../services/weaknessPracticeService'
import { getAllFlashcardSets } from '../services/flashcardService'

/**
 * WeaknessPracticePanel — shows a trainee their weak areas across flashcards,
 * quizzes, and weak spots, with action buttons to practice each.
 */
export default function WeaknessPracticePanel({ userId, quizAttempts }) {
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getAllFlashcardSets()
      .then((sets) => {
        const activeSets = sets.filter((s) => s.status !== 'hidden')
        return getWeaknessReport(userId, activeSets, quizAttempts || [])
      })
      .then((r) => {
        if (!cancelled) setReport(r)
      })
      .catch(() => {
        if (!cancelled) setReport(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId, quizAttempts])

  if (loading) {
    return (
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Focus areas</h3>
        <div className="flex items-center gap-2 py-4">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-[var(--color-primary)] rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Analyzing your weaknesses...</span>
        </div>
      </section>
    )
  }

  if (!report) return null

  const hasAnything = report.flashcardWeakSets.length > 0 || report.quizWeakTopics.length > 0 || report.weakSpotCount > 0
  if (!hasAnything) return null

  return (
    <section className="mb-6 rounded-xl border-2 border-blue-300 bg-blue-50/50 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-blue-800">
        <span>&#127919;</span> Focus areas
      </h3>
      <p className="mb-4 text-sm text-blue-700">
        Based on your flashcard and quiz history, here are your weakest areas. Focus here first.
      </p>

      {/* Flashcard weak areas */}
      {report.flashcardWeakSets.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">Flashcard weak areas</h4>
          <div className="space-y-2">
            {report.flashcardWeakSets.slice(0, 4).map((s) => (
              <div key={s.setId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-white p-3">
                <div>
                  <span className="font-medium text-gray-800">{s.title}</span>
                  <span className="ml-2 text-xs text-gray-500">{s.struggleCount} struggling</span>
                </div>
                <button
                  type="button"
                  className="btn btn-small text-xs"
                  onClick={() => navigate(`/flashcards?set=${encodeURIComponent(s.setId)}&focus=1`)}
                >
                  Practice
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quiz weak topics */}
      {report.quizWeakTopics.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">Quiz weak topics</h4>
          <div className="space-y-2">
            {report.quizWeakTopics.slice(0, 4).map((t) => (
              <div key={t.topic} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-3">
                <div>
                  <span className="font-medium text-gray-800">{t.topic.replace(/_/g, ' ')}</span>
                  <span className="ml-2 text-xs text-gray-500">{t.successRate}% success rate</span>
                </div>
                <button
                  type="button"
                  className="btn btn-small text-xs"
                  onClick={() => navigate(`/quizzes?test=${encodeURIComponent(t.topic)}&mode=practice`)}
                >
                  Practice
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weak spots */}
      {report.weakSpotCount > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-white p-3">
            <div>
              <span className="font-medium text-gray-800">Weak spots for review</span>
              <span className="ml-2 text-xs text-gray-500">{report.weakSpotCount} unmastered</span>
            </div>
            <button
              type="button"
              className="btn btn-small text-xs bg-red-600 border-red-600 text-white hover:bg-red-700 hover:border-red-700"
              onClick={() => navigate('/quizzes?test=verbal_cert&mode=practice')}
            >
              Review weak spots
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
