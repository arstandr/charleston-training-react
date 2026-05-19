/**
 * useSystemHealthData — extracts all data-loading state and effects from SystemHealthPage.
 * Returns data state + setters + loadKbChunks + checkSystemHealth for the page to use.
 */
import { useState, useEffect } from 'react'
import { app, auth } from '../firebase'
import {
  getGeminiConfig, getToastConfig, getRecentClientErrors, subscribeLiveErrors,
  getTodayUsageStats, getFeatureHealthData, getToastSyncStatuses,
  subscribeActiveSessions, subscribeCriticalAlerts, subscribeCharlieFeedback,
  getKbChunks as getKbChunksService,
} from '../services/systemHealthService'
import { getKnowledgeBaseStats } from '../services/chatbotService'
import { authFetch } from '../utils/authFetch'

const FUNCTIONS_BASE = 'https://us-central1-chartrain-20901.cloudfunctions.net'
const KB_PAGE_SIZE = 20

export default function useSystemHealthData(activeTab) {
  const [health, setHealth] = useState({
    gemini: { status: 'unknown', message: '', apiKey: '', rateLimit: '—' },
    toast: { status: 'unknown', message: '', clientId: '', lastSync: null, syncEnabled: false },
    firebase: { status: 'healthy', message: 'Connected', projectId: app?.options?.projectId || '—' },
    cloudFunctions: { toastAuth: 'unknown', syncTrainerSchedules: 'unknown' },
  })
  const [loading, setLoading] = useState(true)
  const [kbStats, setKbStats] = useState(null)
  const [toastSyncStatuses, setToastSyncStatuses] = useState([])
  const [recentErrors, setRecentErrors] = useState([])
  const [activeSessions, setActiveSessions] = useState([])
  const [featureHealth, setFeatureHealth] = useState({})
  const [liveErrors, setLiveErrors] = useState([])
  const [todayStats, setTodayStats] = useState({ quizzes: 0, chatMessages: 0, shiftsCompleted: 0, flashcardsStudied: 0, logins: 0 })
  const [pulseStatus, setPulseStatus] = useState('healthy')
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [criticalAlerts, setCriticalAlerts] = useState([])
  const [charlieFeedback, setCharlieFeedback] = useState([])
  const [kbChunks, setKbChunks] = useState([])
  const [kbLoading, setKbLoading] = useState(false)
  const [hsScrapeLog, setHsScrapeLog] = useState(null)

  // ---------------------------------------------------------------------------
  // checkSystemHealth — reads config docs + runs live connectivity tests
  // ---------------------------------------------------------------------------
  async function checkSystemHealth() {
    setLoading(true)

    // Firebase health: if the user is authenticated, Auth + Firestore are both
    // working (this page is only reachable when logged in). Firestore collection
    // probes on first mount are unreliable because the long-polling connection
    // may not be fully established yet, causing false negatives.
    const firebaseResult = await (async () => {
      try {
        if (auth.currentUser) {
          return { status: 'healthy', message: 'Connected — authenticated' }
        }
        // Auth hasn't resolved yet — wait briefly for it
        const user = await new Promise(resolve => {
          const unsub = auth.onAuthStateChanged(u => { unsub(); resolve(u) })
        })
        if (user) return { status: 'healthy', message: 'Connected — authenticated' }
        return { status: 'warning', message: 'Not signed in' }
      } catch (e) {
        return { status: 'error', message: e?.message || 'Firebase connection failed' }
      }
    })()
    setHealth(prev => ({ ...prev, firebase: { ...prev.firebase, ...firebaseResult, projectId: app?.options?.projectId || '—' } }))

    try {
      const [geminiConfigResult, toastData] = await Promise.all([
        getGeminiConfig(),
        getToastConfig(),
      ])
      const geminiData = geminiConfigResult.geminiKey
      const geminiApiKeyData = geminiConfigResult.geminiApiKey
      const keyFromGemini = geminiData?.key && geminiData.key.length > 20
      const keyFromApiKey = geminiApiKeyData?.key && geminiApiKeyData.key.length > 20
      const hasGeminiKey = !!(keyFromGemini || keyFromApiKey)
      const dataForDisplay = keyFromGemini ? geminiData : geminiApiKeyData
      const hasToastCreds = !!(toastData?.clientId && toastData?.clientSecret)

      setHealth((prev) => ({
        ...prev,
        gemini: {
          status: hasGeminiKey ? 'healthy' : 'warning',
          message: hasGeminiKey ? 'API key configured' : 'No API key configured',
          apiKey: hasGeminiKey ? '••••••••' + (dataForDisplay.key || '').slice(-6) : '',
          rateLimit: dataForDisplay?.rateLimit ?? 'Available',
        },
        toast: {
          status: hasToastCreds ? 'healthy' : 'warning',
          message: hasToastCreds
            ? toastData.syncEnabled
              ? 'Active – syncing hourly'
              : 'Active – nightly sync at midnight'
            : 'Not configured',
          clientId: hasToastCreds ? (toastData.clientId || '').slice(0, 8) + '...' : '',
          lastSync: toastData?.lastSync ?? null,
          syncEnabled: !!toastData?.syncEnabled,
        },
        cloudFunctions: { toastAuth: 'unknown', syncTrainerSchedules: 'unknown' },
      }))

      // Live Gemini test
      let geminiLive = { status: hasGeminiKey ? 'healthy' : 'warning', message: hasGeminiKey ? 'API key configured' : 'No API key configured' }
      if (hasGeminiKey) {
        try {
          const res = await authFetch(`${FUNCTIONS_BASE}/geminiProxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
              model: 'gemini-2.0-flash',
              generationConfig: { maxOutputTokens: 64, temperature: 0 },
            }),
          })
          if (res.ok) geminiLive = { status: 'healthy', message: 'API key configured' }
          else if (res.status === 404) geminiLive = { status: 'error', message: 'Model not found — update model name' }
          else if (res.status === 403) geminiLive = { status: 'error', message: 'Invalid API key' }
          else {
            const data = await res.json().catch(() => ({}))
            geminiLive = { status: 'error', message: data.error || `API ${res.status}` }
          }
        } catch (_) {
          geminiLive = { status: 'error', message: 'Network or request failed' }
        }
      }

      // Live Toast test
      let toastLive = { status: hasToastCreds ? 'healthy' : 'warning', message: hasToastCreds ? 'Active – nightly sync at midnight' : 'Not configured' }
      if (hasToastCreds) {
        try {
          const res = await authFetch(`${FUNCTIONS_BASE}/toastAuth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          })
          const data = await res.json().catch(() => ({}))
          if (res.ok && (data.accessToken || data.success)) toastLive = { status: 'healthy', message: hasToastCreds ? 'Active – nightly sync at midnight' : 'Configured but sync disabled' }
          else if (res.status === 400 || res.status === 401) toastLive = { status: 'error', message: 'Credentials expired' }
          else toastLive = { status: 'error', message: data.error || data.message || `Auth ${res.status}` }
        } catch (_) {
          toastLive = { status: 'error', message: 'Network or request failed' }
        }
      }

      // Cloud Function pings
      const toastAuthPing = await authFetch(`${FUNCTIONS_BASE}/toastAuth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then((r) => (r.ok || r.status === 400 || r.status === 401 ? 'healthy' : 'error'))
        .catch(() => 'error')
      const syncPing = await authFetch(`${FUNCTIONS_BASE}/syncTrainerSchedules`, { method: 'GET' })
        .then((r) => (r.status === 200 || r.status === 400 || r.status === 401 || r.status === 405 ? 'healthy' : 'error'))
        .catch(() => 'error')

      setHealth((prev) => ({
        ...prev,
        // firebase is already set above independently — don't overwrite it here
        gemini: { ...prev.gemini, ...geminiLive },
        toast: { ...prev.toast, ...toastLive },
        cloudFunctions: { toastAuth: toastAuthPing, syncTrainerSchedules: syncPing },
      }))
    } catch (error) {
      // Don't corrupt Firebase status when Gemini/Toast config fails — Firebase has its own check
      console.error('Error checking Gemini/Toast health:', error)
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // loadKbChunks
  // ---------------------------------------------------------------------------
  async function loadKbChunks() {
    setKbLoading(true)
    try {
      setKbChunks(await getKbChunksService(KB_PAGE_SIZE))
    } catch (e) {
      console.warn('KB load failed', e)
    } finally {
      setKbLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => { checkSystemHealth() }, [])

  useEffect(() => {
    let cancelled = false
    async function loadRecentErrors() {
      try {
        const raw = await getRecentClientErrors(20)
        if (cancelled) return
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000
        const list = raw
          .map((d) => {
            const ts = d.timestamp?.toDate?.() || d.timestamp
            const date = ts ? new Date(ts) : null
            return { id: d.id, message: d.message || '—', url: d.url || '—', timestamp: date }
          })
          .filter((e) => e.timestamp && e.timestamp.getTime() >= twentyFourHoursAgo)
        setRecentErrors(list)
      } catch (e) {
        if (!cancelled) setRecentErrors([])
      }
    }
    loadRecentErrors()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    async function loadKbStats() {
      const stats = await getKnowledgeBaseStats()
      setKbStats(stats)
    }
    loadKbStats()
  }, [])

  useEffect(() => {
    async function loadSyncStatuses() {
      try {
        const statuses = await getToastSyncStatuses()
        statuses.sort((a, b) => (a.functionName || '').localeCompare(b.functionName || ''))
        setToastSyncStatuses(statuses)
      } catch (e) {
        console.warn('Failed to load sync statuses', e)
      }
    }
    loadSyncStatuses()
    const interval = setInterval(loadSyncStatuses, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeActiveSessions((sessions) => {
      setActiveSessions(sessions.filter(s => {
        const hb = s.lastHeartbeat?.toMillis?.() ?? s.lastHeartbeat ?? 0
        return Date.now() - hb < 2 * 60 * 1000
      }))
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeLiveErrors((errors) => setLiveErrors(errors))
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    async function loadTodayStats() {
      try {
        const usage = await getTodayUsageStats()
        setTodayStats({
          quizzes: usage.filter(u => u.feature === 'quiz').length,
          chatMessages: usage.filter(u => u.feature === 'chatbot').length,
          shiftsCompleted: usage.filter(u => u.feature === 'shift-complete').length,
          flashcardsStudied: usage.filter(u => u.feature === 'flashcard').length,
          logins: usage.filter(u => u.feature === 'login').length,
        })
      } catch (e) {
        console.warn('Failed to load today stats:', e)
      }
    }
    loadTodayStats()
    const interval = setInterval(loadTodayStats, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    async function loadFeatureHealth() {
      try {
        const { errors, usage } = await getFeatureHealthData()
        const features = ['quiz', 'chatbot', 'schedule', 'flashcards', 'login', 'sync', 'general']
        const healthObj = {}
        features.forEach(f => {
          const featureErrors = errors.filter(e => e.feature === f)
          const featureUsage = usage.filter(u => u.feature === f)
          const lastUsed = featureUsage.length > 0
            ? featureUsage.reduce((latest, u) => {
                const t = u.timestamp?.toMillis?.() ?? u.timestamp ?? 0
                return t > latest ? t : latest
              }, 0)
            : null
          healthObj[f] = {
            errors24h: featureErrors.length,
            usage24h: featureUsage.length,
            lastUsed,
            status: featureErrors.length === 0 ? 'healthy' : featureErrors.length <= 2 ? 'warning' : 'critical',
            recentErrors: featureErrors.slice(0, 3),
          }
        })
        setFeatureHealth(healthObj)
      } catch (e) {
        console.warn('Failed to load feature health:', e)
      }
    }
    loadFeatureHealth()
    const interval = setInterval(loadFeatureHealth, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeCriticalAlerts((alerts) => setCriticalAlerts(alerts))
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeCharlieFeedback((feedback) => setCharlieFeedback(feedback))
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (activeTab === 'charlie') {
      loadKbChunks()
    }
  }, [activeTab])

  // HotSchedules scrape log
  useEffect(() => {
    async function loadHsScrapeLog() {
      try {
        const { getFirestore, collection, query, orderBy, limit, getDocs } = await import('firebase/firestore')
        const db = getFirestore(app)
        const q = query(collection(db, 'hotSchedulesScrapeLog'), orderBy('scrapedAt', 'desc'), limit(1))
        const snap = await getDocs(q)
        if (!snap.empty) setHsScrapeLog({ id: snap.docs[0].id, ...snap.docs[0].data() })
      } catch (e) {
        console.warn('Failed to load HS scrape log:', e)
      }
    }
    loadHsScrapeLog()
  }, [])

  // Determine overall system pulse
  useEffect(() => {
    const hasCriticalAlerts = criticalAlerts.some(a => a.severity === 'critical')
    const hasWarningAlerts = criticalAlerts.some(a => a.severity === 'warning')
    const hasRecentErrors = liveErrors.some(e => {
      const t = e.timestamp?.toMillis?.() ?? e.timestamp ?? 0
      return Date.now() - t < 15 * 60 * 1000
    })
    const apiDown = health.gemini?.status === 'error' || health.toast?.status === 'error'

    if (hasCriticalAlerts || apiDown) setPulseStatus('critical')
    else if (hasWarningAlerts || hasRecentErrors) setPulseStatus('warning')
    else setPulseStatus('healthy')
    setLastRefresh(new Date())
  }, [liveErrors, health, criticalAlerts])

  return {
    health, loading, kbStats, setKbStats, toastSyncStatuses,
    recentErrors, setRecentErrors, activeSessions, featureHealth,
    liveErrors, setLiveErrors, todayStats, pulseStatus, lastRefresh,
    criticalAlerts, charlieFeedback, kbChunks, setKbChunks,
    kbLoading, checkSystemHealth, loadKbChunks, KB_PAGE_SIZE,
    hsScrapeLog,
  }
}
