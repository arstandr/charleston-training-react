import { REQUIRED_SHIFT_KEYS, SHIFT_META } from '../constants'
import { SHIFT_TEST_RULES, TESTS, PRETTY_TEST_NAMES } from '../data/quizDatabase'
import { analyzeTraineeRisk } from './RiskEngine'

export function getInitials(name) {
  if (!name || typeof name !== 'string') return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (name[0] || '?').toUpperCase()
}

export function findTraineeIdByEmployeeNumber(trainingData, empNum) {
  const target = String(empNum).trim()
  for (const [id, rec] of Object.entries(trainingData || {})) {
    if (!rec) continue
    if (String(rec.employeeNumber || '').trim() === target) return id
  }
  return null
}

/**
 * Normalize verbalCert for legacy data: ensure attempts[] exists; migrate completedAt/completedBy
 * into first attempt if needed; derive completed from last pass. Mutates rec in place.
 */
export function normalizeVerbalCert(rec) {
  if (!rec) return
  rec.verbalCert = rec.verbalCert || {}
  rec.verbalCert.attempts = Array.isArray(rec.verbalCert.attempts) ? rec.verbalCert.attempts : []
  if (rec.verbalCert.completed && rec.verbalCert.attempts.length === 0 && (rec.verbalCert.completedAt || rec.verbalCert.completedBy)) {
    rec.verbalCert.attempts.push({
      result: 'pass',
      at: rec.verbalCert.completedAt || new Date().toISOString(),
      by: rec.verbalCert.completedBy || '',
    })
  }
  const hasPass = rec.verbalCert.attempts.some((a) => a.result === 'pass')
  if (hasPass) {
    rec.verbalCert.completed = true
    const lastPass = rec.verbalCert.attempts.filter((a) => a.result === 'pass').pop()
    if (lastPass) {
      rec.verbalCert.completedAt = lastPass.at
      rec.verbalCert.completedBy = lastPass.by
    }
  }
}

export function validateEmployeeNumber(empNum) {
  const s = String(empNum || '').trim()
  return /^\d{3,10}$/.test(s)
}

/** Deterministic card ID from set + front + back (for mastery tracking) */
export function stableCardId(setId, card) {
  const s = `${setId}\n${(card && card.front) || ''}\n${(card && card.back) || ''}`
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return `${setId}_${Math.abs(hash).toString(36)}`
}

// --- Trainee dashboard helpers (require REQUIRED_SHIFT_KEYS from constants) ---

const TEST_ATTEMPTS_KEY = 'testAttempts'
const PASSING_SCORE = 85

function findTestIdsByKeywords(keywords, tests) {
  if (!keywords?.length || !tests?.length) return []
  const lower = keywords.map((k) => String(k).toLowerCase())
  return tests.filter((t) => {
    const id = (t.id || '').toLowerCase()
    const title = (t.title || '').toLowerCase()
    return lower.every((kw) => id.includes(kw) || title.includes(kw))
  }).map((t) => t.id)
}

/** Return required test IDs for a shift (from SHIFT_TEST_RULES + TESTS) */
export function getShiftRequiredTestIds(shiftKey, _traineeId) {
  const rule = (SHIFT_TEST_RULES || []).find((r) => r.shift === shiftKey)
  if (!rule || !rule.testsAnyOf?.length) return []
  const tests = (TESTS || []).filter((t) => t.id !== 'bonus_test')
  for (const kwSet of rule.testsAnyOf) {
    const ids = findTestIdsByKeywords(kwSet, tests)
    if (ids.length) return ids
  }
  return []
}

/** Check if trainee passed test from rec.testResults */
export function isTestPassed(rec, testId) {
  if (!rec?.testResults?.length) return false
  const r = rec.testResults.find((x) => x.testId === testId || x.id === testId)
  return r ? !!r.passed : false
}

