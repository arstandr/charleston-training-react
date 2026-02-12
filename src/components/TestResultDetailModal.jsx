export default function TestResultDetailModal({ open, onClose, attempt }) {
  if (!open) return null
  const { traineeName, testName, score, passed } = attempt || {}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-gray-800">Test result</h3>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-medium text-gray-500">Trainee</dt>
            <dd className="text-gray-800">{traineeName ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Test</dt>
            <dd className="text-gray-800">{testName ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Score</dt>
            <dd className="text-gray-800">{typeof score === 'number' ? score : '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Result</dt>
            <dd>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  passed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {passed ? 'Passed' : 'Not passed'}
              </span>
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-end">
          <button type="button" className="btn btn-small btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
