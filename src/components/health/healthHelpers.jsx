export function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago'
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago'
  return Math.floor(seconds / 86400) + 'd ago'
}

export function HealthCard({ title, icon, status, message, details, actions }) {
  const statusColors = {
    healthy: 'bg-green-100 text-green-800 border-green-300',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    error: 'bg-red-100 text-red-800 border-red-300',
    unknown: 'bg-gray-100 text-gray-800 border-gray-300',
  }
  const statusIcons = {
    healthy: '✅',
    warning: '⚠️',
    error: '❌',
    unknown: '❓',
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{icon}</span>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold border-2 ${statusColors[status] || statusColors.unknown}`}
        >
          {statusIcons[status] || '❓'} {(status || 'unknown').toUpperCase()}
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      <div className="space-y-2 mb-4">
        {details.map((detail, idx) => (
          <div key={idx} className="flex justify-between text-sm">
            <span className="text-gray-500">{detail.label}:</span>
            <span className="font-semibold text-gray-900">{detail.value}</span>
          </div>
        ))}
      </div>
      {actions?.length > 0 && (
        <div className="flex gap-2">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              onClick={action.onClick}
              className="flex-1 px-3 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-semibold"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function StatCard({ label, value, icon }) {
  return (
    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-2xl font-bold text-green-900">{value}</span>
      </div>
      <p className="text-xs font-semibold text-green-700">{label}</p>
    </div>
  )
}

export function ActivityItem({ icon, title, description, time, status }) {
  const statusColors = {
    success: 'bg-green-100 text-green-700',
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-yellow-100 text-yellow-700',
  }
  return (
    <div className="flex items-start gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
      <div className={`p-2 rounded-lg ${statusColors[status] || statusColors.info}`}>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="flex-1">
        <p className="font-semibold text-gray-900 text-sm">{title}</p>
        <p className="text-xs text-gray-600">{description}</p>
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">{time}</span>
    </div>
  )
}