/** Check if trainee passed test from localStorage testAttempts (for shift completion) */
export function isTestPassedFromStorage(traineeId, testId) {
  try {
    const raw = localStorage.getItem(TEST_ATTEMPTS_KEY) || '{}'
    const attempts = JSON.parse(raw) || {}
    const key = `${traineeId}_${testId}`
    const rec = attempts[key] || {}
    const scores = rec.scores || []
    const best = scores.length ? Math.max(...scores) : 0
    return best >= PASSING_SCORE || !!rec.passed
  } catch (_) {
    return false
  }
}

/** Shift is complete when trainer + manager signed and all required tests passed */
export function isShiftComplete(rec, shiftKey, explicitTraineeId) {
  if (!rec?.schedule?.[shiftKey]) return false
  const item = rec.schedule[shiftKey]
  if (!item.trainerSignedAt || !item.managerSignedAt) return false
  const traineeId = explicitTraineeId || rec.id || rec.traineeId
  const ids = getShiftRequiredTestIds(shiftKey, traineeId)
  if (ids.length === 0) return true
  return ids.every((tid) => isTestPassed(rec, tid) || isTestPassedFromStorage(traineeId, tid))
}

/** Status object for a shift: scheduled, trainerSigned, managerSigned, state */
export function getShiftStatus(rec, shiftKey) {
  const item = (rec?.schedule && rec.schedule[shiftKey]) || {}
  const scheduled = !!item.when
  const trainerSigned = !!item.trainerSignedAt
  const managerSigned = !!item.managerSignedAt
  const complete = isShiftComplete(rec, shiftKey)
  let state = 'Not scheduled'
  if (complete) state = 'Complete'
  else if (managerSigned) state = 'Manager signed'
  else if (trainerSigned) state = 'Trainer signed'
  else if (scheduled) state = 'Scheduled'
  return { scheduled, trainerSigned, managerSigned, complete, state, item }
}

/** Compliance: of shifts with trainer sign-off, how many also have manager sign-off. storeFilter optional. */
export function getComplianceStats(trainingData, storeFilter = null) {
  let totalTrainerSigned = 0
  let dualSigned = 0
  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (storeFilter && (rec.store || '') !== storeFilter) continue
    const schedule = rec.schedule || {}
    for (const item of Object.values(schedule)) {
      if (!item?.trainerSignedAt) continue
      totalTrainerSigned++
      if (item.managerSignedAt) dualSigned++
    }
  }
  const compliancePct = totalTrainerSigned ? Math.round((dualSigned / totalTrainerSigned) * 100) : 0
  return { totalTrainerSigned, dualSigned, compliancePct }
}

/** Certification progress: done count, total (6), pct 0–100 */
export function getCertificationProgress(rec) {
  const total = (REQUIRED_SHIFT_KEYS || []).length || 6
  let done = 0
  ;(REQUIRED_SHIFT_KEYS || []).forEach((key) => {
    if (isShiftComplete(rec, key)) done++
  })
  const pct = total ? Math.round((done / total) * 100) : 0
  return { done, total, pct }
}

/** Progress by trainer sign-off only: completedShifts = count with trainerSignedAt, totalShifts = REQUIRED_SHIFT_KEYS.length. */
export function getShiftProgressByTrainerSign(rec) {
  const total = (REQUIRED_SHIFT_KEYS || []).length || 6
  let completedShifts = 0
  const schedule = rec?.schedule || {}
  ;(REQUIRED_SHIFT_KEYS || []).forEach((key) => {
    if (schedule[key]?.trainerSignedAt) completedShifts++
  })
  return { completedShifts, totalShifts: total }
}

/** Training health: shifts (done/total), quizAvg, passRate, needPractice (override at call site from struggle cards if available) */
export function getTrainingHealth(rec) {
  const prog = getCertificationProgress(rec)
  const results = rec?.testResults || []
  const quizAvg = results.length ? Math.round(results.reduce((a, r) => a + (r.score || 0), 0) / results.length) : 0
  const passCount = results.filter((r) => r.passed).length
  const passRate = results.length ? Math.round((passCount / results.length) * 100) : 0
  return {
    shifts: `${prog.done}/${prog.total}`,
    quizAvg,
    passRate,
    needPractice: 0,
  }
}

