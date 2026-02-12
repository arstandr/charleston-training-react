import { useState, useMemo } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useConfirm } from '../contexts/ConfirmContext'
import AppHeader from '../components/AppHeader'
import OwnerNavBar from '../components/OwnerNavBar'
import { useTrainingData } from '../hooks/useTrainingData'
import { useStaffAccounts } from '../hooks/useStaffAccounts'
import { parseCSV, parseJSON, readFileAsText, normalizeToRows, extractTextFromPDF, extractTextFromWord } from '../services/import'

const TARGETS = [
  { id: 'trainingData', label: 'Training data (trainees, schedules)' },
  { id: 'staffAccounts', label: 'Staff accounts' },
]

export default function DataImportPage() {
  const { currentUser } = useAuth()
  const confirm = useConfirm()
  const { trainingData, listTrainees, restoreTrainee, restartTraineeTraining } = useTrainingData()
  const { staffAccounts, restoreStaff } = useStaffAccounts()
  const [file, setFile] = useState(null)
  const [target, setTarget] = useState('trainingData')
  const [preview, setPreview] = useState(null)
  const [extractedText, setExtractedText] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exportStatus, setExportStatus] = useState(null)

  const archivedTrainees = useMemo(
    () => listTrainees({ store: null, includeArchived: true }).filter((t) => t.archived),
    [trainingData, listTrainees]
  )
  const archivedStaffList = useMemo(
    () =>
      Object.entries(staffAccounts || {})
        .filter(([, info]) => info?.archived)
        .map(([emp, info]) => ({ emp, ...info })),
    [staffAccounts]
  )

  async function handleFileChange(e) {
    const f = e.target.files?.[0]
    setFile(f)
    setPreview(null)
    setExtractedText(null)
    setError(null)
    if (!f) return
    const ext = (f.name || '').split('.').pop()?.toLowerCase()
    try {
      if (ext === 'pdf') {
        const text = await extractTextFromPDF(f)
        setExtractedText(text)
        try {
          const parsed = parseJSON(text)
          const rows = normalizeToRows(parsed)
          if (rows.length > 0) setPreview(rows)
        } catch (_) {}
        return
      }
      if (ext === 'docx' || ext === 'doc') {
        const text = await extractTextFromWord(f)
        setExtractedText(text)
        try {
          const parsed = parseJSON(text)
          const rows = normalizeToRows(parsed)
          if (rows.length > 0) setPreview(rows)
        } catch (_) {}
        return
      }
      const text = await readFileAsText(f)
      let parsed
      if (ext === 'csv') {
        parsed = parseCSV(text)
      } else if (ext === 'json') {
        parsed = parseJSON(text)
        parsed = normalizeToRows(parsed)
      } else {
        setError('Use a .csv, .json, .pdf, or .docx file.')
        return
      }
      setPreview(parsed)
    } catch (err) {
      setError(err.message || 'Parse failed')
    }
  }

  async function handleWrite() {
    if (!preview || !Array.isArray(preview) || preview.length === 0) {
      setError('No data to write.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const ref = doc(db, 'config', target)
      const snap = await getDoc(ref)
      const existing = snap.exists() ? snap.data() : {}
      let next
      if (target === 'staffAccounts') {
        next = { ...existing }
        preview.forEach((row) => {
          const emp = row.empNum ?? row.employeeNumber ?? row.id
          if (emp) next[String(emp)] = { ...(next[String(emp)] || {}), ...row, empNum: String(emp) }
        })
      } else {
        next = { ...existing, ...(existing.data || existing) }
        preview.forEach((row) => {
          const id = row.id ?? row.traineeId
          if (id) next[id] = { ...(next[id] || {}), ...row }
        })
      }
      const payload = target === 'staffAccounts' ? next : { data: next }
      await setDoc(ref, payload, { merge: true })
      setExportStatus('Written successfully.')
    } catch (err) {
      setError(err.message || 'Write failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleExport() {
    setExportStatus('Exporting…')
    setError(null)
    try {
      const configRef = doc(db, 'config', 'trainingData')
      const staffRef = doc(db, 'config', 'staffAccounts')
      const [trainingSnap, staffSnap] = await Promise.all([getDoc(configRef), getDoc(staffRef)])
      const out = {
        exportedAt: new Date().toISOString(),
        config: {
          trainingData: trainingSnap.exists() ? trainingSnap.data() : null,
          staffAccounts: staffSnap.exists() ? staffSnap.data() : null,
        },
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `chartrain-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      setExportStatus('Export downloaded.')
    } catch (err) {
      setError(err.message || 'Export failed')
      setExportStatus(null)
    }
  }

  return (
    <>
      <AppHeader />
      <div className="container mx-auto px-4 pb-8">
        <OwnerNavBar />
        <div className="content-area">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Data import / export</h2>
          <p className="text-gray-600 text-sm mb-6">
            Admin only. Import CSV/JSON/PDF/Word into config; export Firestore config as JSON.
          </p>

          <section className="mb-8">
            <h3 className="font-bold text-gray-800 mb-2">Import</h3>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <input
                type="file"
                accept=".csv,.json,.pdf,.docx,.doc"
                onChange={handleFileChange}
                className="text-sm"
              />
              <label className="flex items-center gap-2">
                <span className="text-sm text-gray-700">Target:</span>
                <select
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {TARGETS.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-small"
                disabled={!preview?.length || loading}
                onClick={handleWrite}
              >
                {loading ? 'Writing…' : 'Write to Firestore'}
              </button>
            </div>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
            )}
            {extractedText != null && (
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-600 mb-2">Extracted text (PDF/Word)</p>
                <pre className="max-h-48 overflow-auto text-xs text-gray-700 whitespace-pre-wrap">{extractedText.slice(0, 10000)}{extractedText.length > 10000 ? '…' : ''}</pre>
              </div>
            )}
            {preview != null && preview.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-600 mb-2">Preview ({preview.length} rows)</p>
                <pre className="max-h-64 overflow-auto text-xs text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(preview.slice(0, 5), null, 2)}
                  {preview.length > 5 ? `\n... and ${preview.length - 5} more` : ''}
                </pre>
              </div>
            )}
          </section>

          <section className="mb-8">
            <h3 className="font-bold text-gray-800 mb-2">Export</h3>
            <p className="text-sm text-gray-600 mb-2">Download config (trainingData, staffAccounts) as JSON.</p>
            <button type="button" className="btn btn-small btn-secondary" onClick={handleExport}>
              Download JSON export
            </button>
            {exportStatus && <p className="mt-2 text-sm text-gray-600">{exportStatus}</p>}
          </section>

          <section>
            <h3 className="font-bold text-gray-800 mb-2">Archived employees</h3>
            <p className="text-sm text-gray-600 mb-4">Restore or restart training for archived trainees and staff.</p>

            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Archived trainees</h4>
              {archivedTrainees.length === 0 ? (
                <p className="text-gray-500 text-sm">No archived trainees.</p>
              ) : (
                <div className="space-y-2">
                  {archivedTrainees.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3"
                    >
                      <div className="font-medium text-gray-800">
                        {t.name || 'Unnamed'} #{t.employeeNumber || t.id} · {t.store || ''}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-small btn-secondary"
                          onClick={() => restoreTrainee(t.id)}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() =>
                            confirm(
                              'Restart training? This clears schedule progress, checklist data, and test attempts. Trainee will need to redo shifts and tests.',
                              'Restart training'
                            ).then((ok) => ok && restartTraineeTraining(t.id))
                          }
                        >
                          Restart training
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Archived staff</h4>
              {archivedStaffList.length === 0 ? (
                <p className="text-gray-500 text-sm">No archived staff.</p>
              ) : (
                <div className="space-y-2">
                  {archivedStaffList.map((s) => (
                    <div
                      key={s.emp}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3"
                    >
                      <div className="font-medium text-gray-800">
                        {s.name || 'Unnamed'} #{s.emp} · {s.role || ''} · {s.store || ''}
                      </div>
                      <button
                        type="button"
                        className="btn btn-small btn-secondary"
                        onClick={() => restoreStaff(s.emp)}
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
