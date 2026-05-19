import ManagerAnalyticsOverview from '../ManagerAnalyticsOverview'
import TraineeAnalytics from '../analytics/TraineeAnalytics'
import TrainerAnalytics from '../analytics/TrainerAnalytics'
import ManagerAnalytics from '../analytics/ManagerAnalytics'
import TestQuizAnalytics from '../analytics/TestQuizAnalytics'
import { getStoreDisplayName } from '../../constants'

export default function ManagerAnalyticsView({
  store, analyticsTab, onTabChange,
  analyticsLoading, analyticsData,
  trainees, trainingData, staffAccounts,
}) {
  return (
    <div>
      <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Analytics</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{getStoreDisplayName(store)}</p>
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'trainees', label: 'Trainees' },
          { id: 'trainers', label: 'Trainers' },
          { id: 'managers', label: 'Managers' },
          { id: 'tests', label: 'Tests & Quizzes' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              analyticsTab === tab.id
                ? 'bg-[var(--color-primary)] text-white shadow-md'
                : 'hover:bg-[rgba(0,0,0,0.04)] border border-[var(--hairline)]'
            }`}
            style={analyticsTab !== tab.id ? { color: 'var(--text-secondary)' } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {analyticsLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-t-[var(--color-primary)] rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--hairline)', borderTopColor: 'var(--color-primary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading analytics data...</p>
          </div>
        </div>
      )}
      {!analyticsLoading && analyticsTab === 'overview' && (
        <ManagerAnalyticsOverview trainees={trainees} trainingData={trainingData} store={store} staffAccounts={staffAccounts} />
      )}
      {!analyticsLoading && analyticsTab === 'trainees' && (
        <TraineeAnalytics trainingData={trainingData} storeFilter={store} sessionData={analyticsData?.sessions} quizAttempts={analyticsData?.quizzes} />
      )}
      {!analyticsLoading && analyticsTab === 'trainers' && (
        <TrainerAnalytics trainingData={trainingData} staffAccounts={staffAccounts} storeFilter={store} />
      )}
      {!analyticsLoading && analyticsTab === 'managers' && (
        <ManagerAnalytics trainingData={trainingData} staffAccounts={staffAccounts} storeFilter={store} />
      )}
      {!analyticsLoading && analyticsTab === 'tests' && analyticsData && (
        <TestQuizAnalytics quizAttempts={analyticsData.quizzes} trainingData={trainingData} storeFilter={store} />
      )}
    </div>
  )
}