/** Next incomplete shift (6-hour lookback); returns { key, when, label, icon, trainerName, complete } or null */
export function getNextShift(rec, staffAccounts, shiftTypesOrder = ['follow', 'rev1', 'rev2', 'rev3', 'rev4', 'foodrun', 'cert']) {
  if (!rec?.schedule) return null
  const sixHoursAgo = Date.now() - 6 * 3600 * 1000
  const getName = (emp) => {
    const r = (staffAccounts || {})[emp]
    return (r && r.name) ? r.name : (emp ? `#${emp}` : '—')
  }
  const rows = []
  shiftTypesOrder.forEach((shiftKey) => {
    const item = rec.schedule[shiftKey]
    if (!item) return
    const complete = isShiftComplete(rec, shiftKey)
    const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey, icon: '' }
    rows.push({
      key: shiftKey,
      when: item.when || '',
      label: meta.label || shiftKey,
      icon: meta.icon || '',
      trainerName: item.trainer ? getName(item.trainer) : 'Not assigned',
      complete,
    })
  })
  const incomplete = rows.filter((r) => !r.complete)
  const next =
    incomplete.find((r) => r.when && new Date(r.when).getTime() >= sixHoursAgo) ||
    incomplete.find((r) => r.when) ||
    incomplete[0] ||
    null
  return next
}

/** Human-friendly test name for display */
export function prettyTestName(id) {
  if (!id) return ''
  const key = String(id).replace(/-/g, '_')
  if (PRETTY_TEST_NAMES && PRETTY_TEST_NAMES[key]) return PRETTY_TEST_NAMES[key]
  const t = (TESTS || []).find((x) => x.id === id)
  if (t?.title) return t.title.replace(/\s*-\s*Final Test$/i, '').trim()
  return String(id).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Ordinal for date: 1st, 2nd, 3rd, 4th... */
function ordinal(n) {
  const s = String(n)
  const last = s.slice(-1)
  const last2 = s.slice(-2)
  if (last2 === '11' || last2 === '12' || last2 === '13') return s + 'th'
  if (last === '1') return s + 'st'
  if (last === '2') return s + 'nd'
  if (last === '3') return s + 'rd'
  return s + 'th'
}

/** Human-friendly date/time: "Today, February 4th at 4:00 PM" or "Monday, February 10th at 9:00 AM" */
export function formatWhenHuman(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso || '—'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dayStart = new Date(d)
    dayStart.setHours(0, 0, 0, 0)
    let prefix = ''
    if (dayStart.getTime() === today.getTime()) prefix = 'Today, '
    else if (dayStart.getTime() === tomorrow.getTime()) prefix = 'Tomorrow, '
    const month = d.toLocaleDateString(undefined, { month: 'long' })
    const day = ordinal(d.getDate())
    let h = d.getHours()
    const m = d.getMinutes()
    const ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12
    if (h === 0) h = 12
    const min = m === 0 ? '00' : String(m).padStart(2, '0')
    const timeStr = `${h}:${min} ${ampm}`
    const datePart = `${month} ${day} at ${timeStr}`
    if (prefix) return prefix + datePart
    return `${d.toLocaleDateString(undefined, { weekday: 'long' })}, ${datePart}`
  } catch (_) {
    return iso || '—'
  }
}

// --- Trainer dashboard helpers ---

/** Whether all required tests for a shift are passed (for trainer sign-off eligibility) */
export function shiftRequiredTestsPassed(rec, shiftKey, traineeId) {
  const ids = getShiftRequiredTestIds(shiftKey, traineeId)
  if (ids.length === 0) return true
  const id = traineeId || rec?.id
  return ids.every((tid) => isTestPassed(rec, tid) || isTestPassedFromStorage(id, tid))
}

/** Checklist complete for shift (if we store checklist completion) */
export function isChecklistComplete(rec, shiftKey) {
  const checklists = rec?.checklists || {}
  const c = checklists[shiftKey]
  if (!c) return true
  if (c.complete === true) return true
  const items = c.items
  if (typeof items === 'object' && items !== null && !Array.isArray(items)) {
    return Object.values(items).every((i) => i?.value === true || i?.checked === true)
  }
  if (Array.isArray(items)) return items.every((i) => i?.checked || i?.value)
  return true
}

