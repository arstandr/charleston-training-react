/**
 * Analytics Service — centralized Firestore queries for the Analytics page.
 * All functions are one-time fetches (not real-time subscriptions).
 */
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { db } from '../firebase'
import { REQUIRED_SHIFT_KEYS, STAFF_LOGINS } from '../constants'
import { isShiftComplete, isChecklistComplete, getTrainerAssignedShifts } from '../utils/helpers'

/* ==============================
   Flashcard Functions
   ============================== */

/** Fetch all flashcardMastery docs */
export async function fetchAllFlashcardMastery() {
  try {
    const snap = await getDocs(query(collection(db, 'flashcardMastery'), limit(500)))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (_) {
    return []
  }
}

/** Fetch all users docs (Firebase Auth UID → name/role) for analytics enrichment */
export async function fetchAllUsers() {
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(500)))
    const map = {}
    snap.docs.forEach((d) => {
      const data = d.data()
      map[d.id] = { name: data.name || data.displayName || '', role: data.role || '', store: data.store || '' }
    })
    return map
  } catch (_) {
    return {}
  }
}

/** Fetch all flashcardAnalytics docs */
export async function fetchAllFlashcardSessions() {
  try {
    const snap = await getDocs(query(collection(db, 'flashcardAnalytics'), limit(500)))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (_) {
    return []
  }
}

/* ==============================
   Quiz/Test Functions
   ============================== */

/** Fetch quizAttempts (ordered by timestamp desc) */
export async function fetchAllQuizAttempts(maxResults = 2000) {
  try {
    const q = query(collection(db, 'quizAttempts'), orderBy('timestamp', 'desc'), limit(maxResults))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (_) {
    return []
  }
}

/** Fetch aggregate test results from the testResults collection (keyed by traineeId). */
export async function fetchAllTestResults() {
  try {
    const snap = await getDocs(query(collection(db, 'testResults'), limit(500)))
    const map = {}
    snap.docs.forEach((d) => {
      const data = d.data()
      const traineeId = d.id
      // Each doc is { testId: { count, scores, passed, ... }, updatedAt }
      const results = []
      for (const [key, val] of Object.entries(data)) {
        if (key === 'updatedAt') continue
        if (val && typeof val === 'object') {
          results.push({
            testId: key,
            score: Array.isArray(val.scores) && val.scores.length > 0
              ? val.scores[val.scores.length - 1] // most recent score
              : 0,
            count: val.count || 0,
            passed: !!val.passed,
            scores: val.scores || [],
          })
        }
      }
      map[traineeId] = results
    })
    return map
  } catch (_) {
    return {}
  }
}

/* ==============================
   Computed Functions (from trainingData, no Firestore)
   ============================== */

/** Trainer workload: shifts assigned per trainer */
export function computeTrainerWorkload(trainingData, staffAccounts, storeFilter = null) {
  const merged = { ...STAFF_LOGINS, ...staffAccounts }
  const workload = {}

  for (const [, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (storeFilter && (rec.store || '') !== storeFilter) continue
    const schedule = rec.schedule || {}
    for (const item of Object.values(schedule)) {
      if (!item?.trainer) continue
      const emp = String(item.trainer)
      if (!workload[emp]) {
        workload[emp] = { empNum: emp, name: merged[emp]?.name || `#${emp}`, total: 0, completed: 0 }
      }
      workload[emp].total++
      if (item.trainerSignedAt && item.managerSignedAt) workload[emp].completed++
    }
  }

  return Object.values(workload).sort((a, b) => b.total - a.total)
}

/** Detect trainers with low checklist completion rates */
export function detectTrainerSkippers(trainingData, staffAccounts, storeFilter = null) {
  const merged = { ...STAFF_LOGINS, ...staffAccounts }
  const stats = {}

  for (const [, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (storeFilter && (rec.store || '') !== storeFilter) continue
    const schedule = rec.schedule || {}
    for (const [shiftKey, item] of Object.entries(schedule)) {
      if (!item?.trainer || !item.trainerSignedAt) continue
      const emp = String(item.trainer)
      if (!stats[emp]) {
        stats[emp] = { empNum: emp, name: merged[emp]?.name || `#${emp}`, totalSigned: 0, checklistComplete: 0 }
      }
      stats[emp].totalSigned++
      if (isChecklistComplete(rec, shiftKey)) stats[emp].checklistComplete++
    }
  }

  return Object.values(stats)
    .filter((s) => s.totalSigned > 0)
    .map((s) => ({ ...s, completionRate: Math.round((s.checklistComplete / s.totalSigned) * 100) }))
    .sort((a, b) => a.completionRate - b.completionRate)
}

/** Detect premature sign-offs: manager signed but low readiness (<3) */
export function detectPrematureSignoffs(trainingData, storeFilter = null) {
  const results = []

  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (storeFilter && (rec.store || '') !== storeFilter) continue
    const schedule = rec.schedule || {}
    const checklists = rec.checklists || {}
    for (const [shiftKey, item] of Object.entries(schedule)) {
      if (!item?.managerSignedAt) continue
      const checklist = checklists[shiftKey]
      const score = checklist?.managerScore
      if (typeof score === 'number' && score < 3) {
        results.push({
          traineeId,
          traineeName: rec.name || traineeId,
          store: rec.store || '',
          shiftKey,
          managerScore: score,
          managerSignedBy: item.managerSignedBy || '?',
          managerSignedAt: item.managerSignedAt,
        })
      }
    }
  }

  return results.sort((a, b) => (a.managerScore || 0) - (b.managerScore || 0))
}

/** Average hours between trainer sign-off and manager sign-off, per manager */
export function computeManagerTurnaround(trainingData, staffAccounts) {
  const merged = { ...STAFF_LOGINS, ...staffAccounts }
  const byManager = {}

  for (const [, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    const schedule = rec.schedule || {}
    for (const item of Object.values(schedule)) {
      if (!item?.trainerSignedAt || !item?.managerSignedAt || !item?.managerSignedBy) continue
      const trainerTime = new Date(item.trainerSignedAt).getTime()
      const managerTime = new Date(item.managerSignedAt).getTime()
      if (isNaN(trainerTime) || isNaN(managerTime)) continue
      const diffHours = (managerTime - trainerTime) / (1000 * 60 * 60)
      if (diffHours < 0) continue

      const mgr = item.managerSignedBy
      if (!byManager[mgr]) {
        byManager[mgr] = { empNum: mgr, name: merged[mgr]?.name || `#${mgr}`, totalHours: 0, count: 0 }
      }
      byManager[mgr].totalHours += diffHours
      byManager[mgr].count++
    }
  }

  return Object.values(byManager)
    .filter((m) => m.count > 0)
    .map((m) => ({ ...m, avgHours: Math.round((m.totalHours / m.count) * 10) / 10 }))
    .sort((a, b) => a.avgHours - b.avgHours)
}

/** Days from earliest shift date to certification sign-off */
export function computeTimeToCertification(trainingData) {
  const results = []

  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    const schedule = rec.schedule || {}

    // Find earliest shift date
    let earliest = Infinity
    let certDate = null
    for (const [shiftKey, item] of Object.entries(schedule)) {
      // Exclude cert shift from earliest date — we want the first training shift
      if (shiftKey !== 'cert' && item?.when) {
        const t = new Date(item.when).getTime()
        if (!isNaN(t) && t < earliest) earliest = t
      }
      if (shiftKey === 'cert' && item?.managerSignedAt) {
        certDate = new Date(item.managerSignedAt).getTime()
      }
    }

    if (earliest !== Infinity && certDate && !isNaN(certDate)) {
      const days = Math.round((certDate - earliest) / (1000 * 60 * 60 * 24))
      results.push({
        traineeId,
        traineeName: rec.name || traineeId,
        store: rec.store || '',
        days,
      })
    }
  }

  return results.sort((a, b) => a.days - b.days)
}

/** Count trainees at each shift step (dropout funnel) */
export function computeDropoutFunnel(trainingData) {
  const counts = {}
  REQUIRED_SHIFT_KEYS.forEach((key) => { counts[key] = 0 })

  for (const [, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    REQUIRED_SHIFT_KEYS.forEach((key) => {
      if (isShiftComplete(rec, key)) counts[key]++
    })
  }

  return REQUIRED_SHIFT_KEYS.map((key) => ({ shiftKey: key, count: counts[key] }))
}

/* ==============================
   New Computed Functions (Phase 2 Analytics)
   ============================== */

/** Readiness velocity: manager readiness score progression per trainee across shifts */
export function computeReadinessVelocity(trainingData, storeFilter = null) {
  const perTrainee = []

  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (storeFilter && (rec.store || '') !== storeFilter) continue
    const checklists = rec.checklists || {}
    const scores = []
    REQUIRED_SHIFT_KEYS.forEach((key) => {
      const cl = checklists[key]
      if (cl && typeof cl.managerScore === 'number') {
        scores.push({ shift: key, score: cl.managerScore })
      }
    })
    if (scores.length >= 2) {
      // Compute slope (simple linear regression)
      const n = scores.length
      const xMean = (n - 1) / 2
      const yMean = scores.reduce((s, d) => s + d.score, 0) / n
      let num = 0
      let den = 0
      scores.forEach((d, i) => {
        num += (i - xMean) * (d.score - yMean)
        den += (i - xMean) * (i - xMean)
      })
      const slope = den > 0 ? Math.round((num / den) * 100) / 100 : 0
      perTrainee.push({
        traineeId,
        name: rec.name || traineeId,
        store: rec.store || '',
        scores,
        slope,
      })
    }
  }

  // Aggregate average slope
  const avgSlope = perTrainee.length > 0
    ? Math.round((perTrainee.reduce((s, t) => s + t.slope, 0) / perTrainee.length) * 100) / 100
    : 0
  const trend = avgSlope > 0.1 ? 'improving' : avgSlope < -0.1 ? 'declining' : 'flat'

  return { perTrainee, avgSlope, trend }
}

/** Content effectiveness: compare quiz scores for certified vs non-certified trainees per topic */
export function computeContentEffectiveness(trainingData, quizAttempts, storeFilter = null) {
  // Build set of certified trainee IDs
  const certified = new Set()
  const nonCertified = new Set()
  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (storeFilter && (rec.store || '') !== storeFilter) continue
    const certItem = rec.schedule?.cert
    if (certItem?.managerSignedAt) {
      certified.add(traineeId)
    } else {
      nonCertified.add(traineeId)
    }
  }

  // Group quiz attempts by topic (quizId) and certification status
  const byTopic = {}
  for (const a of quizAttempts || []) {
    const userId = a.userId || ''
    if (!certified.has(userId) && !nonCertified.has(userId)) continue
    const topic = a.quizId || a.topic || ''
    if (!topic) continue
    const score = typeof a.score === 'number' ? a.score : (a.correct ? 100 : 0)
    if (!byTopic[topic]) byTopic[topic] = { certScores: [], nonCertScores: [] }
    if (certified.has(userId)) {
      byTopic[topic].certScores.push(score)
    } else {
      byTopic[topic].nonCertScores.push(score)
    }
  }

  const results = []
  for (const [topic, data] of Object.entries(byTopic)) {
    if (data.certScores.length === 0 && data.nonCertScores.length === 0) continue
    const certAvg = data.certScores.length > 0
      ? Math.round(data.certScores.reduce((s, v) => s + v, 0) / data.certScores.length)
      : 0
    const nonCertAvg = data.nonCertScores.length > 0
      ? Math.round(data.nonCertScores.reduce((s, v) => s + v, 0) / data.nonCertScores.length)
      : 0
    results.push({
      topic,
      certifiedAvgScore: certAvg,
      nonCertifiedAvgScore: nonCertAvg,
      gap: certAvg - nonCertAvg,
    })
  }

  return results.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
}

/** Study consistency: analyze study frequency and correlate with test scores */
export function computeStudyConsistency(sessionData, quizAttempts, trainingData, storeFilter = null) {
  // Build set of trainee IDs in scope
  const traineeStores = {}
  for (const [traineeId, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (storeFilter && (rec.store || '') !== storeFilter) continue
    traineeStores[traineeId] = rec.name || traineeId
  }

  // Collect study days per user
  const byUser = {}
  const ensureUser = (uid) => {
    if (!byUser[uid]) byUser[uid] = { days: new Set(), totalTime: 0, sessions: 0 }
  }

  // From flashcard sessions
  for (const s of sessionData || []) {
    const uid = s.userId || ''
    if (!traineeStores[uid]) continue
    ensureUser(uid)
    const ts = s.timestamp || ''
    const d = typeof ts === 'string' ? ts.slice(0, 10) : ''
    if (d) byUser[uid].days.add(d)
    byUser[uid].totalTime += s.timeSpent || 0
    byUser[uid].sessions++
  }

  // From quiz attempts
  for (const a of quizAttempts || []) {
    const uid = a.userId || ''
    if (!traineeStores[uid]) continue
    ensureUser(uid)
    const ts = a.timestamp
    let d = ''
    if (typeof ts === 'string') {
      d = ts.slice(0, 10)
    } else if (ts?.toMillis) {
      d = new Date(ts.toMillis()).toISOString().slice(0, 10)
    } else if (ts?.seconds) {
      d = new Date(ts.seconds * 1000).toISOString().slice(0, 10)
    }
    if (d) byUser[uid].days.add(d)
  }

  // Compute per-trainee stats
  const results = []
  for (const [uid, data] of Object.entries(byUser)) {
    const studyDays = data.days.size
    // Estimate weeks active (from first to last day)
    const sorted = [...data.days].sort()
    const firstDay = new Date(sorted[0] || Date.now())
    const lastDay = new Date(sorted[sorted.length - 1] || Date.now())
    const weeks = Math.max(1, Math.ceil((lastDay - firstDay) / (7 * 24 * 60 * 60 * 1000)))
    const daysPerWeek = Math.round((studyDays / weeks) * 10) / 10

    // Get avg test score
    const scores = (quizAttempts || [])
      .filter((a) => (a.userId || '') === uid && typeof a.score === 'number')
      .map((a) => a.score)
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null

    results.push({
      userId: uid,
      name: traineeStores[uid] || uid,
      studyDays,
      daysPerWeek,
      totalMinutes: Math.round(data.totalTime / 60),
      sessions: data.sessions,
      avgTestScore: avgScore,
    })
  }

  // Group into consistent vs sporadic
  const consistent = results.filter((r) => r.daysPerWeek >= 2)
  const sporadic = results.filter((r) => r.daysPerWeek < 2)
  const consistentAvgScore = consistent.length > 0
    ? Math.round(consistent.filter((r) => r.avgTestScore !== null).reduce((s, r) => s + r.avgTestScore, 0) / Math.max(1, consistent.filter((r) => r.avgTestScore !== null).length))
    : null
  const sporadicAvgScore = sporadic.length > 0
    ? Math.round(sporadic.filter((r) => r.avgTestScore !== null).reduce((s, r) => s + r.avgTestScore, 0) / Math.max(1, sporadic.filter((r) => r.avgTestScore !== null).length))
    : null

  return { perTrainee: results, consistentAvgScore, sporadicAvgScore }
}

/** Trainer → trainee outcome correlation: which trainers produce the best-prepared trainees */
export function computeTrainerOutcomeCorrelation(trainingData, staffAccounts, storeFilter = null) {
  const merged = { ...STAFF_LOGINS, ...staffAccounts }
  const byTrainer = {}

  for (const [, rec] of Object.entries(trainingData || {})) {
    if (!rec || rec.archived) continue
    if (storeFilter && (rec.store || '') !== storeFilter) continue
    const schedule = rec.schedule || {}
    const checklists = rec.checklists || {}

    // Determine certification status + score
    const certItem = schedule.cert || {}
    const isCertified = !!certItem.managerSignedAt

    // Collect readiness scores
    const readinessScores = []
    for (const [shiftKey, cl] of Object.entries(checklists)) {
      if (typeof cl?.managerScore === 'number') readinessScores.push(cl.managerScore)
    }
    const avgReadiness = readinessScores.length > 0
      ? Math.round((readinessScores.reduce((s, v) => s + v, 0) / readinessScores.length) * 10) / 10
      : null

    // Get test scores
    const testResults = rec.testResults || []
    const testScores = testResults.map((r) => r.score || 0)
    const avgTestScore = testScores.length > 0
      ? Math.round(testScores.reduce((s, v) => s + v, 0) / testScores.length)
      : null

    // Attribute to trainers
    const trainers = new Set()
    for (const item of Object.values(schedule)) {
      if (item?.trainer) trainers.add(String(item.trainer))
    }

    trainers.forEach((emp) => {
      if (!byTrainer[emp]) {
        byTrainer[emp] = {
          trainerName: merged[emp]?.name || `#${emp}`,
          empNum: emp,
          traineeCount: 0,
          certifiedCount: 0,
          totalTestScore: 0,
          testScoreCount: 0,
          totalReadiness: 0,
          readinessCount: 0,
        }
      }
      byTrainer[emp].traineeCount++
      if (isCertified) byTrainer[emp].certifiedCount++
      if (avgTestScore !== null) {
        byTrainer[emp].totalTestScore += avgTestScore
        byTrainer[emp].testScoreCount++
      }
      if (avgReadiness !== null) {
        byTrainer[emp].totalReadiness += avgReadiness
        byTrainer[emp].readinessCount++
      }
    })
  }

  return Object.values(byTrainer)
    .filter((t) => t.traineeCount > 0)
    .map((t) => ({
      ...t,
      certPassRate: Math.round((t.certifiedCount / t.traineeCount) * 100),
      avgCertScore: t.testScoreCount > 0 ? Math.round(t.totalTestScore / t.testScoreCount) : null,
      avgReadiness: t.readinessCount > 0 ? Math.round((t.totalReadiness / t.readinessCount) * 10) / 10 : null,
    }))
    .sort((a, b) => b.certPassRate - a.certPassRate)
}
