export function SkeletonLine({ short }) {
  return <div className={`skeleton skeleton-line ${short ? 'skeleton-line short' : ''}`} aria-hidden /> 
}

export function SkeletonCard() {
  return (
    <div className="skeleton skeleton-card border border-gray-100 rounded-xl p-4">
      <div className="skeleton skeleton-header mb-3" />
      <SkeletonLine />
      <SkeletonLine short />
    </div>
  )
}

export default function SkeletonCards({ count = 6 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
