import { useState, useRef } from 'react'
import { parseHotSchedulesPDF, matchEmployeesToTrainers, buildScheduleArray } from '../services/hotSchedulesParser'
import { updateTrainer } from '../services/trainerService'

/**
 * Three-phase HotSchedules PDF upload:
 *  1. Upload — drag-drop a PDF
 *  2. Preview & Match — review parsed employees, match to trainers
 *  3. Confirm & Save — write schedules to Firestore
 */
export default function HotSchedulesUpload({ store, trainers, locationGuid, onComplete }) {
  const [phase, setPhase] = useState('upload') // upload | preview | saving | done
  const [dragActive, setDragActive] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  // Parsed data
  const [parsedData, setParsedData] = useState(null) // { weekDates, storeName, employees }
  const [matchResult, setMatchResult] = useState(null) // { matched, unmatched }
  const [overrides, setOverrides] = useState({}) // employeeName -> trainerId

  // Save progress
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 })
  const [saveResults, setSaveResults] = useState(null)

  // ---- Phase 1: Upload ----

  function handleDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const files = e.dataTransfer?.files
    if (files?.length) handleFile(files[0])
  }

  function handleFileInput(e) {
    const files = e.target?.files
    if (files?.length) handleFile(files[0])
  }

  async function handleFile(file) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10MB.')
      return
    }

    setError(null)
    setParsing(true)
    try {
      const data = await parseHotSchedulesPDF(file)
      if (!data.employees.length) {
        setError('No employee schedules found in this PDF. Make sure it\'s a HotSchedules Extended Schedule Report.')
        setParsing(false)
        return
      }
      setParsedData(data)
      const result = matchEmployeesToTrainers(data.employees, trainers)
      setMatchResult(result)
      setOverrides({})
      setPhase('preview')
    } catch (err) {
      console.error('[HotSchedules] Parse error:', err)
      setError('Failed to parse PDF: ' + (err.message || 'Unknown error'))
    } finally {
      setParsing(false)
    }
  }

  // ---- Phase 2: Preview & Match ----

  function handleOverride(employeeName, trainerId) {
    setOverrides((prev) => ({ ...prev, [employeeName]: trainerId || null }))
  }

  function getEffectiveMatches() {
    if (!matchResult) return []
    const all = []

    for (const m of matchResult.matched) {
      const overrideId = overrides[m.employee.name]
      if (overrideId === '__none__') continue // explicitly unmatched by user
      const trainer = overrideId
        ? trainers.find((t) => t.empNum === overrideId) || m.trainer
        : m.trainer
      all.push({ employee: m.employee, trainer, shifts: m.shifts })
    }

    for (const u of matchResult.unmatched) {
      const overrideId = overrides[u.employee.name]
      if (overrideId && overrideId !== '__none__') {
        const trainer = trainers.find((t) => t.empNum === overrideId)
        if (trainer) {
          all.push({ employee: u.employee, trainer, shifts: u.employee.shifts })
        }
      }
    }

    return all
  }

  // ---- Phase 3: Save ----

  async function handleSave() {
    const matches = getEffectiveMatches()
    if (!matches.length) return

    setPhase('saving')
    setSaveProgress({ current: 0, total: matches.length })
    const results = { success: 0, failed: 0, names: [] }

    for (let i = 0; i < matches.length; i++) {
      const { trainer, shifts } = matches[i]
      try {
        const newShifts = buildScheduleArray(shifts)
        // Merge with existing schedule instead of replacing
        const existing = (trainer.schedule || []).filter((s) => s.source !== 'hotschedules')
        const schedule = [...existing, ...newShifts]
          .sort((a, b) => new Date(a.startTime || a.inDate || a.date) - new Date(b.startTime || b.inDate || b.date))
        // Use Firestore doc ID if available (empNum may differ from doc ID when matched by toastGuid)
        const docId = trainer.firestoreDocId || trainer.empNum
        const updateData = {
          schedule,
          scheduleLastUpdated: new Date().toISOString(),
        }
        // Include locationGuid so new docs are findable by store query
        if (locationGuid) updateData.locationGuid = locationGuid
        await updateTrainer(docId, updateData)
        results.success++
        results.names.push(trainer.name)
      } catch (err) {
        console.error(`[HotSchedules] Failed to save schedule for ${trainer.name}:`, err)
        results.failed++
      }
      setSaveProgress({ current: i + 1, total: matches.length })
    }

    setSaveResults(results)
    setPhase('done')
  }

  // ---- Render ----

  if (phase === 'upload') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => onComplete?.()}
            className="text-gray-500 hover:text-gray-700"
          >
            &larr; Back
          </button>
          <h3 className="text-lg font-bold text-gray-800">Upload HotSchedules PDF</h3>
        </div>

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !parsing && fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all
            ${dragActive ? 'border-[var(--color-primary)] bg-green-50' : 'border-gray-300 hover:border-[var(--color-primary)] hover:bg-gray-50'}
            ${parsing ? 'opacity-50 cursor-wait' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileInput}
            className="hidden"
            disabled={parsing}
          />
          {parsing ? (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-[var(--color-primary)] border-t-transparent mx-auto mb-4" />
              <p className="text-gray-600 font-semibold">Parsing schedule...</p>
              <p className="text-gray-400 text-sm mt-1">Extracting employee shifts from PDF</p>
            </>
          ) : (
            <>
              <div className="text-6xl mb-4">📤</div>
              <p className="text-[var(--color-primary)] font-bold text-lg mb-2">
                Drop HotSchedules PDF here
              </p>
              <p className="text-gray-500 text-sm">or click to choose file</p>
              <p className="text-gray-400 text-xs mt-3">
                Accepts: Extended Schedule Report PDF (max 10MB)
              </p>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-bold text-blue-900 mb-2">How to get the report from HotSchedules</p>
          <ol className="text-sm text-blue-800 space-y-1.5 list-decimal list-inside">
            <li>Log in to HotSchedules and go to the <strong>Reporting</strong> tab</li>
            <li>Under <strong>Schedules &amp; Rosters</strong>, select <strong>Extended Schedule Report</strong></li>
            <li>Set the date range for the week you want to import</li>
            <li>Click <strong>Generate Report</strong> to preview it</li>
            <li>Print the page (Ctrl+P / Cmd+P) and choose <strong>Save as PDF</strong></li>
            <li>Drop that PDF here — we'll extract employee names and shift times</li>
          </ol>
          <p className="text-xs text-blue-700 mt-3 border-t border-blue-200 pt-2">
            After upload, review the matches between HotSchedules employees and your trainers, then confirm to import.
            Existing Toast schedules are preserved. End times are estimated (start + 6 hours) since the PDF only shows start times.
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'preview') {
    const effectiveMatches = getEffectiveMatches()
    const totalEmployees = (matchResult?.matched.length || 0) + (matchResult?.unmatched.length || 0)

    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => { setPhase('upload'); setParsedData(null); setMatchResult(null) }}
            className="text-gray-500 hover:text-gray-700"
          >
            &larr; Back
          </button>
          <h3 className="text-lg font-bold text-gray-800">Review Schedule Import</h3>
        </div>

        {/* Summary */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
          <div className="flex flex-wrap gap-6 text-sm">
            {parsedData?.storeName && (
              <div>
                <span className="text-gray-500">Store:</span>{' '}
                <span className="font-semibold text-gray-800">{parsedData.storeName}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">Week:</span>{' '}
              <span className="font-semibold text-gray-800">
                {parsedData?.weekDates?.[0] || '?'} to {parsedData?.weekDates?.[parsedData.weekDates.length - 1] || '?'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Employees found:</span>{' '}
              <span className="font-semibold text-gray-800">{totalEmployees}</span>
            </div>
            <div>
              <span className="text-gray-500">Matched to trainers:</span>{' '}
              <span className="font-semibold text-green-700">{effectiveMatches.length}</span>
            </div>
          </div>
        </div>

        {/* Matched employees */}
        {matchResult?.matched.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3 border-l-4 border-l-green-500 pl-3">
              Matched ({matchResult.matched.length})
            </h4>
            <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
              {matchResult.matched.map((m) => {
                const overrideId = overrides[m.employee.name]
                return (
                  <div key={m.employee.name} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 truncate">{m.employee.name}</div>
                      <div className="text-xs text-gray-500">{m.shifts.length} shift{m.shifts.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 text-sm">&#10003;</span>
                      <select
                        value={overrideId ?? m.trainer.empNum}
                        onChange={(e) => handleOverride(m.employee.name, e.target.value)}
                        className="rounded border border-gray-200 px-2 py-1 text-sm max-w-[180px]"
                      >
                        <option value={m.trainer.empNum}>{m.trainer.name}</option>
                        <option value="__none__">-- Skip --</option>
                        {trainers
                          .filter((t) => t.empNum !== m.trainer.empNum)
                          .map((t) => (
                            <option key={t.empNum} value={t.empNum}>{t.name}</option>
                          ))
                        }
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Unmatched employees */}
        {matchResult?.unmatched.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3 border-l-4 border-l-amber-500 pl-3">
              Unmatched ({matchResult.unmatched.length})
            </h4>
            <div className="rounded-xl border border-amber-200 bg-amber-50 divide-y divide-amber-100">
              {matchResult.unmatched.map((u) => {
                const overrideId = overrides[u.employee.name]
                return (
                  <div key={u.employee.name} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 truncate">{u.employee.name}</div>
                      <div className="text-xs text-gray-500">{u.employee.shifts.length} shift{u.employee.shifts.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={overrideId || ''}
                        onChange={(e) => handleOverride(u.employee.name, e.target.value)}
                        className="rounded border border-amber-300 bg-white px-2 py-1 text-sm max-w-[180px]"
                      >
                        <option value="">-- Assign trainer --</option>
                        {trainers.map((t) => (
                          <option key={t.empNum} value={t.empNum}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={() => { setPhase('upload'); setParsedData(null); setMatchResult(null) }}
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!effectiveMatches.length}
            className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import {effectiveMatches.length} Schedule{effectiveMatches.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'saving') {
    const pct = saveProgress.total ? Math.round((saveProgress.current / saveProgress.total) * 100) : 0
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[var(--color-primary)] border-t-transparent mx-auto mb-6" />
        <h3 className="text-lg font-bold text-gray-800 mb-2">Importing Schedules...</h3>
        <p className="text-sm text-gray-600 mb-4">
          {saveProgress.current} of {saveProgress.total} trainers
        </p>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-[var(--color-primary)] h-2 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">&#10003;</div>
        <h3 className="text-lg font-bold text-gray-800 mb-2">Import Complete</h3>
        <p className="text-sm text-gray-600 mb-2">
          Updated schedules for {saveResults?.success || 0} trainer{(saveResults?.success || 0) !== 1 ? 's' : ''}.
        </p>
        {saveResults?.names?.length > 0 && (
          <p className="text-xs text-gray-500 mb-4">
            {saveResults.names.join(', ')}
          </p>
        )}
        {saveResults?.failed > 0 && (
          <p className="text-sm text-red-600 mb-4">
            {saveResults.failed} failed to save.
          </p>
        )}
        <p className="text-xs text-gray-400 mb-6">
          End times are estimated (start + 6 hours). Trainers can adjust in their dashboard.
        </p>
        <button
          type="button"
          onClick={() => onComplete?.()}
          className="px-6 py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-semibold text-sm hover:opacity-90"
        >
          Back to Overview
        </button>
      </div>
    )
  }

  return null
}
