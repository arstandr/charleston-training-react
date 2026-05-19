import { useState, useEffect } from 'react'
import { fetchStudyLog } from '../services/studyLogService'
import { getSessionQuestions } from '../services/quizAttemptsService'

function formatDuration(seconds) {
  if (seconds == null) return null
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (dayStart.getTime() === today.getTime()) return 'Today'
  if (dayStart.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function groupByDate(entries) {
  const groups = []
  let currentLabel = null
  let currentGroup = null
  for (const entry of entries) {
    const label = formatDate(entry.timestamp)
    if (label !== currentLabel) {
      currentLabel = label
      currentGroup = { label, entries: [] }
      groups.push(currentGroup)
    }
    currentGroup.entries.push(entry)
  }
  return groups
}

function QuestionDetail({ questions }) {
  if (!questions || questions.length === 0) return null
  const hasReview = questions.some((a) => a.questionText != null)
  if (!hasReview) {
    return (
      <div className="mt-2 ml-8 text-xs text-gray-400 italic py-2">
        Question detail not available for this session (taken before this feature was enabled).
      </div>
    )
  }

  const sorted = [...questions].sort((a, b) => {
    if (a.correct === b.correct) return 0
    return a.correct ? 1 : -1
  })

  return (
    <div className="mt-2 space-y-3">
      {sorted.map((attempt, idx) => {
        if (!attempt.questionText) return null
        const isCorrect = attempt.correct
        const options = attempt.options || []
        const correctIdx = attempt.correctIndex
        const selectedIdx = attempt.selectedAnswer

        return (
          <div
            key={attempt.id || idx}
            className={`rounded-lg border p-3 ${isCorrect ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}
          >
            <div className="flex items-start gap-2 mb-2">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                {isCorrect ? '\u2713' : '\u2717'}
              </span>
              <p className="text-xs font-medium text-gray-800">{attempt.questionText}</p>
            </div>
            <div className="space-y-1 ml-7">
              {options.map((opt, oi) => {
                const isSelected = oi === selectedIdx
                const isAnswer = oi === correctIdx
                let cls = 'border-gray-200 bg-white text-gray-500'
                if (isAnswer) cls = 'border-green-300 bg-green-50 text-green-800 font-medium'
                if (isSelected && !isCorrect && !isAnswer) cls = 'border-red-300 bg-red-50 text-red-700 line-through'
                if (isSelected && isCorrect) cls = 'border-green-300 bg-green-50 text-green-800 font-medium'
                return (
                  <div key={oi} className={`rounded border px-2 py-1 text-xs ${cls}`}>
                    {isAnswer && <span className="mr-1">{'\u2713'}</span>}
                    {isSelected && !isAnswer && <span className="mr-1">{'\u2717'}</span>}
                    {opt}
                  </div>
                )
              })}
            </div>
            {!isCorrect && attempt.explanation && (
              <div className="mt-2 ml-7 rounded bg-amber-50 border border-amber-200 px-2 py-1.5">
                <p className="text-xs text-amber-900">{attempt.explanation}</p>
              </div>
            )}
            {attempt.isBonus && (
              <div className="mt-1 ml-7">
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">Bonus</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FlashcardEntry({ entry }) {
  const duration = formatDuration(entry.timeSpent)
  const hasResults = entry.gotIt > 0 || entry.needsPractice > 0
  return (
    <div className="flex gap-3 py-2">
      <div className="text-xl mt-0.5" aria-hidden>&#128218;</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-800 text-sm">Flashcard Session</div>
        <div className="text-xs text-gray-500">
          {entry.category || entry.setId || 'Unknown set'}
          {' — '}{entry.cardsViewed} card{entry.cardsViewed !== 1 ? 's' : ''}
          {duration && <> — {duration}</>}
          {!duration && entry.timeSpent == null && <span className="text-gray-400"> — Duration not tracked</span>}
        </div>
        {hasResults && (
          <div className="text-xs mt-0.5">
            <span className="text-green-700">{entry.gotIt} got it</span>
            {' / '}
            <span className="text-amber-700">{entry.needsPractice} needs practice</span>
          </div>
        )}
      </div>
      <div className="text-xs text-gray-400 whitespace-nowrap mt-0.5">{formatTime(entry.timestamp)}</div>
    </div>
  )
}

function QuizEntry({ entry, traineeId }) {
  const [expanded, setExpanded] = useState(false)
  const [questions, setQuestions] = useState(null)
  const [loadingQ, setLoadingQ] = useState(false)

  const duration = formatDuration(entry.timeSpent)
  const isOfficial = entry.mode === 'official'
  const icon = isOfficial ? '\u2705' : '\uD83D\uDCDD'
  const label = isOfficial ? 'Official Test' : 'Practice Test'
  const sessionId = entry.quizSessionId || entry.id?.replace('recon_', '')

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (questions) return
    if (!sessionId || !traineeId) return
    setLoadingQ(true)
    try {
      const data = await getSessionQuestions(traineeId, sessionId)
      setQuestions(data || [])
    } catch {
      setQuestions([])
    } finally {
      setLoadingQ(false)
    }
  }

  return (
    <div className="py-2">
      <div className="flex gap-3 cursor-pointer hover:bg-gray-50 rounded -mx-2 px-2 py-1 transition-colors" onClick={handleToggle}>
        <div className="text-xl mt-0.5" aria-hidden>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-800 text-sm flex items-center gap-1">
            {label}
            <span className="text-xs text-[var(--color-primary)] font-normal ml-1">
              {expanded ? '(hide detail)' : '(view questions)'}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {entry.quizTitle || entry.quizId || 'Unknown quiz'}
            {duration && <> — {duration}</>}
            {!duration && entry.timeSpent == null && entry.source === 'reconstructed' && <span className="text-gray-400"> — Duration not tracked</span>}
          </div>
          <div className="text-xs mt-0.5">
            <span className="text-green-700">{entry.correctCount} correct</span>
            {' / '}
            <span className="text-red-600">{entry.wrongCount} wrong</span>
            {' — '}
            <span className={`font-semibold ${entry.score >= 85 ? 'text-green-700' : entry.score >= 70 ? 'text-amber-700' : 'text-red-600'}`}>
              {entry.score}%
            </span>
            {isOfficial && entry.passed != null && (
              <span className={`ml-2 font-bold ${entry.passed ? 'text-green-700' : 'text-red-600'}`}>
                {entry.passed ? 'PASSED' : 'FAILED'}
              </span>
            )}
            {isOfficial && entry.attemptNumber != null && (
              <span className="text-gray-400 ml-1">(attempt #{entry.attemptNumber})</span>
            )}
          </div>
          {entry.source === 'reconstructed' && (
            <div className="text-xs text-gray-400 italic mt-0.5">Reconstructed from question data</div>
          )}
        </div>
        <div className="text-xs text-gray-400 whitespace-nowrap mt-0.5">{formatTime(entry.timestamp)}</div>
      </div>
      {expanded && (
        <div className="ml-8 mt-1">
          {loadingQ && (
            <div className="text-xs text-gray-400 py-2">Loading questions...</div>
          )}
          {!loadingQ && questions != null && (
            <QuestionDetail questions={questions} />
          )}
        </div>
      )}
    </div>
  )
}

function LoginEntry({ entry }) {
  return (
    <div className="flex gap-3 py-2">
      <div className="text-xl mt-0.5" aria-hidden>&#128273;</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-800 text-sm">Login</div>
        <div className="text-xs text-gray-500">{formatTime(entry.timestamp)}</div>
      </div>
      <div className="text-xs text-gray-400 whitespace-nowrap mt-0.5">{formatTime(entry.timestamp)}</div>
    </div>
  )
}

export default function StudyLogModal({ traineeId, traineeName, open, onClose }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !traineeId) return
    let cancelled = false
    setLoading(true)
    setEntries([])
    fetchStudyLog(traineeId)
      .then((data) => { if (!cancelled) setEntries(data || []) })
      .catch(() => { if (!cancelled) setEntries([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, traineeId])

  if (!open) return null

  const groups = groupByDate(entries)

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="study-log-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col"
        style={{
          background: 'rgba(248,250,246,0.97)',
          backdropFilter: 'blur(32px) saturate(200%)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%)',
          borderRadius: 'var(--radius)',
          border: '1px solid rgba(200,210,195,0.5)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          <h2 id="study-log-title" className="text-lg font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Study Log — {traineeName || 'Trainee'}
          </h2>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No study activity recorded yet.
            </div>
          )}

          {!loading && groups.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="text-xs font-bold uppercase tracking-wide mb-1 sticky top-0 py-1 z-[1]" style={{ color: 'var(--text-tertiary)', background: 'rgba(248,250,246,0.97)' }}>
                {group.label}
              </div>
              <div className="divide-y divide-gray-100">
                {group.entries.map((entry) => {
                  if (entry.type === 'flashcard') return <FlashcardEntry key={entry.id} entry={entry} />
                  if (entry.type === 'quiz') return <QuizEntry key={entry.id} entry={entry} traineeId={traineeId} />
                  if (entry.type === 'login') return <LoginEntry key={entry.id} entry={entry} />
                  return null
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
          <button
            type="button"
            className="btn btn-small w-full"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