/** True if when (ISO or date string) is on the same calendar day as refDate (default today). */
export function isSameCalendarDay(when, refDate = new Date()) {
  if (!when) return false
  const d = new Date(when)
  if (Number.isNaN(d.getTime())) return false
  const r = refDate instanceof Date ? refDate : new Date(refDate)
  return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth() && d.getDate() === r.getDate()
}

/** Assigned shifts for this trainer: { traineeId, traineeName, shiftKey, shiftLabel, when, trainerSigned, managerSigned, testsStatus, checklistComplete, failedTestTitles }[] */
export function getTrainerAssignedShifts(trainingData, trainerEmpNum, store) {
  const out = []
  const emp = String(trainerEmpNum || '')
  const st = store || ''
  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (st && (rec.store || '') !== st) continue
    const schedule = rec.schedule || {}
    for (const [shiftKey, item] of Object.entries(schedule)) {
      if (!item || item.trainer !== emp) continue
      const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey, icon: '' }
      const testsOk = shiftRequiredTestsPassed(rec, shiftKey, traineeId)
      const checklistComplete = isChecklistComplete(rec, shiftKey)
      const requiredIds = getShiftRequiredTestIds(shiftKey, traineeId)
      const failedTestTitles = requiredIds
        .filter((tid) => !isTestPassed(rec, tid) && !isTestPassedFromStorage(traineeId, tid))
        .map((tid) => (PRETTY_TEST_NAMES && PRETTY_TEST_NAMES[tid]) || tid)
      out.push({
        traineeId,
        traineeName: rec.name || `Trainee ${traineeId}`,
        shiftKey,
        shiftLabel: meta.label || shiftKey,
        icon: meta.icon || '',
        when: item.when || '',
        trainerSigned: !!item.trainerSignedAt,
        managerSigned: !!item.managerSignedAt,
        testsStatus: testsOk ? 'passed' : 'pending',
        checklistComplete,
        failedTestTitles,
      })
    }
  }
  out.sort((a, b) => (a.when || '').localeCompare(b.when || ''))
  return out
}

/** Unassigned shifts at store. Options: { includePending: true } to include shifts with pendingTrainer (row gets isPending, pendingTrainer). */
export function getCoverageShifts(trainingData, store, options = {}) {
  const out = []
  const st = store || ''
  const includePending = options.includePending === true
  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (st && (rec.store || '') !== st) continue
    const schedule = rec.schedule || {}
    for (const [shiftKey, item] of Object.entries(schedule)) {
      if (!item?.when || item.trainer) continue
      if (!includePending && item.pendingTrainer) continue
      const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey, icon: '' }
      out.push({
        traineeId,
        traineeName: rec.name || `Trainee ${traineeId}`,
        shiftKey,
        shiftLabel: meta.label || shiftKey,
        icon: meta.icon || '',
        when: item.when,
        isPending: !!item.pendingTrainer,
        pendingTrainer: item.pendingTrainer || null,
      })
    }
  }
  out.sort((a, b) => (a.when || '').localeCompare(b.when || ''))
  return out
}

/** Shifts this trainer has claimed (pending approval) */
export function getPendingClaimsForTrainer(trainingData, trainerEmpNum) {
  const out = []
  const emp = String(trainerEmpNum || '')
  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    const schedule = rec.schedule || {}
    for (const [shiftKey, item] of Object.entries(schedule)) {
      if (!item || item.pendingTrainer !== emp) continue
      const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey, icon: '' }
      out.push({
        traineeId,
        traineeName: rec.name || `Trainee ${traineeId}`,
        shiftKey,
        shiftLabel: meta.label || shiftKey,
        icon: meta.icon || '',
        when: item.when || '',
        pendingAt: item.pendingAt || '',
      })
    }
  }
  out.sort((a, b) => (a.when || '').localeCompare(b.when || ''))
  return out
}

