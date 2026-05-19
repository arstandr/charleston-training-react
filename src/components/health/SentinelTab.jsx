/**
 * SentinelTab.jsx — Sentinel command view. The operational brain AND heartbeat of the training site.
 * Combines: system health scorecard, live findings, recent runs, active sessions,
 * feature health grid, live error feed, and quick stats.
 */
import { useState, useEffect } from 'react'
import { getTimeAgo, StatCard } from './healthHelpers'
import {
  subscribeToFindings,
  subscribeToSystemHealth,
  getRecentRuns,
  getRecentHealingActions,
  acknowledgeFinding,
  resolveFinding,
  getSentinelProfilesBatch,
} from '../../services/sentinelService'
import { getDocs, query, collection, orderBy, limit, where } from 'firebase/firestore'
import { db } from '../../firebase'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return '—'
  const ms = ts?.toMillis ? ts.toMillis() : (ts?.toDate ? ts.toDate().getTime() : new Date(ts).getTime())
  const diff = Date.now() - ms
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const CATEGORY_LABELS = {
  test_integrity: 'Test Integrity',
  content_health: 'Content Health',
  system_health: 'System Health',
  system_sync: 'Sync',
  trainee_progress: 'Trainee Progress',
  trainer_engagement: 'Trainer',
  learning_intelligence: 'Learning',
}

const CATEGORY_COLORS = {
  test_integrity: 'bg-purple-100 text-purple-800',
  content_health: 'bg-blue-100 text-blue-800',
  system_health: 'bg-orange-100 text-orange-800',
  system_sync: 'bg-cyan-100 text-cyan-800',
  trainee_progress: 'bg-indigo-100 text-indigo-800',
  trainer_engagement: 'bg-teal-100 text-teal-800',
  learning_intelligence: 'bg-violet-100 text-violet-800',
}

// ─── System Health Dot ────────────────────────────────────────────────────────

function SystemDot({ label, system, health }) {
  const doc = health[system]
  const status = doc?.status ?? 'unknown'
  const lastActivity = doc?.lastActivity
  const dot = status === 'healthy' ? 'bg-green-500'
    : status === 'info'    ? 'bg-blue-400'
    : status === 'degraded'? 'bg-amber-500'
    : status === 'down'    ? 'bg-red-500 animate-pulse'
    : 'bg-gray-300'
  const ring = status === 'down' ? 'ring-2 ring-red-300' : ''

  return (
    <div className="flex flex-col items-center gap-1 min-w-[70px]">
      <div className={`w-3 h-3 rounded-full ${dot} ${ring}`} />
      <span className="text-xs font-medium text-gray-700 text-center leading-tight">{label}</span>
      {lastActivity && (
        <span className="text-[10px] text-gray-400">{timeAgo(lastActivity)}</span>
      )}
    </div>
  )
}

// ─── Finding Card ─────────────────────────────────────────────────────────────

