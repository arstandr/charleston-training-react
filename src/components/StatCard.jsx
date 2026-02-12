export default function StatCard({ count, label, borderClass = 'border-orange', variant, onClick }) {
  const isGreen = variant === 'green'
  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      className={isGreen ? `dash-stat-card stat-card-green` : `dash-stat-card ${borderClass}`}
    >
      {isGreen ? <h3 className="mb-1 text-xs font-semibold opacity-90">{label}</h3> : null}
      <div className={isGreen ? 'stat-value text-3xl font-bold' : 'text-2xl font-bold'}>{count}</div>
      {!isGreen ? <div className="text-gray-600 text-xs font-semibold">{label}</div> : <p className="mt-1 text-xs opacity-80">—</p>}
    </div>
  )
}
