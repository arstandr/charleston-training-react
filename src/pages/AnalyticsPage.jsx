import { useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import RiskScoreCard from '../components/RiskScoreCard'
import SkillGapHeatmap from '../components/SkillGapHeatmap'
import { useTrainingData } from '../hooks/useTrainingData'
import { useTrainers } from '../hooks/useTrainers'
import { computeRiskScore } from '../components/RiskScoreCard'
import { getComplianceStats, getTrainerRatingBreakdown } from '../utils/helpers'
import TrainerFeedbackModal from '../components/TrainerFeedbackModal'

export default function AnalyticsPage() {
  const { currentUser } = useAuth()
  const { stores } = useOrg()
  const { listTrainees, trainingData } = useTrainingData()
  const [storeFilter, setStoreFilter] = useState(stores[0] || 'Westfield')

  const allTrainees = useMemo(
    () => listTrainees({ store: null, includeArchived: false }),
    [listTrainees]
  )

  const traineesForStore = useMemo(
    () => (storeFilter ? allTrainees.filter((t) => (t.store || '') === storeFilter) : allTrainees),
    [allTrainees, storeFilter]
  )

  const riskSorted = useMemo(() => {
    const withScore = allTrainees.map((t) => ({ trainee: t, score: computeRiskScore(t) }))
    withScore.sort((a, b) => b.score - a.score)
    return withScore.slice(0, 12)
  }, [allTrainees])

  const compliance = useMemo(
    () => getComplianceStats(trainingData, storeFilter || undefined),
    [trainingData, storeFilter]
  )

  const trainerCompletedCount = useMemo(() => {
    const count = {}
    for (const [, rec] of Object.entries(trainingData || {})) {
      if (!rec || rec.archived) continue
      if (storeFilter && (rec.store || '') !== storeFilter) continue
      const schedule = rec.schedule || {}
      for (const [shiftKey, item] of Object.entries(schedule)) {
        if (item?.trainerSignedAt && item?.managerSignedAt && item.trainer) {
          const emp = String(item.trainer)
          count[emp] = (count[emp] || 0) + 1
        }
      }
    }
    return count
  }, [trainingData, storeFilter])

  const { trainers } = useTrainers(storeFilter)
  const [selectedTrainerId, setSelectedTrainerId] = useState(null)
  const selectedTrainer = selectedTrainerId ? trainers.find((t) => t.empNum === selectedTrainerId) : null
  const trainerBreakdown = selectedTrainerId ? getTrainerRatingBreakdown(trainingData, selectedTrainerId) : null

  return (
    <>
      <AppHeader />
      <div className="container mx-auto px-4 pb-8">
        <OwnerNavBar />
        <div className="content-area">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Analytics</h2>
          <p className="text-gray-600 text-sm mb-6">
            Risk scores, skill gaps, and trainer effectiveness.
          </p>

          <section className="mb-8">
            <h3 className="mb-3 font-bold text-gray-800">Trainee risk (highest first)</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {riskSorted.map(({ trainee, score }) => (
                <RiskScoreCard key={trainee.id} trainee={trainee} store={trainee.store} />
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
            <div className="mb-2 flex items-center gap-4">
              <h3 className="font-bold text-gray-800">Skill gap heatmap</h3>
              <select
                className="rounded border border-gray-300 px-2 py-1 text-sm"
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
              >
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <SkillGapHeatmap trainees={storeFilter ? traineesForStore : allTrainees} />
          </section>

          <section>
            <h3 className="mb-3 font-bold text-gray-800">Trainer effectiveness</h3>
            <p className="mb-2 text-sm text-gray-500">Ratings from trainees. Click a card to see the full breakdown. Store: {storeFilter}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {trainers.map((t) => {
                const breakdown = getTrainerRatingBreakdown(trainingData, t.empNum)
                const starRating = breakdown.overallAvg ?? t.starRating ?? 0
                const ratingsCount = breakdown.count ?? t.ratingsCount ?? 0
                return (
                  <div
                    key={t.empNum}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTrainerId(t.empNum)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedTrainerId(t.empNum)}
                    className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2"
                  >
                    <div className="font-semibold text-gray-800">{t.name || `#${t.empNum}`}</div>
                    <div className="mt-1 text-sm text-gray-600">
                      {starRating > 0 ? `★ ${Number(starRating).toFixed(1)}` : '—'} ({ratingsCount} rating{ratingsCount !== 1 ? 's' : ''})
                      {(trainerCompletedCount[t.empNum] ?? 0) > 0 && (
                        <span className="ml-1 text-gray-500"> · {trainerCompletedCount[t.empNum]} shifts completed</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {trainers.length === 0 && <p className="text-gray-500">No trainers for this store.</p>}
          </section>
        </div>
      </div>

      <TrainerFeedbackModal
        open={!!selectedTrainerId}
        trainerName={selectedTrainer?.name || (selectedTrainerId ? `#${selectedTrainerId}` : '')}
        trainerEmpNum={selectedTrainerId}
        breakdown={trainerBreakdown}
        onClose={() => setSelectedTrainerId(null)}
        anonymousFeedback
      />
    </>
  )
}
