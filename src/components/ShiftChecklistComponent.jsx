import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { createChecklistFromTemplate } from '../data/checklistTemplates'
import {
  getChecklistsForTrainee,
  createChecklist,
  toggleChecklistItem,
  updateChecklistNotes,
  requestChecklistSignoff,
  managerSignoffChecklist,
} from '../services/shiftChecklistService'

const ITEMS_PER_PAGE = 4

function ThumbsUpIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 20h2c.55 0 1-.45 1-1v-9c0-.55-.45-1-1-1H2v11zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66a4.8 4.8 0 00-.88-1.12L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83v7.84C7 18.95 8.05 20 9.34 20h8.11c.7 0 1.36-.37 1.72-.97l2.66-6.15z"/>
    </svg>
  )
}

function ThumbsDownIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 4h-2c-.55 0-1 .45-1 1v9c0 .55.45 1 1 1h2V4zM2.17 11.12c-.11.25-.17.52-.17.8V13c0 1.1.9 2 2 2h5.5l-.92 4.65c-.05.22-.02.46.08.66.23.4.53.77.88 1.12L10 22l6.41-6.41c.38-.38.59-.89.59-1.42V6.34C17 5.05 15.95 4 14.66 4h-8.1c-.71 0-1.36.37-1.72.97L2.17 11.12z"/>
    </svg>
  )
}

