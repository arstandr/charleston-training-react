import { useMemo, useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import StoreFilter from '../components/analytics/StoreFilter'
import { useTrainingData } from '../hooks/useTrainingData'
import { useStaffAccounts } from '../hooks/useStaffAccounts'
import {
  fetchAllFlashcardMastery,
  fetchAllFlashcardSessions,
  fetchAllQuizAttempts,
  fetchAllTestResults,
  fetchAllUsers,
} from '../services/analyticsService'

// Lazy-load section components for code splitting
import FlashcardAnalytics from '../components/analytics/FlashcardAnalytics'
import TraineeAnalytics from '../components/analytics/TraineeAnalytics'
import TrainerAnalytics from '../components/analytics/TrainerAnalytics'
import ManagerAnalytics from '../components/analytics/ManagerAnalytics'
import TestQuizAnalytics from '../components/analytics/TestQuizAnalytics'

// Existing analytics components kept as Overview
import RiskScoreCard, { computeRiskScore } from '../components/RiskScoreCard'
import SkillGapHeatmap from '../components/SkillGapHeatmap'
import { getComplianceStats, getTrainerRatingBreakdown } from '../utils/helpers'
import { useTrainers } from '../hooks/useTrainers'
import TrainerFeedbackModal from '../components/TrainerFeedbackModal'
import { FLASHCARD_DATABASE, FLASHCARD_SETS } from '../data/flashcardDatabase'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'trainees', label: 'Trainee Progress' },
  { id: 'trainers', label: 'Trainer Performance' },
  { id: 'managers', label: 'Manager Metrics' },
  { id: 'tests', label: 'Tests & Quizzes' },
]

