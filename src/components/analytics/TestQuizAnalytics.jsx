import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line } from 'recharts'
import ChartCard from './ChartCard'
import { CHART_COLORS, STATUS_COLORS } from './chartConstants'
import { computeContentEffectiveness } from '../../services/analyticsService'

export default function TestQuizAnalytics({ quizAttempts, trainingData, storeFilter }) {
  // Problem questions (highest fail rate)
  const problemQuestions = useMemo(() => {
    const byQ = {}
    ;(quizAttempts || []).forEach((a) => {
      const qid = a.questionId || a.quizId || ''
      if (!qid) return
      if (!byQ[qid]) byQ[qid] = { id: qid, correct: 0, total: 0 }
      byQ[qid].total++
      if (a.correct) byQ[qid].correct++
    })
    return Object.values(byQ)
      .filter((q) => q.total >= 3)
      .map((q) => ({
        ...q,
        failRate: Math.round(((q.total - q.correct) / q.total) * 100),
        name: q.id.length > 30 ? q.id.slice(0, 27) + '...' : q.id,
      }))
      .sort((a, b) => b.failRate - a.failRate)
      .slice(0, 15)
  }, [quizAttempts])

  // Avg scores by store
  const scoresByStore = useMemo(() => {
    // Map userId to store from trainingData
    const storeByUser = {}
    for (const [traineeId, rec] of Object.entries(trainingData || {})) {
      if (rec?.store) storeByUser[traineeId] = rec.store
    }

    const byStore = {}
    ;(quizAttempts || []).forEach((a) => {
      const userId = a.userId || ''
      const store = storeByUser[userId] || 'Unknown'
      if (storeFilter && store !== storeFilter) return
      if (!byStore[store]) byStore[store] = { store, totalScore: 0, count: 0, fails: 0 }
      const score = typeof a.score === 'number' ? a.score : (a.correct ? 100 : 0)
      byStore[store].totalScore += score
      byStore[store].count++
      if (!a.correct && !a.passed) byStore[store].fails++
    })

    return Object.values(byStore).map((s) => ({
      ...s,
      avgScore: s.count > 0 ? Math.round(s.totalScore / s.count) : 0,
      failRate: s.count > 0 ? Math.round((s.fails / s.count) * 100) : 0,
    }))
  }, [quizAttempts, trainingData, storeFilter])

  // First attempt vs retry pass rate
  const attemptPassRate = useMemo(() => {
    const bySession = {}
    ;(quizAttempts || []).forEach((a) => {
      const sid = a.quizSessionId || a.sessionId || ''
      if (!sid) return
      if (!bySession[sid]) bySession[sid] = []
      bySession[sid].push(a)
    })

    let firstPass = 0, firstTotal = 0, retryPass = 0, retryTotal = 0
    for (const attempts of Object.values(bySession)) {
      attempts.sort((a, b) => {
        const ta = a.timestamp?.toMillis?.() ?? new Date(a.timestamp || 0).getTime()
        const tb = b.timestamp?.toMillis?.() ?? new Date(b.timestamp || 0).getTime()
        return ta - tb
      })
      attempts.forEach((a, i) => {
        if (i === 0) {
          firstTotal++
          if (a.passed || a.correct) firstPass++
        } else {
          retryTotal++
          if (a.passed || a.correct) retryPass++
        }
      })
    }

    if (firstTotal === 0 && retryTotal === 0) return []
    return [
      { name: 'First attempt', passRate: firstTotal > 0 ? Math.round((firstPass / firstTotal) * 100) : 0, total: firstTotal },
      { name: 'Retry', passRate: retryTotal > 0 ? Math.round((retryPass / retryTotal) * 100) : 0, total: retryTotal },
    ]
  }, [quizAttempts])

  // Score distribution (histogram)
  const scoreDist = useMemo(() => {
    const buckets = [
      { range: '0-19', min: 0, max: 19, count: 0 },
      { range: '20-39', min: 20, max: 39, count: 0 },
      { range: '40-59', min: 40, max: 59, count: 0 },
      { range: '60-79', min: 60, max: 79, count: 0 },
      { range: '80-89', min: 80, max: 89, count: 0 },
      { range: '90-100', min: 90, max: 100, count: 0 },
    ]

    for (const [, rec] of Object.entries(trainingData || {})) {
      if (!rec || rec.archived) continue
      if (storeFilter && (rec.store || '') !== storeFilter) continue
      const results = rec.testResults || []
      results.forEach((r) => {
        const score = r.score || 0
        const bucket = buckets.find((b) => score >= b.min && score <= b.max)
        if (bucket) bucket.count++
      })
    }

    return buckets
  }, [trainingData, storeFilter])

  // Score trends over time (by month)
  const scoreTrends = useMemo(() => {
    const byMonth = {}
    ;(quizAttempts || []).forEach((a) => {
      const ts = a.timestamp?.toMillis?.() ?? (typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : 0)
      if (!ts) return
      const d = new Date(ts)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = { month: key, totalScore: 0, count: 0 }
      const score = typeof a.score === 'number' ? a.score : (a.correct ? 100 : 0)
      byMonth[key].totalScore += score
      byMonth[key].count++
    })

    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({ ...m, avgScore: m.count > 0 ? Math.round(m.totalScore / m.count) : 0 }))
  }, [quizAttempts])

  // Avg attempts before passing (from trainingData testResults)
  const avgAttempts = useMemo(() => {
    const byTest = {}
    for (const [, rec] of Object.entries(trainingData || {})) {
      if (!rec || rec.archived) continue
      if (storeFilter && (rec.store || '') !== storeFilter) continue
      const results = rec.testResults || []
      // Group by testId
      const seen = {}
      results.forEach((r) => {
        const tid = r.testId || r.id || ''
        if (!tid) return
        if (!seen[tid]) seen[tid] = 0
        seen[tid]++
      })
      for (const [tid, count] of Object.entries(seen)) {
        if (!byTest[tid]) byTest[tid] = { testId: tid, totalAttempts: 0, traineeCount: 0 }
        byTest[tid].totalAttempts += count
        byTest[tid].traineeCount++
      }
    }

    return Object.values(byTest)
      .map((t) => ({
        ...t,
        name: t.testId.length > 25 ? t.testId.slice(0, 22) + '...' : t.testId,
        avgAttempts: Math.round((t.totalAttempts / t.traineeCount) * 10) / 10,
      }))
      .sort((a, b) => b.avgAttempts - a.avgAttempts)
      .slice(0, 10)
  }, [trainingData, storeFilter])

  // Content effectiveness: certified vs non-certified avg scores per topic
  const contentEffectiveness = useMemo(() => {
    return computeContentEffectiveness(trainingData, quizAttempts, storeFilter || null)
      .filter((d) => d.topic.length > 0)
      .slice(0, 10)
      .map((d) => ({
        ...d,
        name: d.topic.length > 20 ? d.topic.slice(0, 17) + '...' : d.topic,
      }))
  }, [trainingData, quizAttempts, storeFilter])

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ChartCard title="Problem questions" subtitle="Highest fail rate (min 3 attempts)">
        {problemQuestions.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(250, problemQuestions.length * 24)}>
            <BarChart data={problemQuestions} layout="vertical" margin={{ left: 120 }}>
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis dataKey="name" type="category" width={115} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="failRate" fill={STATUS_COLORS.fail} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No quiz attempt data</p>
        )}
      </ChartCard>

      <ChartCard title="Scores by store" subtitle="Average score and fail rate">
        {scoresByStore.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={scoresByStore}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="store" />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgScore" name="Avg Score" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="failRate" name="Fail Rate" fill={STATUS_COLORS.fail} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No quiz data</p>
        )}
      </ChartCard>

      <ChartCard title="First attempt vs retry" subtitle="Pass rate comparison">
        {attemptPassRate.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={attemptPassRate}>
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="passRate" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No session data</p>
        )}
      </ChartCard>

      <ChartCard title="Avg attempts before passing" subtitle="Per test type">
        {avgAttempts.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(200, avgAttempts.length * 28)}>
            <BarChart data={avgAttempts} layout="vertical" margin={{ left: 100 }}>
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={95} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="avgAttempts" fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No test result data</p>
        )}
      </ChartCard>

      <ChartCard title="Score distribution" subtitle="Histogram of all test scores" className="md:col-span-2">
        {scoreDist.some((b) => b.count > 0) ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={scoreDist}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip formatter={(v) => `${v} results`} />
              <Bar dataKey="count" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No test scores</p>
        )}
      </ChartCard>

      <ChartCard title="Score trends over time" subtitle="Monthly average quiz scores" className="md:col-span-2">
        {scoreTrends.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={scoreTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip />
              <Line type="monotone" dataKey="avgScore" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No quiz data over time</p>
        )}
      </ChartCard>

      <ChartCard title="Content effectiveness" subtitle="Avg quiz score: certified vs non-certified trainees by topic" className="md:col-span-2">
        {contentEffectiveness.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(250, contentEffectiveness.length * 32)}>
            <BarChart data={contentEffectiveness} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis dataKey="name" type="category" width={95} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Bar dataKey="certifiedAvgScore" name="Certified" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
              <Bar dataKey="nonCertifiedAvgScore" name="Not certified" fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No content effectiveness data (need certified + non-certified trainees with quiz attempts)</p>
        )}
      </ChartCard>
    </div>
  )
}
