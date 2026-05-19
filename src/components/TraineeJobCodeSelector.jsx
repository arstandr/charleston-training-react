import { useState, useEffect } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../firebase'

export default function TraineeJobCodeSelector({ onJobCodeSelected }) {
  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState([])
  const [selectedJob, setSelectedJob] = useState(null)
  const [currentJobCode, setCurrentJobCode] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  async function loadJobCodes() {
    setLoading(true)
    setError(null)
    try {
      const functions = getFunctions(app)
      const fetchJobCodes = httpsCallable(functions, 'fetchToastJobCodes')
      const result = await fetchJobCodes()
      const data = result.data

      if (data && data.success) {
        setJobs(data.jobs || [])
        setCurrentJobCode(data.currentTraineeJobCode || null)
      } else {
        setError('Failed to fetch job codes from Toast')
      }
    } catch (err) {
      console.error('Error fetching job codes:', err)
      setError(err.message || err.code || 'Failed to load job codes')
    } finally {
      setLoading(false)
    }
  }

  async function saveJobCode() {
    if (!selectedJob) return

    const jobCode = selectedJob.title
    const jobGuid = typeof selectedJob.guid === 'string' ? selectedJob.guid.trim() : String(selectedJob.guid)
    console.log('TraineeJobCodeSelector: saving job code', { jobCode, jobGuid })

    setSaving(true)
    setError(null)
    try {
      const functions = getFunctions(app)
      const saveFn = httpsCallable(functions, 'saveTraineeJobCode')
      const result = await saveFn({
        jobCode,
        jobGuid
      })

      console.log('TraineeJobCodeSelector: save result', result?.data)

      if (result.data && result.data.success) {
        setCurrentJobCode(selectedJob.title)
        setError(null)
        onJobCodeSelected?.()
        alert(`✅ Trainee job code set to "${selectedJob.title}"!\n\nGUID: ${jobGuid}\n\nFuture syncs will use this job code.`)
      } else {
        setError('Failed to save job code')
      }
    } catch (err) {
      console.error('Error saving job code:', err)
      setError(err.message || err.code || 'Failed to save job code')
    } finally {
      setSaving(false)
    }
  }

  const filteredJobs = jobs.filter((job) =>
    job.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Trainee Job Code Selector
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Select which Toast job code represents &quot;Server Trainee&quot;
          </p>
        </div>
        <button
          type="button"
          onClick={loadJobCodes}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Loading…
            </span>
          ) : (
            '🔄 Load Job Codes'
          )}
        </button>
      </div>

      {currentJobCode && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <p className="text-sm font-semibold text-green-800 dark:text-green-200">
            ✅ Current Trainee Job Code: <span className="font-bold">{currentJobCode}</span>
          </p>
          <p className="mt-1 text-xs text-green-700 dark:text-green-300">
            All syncs will filter employees by this job code
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="🔍 Search job codes… (e.g. trainee, server)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
          <p className="text-gray-600 dark:text-gray-400">Fetching job codes from Toast POS…</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 py-12 text-center dark:border-gray-600">
          <p className="mb-4 text-gray-600 dark:text-gray-400">No job codes loaded yet</p>
          <button
            type="button"
            onClick={loadJobCodes}
            className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Load Job Codes from Toast
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Found {filteredJobs.length} job code{filteredJobs.length !== 1 ? 's' : ''} from Toast
            {searchTerm && ` matching "${searchTerm}"`}
          </div>

          <div className="grid max-h-[500px] grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2 lg:grid-cols-3">
            {filteredJobs.map((job) => (
              <button
                key={job.guid}
                type="button"
                onClick={() => setSelectedJob(job)}
                className={`rounded-lg border-2 p-4 text-left transition-all ${
                  selectedJob?.guid === job.guid
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 dark:text-white">{job.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{job.fromStore}</p>
                  </div>
                  {selectedJob?.guid === job.guid && (
                    <span className="text-2xl text-blue-600">✓</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    {job.employeeCount} employee{job.employeeCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {selectedJob && (
            <div className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-700">
              <div className="mb-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                <p className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-100">
                  You selected: <span className="font-bold">{selectedJob.title}</span>
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  This job code has {selectedJob.employeeCount} employee
                  {selectedJob.employeeCount !== 1 ? 's' : ''} assigned. Future syncs will use this
                  job code to filter trainees.
                </p>
              </div>
              <button
                type="button"
                onClick={saveJobCode}
                disabled={saving}
                className="w-full rounded-lg bg-blue-600 px-6 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving…
                  </span>
                ) : (
                  `✅ Set "${selectedJob.title}" as Trainee Job Code`
                )}
              </button>
            </div>
          )}
        </>
      )}

      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/50">
        <p className="mb-2 text-sm font-bold text-gray-900 dark:text-white">💡 How this works:</p>
        <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>• Click &quot;Load Job Codes&quot; to fetch all jobs from Toast POS</li>
          <li>• Job codes are sorted by number of employees (most used first)</li>
          <li>• Click the job code that represents &quot;Server Trainee&quot;</li>
          <li>• Save it — future syncs will only import employees with this job code</li>
          <li>• You can change it anytime by selecting a different job code</li>
        </ul>
      </div>
    </div>
  )
}
