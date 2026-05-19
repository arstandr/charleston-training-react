import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts'
import ChartCard from './ChartCard'
import { CHART_COLORS } from './chartConstants'
import { STAFF_LOGINS } from '../../constants'
import { computeTrainerWorkload, detectTrainerSkippers, computeTrainerOutcomeCorrelation } from '../../services/analyticsService'

export default function TrainerAnalytics({ trainingData, staffAccounts, storeFilter }) {
  const merged = useMemo(() => ({ ...STAFF_LOGINS, ...staffAccounts }), [staffAccounts])

  // Avg trainee test scores by trainer
  const scoresByTrainer = useMemo(() => {
    const byTrainer = {}
    for (const [, rec] of Object.entries(trainingData || {})) {
      if (!rec || rec.archived) continue
      if (storeFilter && (rec.store || '') !== storeFilter) continue
      const schedule = rec.schedule || {}
      const testResults = rec.testResults || []
      if (testResults.length === 0) continue
      const avgScore = Math.round(testResults.reduce((s, r) => s + (r.score || 0), 0) / testResults.length)

      // Attribute to all trainers who trained this trainee
      const trainers = new Set()
      for (const item of Object.values(schedule)) {
        if (item?.trainer) trainers.add(String(item.trainer))
      }
      trainers.forEach((emp) => {
        if (!byTrainer[emp]) byTrainer[emp] = { name: merged[emp]?.name || `#${emp}`, totalScore: 0, count: 0 }
        byTrainer[emp].totalScore += avgScore
        byTrainer[emp].count++
      })
    }

    return Object.values(byTrainer)
      .filter((t) => t.count > 0)
      .map((t) => ({ ...t, avgScore: Math.round(t.totalScore / t.count) }))
      .sort((a, b) => b.avgScore - a.avgScore)
  }, [trainingData, storeFilter, merged])

  // Checklist completion thoroughness
  const checklistStats = useMemo(() => {
    return detectTrainerSkippers(trainingData, staffAccounts)
      .filter((s) => !storeFilter || true) // trainers may work across stores
  }, [trainingData, staffAccounts, storeFilter])

  // Workload balance
  const workload = useMemo(() => {
    return computeTrainerWorkload(trainingData, staffAccounts, storeFilter || null)
  }, [trainingData, staffAccounts, storeFilter])

  // Trainer → trainee outcome correlation
  const outcomes = useMemo(() => {
    return computeTrainerOutcomeCorrelation(trainingData, staffAccounts, storeFilter || null)
  }, [trainingData, staffAccounts, storeFilter])

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ChartCard title="Avg trainee scores by trainer" subtitle="Mean test score of trainees trained by each trainer">
        {scoresByTrainer.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scoresByTrainer} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis dataKey="name" type="category" width={75} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="avgScore" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No test data by trainer</p>
        )}
      </ChartCard>

      <ChartCard title="Checklist completion" subtitle="% of signed shifts with complete checklists">
        {checklistStats.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={checklistStats} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis dataKey="name" type="category" width={75} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="completionRate" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No checklist data</p>
        )}
      </ChartCard>

      <ChartCard title="Workload balance" subtitle="Total assigned shifts per trainer" className="md:col-span-2">
        {workload.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={workload}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" name="Assigned" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="completed" name="Completed" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No assignment data</p>
        )}
      </ChartCard>

      <ChartCard title="Trainer → trainee outcomes" subtitle="Certification pass rate per trainer (color by performance tier)" className="md:col-span-2">
        {outcomes.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(250, outcomes.length * 36)}>
            <BarChart data={outcomes} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis dataKey="trainerName" type="category" width={75} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v, name) => name === 'certPassRate' ? `${v}%` : v}
                labelFormatter={(label) => {
                  const t = outcomes.find((o) => o.trainerName === label)
                  return t ? `${label} (${t.traineeCount} trainees)` : label
                }}
              />
              <Bar dataKey="certPassRate" name="Cert pass rate" radius={[0, 4, 4, 0]}>
                {outcomes.map((entry, i) => {
                  const color = entry.certPassRate >= 80 ? CHART_COLORS[0]
                    : entry.certPassRate >= 50 ? CHART_COLORS[3]
                    : CHART_COLORS[5]
                  return <Cell key={i} fill={color} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No trainer outcome data</p>
        )}
      </ChartCard>
    </div>
  )
}