function FindingCard({ finding, currentUser, onAcknowledge, onResolve }) {
  const [ackLoading, setAckLoading] = useState(false)
  const [resolveLoading, setResolveLoading] = useState(false)

  const isCritical = finding.severity === 'critical'
  const isWarning  = finding.severity === 'warning'

  const borderColor = isCritical ? 'border-red-300 bg-red-50'
    : isWarning ? 'border-amber-300 bg-amber-50'
    : 'border-blue-200 bg-blue-50'

  const iconEl = isCritical ? '🚨' : isWarning ? '⚠️' : 'ℹ️'
  const badgeColor = isCritical ? 'bg-red-200 text-red-800'
    : isWarning ? 'bg-amber-200 text-amber-800'
    : 'bg-blue-100 text-blue-800'

  async function handleAck() {
    setAckLoading(true)
    try {
      await onAcknowledge(finding.id, currentUser?.name || currentUser?.displayName || 'admin')
    } finally {
      setAckLoading(false)
    }
  }

  async function handleResolve() {
    setResolveLoading(true)
    try {
      await onResolve(finding.id, currentUser?.name || currentUser?.displayName || 'admin')
    } finally {
      setResolveLoading(false)
    }
  }

  return (
    <div className={`rounded-xl border-2 p-4 ${borderColor} transition-all`}>
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5 flex-shrink-0">{iconEl}</span>
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${badgeColor}`}>
              {finding.severity}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[finding.category] || 'bg-gray-100 text-gray-700'}`}>
              {CATEGORY_LABELS[finding.category] || finding.category}
            </span>
            {finding.acknowledged && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                👁 Seen by {finding.acknowledgedBy}
              </span>
            )}
            <span className="text-xs text-gray-400 ml-auto">{timeAgo(finding.detectedAt)}</span>
          </div>

          {/* Title */}
          <p className={`font-semibold text-sm ${isCritical ? 'text-red-900' : isWarning ? 'text-amber-900' : 'text-blue-900'}`}>
            {finding.title}
          </p>

          {/* Detail */}
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{finding.detail}</p>

          {/* Suggested action */}
          {finding.suggestedAction && (
            <p className="text-xs text-gray-500 mt-1.5">
              <span className="font-semibold">→ </span>{finding.suggestedAction}
            </p>
          )}

          {/* Affected entities */}
          {finding.affectedEntities?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {finding.affectedEntities.map((e, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-white border border-gray-200 text-xs text-gray-600">
                  {e.type}: {e.name || e.id}
                </span>
              ))}
            </div>
          )}

          {/* Source */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">
              via {finding.source}
            </span>
            {finding.autoResolvable && (
              <span className="text-[10px] text-gray-400">· auto-resolves when fixed</span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-white/50">
        {!finding.acknowledged && (
          <button
            onClick={handleAck}
            disabled={ackLoading}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {ackLoading ? 'Saving…' : '👁 Acknowledge'}
          </button>
        )}
        <button
          onClick={handleResolve}
          disabled={resolveLoading}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
        >
          {resolveLoading ? 'Saving…' : '✅ Resolve'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function SentinelTab({
  currentUser,
  // Heartbeat props
  activeSessions = [],
  health = {},
  todayStats = { quizzes: 0, chatMessages: 0, shiftsCompleted: 0 },
  liveErrors = [],
  featureHealth = {},
  isAdmin = false,
  clearFeedLoading = false,
  handleClearErrorFeed,
  trainees = [],
  trainers = 0,
  shiftsThisWeek = 0,
  testCompletionPct = 0,
  hsScrapeLog = null,
}) {
  const [findings, setFindings]   = useState([])
  const [sentinelHealth, setSentinelHealth] = useState({})
  const [runs, setRuns]           = useState([])
  const [runsLoading, setRunsLoading] = useState(true)

  // HotSchedules expand/scrape state
  const [hsExpanded, setHsExpanded] = useState(false)
  const [hsScraping, setHsScraping] = useState(false)
  const [hsProgress, setHsProgress] = useState(0)
  const [hsResult, setHsResult]   = useState(null)

  // Intelligence state
  const [atRiskProfiles, setAtRiskProfiles] = useState([])
  const [problemContent, setProblemContent] = useState([])
  const [healingActions, setHealingActions] = useState([])

  useEffect(() => {
    const unsubFindings = subscribeToFindings(setFindings)
    const unsubHealth   = subscribeToSystemHealth(setSentinelHealth)
    return () => { unsubFindings(); unsubHealth() }
  }, [])

  useEffect(() => {
    getRecentRuns(15).then(r => { setRuns(r); setRunsLoading(false) })
  }, [])

  // Load at-risk trainee profiles (red + yellow risk)
  useEffect(() => {
    if (!db) return
    getDocs(query(collection(db, 'sentinelProfiles'), where('riskLevel', 'in', ['red', 'yellow']), orderBy('readinessScore', 'asc'), limit(10)))
      .then(snap => setAtRiskProfiles(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
  }, [])

  // Load high-miss content scores
  useEffect(() => {
    if (!db) return
    getDocs(query(collection(db, 'sentinelContentScores'), orderBy('missRate', 'desc'), limit(8)))
      .then(snap => setProblemContent(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.missRate >= 0.4)))
      .catch(() => {})
  }, [])

  // Load recent auto-heal actions
  useEffect(() => {
    getRecentHealingActions(10).then(setHealingActions).catch(() => {})
  }, [])

  const critical = findings.filter(f => f.severity === 'critical')
  const warning  = findings.filter(f => f.severity === 'warning')
  const info     = findings.filter(f => f.severity === 'info')

  const sentinelDoc    = sentinelHealth['sentinel']
  const sentinelStatus = sentinelDoc?.status ?? 'unknown'
  const lastHeartbeat  = sentinelDoc?.lastActivity

  // HotSchedules helpers
  const hsLastTime    = hsScrapeLog?.scrapedAt ? new Date(hsScrapeLog.scrapedAt) : null
  const hsAgeHours    = hsLastTime ? (Date.now() - hsLastTime.getTime()) / (1000 * 60 * 60) : Infinity
  const hsAllOk       = hsScrapeLog?.results?.every(r => r.errors?.length === 0) ?? false
  const hsStatus      = !hsScrapeLog ? 'warning' : hsAllOk && hsAgeHours < 26 ? 'healthy' : hsAgeHours > 48 ? 'critical' : 'warning'
  const hsTotalMatched = hsScrapeLog?.results?.reduce((sum, r) => sum + (r.trainersMatched || 0), 0) || 0
  const hsTotalTrainers = hsScrapeLog?.results?.reduce((sum, r) => sum + (r.trainersTotal || 0), 0) || 0

  async function handleHsScrapeNow(e) {
    e.stopPropagation()
    if (hsScraping) return
    setHsScraping(true)
    setHsResult(null)
    setHsProgress(10)

    const progressInterval = setInterval(() => {
      setHsProgress(prev => prev >= 85 ? prev : prev + Math.random() * 8)
    }, 3000)

    try {
      const { getFirestore, collection: fsCollection, query: fsQuery, orderBy, limit: fsLimit, onSnapshot } = await import('firebase/firestore')
      const db = getFirestore()

      fetch('https://scrapehotschedules-qibven2evq-uc.a.run.app', { method: 'POST', mode: 'cors' }).catch(() => {})

      const q = fsQuery(
        fsCollection(db, 'hotSchedulesScrapeLog'),
        orderBy('scrapedAt', 'desc'),
        fsLimit(1)
      )

      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => { unsub(); reject(new Error('Scrape timed out after 10 minutes')) }, 600000)
        const unsub = onSnapshot(q, (snap) => {
          if (snap.empty) return
          const data = snap.docs[0].data()
          if (data.status === 'completed') {
            clearTimeout(timeoutId)
            unsub()
            clearInterval(progressInterval)
            setHsProgress(100)
            setHsResult({ success: true, results: data.results })
            setHsExpanded(true)
            resolve()
          } else if (data.status === 'failed') {
            clearTimeout(timeoutId)
            unsub()
            clearInterval(progressInterval)
            setHsResult({ success: false, error: data.error || 'Scrape failed' })
            setHsExpanded(true)
            resolve()
          }
        }, (err) => {
          clearTimeout(timeoutId)
          reject(err)
        })
      })
    } catch (e) {
      setHsResult({ success: false, error: e.message || 'Network error' })
      setHsExpanded(true)
    } finally {
      clearInterval(progressInterval)
      setHsScraping(false)
      setTimeout(() => setHsProgress(0), 2000)
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Sentinel Status Bar ── */}
      <div className={`rounded-xl p-4 flex items-center justify-between ${
        sentinelStatus === 'healthy' ? 'bg-green-50 border border-green-200'
        : sentinelStatus === 'degraded' ? 'bg-amber-50 border border-amber-200'
        : 'bg-gray-50 border border-gray-200'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          <div>
            <p className="font-bold text-gray-900 text-sm">Sentinel — Operational Brain</p>
            <p className="text-xs text-gray-500">
              {lastHeartbeat ? `Last heartbeat ${timeAgo(lastHeartbeat)}` : 'Waiting for first heartbeat…'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${
            sentinelStatus === 'healthy' ? 'text-green-700'
            : sentinelStatus === 'degraded' ? 'text-amber-700'
            : 'text-gray-500'
          }`}>
            {sentinelStatus.toUpperCase()}
          </p>
          <p className="text-xs text-gray-400">{findings.length} open finding{findings.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* ── Live Stats Cards (from Heartbeat) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Active Users</div>
          <div className="text-3xl font-bold text-gray-900">{activeSessions.length}</div>
          <div className="text-xs text-gray-400 mt-1">
            {activeSessions.length > 0
              ? activeSessions.map(s => s.id).join(', ').substring(0, 60)
              : 'No active sessions'}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">API Status</div>
          <div className="flex flex-col gap-1 mt-1">
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${health.firebase?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`} />
              Firebase
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${health.gemini?.status === 'healthy' ? 'bg-green-500' : health.gemini?.status === 'unknown' ? 'bg-gray-400' : 'bg-red-500'}`} />
              Gemini
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${health.toast?.status === 'healthy' ? 'bg-green-500' : health.toast?.status === 'unknown' ? 'bg-gray-400' : 'bg-red-500'}`} />
              Toast POS
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Today&apos;s Activity</div>
          <div className="flex flex-col gap-0.5 mt-1 text-sm">
            <div>🎯 {todayStats.quizzes} quizzes taken</div>
            <div>💬 {todayStats.chatMessages} chat messages</div>
            <div>📋 {todayStats.shiftsCompleted} shifts completed</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Errors</div>
          <div className="flex flex-col gap-0.5 mt-1 text-sm">
            <div className={`font-semibold ${liveErrors.filter(e => Date.now() - (e.timestamp?.toMillis?.() ?? 0) < 60 * 60 * 1000).length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              Last hour: {liveErrors.filter(e => Date.now() - (e.timestamp?.toMillis?.() ?? 0) < 60 * 60 * 1000).length}
            </div>
            <div>Last 24h: {liveErrors.filter(e => Date.now() - (e.timestamp?.toMillis?.() ?? 0) < 24 * 60 * 60 * 1000).length}</div>
          </div>
        </div>
      </div>

      {/* ── System Health Scorecard (Sentinel dots) ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-4">System Health</h3>
        <div className="flex flex-wrap gap-6 justify-start">
          <SystemDot label="Sentinel"     system="sentinel"       health={sentinelHealth} />
          <SystemDot label="Test Locks"   system="testLocks"      health={sentinelHealth} />
          <SystemDot label="Errors"       system="clientErrors"   health={sentinelHealth} />
          <SystemDot label="Flashcards"   system="flashcardFlags" health={sentinelHealth} />
          <SystemDot label="HotSchedules" system="hotSchedules"   health={sentinelHealth} />
        </div>
      </div>

      {/* ── Feature Health Grid (from Heartbeat) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Feature Health</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { key: 'quiz', label: 'Flashcard Quizzes', icon: '🎯' },
            { key: 'chatbot', label: 'Chatbot (Charlie)', icon: '💬' },
            { key: 'schedule', label: 'Training Schedule', icon: '📋' },
            { key: 'flashcards', label: 'Flashcard System', icon: '🗂️' },
            { key: 'login', label: 'Authentication', icon: '🔐' },
            { key: 'sync', label: 'Data Sync', icon: '🔄' },
          ].map(feature => {
            const fh = featureHealth[feature.key] || { status: 'healthy', errors24h: 0, usage24h: 0, lastUsed: null }
            return (
              <div key={feature.key} className={`rounded-lg border-2 p-3 ${
                fh.status === 'healthy' ? 'border-green-200 bg-green-50' :
                fh.status === 'warning' ? 'border-amber-200 bg-amber-50' :
                'border-red-200 bg-red-50'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span>{feature.icon}</span>
                  <span className="font-semibold text-sm text-gray-900">{feature.label}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className={`w-2 h-2 rounded-full ${
                    fh.status === 'healthy' ? 'bg-green-500' : fh.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  {fh.errors24h === 0 ? 'No errors' : `${fh.errors24h} error${fh.errors24h !== 1 ? 's' : ''}`} · {fh.usage24h} uses today
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {fh.lastUsed ? `Last: ${getTimeAgo(new Date(fh.lastUsed))}` : 'No recent activity'}
                </div>
              </div>
            )
          })}

          {/* HotSchedules card */}
          <div
            className={`rounded-lg border-2 p-3 cursor-pointer transition-colors ${
              hsExpanded ? 'col-span-full' : ''
            } ${
              hsStatus === 'healthy' ? 'border-green-200 bg-green-50' :
              hsStatus === 'warning' ? 'border-amber-200 bg-amber-50' :
              'border-red-200 bg-red-50'
            }`}
            onClick={() => setHsExpanded(!hsExpanded)}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span>📅</span>
                <span className="font-semibold text-sm text-gray-900">HotSchedules Sync</span>
              </div>
              <span className="text-xs text-gray-400">{hsExpanded ? '▲' : '▼'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className={`w-2 h-2 rounded-full ${
                hsStatus === 'healthy' ? 'bg-green-500' : hsStatus === 'warning' ? 'bg-amber-500' : 'bg-red-500'
              }`} />
              {hsAllOk ? `${hsTotalMatched}/${hsTotalTrainers} trainers synced` : hsScrapeLog ? 'Errors on last run' : 'Never synced'}
              {' · '}Daily 7am ET
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {hsLastTime ? `Last: ${getTimeAgo(hsLastTime)}` : 'No sync history'}
            </div>

            {hsExpanded && (
              <div className="mt-3 pt-3 border-t border-gray-200" onClick={e => e.stopPropagation()}>
                {hsScrapeLog ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="font-medium">Last run:</span>
                      <span>{hsLastTime.toLocaleString()}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                        {hsScrapeLog.trigger}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(hsScrapeLog.results || []).map((r) => {
                        const ok = r.errors?.length === 0
                        return (
                          <div key={r.store} className={`rounded-lg border p-3 ${ok ? 'border-green-300 bg-white' : 'border-red-300 bg-red-50'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
                              <span className="font-semibold text-sm text-gray-900">{r.store}</span>
                            </div>
                            {ok ? (
                              <div className="text-xs text-gray-600 space-y-0.5">
                                <div>{r.employeesFound} employees found</div>
                                <div>Trainers matched: {r.trainersMatched}/{r.trainersTotal}</div>
                                {r.traineesMatched > 0 && <div>Trainees matched: {r.traineesMatched}/{r.traineesTotal}</div>}
                                {r.unmatchedNames?.length > 0 && (
                                  <div className="text-gray-400">{r.unmatchedNames.length} unmatched</div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-red-700">{r.errors?.join(', ')}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">No scrape history found</div>
                )}

                {hsScraping && (
                  <div className="mt-3">
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${Math.round(hsProgress)}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Scraping HotSchedules... This takes about 2 minutes
                    </div>
                  </div>
                )}

                {hsResult && !hsScraping && (
                  <div className={`mt-3 p-3 rounded-lg border text-sm ${hsResult.success !== false ? 'border-green-200 bg-white' : 'border-red-200 bg-red-50'}`}>
                    <div className="font-medium mb-1">{hsResult.success !== false ? 'Scrape completed' : 'Scrape failed'}</div>
                    {hsResult.results?.map((r) => (
                      <div key={r.store} className="text-xs">
                        {r.store}: {r.errors?.length === 0
                          ? `${r.employeesFound} employees, ${r.trainersMatched}/${r.trainersTotal} trainers`
                          : r.errors?.join(', ')}
                      </div>
                    ))}
                    {hsResult.error && <div className="text-xs text-red-700">{hsResult.error}</div>}
                  </div>
                )}

                {isAdmin && (
                  <button
                    onClick={handleHsScrapeNow}
                    disabled={hsScraping}
                    className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {hsScraping ? 'Scraping...' : 'Run Now'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Active Findings ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-bold text-gray-700">Active Findings</h3>
          {findings.length > 0 && (
            <span className="text-xs text-gray-500">
              {critical.length > 0 && <span className="text-red-600 font-semibold">{critical.length} critical</span>}
              {critical.length > 0 && warning.length > 0 && <span className="text-gray-400"> · </span>}
              {warning.length > 0 && <span className="text-amber-600 font-semibold">{warning.length} warning</span>}
              {(critical.length > 0 || warning.length > 0) && info.length > 0 && <span className="text-gray-400"> · </span>}
              {info.length > 0 && <span>{info.length} info</span>}
            </span>
          )}
        </div>

        {findings.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <p className="text-2xl mb-2">✅</p>
            <p className="text-sm font-semibold text-green-800">All clear — no open findings</p>
            <p className="text-xs text-green-600 mt-1">Sentinel is watching. Issues will appear here instantly.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {findings.map(f => (
              <FindingCard
                key={f.id}
                finding={f}
                currentUser={currentUser}
                onAcknowledge={acknowledgeFinding}
                onResolve={resolveFinding}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Intelligence: At-Risk Trainees ── */}
      {atRiskProfiles.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">At-Risk Trainees</h3>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {atRiskProfiles.map(p => {
              const isRed = p.riskLevel === 'red'
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isRed ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{p.traineeName}</p>
                    <p className="text-xs text-gray-400">{p.store}{p.reasons?.[0] ? ` · ${p.reasons[0]}` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${isRed ? 'text-red-600' : 'text-amber-600'}`}>{p.readinessScore}%</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{p.confidence} confidence</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Intelligence: Problem Content ── */}
      {problemContent.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">Problem Questions</h3>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {problemContent.map(s => {
              const isCritical = s.missRate >= 0.6 && s.attempts >= 10
              return (
                <div key={s.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${isCritical ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 leading-snug">{s.questionText?.slice(0, 100)}{s.questionText?.length > 100 ? '…' : ''}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{s.attempts} attempts{s.quizId ? ` · ${s.quizId}` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>{Math.round(s.missRate * 100)}% miss</p>
                    {isCritical && <p className="text-[10px] text-red-500 uppercase tracking-wide">Review now</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Auto-Heal Log ── */}
      {healingActions.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">Sentinel Repairs</h3>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {healingActions.map(action => (
              <div key={action.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`text-base flex-shrink-0 mt-0.5 ${action.success ? 'text-green-500' : 'text-red-400'}`}>
                  {action.success ? '✓' : '✗'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700">{action.strategy?.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">{action.detail}</p>
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">{timeAgo(action.attemptedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Sentinel Runs ── */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-3">Recent Sentinel Runs</h3>
        {runsLoading ? (
          <p className="text-xs text-gray-400">Loading runs…</p>
        ) : runs.length === 0 ? (
          <p className="text-xs text-gray-400">No runs yet. Sentinel runs every 15 minutes once deployed.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {runs.map(run => {
              const startedAt = run.startedAt?.toDate ? run.startedAt.toDate() : (run.startedAt ? new Date(run.startedAt) : null)
              return (
                <div key={run.id} className="flex items-center justify-between px-4 py-3 text-xs">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${run.findingsCreated > 0 ? 'bg-amber-400' : 'bg-green-400'}`} />
                    <span className="font-medium text-gray-700 capitalize">{run.schedule}</span>
                    <span className="text-gray-400">{startedAt ? timeAgo(run.startedAt) : '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500">
                    {run.findingsCreated > 0 && (
                      <span className="text-amber-600 font-semibold">+{run.findingsCreated} finding{run.findingsCreated !== 1 ? 's' : ''}</span>
                    )}
                    {run.durationMs && <span>{run.durationMs}ms</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Live Error Feed (from Heartbeat) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Live Error Feed</h2>
          {isAdmin && (
            <button
              onClick={handleClearErrorFeed}
              disabled={clearFeedLoading || liveErrors.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {clearFeedLoading ? <span className="flex items-center gap-2"><span className="animate-spin">🔄</span> Clearing...</span> : 'Clear Feed'}
            </button>
          )}
        </div>
        {liveErrors.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">✨</div>
            <div>No errors — everything&apos;s running smoothly</div>
          </div>
        ) : (
          (() => {
            const grouped = liveErrors.reduce((acc, err) => {
              const msg = err.message || '—'
              if (!acc[msg]) acc[msg] = { message: msg, items: [], latestTs: 0 }
              const raw = err.timestamp
              const ts = raw?.toMillis?.() ?? (raw?.toDate?.()?.getTime?.()) ?? (raw ? new Date(raw).getTime() : 0) ?? 0
              if (ts > acc[msg].latestTs) acc[msg].latestTs = ts
              acc[msg].items.push(err)
              return acc
            }, {})
            const sorted = Object.values(grouped).sort((a, b) => b.latestTs - a.latestTs)
            return (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sorted.slice(0, 30).map((group, idx) => {
                  const sample = group.items[0]
                  const ts = sample.timestamp?.toDate?.() ?? (sample.timestamp ? new Date(sample.timestamp) : null)
                  const isRecent = ts && (Date.now() - ts.getTime() < 15 * 60 * 1000)
                  return (
                    <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                      isRecent ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'
                    }`}>
                      <div className="text-red-500 mt-0.5">{isRecent ? '🔴' : '⚪'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {sample.feature && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-xs font-mono">{sample.feature}</span>
                          )}
                          {sample.action && (
                            <span className="text-gray-500 text-xs">{sample.action}</span>
                          )}
                          {sample.userName && (
                            <span className="text-xs text-gray-400">— {sample.userName} ({sample.userRole || 'unknown'})</span>
                          )}
                        </div>
                        <div className="font-medium text-gray-900 mt-0.5 truncate">{group.message}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{sample.url || ''}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {group.items.length > 1 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                            ×{group.items.length}
                          </span>
                        )}
                        <div className="text-xs text-gray-400 whitespace-nowrap">
                          {ts ? getTimeAgo(ts) : '—'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()
        )}
      </div>

      {/* ── Quick Stats (from Heartbeat) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Trainees" value={String(trainees.length)} icon="🎓" />
          <StatCard label="Active Trainers" value={String(trainers)} icon="👥" />
          <StatCard label="Shifts This Week" value={String(shiftsThisWeek)} icon="📅" />
          <StatCard label="Cert Progress (avg)" value={testCompletionPct + '%'} icon="✅" />
        </div>
      </div>

    </div>
  )
}
