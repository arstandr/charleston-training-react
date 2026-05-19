import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import ChartCard from './ChartCard'
import { CHART_COLORS, STATUS_COLORS } from './chartConstants'
import { SHIFT_META } from '../../constants'
import { detectPrematureSignoffs, computeManagerTurnaround } from '../../services/analyticsService'

export default function ManagerAnalytics({ trainingData, staffAccounts, storeFilter }) {
  // Premature sign-offs
  const premature = useMemo(() => {
    const all = detectPrematureSignoffs(trainingData)
    if (!storeFilter) return all
    return all.filter((p) => {
      const rec = trainingData?.[p.traineeId]
      return rec && (rec.store || '') === storeFilter
    })
  }, [trainingData, storeFilter])

  // Review turnaround by manager
  const turnaround = useMemo(() => {
    return computeManagerTurnaround(trainingData, staffAccounts)
  }, [trainingData, staffAccounts])

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ChartCard title="Premature sign-offs" subtitle="Manager signed with readiness score below 3" className="md:col-span-2">
        {premature.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Trainee</th>
                  <th className="px-3 py-2">Shift</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Signed by</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {premature.map((p, i) => {
                  const meta = SHIFT_META[p.shiftKey] || { label: p.shiftKey }
                  const signerName = staffAccounts?.[p.managerSignedBy]?.name || `#${p.managerSignedBy}`
                  const dateStr = p.managerSignedAt
                    ? new Date(p.managerSignedAt).toLocaleDateString()
                    : '---'
                  return (
                    <tr key={i} className="hover:bg-red-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{p.traineeName}</td>
                      <td className="px-3 py-2 text-gray-600">{meta.label}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-bold">
                          {p.managerScore}/5
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{signerName}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{dateStr}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No premature sign-offs detected</p>
        )}
      </ChartCard>

      <ChartCard title="Review turnaround" subtitle="Avg hours between trainer sign-off and manager sign-off" className="md:col-span-2">
        {turnaround.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={turnaround}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis unit="h" />
              <Tooltip formatter={(v) => [`${v} hours`, 'Avg turnaround']} />
              <Bar dataKey="avgHours" name="Avg turnaround" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm py-8 text-center">No dual-signed shifts yet</p>
        )}
      </ChartCard>
    </div>
  )
}