/** All pending claims at a store (for manager approve/deny) */
export function getPendingClaimsForStore(trainingData, store) {
  const out = []
  const st = store || ''
  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (st && (rec.store || '') !== st) continue
    const schedule = rec.schedule || {}
    for (const [shiftKey, item] of Object.entries(schedule)) {
      if (!item?.pendingTrainer) continue
      const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey, icon: '' }
      out.push({
        traineeId,
        traineeName: rec.name || `Trainee ${traineeId}`,
        shiftKey,
        shiftLabel: meta.label || shiftKey,
        icon: meta.icon || '',
        when: item.when || '',
        pendingTrainer: item.pendingTrainer,
        pendingAt: item.pendingAt || '',
      })
    }
  }
  out.sort((a, b) => (a.when || '').localeCompare(b.when || ''))
  return out
}

/** Claim a shift (sets pendingTrainer, pendingAt). Returns new trainingData. */
export function claimShift(trainingData, traineeId, shiftKey, trainerEmpNum) {
  const next = JSON.parse(JSON.stringify(trainingData || {}))
  if (!next[traineeId]?.schedule?.[shiftKey]) return trainingData
  const item = next[traineeId].schedule[shiftKey]
  if (item.trainer || item.pendingTrainer) return trainingData
  item.pendingTrainer = String(trainerEmpNum)
  item.pendingAt = new Date().toISOString()
  return next
}

/** Approve a pending claim (move pendingTrainer to trainer). Returns new trainingData. */
export function approveShiftClaim(trainingData, traineeId, shiftKey) {
  const next = JSON.parse(JSON.stringify(trainingData || {}))
  const item = next[traineeId]?.schedule?.[shiftKey]
  if (!item?.pendingTrainer) return trainingData
  item.trainer = item.pendingTrainer
  delete item.pendingTrainer
  delete item.pendingAt
  return next
}

/** Deny a pending claim. Returns new trainingData. */
export function denyShiftClaim(trainingData, traineeId, shiftKey) {
  const next = JSON.parse(JSON.stringify(trainingData || {}))
  const item = next[traineeId]?.schedule?.[shiftKey]
  if (!item?.pendingTrainer) return trainingData
  delete item.pendingTrainer
  delete item.pendingAt
  return next
}

/** Load testAttempts object from localStorage (keyed by traineeId_testId). */
export function loadTestAttemptsFromStorage() {
  try {
    const raw = localStorage.getItem(TEST_ATTEMPTS_KEY) || '{}'
    return JSON.parse(raw) || {}
  } catch (_) {
    return {}
  }
}

/** Trainer effectiveness: score 0–100 and trainee count for assigned trainees (uses RiskEngine). */
export function getTrainerEffectiveness(trainingData, trainerEmpNum, store, testAttempts) {
  const assigned = getTrainerAssignedShifts(trainingData, trainerEmpNum, store)
  const traineeIds = [...new Set(assigned.map((r) => r.traineeId))]
  const attempts = testAttempts || loadTestAttemptsFromStorage()
  let totalRisk = 0
  let count = 0
  for (const traineeId of traineeIds) {
    const rec = trainingData?.[traineeId]
    if (!rec) continue
    const trainee = { id: traineeId, ...rec }
    const { score } = analyzeTraineeRisk(trainee, { testAttempts: attempts })
    totalRisk += score
    count++
  }
  const avgRisk = count ? totalRisk / count : 0
  const effectivenessScore = Math.round(Math.max(0, Math.min(100, 100 - avgRisk)))
  return { score: effectivenessScore, traineeCount: count }
}

