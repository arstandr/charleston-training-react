import { useState, useEffect } from 'react'
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit, onSnapshot, Timestamp, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { db, app } from '../firebase'
import FlashcardCleanupModal from '../components/FlashcardCleanupModal'

const FUNCTIONS_BASE = 'https://us-central1-chartrain-20901.cloudfunctions.net'

async function backfillCardCounts() {
  const setsSnap = await getDocs(collection(db, 'flashcardSets'))
  for (const setDoc of setsSnap.docs) {
    const setId = setDoc.id
    const cardsQuery = query(
      collection(db, 'flashcards'),
      where('setId', '==', setId)
    )
    const cardsSnap = await getDocs(cardsQuery)
    const count = cardsSnap.docs.filter((d) => d.data().status !== 'graveyarded').length
    await updateDoc(doc(db, 'flashcardSets', setId), {
      cardCount: count,
      cardCountUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

function FlashcardHealthCard({ reloadTrigger = 0, onRefresh, onToast }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCleanup, setShowCleanup] = useState(false)
  const [backfilling, setBackfilling] = useState(false)

  useEffect(() => {
    async function loadStats() {
      try {
        const snap = await getDocs(collection(db, 'flashcards'))
        const allCards = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        const active = allCards.filter((c) => c.status !== 'graveyarded')
        const frontMap = {}
        const duplicateIds = new Set()
        active.forEach((c) => {
          if (!c.front || !c.front.trim()) return
          const key = c.front.trim().toLowerCase()
          if (frontMap[key]) {
            duplicateIds.add(c.id)
            duplicateIds.add(frontMap[key])
          } else {
            frontMap[key] = c.id
          }
        })
        const missingImages = active.filter((c) => c.front && c.front.trim() && !c.imageUrl)
        const emptyCards = active.filter((c) => !c.front || !c.front.trim())
        const imageOnly = active.filter((c) => c.imageUrl && (!c.front || !c.front.trim()))
        setStats({
          total: active.length,
          duplicates: duplicateIds.size,
          missingImages: missingImages.length,
          emptyCards: emptyCards.length,
          imageOnly: imageOnly.length,
          sets: [...new Set(active.map((c) => c.setId).filter(Boolean))].length,
        })
      } catch (e) {
        console.warn('Flashcard health load failed', e)
        setStats({ total: 0, duplicates: 0, missingImages: 0, emptyCards: 0, imageOnly: 0, sets: 0 })
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [reloadTrigger])

  const isHealthy = stats && stats.duplicates === 0 && stats.emptyCards === 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🃏</span>
          <h3 className="text-lg font-bold text-gray-900">Flashcards</h3>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            isHealthy ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {loading ? '...' : isHealthy ? '✅ HEALTHY' : '⚠️ NEEDS ATTENTION'}
        </span>
      </div>
      {loading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
        </div>
      ) : stats ? (
        <div className="space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Active Cards:</span>
            <span className="font-semibold text-gray-900">
              {stats.total} across {stats.sets} sets
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Duplicates:</span>
            <span className={`font-semibold ${stats.duplicates > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.duplicates > 0 ? `⚠️ ${stats.duplicates} found` : '✅ None'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Missing Images:</span>
            <span className={`font-semibold ${stats.missingImages > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {stats.missingImages > 0 ? `📷 ${stats.missingImages}` : '✅ All set'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Empty Cards:</span>
            <span className={`font-semibold ${stats.emptyCards > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.emptyCards > 0 ? `🗑 ${stats.emptyCards} (need cleanup)` : '✅ None'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Orphan Images:</span>
            <span className={`font-semibold ${stats.imageOnly > 0 ? 'text-blue-600' : 'text-green-600'}`}>
              {stats.imageOnly > 0 ? `📎 ${stats.imageOnly} (can attach)` : '✅ None'}
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
            <button
              type="button"
              onClick={() => setShowCleanup(true)}
              className="w-full px-3 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-semibold"
            >
              Review
            </button>
            <button
              type="button"
              disabled={backfilling}
              onClick={async () => {
                setBackfilling(true)
                try {
                  await backfillCardCounts()
                  onToast?.('Card counts updated!', 'success')
                  onRefresh?.()
                } catch (e) {
                  console.error('Backfill failed:', e)
                  onToast?.('Failed: ' + (e?.message || e), 'error')
                } finally {
                  setBackfilling(false)
                }
              }}
              className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold disabled:opacity-50"
            >
              {backfilling ? 'Updating…' : '🔄 Recalculate Card Counts'}
            </button>
          </div>
        </div>
      ) : null}
      <FlashcardCleanupModal
        isOpen={showCleanup}
        onClose={() => setShowCleanup(false)}
        onActionComplete={onRefresh}
      />
    </div>
  )
}
import { useAuth } from '../contexts/AuthContext'
import { authFetch } from '../utils/authFetch'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import GeminiConfigModal from '../components/GeminiConfigModal'
import { checkGeminiConfigured } from '../services/ai'
import { setToastCredentials } from '../services/toast'
import { getKnowledgeBaseStats, addKnowledgeChunk, queryChatbot } from '../services/chatbotService'
import { useTrainingData } from '../hooks/useTrainingData'
import { useStaffAccounts } from '../hooks/useStaffAccounts'
import { getCertificationProgress } from '../utils/helpers'
import AIFileUpload from '../components/AIFileUpload'
import TraineeJobCodeSelector from '../components/TraineeJobCodeSelector'
import TraineeSyncPanel from '../components/TraineeSyncPanel'
import { resolveCriticalAlert } from '../services/errorLogger'

export default function SystemHealthPage() {
  const { currentUser } = useAuth()
  const { listTrainees, trainingData } = useTrainingData()
  const { staffAccounts } = useStaffAccounts()
  const [health, setHealth] = useState({
    gemini: { status: 'unknown', message: '', apiKey: '', rateLimit: '—' },
    toast: { status: 'unknown', message: '', clientId: '', lastSync: null, syncEnabled: false },
    firebase: { status: 'healthy', message: 'Connected', projectId: app?.options?.projectId || '—' },
    cloudFunctions: { toastAuth: 'unknown', syncTrainerSchedules: 'unknown' },
  })
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(null)
  const [showGeminiConfig, setShowGeminiConfig] = useState(false)
  const [kbStats, setKbStats] = useState(null)
  const [toastSyncStatuses, setToastSyncStatuses] = useState([])
  const [recentErrors, setRecentErrors] = useState([])
  const [flashcardReloadTrigger, setFlashcardReloadTrigger] = useState(0)
  const [activeSessions, setActiveSessions] = useState([])
  const [featureHealth, setFeatureHealth] = useState({})
  const [liveErrors, setLiveErrors] = useState([])
  const [todayStats, setTodayStats] = useState({ quizzes: 0, chatMessages: 0, shiftsCompleted: 0, flashcardsStudied: 0, logins: 0 })
  const [pulseStatus, setPulseStatus] = useState('healthy')
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [criticalAlerts, setCriticalAlerts] = useState([])
  const [newAlertMessage, setNewAlertMessage] = useState('')
  const [newAlertSeverity, setNewAlertSeverity] = useState('critical')
  const [showAddAlert, setShowAddAlert] = useState(false)
  const [syncRunning, setSyncRunning] = useState(false)
  const [lastManualSync, setLastManualSync] = useState(null)
  const [activeTab, setActiveTab] = useState('heartbeat')
  const [clearFeedLoading, setClearFeedLoading] = useState(false)
  const [adminChatMessages, setAdminChatMessages] = useState([])
  const [adminChatInput, setAdminChatInput] = useState('')
  const [adminChatLoading, setAdminChatLoading] = useState(false)
  const [editingMsgIdx, setEditingMsgIdx] = useState(null)
  const [editedResponse, setEditedResponse] = useState('')
  const [charlieFeedback, setCharlieFeedback] = useState([])
  const [kbChunks, setKbChunks] = useState([])
  const [kbLoading, setKbLoading] = useState(false)
  const [kbPage, setKbPage] = useState(0)
  const [toastSyncRunningById, setToastSyncRunningById] = useState({})
  const [hsScrapeLog, setHsScrapeLog] = useState(null)
  const [sysToast, setSysToast] = useState(null)
  // Per-store scrape state: { scraping, progress, result }
  const [hsStoreState, setHsStoreState] = useState({ Castleton: { scraping: false, progress: 0, result: null }, Westfield: { scraping: false, progress: 0, result: null } })

  const KB_PAGE_SIZE = 20

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner'

  useEffect(() => {
    checkSystemHealth()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadRecentErrors() {
      try {
        const q = query(
          collection(db, 'clientErrors'),
          orderBy('timestamp', 'desc'),
          limit(20)
        )
        const snap = await getDocs(q)
        if (cancelled) return
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000
        const list = snap.docs
          .map((d) => {
            const data = d.data()
            const ts = data.timestamp?.toDate?.() || data.timestamp
            const date = ts ? new Date(ts) : null
            return { id: d.id, message: data.message || '—', url: data.url || '—', timestamp: date }
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
    async function loadHsScrapeLog() {
      try {
        const q = query(collection(db, 'hotSchedulesScrapeLog'), orderBy('scrapedAt', 'desc'), limit(1))
        const snap = await getDocs(q)
        if (!snap.empty) setHsScrapeLog({ id: snap.docs[0].id, ...snap.docs[0].data() })
      } catch (e) {
        console.warn('Failed to load HS scrape log:', e)
      }
    }
    loadHsScrapeLog()
  }, [])

  useEffect(() => {
    async function loadSyncStatuses() {
      try {
        const snap = await getDocs(collection(db, 'toastSyncStatus'))
        const statuses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
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

  // Live active sessions count
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'activeSessions'), (snap) => {
      const sessions = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => {
          const hb = s.lastHeartbeat?.toMillis?.() ?? s.lastHeartbeat ?? 0
          return Date.now() - hb < 2 * 60 * 1000
        })
      setActiveSessions(sessions)
    })
    return () => unsubscribe()
  }, [])

  // Real-time error feed
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'clientErrors'), orderBy('timestamp', 'desc'), limit(50)),
      (snap) => {
        const errors = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setLiveErrors(errors)
      }
    )
    return () => unsubscribe()
  }, [])

  // Today's engagement stats
  useEffect(() => {
    async function loadTodayStats() {
      try {
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        const startTimestamp = Timestamp.fromDate(startOfDay)
        const usageSnap = await getDocs(
          query(collection(db, 'featureUsage'), where('timestamp', '>=', startTimestamp))
        )
        const usage = usageSnap.docs.map(d => d.data())
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

  // Feature health: last successful use + error count per feature
  useEffect(() => {
    async function loadFeatureHealth() {
      try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const cutoff = Timestamp.fromDate(twentyFourHoursAgo)
        const errSnap = await getDocs(
          query(collection(db, 'clientErrors'), where('timestamp', '>=', cutoff))
          )
        const errors = errSnap.docs.map(d => d.data())
        const usageSnap = await getDocs(
          query(collection(db, 'featureUsage'), where('timestamp', '>=', cutoff))
        )
        const usage = usageSnap.docs.map(d => d.data())
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

  // Real-time critical alerts
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'criticalAlerts'),
        where('resolved', '==', false),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        setCriticalAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      }
    )
    return () => unsubscribe()
  }, [])

  // Charlie feedback queue (unresolved)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'charlieFeedback'),
        where('resolved', '==', false),
        orderBy('createdAt', 'desc'),
        limit(50)
      ),
      (snap) => setCharlieFeedback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return () => unsubscribe()
  }, [])

  async function loadKbChunks() {
    setKbLoading(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'chatbotKnowledge'), orderBy('createdAt', 'desc'), limit(KB_PAGE_SIZE))
      )
      setKbChunks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.warn('KB load failed', e)
    } finally {
      setKbLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'charlie') {
      loadKbChunks()
    }
  }, [activeTab])

  function scrapeOneStore(storeName) {
    const anyAlreadyScraping = Object.values(hsStoreState).some(s => s.scraping)
    if (hsStoreState[storeName]?.scraping) return

    // Mark this store as scraping
    setHsStoreState(prev => ({ ...prev, [storeName]: { scraping: true, progress: 10, result: null } }))

    const startedAt = new Date().toISOString()

    // Advance progress independently per store
    const progressInterval = setInterval(() => {
      setHsStoreState(prev => {
        const cur = prev[storeName]
        if (!cur.scraping) { clearInterval(progressInterval); return prev }
        return { ...prev, [storeName]: { ...cur, progress: cur.progress >= 85 ? cur.progress : cur.progress + Math.random() * 6 } }
      })
    }, 4000)

    // Fire the request for this store only
    fetch(`https://scrapehotschedules-qibven2evq-uc.a.run.app?store=${storeName}`, { method: 'POST', mode: 'cors' }).catch(() => {})

    // Watch Firestore for this store's completion — poll the 3 most recent docs so we catch new ones
    const q = query(collection(db, 'hotSchedulesScrapeLog'), orderBy('scrapedAt', 'desc'), limit(3))
    const timeoutId = setTimeout(() => {
      unsub()
      clearInterval(progressInterval)
      setHsStoreState(prev => ({ ...prev, [storeName]: { scraping: false, progress: 0, result: { success: false, error: 'Timed out after 20 minutes' } } }))
    }, 1200000) // 20 minutes

    const unsub = onSnapshot(q, (snap) => {
      // Find a doc for this store that started after we kicked off the scrape
      const match = snap.docs.find(d => {
        const data = d.data()
        return data.store === storeName && data.scrapedAt >= startedAt && (data.status === 'completed' || data.status === 'failed')
      })
      if (!match) return
      clearTimeout(timeoutId)
      unsub()
      clearInterval(progressInterval)
      const data = match.data()
      const storeResult = data.results?.[0] || data.results?.find(r => r.store === storeName) || { store: storeName, errors: data.error ? [data.error] : [] }
      setHsStoreState(prev => ({
        ...prev,
        [storeName]: {
          scraping: false,
          progress: data.status === 'completed' ? 100 : 0,
          result: { success: data.status === 'completed', store: storeName, ...storeResult },
        }
      }))
      // Refresh the scrape log summary
      getDocs(query(collection(db, 'hotSchedulesScrapeLog'), orderBy('scrapedAt', 'desc'), limit(1)))
        .then(s => { if (!s.empty) setHsScrapeLog({ id: s.docs[0].id, ...s.docs[0].data() }) })
        .catch(() => {})
    }, (err) => {
      clearTimeout(timeoutId)
      clearInterval(progressInterval)
      setHsStoreState(prev => ({ ...prev, [storeName]: { scraping: false, progress: 0, result: { success: false, error: err.message } } }))
    })
  }

  function handleHsScrapeNow(e) {
    e.stopPropagation()
    scrapeOneStore('Castleton')
    // Stagger by 15s so both don't race to decompress Chromium on cold start simultaneously
    setTimeout(() => scrapeOneStore('Westfield'), 15000)
  }

  async function handleClearErrorFeed() {
    if (clearFeedLoading) return
    setClearFeedLoading(true)
    try {
      const snap = await getDocs(collection(db, 'clientErrors'))
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'clientErrors', d.id))
      }
      setLiveErrors([])
      setRecentErrors([])
      showSysToast('Error feed cleared')
    } catch (e) {
      console.error('Clear feed failed', e)
      showSysToast('Failed to clear: ' + (e?.message || e), 'error')
    } finally {
      setClearFeedLoading(false)
    }
  }

  async function handleAdminChatSend() {
    if (!adminChatInput.trim() || adminChatLoading) return
    const q = adminChatInput.trim()
    setAdminChatMessages(prev => [...prev, { role: 'user', content: q }])
    setAdminChatInput('')
    setAdminChatLoading(true)
    try {
      const res = await queryChatbot(q + ' (Admin mode — respond accurately and include source citations where possible.)', currentUser?.uid || 'admin')
      setAdminChatMessages(prev => [...prev, { role: 'assistant', content: res?.response || res?.error || 'No response' }])
    } catch (e) {
      setAdminChatMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + (e?.message || e) }])
    } finally {
      setAdminChatLoading(false)
    }
  }

  async function handleToastSyncRow(fn) {
    const fnName = fn.functionName || fn.id
    if (toastSyncRunningById[fnName]) return
    setToastSyncRunningById(prev => ({ ...prev, [fnName]: true }))
    try {
      const response = await fetch(
        'https://us-central1-chartrain-20901.cloudfunctions.net/triggerManualSync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminCode: '0000', functionName: fnName }),
        }
      )
      const data = await response.json()
      if (data.success) {
        setLastManualSync(new Date())
      }
    } catch (err) {
      console.error('Sync row failed:', err)
    } finally {
      setToastSyncRunningById(prev => ({ ...prev, [fnName]: false }))
    }
  }

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

  async function checkSystemHealth() {
    setLoading(true)
    try {
      const [geminiSnap, geminiApiKeySnap, toastSnap] = await Promise.all([
        getDoc(doc(db, 'config', 'geminiKey')),
        getDoc(doc(db, 'config', 'geminiApiKey')),
        getDoc(doc(db, 'config', 'toast')),
      ])
      const geminiData = geminiSnap.exists() ? geminiSnap.data() : {}
      const geminiApiKeyData = geminiApiKeySnap.exists() ? geminiApiKeySnap.data() : {}
      const keyFromGemini = geminiData?.key && geminiData.key.length > 20
      const keyFromApiKey = geminiApiKeyData?.key && geminiApiKeyData.key.length > 20
      const hasGeminiKey = !!(keyFromGemini || keyFromApiKey)
      const dataForDisplay = keyFromGemini ? geminiData : geminiApiKeyData
      const toastData = toastSnap.exists() ? toastSnap.data() : {}
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

      // Live tests
      const firebaseResult = await (async () => {
        const results = []
        const collectionsToTest = ['flashcardSets', 'trainingShifts', 'trainingData']
        for (const col of collectionsToTest) {
          try {
            await getDocs(query(collection(db, col), limit(1)))
            results.push({ col, ok: true })
          } catch (e) {
            const msg = e?.message || e?.code || ''
            results.push({ col, ok: false, permission: msg.toLowerCase().includes('permission') })
          }
        }
        const failed = results.filter(r => !r.ok)
        if (failed.length === 0) return { status: 'healthy', message: 'Connected — all collections accessible' }
        const permFailed = failed.filter(r => r.permission).map(r => r.col)
        const netFailed = failed.filter(r => !r.permission).map(r => r.col)
        if (permFailed.length > 0) return { status: 'error', message: `Permission denied: ${permFailed.join(', ')}` }
        return { status: 'error', message: `Network error on: ${netFailed.join(', ')}` }
      })()

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

      const toastAuthPing = await authFetch(`${FUNCTIONS_BASE}/toastAuth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then((r) => (r.ok || r.status === 400 || r.status === 401 ? 'healthy' : 'error'))
        .catch(() => 'error')
      const syncPing = await fetch(`${FUNCTIONS_BASE}/syncTrainerSchedules`, { method: 'GET' })
        .then((r) => (r.status === 200 || r.status === 400 || r.status === 401 || r.status === 405 ? 'healthy' : 'error'))
        .catch(() => 'error')

      setHealth((prev) => ({
        ...prev,
        firebase: { ...prev.firebase, ...firebaseResult, projectId: app?.options?.projectId || '—' },
        gemini: { ...prev.gemini, ...geminiLive },
        toast: { ...prev.toast, ...toastLive },
        cloudFunctions: { toastAuth: toastAuthPing, syncTrainerSchedules: syncPing },
      }))
    } catch (error) {
      console.error('Error checking health:', error)
      setHealth((prev) => ({
        ...prev,
        firebase: { status: 'error', message: error?.message || 'Error', projectId: '—' },
      }))
    } finally {
      setLoading(false)
    }
  }

  async function handleResolveAlert(alertId) {
    await resolveCriticalAlert(alertId)
  }

  async function handleAddManualAlert() {
    if (!newAlertMessage.trim()) return
    const { pushCriticalAlert } = await import('../services/errorLogger')
    await pushCriticalAlert('manual', newAlertMessage.trim(), newAlertSeverity, {
      addedBy: currentUser?.name || currentUser?.displayName || 'Admin',
    })
    setNewAlertMessage('')
    setShowAddAlert(false)
  }

  async function handleSyncNow() {
    if (syncRunning) return
    setSyncRunning(true)
    try {
      const response = await fetch(
        'https://us-central1-chartrain-20901.cloudfunctions.net/triggerManualSync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminCode: '0000' }),
        }
      )
      const data = await response.json()
      if (data.success) {
        setLastManualSync(new Date())
      } else {
        console.error('Manual sync failed:', data.error)
      }
    } catch (err) {
      console.error('Sync request failed:', err)
    } finally {
      setSyncRunning(false)
    }
  }

  async function testGeminiConnection() {
    try {
      const ok = await checkGeminiConfigured()
      if (ok) {
        showSysToast('Gemini API is working!')
      } else {
        showSysToast('Gemini API test failed. Check your API key and try again.', 'error')
      }
    } catch (error) {
      showSysToast('Test failed: ' + (error?.message || error), 'error')
    }
  }

  const trainees = listTrainees({ store: null, includeArchived: false })
  const trainers = Object.entries(staffAccounts || {}).filter(
    ([, info]) => info && !info.archived && (info.role === 'trainer')
  ).length
  let shiftsThisWeek = 0
  let testCompletionSum = 0
  let testCompletionCount = 0
  Object.values(trainingData || {}).forEach((rec) => {
    if (!rec || rec.archived) return
    const schedule = rec.schedule || {}
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    Object.values(schedule).forEach((item) => {
      if (item?.when) {
        const d = typeof item.when === 'string' ? new Date(item.when) : item.when?.toDate?.() || item.when
        if (d >= weekStart) shiftsThisWeek++
      }
    })
    const prog = getCertificationProgress(rec)
    if (prog.total > 0) {
      testCompletionSum += prog.pct
      testCompletionCount++
    }
  })
  const testCompletionPct = testCompletionCount ? Math.round(testCompletionSum / testCompletionCount) : 0

  if (!isAdmin) {
    return (
      <>
        <AppHeader />
        <div className="container mx-auto max-w-4xl p-6">
          <p className="text-gray-600">You do not have permission to view this page.</p>
        </div>
      </>
    )
  }

  if (loading) {
    return (
      <>
        <AppHeader />
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)] mx-auto mb-4" />
            <p className="text-gray-600">Checking system health...</p>
          </div>
        </div>
      </>
    )
  }

  function showSysToast(msg, type = 'success') {
    setSysToast({ msg, type })
    setTimeout(() => setSysToast(null), 3500)
  }

  return (
    <>
      <AppHeader />
      {sysToast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white transition-all ${sysToast.type === 'error' ? 'bg-red-600' : sysToast.type === 'info' ? 'bg-blue-600' : 'bg-green-600'}`}>
          {sysToast.msg}
        </div>
      )}
      <div className="min-h-screen bg-gray-50">
        <div className={`sticky top-0 z-30 px-4 py-3 text-white text-center font-semibold text-sm shadow-md ${
          pulseStatus === 'healthy' ? 'bg-green-600' :
          pulseStatus === 'warning' ? 'bg-amber-500' :
          'bg-red-600 animate-pulse'
        }`}>
          <span className="mr-2">
            {pulseStatus === 'healthy' ? '💚' : pulseStatus === 'warning' ? '⚠️' : '🔴'}
          </span>
          {pulseStatus === 'critical' && criticalAlerts.some(a => a.severity === 'critical')
            ? `🚨 ${criticalAlerts.filter(a => a.severity === 'critical').length} critical alert${criticalAlerts.filter(a => a.severity === 'critical').length !== 1 ? 's' : ''} — scroll down for details`
            : pulseStatus === 'healthy'
            ? `All Systems Healthy — ${activeSessions.length} active user${activeSessions.length !== 1 ? 's' : ''}`
            : `${liveErrors.filter(e => Date.now() - (e.timestamp?.toMillis?.() ?? 0) < 15 * 60 * 1000).length} issue${liveErrors.filter(e => Date.now() - (e.timestamp?.toMillis?.() ?? 0) < 15 * 60 * 1000).length !== 1 ? 's' : ''} detected`
          }
          <span className="ml-4 text-xs opacity-75">Updated {lastRefresh.toLocaleTimeString()}</span>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* === CRITICAL ALERTS PANEL === */}
          {(criticalAlerts.length > 0 || isAdmin) && (
            <div className="mb-6">
              {criticalAlerts.length > 0 && (
                <div className="space-y-3 mb-4">
                  {criticalAlerts.map((alert) => {
                    const isCritical = alert.severity === 'critical'
                    const ts = alert.createdAt?.toDate?.() ?? (alert.createdAt ? new Date(alert.createdAt) : null)
                    return (
                      <div
                        key={alert.id}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 shadow-sm ${
                          isCritical
                            ? 'border-red-300 bg-red-50'
                            : 'border-amber-300 bg-amber-50'
                        }`}
                      >
                        <div className="text-2xl mt-0.5">{isCritical ? '🚨' : '⚠️'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                              isCritical ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                            }`}>
                              {alert.severity}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                              {alert.source}
                            </span>
                            {alert.addedBy && (
                              <span className="text-xs text-gray-400">Added by {alert.addedBy}</span>
                            )}
                          </div>
                          <div className={`font-semibold mt-1 ${isCritical ? 'text-red-900' : 'text-amber-900'}`}>
                            {alert.message}
                          </div>
                          {alert.suggestion && (
                            <div className="text-sm text-gray-600 mt-1">💡 {alert.suggestion}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">
                            {ts ? ts.toLocaleString() : '—'}
                            {alert.functionName && ` · ${alert.functionName}`}
                            {alert.errorCode && ` · Code: ${alert.errorCode}`}
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => handleResolveAlert(alert.id)}
                            className="px-3 py-1.5 text-sm font-semibold rounded-lg border-2 border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition-colors whitespace-nowrap"
                          >
                            ✅ Resolve
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {isAdmin && (
                <div>
                  {!showAddAlert ? (
                    <button
                      onClick={() => setShowAddAlert(true)}
                      className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      <span>＋</span> Add manual alert
                    </button>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="font-semibold text-gray-800 text-sm">New Alert</h3>
                        <button onClick={() => setShowAddAlert(false)} className="text-gray-400 hover:text-gray-600 text-sm ml-auto">Cancel</button>
                      </div>
                      <input
                        type="text"
                        placeholder="What's the issue? e.g. 'Toast API credentials expiring tomorrow'"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
                        value={newAlertMessage}
                        onChange={(e) => setNewAlertMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddManualAlert()}
                      />
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="alertSeverity"
                            checked={newAlertSeverity === 'critical'}
                            onChange={() => setNewAlertSeverity('critical')}
                            className="accent-red-600"
                          />
                          <span className="text-red-700 font-medium">🚨 Critical</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="alertSeverity"
                            checked={newAlertSeverity === 'warning'}
                            onChange={() => setNewAlertSeverity('warning')}
                            className="accent-amber-600"
                          />
                          <span className="text-amber-700 font-medium">⚠️ Warning</span>
                        </label>
                        <button
                          onClick={handleAddManualAlert}
                          disabled={!newAlertMessage.trim()}
                          className="ml-auto px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Post Alert
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <OwnerNavBar />

          <div className="flex gap-1 mb-6 border-b border-gray-200">
            {[
              { key: 'heartbeat', label: '🫀 Heartbeat', icon: '🫀' },
              { key: 'toast', label: '🍞 Toast', icon: '🍞' },
              { key: 'charlie', label: '💬 Charlie', icon: '💬' },
              { key: 'config', label: '⚙️ Config', icon: '⚙️' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-semibold rounded-t-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white border border-b-0 border-gray-200 text-gray-900 -mb-px'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'heartbeat' && (
            <>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">🫀 System Heartbeat</h1>
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
            <h2 className="text-xl font-bold text-gray-900 mb-4">🏥 Feature Health</h2>
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

          {/* ── HotSchedules Sync ───────────────────────────────────────── */}
          {(() => {
            const hsLastTime = hsScrapeLog?.scrapedAt ? new Date(hsScrapeLog.scrapedAt) : null
            const hsAgeHours = hsLastTime ? (Date.now() - hsLastTime.getTime()) / (1000 * 60 * 60) : Infinity
            const hsAllOk = hsScrapeLog?.results?.every(r => r.errors?.length === 0) ?? false
            const hsStatus = !hsScrapeLog ? 'warning' : hsAllOk && hsAgeHours < 26 ? 'healthy' : hsAgeHours > 48 ? 'critical' : 'warning'
            const hsTotalMatched = hsScrapeLog?.results?.reduce((sum, r) => sum + (r.trainersMatched || 0), 0) || 0
            const hsTotalTrainers = hsScrapeLog?.results?.reduce((sum, r) => sum + (r.trainersTotal || 0), 0) || 0
            const anyStoreScraping = Object.values(hsStoreState).some(s => s.scraping)
            return (
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
                        disabled={anyStoreScraping}
                        className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-semibold transition-all bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {anyStoreScraping ? '🔄 Scraping...' : '▶ Run Now'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Summary stats */}
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

                {/* Per-store progress bars + results */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {['Castleton', 'Westfield'].map(storeName => {
                    const ss = hsStoreState[storeName]
                    // Last known result from Firestore for this store
                    const lastKnown = hsScrapeLog?.results?.find(r => r.store === storeName)
                    const result = ss.result || null
                    const ok = result ? result.success !== false && (result.errors?.length === 0 || !result.errors) : lastKnown ? lastKnown.errors?.length === 0 : null
                    return (
                      <div key={storeName} className={`rounded-lg border p-4 ${
                        ss.scraping ? 'border-blue-200 bg-blue-50' :
                        result ? (ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50') :
                        lastKnown ? (lastKnown.errors?.length === 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50') :
                        'border-gray-200 bg-gray-50'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm text-gray-900">{storeName}</span>
                          {ss.scraping && <span className="text-xs text-blue-600 font-medium">Scraping...</span>}
                          {!ss.scraping && result && <span className={`text-xs font-medium ${ok ? 'text-green-700' : 'text-red-700'}`}>{ok ? '✅ Done' : '❌ Failed'}</span>}
                          {!ss.scraping && !result && lastKnown && (
                            <span className={`text-xs font-medium ${lastKnown.errors?.length === 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {lastKnown.errors?.length === 0 ? '✅ Last run OK' : '❌ Last run failed'}
                            </span>
                          )}
                        </div>
                        {ss.scraping && (
                          <div className="mb-2">
                            <div className="h-1.5 rounded-full bg-blue-200 overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.round(ss.progress)}%` }} />
                            </div>
                            <div className="text-xs text-blue-600 mt-1">{Math.round(ss.progress)}% — takes 5–8 min per store</div>
                          </div>
                        )}
                        {result && (
                          <div className="text-xs space-y-0.5">
                            {ok ? (
                              <>
                                <div className="text-gray-700">{result.employeesFound} employees found</div>
                                <div>Trainers: <span className="font-medium text-green-700">{result.trainersMatched}/{result.trainersTotal} matched</span></div>
                                {result.traineesMatched > 0 && <div>Trainees: {result.traineesMatched} matched</div>}
                                {result.unmatchedNames?.length > 0 && <div className="text-gray-400">Unmatched: {result.unmatchedNames.slice(0, 4).join(', ')}</div>}
                              </>
                            ) : (
                              <div className="text-red-700">{result.errors?.join(', ') || result.error || 'Unknown error'}</div>
                            )}
                          </div>
                        )}
                        {!ss.scraping && !result && lastKnown && (
                          <div className="text-xs space-y-0.5">
                            {lastKnown.errors?.length === 0 ? (
                              <>
                                <div className="text-gray-700">{lastKnown.employeesFound} employees found</div>
                                <div>Trainers: <span className="font-medium text-green-700">{lastKnown.trainersMatched}/{lastKnown.trainersTotal} matched</span></div>
                              </>
                            ) : (
                              <div className="text-red-700">{lastKnown.errors?.join(', ')}</div>
                            )}
                          </div>
                        )}
                        {!ss.scraping && !result && !lastKnown && (
                          <div className="text-xs text-gray-400">No data yet — click Run Now</div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {!hsScrapeLog && !anyStoreScraping && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    ⚠️ No scrape history found. Click <strong>Run Now</strong> to trigger both stores in parallel.
                  </div>
                )}
              </div>
            )
          })()}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">🚨 Live Error Feed</h2>
              {isAdmin && (
                <button
                  onClick={handleClearErrorFeed}
                  disabled={clearFeedLoading || liveErrors.length === 0}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clearFeedLoading ? <span className="flex items-center gap-2"><span className="animate-spin">🔄</span> Clearing...</span> : '🗑 Clear Feed'}
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
          )}

          {activeTab === 'toast' && (
            <>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">🍞 Toast</h1>
          <p className="text-gray-500 mb-6">POS sync, trainee sync, and data retention</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <HealthCard
              title="Toast POS"
              icon="🍞"
              status={health.toast.status}
              message={health.toast.message}
              details={[
                { label: 'Client ID', value: health.toast.clientId || 'Not set' },
                {
                  label: 'Last Sync',
                  value: health.toast.lastSync
                    ? new Date(health.toast.lastSync).toLocaleString()
                    : 'Never',
                },
                { label: 'Auto Sync', value: health.toast.syncEnabled ? 'Enabled' : 'Midnight daily' },
              ]}
              actions={[{ label: 'Configure', onClick: () => setEditMode('toast') }]}
            />
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">☁️</span>
                  <h3 className="text-lg font-bold text-gray-900">Cloud Functions</h3>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">Live ping to critical functions</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">toastAuth</span>
                  <span className={health.cloudFunctions?.toastAuth === 'healthy' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {health.cloudFunctions?.toastAuth === 'healthy' ? '✅ Up' : health.cloudFunctions?.toastAuth === 'error' ? '❌ Down' : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">syncTrainerSchedules</span>
                  <span className={health.cloudFunctions?.syncTrainerSchedules === 'healthy' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {health.cloudFunctions?.syncTrainerSchedules === 'healthy' ? '✅ Up' : health.cloudFunctions?.syncTrainerSchedules === 'error' ? '❌ Down' : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">🔄 Toast Sync Functions</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 pr-4">Function</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Last Run</th>
                    <th className="pb-2 pr-4">Duration</th>
                    <th className="pb-2 pr-4">Details</th>
                    <th className="pb-2">Run</th>
                  </tr>
                </thead>
                <tbody>
                  {toastSyncStatuses.map((fn) => {
                    const lastRun = fn.lastRun?.toDate?.() ?? (fn.lastRun ? new Date(fn.lastRun) : null)
                    const ageMs = lastRun ? Date.now() - lastRun.getTime() : Infinity
                    const isStale = ageMs > 2 * 60 * 60 * 1000
                    const fnName = fn.functionName || fn.id
                    const isRowRunning = toastSyncRunningById[fnName]
                    const isSyncMenus = (fnName || '').toLowerCase().includes('syncmenus') || fnName === 'syncMenus'
                    const isSyncSchedules = (fnName || '').toLowerCase().includes('synctrainerschedules')
                    const errorDisplay = fn.error
                      ? (isSyncSchedules && fn.error?.includes?.('400') ? 'Request failed with status code 400' : fn.error)
                      : null
                    return (
                      <tr key={fnName} className={`border-b last:border-0 ${isStale ? 'bg-amber-50' : ''}`}>
                        <td className="py-3 pr-4 font-medium text-gray-900">
                          {fnName}
                          {fn.description && <div className="text-xs text-gray-400">{fn.description}</div>}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            fn.status === 'success' ? 'bg-green-100 text-green-700' :
                            fn.status === 'failed' ? 'bg-red-100 text-red-700' :
                            fn.status === 'running' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {fn.status === 'success' ? '✅' : fn.status === 'failed' ? '❌' : fn.status === 'running' ? '🔄' : '❓'}
                            {fn.status || 'unknown'}
                          </span>
                          {isStale && <span className="ml-2 text-xs text-amber-600">⚠️ stale</span>}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {lastRun ? getTimeAgo(lastRun) : '—'}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {fn.durationMs ? `${(fn.durationMs / 1000).toFixed(1)}s` : '—'}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 text-xs max-w-md">
                          {errorDisplay ? (
                            <span
                              className="text-red-600 cursor-help"
                              title={isSyncMenus ? errorDisplay : undefined}
                            >
                              {isSyncMenus ? errorDisplay : (errorDisplay.length > 60 ? errorDisplay.slice(0, 60) + '…' : errorDisplay)}
                            </span>
                          ) : (fn.details || fn.recordCount ? `${fn.recordCount || ''} records` : '—')}
                        </td>
                        <td className="py-3">
                          {isAdmin && (
                            <button
                              onClick={() => handleToastSyncRow(fn)}
                              disabled={isRowRunning}
                              className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isRowRunning ? <span className="animate-spin">🔄</span> : '▶ Run'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 mb-8" id="trainee-job-codes">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Trainee Sync from Toast</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Set which Toast job code is used for &quot;Server Trainee&quot;, then run a sync to import those employees.
              </p>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-4">
                👇 To see <strong>all job codes</strong> coming from Toast (for both stores), click <strong>&quot;Load Job Codes&quot;</strong> in the box below. Pick the one that means new hires / Server Trainee and save it.
              </p>
              <TraineeJobCodeSelector onJobCodeSelected={() => {}} />
            </div>

            <div className="mt-8 mb-8">
              <TraineeSyncPanel onSyncComplete={() => {}} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">🗂️ Data Retention</h3>
              <p className="text-sm text-gray-500 mb-3">Automatic cleanup runs daily at 2:15 AM</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-semibold text-gray-700 mb-1">90 days</div>
                  <div className="text-gray-500">Sales, Comps, Daily Summaries, Scorecards, Menu Changes</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700 mb-1">30 days</div>
                  <div className="text-gray-500">Notifications, Orders, Data Quality, Conflicts</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700 mb-1">14 days</div>
                  <div className="text-gray-500">Error Logs, Failed Orders</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700 mb-1">7 days</div>
                  <div className="text-gray-500">Toast Events, Sync Jobs, API Cache</div>
                </div>
              </div>
            </div>
          </>
          )}

          {activeTab === 'charlie' && (
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
                              showSysToast('Saved to knowledge base')
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
                aria-label="Ask Charlie"
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
                          await updateDoc(doc(db, 'charlieFeedback', fb.id), { resolved: true, verdict: 'correct' })
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
                            await updateDoc(doc(db, 'charlieFeedback', fb.id), { resolved: true, verdict: 'fixed' })
                          }
                        }}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                      >
                        ✏️ Fix Response → Save to KB
                      </button>
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, 'charlieFeedback', fb.id), { resolved: true, verdict: 'dismissed' })
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
                      await deleteDoc(doc(db, 'chatbotKnowledge', chunk.id))
                      setKbChunks(prev => prev.filter(c => c.id !== chunk.id))
                      showSysToast('Chunk deleted')
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
          )}

          {activeTab === 'config' && (
            <>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">⚙️ Config</h1>
          <p className="text-gray-500 mb-6">Firebase, Gemini, Flashcards, and system activity</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <HealthCard
              title="Firebase"
              icon="🔥"
              status={health.firebase.status}
              message={health.firebase.message}
              details={[
                { label: 'Project', value: health.firebase.projectId },
                { label: 'Live', value: health.firebase.message },
              ]}
              actions={[]}
            />
            <HealthCard
              title="Gemini AI"
              icon="✨"
              status={health.gemini.status}
              message={health.gemini.message}
              details={[
                { label: 'API Key', value: health.gemini.apiKey || 'Not set' },
                { label: 'Rate Limit', value: health.gemini.rateLimit },
              ]}
              actions={[
                { label: 'Test Connection', onClick: testGeminiConnection },
                { label: 'Update Key', onClick: () => setShowGeminiConfig(true) },
              ]}
            />
            <FlashcardHealthCard
              reloadTrigger={flashcardReloadTrigger}
              onRefresh={() => setFlashcardReloadTrigger((t) => t + 1)}
              onToast={showSysToast}
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent System Activity</h2>
            <div className="space-y-3">
              <ActivityItem
                icon="🔄"
                title="Trainee Sync"
                description="Sync from Toast via Manager dashboard dropdown"
                time="Use Sync dropdown on Manager page"
                status="info"
              />
              <ActivityItem
                icon="✨"
                title="AI Generation"
                description="Flashcards, quizzes, and hints use Gemini when configured"
                time="Configure in Gemini card above"
                status="info"
              />
              <ActivityItem
                icon="📊"
                title="Settings"
                description="API keys and Toast credentials stored in Firestore config"
                time="Secure – admin only"
                status="info"
              />
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      <GeminiConfigModal
        isOpen={showGeminiConfig}
        onClose={() => {
          setShowGeminiConfig(false)
          checkSystemHealth()
        }}
      />

      {editMode === 'toast' && (
        <ToastConfigModal
          onClose={() => {
            setEditMode(null)
            checkSystemHealth()
          }}
        />
      )}
    </>
  )
}

function HealthCard({ title, icon, status, message, details, actions }) {
  const statusColors = {
    healthy: 'bg-green-100 text-green-800 border-green-300',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    error: 'bg-red-100 text-red-800 border-red-300',
    unknown: 'bg-gray-100 text-gray-800 border-gray-300',
  }
  const statusIcons = {
    healthy: '✅',
    warning: '⚠️',
    error: '❌',
    unknown: '❓',
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{icon}</span>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold border-2 ${statusColors[status] || statusColors.unknown}`}
        >
          {statusIcons[status] || '❓'} {(status || 'unknown').toUpperCase()}
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      <div className="space-y-2 mb-4">
        {details.map((detail, idx) => (
          <div key={idx} className="flex justify-between text-sm">
            <span className="text-gray-500">{detail.label}:</span>
            <span className="font-semibold text-gray-900">{detail.value}</span>
          </div>
        ))}
      </div>
      {actions?.length > 0 && (
        <div className="flex gap-2">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              onClick={action.onClick}
              className="flex-1 px-3 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-semibold"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-2xl font-bold text-green-900">{value}</span>
      </div>
      <p className="text-xs font-semibold text-green-700">{label}</p>
    </div>
  )
}

function ActivityItem({ icon, title, description, time, status }) {
  const statusColors = {
    success: 'bg-green-100 text-green-700',
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-yellow-100 text-yellow-700',
  }
  return (
    <div className="flex items-start gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
      <div className={`p-2 rounded-lg ${statusColors[status] || statusColors.info}`}>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="flex-1">
        <p className="font-semibold text-gray-900 text-sm">{title}</p>
        <p className="text-xs text-gray-600">{description}</p>
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">{time}</span>
    </div>
  )
}

function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago'
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago'
  return Math.floor(seconds / 86400) + 'd ago'
}

function ToastConfigModal({ onClose }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [adminCode, setAdminCode] = useState('0000')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSave() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Client ID and Client Secret are required.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const result = await setToastCredentials({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        adminCode: adminCode.trim(),
      })
      if (result.success) {
        setSuccess(result.message || 'Toast credentials saved.')
        setClientId('')
        setClientSecret('')
        setTimeout(onClose, 1500)
      } else {
        setError(result.error || 'Failed to save')
      }
    } catch (err) {
      setError(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Configure Toast POS</h2>
        <p className="text-sm text-gray-600 mb-4">
          Client ID and Secret are used for all Toast API calls. Leave blank to keep current values.
        </p>
        <div className="space-y-3 mb-4">
          <div>
            <label htmlFor="toast-client-id" className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
            <input
              id="toast-client-id"
              type="text"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Toast API Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="toast-client-secret" className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
            <input
              id="toast-client-secret"
              type="password"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Toast API Client Secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin code</label>
            <input
              type="text"
              autoComplete="off"
              className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {success && <p className="text-sm text-green-600 mb-2">{success}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !clientId.trim() || !clientSecret.trim()}
            className="flex-1 px-4 py-3 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save credentials'}
          </button>
        </div>
      </div>
    </div>
  )
}
