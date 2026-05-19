/** Wrapper card for analytics charts */
export default function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h4 className="text-sm font-bold text-gray-800 mb-1">{title}</h4>}
      {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
      {children}
    </div>
  )
}