export default function AnalyticsPage() {
  const { stores } = useOrg()
  const { listTrainees, trainingData } = useTrainingData()
  const { staffAccounts } = useStaffAccounts()
  const [activeTab, setActiveTab] = useState('overview')
  const [storeFilter, setStoreFilter] = useState('')

  // One-time data fetches
  const [masteryData, setMasteryData] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [quizAttempts, setQuizAttempts] = useState(null)
  const [usersMap, setUsersMap] = useState({})
  const [loading, setLoading] = useState(true)

  const [testResultsMap, setTestResultsMap] = useState({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [mastery, sessions, quizzes, users, testResults] = await Promise.all([
        fetchAllFlashcardMastery(),
        fetchAllFlashcardSessions(),
        fetchAllQuizAttempts(),
        fetchAllUsers(),
        fetchAllTestResults(),
      ])
      if (!cancelled) {
        setMasteryData(mastery)
        setSessionData(sessions)
        setQuizAttempts(quizzes)
        setUsersMap(users)
        setTestResultsMap(testResults)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Enrich trainingData with test results from the testResults collection
  const enrichedTrainingData = useMemo(() => {
    if (!trainingData || !Object.keys(testResultsMap).length) return trainingData
    const enriched = {}
    for (const [traineeId, rec] of Object.entries(trainingData)) {
      const testResults = testResultsMap[traineeId] || []
      enriched[traineeId] = { ...rec, testResults }
    }
    return enriched
  }, [trainingData, testResultsMap])

  // Build flashcard database lookup for FlashcardAnalytics (includes title for deck name display)
  const flashcardDbForAnalytics = useMemo(() => {
    const db = {}
    FLASHCARD_SETS.forEach((set) => {
      const cards = FLASHCARD_DATABASE[set.id]
      if (Array.isArray(cards)) {
        db[set.id] = { id: set.id, title: set.title, cards }
      }
    })
    return db
  }, [])

  // Overview tab data
  const allTrainees = useMemo(
    () => listTrainees({ store: null, includeArchived: false }),
    [listTrainees]
  )

  const traineesForStore = useMemo(
    () => (storeFilter ? allTrainees.filter((t) => (t.store || '') === storeFilter) : allTrainees),
    [allTrainees, storeFilter]
  )

  const riskSorted = useMemo(() => {
    const list = storeFilter ? traineesForStore : allTrainees
    const withScore = list.map((t) => ({ trainee: t, score: computeRiskScore(t) }))
    withScore.sort((a, b) => b.score - a.score)
    return withScore.slice(0, 12)
  }, [allTrainees, traineesForStore, storeFilter])

  const compliance = useMemo(
    () => getComplianceStats(trainingData, storeFilter || undefined),
    [trainingData, storeFilter]
  )

  const { trainers } = useTrainers(storeFilter || stores[0])
  const [selectedTrainerId, setSelectedTrainerId] = useState(null)
  const selectedTrainer = selectedTrainerId ? trainers.find((t) => t.empNum === selectedTrainerId) : null
  const trainerBreakdown = selectedTrainerId ? getTrainerRatingBreakdown(trainingData, selectedTrainerId) : null

  const trainerCompletedCount = useMemo(() => {
    const count = {}
    for (const [, rec] of Object.entries(trainingData || {})) {
      if (!rec || rec.archived) continue
      if (storeFilter && (rec.store || '') !== storeFilter) continue
      const schedule = rec.schedule || {}
      for (const [, item] of Object.entries(schedule)) {
        if (item?.trainerSignedAt && item?.managerSignedAt && item.trainer) {
          const emp = String(item.trainer)
          count[emp] = (count[emp] || 0) + 1
        }
      }
    }
    return count
  }, [trainingData, storeFilter])

  return (
    <>
      <AppHeader />
      <div className="container mx-auto max-w-6xl px-4 pb-8">
        <OwnerNavBar />
        <div className="content-area">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Analytics</h2>
              <p className="text-gray-600 text-sm">Performance metrics across all locations</p>
            </div>
            <StoreFilter stores={stores} value={storeFilter} onChange={setStoreFilter} />
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-[var(--color-primary)] text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading && activeTab !== 'overview' && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-[var(--color-primary)] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading analytics data...</p>
              </div>
            </div>
          )}

          {/* ===== OVERVIEW TAB ===== */}
          {activeTab === 'overview' && (
            <>
              <section className="mb-8">
                <h3 className="mb-3 font-bold text-gray-800">Trainee risk (highest first)</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {riskSorted.map(({ trainee }) => (
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
                <h3 className="mb-3 font-bold text-gray-800">Skill gap heatmap</h3>
                <SkillGapHeatmap trainees={storeFilter ? traineesForStore : allTrainees} />
              </section>

              <section>
                <h3 className="mb-3 font-bold text-gray-800">Trainer effectiveness</h3>
                <p className="mb-2 text-sm text-gray-500">
                  Ratings from trainees. Click a card to see the full breakdown.
                </p>
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
                          {starRating > 0 ? `★ ${Number(starRating).toFixed(1)}` : '---'} ({ratingsCount} rating{ratingsCount !== 1 ? 's' : ''})
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
            </>
          )}

          {/* ===== FLASHCARDS TAB ===== */}
          {activeTab === 'flashcards' && !loading && (
            <FlashcardAnalytics
              masteryData={masteryData}
              sessionData={sessionData}
              trainingData={trainingData}
              flashcardDatabase={flashcardDbForAnalytics}
              usersMap={usersMap}
              storeFilter={storeFilter || null}
            />
          )}

          {/* ===== TRAINEES TAB ===== */}
          {activeTab === 'trainees' && (
            <TraineeAnalytics trainingData={enrichedTrainingData} storeFilter={storeFilter || null} sessionData={sessionData} quizAttempts={quizAttempts} />
          )}

          {/* ===== TRAINERS TAB ===== */}
          {activeTab === 'trainers' && (
            <TrainerAnalytics trainingData={enrichedTrainingData} staffAccounts={staffAccounts} storeFilter={storeFilter || null} />
          )}

          {/* ===== MANAGERS TAB ===== */}
          {activeTab === 'managers' && (
            <ManagerAnalytics trainingData={enrichedTrainingData} staffAccounts={staffAccounts} storeFilter={storeFilter || null} />
          )}

          {/* ===== TESTS & QUIZZES TAB ===== */}
          {activeTab === 'tests' && !loading && (
            <TestQuizAnalytics quizAttempts={quizAttempts} trainingData={enrichedTrainingData} storeFilter={storeFilter || null} />
          )}
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
