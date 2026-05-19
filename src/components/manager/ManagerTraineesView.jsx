import TraineeCard from '../TraineeCard'
import { SkeletonCard } from '../SkeletonCard'

export default function ManagerTraineesView({
  managerSearch, onSearchChange,
  filteredTrainees, trainingDataLoading, traineesWithNeedsYou,
  trainingData, allTraineeTestResults, allFlashcardStats, allPracticeTestStats,
  onEditSchedule, onAssess, onInsight, onArchive, onResetAttempts,
  onReviewTest, onPrintSummary, onEditTrainee, onAddNote,
  onVerbalCert, onViewDetails, onStudyLog,
}) {
  return (
    <>
      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by name or #"
          className="rounded border border-gray-300 px-3 py-2 text-sm max-w-xs"
          value={managerSearch}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <h3 className="text-lg font-bold border-b-2 border-blue-500 pb-2 mb-4" style={{ color: 'var(--text-primary)' }}>
        Trainees ({filteredTrainees.length})
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {trainingDataLoading ? (
          Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
        ) : traineesWithNeedsYou.map((t) => (
          <TraineeCard
            key={t.id}
            trainee={t}
            trainingData={trainingData}
            testAttempts={allTraineeTestResults}
            flashcardStats={allFlashcardStats}
            practiceTestStats={allPracticeTestStats}
            variant="mint"
            needsYouLabel={t.needsYouLabel}
            onEditSchedule={() => onEditSchedule(t.id)}
            onAssess={(id) => onAssess(id)}
            onInsight={(id) => onInsight(id)}
            onArchive={() => onArchive(t.id)}
            onResetAttempts={(id) => onResetAttempts(id)}
            onReviewTest={(id) => onReviewTest(id)}
            onPrintSummary={(id) => onPrintSummary(id)}
            onEditTrainee={(id) => onEditTrainee(id)}
            onAddNote={(id) => onAddNote(id)}
            onVerbalCert={(id) => onVerbalCert(id)}
            onViewDetails={(id) => onViewDetails(id)}
            onStudyLog={(id) => onStudyLog(id)}
          />
        ))}
      </div>
    </>
  )
}
