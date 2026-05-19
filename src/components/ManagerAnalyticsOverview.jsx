import { useMemo } from 'react'
import RiskScoreCard, { computeRiskScore } from './RiskScoreCard'
import SkillGapHeatmap from './SkillGapHeatmap'
import { getComplianceStats } from '../utils/helpers'
import { detectPrematureSignoffs, detectTrainerSkippers } from '../services/analyticsService'
import { SHIFT_META } from '../constants'

/**
 * Lightweight analytics overview for the manager dashboard.
 * Store-locked — no store picker needed.
 */
export default function ManagerAnalyticsOverview({ trainees, trainingData, store, staffAccounts }) {
  const riskSorted = useMemo(() => {
    const withScore = trainees.map((t) => ({ trainee: t, score: computeRiskScore(t) }))
    withScore.sort((a, b) => b.score - a.score)
    return withScore.slice(0, 12)
  }, [trainees])

  const compliance = useMemo(
    () => getComplianceStats(trainingData, store || undefined),
    [trainingData, store]
  )

  const prematureSignoffs = useMemo(
    () => detectPrematureSignoffs(trainingData, store || null),
    [trainingData, store]
  )

  const trainerSkippers = useMemo(
    () => detectTrainerSkippers(trainingData, staffAccounts || {}, store || null).filter((s) => s.completionRate < 70),
    [trainingData, staffAccounts, store]
  )

  return (
    <>
      {/* Premature sign-off alerts */}
      {prematureSignoffs.length > 0 && (
        <section className="mb-6">
          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
            <h3 className="mb-2 flex items-center gap-2 font-bold text-red-800">
              <span className="text-lg">&#9888;</span>
              Premature sign-offs ({prematureSignoffs.length})
            </h3>
            <p className="mb-3 text-sm text-red-700">
              Shifts signed off by manager with readiness score below 3.
            </p>
            <div className="space-y-2">
              {prematureSignoffs.slice(0, 6).map((s, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-white p-3">
                  <div>
                    <span className="font-medium text-gray-800">{s.traineeName}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      {(SHIFT_META[s.shiftKey]?.label || s.shiftKey)}
                    </span>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    s.managerScore <= 1 ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                  }`}>
                    Score: {s.managerScore}/5
                  </span>
                </div>
              ))}
              {prematureSignoffs.length > 6 && (
                <p className="text-sm text-red-600">+ {prematureSignoffs.length - 6} more</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Trainer checklist compliance alerts */}
      {trainerSkippers.length > 0 && (
        <section className="mb-6">
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
            <h3 className="mb-2 flex items-center gap-2 font-bold text-amber-800">
              <span className="text-lg">&#9888;</span>
              Checklist compliance alerts ({trainerSkippers.length})
            </h3>
            <p className="mb-3 text-sm text-amber-700">
              Trainers with less than 70% checklist completion rate on signed shifts.
            </p>
            <div className="space-y-2">
              {trainerSkippers.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-3">
                  <div>
                    <span className="font-medium text-gray-800">{s.name}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      {s.checklistComplete}/{s.totalSigned} shifts with complete checklists
                    </span>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    s.completionRate < 50 ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                  }`}>
                    {s.completionRate}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h3 className="mb-3 font-bold text-gray-800">Trainee risk (highest first)</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {riskSorted.map(({ trainee }) => (
            <RiskScoreCard key={trainee.id} trainee={trainee} store={store} />
          ))}
        </div>
        {riskSorted.length === 0 && <p className="text-gray-500">No trainee data.</p>}
      </section>

      <section className="mb-8">
        <h3 className="mb-3 font-bold text-gray-800">Assessment compliance</h3>
        <p className="mb-2 text-sm text-gray-500">Shifts with both trainer and manager sign-off.</p>
        <div className="rounded-xl border border-gray-200 bg-white p-4 inline-block">
          <span className="text-2xl font-bold text-gray-800">{compliance.compliancePct}%</span>
          <span className="ml-2 text-gray-600">
            ({compliance.dualSigned}/{compliance.totalTrainerSigned} dual-signed)
          </span>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="mb-3 font-bold text-gray-800">Skill gap heatmap</h3>
        <SkillGapHeatmap trainees={trainees} />
      </section>
    </>
  )
}
