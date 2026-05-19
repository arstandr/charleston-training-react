import { getTimeAgo, HealthCard } from './healthHelpers'
import TraineeJobCodeSelector from '../TraineeJobCodeSelector'
import TraineeSyncPanel from '../TraineeSyncPanel'

export default function ToastSyncTab({
  health,
  toastSyncStatuses,
  isAdmin,
  toastSyncRunningById,
  handleToastSyncRow,
  setEditMode,
}) {
  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">🍞 Toast</h1>
      <p className="text-gray-500 mb-6">POS sync, trainee sync, and data retention</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <HealthCard
          title="Toast POS"
          icon="🍞"
          status={health.toast.status}
          message={health.toast.message}
          details={[
            { label: 'Client ID', value: health.toast.clientId || 'Not set' },
            {
              label: 'Last Sync',
              value: health.toast.lastSync
                ? new Date(health.toast.lastSync).toLocaleString()
                : 'Never',
            },
            { label: 'Auto Sync', value: health.toast.syncEnabled ? 'Enabled' : 'Midnight daily' },
          ]}
          actions={[{ label: 'Configure', onClick: () => setEditMode('toast') }]}
        />
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">☁️</span>
              <h3 className="text-lg font-bold text-gray-900">Cloud Functions</h3>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">Live ping to critical functions</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">toastAuth</span>
              <span className={health.cloudFunctions?.toastAuth === 'healthy' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                {health.cloudFunctions?.toastAuth === 'healthy' ? '✅ Up' : health.cloudFunctions?.toastAuth === 'error' ? '❌ Down' : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">syncTrainerSchedules</span>
              <span className={health.cloudFunctions?.syncTrainerSchedules === 'healthy' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                {health.cloudFunctions?.syncTrainerSchedules === 'healthy' ? '✅ Up' : health.cloudFunctions?.syncTrainerSchedules === 'error' ? '❌ Down' : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">🔄 Toast Sync Functions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 pr-4">Function</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Last Run</th>
                <th className="pb-2 pr-4">Duration</th>
                <th className="pb-2 pr-4">Details</th>
                <th className="pb-2">Run</th>
              </tr>
            </thead>
            <tbody>
              {toastSyncStatuses.map((fn) => {
                const lastRun = fn.lastRun?.toDate?.() ?? (fn.lastRun ? new Date(fn.lastRun) : null)
                const ageMs = lastRun ? Date.now() - lastRun.getTime() : Infinity
                const isStale = ageMs > 2 * 60 * 60 * 1000
                const fnName = fn.functionName || fn.id
                const isRowRunning = toastSyncRunningById[fnName]
                const isSyncMenus = (fnName || '').toLowerCase().includes('syncmenus') || fnName === 'syncMenus'
                const isSyncSchedules = (fnName || '').toLowerCase().includes('synctrainerschedules')
                const errorDisplay = fn.error
                  ? (isSyncSchedules && fn.error?.includes?.('400') ? 'Request failed with status code 400' : fn.error)
                  : null
                return (
                  <tr key={fnName} className={`border-b last:border-0 ${isStale ? 'bg-amber-50' : ''}`}>
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {fnName}
                      {fn.description && <div className="text-xs text-gray-400">{fn.description}</div>}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        fn.status === 'success' ? 'bg-green-100 text-green-700' :
                        fn.status === 'failed' ? 'bg-red-100 text-red-700' :
                        fn.status === 'running' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {fn.status === 'success' ? '✅' : fn.status === 'failed' ? '❌' : fn.status === 'running' ? '🔄' : '❓'}
                        {fn.status || 'unknown'}
                      </span>
                      {isStale && <span className="ml-2 text-xs text-amber-600">⚠️ stale</span>}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {lastRun ? getTimeAgo(lastRun) : '—'}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {fn.durationMs ? `${(fn.durationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="py-3 pr-4 text-gray-600 text-xs max-w-md">
                      {errorDisplay ? (
                        <span
                          className="text-red-600 cursor-help"
                          title={isSyncMenus ? errorDisplay : undefined}
                        >
                          {isSyncMenus ? errorDisplay : (errorDisplay.length > 60 ? errorDisplay.slice(0, 60) + '…' : errorDisplay)}
                        </span>
                      ) : (fn.details || fn.recordCount ? `${fn.recordCount || ''} records` : '—')}
                    </td>
                    <td className="py-3">
                      {isAdmin && (
                        <button
                          onClick={() => handleToastSyncRow(fn)}
                          disabled={isRowRunning}
                          className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isRowRunning ? <span className="animate-spin">🔄</span> : '▶ Run'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 mb-8" id="trainee-job-codes">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Trainee Sync from Toast</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Set which Toast job code is used for &quot;Server Trainee&quot;, then run a sync to import those employees.
          </p>
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-4">
            👇 To see <strong>all job codes</strong> coming from Toast (for both stores), click <strong>&quot;Load Job Codes&quot;</strong> in the box below. Pick the one that means new hires / Server Trainee and save it.
          </p>
          <TraineeJobCodeSelector onJobCodeSelected={() => {}} />
        </div>

        <div className="mt-8 mb-8">
          <TraineeSyncPanel onSyncComplete={() => {}} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">🗂️ Data Retention</h3>
          <p className="text-sm text-gray-500 mb-3">Automatic cleanup runs daily at 2:15 AM</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-semibold text-gray-700 mb-1">90 days</div>
              <div className="text-gray-500">Sales, Comps, Daily Summaries, Scorecards, Menu Changes</div>
            </div>
            <div>
              <div className="font-semibold text-gray-700 mb-1">30 days</div>
              <div className="text-gray-500">Notifications, Orders, Data Quality, Conflicts</div>
            </div>
            <div>
              <div className="font-semibold text-gray-700 mb-1">14 days</div>
              <div className="text-gray-500">Error Logs, Failed Orders</div>
            </div>
            <div>
              <div className="font-semibold text-gray-700 mb-1">7 days</div>
              <div className="text-gray-500">Toast Events, Sync Jobs, API Cache</div>
            </div>
          </div>
        </div>
    </>
  )
}
