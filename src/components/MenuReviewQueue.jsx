export default function MenuReviewQueue({
  reviewQueue,
  onKeepCurrentName,
  onRenameToToast,
  onNotAMatch,
  onApplyAllMatches,
  onClose,
}) {
  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800">
          Scan Results ({reviewQueue.length} items)
        </h3>
        <div className="flex gap-2">
          <button type="button" className="btn btn-small" onClick={onApplyAllMatches}>
            ✅ Apply all matches &amp; patch images
          </button>
          <button type="button" className="btn btn-small btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
          🟢 {reviewQueue.filter((q) => q.matchType === 'new').length} New
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
          🟣 {reviewQueue.filter((q) => q.matchType === 'ai').length} AI Matched
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
          🟡 {reviewQueue.filter((q) => q.matchType === 'fuzzy').length} Fuzzy Match
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
          🔴 {reviewQueue.filter((q) => q.matchType === 'exact').length} Exact Match
        </span>
      </div>

      <div className="space-y-2 max-h-[70vh] overflow-auto">
        {reviewQueue.map((entry, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg border ${
              entry.status === 'dismissed'
                ? 'opacity-40 border-gray-200 bg-gray-50'
                : entry.matchType === 'new'
                  ? 'border-green-200 bg-green-50/50'
                  : entry.matchType === 'ai'
                    ? 'border-purple-200 bg-purple-50/50'
                    : entry.matchType === 'fuzzy'
                      ? 'border-yellow-200 bg-yellow-50/50'
                      : 'border-red-200 bg-red-50/50'
            }`}
          >
            <div className="flex items-start gap-3">
              {entry.toastItem.imageUrl ? (
                <img
                  src={entry.toastItem.imageUrl}
                  alt=""
                  className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-400 text-[10px] text-center leading-tight">
                  No image
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-800 text-sm">{entry.toastItem.name}</span>
                  {entry.matchType === 'new' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-200 text-green-900">
                      NEW — NEEDS FLASHCARD
                    </span>
                  )}
                  {entry.matchType === 'exact' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-200 text-red-900">
                      EXACT MATCH
                    </span>
                  )}
                  {entry.matchType === 'fuzzy' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-200 text-yellow-900">
                      ~{entry.matchScore}% MATCH
                    </span>
                  )}
                  {entry.matchType === 'ai' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-200 text-purple-900">
                      🤖 AI MATCH ({entry.aiConfidence})
                    </span>
                  )}
                </div>

                {entry.matchedTo && (
                  <div className="text-xs mt-1.5 p-2 rounded bg-white/70 border border-gray-100">
                    <span className="text-gray-500">Matches → </span>
                    <strong className="text-gray-700">&quot;{entry.matchedTo.name}&quot;</strong>
                    <span className="ml-1 text-gray-400 text-[10px]">
                      ({entry.matchedTo.source === 'flashcard' ? '📚 Flashcard' : entry.matchedTo.source === 'firestore-flashcard' ? '📚 Firestore' : '📋 Menu Studio'})
                    </span>
                    {entry.aiReasoning && (
                      <div className="text-gray-400 text-[10px] mt-0.5 italic">
                        AI: {entry.aiReasoning}
                      </div>
                    )}
                  </div>
                )}

                {entry.matchedTo && entry.status === 'pending' && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button
                      type="button"
                      className="px-2 py-1 text-[11px] font-medium rounded bg-blue-100 text-blue-800 hover:bg-blue-200 transition"
                      onClick={() => onKeepCurrentName(idx)}
                    >
                      ✅ Keep &quot;{entry.matchedTo.name}&quot; {entry.toastItem.imageUrl ? '+ add image' : ''}
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 text-[11px] font-medium rounded bg-orange-100 text-orange-800 hover:bg-orange-200 transition"
                      onClick={() => onRenameToToast(idx)}
                    >
                      ✏️ Rename to &quot;{entry.toastItem.name}&quot; {entry.toastItem.imageUrl ? '+ add image' : ''}
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 text-[11px] font-medium rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                      onClick={() => onNotAMatch(idx)}
                    >
                      ❌ Not a match
                    </button>
                  </div>
                )}

                {entry.status === 'approved' && entry.action === 'kept' && (
                  <div className="mt-2 text-[11px] font-medium text-green-600">
                    ✅ Confirmed — kept as &quot;{entry.matchedTo?.name}&quot; {entry.toastItem.imageUrl ? '(image updated)' : ''}
                  </div>
                )}
                {entry.status === 'approved' && entry.action === 'renamed' && (
                  <div className="mt-2 text-[11px] font-medium text-orange-600">
                    ✏️ Renamed to &quot;{entry.toastItem.name}&quot; {entry.toastItem.imageUrl ? '(image updated)' : ''}
                  </div>
                )}
                {entry.status === 'dismissed' && (
                  <span className="text-[10px] text-gray-400 mt-1 inline-block">Marked as not a match</span>
                )}

                {entry.toastItem.description && (
                  <p className="text-[11px] text-gray-400 mt-1.5 truncate max-w-xl">{entry.toastItem.description}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
