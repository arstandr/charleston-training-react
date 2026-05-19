import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ScatterChart, Scatter, CartesianGrid } from 'recharts'
import ChartCard from './ChartCard'
import { CHART_COLORS, GREEN_PALETTE } from './chartConstants'
import { stableCardId } from '../../utils/helpers'

export default function FlashcardAnalytics({ masteryData, sessionData, trainingData, flashcardDatabase, usersMap, storeFilter }) {
  // Build UID→name and UID→store maps from trainingData + usersMap (Firestore users collection)
  const userLookup = useMemo(() => {
    const nameMap = {}
    const storeMap = {}
    // trainingData keys are trainee IDs like T-Westfield-7777
    for (const [traineeId, rec] of Object.entries(trainingData || {})) {
      if (rec?.name) nameMap[traineeId] = rec.name
      if (rec?.store) storeMap[traineeId] = rec.store
    }
    // usersMap keys are Firebase Auth UIDs
    for (const [uid, info] of Object.entries(usersMap || {})) {
      if (info?.name) nameMap[uid] = info.name
      if (info?.store) storeMap[uid] = info.store
    }
    return { nameMap, storeMap }
  }, [trainingData, usersMap])

  // Sessions per trainee
  const sessionsPerTrainee = useMemo(() => {
    const byUser = {}
    ;(sessionData || []).forEach((doc) => {
      const userId = doc.userId || doc.id || 'unknown'
      if (!byUser[userId]) byUser[userId] = { userId, name: userLookup.nameMap[userId] || userId, sessions: 0 }
      byUser[userId].sessions += (doc.sessionCount || doc.count || 1)
    })
    return Object.values(byUser)
      .filter((d) => {
        if (!storeFilter) return true
        const store = userLookup.storeMap[d.userId] || ''
        return store === storeFilter
      })
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 20)
  }, [sessionData, userLookup, storeFilter])

  // Got it vs Needs practice
  const masteryBreakdown = useMemo(() => {
    let mastered = 0
    let struggling = 0
    ;(masteryData || []).forEach((doc) => {
      mastered += (doc.masteredCount || doc.mastered || 0)
      struggling += (doc.struggleCount || doc.struggles || 0)
    })
    if (mastered === 0 && struggling === 0) return []
    return [
      { name: 'Got it', value: mastered },
      { name: 'Needs practice', value: struggling },
    ]
  }, [masteryData])

  // Top missed cards — strip userId prefix from mastery doc IDs and aggregate across users
  const topMissed = useMemo(() => {
    // Build reverse map: stableCardId → { front, deckTitle }
    const cardInfoMap = {}
    if (flashcardDatabase) {
      for (const set of Object.values(flashcardDatabase)) {
        const cards = set?.cards || []
        const setId = set?.id || ''
        const deckTitle = set?.title || setId
        cards.forEach((card) => {
          const id = stableCardId(setId, card)
          cardInfoMap[id] = { front: card.front || id, deckTitle }
        })
      }
    }

    // Aggregate struggles by cardId (stripped of userId prefix)
    const cardMap = {}
    ;(masteryData || []).forEach((doc) => {
      // doc.id is "{userId}_{setId}_{hash}" — strip the userId prefix at the first underscore
      const rawId = doc.id || ''
      const firstUnderscore = rawId.indexOf('_')
      const cardId = firstUnderscore > 0 ? rawId.slice(firstUnderscore + 1) : rawId
      const struggles = doc.struggleCount || doc.struggles || 0
      if (struggles > 0 && cardId) {
        if (!cardMap[cardId]) {
          const info = cardInfoMap[cardId]
          cardMap[cardId] = {
            cardId,
            front: info?.front || cardId,
            deckTitle: info?.deckTitle || '',
            struggles: 0,
          }
        }
        cardMap[cardId].struggles += struggles
      }
    })

    return Object.values(cardMap)
      .sort((a, b) => b.struggles - a.struggles)
      .slice(0, 20)
      .map((d) => {
        const label = d.deckTitle ? `${d.front} (${d.deckTitle})` : d.front
        return { ...d, name: label.length > 55 ? label.slice(0, 52) + '...' : label }
      })
  }, [masteryData, flashcardDatabase])

  // Flashcard-to-test correlation
  const correlation = useMemo(() => {
    const points = []
    // Extract userId from mastery doc IDs (format: {userId}_{cardId})
    const masteryByUser = {}
    ;(masteryData || []).forEach((doc) => {
      const rawId = doc.id || ''
      const firstUnderscore = rawId.indexOf('_')
      const userId = firstUnderscore > 0 ? rawId.slice(0, firstUnderscore) : ''
      if (!userId) return
      if (!masteryByUser[userId]) masteryByUser[userId] = { mastered: 0, total: 0 }
      masteryByUser[userId].total++
      if ((doc.masteredCount || doc.mastered || 0) > 0) masteryByUser[userId].mastered++
    })

    for (const [traineeId, rec] of Object.entries(trainingData || {})) {
      if (!rec || rec.archived) continue
      if (storeFilter && (rec.store || '') !== storeFilter) continue
      const testResults = rec.testResults || []
      if (testResults.length === 0) continue
      const avgScore = Math.round(testResults.reduce((s, r) => s + (r.score || 0), 0) / testResults.length)
      const m = masteryByUser[traineeId]
      if (!m || m.total === 0) continue
      const masteryRate = Math.round((m.mastered / m.total) * 100)
      points.push({ name: rec.name || traineeId, masteryRate, avgScore })
    }
    return points
  }, [masteryData, trainingData, storeFilter])

  const PIE_COLORS = [GREEN_PALETTE[1], '#f57c00']

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ChartCard title="Sessions per trainee" subtitle="Total flashcard study sessions">
        {sessionsPerTrainee.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sessionsPerTrainee} layout="vertical" margin={{ left: 80 }}>
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={75} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="sessions" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No session data</p>
        )}
      </ChartCard>

      <ChartCard title="Got it vs Needs practice" subtitle="Aggregate across all trainees">
        {masteryBreakdown.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={masteryBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => `${e.name}: ${e.value}`}>
                {masteryBreakdown.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No mastery data</p>
        )}
      </ChartCard>

      <ChartCard title="Most missed cards" subtitle="Top 20 by struggle count (with deck name)" className="md:col-span-2">
        {topMissed.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(300, topMissed.length * 28)}>
            <BarChart data={topMissed} layout="vertical" margin={{ left: 220 }}>
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={215} tick={{ fontSize: 10 }} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null
                const d = payload[0].payload
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs">
                    <p className="font-medium text-gray-800 text-sm">{d.front}</p>
                    {d.deckTitle && <p className="text-xs text-gray-500 mt-0.5">{d.deckTitle}</p>}
                    <p className="text-sm mt-1">Struggles: <span className="font-bold">{d.struggles}</span></p>
                  </div>
                )
              }} />
              <Bar dataKey="struggles" fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No struggle data</p>
        )}
      </ChartCard>

      <ChartCard title="Flashcard-to-test correlation" subtitle="Mastery rate vs avg test score per trainee" className="md:col-span-2">
        {correlation.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="masteryRate" name="Mastery %" unit="%" />
              <YAxis dataKey="avgScore" name="Avg Test Score" unit="%" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={correlation} fill={CHART_COLORS[2]} />
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">Insufficient data for correlation</p>
        )}
      </ChartCard>
    </div>
  )
}
