import { useState, useEffect } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../firebase'
import { getFromFirestore } from '../utils/firestore'

export default function TraineeSyncPanel({ onSyncComplete }) {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [error, setError] = useState(null)
  const [currentJobCode, setCurrentJobCode] = useState(null)

  useEffect(() => {
    loadCurrentJobCode()
  }, [])

  async function loadCurrentJobCode() {
    try {
      const [toastCreds, toastDoc] = await Promise.all([
        getFromFirestore('config', 'toastCredentials'),
        getFromFirestore('config', 'toast'),
      ])
      const data = toastCreds || toastDoc || {}
      setCurrentJobCode(data?.traineeJobCode || null)
    } catch (err) {
      console.error('Error loading job code:', err)
    }
  }

  async function handleManualSync() {
    if (syncing) return

    if (!currentJobCode) {
      setError('No trainee job code configured. Set it in the Trainee Job Code Selector above (System Health).')
      return
    }

    setSyncing(true)
    setError(null)
    setSyncResult(null)
    try {
      const functions = getFunctions(app)
      const syncFn = httpsCallable(functions, 'manualTraineeSync')
      const result = await syncFn()
      const data = result?.data || {}
      setSyncResult(data)
      loadCurrentJobCode()
      onSyncComplete?.()
    } catch (err) {
      setError(err?.message || err?.code || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Toast POS Trainee Sync</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Syncs trainees from Toast using the job code you selected above
          </p>
        </div>
        <div className="text-4xl">🔄</div>
      </div>

      {currentJobCode ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
          <p className="text-sm font-semibold text-green-800 dark:text-green-200">
            ✅ Using job code: <span className="font-bold">{currentJobCode}</span>
          </p>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
          <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
            ⚠️ No trainee job code configured
          </p>
          <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
            Use the Trainee Job Code Selector above to set the job code before syncing
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {syncResult && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <p className="text-sm font-semibold text-green-800 dark:text-green-200">
            Last sync: {syncResult.syncedAt ? new Date(syncResult.syncedAt).toLocaleString() : '—'}
          </p>
          <p className="text-sm text-green-700 dark:text-green-300">
            • {syncResult.newTrainees ?? 0} new trainee(s) added
          </p>
          <p className="text-sm text-green-700 dark:text-green-300">
            • {syncResult.updatedTrainees ?? 0} trainee(s) updated
          </p>
          {syncResult.jobCodeUsed && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400">
              Used job code: {syncResult.jobCodeUsed}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleManualSync}
        disabled={syncing || !currentJobCode}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {syncing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Syncing…
          </span>
        ) : !currentJobCode ? (
          'Configure Job Code First'
        ) : (
          'Sync now (manual)'
        )}
      </button>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
        <p className="text-xs text-blue-800 dark:text-blue-200">
          <strong>How it works:</strong> The sync imports Toast employees with the job code
          &quot;{currentJobCode || '(not set)'}&quot; into the training app.
          {!currentJobCode && ' Set the job code in the selector above first.'}
        </p>
      </div>
    </div>
  )
}