function ChecklistItemCard({ item, onThumbsUp, onThumbsDown, onNoteChange }) {
  const [showNote, setShowNote] = useState(!!item.notes)
  const answered = item.completed !== undefined && item.completed !== null && item._answered

  return (
    <div
      className={`rounded-xl border-2 p-4 transition-all duration-200 ${
        item.completed && item._answered
          ? 'bg-green-50 border-green-300'
          : item._answered && !item.completed
            ? 'bg-red-50 border-red-300'
            : 'bg-white border-gray-200'
      }`}
    >
      <p className="text-base font-medium text-gray-800 mb-3 leading-relaxed">
        {item.task}
        {item.required && <span className="text-red-600 ml-1">*</span>}
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onThumbsUp}
          className={`flex items-center justify-center min-w-[64px] min-h-[64px] rounded-xl border-2 transition-all duration-200 active:scale-95 ${
            item.completed && item._answered
              ? 'bg-green-500 border-green-500 text-white shadow-lg scale-105'
              : 'bg-white border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-500'
          }`}
        >
          <ThumbsUpIcon className="w-8 h-8" />
        </button>
        <button
          type="button"
          onClick={onThumbsDown}
          className={`flex items-center justify-center min-w-[64px] min-h-[64px] rounded-xl border-2 transition-all duration-200 active:scale-95 ${
            item._answered && !item.completed
              ? 'bg-red-500 border-red-500 text-white shadow-lg scale-105'
              : 'bg-white border-gray-300 text-gray-400 hover:border-red-400 hover:text-red-500'
          }`}
        >
          <ThumbsDownIcon className="w-8 h-8" />
        </button>
        {item.completedAt && (
          <span className="text-xs text-gray-400 ml-auto">
            {new Date(item.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {!showNote && !item.notes ? (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          className="mt-2 text-sm text-blue-600 hover:text-blue-700"
        >
          + Add note
        </button>
      ) : (
        <textarea
          placeholder="Notes (optional)..."
          value={item.notes || ''}
          onChange={(e) => onNoteChange(e.target.value)}
          className="mt-3 w-full text-sm p-3 border border-gray-300 rounded-lg min-h-[44px] resize-none"
          rows={2}
        />
      )}
    </div>
  )
}

function DotIndicator({ totalPages, currentPage }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {Array.from({ length: totalPages }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-200 ${
            i === currentPage
              ? 'w-3 h-3 bg-[var(--color-primary)]'
              : i < currentPage
                ? 'w-2.5 h-2.5 bg-green-400'
                : 'w-2.5 h-2.5 bg-gray-300'
          }`}
        />
      ))}
    </div>
  )
}

export default function ShiftChecklistComponent({ traineeId }) {
  const { currentUser } = useAuth()
  const [checklists, setChecklists] = useState([])
  const [activeChecklist, setActiveChecklist] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageIdx, setPageIdx] = useState(0)

  const loadChecklists = useCallback(async () => {
    if (!traineeId) {
      setChecklists([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const lists = await getChecklistsForTrainee(traineeId)
      setChecklists(lists)
    } catch (error) {
      console.error('Error loading checklists:', error)
      setChecklists([])
    } finally {
      setLoading(false)
    }
  }, [traineeId])

  useEffect(() => {
    loadChecklists()
  }, [loadChecklists])

  const effectiveUserId = currentUser?.uid ?? currentUser?.id ?? currentUser?.traineeId

  async function startNewChecklist(templateId) {
    if (!effectiveUserId || !traineeId) return
    try {
      const checklistData = createChecklistFromTemplate(templateId, effectiveUserId, traineeId)
      if (!checklistData) return
      const created = await createChecklist(checklistData)
      if (!created) return
      // Add _answered tracking to items
      const withTracking = {
        ...created,
        items: created.items.map((item) => ({ ...item, _answered: !!item.completed })),
      }
      setActiveChecklist(withTracking)
      setPageIdx(0)
      await loadChecklists()
    } catch (error) {
      console.error('Error creating checklist:', error)
      alert('Failed to create checklist')
    }
  }

  async function handleThumbsUp(checklistId, itemId) {
    const checklist = checklists.find((c) => c.id === checklistId) || activeChecklist
    if (!checklist) return
    const items = checklist.items.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          completed: true,
          _answered: true,
          completedAt: new Date().toISOString(),
        }
      }
      return item
    })
    try {
      await toggleChecklistItem(checklistId, items.map(({ _answered, ...rest }) => rest))
      if (activeChecklist?.id === checklistId) {
        setActiveChecklist({ ...activeChecklist, items })
      }
      await loadChecklists()
    } catch (error) {
      console.error('Error toggling item:', error)
    }
  }

  async function handleThumbsDown(checklistId, itemId) {
    const checklist = checklists.find((c) => c.id === checklistId) || activeChecklist
    if (!checklist) return
    const items = checklist.items.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          completed: false,
          _answered: true,
          completedAt: null,
        }
      }
      return item
    })
    try {
      await toggleChecklistItem(checklistId, items.map(({ _answered, ...rest }) => rest))
      if (activeChecklist?.id === checklistId) {
        setActiveChecklist({ ...activeChecklist, items })
      }
      await loadChecklists()
    } catch (error) {
      console.error('Error toggling item:', error)
    }
  }

  async function addNote(checklistId, itemId, note) {
    const checklist = checklists.find((c) => c.id === checklistId) || activeChecklist
    if (!checklist) return
    const items = checklist.items.map((item) =>
      item.id === itemId ? { ...item, notes: note } : item
    )
    try {
      await updateChecklistNotes(checklistId, items.map(({ _answered, ...rest }) => rest))
      if (activeChecklist?.id === checklistId) {
        setActiveChecklist({ ...activeChecklist, items })
      }
    } catch (error) {
      console.error('Error adding note:', error)
    }
  }

  async function requestSignoff(checklistId) {
    try {
      await requestChecklistSignoff(checklistId)
      alert('Checklist submitted for manager signoff')
      await loadChecklists()
    } catch (error) {
      console.error('Error requesting signoff:', error)
    }
  }

  async function managerSignoff(checklistId) {
    if (!currentUser || !['manager', 'owner', 'admin'].includes(currentUser.role)) {
      alert('Only managers can sign off on checklists')
      return
    }
    try {
      await managerSignoffChecklist(
        checklistId,
        currentUser.uid || currentUser.id,
        currentUser.name || 'Manager',
      )
      alert('Checklist signed off successfully')
      await loadChecklists()
      setActiveChecklist(null)
    } catch (error) {
      console.error('Error signing off:', error)
    }
  }

  // Auto-advance: when all items on current page are answered, go to next page
  useEffect(() => {
    if (!activeChecklist) return
    const items = activeChecklist.items || []
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE)
    const pageItems = items.slice(pageIdx * ITEMS_PER_PAGE, (pageIdx + 1) * ITEMS_PER_PAGE)
    const allAnswered = pageItems.length > 0 && pageItems.every((item) => item._answered)
    if (allAnswered && pageIdx < totalPages - 1) {
      const timer = setTimeout(() => setPageIdx((p) => p + 1), 500)
      return () => clearTimeout(timer)
    }
  }, [activeChecklist, pageIdx])

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-600">Loading checklists...</div>
    )
  }

  if (activeChecklist) {
    const items = activeChecklist.items || []
    const completedCount = items.filter((i) => i.completed).length
    const totalCount = items.length
    const progress = totalCount ? (completedCount / totalCount) * 100 : 0
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
    const pageItems = items.slice(pageIdx * ITEMS_PER_PAGE, (pageIdx + 1) * ITEMS_PER_PAGE)

    return (
      <div className="p-4 sm:p-6">
        {/* Back button */}
        <button
          type="button"
          onClick={() => { setActiveChecklist(null); setPageIdx(0) }}
          className="text-blue-600 hover:text-blue-800 mb-4 min-h-[44px] text-base"
        >
          &larr; Back to Checklists
        </button>

        {/* Title + progress */}
        <h2 className="text-2xl font-bold mb-2">{activeChecklist.title}</h2>
        <p className="text-gray-600 mb-2">
          {completedCount} of {totalCount} completed ({progress.toFixed(0)}%)
        </p>

        {/* Full-width progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
          <div
            className="bg-green-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Page counter */}
        <p className="text-sm text-gray-500 mb-4 text-center">
          Section {pageIdx + 1} of {totalPages}
        </p>

        {/* Checklist items (current page) */}
        <div className="space-y-4">
          {pageItems.map((item) => (
            <ChecklistItemCard
              key={item.id}
              item={item}
              onThumbsUp={() => handleThumbsUp(activeChecklist.id, item.id)}
              onThumbsDown={() => handleThumbsDown(activeChecklist.id, item.id)}
              onNoteChange={(note) => addNote(activeChecklist.id, item.id, note)}
            />
          ))}
        </div>

        {/* Dot indicators */}
        <DotIndicator totalPages={totalPages} currentPage={pageIdx} />

        {/* Prev / Next navigation */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
            disabled={pageIdx === 0}
            className="flex-1 min-h-[56px] px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base"
          >
            &larr; Prev
          </button>
          <button
            type="button"
            onClick={() => setPageIdx((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageIdx >= totalPages - 1}
            className="flex-1 min-h-[56px] px-6 py-3 bg-[var(--color-primary)] text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base"
          >
            Next &rarr;
          </button>
        </div>

        {/* Signoff buttons */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => requestSignoff(activeChecklist.id)}
            disabled={completedCount < totalCount}
            className="flex-1 min-h-[56px] px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-base"
          >
            Request Manager Signoff
          </button>
          {['manager', 'owner', 'admin'].includes(currentUser?.role) && (
            <button
              type="button"
              onClick={() => managerSignoff(activeChecklist.id)}
              className="min-h-[56px] px-6 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 text-base"
            >
              Manager Sign Off
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-2xl font-bold mb-6">Shift Checklists</h2>
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Start New Checklist</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { id: 'server_opening', label: 'Server Opening', count: 8 },
            { id: 'server_closing', label: 'Server Closing', count: 8 },
            { id: 'bartender_opening', label: 'Bartender Opening', count: 8 },
            { id: 'manager_opening', label: 'Manager Opening', count: 8 },
          ].map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => startNewChecklist(tmpl.id)}
              className="min-h-[56px] p-4 border-2 border-gray-300 rounded-xl hover:border-green-500 hover:bg-green-50 text-left transition-colors"
            >
              <p className="font-semibold text-base">{tmpl.label}</p>
              <p className="text-sm text-gray-600">{tmpl.count} tasks</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Recent Checklists</h3>
        {checklists.length === 0 ? (
          <p className="text-gray-500">No checklists yet. Start one above!</p>
        ) : (
          <div className="space-y-3">
            {checklists.map((checklist) => {
              const completed = checklist.items.filter((i) => i.completed).length
              const total = checklist.items.length
              const pct = total ? (completed / total) * 100 : 0
              return (
                <div
                  key={checklist.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveChecklist({
                      ...checklist,
                      items: checklist.items.map((item) => ({ ...item, _answered: !!item.completed || item.completedAt != null })),
                    })
                    setPageIdx(0)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveChecklist({
                        ...checklist,
                        items: checklist.items.map((item) => ({ ...item, _answered: !!item.completed || item.completedAt != null })),
                      })
                      setPageIdx(0)
                    }
                  }}
                  className="min-h-[56px] border-2 border-gray-300 rounded-xl p-4 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-base">{checklist.title}</p>
                      <p className="text-sm text-gray-600">{checklist.date}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        checklist.status === 'signed-off'
                          ? 'bg-green-100 text-green-800'
                          : checklist.status === 'completed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {checklist.status.replace('-', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600">
                      {completed}/{total}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
