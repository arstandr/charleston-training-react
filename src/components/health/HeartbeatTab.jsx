import { useState } from 'react'
import { getTimeAgo, StatCard } from './healthHelpers'

export default function HeartbeatTab({
  activeSessions,
  health,
  todayStats,
  liveErrors,
  featureHealth,
  isAdmin,
  clearFeedLoading,
  handleClearErrorFeed,
  trainees,
  trainers,
  shiftsThisWeek,
  testCompletionPct,
  hsScrapeLog,
}) {
  const [hsExpanded, setHsExpanded] = useState(false)
  const [hsScraping, setHsScraping] = useState(false)
  const [hsProgress, setHsProgress] = useState(0)
  const [hsResult, setHsResult] = useState(null)

  // Determine HS status from scrape log
  const hsLastTime = hsScrapeLog?.scrapedAt ? new Date(hsScrapeLog.scrapedAt) : null
  const hsAgeHours = hsLastTime ? (Date.now() - hsLastTime.getTime()) / (1000 * 60 * 60) : Infinity
  const hsAllOk = hsScrapeLog?.results?.every(r => r.errors?.length === 0) ?? false
  const hsStatus = !hsScrapeLog ? 'warning' : hsAllOk && hsAgeHours < 26 ? 'healthy' : hsAgeHours > 48 ? 'critical' : 'warning'
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
      // Fire the scrape request — it writes a "running" doc to Firestore immediately,
      // then runs for ~2 min and updates to "completed". We watch Firestore, not the HTTP response.
      const { getFirestore, collection: fsCollection, query: fsQuery, orderBy, limit: fsLimit, onSnapshot } = await import('firebase/firestore')
      const db = getFirestore()

      // Fire and forget — don't await the long HTTP response
      fetch('https://scrapehotschedules-qibven2evq-uc.a.run.app', { method: 'POST', mode: 'cors' }).catch(() => {})

      // Watch the latest scrape log doc — no composite index needed
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
      clearInterval(progressInterval)
      setHsResult({ success: false, error: e.message || 'Network error' })
      setHsExpanded(true)
    } finally {
      setHsScraping(false)
      setTimeout(() => setHsProgress(0), 2000)
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">System Heartbeat</h1>
      <p className="text-gray-500 mb-6">Real-time monitoring for Charleston Training</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Feature Health</h2>
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

        </div>
      </div>

      {/* ── HotSchedules Sync — dedicated section ─────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <h2 className="text-xl font-bold text-gray-900">HotSchedules Sync</h2>
              <p className="text-sm text-gray-500">Automated login scrape — runs daily at 7 AM ET</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
              hsStatus === 'healthy' ? 'bg-green-100 text-green-700' :
              hsStatus === 'warning' ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                hsStatus === 'healthy' ? 'bg-green-500' : hsStatus === 'warning' ? 'bg-amber-500' : 'bg-red-500'
              }`} />
              {hsStatus === 'healthy' ? 'Healthy' : hsStatus === 'warning' ? 'Warning' : 'Error'}
            </span>
            {isAdmin && (
              <button
                onClick={handleHsScrapeNow}
                disabled={hsScraping}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {hsScraping ? '🔄 Scraping...' : '▶ Run Now'}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <div className="text-gray-500 text-xs mb-1">Last Run</div>
            <div className="font-semibold text-gray-900">{hsLastTime ? getTimeAgo(hsLastTime) : 'Never'}</div>
            {hsLastTime && <div className="text-xs text-gray-400">{hsLastTime.toLocaleString()}</div>}
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <div className="text-gray-500 text-xs mb-1">Trainers Matched</div>
            <div className="font-semibold text-gray-900">{hsTotalMatched}/{hsTotalTrainers}</div>
            <div className="text-xs text-gray-400">across all stores</div>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <div className="text-gray-500 text-xs mb-1">Schedule</div>
            <div className="font-semibold text-gray-900">Daily 7am ET</div>
            <div className="text-xs text-gray-400">{hsScrapeLog?.trigger === 'manual' ? 'Last: manual' : 'Auto scrape'}</div>
          </div>
        </div>

        {/* Progress bar during scrape */}
        {hsScraping && (
          <div className="mb-4">
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${Math.round(hsProgress)}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Scraping HotSchedules... This takes 2–3 minutes. Results will appear below when done.
            </div>
          </div>
        )}

        {/* Manual run result */}
        {hsResult && !hsScraping && (
          <div className={`mb-4 p-3 rounded-lg border text-sm ${hsResult.success !== false ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="font-medium mb-1">{hsResult.success !== false ? '✅ Scrape completed' : '❌ Scrape failed'}</div>
            {hsResult.results?.map((r) => (
              <div key={r.store} className="text-xs">
                {r.store}: {r.errors?.length === 0
                  ? `${r.employeesFound} employees, ${r.trainersMatched}/${r.trainersTotal} trainers matched`
                  : r.errors?.join(', ')}
              </div>
            ))}
            {hsResult.error && <div className="text-xs text-red-700">{hsResult.error}</div>}
          </div>
        )}

        {/* Per-store breakdown */}
        {hsScrapeLog?.results?.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {hsScrapeLog.results.map((r) => {
              const ok = r.errors?.length === 0
              return (
                <div key={r.store} className={`rounded-lg border p-3 ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-semibold text-sm text-gray-900">{r.store}</span>
                    {r.skipped && <span className="text-xs text-gray-500">skipped (circuit breaker)</span>}
                  </div>
                  {ok ? (
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <div>{r.employeesFound} employees found in schedule</div>
                      <div>Trainers: <span className="font-medium text-green-700">{r.trainersMatched}/{r.trainersTotal} matched</span></div>
                      {r.traineesMatched > 0 && <div>Trainees: {r.traineesMatched}/{r.traineesTotal} matched</div>}
                      {r.unmatchedNames?.length > 0 && (
                        <div className="text-gray-400">Unmatched: {r.unmatchedNames.slice(0, 5).join(', ')}{r.unmatchedNames.length > 5 ? ` +${r.unmatchedNames.length - 5} more` : ''}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-red-700 space-y-0.5">
                      {r.errors?.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!hsScrapeLog && !hsScraping && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ⚠️ No scrape history found. The daily 7am scrape hasn&apos;t run yet, or click <strong>Run Now</strong> to trigger it manually.
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Live Error Feed</h2>
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Trainees" value={String(trainees.length)} icon="🎓" />
            <StatCard label="Active Trainers" value={String(trainers)} icon="👥" />
            <StatCard label="Shifts This Week" value={String(shiftsThisWeek)} icon="📅" />
            <StatCard label="Cert Progress (avg)" value={testCompletionPct + '%'} icon="✅" />
          </div>
        </div>
    </>
  )
}
