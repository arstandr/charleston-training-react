import { useState, useEffect } from 'react'
import { getAllAuditLogs, getAuditLogsForUser } from '../services/auditService'
import { useAuth } from '../contexts/AuthContext'

const ACTION_COLORS = {
  login: 'bg-green-100 text-green-800',
  logout: 'bg-gray-100 text-gray-800',
  quiz_completed: 'bg-blue-100 text-blue-800',
  flashcard_session: 'bg-purple-100 text-purple-800',
  profile_updated: 'bg-yellow-100 text-yellow-800',
  settings_changed: 'bg-orange-100 text-orange-800',
}

export default function AuditLogViewer({ userId = null }) {
  const { currentUser } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const load = userId ? getAuditLogsForUser(userId) : getAllAuditLogs(100)
    load
      .then((result) => {
        if (cancelled) return
        const list = filter === 'all' ? result : result.filter((log) => log.action === filter)
        setLogs(list)
      })
      .catch(() => {
        if (!cancelled) setLogs([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId, filter])

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-600">Loading audit logs…</div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Audit Log</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="all">All Actions</option>
          <option value="login">Logins</option>
          <option value="logout">Logouts</option>
          <option value="quiz_completed">Quizzes</option>
          <option value="flashcard_session">Flashcards</option>
          <option value="profile_updated">Profile Updates</option>
        </select>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No audit logs found.</div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="border border-gray-300 rounded-lg p-4 bg-white">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-800'}`}>
                    {(log.action || '').replace(/_/g, ' ').toUpperCase()}
                  </span>
                  <p className="mt-2 font-semibold text-gray-800">{log.userName}</p>
                  <p className="text-sm text-gray-600">User ID: {log.userId}</p>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <p>{log.timestamp ? new Date(log.timestamp).toLocaleDateString() : '—'}</p>
                  <p>{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '—'}</p>
                </div>
              </div>
              {log.details && Object.keys(log.details).length > 0 && (
                <div className="mt-3 p-3 bg-gray-50 rounded text-xs">
                  <p className="font-semibold mb-1">Details:</p>
                  <pre className="whitespace-pre-wrap text-gray-700">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
