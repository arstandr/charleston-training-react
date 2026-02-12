import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, limit, query, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import { useStaffAccounts } from '../hooks/useStaffAccounts'
import { useTrainingData } from '../hooks/useTrainingData'
import { checkGeminiConfigured, setGeminiKeyToFirestore } from '../services/ai'
import { setToastCredentials } from '../services/toast'
import { getPendingFlags, dismissFlag, fixAndRestoreFlag } from '../services/flashcardFlags'
import { getTraineeReadinessAggregate } from '../utils/helpers'

export default function AdminPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentUser } = useAuth()
  const { staffAccounts } = useStaffAccounts()
  const { listTrainees, trainingData } = useTrainingData()
  const tabParam = searchParams.get('tab')
  const [tab, setTab] = useState(() => {
    if (tabParam && ['audit', 'alerts', 'debug', 'settings', 'trainees'].includes(tabParam)) return tabParam
    return 'audit'
  })
  useEffect(() => {
    if (tabParam && ['audit', 'alerts', 'debug', 'settings', 'trainees'].includes(tabParam)) setTab(tabParam)
  }, [tabParam])
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [geminiStatus, setGeminiStatus] = useState(null)
  const [geminiKeyInput, setGeminiKeyInput] = useState('')
  const [geminiAdminCode, setGeminiAdminCode] = useState('0000')
  const [geminiSaveStatus, setGeminiSaveStatus] = useState(null)
  const [geminiSaving, setGeminiSaving] = useState(false)
  const [toastClientId, setToastClientId] = useState('')
  const [toastClientSecret, setToastClientSecret] = useState('')
  const [toastAdminCode, setToastAdminCode] = useState('0000')
  const [toastSaveStatus, setToastSaveStatus] = useState(null)
  const [toastSaving, setToastSaving] = useState(false)
  const [toastWestfieldGuid, setToastWestfieldGuid] = useState('')
  const [toastCastletonGuid, setToastCastletonGuid] = useState('')
  const [toastMenuStore, setToastMenuStore] = useState('Westfield')
  const [toastStoreGuidsLoaded, setToastStoreGuidsLoaded] = useState(false)
  const [toastStoreGuidsSaving, setToastStoreGuidsSaving] = useState(false)
  const [toastStoreGuidsStatus, setToastStoreGuidsStatus] = useState(null)
  const [helpContentDraft, setHelpContentDraft] = useState('')
  const [helpContentLoaded, setHelpContentLoaded] = useState(false)
  const [helpContentSaveStatus, setHelpContentSaveStatus] = useState(null)
  const [helpContentSaving, setHelpContentSaving] = useState(false)
  const [contentAlerts, setContentAlerts] = useState([])
  const [contentAlertsLoading, setContentAlertsLoading] = useState(false)

  const staffCount = Object.keys(staffAccounts || {}).filter((k) => staffAccounts[k] && !staffAccounts[k].archived).length
  const trainees = listTrainees({ store: null, includeArchived: false })
  const traineeCount = trainees.length

  useEffect(() => {
    if (tab !== 'audit') return
    let cancelled = false
    setAuditLoading(true)
    const ref = collection(db, 'auditLog')
    getDocs(query(ref, limit(100)))
      .then((snap) => {
        if (cancelled) return
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? a.timestamp ?? 0
          const tb = b.createdAt?.toMillis?.() ?? b.timestamp ?? 0
          return tb - ta
        })
        setAuditLogs(list)
      })
      .catch(() => {
        if (!cancelled) setAuditLogs([])
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false)
      })
    return () => { cancelled = true }
  }, [tab])

  useEffect(() => {
    if (tab !== 'settings') return
    checkGeminiConfigured().then((ok) => setGeminiStatus(ok ? 'Configured' : 'Not configured'))
  }, [tab])

  useEffect(() => {
    if (tab !== 'settings') return
    getDoc(doc(db, 'config', 'helpContent'))
      .then((snap) => {
        const data = snap.exists ? snap.data() : {}
        setHelpContentDraft(data.content ?? data.text ?? '')
        setHelpContentLoaded(true)
      })
      .catch(() => setHelpContentLoaded(true))
  }, [tab])

  useEffect(() => {
    if (tab !== 'settings') return
    Promise.all([
      getDoc(doc(db, 'config', 'toastStoreGuids')),
      getDoc(doc(db, 'config', 'toastMenuStore')),
    ]).then(([guidSnap, menuSnap]) => {
      const guids = guidSnap.exists && guidSnap.data() ? guidSnap.data() : {}
      setToastWestfieldGuid(guids.Westfield || '')
      setToastCastletonGuid(guids.Castleton || '')
      setToastMenuStore(menuSnap.exists && menuSnap.data()?.store ? menuSnap.data().store : 'Westfield')
      setToastStoreGuidsLoaded(true)
    }).catch(() => setToastStoreGuidsLoaded(true))
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
          <p className="text-gray-600 text-sm mb-6">Audit log, debug, and settings.</p>

          <div className="mb-6 flex gap-2 flex-wrap">
            {['audit', 'alerts', 'trainees', 'debug', 'settings'].map((t) => (
              <button
                key={t}
                type="button"
                className={`btn btn-small ${tab === t ? 'ring-2 ring-offset-2 ring-[var(--color-primary)]' : 'btn-secondary'}`}
                onClick={() => setTab(t)}
              >
                {t === 'audit' ? 'Audit log' : t === 'alerts' ? 'Content Alerts' : t === 'trainees' ? 'Trainees & scores' : t === 'debug' ? 'Debug' : 'Settings'}
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
                            <td className="px-4 py-2 text-gray-600">{t.store || '—'}</td>
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
              <h3 className="font-bold text-gray-800 mb-2">Audit log (latest 100)</h3>
              {auditLoading ? (
                <p className="text-gray-500">Loading…</p>
              ) : auditLogs.length === 0 ? (
                <p className="text-gray-500">No audit entries or collection not available.</p>
              ) : (
                <div className="max-h-96 overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <ul className="space-y-2 text-sm">
                    {auditLogs.map((log) => (
                      <li key={log.id} className="rounded border border-gray-200 bg-white p-2">
                        <span className="text-gray-500">
                          {log.createdAt?.toDate?.()?.toISOString?.() ?? log.timestamp ?? log.id}
                        </span>
                        {' — '}
                        <span className="font-medium">{log.action ?? log.type ?? '—'}</span>
                        {log.userId && <span className="text-gray-600"> by {log.userId}</span>}
                        {log.details && (
                          <pre className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">
                            {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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

          {tab === 'settings' && (
            <section>
              <h3 className="font-bold text-gray-800 mb-2">API configuration</h3>
              <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <span>Gemini (AI hints, drift report, quiz/flashcard generation)</span>
                  <span className={geminiStatus === 'Configured' ? 'text-green-600 font-medium' : 'text-amber-600'}>
                    {geminiStatus ?? '—'}
                  </span>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gemini API key</label>
                  <p className="text-xs text-gray-500 mb-2">Stored in Firestore so all users can use AI features. Leave blank to keep current key.</p>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="AIzaSy..."
                    value={geminiKeyInput}
                    onChange={(e) => { setGeminiKeyInput(e.target.value); setGeminiSaveStatus(null) }}
                  />
                  <label className="block text-sm font-medium text-gray-700 mt-2 mb-1">Admin code</label>
                  <input
                    type="text"
                    autoComplete="off"
                    className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
                    value={geminiAdminCode}
                    onChange={(e) => setGeminiAdminCode(e.target.value)}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={geminiSaving || !geminiKeyInput.trim()}
                      onClick={async () => {
                        setGeminiSaving(true)
                        setGeminiSaveStatus(null)
                        const result = await setGeminiKeyToFirestore(geminiKeyInput.trim(), geminiAdminCode)
                        setGeminiSaving(false)
                        setGeminiSaveStatus(result)
                        if (result.success) {
                          setGeminiKeyInput('')
                          checkGeminiConfigured().then(setGeminiStatus)
                        }
                      }}
                    >
                      {geminiSaving ? 'Saving…' : 'Save key'}
                    </button>
                  </div>
                  {geminiSaveStatus && (
                    <p className={`mt-2 text-sm ${geminiSaveStatus.success ? 'text-green-600' : 'text-red-600'}`} role="alert">
                      {geminiSaveStatus.success ? geminiSaveStatus.message : geminiSaveStatus.error}
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
                <div className="font-medium text-gray-800 mb-2">Toast POS — API credentials (shared)</div>
                <p className="text-xs text-gray-500 mb-3">Client ID and Secret are used for all Toast API calls. Leave blank to keep current values.</p>
                <div className="space-y-2 max-w-md">
                  <label className="block text-sm font-medium text-gray-700">Client ID</label>
                  <input
                    type="text"
                    autoComplete="off"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Toast API Client ID"
                    value={toastClientId}
                    onChange={(e) => { setToastClientId(e.target.value); setToastSaveStatus(null) }}
                  />
                  <label className="block text-sm font-medium text-gray-700">Client Secret</label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Toast API Client Secret"
                    value={toastClientSecret}
                    onChange={(e) => { setToastClientSecret(e.target.value); setToastSaveStatus(null) }}
                  />
                  <label className="block text-sm font-medium text-gray-700">Admin code</label>
                  <input
                    type="text"
                    autoComplete="off"
                    className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
                    value={toastAdminCode}
                    onChange={(e) => setToastAdminCode(e.target.value)}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={toastSaving || !toastClientId.trim() || !toastClientSecret.trim()}
                      onClick={async () => {
                        setToastSaving(true)
                        setToastSaveStatus(null)
                        const result = await setToastCredentials({
                          clientId: toastClientId.trim(),
                          clientSecret: toastClientSecret.trim(),
                          adminCode: toastAdminCode,
                        })
                        setToastSaving(false)
                        setToastSaveStatus(result)
                        if (result.success) {
                          setToastClientId('')
                          setToastClientSecret('')
                        }
                      }}
                    >
                      {toastSaving ? 'Saving…' : 'Save Toast credentials'}
                    </button>
                  </div>
                  {toastSaveStatus && (
                    <p className={`text-sm ${toastSaveStatus.success ? 'text-green-600' : 'text-red-600'}`} role="alert">
                      {toastSaveStatus.success ? toastSaveStatus.message : toastSaveStatus.error}
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
                <div className="font-medium text-gray-800 mb-2">Toast — per-store Restaurant GUIDs</div>
                <p className="text-xs text-gray-500 mb-3">Each store uses its own GUID for employees, shifts, etc. Menu Studio and Menu Management use only the store selected below (Westfield/Carmel).</p>
                {toastStoreGuidsLoaded && (
                  <div className="space-y-3 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Westfield Restaurant GUID</label>
                      <input
                        type="text"
                        autoComplete="off"
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Westfield location GUID"
                        value={toastWestfieldGuid}
                        onChange={(e) => { setToastWestfieldGuid(e.target.value); setToastStoreGuidsStatus(null) }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Castleton Restaurant GUID</label>
                      <input
                        type="text"
                        autoComplete="off"
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Castleton location GUID"
                        value={toastCastletonGuid}
                        onChange={(e) => { setToastCastletonGuid(e.target.value); setToastStoreGuidsStatus(null) }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Menu (Westfield/Carmel only)</label>
                      <p className="text-xs text-gray-500 mb-1">Menu Studio and Menu Management use this store&apos;s GUID only.</p>
                      <select
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        value={toastMenuStore}
                        onChange={(e) => { setToastMenuStore(e.target.value); setToastStoreGuidsStatus(null) }}
                      >
                        <option value="Westfield">Westfield</option>
                        <option value="Castleton">Castleton</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={toastStoreGuidsSaving}
                        onClick={async () => {
                          setToastStoreGuidsSaving(true)
                          setToastStoreGuidsStatus(null)
                          try {
                            await setDoc(doc(db, 'config', 'toastStoreGuids'), {
                              Westfield: toastWestfieldGuid.trim() || undefined,
                              Castleton: toastCastletonGuid.trim() || undefined,
                              updatedAt: new Date().toISOString(),
                            }, { merge: true })
                            await setDoc(doc(db, 'config', 'toastMenuStore'), {
                              store: toastMenuStore,
                              updatedAt: new Date().toISOString(),
                            }, { merge: true })
                            setToastStoreGuidsStatus({ success: true, message: 'Store GUIDs and menu store saved.' })
                          } catch (err) {
                            setToastStoreGuidsStatus({ success: false, error: err.message || 'Failed to save.' })
                          }
                          setToastStoreGuidsSaving(false)
                        }}
                      >
                        {toastStoreGuidsSaving ? 'Saving…' : 'Save store GUIDs'}
                      </button>
                    </div>
                    {toastStoreGuidsStatus && (
                      <p className={`text-sm ${toastStoreGuidsStatus.success ? 'text-green-600' : 'text-red-600'}`} role="alert">
                        {toastStoreGuidsStatus.success ? toastStoreGuidsStatus.message : toastStoreGuidsStatus.error}
                      </p>
                    )}
                  </div>
                )}
                {!toastStoreGuidsLoaded && <p className="text-gray-500">Loading…</p>}
              </div>
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                <div className="font-medium text-gray-800 mb-2">Help content (?)</div>
                <p className="text-xs text-gray-500 mb-3">This text is shown in the &quot;?&quot; help panel in the bottom-right corner. All authenticated users can see it.</p>
                {helpContentLoaded && (
                  <>
                    <textarea
                      className="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm min-h-[200px]"
                      placeholder="Enter help text, quick reference, or instructions…"
                      value={helpContentDraft}
                      onChange={(e) => { setHelpContentDraft(e.target.value); setHelpContentSaveStatus(null) }}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={helpContentSaving}
                        onClick={async () => {
                          setHelpContentSaving(true)
                          setHelpContentSaveStatus(null)
                          try {
                            await setDoc(doc(db, 'config', 'helpContent'), {
                              content: helpContentDraft.trim(),
                              updatedAt: new Date().toISOString(),
                            }, { merge: true })
                            setHelpContentSaveStatus({ success: true, message: 'Help content saved.' })
                          } catch (err) {
                            setHelpContentSaveStatus({ success: false, error: err.message || 'Failed to save.' })
                          }
                          setHelpContentSaving(false)
                        }}
                      >
                        {helpContentSaving ? 'Saving…' : 'Save help content'}
                      </button>
                    </div>
                    {helpContentSaveStatus && (
                      <p className={`mt-2 text-sm ${helpContentSaveStatus.success ? 'text-green-600' : 'text-red-600'}`} role="alert">
                        {helpContentSaveStatus.success ? helpContentSaveStatus.message : helpContentSaveStatus.error}
                      </p>
                    )}
                  </>
                )}
                {!helpContentLoaded && <p className="text-gray-500">Loading…</p>}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
