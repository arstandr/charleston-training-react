export default function TrainerCard({ trainer, onEdit, onFeedback, onArchive }) {
  const { empNum, name, starRating = 0, ratingsCount = 0, shiftsThisWeek = 0, assignedCount = 0, effectivenessPct } = trainer
  const stars = '★'.repeat(Math.round(starRating)) + '☆'.repeat(5 - Math.round(starRating))
  const initial = (name || 'T').charAt(0).toUpperCase()

  return (
    <div
      className="rounded-2xl p-5 border-2 border-[#f57c00] shadow-md relative cursor-pointer"
      style={{ background: 'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)', boxShadow: '0 4px 12px rgba(245,124,0,0.15)' }}
      onClick={() => onFeedback?.(empNum)}
      title="Click to see all rating criteria and feedback"
    >
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {effectivenessPct != null && (
          <span className="bg-green-600 text-white px-2 py-0.5 rounded-lg text-xs font-bold" title="Effectiveness: % of assigned shifts with manager sign-off">
            Eff: {effectivenessPct}%
          </span>
        )}
        <span className="bg-[#f57c00] text-white px-2.5 py-1 rounded-xl text-xs font-bold">TRAINER</span>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-[#f57c00] flex items-center justify-center text-white text-xl font-bold">
          {initial}
        </div>
        <div className="font-bold text-gray-800">{name || 'Unnamed'}</div>
      </div>
      <div className="mb-3">
        <div className="text-[#f57c00] text-lg tracking-wider" title={`${Number(starRating).toFixed(1)} stars (${ratingsCount} ratings)`}>
          {stars}
        </div>
        <div className="text-gray-500 text-xs">
          {ratingsCount > 0 ? `${Number(starRating).toFixed(1)} avg (${ratingsCount} ratings) · Click for breakdown` : 'No ratings yet · Click for details'}
        </div>
      </div>
      <div className="text-gray-600 text-sm mb-3">
        Shifts this week: <strong>{shiftsThisWeek}</strong> · Assigned Trainees: <strong>{assignedCount}</strong>
      </div>
      <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {onEdit && (
          <button type="button" className="btn btn-small flex-1 min-w-[80px]" onClick={() => onEdit(empNum)}>
            Edit
          </button>
        )}
        {onFeedback && (
          <button type="button" className="btn btn-small btn-secondary flex-1 min-w-[80px]" onClick={() => onFeedback(empNum)}>
            View feedback
          </button>
        )}
        {onArchive && (
          <button type="button" className="btn btn-small btn-danger" onClick={() => onArchive(empNum)}>
            Archive
          </button>
        )}
      </div>
    </div>
  )
}
