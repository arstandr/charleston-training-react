import { useState, useEffect, useMemo, useRef } from 'react'
import { SHIFT_META } from '../constants'
import { getShiftChecklistTemplate, EXERCISE_DEFINITIONS, getTestForShift } from '../data/shiftChecklistTemplates'
import { formatWhenHuman, getShiftStatus, updateChecklistItem, updateShiftFeedback, getShiftAuditEntries } from '../utils/helpers'
import ShiftChecklist, { getChecklistSections, TRAINING_MISSION_STATEMENT } from './ShiftChecklist'
import StandardsQuizModal from './StandardsQuizModal'
import TestReviewModal from './TestReviewModal'
import PerformanceAppraisalGrid, { getAppraisalItems } from './PerformanceAppraisalGrid'
import PracticeGreetExercise from './exercises/PracticeGreetExercise'
import ServiceReviewExercise from './exercises/ServiceReviewExercise'
import WineExercise from './exercises/WineExercise'
import UpsellingExercise from './exercises/UpsellingExercise'

function DiscussItemsList({ shiftKey }) {
  const discussItems = useMemo(() => {
    const template = getShiftChecklistTemplate(shiftKey)
    if (!template?.sections) return []
    const items = []
    for (const section of template.sections) {
      for (const item of section.items || []) {
        if (item.discuss) items.push({ id: item.id, label: item.text })
      }
    }
    return items
  }, [shiftKey])
  if (discussItems.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No specific discussion points for this shift type. Use the checklist to guide conversation.
      </p>
    )
  }
  return (
    <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
      {discussItems.map((item) => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  )
}

export default function ShiftDetailView({
  shiftKey,
  rec,
  traineeId,
  staffAccounts = {},
  onBack,
  onRateSignOff,
  canSignOff = false,
  canEditChecklist = false,
  currentUserEmpNum = '',
  trainingData = {},
  setTrainingData,
  saveTrainingData,
  showAuditButton = false,
}) {
  const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey, icon: '' }
  const item = (rec?.schedule && rec.schedule[shiftKey]) || {}
  const status = getShiftStatus(rec, shiftKey)
  const whenStr = item.when ? formatWhenHuman(item.when) : 'Not scheduled'
  const getName = (emp) => {
    const r = staffAccounts[emp]
    return (r && r.name) ? r.name : (emp ? `#${emp}` : '—')
  }
  const trainerName = item.trainer ? getName(item.trainer) : 'Not assigned'
  const feedback = (rec?.shiftFeedback && rec.shiftFeedback[shiftKey]) || {}
  const appraisalRatings = feedback.appraisalRatings || {}
  const clInst = (rec?.checklists && rec.checklists[shiftKey]) || {}
  const clItems = clInst.items || {}
  const exercisePanelData = clInst.exercisePanelData || {}
  const trainerSignStr = item.trainerSignedBy
    ? `${getName(item.trainerSignedBy)}${item.trainerSignedAt ? ' · ' + formatWhenHuman(item.trainerSignedAt) : ''}`
    : '—'
  const managerSignStr = item.managerSignedBy
    ? `${getName(item.managerSignedBy)}${item.managerSignedAt ? ' · ' + formatWhenHuman(item.managerSignedAt) : ''}`
    : '—'

  const [sogDraft, setSogDraft] = useState({
    strengths: feedback.strengths ?? '',
    opportunities: feedback.opportunities ?? '',
    goalsNext: feedback.goalsNext ?? '',
    goal1: feedback.goal1 ?? feedback.goalsNext ?? '',
    goal2: feedback.goal2 ?? '',
    goal3: feedback.goal3 ?? '',
  })
  const [standardsQuizOpen, setStandardsQuizOpen] = useState(false)
  const [reviewTestOpen, setReviewTestOpen] = useState(false)
  const shiftTestId = (() => { const cfg = getTestForShift(shiftKey); return cfg ? (cfg.quizTestId ?? 'verbal_cert') : null })()
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false)
  const [openExercise, setOpenExercise] = useState(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [pageIdx, setPageIdx] = useState(0)
  const exercisePanelRef = useRef(null)
  const contentRef = useRef(null)

  useEffect(() => {
    if (openExercise && exercisePanelRef.current) {
      setTimeout(() => {
        exercisePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    }
  }, [openExercise])

  const auditEntries = getShiftAuditEntries(rec, shiftKey)

  useEffect(() => {
    setSogDraft({
      strengths: feedback.strengths ?? '',
      opportunities: feedback.opportunities ?? '',
      goalsNext: feedback.goalsNext ?? '',
      goal1: feedback.goal1 ?? feedback.goalsNext ?? '',
      goal2: feedback.goal2 ?? '',
      goal3: feedback.goal3 ?? '',
    })
  }, [feedback.strengths, feedback.opportunities, feedback.goalsNext, feedback.goal1, feedback.goal2, feedback.goal3])

  // Scroll to top of content on page change
  useEffect(() => {
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [pageIdx])

  function handleChecklistItemChange(itemId, value) {
    if (!traineeId || !setTrainingData || !saveTrainingData) return
    const next = updateChecklistItem(trainingData, traineeId, shiftKey, itemId, value, currentUserEmpNum || undefined)
    setTrainingData(next)
    saveTrainingData(next)
  }

  function handleSaveSog() {
    if (!traineeId || !setTrainingData || !saveTrainingData) return
    const next = updateShiftFeedback(trainingData, traineeId, shiftKey, {
      strengths: sogDraft.strengths || undefined,
      opportunities: sogDraft.opportunities || undefined,
      goalsNext: sogDraft.goalsNext || undefined,
      goal1: sogDraft.goal1 || undefined,
      goal2: sogDraft.goal2 || undefined,
      goal3: sogDraft.goal3 || undefined,
      appraisalRatings: Object.keys(appraisalRatings).length ? appraisalRatings : undefined,
    })
    if (next === trainingData) return
    setTrainingData(next)
    saveTrainingData(next)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2500)
  }

  function handleAppraisalChange(ratings) {
    if (!traineeId || !setTrainingData || !saveTrainingData) return
    const next = updateShiftFeedback(trainingData, traineeId, shiftKey, {
      ...feedback,
      appraisalRatings: ratings,
    })
    setTrainingData(next)
    saveTrainingData(next)
  }

  function handleExerciseDataChange(exerciseKey, newData) {
    if (!traineeId || !setTrainingData || !saveTrainingData) return
    const next = JSON.parse(JSON.stringify(trainingData || {}))
    const r = next[traineeId]
    if (!r) return
    r.checklists = r.checklists || {}
    r.checklists[shiftKey] = r.checklists[shiftKey] || {}
    r.checklists[shiftKey].items = r.checklists[shiftKey].items || {}
    r.checklists[shiftKey].exercisePanelData = { ...(r.checklists[shiftKey].exercisePanelData || {}), [exerciseKey]: newData }
    r.checklists[shiftKey].lastUpdated = new Date().toISOString()
    setTrainingData(next)
    saveTrainingData(next)
  }

  function isExerciseComplete(exId) {
    const pd = exercisePanelData[exId] || {}
    if (exId === 'practiceGreet') {
      const greetPoints = pd.greetPoints
      const filled = Array.isArray(greetPoints) ? greetPoints.filter((p) => p && String(p).trim()).length : Object.values(greetPoints || {}).filter(Boolean).length
      return filled >= 3 && (pd.managerName || pd.managerGreeted || '').trim().length > 0
    }
    if (exId === 'serviceReview_rev1') return Object.values(pd.grades || {}).filter((v) => v === 'pass' || v === 'fail').length >= 5
    if (exId === 'serviceReview_rev4') return Object.values(pd.grades || {}).filter((v) => v === 'pass' || v === 'fail').length >= 6
    if (exId === 'wineExercise' || exId === 'wine_exercise_cert') return Object.values(pd.checks || pd.steps || {}).filter(Boolean).length >= 11
    if (exId === 'upsellingExercise') return Object.values(pd.answers || {}).filter((v) => v !== undefined && v !== null && String(v).trim()).length >= 5
    return false
  }

  // ─── Build pages array ───────────────────────────────────
  const checklistSections = getChecklistSections(shiftKey)

  const pages = useMemo(() => {
    const p = []
    // Checklist section pages
    checklistSections.forEach((section, i) => {
      p.push({ type: 'checklist', section, label: section.title, stepLabel: 'Step 1: Checklist' })
    })
    // Step 2: Coaching
    p.push({ type: 'coaching', label: 'Coaching / Q&A', stepLabel: 'Step 2' })
    // Performance Appraisal (only if can edit)
    if (canEditChecklist) {
      p.push({ type: 'appraisal', label: 'Performance Appraisal', stepLabel: 'Performance Appraisal' })
    }
    // Step 3: S/O/G
    p.push({ type: 'feedback', label: 'Strengths / Opportunities / Goals', stepLabel: 'Step 3' })
    // Step 4: Sign-off
    p.push({ type: 'signoff', label: 'Sign-off', stepLabel: 'Step 4' })
    return p
  }, [checklistSections, canEditChecklist])

  const totalPages = pages.length
  const currentPage = pages[pageIdx] || pages[0]

  // Helper: get checklist progress for a section
  function getSectionProgress(section) {
    const cbs = section.items.filter((i) => i.type === 'checkbox')
    const checked = cbs.filter((i) => {
      const entry = clItems[i.id]
      const v = entry && typeof entry.value !== 'undefined' ? entry.value : ''
      return v === true || v === 'true' || v === 1
    }).length
    return { checked, total: cbs.length }
  }

  // Overall checklist progress
  const allCbs = checklistSections.flatMap((s) => s.items.filter((i) => i.type === 'checkbox'))
  const allChecked = allCbs.filter((i) => {
    const entry = clItems[i.id]
    const v = entry && typeof entry.value !== 'undefined' ? entry.value : ''
    return v === true || v === 'true' || v === 1
  }).length
  const overallProgress = allCbs.length > 0 ? (allChecked / allCbs.length) * 100 : 0

  // Exercise panel renderer
  function renderExercisePanel() {
    if (!openExercise) return null
    const def = EXERCISE_DEFINITIONS[openExercise]
    if (!def) return null
    const panelData = exercisePanelData[openExercise] || {}
    let content = null
    if (def.component === 'PracticeGreetExercise') {
      content = <PracticeGreetExercise data={panelData} onChange={(d) => handleExerciseDataChange(openExercise, d)} disabled={!canEditChecklist} />
    } else if (def.component === 'ServiceReviewExercise') {
      content = <ServiceReviewExercise data={panelData} onChange={(d) => handleExerciseDataChange(openExercise, d)} questions={def.questions} title={def.title} disabled={!canEditChecklist} />
    } else if (def.component === 'WineExercise') {
      content = <WineExercise data={panelData} onChange={(d) => handleExerciseDataChange(openExercise, d)} variant={def.variant || 'day4'} disabled={!canEditChecklist} />
    } else if (def.component === 'UpsellingExercise') {
      content = <UpsellingExercise data={panelData} onChange={(d) => handleExerciseDataChange(openExercise, d)} disabled={!canEditChecklist} />
    }
    if (!content) return null
    return (
      <div ref={exercisePanelRef} className="mt-4 rounded-xl border-2 border-green-400 bg-white shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-green-50 border-b border-green-200">
          <div className="flex items-center gap-2">
            <span className="text-xl">{def.icon}</span>
            <div>
              <h4 className="font-bold text-gray-900 text-sm">{def.title}</h4>
              {def.subtitle && <p className="text-xs text-green-700">{def.subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={() => setOpenExercise(null)} className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-300 bg-white hover:bg-gray-50">✕ Close</button>
        </div>
        <div className="p-4">{content}</div>
      </div>
    )
  }

  // ─── Render current page content ─────────────────────────
  function renderPageContent() {
    if (currentPage.type === 'checklist') {
      const section = currentPage.section
      const prog = getSectionProgress(section)
      return (
        <>
          <div className="mb-3">
            <h3 className="text-base font-bold text-gray-800">{section.title}</h3>
            {prog.total > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${prog.checked === prog.total ? 'bg-green-500' : 'bg-[var(--color-primary)]'}`}
                    style={{ width: `${(prog.checked / prog.total) * 100}%` }}
                  />
                </div>
                <span className={`text-xs font-medium ${prog.checked === prog.total ? 'text-green-600' : 'text-gray-500'}`}>
                  {prog.checked}/{prog.total}
                </span>
              </div>
            )}
            {section.help && <p className="mt-1 text-xs text-gray-500">{section.help}</p>}
          </div>
          <ShiftChecklist
            shiftKey={shiftKey}
            section={section}
            items={clItems}
            canEdit={canEditChecklist}
            onItemChange={handleChecklistItemChange}
            onOpenExercise={setOpenExercise}
            isExerciseComplete={isExerciseComplete}
            openExercise={openExercise}
          />
          {renderExercisePanel()}
        </>
      )
    }

    if (currentPage.type === 'coaching') {
      return (
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-4">
          <h3 className="mb-1 text-base font-bold text-gray-800">Coaching / Q&amp;A</h3>
          <p className="text-xs text-gray-600 mb-3">Discussion points for this shift (bold items from checklist). Spot-check the trainee&apos;s knowledge on each.</p>
          <DiscussItemsList shiftKey={shiftKey} />
        </div>
      )
    }

    if (currentPage.type === 'appraisal') {
      return (
        <>
          <p className="mb-2 text-xs text-gray-500">Rate observable behaviors during this shift. This is separate from the 1–5 Readiness rating at sign-off.</p>
          <PerformanceAppraisalGrid
            shiftType={shiftKey}
            ratings={appraisalRatings}
            onChange={handleAppraisalChange}
            disabled={!canEditChecklist}
          />
        </>
      )
    }

    if (currentPage.type === 'feedback') {
      return (
        <>
          <h3 className="mb-2 text-base font-bold text-gray-800">Strengths / Opportunities / Goals</h3>
          {canEditChecklist ? (
            <div className="space-y-3 rounded-lg bg-gray-50 p-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Strengths</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[56px]"
                  rows={3}
                  value={sogDraft.strengths}
                  onChange={(e) => setSogDraft((d) => ({ ...d, strengths: e.target.value }))}
                  placeholder="What went well..."
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Opportunities</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[56px]"
                  rows={3}
                  value={sogDraft.opportunities}
                  onChange={(e) => setSogDraft((d) => ({ ...d, opportunities: e.target.value }))}
                  placeholder="Areas to improve..."
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Developmental Goal #1</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[56px]"
                  rows={2}
                  value={sogDraft.goal1}
                  onChange={(e) => setSogDraft((d) => ({ ...d, goal1: e.target.value }))}
                  placeholder="First developmental goal..."
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Developmental Goal #2</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[56px]"
                  rows={2}
                  value={sogDraft.goal2}
                  onChange={(e) => setSogDraft((d) => ({ ...d, goal2: e.target.value }))}
                  placeholder="Second developmental goal..."
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Developmental Goal #3</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[56px]"
                  rows={2}
                  value={sogDraft.goal3}
                  onChange={(e) => setSogDraft((d) => ({ ...d, goal3: e.target.value }))}
                  placeholder="Third developmental goal..."
                />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="btn min-h-[48px]" onClick={handleSaveSog}>
                  Save feedback
                </button>
                {savedFlash && <span className="text-sm font-medium text-green-600">Saved ✓</span>}
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
              {(feedback.strengths || feedback.opportunities || feedback.goal1 || feedback.goal2 || feedback.goal3 || feedback.goalsNext) ? (
                <>
                  {feedback.strengths && <div><span className="font-semibold text-gray-700">Strengths: </span><span className="text-gray-600">{feedback.strengths}</span></div>}
                  {feedback.opportunities && <div><span className="font-semibold text-gray-700">Opportunities: </span><span className="text-gray-600">{feedback.opportunities}</span></div>}
                  {(feedback.goal1 || feedback.goal2 || feedback.goal3) && (
                    <>
                      {feedback.goal1 && <div><span className="font-semibold text-gray-700">Goal #1: </span><span className="text-gray-600">{feedback.goal1}</span></div>}
                      {feedback.goal2 && <div><span className="font-semibold text-gray-700">Goal #2: </span><span className="text-gray-600">{feedback.goal2}</span></div>}
                      {feedback.goal3 && <div><span className="font-semibold text-gray-700">Goal #3: </span><span className="text-gray-600">{feedback.goal3}</span></div>}
                    </>
                  )}
                  {!feedback.goal1 && !feedback.goal2 && !feedback.goal3 && feedback.goalsNext && <div><span className="font-semibold text-gray-700">Goals: </span><span className="text-gray-600">{feedback.goalsNext}</span></div>}
                </>
              ) : (
                <p className="text-gray-500">No feedback yet.</p>
              )}
            </div>
          )}
        </>
      )
    }

    if (currentPage.type === 'signoff') {
      return (
        <>
          <h3 className="mb-2 text-base font-bold text-gray-800">Sign-off</h3>
          <p className="mb-3 text-xs text-gray-500">Complete linked test(s) before sign-off. Trainer and manager signatures below.</p>
          <div className="rounded-lg bg-gray-50 p-4 text-sm space-y-2">
            {shiftKey !== 'foodrun' && (
              <div>
                <span className="font-semibold text-gray-700">Trainer: </span>
                <span className="text-gray-600">{trainerSignStr}</span>
              </div>
            )}
            <div>
              <span className="font-semibold text-gray-700">Manager: </span>
              <span className="text-gray-600">{managerSignStr}</span>
            </div>
          </div>
          {onRateSignOff && (
            <button type="button" className="btn min-h-[56px] w-full mt-4 text-base" onClick={onRateSignOff}>
              Rate &amp; Sign Off
            </button>
          )}
        </>
      )
    }

    return null
  }

  return (
    <div className="shift-detail-view rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm" ref={contentRef}>
      {/* Header */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="text-[var(--color-primary)] hover:underline font-medium" onClick={onBack}>
            ← Dashboard
          </button>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600">{rec?.name || traineeId}</span>
          <span className="text-gray-400">/</span>
          <span className="font-medium text-gray-800">{meta.label}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {shiftKey !== 'foodrun' && (
            <button type="button" className="btn btn-small btn-secondary" onClick={() => setStandardsQuizOpen(true)}>
              Quiz: Standards &amp; 7 Steps
            </button>
          )}
          {shiftTestId && traineeId && (
            <button type="button" className="btn btn-small btn-secondary" onClick={() => setReviewTestOpen(true)}>
              Review test
            </button>
          )}
          {onRateSignOff && (
            <button type="button" className="btn btn-small" onClick={onRateSignOff}>
              Rate &amp; Sign Off
            </button>
          )}
          {showAuditButton && (
            <button type="button" className="btn btn-small btn-secondary" onClick={() => setAuditDrawerOpen(true)}>
              View audit
            </button>
          )}
        </div>
      </div>

      <StandardsQuizModal open={standardsQuizOpen} shiftKey={shiftKey} shiftLabel={meta.label} onClose={() => setStandardsQuizOpen(false)} />
      {reviewTestOpen && shiftTestId && traineeId && (
        <TestReviewModal
          traineeId={traineeId}
          testId={shiftTestId}
          traineeName={rec?.name || traineeId}
          onClose={() => setReviewTestOpen(false)}
        />
      )}

      {/* Shift info */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-800">
          {meta.icon ? <span className="mr-1.5">{meta.icon}</span> : null}
          {meta.label}
        </h2>
        <div className="mt-1 text-sm text-gray-600">{whenStr}</div>
        {shiftKey !== 'foodrun' && <div className="mt-0.5 text-sm text-gray-500">Trainer: {trainerName}</div>}
        <span
          className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold text-white"
          style={{
            backgroundColor:
              status.complete ? '#2e7d32' : status.managerSigned ? '#5e35b1' : status.trainerSigned ? '#5e35b1' : '#e65100',
          }}
        >
          {status.state}
        </span>
      </div>

      {/* Overall progress */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Checklist: {allChecked}/{allCbs.length}</span>
          <span className="font-medium">{currentPage.stepLabel} — Page {pageIdx + 1} of {totalPages}</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-green-500 transition-all duration-300" style={{ width: `${overallProgress}%` }} />
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mb-4 flex-wrap">
        {pages.map((p, i) => {
          let dotColor = 'bg-gray-300'
          if (i === pageIdx) dotColor = 'bg-[var(--color-primary)]'
          else if (p.type === 'checklist') {
            const prog = getSectionProgress(p.section)
            if (prog.total > 0 && prog.checked === prog.total) dotColor = 'bg-green-400'
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => setPageIdx(i)}
              className={`rounded-full transition-all duration-200 ${
                i === pageIdx ? 'w-3 h-3' : 'w-2.5 h-2.5'
              } ${dotColor}`}
            />
          )
        })}
      </div>

      {/* Page content */}
      <div className="mb-4">
        {renderPageContent()}
      </div>

      {/* Prev / Next navigation */}
      {(() => {
        // Gate: appraisal page requires all items rated
        let nextBlocked = false
        let blockMessage = ''
        if (currentPage.type === 'appraisal' && canEditChecklist) {
          const appraisalItems = getAppraisalItems(shiftKey)
          const ratedCount = appraisalItems.filter((item) => {
            const key = item.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
            return !!appraisalRatings[key]
          }).length
          if (ratedCount < appraisalItems.length) {
            nextBlocked = true
            blockMessage = `Rate all items to continue (${ratedCount}/${appraisalItems.length})`
          }
        }
        // Gate: feedback page requires strengths, opportunities, and at least 1 goal
        if (currentPage.type === 'feedback' && canEditChecklist) {
          const missing = []
          if (!sogDraft.strengths.trim()) missing.push('Strengths')
          if (!sogDraft.opportunities.trim()) missing.push('Opportunities')
          if (!sogDraft.goal1.trim() && !sogDraft.goal2.trim() && !sogDraft.goal3.trim()) missing.push('at least 1 Goal')
          if (missing.length > 0) {
            nextBlocked = true
            blockMessage = `Fill in: ${missing.join(', ')}`
          }
        }
        return (
          <>
            {nextBlocked && (
              <p className="text-center text-sm text-amber-600 font-medium mb-2">{blockMessage}</p>
            )}
            <div className="flex items-center justify-between gap-3">
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
                onClick={() => {
                  if (nextBlocked) return
                  if (currentPage.type === 'feedback' && canEditChecklist) handleSaveSog()
                  setPageIdx((p) => Math.min(totalPages - 1, p + 1))
                }}
                disabled={pageIdx >= totalPages - 1 || nextBlocked}
                className="flex-1 min-h-[56px] px-6 py-3 bg-[var(--color-primary)] text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base"
              >
                Next &rarr;
              </button>
            </div>
          </>
        )
      })()}

      {/* Audit drawer */}
      {auditDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAuditDrawerOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Audit trail</h3>
              <button type="button" className="btn btn-small btn-secondary" onClick={() => setAuditDrawerOpen(false)}>
                Close
              </button>
            </div>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-gray-500">No audit entries for this shift.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {auditEntries.map((entry, i) => (
                  <li key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                    <span className="font-medium text-gray-700">{entry.action}</span>
                    {entry.timestamp && (
                      <span className="ml-2 text-gray-500">{formatWhenHuman(entry.timestamp)}</span>
                    )}
                    {entry.by && <span className="ml-2 text-gray-600">by {getName(entry.by)}</span>}
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <pre className="mt-1 whitespace-pre-wrap text-xs text-gray-600">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