/** Recent test attempts for trainees assigned to this trainer. Returns { traineeId, traineeName, testId, testName, score, passed }[] (max limit). */
export function getRecentTestAttemptsForTrainer(trainingData, trainerEmpNum, store, limit = 20) {
  const assigned = getTrainerAssignedShifts(trainingData, trainerEmpNum, store)
  const traineeIds = new Set(assigned.map((r) => r.traineeId))
  const nameByTrainee = {}
  assigned.forEach((r) => { nameByTrainee[r.traineeId] = r.traineeName })
  const attempts = loadTestAttemptsFromStorage()
  const list = []
  for (const key of Object.keys(attempts)) {
    const idx = key.indexOf('_')
    if (idx <= 0) continue
    const traineeId = key.slice(0, idx)
    const testId = key.slice(idx + 1)
    if (!traineeIds.has(traineeId)) continue
    const rec = attempts[key]
    const scores = Array.isArray(rec?.scores) ? rec.scores : []
    const lastScore = scores.length ? scores[scores.length - 1] : 0
    const testName = (PRETTY_TEST_NAMES && PRETTY_TEST_NAMES[testId]) || testId.replace(/[-_]+/g, ' ')
    list.push({
      traineeId,
      traineeName: nameByTrainee[traineeId] || `Trainee ${traineeId}`,
      testId,
      testName,
      score: lastScore,
      passed: !!rec?.passed,
    })
  }
  return list
    .sort((a, b) => (a.traineeName || '').localeCompare(b.traineeName || '') || (a.testId || '').localeCompare(b.testId || ''))
    .slice(0, limit)
}

/** Trainee health summary: quiz average (from testAttempts), needPractice count (0 if not available). */
export function getTraineeHealthSummary(traineeId, rec, testAttempts) {
  const attempts = testAttempts || loadTestAttemptsFromStorage()
  const prefix = traineeId + '_'
  let sum = 0
  let n = 0
  for (const [key, data] of Object.entries(attempts)) {
    if (!key.startsWith(prefix)) continue
    const scores = Array.isArray(data?.scores) ? data.scores : []
    const best = scores.length ? Math.max(...scores) : 0
    if (scores.length) {
      sum += best
      n++
    }
  }
  const quizAvg = n ? Math.round((sum / n) * 10) / 10 : null
  return { quizAvg, needPracticeCount: 0 }
}

/** Audit entries for a shift (from rec.audit filtered by details.shiftKey). */
export function getShiftAuditEntries(rec, shiftKey) {
  const audit = Array.isArray(rec?.audit) ? rec.audit : []
  return audit.filter((e) => e?.details?.shiftKey === shiftKey)
}

/** Sign shift as trainer (sets trainerSignedAt, trainerSignedBy, optional feedback/readiness). Returns new trainingData. */
export function signShiftAsTrainer(trainingData, traineeId, shiftKey, trainerEmpNum, feedback = {}) {
  const next = JSON.parse(JSON.stringify(trainingData || {}))
  const rec = next[traineeId]
  if (!rec?.schedule?.[shiftKey]) return trainingData
  const item = rec.schedule[shiftKey]
  if (item.trainer !== String(trainerEmpNum)) return trainingData
  item.trainerSignedAt = new Date().toISOString()
  item.trainerSignedBy = String(trainerEmpNum)
  if (feedback.notes != null) {
    rec.shiftFeedback = rec.shiftFeedback || {}
    rec.shiftFeedback[shiftKey] = { ...(rec.shiftFeedback[shiftKey] || {}), notes: feedback.notes }
  }
  if (feedback.knowledge != null || feedback.execution != null || feedback.confidence != null) {
    rec.checklists = rec.checklists || {}
    rec.checklists[shiftKey] = rec.checklists[shiftKey] || {}
    rec.checklists[shiftKey].readiness = {
      knowledge: feedback.knowledge,
      execution: feedback.execution,
      confidence: feedback.confidence,
    }
  }
  return next
}

/** Shifts at store awaiting manager sign-off (trainer signed, manager not). For manager UI. */
export function getShiftsAwaitingManagerSignOff(trainingData, store) {
  const out = []
  const st = store || ''
  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (st && (rec.store || '') !== st) continue
    const schedule = rec.schedule || {}
    for (const [shiftKey, item] of Object.entries(schedule)) {
      if (!item?.trainerSignedAt || item.managerSignedAt) continue
      const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey, icon: '' }
      out.push({
        traineeId,
        traineeName: rec.name || `Trainee ${traineeId}`,
        shiftKey,
        shiftLabel: meta.label || shiftKey,
        icon: meta.icon || '',
        when: item.when || '',
      })
    }
  }
  out.sort((a, b) => (a.when || '').localeCompare(b.when || ''))
  return out
}

