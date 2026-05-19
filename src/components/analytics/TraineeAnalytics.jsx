import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend, Cell } from 'recharts'
import ChartCard from './ChartCard'
import { CHART_COLORS } from './chartConstants'
import { REQUIRED_SHIFT_KEYS, SHIFT_META } from '../../constants'
import { isShiftComplete } from '../../utils/helpers'
import { computeTimeToCertification, computeDropoutFunnel, computeReadinessVelocity, computeStudyConsistency } from '../../services/analyticsService'

const FUNNEL_COLORS = ['#2e7d32', '#43a047', '#66bb6a', '#f9a825', '#f57c00', '#e65100', '#d32f2f']

export default function TraineeAnalytics({ trainingData, storeFilter, sessionData, quizAttempts }) {
  // Avg time to certification by store
  const timeToCert = useMemo(() => {
    const data = computeTimeToCertification(trainingData)
    const byStore = {}
    data.forEach((d) => {
      if (storeFilter && d.store !== storeFilter) return
      const store = d.store || 'Unknown'
      if (!byStore[store]) byStore[store] = { store, totalDays: 0, count: 0 }
      byStore[store].totalDays += d.days
      byStore[store].count++
    })
    return Object.values(byStore).map((s) => ({
      store: s.store,
      avgDays: Math.round(s.totalDays / s.count),
      count: s.count,
    }))
  }, [trainingData, storeFilter])

  // Readiness by training day (shift key)
  const readinessByDay = useMemo(() => {
    const byShift = {}
    REQUIRED_SHIFT_KEYS.forEach((key) => { byShift[key] = { sum: 0, count: 0 } })

    for (const [, rec] of Object.entries(trainingData || {})) {
      if (!rec || rec.archived) continue
      if (storeFilter && (rec.store || '') !== storeFilter) continue
      const checklists = rec.checklists || {}
      for (const [shiftKey, cl] of Object.entries(checklists)) {
        if (!byShift[shiftKey]) continue
        const score = cl?.managerScore
        if (typeof score === 'number') {
          byShift[shiftKey].sum += score
          byShift[shiftKey].count++
        }
      }
    }

    return REQUIRED_SHIFT_KEYS.map((key) => {
      const meta = SHIFT_META[key] || { label: key }
      const d = byShift[key]
      return {
        shift: meta.label.replace(/\s*\(.*\)/, ''),
        avgReadiness: d.count > 0 ? Math.round((d.sum / d.count) * 10) / 10 : 0,
        count: d.count,
      }
    })
  }, [trainingData, storeFilter])

  // Dropout funnel (enhanced with drop-off %)
  const funnel = useMemo(() => {
    const raw = computeDropoutFunnel(trainingData)
    let data
    if (storeFilter) {
      const counts = {}
      REQUIRED_SHIFT_KEYS.forEach((key) => { counts[key] = 0 })
      for (const [, rec] of Object.entries(trainingData || {})) {
        if (!rec || rec.archived || (rec.store || '') !== storeFilter) continue
        REQUIRED_SHIFT_KEYS.forEach((key) => {
          if (isShiftComplete(rec, key)) counts[key]++
        })
      }
      data = REQUIRED_SHIFT_KEYS.map((key) => ({
        shiftKey: key,
        label: (SHIFT_META[key]?.label || key).replace(/\s*\(.*\)/, ''),
        count: counts[key],
      }))
    } else {
      data = raw.map((d) => ({
        ...d,
        label: (SHIFT_META[d.shiftKey]?.label || d.shiftKey).replace(/\s*\(.*\)/, ''),
      }))
    }
    // Add drop-off % between steps
    return data.map((d, i) => {
      const prev = i > 0 ? data[i - 1].count : null
      const dropoff = prev !== null && prev > 0 ? Math.round(((prev - d.count) / prev) * 100) : null
      return { ...d, dropoff }
    })
  }, [trainingData, storeFilter])

  // Total trainees for funnel context
  const totalTrainees = useMemo(() => {
    return Object.values(trainingData || {}).filter(
      (rec) => rec && !rec.archived && (!storeFilter || (rec.store || '') === storeFilter)
    ).length
  }, [trainingData, storeFilter])

  // Readiness velocity
  const velocity = useMemo(
    () => computeReadinessVelocity(trainingData, storeFilter || null),
    [trainingData, storeFilter]
  )

  const velocityChartData = useMemo(() => {
    if (!velocity.perTrainee.length) return []
    // Build avg line across shift steps
    const byShift = {}
    REQUIRED_SHIFT_KEYS.forEach((key, i) => {
      byShift[key] = { shift: (SHIFT_META[key]?.label || key).replace(/\s*\(.*\)/, ''), total: 0, count: 0, idx: i }
    })
    velocity.perTrainee.forEach((t) => {
      t.scores.forEach((s) => {
        if (byShift[s.shift]) {
          byShift[s.shift].total += s.score
          byShift[s.shift].count++
        }
      })
    })
    return Object.values(byShift)
      .sort((a, b) => a.idx - b.idx)
      .map((d) => ({
        shift: d.shift,
        avgScore: d.count > 0 ? Math.round((d.total / d.count) * 10) / 10 : null,
      }))
      .filter((d) => d.avgScore !== null)
  }, [velocity])

  // Study consistency
  const consistency = useMemo(
    () => computeStudyConsistency(sessionData || [], quizAttempts || [], trainingData, storeFilter || null),
    [sessionData, quizAttempts, trainingData, storeFilter]
  )

  const consistencyChartData = useMemo(() => {
    return consistency.perTrainee
      .filter((t) => t.studyDays > 0)
      .sort((a, b) => b.daysPerWeek - a.daysPerWeek)
      .slice(0, 15)
      .map((t) => ({
        name: t.name.length > 12 ? t.name.slice(0, 10) + '\u2026' : t.name,
        daysPerWeek: t.daysPerWeek,
        avgScore: t.avgTestScore,
      }))
  }, [consistency])

  // Custom funnel tooltip
  const FunnelTooltip = ({ active, payload }) => {
    if (!active || !payload?.[0]) return null
    const data = payload[0].payload
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-sm">
        <p className="font-bold text-gray-800">{data.label}</p>
        <p className="text-gray-600">{data.count} trainees at this step</p>
        <p className="text-gray-500">{totalTrainees > 0 ? Math.round((data.count / totalTrainees) * 100) : 0}% of total</p>
        {data.dropoff !== null && (
          <p className="text-red-600 font-medium mt-1">&#8595; {data.dropoff}% dropped from previous</p>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ChartCard title="Avg time to certification" subtitle="Days from first scheduled shift to certification sign-off">
        {timeToCert.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={timeToCert}>
              <XAxis dataKey="store" />
              <YAxis unit=" days" />
              <Tooltip formatter={(v) => `${v} days`} />
              <Bar dataKey="avgDays" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No certified trainees yet</p>
        )}
      </ChartCard>

      <ChartCard title="Readiness by training day" subtitle="Avg manager readiness score per shift step">
        {readinessByDay.some((d) => d.count > 0) ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={readinessByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="shift" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 5]} />
              <Tooltip />
              <Line type="monotone" dataKey="avgReadiness" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No readiness scores recorded</p>
        )}
      </ChartCard>

      <ChartCard title="Completion funnel" subtitle={`Trainees completing each step (of ${totalTrainees} total)`} className="md:col-span-2">
        {funnel.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={funnel}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip content={<FunnelTooltip />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} minPointSize={0}>
                  {funnel.map((_, i) => (
                    <Cell key={i} fill={FUNNEL_COLORS[Math.min(i, FUNNEL_COLORS.length - 1)]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Drop-off labels */}
            <div className="flex justify-around mt-1 px-4">
              {funnel.map((d, i) => (
                <div key={i} className="text-center text-xs min-w-[40px]">
                  {d.dropoff !== null && d.dropoff > 0 ? (
                    <span className="text-red-500 font-medium">&#8595; {d.dropoff}%</span>
                  ) : i === 0 ? null : (
                    <span className="text-green-600 font-medium">0%</span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No shift data</p>
        )}
      </ChartCard>

      <ChartCard
        title="Readiness velocity"
        subtitle={`Avg score progression across shifts (trend: ${velocity.trend}, slope: ${velocity.avgSlope})`}
      >
        {velocityChartData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={velocityChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="shift" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 5]} />
              <Tooltip />
              <Line type="monotone" dataKey="avgScore" stroke={CHART_COLORS[4]} strokeWidth={2} dot={{ r: 4 }} name="Avg readiness" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">Need 2+ scored shifts to show velocity</p>
        )}
      </ChartCard>

      <ChartCard
        title="Study consistency"
        subtitle={
          consistency.consistentAvgScore !== null && consistency.sporadicAvgScore !== null
            ? `Consistent (2+ days/wk): ${consistency.consistentAvgScore}% avg | Sporadic: ${consistency.sporadicAvgScore}%`
            : 'Study days per week by trainee'
        }
      >
        {consistencyChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={consistencyChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip
                formatter={(value, name) =>
                  name === 'Days/week' ? `${value} days/wk` : `${value}%`
                }
              />
              <Legend />
              <Bar dataKey="daysPerWeek" name="Days/week" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="avgScore" name="Avg test %" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No study session data</p>
        )}
      </ChartCard>
    </div>
  )
}
