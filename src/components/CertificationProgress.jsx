export default function CertificationProgress({ done = 0, total = 6 }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="certification-progress">
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-semibold text-gray-700">Certification progress</span>
        <span className="text-gray-600">
          {done} / {total} shifts complete
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-[#2e7d32] transition-all duration-300"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}