/** Combined "Needs you" queue for manager: pending claims + awaiting sign-offs, sorted by when. */
export function getManagerNeedsYouQueue(trainingData, store) {
  const claims = (getPendingClaimsForStore(trainingData, store) || []).map((c) => ({ type: 'claim', ...c }))
  const signOffs = (getShiftsAwaitingManagerSignOff(trainingData, store) || []).map((s) => ({ type: 'sign', ...s }))
  return [...claims, ...signOffs].sort((a, b) => (a.when || '').localeCompare(b.when || ''))
}

/** Rows for manager schedule grid: one per (trainee, shift). staffAccounts optional for trainer names. */
export function getManagerScheduleRows(trainingData, store, staffAccounts = {}) {
  const getName = (emp) => {
    const r = staffAccounts[emp]
    return (r && r.name) ? r.name : (emp ? `#${emp}` : '—')
  }
  const out = []
  const st = store || ''
  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (st && (rec.store || '') !== st) continue
    const schedule = rec.schedule || {}
    const traineeName = rec.name || `Trainee ${traineeId}`
    const traineeEmp = rec.employeeNumber || rec.empNum || traineeId
    for (const [shiftKey, item] of Object.entries(schedule)) {
      if (!item?.when) continue
      const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey, icon: '' }
      const trainer = item.trainer || item.pendingTrainer || null
      const missingTrainer = !trainer
      const pendingApproval = !!item.pendingTrainer
      const unsigned = !item.trainerSignedAt || !item.managerSignedAt
      out.push({
        traineeId,
        traineeName,
        traineeEmp,
        shiftKey,
        shiftLabel: meta.label || shiftKey,
        icon: meta.icon || '',
        when: item.when,
        trainer,
        trainerName: trainer ? getName(trainer) : null,
        missingTrainer,
        pendingApproval,
        unsigned,
      })
    }
  }
  out.sort((a, b) => (a.when || '').localeCompare(b.when || ''))
  return out
}

/** Sign shift as manager (sets managerSignedAt, managerSignedBy). Optional readiness (1–3) and managerScore (average of shift assessment). Returns new trainingData. */
export function signShiftAsManager(trainingData, traineeId, shiftKey, managerEmpNum, readiness = null, managerScore = null) {
  const next = JSON.parse(JSON.stringify(trainingData || {}))
  const rec = next[traineeId]
  const item = rec?.schedule?.[shiftKey]
  if (!item || !item.trainerSignedAt) return trainingData
  rec.checklists = rec.checklists || {}
  rec.checklists[shiftKey] = rec.checklists[shiftKey] || {}
  if (readiness && (readiness.knowledge != null || readiness.execution != null || readiness.confidence != null || Object.keys(readiness).some((k) => typeof readiness[k] === 'number'))) {
    rec.checklists[shiftKey].readiness = {
      ...(rec.checklists[shiftKey].readiness || {}),
      ...readiness,
      knowledge: readiness.knowledge,
      execution: readiness.execution,
      confidence: readiness.confidence,
    }
  }
  if (managerScore != null && typeof managerScore === 'number') {
    rec.checklists[shiftKey].managerScore = managerScore
  }
  item.managerSignedAt = new Date().toISOString()
  item.managerSignedBy = String(managerEmpNum)
  return next
}

/** Update a single checklist item; optionally append audit entry. Returns new trainingData. */
export function updateChecklistItem(trainingData, traineeId, shiftKey, itemId, value, byEmpNum = '') {
  const next = JSON.parse(JSON.stringify(trainingData || {}))
  const rec = next[traineeId]
  if (!rec?.schedule?.[shiftKey]) return trainingData
  rec.checklists = rec.checklists || {}
  rec.checklists[shiftKey] = rec.checklists[shiftKey] || {}
  rec.checklists[shiftKey].items = rec.checklists[shiftKey].items || {}
  const prev = rec.checklists[shiftKey].items[itemId]?.value
  rec.checklists[shiftKey].items[itemId] = { ...rec.checklists[shiftKey].items[itemId], value }
  rec.checklists[shiftKey].lastUpdated = new Date().toISOString()
  if (byEmpNum && (prev !== value || value !== undefined)) {
    rec.audit = Array.isArray(rec.audit) ? rec.audit : []
    rec.audit.unshift({
      action: 'checklist_item_updated',
      timestamp: new Date().toISOString(),
      by: byEmpNum,
      details: { shiftKey, itemId, oldValue: prev, newValue: value },
    })
    if (rec.audit.length > 200) rec.audit.length = 200
  }
  return next
}

