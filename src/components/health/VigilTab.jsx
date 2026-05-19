/**
 * VigilTab — E2E test monitor tab for the System Health dashboard.
 * Shows: latest run card, per-test breakdown, pass rate trend, run history.
 */
import useVigilData from '../../hooks/useVigilData'

function formatDuration(ms) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

function timeAgo(ts) {
  if (!ts) return '—'
  const d = ts?.toDate?.() ? ts.toDate() : new Date(ts)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function StatusPill({ status }) {
  const colors = {
    pass: 'bg-green-100 text-green-800',
    fail: 'bg-red-100 text-red-800',
    partial: 'bg-amber-100 text-amber-800',
    flaky: 'bg-yellow-100 text-yellow-800',
    skipped: 'bg-gray-100 text-gray-600',
    passed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function PassRateBar({ rate }) {
  const color = rate >= 95 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">{rate}%</span>
    </div>
  )
}

export default function VigilTab() {
  const { latestRun, runHistory, passTrend, loading } = useVigilData()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)] mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading Vigil data...</p>
        </div>
      </div>
    )
  }

  if (!latestRun) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">🔭</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">No Test Runs Yet</h2>
        <p className="text-gray-500">Run <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">npx playwright test</code> to see results here.</p>
      </div>
    )
  }

  // Group tests by spec file
  const testsBySpec = {}
  ;(latestRun.tests || []).forEach(t => {
    const key = t.specFile || 'unknown'
    if (!testsBySpec[key]) testsBySpec[key] = []
    testsBySpec[key].push(t)
  })
  // Sort: specs with failures first
  const specEntries = Object.entries(testsBySpec).sort((a, b) => {
    const aFails = a[1].filter(t => t.status === 'failed').length
    const bFails = b[1].filter(t => t.status === 'failed').length
    return bFails - aFails
  })

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">🔭 Vigil — E2E Monitor</h1>
      <p className="text-gray-500 mb-6">Playwright test results and pass rate trends</p>

      {/* === LATEST RUN CARD === */}
      <div className={`rounded-xl border-2 p-5 mb-6 ${
        latestRun.status === 'pass' ? 'border-green-300 bg-green-50' :
        latestRun.status === 'partial' ? 'border-amber-300 bg-amber-50' :
        'border-red-300 bg-red-50'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <StatusPill status={latestRun.status} />
            <span className="text-2xl font-bold text-gray-900">{latestRun.passRate}%</span>
            <span className="text-sm text-gray-600">pass rate</span>
          </div>
          <div className="text-sm text-gray-500">
            {timeAgo(latestRun.completedAt)} &middot; {formatDuration(latestRun.durationMs)}
          </div>
        </div>
        <div className="flex gap-4 mt-3 text-sm">
          <span className="text-green-700 font-medium">{latestRun.passed} passed</span>
          {latestRun.failed > 0 && <span className="text-red-700 font-medium">{latestRun.failed} failed</span>}
          {latestRun.skipped > 0 && <span className="text-gray-500">{latestRun.skipped} skipped</span>}
          {latestRun.flaky > 0 && <span className="text-yellow-700">{latestRun.flaky} flaky</span>}
          <span className="text-gray-400">{latestRun.totalTests} total</span>
        </div>
      </div>

      {/* === PASS RATE TREND === */}
      {passTrend.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Pass Rate Trend</h2>
          <div className="flex items-end gap-1 h-24">
            {passTrend.map((run, i) => {
              const rate = run.passRate ?? 0
              const color = rate >= 95 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-500' : 'bg-red-500'
              return (
                <div key={run.id || i} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className={`w-full rounded-t ${color} min-h-[2px] transition-all`}
                    style={{ height: `${Math.max(rate, 2)}%` }}
                    title={`${rate}% — ${run.passed}/${run.totalTests}`}
                  />
                  <div className="hidden group-hover:block absolute -top-8 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                    {rate}% &middot; {run.failed > 0 ? `${run.failed} fail` : 'all pass'}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Oldest</span>
            <span>Latest</span>
          </div>
        </div>
      )}

      {/* === PER-TEST BREAKDOWN === */}
      {latestRun.tests?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Test Breakdown</h2>
          <div className="space-y-4">
            {specEntries.map(([specFile, tests]) => (
              <div key={specFile}>
                <div className="text-xs font-mono text-gray-400 mb-1">{specFile}</div>
                <div className="space-y-1">
                  {tests.map((t, i) => (
                    <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                      t.status === 'failed' ? 'bg-red-50' : t.status === 'flaky' ? 'bg-yellow-50' : ''
                    }`}>
                      <StatusPill status={t.status} />
                      <span className="flex-1 text-gray-800 truncate">{t.title}</span>
                      <span className="text-xs text-gray-400 hidden sm:inline">{t.browser}</span>
                      <span className="text-xs text-gray-400 w-14 text-right">{formatDuration(t.durationMs)}</span>
                    </div>
                  ))}
                  {tests.filter(t => t.status === 'failed' && t.error).map((t, i) => (
                    <div key={`err-${i}`} className="ml-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 font-mono whitespace-pre-wrap">
                      {t.error}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === RUN HISTORY === */}
      {runHistory.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Run History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Pass Rate</th>
                  <th className="pb-2 font-medium">Tests</th>
                  <th className="pb-2 font-medium text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {runHistory.map((run) => {
                  const d = run.completedAt?.toDate?.() ? run.completedAt.toDate() : new Date(run.completedAt)
                  return (
                    <tr key={run.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 text-gray-600">
                        {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2"><StatusPill status={run.status} /></td>
                      <td className="py-2 w-40"><PassRateBar rate={run.passRate} /></td>
                      <td className="py-2 text-gray-600">
                        <span className="text-green-700">{run.passed}</span>
                        {run.failed > 0 && <> / <span className="text-red-700">{run.failed}</span></>}
                        {' / '}{run.totalTests}
                      </td>
                      <td className="py-2 text-gray-400 text-right">{formatDuration(run.durationMs)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
