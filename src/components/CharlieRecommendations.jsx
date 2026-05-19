/**
 * CharlieRecommendations — Smart dashboard nudge cards powered by Charlie intelligence.
 * Replaces WeaknessPracticePanel with personalized, data-driven study recommendations.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { getMyProgress, getMyStudyHistory, getStudyRecommendation } from '../services/charlieTools'

const PRIMARY = '#4a7c59'

function ArrowIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

export default function CharlieRecommendations({ userId }) {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const [nudges, setNudges] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false

    async function load() {
      try {
        const [progressResult, historyResult, recResult] = await Promise.allSettled([
          getMyProgress({ userId }),
          getMyStudyHistory({ userId, maxResults: 5 }),
          getStudyRecommendation({ userId }),
        ])

        if (cancelled) return

        const progress = progressResult.status === 'fulfilled' ? progressResult.value : null
        const history = historyResult.status === 'fulfilled' ? historyResult.value : null
        const recs = recResult.status === 'fulfilled' ? recResult.value : null

        const cards = []

        // 1. Struggling topic — where struggling > mastered
        if (progress?.topicBreakdown?.length) {
          const struggling = progress.topicBreakdown.find(t => t.struggling > t.mastered && t.struggling > 0)
          if (struggling) {
            // Find setId from topic name — topicBreakdown uses display names
            const setId = findSetIdFromTopic(struggling.topic, recs)
            cards.push({
              type: 'struggling',
              title: `Struggling with ${struggling.topic}`,
              subtitle: `${struggling.struggling} cards need practice — focus here`,
              action: () => navigate(setId ? `/flashcards?set=${encodeURIComponent(setId)}&focus=1` : '/flashcards'),
              actionLabel: 'Study Now',
            })
          }
        }

        // 2. Stale topic — not studied recently
        if (history?.recentActivity?.length && progress?.topicBreakdown?.length) {
          const recentCategories = new Set(
            history.recentActivity
              .filter(a => a.date)
              .map(a => (a.category || '').toLowerCase())
          )
          const now = Date.now()
          const staleTopic = progress.topicBreakdown.find(t => {
            const topicLower = (t.topic || '').toLowerCase()
            // Check if there's recent activity for this topic
            const activity = history.recentActivity.find(a =>
              (a.category || '').toLowerCase() === topicLower
            )
            if (!activity?.date) return !recentCategories.has(topicLower) && t.totalCards > 0
            const daysSince = Math.floor((now - new Date(activity.date).getTime()) / (1000 * 60 * 60 * 24))
            return daysSince >= 3 && t.totalCards > 0
          })
          if (staleTopic && !cards.some(c => c.title.includes(staleTopic.topic))) {
            const daysSinceActivity = getDaysSince(staleTopic.topic, history)
            const setId = findSetIdFromTopic(staleTopic.topic, recs)
            cards.push({
              type: 'stale',
              title: `Haven't studied ${staleTopic.topic}`,
              subtitle: daysSinceActivity ? `${daysSinceActivity} days since your last session` : 'Time for a refresher',
              action: () => navigate(setId ? `/flashcards?set=${encodeURIComponent(setId)}` : '/flashcards'),
              actionLabel: 'Study Now',
            })
          }
        }

        // 3. Due for review — Leitner cards (skip if all cards are unseen = new trainee)
        const actuallyReviewed = (recs?.totalDueCards || 0) - (recs?.unseenCards || 0)
        if (actuallyReviewed > 0) {
          cards.push({
            type: 'due',
            title: `${actuallyReviewed} cards due for review`,
            subtitle: 'Spaced repetition keeps knowledge fresh',
            action: () => navigate('/flashcards'),
            actionLabel: 'Review Now',
          })
        } else if (cards.length === 0 && recs?.totalCards > 0) {
          // New trainee with no progress and no other nudges — encourage getting started
          cards.push({
            type: 'start',
            title: `${recs.totalCards} flashcards ready to study`,
            subtitle: 'Jump in and start learning!',
            action: () => navigate('/flashcards'),
            actionLabel: 'Get Started',
          })
        }

        setNudges(cards.slice(0, 3))
      } catch {
        if (!cancelled) setNudges(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [userId, navigate])

  if (loading) {
    return (
      <section className="mb-6 rounded-xl p-4" style={glassCard(isDark)}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: PRIMARY }}>Charlie's Recommendations</span>
        </div>
        <div className="flex items-center gap-2 py-3">
          <div className="w-4 h-4 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: PRIMARY }} />
          <span className="text-xs text-gray-500 dark:text-gray-400">Analyzing your progress...</span>
        </div>
      </section>
    )
  }

  if (!nudges || nudges.length === 0) return null

  return (
    <section className="mb-6 space-y-2">
      <div className="flex items-center gap-2 mb-1 px-1">
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: `${PRIMARY}18` }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l2.09 6.26L20.18 10l-6.09 1.74L12 18l-2.09-6.26L3.82 10l6.09-1.74z" />
          </svg>
        </div>
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: PRIMARY }}>
          Charlie's Recommendations
        </span>
      </div>
      {nudges.map((nudge, i) => (
        <div
          key={nudge.type + i}
          className="rounded-xl p-3.5 flex items-center justify-between gap-3 transition-all hover:scale-[1.005]"
          style={glassCard(isDark)}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{nudge.title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{nudge.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={nudge.action}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: PRIMARY }}
          >
            {nudge.actionLabel}
            <ArrowIcon size={12} />
          </button>
        </div>
      ))}
    </section>
  )
}

// --- Helpers ---

function glassCard(isDark) {
  return {
    background: isDark ? 'rgba(74,124,89,0.08)' : 'rgba(74,124,89,0.04)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: isDark ? '0.5px solid rgba(74,124,89,0.15)' : '0.5px solid rgba(74,124,89,0.12)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }
}

function findSetIdFromTopic(topicName, recs) {
  if (!recs?.recommendations?.length) return null
  const match = recs.recommendations.find(r =>
    (r.topic || '').toLowerCase() === (topicName || '').toLowerCase()
  )
  // The topic field in recommendations is the display name; we need the setId.
  // Since recommendations come from bySet keyed by setId, and mapped to display names,
  // we can't easily reverse. Return null to fall back to /flashcards.
  return null
}

function getDaysSince(topicName, history) {
  if (!history?.recentActivity?.length) return null
  const topicLower = (topicName || '').toLowerCase()
  const activity = history.recentActivity.find(a =>
    (a.category || '').toLowerCase() === topicLower
  )
  if (!activity?.date) return null
  try {
    return Math.floor((Date.now() - new Date(activity.date).getTime()) / (1000 * 60 * 60 * 24))
  } catch {
    return null
  }
}
