import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import { useStaffAccounts } from '../hooks/useStaffAccounts'
import { useTrainingData } from '../hooks/useTrainingData'
import { useGemini } from '../contexts/GeminiContext'
import { checkGeminiConfigured } from '../services/ai'
import { getPendingFlags, dismissFlag, fixAndRestoreFlag } from '../services/flashcardFlags'
import { getTraineeReadinessAggregate } from '../utils/helpers'
import AuditLogViewer from '../components/AuditLogViewer'
import { getStoreDisplayName } from '../constants'
import { useOrg } from '../contexts/OrgContext'
import { getEmailSettings, updateEmailSettings, sendTestEmail } from '../services/emailSettingsService'

const VALID_TABS = ['audit', 'alerts', 'trainees', 'ai-features', 'email', 'debug']

export default function AdminPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentUser } = useAuth()
  const { stores } = useOrg()
  const { staffAccounts } = useStaffAccounts()
  const { listTrainees, trainingData } = useTrainingData()
  const tabParam = searchParams.get('tab')
  const [tab, setTab] = useState(() => {
    if (tabParam && VALID_TABS.includes(tabParam)) return tabParam
    return 'audit'
  })
  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam)) setTab(tabParam)
  }, [tabParam])
  const [proxyConfigured, setProxyConfigured] = useState(null)
  const [contentAlerts, setContentAlerts] = useState([])
  const [contentAlertsLoading, setContentAlertsLoading] = useState(false)
  const { isConfigured: geminiClientConfigured, rateLimitStatus: geminiRateLimitStatus, apiKey: geminiClientKey } = useGemini()

  // Email settings state — one object per store
  const [emailSettings, setEmailSettings] = useState({})
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailMessage, setEmailMessage] = useState(null)
  const [newEmailInput, setNewEmailInput] = useState({})
  const [testSending, setTestSending] = useState({})

  const loadEmailSettings = useCallback(async () => {
    setEmailLoading(true)
    try {
      const all = {}
      for (const store of stores) {
        all[store] = await getEmailSettings(store)
      }
      setEmailSettings(all)
    } catch (_) {}
    setEmailLoading(false)
  }, [stores])

  useEffect(() => {
    if (tab === 'email') loadEmailSettings()
  }, [tab, loadEmailSettings])

  const staffCount = Object.keys(staffAccounts || {}).filter((k) => staffAccounts[k] && !staffAccounts[k].archived).length
  const trainees = listTrainees({ store: null, includeArchived: false })
  const traineeCount = trainees.length


  useEffect(() => {
    if (tab !== 'ai-features') return
    checkGeminiConfigured().then((ok) => setProxyConfigured(ok))
  }, [tab])

  useEffect(() => {
    if (tab !== 'alerts') return
    setContentAlertsLoading(true)
    getPendingFlags()
      .then(setContentAlerts)
      .catch(() => setContentAlerts([]))
      .finally(() => setContentAlertsLoading(false))
  }, [tab])

  return (
    <>
      <AppHeader />
      <div className="container mx-auto px-4 pb-8">
        <OwnerNavBar />
        <div className="content-area">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Admin</h2>
          <p className="text-gray-600 text-sm mb-6">Audit log, debug, and AI features. API configuration is in System Health.</p>

          <div className="mb-6 rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
            <h3 className="font-bold text-gray-800 mb-1">System Health &amp; AI File Upload</h3>
            <p className="text-sm text-gray-600 mb-3">Configure API keys, Toast sync, and upload files for flashcards / chatbot knowledge base.</p>
            <button type="button" className="btn btn-small" onClick={() => navigate('/admin/health')}>
              Open System Health →
            </button>
          </div>

          <div className="mb-6 flex gap-2 flex-wrap">
            {VALID_TABS.map((t) => (
              <button
                key={t}
                type="button"
                className={`btn btn-small ${tab === t ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : 'btn-secondary'}`}
                onClick={() => setTab(t)}
              >
                {t === 'audit' ? 'Audit log' : t === 'alerts' ? 'Content Alerts' : t === 'trainees' ? 'Trainees & scores' : t === 'ai-features' ? 'AI features' : t === 'email' ? 'Email' : 'Debug'}
              </button>
            ))}
          </div>

          {tab === 'trainees' && (
            <section>
              <h3 className="font-bold text-gray-800 mb-2">Trainees &amp; scores (all stores)</h3>
              <p className="text-sm text-gray-500 mb-4">Same data managers see: readiness scores and status. Click &quot;View details&quot; on Manager page for full record.</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-100 text-left">
                      <th className="px-4 py-2 font-semibold text-gray-700">Name</th>
                      <th className="px-4 py-2 font-semibold text-gray-700">#</th>
                      <th className="px-4 py-2 font-semibold text-gray-700">Store</th>
                      <th className="px-4 py-2 font-semibold text-gray-700">Status</th>
                      <th className="px-4 py-2 font-semibold text-gray-700">Readiness (avg)</th>
                      <th className="px-4 py-2 font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainees.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-6 text-gray-500 text-center">No trainees.</td></tr>
                    ) : (
                      trainees.map((t) => {
                        const readiness = trainingData ? getTraineeReadinessAggregate(trainingData, t.id) : { average: null, count: 0 }
                        const status = t.archived ? 'Archived' : t.certified ? 'Certified' : 'In training'
                        return (
                          <tr key={t.id} className="border-b border-gray-100 hover:bg-white/80">
                            <td className="px-4 py-2 font-medium text-gray-800">{t.name || '—'}</td>
                            <td className="px-4 py-2 text-gray-600">{t.employeeNumber || t.id || '—'}</td>
                            <td className="px-4 py-2 text-gray-600">{t.store ? getStoreDisplayName(t.store) : '—'}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                t.archived ? 'bg-red-100 text-red-800' : t.certified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {readiness.average != null ? `${readiness.average} (${readiness.count} shift${readiness.count !== 1 ? 's' : ''})` : '—'}
                            </td>
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                className="btn btn-small btn-secondary"
                                onClick={() => navigate('/manager', { state: { viewTraineeId: t.id } })}
                              >
                                View on Manager
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'ai-features' && (
            <section>
              <h3 className="font-bold text-gray-800 mb-2">Gemini AI features</h3>
              <p className="text-sm text-gray-500 mb-4">
                These are the AI (Gemini) capabilities used in the app. Each is marked active if the feature can run with the current configuration.
              </p>
              <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
                <h4 className="font-medium text-gray-800 mb-2">Overall status</h4>
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  <li>
                    <strong>Server (proxy):</strong>{' '}
                    {proxyConfigured === null ? 'Checking…' : proxyConfigured ? 'Active — API key is set and the server can call Gemini.' : 'Inactive — Set and save a Gemini API key in System Health to enable server features.'}
                  </li>
                  <li>
                    <strong>Browser (client):</strong>{' '}
                    {geminiClientConfigured ? 'Active — This device can call Gemini for quiz and flashcard generation.' : 'Inactive — Configure Gemini in System Health so the browser can use AI features.'}
                  </li>
                  {geminiClientConfigured && geminiRateLimitStatus?.isLimited && (
                    <li className="text-amber-700">
                      Rate limit: You may need to wait a short time before some browser AI requests succeed.
                    </li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-left border-b border-gray-200">
                      <th className="px-4 py-2 font-semibold text-gray-700">Feature</th>
                      <th className="px-4 py-2 font-semibold text-gray-700">What it does</th>
                      <th className="px-4 py-2 font-semibold text-gray-700">Runs on</th>
                      <th className="px-4 py-2 font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-200 hover:bg-white/80">
                      <td className="px-4 py-2 font-medium text-gray-800">Help chat (?)</td>
                      <td className="px-4 py-2 text-gray-600">The ? button opens a chat that can quiz you, practice upsell, translate terms, suggest wine pairings, and answer handbook questions.</td>
                      <td className="px-4 py-2 text-gray-600">Server</td>
                      <td className="px-4 py-2">{proxyConfigured ? <span className="text-green-600 font-medium">Active</span> : <span className="text-gray-500">Inactive</span>}</td>
                    </tr>
                    <tr className="border-b border-gray-200 hover:bg-white/80">
                      <td className="px-4 py-2 font-medium text-gray-800">Hints during quizzes</td>
                      <td className="px-4 py-2 text-gray-600">When taking a quiz, you can ask for a hint. The AI gives a nudge without revealing the answer.</td>
                      <td className="px-4 py-2 text-gray-600">Server</td>
                      <td className="px-4 py-2">{proxyConfigured ? <span className="text-green-600 font-medium">Active</span> : <span className="text-gray-500">Inactive</span>}</td>
                    </tr>
                    <tr className="border-b border-gray-200 hover:bg-white/80">
                      <td className="px-4 py-2 font-medium text-gray-800">Training drift report</td>
                      <td className="px-4 py-2 text-gray-600">On the Owner Dashboard, the AI writes a short summary comparing stores so you can see who is ahead or behind.</td>
                      <td className="px-4 py-2 text-gray-600">Server</td>
                      <td className="px-4 py-2">{proxyConfigured ? <span className="text-green-600 font-medium">Active</span> : <span className="text-gray-500">Inactive</span>}</td>
                    </tr>
                    <tr className="border-b border-gray-200 hover:bg-white/80">
                      <td className="px-4 py-2 font-medium text-gray-800">Trainee assessment</td>
                      <td className="px-4 py-2 text-gray-600">Managers can request an AI assessment of a trainee: verdict, evidence, and suggested next steps.</td>
                      <td className="px-4 py-2 text-gray-600">Server</td>
                      <td className="px-4 py-2">{proxyConfigured ? <span className="text-green-600 font-medium">Active</span> : <span className="text-gray-500">Inactive</span>}</td>
                    </tr>
                    <tr className="border-b border-gray-200 hover:bg-white/80">
                      <td className="px-4 py-2 font-medium text-gray-800">Menu Studio duplicate check</td>
                      <td className="px-4 py-2 text-gray-600">When importing menu items, the AI can flag possible duplicates so you don’t add the same item twice.</td>
                      <td className="px-4 py-2 text-gray-600">Server</td>
                      <td className="px-4 py-2">{proxyConfigured ? <span className="text-green-600 font-medium">Active</span> : <span className="text-gray-500">Inactive</span>}</td>
                    </tr>
                    <tr className="border-b border-gray-200 hover:bg-white/80">
                      <td className="px-4 py-2 font-medium text-gray-800">Generate quiz questions</td>
                      <td className="px-4 py-2 text-gray-600">On the Quizzes page, the AI creates multiple-choice questions from your flashcard sets.</td>
                      <td className="px-4 py-2 text-gray-600">Browser</td>
                      <td className="px-4 py-2">{geminiClientConfigured ? <span className="text-green-600 font-medium">Active</span> : <span className="text-gray-500">Inactive</span>}</td>
                    </tr>
                    <tr className="border-b border-gray-200 hover:bg-white/80">
                      <td className="px-4 py-2 font-medium text-gray-800">Flashcard suggestions</td>
                      <td className="px-4 py-2 text-gray-600">On the Flashcards page, you can ask the AI to suggest new cards by topic so you can grow your sets.</td>
                      <td className="px-4 py-2 text-gray-600">Browser</td>
                      <td className="px-4 py-2">{geminiClientConfigured ? <span className="text-green-600 font-medium">Active</span> : <span className="text-gray-500">Inactive</span>}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                To turn on server features: go to System Health and save a Gemini API key (with admin code). To turn on browser features: use &quot;Configure Gemini AI&quot; in System Health so this device can use the key.
              </p>
            </section>
          )}

          {tab === 'alerts' && (
            <section>
              <h3 className="font-bold text-gray-800 mb-2">Content Alerts (quarantined flashcards)</h3>
              <p className="text-sm text-gray-500 mb-4">Trainees can mark flashcards as &quot;Not accurate&quot;; those cards are quarantined until you dismiss or fix them.</p>
              {contentAlertsLoading ? (
                <p className="text-gray-500">Loading…</p>
              ) : contentAlerts.length === 0 ? (
                <p className="text-gray-500">No pending alerts.</p>
              ) : (
                <div className="max-h-[60vh] overflow-auto space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  {contentAlerts.map((flag) => (
                    <div key={flag.id} className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="text-xs text-gray-500 mb-1">Set: {flag.setId} · Reported {flag.reportedAt ? new Date(flag.reportedAt).toLocaleString() : '—'} by {flag.reportedBy || '—'}</div>
                      <div className="text-sm font-medium text-gray-800 mb-1">Front: {(flag.front || '').slice(0, 120)}{(flag.front || '').length > 120 ? '…' : ''}</div>
                      <div className="text-sm text-gray-600 mb-1">Back: {(flag.back || '').slice(0, 120)}{(flag.back || '').length > 120 ? '…' : ''}</div>
                      <div className="text-sm text-amber-700 mb-3">Reason: {flag.reason || '—'}</div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-small btn-secondary"
                          onClick={async () => {
                            try {
                              await dismissFlag(flag.id)
                              setContentAlerts((prev) => prev.filter((f) => f.id !== flag.id))
                            } catch (_) {}
                          }}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={async () => {
                            try {
                              await fixAndRestoreFlag(flag.id)
                              setContentAlerts((prev) => prev.filter((f) => f.id !== flag.id))
                            } catch (_) {}
                          }}
                        >
                          Fix &amp; restore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 'audit' && (
            <section>
              <AuditLogViewer />
            </section>
          )}

          {tab === 'debug' && (
            <section>
              <h3 className="font-bold text-gray-800 mb-2">Data quality</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-2xl font-bold text-gray-800">{staffCount}</div>
                  <div className="text-sm text-gray-500">Staff accounts (active)</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-2xl font-bold text-gray-800">{traineeCount}</div>
                  <div className="text-sm text-gray-500">Trainees (active)</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                Sync jobs and detailed data quality are available in Firebase Console and Cloud Functions logs.
              </p>
            </section>
          )}

          {tab === 'email' && (
            <section>
              <h3 className="font-bold text-gray-800 mb-2">Email settings</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure daily and weekly training emails per store. Each store sends from its own Gmail account (SMTP credentials set in Firebase secrets).
              </p>
              {emailMessage && (
                <div className={`mb-4 p-3.5 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm transition-all ${emailMessage.type === 'error' ? 'bg-red-50 border border-red-300 text-red-800' : 'bg-green-50 border border-green-300 text-green-800'}`}>
                  <span className="text-lg">{emailMessage.type === 'error' ? '✗' : '✓'}</span>
                  {emailMessage.text}
                </div>
              )}
              {emailLoading ? (
                <p className="text-gray-500">Loading…</p>
              ) : (
                <div className="space-y-6">
                  {stores.map((store) => {
                    const settings = emailSettings[store] || {}
                    const recipients = settings.recipients || []
                    const toggleField = async (field) => {
                      const updated = { ...settings, [field]: !settings[field] }
                      setEmailSettings((prev) => ({ ...prev, [store]: updated }))
                      await updateEmailSettings(store, { [field]: !settings[field] })
                      setEmailMessage({ type: 'success', text: `${store}: ${field} ${!settings[field] ? 'enabled' : 'disabled'}` })
                      setTimeout(() => setEmailMessage(null), 2000)
                    }
                    const addRecipient = async () => {
                      const email = (newEmailInput[store] || '').trim().toLowerCase()
                      if (!email || !email.includes('@')) {
                        setEmailMessage({ type: 'error', text: 'Enter a valid email address.' })
                        setTimeout(() => setEmailMessage(null), 2000)
                        return
                      }
                      if (recipients.includes(email)) {
                        setEmailMessage({ type: 'error', text: 'Email already in the list.' })
                        setTimeout(() => setEmailMessage(null), 2000)
                        return
                      }
                      const updated = [...recipients, email]
                      setEmailSettings((prev) => ({ ...prev, [store]: { ...settings, recipients: updated } }))
                      setNewEmailInput((prev) => ({ ...prev, [store]: '' }))
                      await updateEmailSettings(store, { recipients: updated })
                      setEmailMessage({ type: 'success', text: `Added ${email} to ${store}.` })
                      setTimeout(() => setEmailMessage(null), 2000)
                    }
                    const removeRecipient = async (email) => {
                      const updated = recipients.filter((e) => e !== email)
                      setEmailSettings((prev) => ({ ...prev, [store]: { ...settings, recipients: updated } }))
                      await updateEmailSettings(store, { recipients: updated })
                      setEmailMessage({ type: 'success', text: `Removed ${email} from ${store}.` })
                      setTimeout(() => setEmailMessage(null), 2000)
                    }
                    const handleTestEmail = async (type) => {
                      const key = `${store}_${type}`
                      setTestSending((prev) => ({ ...prev, [key]: true }))
                      try {
                        const result = await sendTestEmail(store, type)
                        if (result.ok) {
                          setEmailMessage({ type: 'success', text: `Test ${type} email sent for ${store} to ${(result.sentTo || []).join(', ')}` })
                          // Reload settings to show updated send log
                          try {
                            const updated = await getEmailSettings(store)
                            setEmailSettings((prev) => ({ ...prev, [store]: updated }))
                          } catch (_) {}
                        } else {
                          setEmailMessage({ type: 'error', text: result.error || 'Send failed' })
                        }
                      } catch (err) {
                        setEmailMessage({ type: 'error', text: err.message || 'Send failed' })
                      } finally {
                        setTestSending((prev) => ({ ...prev, [key]: false }))
                        setTimeout(() => setEmailMessage(null), 5000)
                      }
                    }
                    return (
                      <div key={store} className="rounded-xl border border-gray-200 bg-white p-5">
                        <h4 className="font-bold text-gray-800 text-lg mb-3">{store}</h4>

                        {/* Toggles */}
                        <div className="flex flex-wrap gap-4 mb-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!settings.enabled}
                              onChange={() => toggleField('enabled')}
                              className="w-4 h-4 accent-[var(--color-primary)]"
                            />
                            <span className="text-sm text-gray-700">Emails enabled</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!settings.dailyEnabled}
                              onChange={() => toggleField('dailyEnabled')}
                              className="w-4 h-4 accent-[var(--color-primary)]"
                              disabled={!settings.enabled}
                            />
                            <span className={`text-sm ${settings.enabled ? 'text-gray-700' : 'text-gray-400'}`}>Daily (11 PM)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!settings.weeklyEnabled}
                              onChange={() => toggleField('weeklyEnabled')}
                              className="w-4 h-4 accent-[var(--color-primary)]"
                              disabled={!settings.enabled}
                            />
                            <span className={`text-sm ${settings.enabled ? 'text-gray-700' : 'text-gray-400'}`}>Weekly (Sun 2 PM)</span>
                          </label>
                        </div>

                        {/* Recipients */}
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-600 mb-2">Recipients ({recipients.length})</p>
                          {recipients.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {recipients.map((email) => (
                                <span key={email} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-700">
                                  {email}
                                  <button
                                    type="button"
                                    className="ml-0.5 text-gray-400 hover:text-red-600 font-bold"
                                    onClick={() => removeRecipient(email)}
                                    title="Remove"
                                  >
                                    x
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input
                              type="email"
                              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                              placeholder="Add email address…"
                              value={newEmailInput[store] || ''}
                              onChange={(e) => setNewEmailInput((prev) => ({ ...prev, [store]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient() } }}
                            />
                            <button
                              type="button"
                              className="btn btn-small"
                              onClick={addRecipient}
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        {/* Test buttons */}
                        <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-100">
                          <button
                            type="button"
                            className="btn btn-small btn-secondary"
                            onClick={() => handleTestEmail('daily')}
                            disabled={testSending[`${store}_daily`] || recipients.length === 0}
                          >
                            {testSending[`${store}_daily`] ? 'Sending…' : 'Send test daily'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-secondary"
                            onClick={() => handleTestEmail('weekly')}
                            disabled={testSending[`${store}_weekly`] || recipients.length === 0}
                          >
                            {testSending[`${store}_weekly`] ? 'Sending…' : 'Send test weekly'}
                          </button>
                          {recipients.length === 0 && (
                            <span className="text-xs text-gray-400 self-center">Add recipients to send test emails</span>
                          )}
                        </div>

                        {/* Send log — last 4 */}
                        {Array.isArray(settings.sendLog) && settings.sendLog.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-gray-100">
                            <p className="text-xs font-semibold text-gray-600 mb-2">Recent sends</p>
                            <div className="space-y-1.5">
                              {settings.sendLog.slice(0, 4).map((entry, i) => (
                                <div key={i} className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg ${entry.status === 'sent' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${entry.status === 'sent' ? 'bg-green-500' : 'bg-red-500'}`} />
                                  <span className="font-medium capitalize">{entry.type}{entry.isTest ? ' (test)' : ''}</span>
                                  <span className="text-gray-500">—</span>
                                  <span>{entry.status === 'sent' ? 'Sent' : `Failed: ${entry.error || 'unknown'}`}</span>
                                  <span className="ml-auto text-gray-400 flex-shrink-0">{entry.sentAt ? new Date(entry.sentAt).toLocaleString() : ''}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {settings.updatedAt && (
                          <p className="text-[10px] text-gray-400 mt-3">Last updated: {new Date(settings.updatedAt).toLocaleString()}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* Settings tab removed - use System Health page for API configuration */}
        </div>
      </div>
    </>
  )
}
