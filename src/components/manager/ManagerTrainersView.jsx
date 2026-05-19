import TrainerCard from '../TrainerCard'

export default function ManagerTrainersView({ trainersWithMeta, onSelectSchedule, onFeedback, onArchive }) {
  return (
    <>
      <h3 className="text-lg font-bold border-b-2 border-orange-500 pb-2 mb-4" style={{ color: 'var(--text-primary)' }}>
        Trainers ({trainersWithMeta.length})
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {trainersWithMeta.map((t) => (
          <TrainerCard
            key={t.empNum}
            trainer={t}
            onClick={(trainer) => onSelectSchedule(trainer)}
            onFeedback={(empNum) => onFeedback(trainersWithMeta.find((x) => x.empNum === empNum))}
            onArchive={(empNum) => onArchive(empNum)}
          />
        ))}
      </div>
    </>
  )
}
