import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { updateFlashcard, batchUpdateFlashcards, upsertFlashcard } from '../services/flashcardService'
import { deleteFlag } from '../services/flashcardFlags'
import { resolveChatbotFlag } from '../services/chatbotFlagsService'
import { autoGenerateQuizForCard, callGemini } from '../services/ai'

const ORPHAN_TEST_TITLES = {
  bar_test: 'Bar & Beer Knowledge',
  wines_test: 'Wine & Cocktail Knowledge',
  soups_test: 'Starters, Soups, Salads & Sandwiches',
  steaks_test: 'Steaks, Specialties, Chicken & Desserts',
  bonus_test: 'Bonus Points',
}

export default function ContentAlertsSection({
  cards,
  setCards,
  alerts,
  setAlerts,
  alertsLoading,
  chatbotFlags,
  message,
  setMessage,
  quizGenProgress,
  editingFlagId,
  setEditingFlagId,
  editingFlagText,
  setEditingFlagText,
  editingFlagNote,
  setEditingFlagNote,
  setEditQueue,
  setEditQueueIndex,
  remainingOrphans,
  orphanCreating,
  handleFixAndRestore,
  handleDismissAlert,
  handleDeleteCardFromAlert,
  handleCreateFromOrphan,
  handleCreateAllOrphans,
  handleDismissOrphan,
}) {
  const { currentUser } = useAuth()
  const [selectedAlertIds, setSelectedAlertIds] = useState(new Set())
  const [regenerating, setRegenerating] = useState(null) // alert.id being regenerated, or 'selected'
  // Track regenerated results: { [alertId]: { newFront, newBack, originalBack } }
  const [regeneratedResults, setRegeneratedResults] = useState({})

  function toggleAlertSelection(alertId) {
    setSelectedAlertIds((prev) => {
      const next = new Set(prev)
      if (next.has(alertId)) next.delete(alertId)
      else next.add(alertId)
      return next
    })
  }

  async function handleRegenerateCard(alert, userNote) {
    // Find the actual card — try cardId first, then match by front text
    const directCard = cards.find((c) => c.id === (alert.cardId || alert.id))
    const frontMatchCard = !directCard && alert.front
      ? cards.find((c) => c.front === alert.front)
      : null
    const card = directCard || frontMatchCard
    const cardId = card?.id || alert.cardId || alert.id
    const front = card?.front || alert.front || ''
    const currentBack = card?.back || alert.back || ''
    if (!front) {
      setMessage('Cannot regenerate — no item name found.')
      setTimeout(() => setMessage(null), 3000)
      return
    }
    setRegenerating(alert.id)
    setMessage(`Regenerating "${front}"...`)
    try {
      const noteSection = userNote ? `\nADDITIONAL NOTES FROM ADMIN: "${userNote}"` : ''
      const prompt = `You are formatting a menu item into a training flashcard for restaurant staff.

MENU ITEM: "${front}"
CURRENT DESCRIPTION: "${currentBack}"
REPORTED ISSUE: "${alert.reason || 'Flagged as inaccurate'}"${noteSection}

Rewrite the flashcard back text. Fix any inaccuracies mentioned in the reported issue.
Use bullet points (•) for each detail. Include ingredients, preparation, sides, portions.
Keep it factual and concise.

Return ONLY valid JSON: { "front": "Item Name", "back": "• detail1\\n• detail2\\n..." }
No markdown, no backticks, no explanation.`

      const raw = await callGemini(prompt, { maxOutputTokens: 800, temperature: 0.2 })
      const cleaned = (typeof raw === 'string' ? raw : '')
        .replace(/```(?:json)?\s*/gi, '')
        .replace(/\s*```/g, '')
        .trim()
      const parsed = JSON.parse(cleaned)
      if (parsed?.front && parsed?.back) {
        const updates = { front: parsed.front, back: parsed.back, status: 'active', updatedAt: new Date().toISOString() }
        try {
          await updateFlashcard(cardId, updates)
        } catch (updateErr) {
          // Card doc may not exist (stale cardId) — upsert instead
          console.warn('[RegenerateCard] updateFlashcard failed, using upsert:', updateErr?.message)
          await upsertFlashcard(cardId, { ...updates, setId: alert.setId || card?.setId || '' })
        }
        setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, ...updates } : c)))
        // Store the regenerated result for preview
        setRegeneratedResults((prev) => ({
          ...prev,
          [alert.id]: { newFront: parsed.front, newBack: parsed.back, originalBack: currentBack },
        }))
        // Auto-generate quiz for the regenerated card
        try {
          const quizData = await autoGenerateQuizForCard(parsed.front, parsed.back)
          if (quizData) {
            try {
              await updateFlashcard(cardId, { quizData, quizApproved: false })
            } catch (_) {
              await upsertFlashcard(cardId, { quizData, quizApproved: false })
            }
            setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, quizData, quizApproved: false } : c)))
          }
        } catch (_) {}
        setMessage(`Regenerated "${parsed.front}" successfully!`)
      } else {
        setMessage('AI regeneration failed — try editing manually.')
      }
    } catch (err) {
      console.error('[RegenerateCard] Error:', err)
      const errMsg = 'Regeneration failed: ' + (err?.message || 'unknown error')
      setMessage(errMsg)
      window.alert(errMsg)
    }
    setRegenerating(null)
    setTimeout(() => setMessage(null), 6000)
  }

  function handleRegenerateCardWithPrompt(alert) {
    const userNote = window.prompt('Anything you want the AI to know? (Leave blank to skip)')
    if (userNote === null) return // user clicked Cancel
    handleRegenerateCard(alert, userNote)
  }

  async function handleRegenerateSelected() {
    const selected = alerts.filter((a) => selectedAlertIds.has(a.id))
    if (selected.length === 0) return
    const userNote = window.prompt('Anything you want the AI to know? (Leave blank to skip)')
    if (userNote === null) return // user clicked Cancel
    setRegenerating('selected')
    let succeeded = 0
    let failed = 0
    for (const alert of selected) {
      setMessage(`Regenerating ${succeeded + failed + 1}/${selected.length}...`)
      try {
        await handleRegenerateCard(alert, userNote)
        succeeded++
      } catch (_) {
        failed++
      }
    }
    setRegenerating(null)
    setMessage(`Regenerated ${succeeded} card${succeeded !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}.`)
    setTimeout(() => setMessage(null), 4000)
  }

  async function handleApproveAndRestore(alert) {
    const cardId = alert.cardId || alert.id
    const card = cards.find((c) => c.id === cardId)
    if (card) {
      await updateFlashcard(cardId, { status: 'active', updatedAt: new Date().toISOString() })
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: 'active' } : c)))
    }
    try {
      await deleteFlag(alert.id)
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
    } catch (_) {}
    setMessage('Card approved and restored!')
    setTimeout(() => setMessage(null), 2000)
  }

  const selectedCount = selectedAlertIds.size

  return (
    <div id="content-alerts" className="mb-6">
      {alertsLoading && (
        <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-sm">Loading content alerts...</div>
      )}
      {!alertsLoading && alerts.length > 0 && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-red-800 flex items-center gap-2">
              ⚠️ Content Alerts ({alerts.length})
            </h3>
            <div className="flex items-center gap-3">
              <p className="text-xs text-red-600">Quarantined cards are hidden from trainees until resolved.</p>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-700 text-white hover:bg-green-800 transition disabled:opacity-50"
                onClick={handleRegenerateSelected}
                disabled={selectedCount === 0 || regenerating === 'selected'}
              >
                {regenerating === 'selected' ? 'Regenerating...' : `Regenerate Selected (${selectedCount})`}
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {alerts.map((alert) => {
              const result = regeneratedResults[alert.id]
              const card = cards.find((c) => c.id === (alert.cardId || alert.id))
              return (
                <div key={alert.id} className="bg-white rounded-lg border border-red-100 p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedAlertIds.has(alert.id)}
                      onChange={() => toggleAlertSelection(alert.id)}
                      className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0 mt-0.5 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        {card?.imageUrl && (
                          <img src={card.imageUrl} alt={alert.front || ''} className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-800">{alert.front || 'Unknown card'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-700">{alert.setId || ''}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-red-200 text-red-800 font-bold">Content Flag</span>
                            {alert.flagType === 'quiz' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold">Quiz Flag</span>
                            )}
                            {result && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-800 font-bold">Regenerated</span>
                            )}
                          </div>
                          {/* Show regenerated content preview */}
                          {result ? (
                            <div className="mt-2">
                              <div className="p-2 rounded bg-green-50 border border-green-200">
                                <p className="text-xs font-semibold text-green-900 mb-1">New Card Content:</p>
                                {result.newBack.split('\n').map((line, i) => (
                                  <p key={i} className="text-sm text-gray-800">{line}</p>
                                ))}
                              </div>
                              <p className="text-xs text-green-600 mt-1 italic">
                                Original: &quot;{result.originalBack}&quot;
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 mt-1 italic">
                              &quot;{(alert.back || '').slice(0, 200)}{(alert.back || '').length > 200 ? '...' : ''}&quot;
                            </p>
                          )}
                        </div>
                      </div>
                      {alert.flagType === 'quiz' && alert.quizQuestion && (
                        <div className="mt-2 p-2 rounded bg-purple-50 border border-purple-100">
                          <p className="text-xs font-semibold text-purple-900 mb-1">Quiz Question:</p>
                          <p className="text-xs text-gray-800 mb-1">{alert.quizQuestion}</p>
                          {Array.isArray(alert.quizOptions) && alert.quizOptions.length > 0 && (
                            <div className="space-y-0.5 mb-1">
                              {alert.quizOptions.map((opt, i) => {
                                const isCorrect = opt === alert.quizCorrectAnswer
                                const isChosen = opt === alert.selectedAnswer
                                let cls = 'text-gray-600'
                                if (isCorrect) cls = 'font-bold text-green-700'
                                else if (isChosen) cls = 'font-bold text-red-600'
                                return (
                                  <p key={i} className={`text-xs ${cls}`}>
                                    {String.fromCharCode(65 + i)}. {opt}
                                    {isCorrect && ' (correct)'}
                                    {isChosen && !isCorrect && ' (trainee chose)'}
                                  </p>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="mt-2 p-2 rounded bg-red-50 border border-red-100">
                        <p className="text-xs text-red-800">
                          <strong>Reporter:</strong> {alert.reportedBy || 'Unknown'}
                        </p>
                        <p className="text-xs text-red-700 mt-0.5">
                          <strong>Issue:</strong> {alert.reason || 'No reason given'}
                        </p>
                        <p className="text-[10px] text-red-400 mt-0.5">
                          {alert.reportedAt ? new Date(alert.reportedAt).toLocaleDateString() : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
                      onClick={() => handleRegenerateCardWithPrompt(alert)}
                      disabled={regenerating === alert.id}
                    >
                      {regenerating === alert.id ? 'Regenerating...' : 'Regenerate Card with AI'}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
                      onClick={() => handleApproveAndRestore(alert)}
                    >
                      Approve & Restore
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 transition"
                      onClick={() => handleFixAndRestore(alert)}
                    >
                      ✏️ Edit Manually
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                      onClick={() => handleDismissAlert(alert)}
                    >
                      Dismiss (Not an error)
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition"
                      onClick={() => handleDeleteCardFromAlert(alert)}
                    >
                      🗑️ Delete card permanently
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {!alertsLoading && alerts.length === 0 && chatbotFlags.filter((f) => !f.resolved).length === 0 && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2">
          {message || '✅ All clear — no reported content issues.'}
        </div>
      )}
      {message && (alertsLoading || alerts.length > 0 || chatbotFlags.filter((f) => !f.resolved).length > 0) && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">{message}</div>
      )}

      {/* Pending Quiz Approval */}
      {(() => {
        const pendingApproval = cards.filter((c) => c.status === 'active' && c.quizApproved === false && c.quizData?.q)
        if (pendingApproval.length === 0) return null
        return (
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-blue-800 flex items-center gap-2">
                📋 Pending Quiz Approval ({pendingApproval.length})
              </h3>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                onClick={async () => {
                  const ids = pendingApproval.map((c) => c.id)
                  await batchUpdateFlashcards(ids, { quizApproved: true, updatedAt: new Date().toISOString() })
                  setCards((prev) => prev.map((c) => ids.includes(c.id) ? { ...c, quizApproved: true } : c))
                  setMessage(`Approved ${ids.length} quiz questions.`)
                  setTimeout(() => setMessage(null), 3000)
                }}
              >
                Approve All ({pendingApproval.length})
              </button>
            </div>
            <p className="text-xs text-blue-600 mb-3">AI-generated quiz questions awaiting review. Approved questions appear in practice and official tests.</p>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {pendingApproval.map((card) => (
                <div key={card.id} className="bg-white rounded-lg border border-blue-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800 text-sm">{card.front || 'Unknown card'}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700">{card.setId || ''}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{(card.back || '').slice(0, 120)}{(card.back || '').length > 120 ? '...' : ''}</p>
                      <div className="mt-2 p-2 rounded bg-gray-50 border border-gray-100">
                        <p className="text-sm font-medium text-gray-800">{card.quizData.q}</p>
                        <div className="mt-1 space-y-0.5">
                          {(card.quizData.opts || []).map((opt, i) => (
                            <p key={i} className={`text-xs ${i === card.quizData.ans ? 'font-bold text-green-700' : 'text-gray-600'}`}>
                              {String.fromCharCode(65 + i)}. {opt} {i === card.quizData.ans ? ' ✓' : ''}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
                      onClick={async () => {
                        await updateFlashcard(card.id, { quizApproved: true, updatedAt: new Date().toISOString() })
                        setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, quizApproved: true } : c))
                        setMessage('Quiz question approved!')
                        setTimeout(() => setMessage(null), 2000)
                      }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                      onClick={() => {
                        setEditQueue([card])
                        setEditQueueIndex(0)
                      }}
                    >
                      Edit & Approve
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition"
                      onClick={async () => {
                        await updateFlashcard(card.id, { quizData: null, quizApproved: false, updatedAt: new Date().toISOString() })
                        setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, quizData: null, quizApproved: false } : c))
                        setMessage('Quiz question rejected — card moved to missing quiz list.')
                        setTimeout(() => setMessage(null), 3000)
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Missing Quiz Questions */}
      {(() => {
        const missingQuiz = cards.filter((c) => c.status === 'active' && c.front && c.back && (!c.quizData || !c.quizData.q))
        const failedFlags = alerts.filter((a) => a.reason === 'quiz_generation_failed')
        if (missingQuiz.length === 0 && failedFlags.length === 0) return null
        return (
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-amber-800 flex items-center gap-2">
                🧪 Missing Quiz Questions ({missingQuiz.length})
              </h3>
            </div>
            <p className="text-xs text-amber-600 mb-3">Active cards without quiz questions. These won't appear in practice or official tests.</p>
            {failedFlags.length > 0 && (
              <div className="mb-3 space-y-2">
                {failedFlags.map((flag) => (
                  <div key={flag.id} className="bg-white rounded-lg border border-red-100 p-3 flex items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-red-700">Generation Failed:</span>
                      <span className="text-xs text-gray-700 ml-1">{flag.front || 'Unknown card'}</span>
                    </div>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs font-medium rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition"
                      onClick={async () => {
                        const card = cards.find((c) => c.id === flag.cardId)
                        if (!card) return
                        setMessage('Retrying quiz generation...')
                        try {
                          const quizData = await autoGenerateQuizForCard(card.front, card.back)
                          if (quizData) {
                            await updateFlashcard(card.id, { quizData, quizApproved: false, updatedAt: new Date().toISOString() })
                            setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, quizData, quizApproved: false } : c))
                            await deleteFlag(flag.id)
                            setAlerts((prev) => prev.filter((a) => a.id !== flag.id))
                            setMessage('Quiz generated — pending approval.')
                          } else {
                            setMessage('Generation failed again.')
                          }
                        } catch (_) {
                          setMessage('Generation failed again.')
                        }
                        setTimeout(() => setMessage(null), 3000)
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ))}
              </div>
            )}
            {missingQuiz.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {missingQuiz.slice(0, 20).map((card) => (
                  <div key={card.id} className="bg-white rounded-lg border border-amber-100 p-3 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-gray-800">{card.front}</span>
                      <span className="text-[10px] ml-1 text-gray-400">{card.setId}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition"
                        onClick={async () => {
                          setMessage('Generating quiz for ' + card.front + '...')
                          try {
                            const quizData = await autoGenerateQuizForCard(card.front, card.back)
                            if (quizData) {
                              await updateFlashcard(card.id, { quizData, quizApproved: false, updatedAt: new Date().toISOString() })
                              setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, quizData, quizApproved: false } : c))
                              setMessage('Quiz generated — pending approval.')
                            } else {
                              setMessage('Generation failed — AI returned empty result.')
                            }
                          } catch (err) {
                            setMessage('Generation failed: ' + (err?.message || 'unknown error'))
                          }
                          setTimeout(() => setMessage(null), 4000)
                        }}
                      >
                        Generate Quiz
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                        onClick={async () => {
                          await updateFlashcard(card.id, { status: 'graveyarded', updatedAt: new Date().toISOString() })
                          setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, status: 'graveyarded' } : c))
                          setMessage('Card archived.')
                          setTimeout(() => setMessage(null), 2000)
                        }}
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                ))}
                {missingQuiz.length > 20 && (
                  <p className="text-xs text-amber-600 text-center">...and {missingQuiz.length - 20} more.</p>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Orphaned Questions */}
      {remainingOrphans.length > 0 && (
        <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-violet-800 flex items-center gap-2">
              📦 Orphaned Questions ({remainingOrphans.length})
            </h3>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
              onClick={handleCreateAllOrphans}
              disabled={quizGenProgress !== null}
            >
              Create All Flashcards ({remainingOrphans.length})
            </button>
          </div>
          <p className="text-xs text-violet-600 mb-3">
            Legacy quiz questions with no matching flashcard. Create a flashcard to reinstate them in quizzes.
          </p>
          {Object.entries(
            remainingOrphans.reduce((groups, o) => {
              const key = o.testId
              if (!groups[key]) groups[key] = { title: ORPHAN_TEST_TITLES[key] || key, items: [] }
              groups[key].items.push(o)
              return groups
            }, {})
          ).map(([testId, group]) => (
            <div key={testId} className="mb-4">
              <h4 className="text-xs font-bold text-violet-700 mb-2 flex items-center gap-2">
                {group.title}
                <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-violet-100 text-violet-600">{testId}</span>
                <span className="text-[10px] font-normal text-violet-500">({group.items.length})</span>
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {group.items.map((orphan) => (
                  <div key={orphan._idx} className="bg-white rounded-lg border border-violet-100 p-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{orphan.q}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{orphan.a}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-violet-50 text-violet-500 mt-1 inline-block">{orphan.setId}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-medium rounded bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-50"
                        onClick={() => handleCreateFromOrphan(orphan)}
                        disabled={orphanCreating === orphan._idx}
                      >
                        {orphanCreating === orphan._idx ? 'Creating...' : 'Create Flashcard'}
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
                        onClick={() => handleDismissOrphan(orphan._idx)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chatbot Flags */}
      {chatbotFlags.filter((f) => !f.resolved).length > 0 && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-amber-800 flex items-center gap-2">
              🚩 Chatbot Flags ({chatbotFlags.filter((f) => !f.resolved).length})
            </h3>
            <p className="text-xs text-amber-600">Trainees flagged these chatbot responses as incorrect or confusing.</p>
          </div>
          <div className="space-y-3">
            {chatbotFlags.filter((f) => !f.resolved).map((flag) => (
              <div key={flag.id} className="bg-white rounded-lg border border-amber-100 p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-800">{flag.traineeName || flag.traineeId || 'Unknown'}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">{flag.flagReason || 'Flagged'}</span>
                    <span className="text-[10px] text-gray-400">
                      {flag.flaggedAt ? new Date(flag.flaggedAt?.toMillis?.() || flag.flaggedAt).toLocaleDateString() : ''}
                    </span>
                  </div>

                  {editingFlagId === flag.id ? (
                    <div className="mt-2 space-y-2">
                      <label className="block text-xs font-semibold text-gray-700">Corrected response:</label>
                      <textarea
                        value={editingFlagText}
                        onChange={(e) => setEditingFlagText(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-y"
                      />
                      <label className="block text-xs font-semibold text-gray-700">Note (optional):</label>
                      <input
                        type="text"
                        value={editingFlagNote}
                        onChange={(e) => setEditingFlagNote(e.target.value)}
                        placeholder="e.g. Updated pricing, fixed ingredient list..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
                          onClick={async (e) => {
                            const btn = e.currentTarget
                            btn.disabled = true
                            btn.textContent = 'Saving...'
                            try {
                              await resolveChatbotFlag(flag.id, currentUser?.name || 'admin', {
                                correctedText: editingFlagText.trim(),
                                resolvedNote: editingFlagNote.trim() || null,
                              })
                              setEditingFlagId(null)
                            } catch (err) {
                              console.error('Resolve chatbot flag error:', err)
                              alert('Failed to save: ' + (err?.message || err))
                              btn.disabled = false
                              btn.textContent = 'Save & Resolve'
                            }
                          }}
                        >
                          Save & Resolve
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                          onClick={() => setEditingFlagId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 mt-1 italic border-l-2 border-amber-200 pl-3">
                      &quot;{(flag.messageText || '').slice(0, 300)}{(flag.messageText || '').length > 300 ? '...' : ''}&quot;
                    </p>
                  )}
                </div>

                {editingFlagId !== flag.id && (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                      onClick={() => {
                        setEditingFlagId(flag.id)
                        setEditingFlagText(flag.messageText || '')
                        setEditingFlagNote('')
                      }}
                    >
                      Edit & Resolve
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                      onClick={async (e) => {
                        const btn = e.currentTarget
                        btn.disabled = true
                        btn.textContent = 'Resolving...'
                        try {
                          await resolveChatbotFlag(flag.id, currentUser?.name || 'admin')
                          setEditingFlagId(null)
                        } catch (err) {
                          console.error('Resolve chatbot flag error:', err)
                          alert('Failed to resolve: ' + (err?.message || err))
                          btn.disabled = false
                          btn.textContent = 'Dismiss'
                        }
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
