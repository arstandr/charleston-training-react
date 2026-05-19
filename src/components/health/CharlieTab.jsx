import { getTimeAgo } from './healthHelpers'
import { addKnowledgeChunk, getKnowledgeBaseStats } from '../../services/chatbotService'
import { resolveCharlieFeedback as resolveCharlieFeedbackService, deleteKbChunk } from '../../services/systemHealthService'
import AIFileUpload from '../AIFileUpload'

export default function CharlieTab({
  featureHealth,
  kbStats,
  setKbStats,
  adminChatMessages,
  setAdminChatMessages,
  adminChatInput,
  setAdminChatInput,
  adminChatLoading,
  handleAdminChatSend,
  editingMsgIdx,
  setEditingMsgIdx,
  editedResponse,
  setEditedResponse,
  charlieFeedback,
  kbChunks,
  setKbChunks,
  kbLoading,
}) {
  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">💬 Charlie</h1>
      <p className="text-gray-500 mb-6">AI chatbot health, admin chat, feedback queue, and knowledge base</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Uses Today</div>
          <div className="text-2xl font-bold text-gray-900">{featureHealth['chatbot']?.usage24h ?? 0}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Errors (24h)</div>
          <div className="text-2xl font-bold text-gray-900">{featureHealth['chatbot']?.errors24h ?? 0}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Last Active</div>
          <div className="text-2xl font-bold text-gray-900">{featureHealth['chatbot']?.lastUsed ? getTimeAgo(new Date(featureHealth['chatbot'].lastUsed)) : 'Never'}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Knowledge Chunks</div>
          <div className="text-2xl font-bold text-gray-900">{kbStats?.totalChunks ?? 0}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Est. Tokens</div>
          <div className="text-2xl font-bold text-gray-900">{kbStats?.totalTokens ? (kbStats.totalTokens / 1000).toFixed(1) + 'k' : '—'}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Admin Chat</h2>
        <div className="max-h-96 overflow-y-auto mb-4 space-y-3 p-2 bg-gray-50 rounded-lg">
          {adminChatMessages.length === 0 && !adminChatLoading && (
            <p className="text-gray-500 text-sm">No messages yet. Type below to chat with Charlie in admin mode.</p>
          )}
          {adminChatMessages.map((msg, idx) => (
            <div key={idx} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={`max-w-[85%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-gray-200 text-gray-900' : 'bg-white border-l-4 border-green-500'}`}>
                <div className="font-medium">{msg.role === 'user' ? 'You' : 'Charlie'}</div>
                <div className="mt-1">{msg.content}</div>
                {msg.role === 'assistant' && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => { setEditingMsgIdx(idx); setEditedResponse(msg.content) }}
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      ✏️ Edit & Save to KB
                    </button>
                    <button
                      onClick={() => setAdminChatMessages(prev => prev.filter((_, i) => i !== idx && i !== idx - 1))}
                      className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      🗑 Discard
                    </button>
                  </div>
                )}
                {msg.role === 'assistant' && editingMsgIdx === idx && (
                  <div className="mt-2">
                    <textarea
                      value={editedResponse}
                      onChange={(e) => setEditedResponse(e.target.value)}
                      className="w-full text-sm p-2 border rounded"
                      rows={4}
                    />
                    <button
                      onClick={async () => {
                        const q = adminChatMessages[idx - 1]?.content || ''
                        const res = await addKnowledgeChunk(q, editedResponse)
                        if (res?.success) {
                          setEditingMsgIdx(null)
                          setEditedResponse('')
                          const stats = await getKnowledgeBaseStats()
                          setKbStats(stats)
                          alert('Saved to knowledge base ✓')
                        }
                      }}
                      className="mt-1 text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      💾 Save as Knowledge
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {adminChatLoading && (
            <div className="text-gray-500 text-sm">Charlie is thinking...</div>
          )}
        </div>
        <div className="flex gap-2">
          <textarea
            value={adminChatInput}
            onChange={(e) => setAdminChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleAdminChatSend()
              }
            }}
            placeholder="Ask Charlie..."
            className="flex-1 p-3 border rounded-lg text-sm resize-y min-h-[44px]"
            rows={1}
          />
          <button
            onClick={handleAdminChatSend}
            disabled={adminChatLoading || !adminChatInput.trim()}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg font-semibold disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {/* TODO: add thumbs up/down to FloatingChatbot — see Charlie tab spec */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">User Feedback Queue</h2>
        {charlieFeedback.length === 0 ? (
          <p className="text-gray-500">✅ No pending feedback — trainees haven&apos;t flagged any responses yet</p>
        ) : (
          <div className="space-y-4">
            {charlieFeedback.map((fb) => (
              <div key={fb.id} className="p-4 border rounded-lg bg-gray-50">
                <div className="font-medium text-gray-900">{fb.question}</div>
                <div className="text-sm text-gray-600 mt-1 truncate max-w-md">{fb.charlieResponse?.slice(0, 120)}{(fb.charlieResponse?.length || 0) > 120 ? '…' : ''}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {fb.userName} · {fb.createdAt?.toDate?.()?.toLocaleString?.() || '—'}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={async () => {
                      await resolveCharlieFeedbackService(fb.id, 'correct')
                    }}
                    className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded"
                  >
                    ✅ Mark Correct
                  </button>
                  <button
                    onClick={async () => {
                      const fixed = prompt('Enter corrected response:', fb.charlieResponse)
                      if (fixed != null) {
                        await addKnowledgeChunk(fb.question, fixed)
                        await resolveCharlieFeedbackService(fb.id, 'fixed')
                      }
                    }}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                  >
                    ✏️ Fix Response → Save to KB
                  </button>
                  <button
                    onClick={async () => {
                      await resolveCharlieFeedbackService(fb.id, 'dismissed')
                    }}
                    className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded"
                  >
                    🗑 Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Knowledge Base Manager</h2>
        {kbStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{kbStats.totalChunks}</div>
              <div className="text-sm text-gray-600">Total Chunks</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">
                {kbStats.totalTokens ? `${(kbStats.totalTokens / 1000).toFixed(1)}k` : '—'}
              </div>
              <div className="text-sm text-gray-600">Est. Tokens</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{Object.keys(kbStats.bySources || {}).length}</div>
              <div className="text-sm text-gray-600">Sources</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{Object.keys(kbStats.byType || {}).length}</div>
              <div className="text-sm text-gray-600">Categories</div>
            </div>
          </div>
        )}
        <div className="space-y-3 mb-6">
          {kbLoading && <div className="text-gray-500">Loading chunks…</div>}
          {!kbLoading && kbChunks.map((chunk) => (
            <div key={chunk.id} className="p-4 border rounded-lg bg-gray-50">
              <div className="flex gap-2 mb-2">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs">{chunk.source || '—'}</span>
                <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 text-xs">{chunk.type || '—'}</span>
              </div>
              <div className="text-sm text-gray-700">{chunk.content?.slice(0, 200)}{(chunk.content?.length || 0) > 200 ? '…' : ''}</div>
              <div className="text-xs text-gray-400 mt-1">{chunk.createdAt?.toDate?.()?.toLocaleString?.() || '—'}</div>
              <button
                onClick={async () => {
                  await deleteKbChunk(chunk.id)
                  setKbChunks(prev => prev.filter(c => c.id !== chunk.id))
                  alert('Chunk deleted')
                }}
                className="mt-2 text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                🗑 Delete
              </button>
            </div>
          ))}
        </div>
        <div className="mb-6">
          <AIFileUpload />
        </div>
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-bold text-blue-900 mb-2">💡 Knowledge Base Tips</p>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Upload training docs to build the knowledge base automatically</li>
            <li>• The chatbot uses this data to answer staff questions accurately</li>
            <li>• More chunks = smarter responses (but slower searches)</li>
            <li>• Delete old/irrelevant chunks to keep responses focused</li>
          </ul>
        </div>
      </div>
    </>
  )
}