/** Update shift feedback (strengths, opportunities, goalsNext). Returns new trainingData. */
export function updateShiftFeedback(trainingData, traineeId, shiftKey, feedback) {
  const next = JSON.parse(JSON.stringify(trainingData || {}))
  const rec = next[traineeId]
  if (!rec?.schedule?.[shiftKey]) return trainingData
  rec.shiftFeedback = rec.shiftFeedback || {}
  rec.shiftFeedback[shiftKey] = { ...(rec.shiftFeedback[shiftKey] || {}), ...feedback }
  return next
}

/** Trainer rating breakdown: aggregate all trainee ratings for this trainer (empNum). */
export function getTrainerRatingBreakdown(trainingData, empNum) {
  const criteriaAvgs = [0, 0, 0, 0, 0]
  const criteriaCounts = [0, 0, 0, 0, 0]
  const feedbacks = []
  let overallSum = 0
  let overallCount = 0
  const emp = String(empNum || '')
  for (const [, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    const schedule = rec.schedule || {}
    const ratings = rec.trainerRatings || {}
    for (const [shiftKey, item] of Object.entries(schedule)) {
      if (!item || String(item.trainer) !== emp) continue
      const r = ratings[shiftKey]
      if (!r?.scores?.length) continue
      const scores = r.scores.slice(0, 5)
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      overallSum += avg
      overallCount++
      scores.forEach((s, i) => {
        const prev = criteriaAvgs[i] * criteriaCounts[i]
        criteriaCounts[i]++
        criteriaAvgs[i] = (prev + s) / criteriaCounts[i]
      })
      const meta = (SHIFT_META && SHIFT_META[shiftKey]) || { label: shiftKey }
      feedbacks.push({
        traineeName: rec.name || rec.id,
        shiftKey,
        shiftLabel: meta.label || shiftKey,
        at: r.at,
        scores: scores,
        notes: (r.notes && String(r.notes).trim()) ? r.notes.trim() : null,
      })
    }
  }
  const overallAvg = overallCount ? Math.round((overallSum / overallCount) * 10) / 10 : 0
  return {
    overallAvg,
    criteriaAvgs: criteriaAvgs.map((a, i) => Math.round((a || 0) * 10) / 10),
    count: overallCount,
    feedbacks,
  }
}

/** Readiness aggregate: average of managerScore (or legacy knowledge/execution/confidence) across shifts. Used for Trainee Readiness %. */
export function getTraineeReadinessAggregate(trainingData, traineeId) {
  const rec = trainingData?.[traineeId]
  if (!rec?.checklists) return { average: null, count: 0 }
  let sum = 0
  let count = 0
  for (const inst of Object.values(rec.checklists)) {
    const score = inst?.managerScore
    if (typeof score === 'number') {
      sum += score
      count++
      continue
    }
    const r = inst?.readiness
    if (!r || (typeof r.knowledge !== 'number' && typeof r.execution !== 'number' && typeof r.confidence !== 'number')) continue
    const k = typeof r.knowledge === 'number' ? r.knowledge : 0
    const e = typeof r.execution === 'number' ? r.execution : 0
    const c = typeof r.confidence === 'number' ? r.confidence : 0
    const n = (k ? 1 : 0) + (e ? 1 : 0) + (c ? 1 : 0)
    if (n) { sum += (k + e + c) / 3; count++ }
  }
  return { average: count ? Math.round((sum / count) * 10) / 10 : null, count }
}
