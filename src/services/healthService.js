/**
 * Health Dashboard Service — centralizes health data fetching and real-time subscriptions.
 * Used by HealthPage, TrainerHealthView, ManagerHealthView.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '../firebase'
import { getFromFirestore } from '../utils/firestore'

const FIVE_MIN_MS = 5 * 60 * 1000
const FIFTEEN_MIN_MS = 15 * 60 * 1000

/**
 * Real-time subscription to a trainee's full health data.
 * Returns unsubscribe function.
 * @param {string} traineeId - Trainee ID (e.g. T-Westfield-7777)
 * @param {string} userId - Firebase uid / same as traineeId for trainees
 * @param {Function} callback - (data) => void
 * @returns {Function} unsubscribe
 */
export function subscribeTraineeHealth(traineeId, userId, callback) {
  if (!db || !traineeId || !userId || typeof callback !== 'function') return () => {}

  let cancelled = false
  const state = {
    flashcardProgress: null,
    flashcardSessions: null,
    quizAttempts: [],
    weakSpots: [],
    activeSession: null,
    trainingShifts: [],
    trainingData: null,
  }

  function emit() {
    if (cancelled) return
    callback({ ...state })
  }

  const unsubProgress = onSnapshot(
    collection(db, 'flashcardProgress', userId, 'cards'),
    (snap) => {
      const cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const mastered = cards.filter((c) => (c.leitnerBox ?? 1) >= 4).length
      const total = cards.length
      state.flashcardProgress = {
        cards,
        mastered,
        total,
        masteryPct: total > 0 ? (mastered / total) * 100 : 0,
      }
      emit()
    },
    () => { state.flashcardProgress = { cards: [], mastered: 0, total: 0, masteryPct: 0 }; emit() }
  )

  const unsubSessions = onSnapshot(
    doc(db, 'flashcardSessions', userId),
    (snap) => {
      const data = snap.exists() ? snap.data() : {}
      const setCounts = data.setCounts || {}
      const totalSessions = Object.values(setCounts).reduce((a, b) => (a || 0) + (typeof b === 'number' ? b : 0), 0)
      state.flashcardSessions = { setCounts, totalSessions }
      emit()
    },
    () => { state.flashcardSessions = { setCounts: {}, totalSessions: 0 }; emit() }
  )

  const quizQ = query(
    collection(db, 'quizAttempts'),
    where('userId', '==', userId),
    orderBy('timestamp', 'desc'),
    limit(200)
  )
  const unsubQuiz = onSnapshot(
    quizQ,
    (snap) => {
      state.quizAttempts = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      emit()
    },
    () => { state.quizAttempts = []; emit() }
  )

  const weakQ = query(
    collection(db, 'weakSpots'),
    where('userId', '==', userId),
    where('mastered', '==', false),
    limit(100)
  )
  const unsubWeak = onSnapshot(
    weakQ,
    (snap) => {
      state.weakSpots = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      emit()
    },
    () => { state.weakSpots = []; emit() }
  )

  const unsubSession = onSnapshot(
    doc(db, 'activeSessions', traineeId),
    (snap) => {
      if (!snap.exists()) {
        state.activeSession = null
      } else {
        const d = snap.data()
        const lastHb = d.lastHeartbeat?.toMillis?.() ?? d.lastHeartbeat ?? 0
        state.activeSession = { ...d, lastHeartbeat: lastHb }
      }
      emit()
    },
    () => { state.activeSession = null; emit() }
  )

  const shiftsQ = query(
    collection(db, 'trainingShifts'),
    where('traineeId', '==', traineeId),
    limit(50)
  )
  const unsubShifts = onSnapshot(
    shiftsQ,
    (snap) => {
      state.trainingShifts = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      emit()
    },
    () => { state.trainingShifts = []; emit() }
  )

  getFromFirestore('config', 'trainingData').then((cfg) => {
    if (cancelled) return
    const data = cfg?.data ?? cfg ?? {}
    state.trainingData = data[traineeId] ?? null
    emit()
  })

  return () => {
    cancelled = true
    unsubProgress()
    unsubSessions()
    unsubQuiz()
    unsubWeak()
    unsubSession()
    unsubShifts()
  }
}

/**
 * One-time fetch of program-wide health stats for manager view.
 */
export async function fetchProgramHealth(orgId) {
  if (!db) return { atRiskCount: 0, totalTrainees: 0 }
  try {
    const cfg = await getFromFirestore('config', 'trainingData')
    const data = cfg?.data ?? cfg ?? {}
    const trainees = Object.keys(data).filter((id) => data[id] && !data[id].archived)
    return { totalTrainees: trainees.length }
  } catch (_) {
    return { atRiskCount: 0, totalTrainees: 0 }
  }
}

/**
 * Real-time subscription to all active trainees for a trainer.
 * trainerIdOrEmpNum: empNum (e.g. "3333") or uid — schedule stores trainer as empNum.
 * Returns unsubscribe function.
 */
export function subscribeTrainerCohort(trainerIdOrEmpNum, trainingData, callback) {
  if (!trainingData || typeof callback !== 'function') return () => {}
  const trainees = Object.entries(trainingData).filter(
    ([_, rec]) => rec && !rec.archived && rec.schedule && Object.values(rec.schedule).some((s) => String(s.trainer) === String(trainerIdOrEmpNum))
  )
  const unsubs = []
  const state = {}
  function emit() {
    callback(Object.values(state))
  }
  trainees.forEach(([traineeId]) => {
    unsubs.push(
      subscribeTraineeHealth(traineeId, traineeId, (data) => {
        state[traineeId] = { traineeId, ...data }
        emit()
      })
    )
  })
  return () => unsubs.forEach((u) => u())
}

/**
 * Fetch backend health signals: errors, sync status, session counts.
 */
export async function fetchSystemHealth() {
  if (!db) return {}
  const now = Date.now()
  const oneHourAgo = now - 60 * 60 * 1000
  const oneDayAgo = now - 24 * 60 * 60 * 1000

  try {
    const [errorsSnap, sessionsSnap, toastSnap, auditSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'clientErrors'),
          orderBy('timestamp', 'desc'),
          limit(500)
        )
      ).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'activeSessions'), limit(500))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'toastSyncStatus'), limit(50))).catch(() => ({ docs: [] })),
      getDocs(
        query(
          collection(db, 'auditLog'),
          where('action', '==', 'login_failed'),
          orderBy('timestamp', 'desc'),
          limit(100)
        )
      ).catch(() => ({ docs: [] })),
    ])

    const errors = errorsSnap.docs?.map((d) => ({ id: d.id, ...d.data() })) ?? []
    const errorTs = (e) => {
      const t = e.timestamp
      return t?.toMillis ? t.toMillis() : (typeof t === 'string' ? new Date(t).getTime() : 0)
    }
    const errorsLastHour = errors.filter((e) => errorTs(e) >= oneHourAgo).length
    const errorsLast24h = errors.filter((e) => errorTs(e) >= oneDayAgo).length

    const sessions = sessionsSnap.docs?.map((d) => ({ id: d.id, ...d.data() })) ?? []
    const activeCount = sessions.filter((s) => {
      const hb = s.lastHeartbeat?.toMillis?.() ?? s.lastHeartbeat ?? 0
      return now - hb < 600000
    }).length
    const orphanedCount = sessions.filter((s) => {
      const hb = s.lastHeartbeat?.toMillis?.() ?? s.lastHeartbeat ?? 0
      return hb > 0 && now - hb > FIFTEEN_MIN_MS
    }).length

    let lastSyncAt = null
    const toastDocs = toastSnap.docs ?? []
    for (const d of toastDocs) {
      const data = d.data()
      const ls = data.lastSync ?? data.lastSyncAt
      if (ls) {
        const ms = typeof ls === 'object' && ls?.toMillis ? ls.toMillis() : new Date(ls).getTime()
        if (!lastSyncAt || ms > lastSyncAt) lastSyncAt = ms
      }
    }

    const authFails = auditSnap.docs?.length ?? 0

    return {
      errorsLastHour,
      errorsLast24h,
      activeSessions: activeCount,
      orphanedSessions: orphanedCount,
      lastToastSync: lastSyncAt,
      authFailures24h: authFails,
    }
  } catch (_) {
    return {}
  }
}

/**
 * Fetch bottleneck analysis: which shifts/questions trainees struggle with most.
 */
export async function fetchBottleneckAnalysis(orgId) {
  if (!db) return { shifts: [], questions: [], categories: [] }
  try {
    const [shiftsSnap, quizSnap, weakSnap] = await Promise.all([
      getDocs(query(collection(db, 'trainingShifts'), limit(1000))).catch(() => ({ docs: [] })),
      getDocs(
        query(collection(db, 'quizAttempts'), limit(500))
      ).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'weakSpots'), where('mastered', '==', false), limit(500))).catch(() => ({ docs: [] })),
    ])

    const byShift = {}
    shiftsSnap.docs?.forEach((d) => {
      const data = d.data()
      const key = data.shiftType || 'unknown'
      if (!byShift[key]) byShift[key] = { total: 0, withReadiness: 0, readinessSum: 0 }
      byShift[key].total++
      if (typeof data.readiness?.average === 'number') {
        byShift[key].withReadiness++
        byShift[key].readinessSum += data.readiness.average
      }
    })

    const byQuestion = {}
    quizSnap.docs?.forEach((d) => {
      const data = d.data()
      const qid = data.questionId || data.quizId || 'unknown'
      if (!byQuestion[qid]) byQuestion[qid] = { correct: 0, total: 0 }
      byQuestion[qid].total++
      if (data.correct) byQuestion[qid].correct++
    })

    const bySet = {}
    weakSnap.docs?.forEach((d) => {
      const data = d.data()
      const setId = data.setId || 'unknown'
      if (!bySet[setId]) bySet[setId] = 0
      bySet[setId]++
    })

    const shifts = Object.entries(byShift).map(([k, v]) => ({
      shiftType: k,
      ...v,
      avgReadiness: v.withReadiness > 0 ? v.readinessSum / v.withReadiness : null,
    }))

    const questions = Object.entries(byQuestion)
      .filter(([, v]) => v.total >= 5)
      .map(([qid, v]) => ({ questionId: qid, correctRate: v.total ? (v.correct / v.total) * 100 : 0 }))
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 10)

    const categories = Object.entries(bySet)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([setId, count]) => ({ setId, count }))

    return { shifts, questions, categories }
  } catch (_) {
    return { shifts: [], questions: [], categories: [] }
  }
}

/**
 * Fetch trainer effectiveness rankings.
 */
export async function fetchTrainerEffectiveness(orgId) {
  if (!db) return []
  try {
    const [cfgSnap, ratingsSnap, shiftsSnap] = await Promise.all([
      getDoc(doc(db, 'config', 'trainingData')),
      getDocs(query(collection(db, 'trainerRatings'), limit(500))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'trainingShifts'), limit(1000))).catch(() => ({ docs: [] })),
    ])

    const cfg = cfgSnap.exists() ? cfgSnap.data() : {}
    const data = cfg?.data ?? cfg ?? {}
    const ratings = ratingsSnap.docs?.map((d) => ({ id: d.id, ...d.data() })) ?? []
    const shifts = shiftsSnap.docs?.map((d) => ({ id: d.id, ...d.data() })) ?? []

    const byTrainer = {}
    Object.entries(data).forEach(([traineeId, rec]) => {
      if (!rec?.schedule) return
      Object.values(rec.schedule).forEach((s) => {
        const tid = s.trainer
        if (!tid) return
        if (!byTrainer[tid]) byTrainer[tid] = { trainees: new Set(), ratings: [], step3Done: 0, step3Total: 0 }
        byTrainer[tid].trainees.add(traineeId)
      })
    })

    ratings.forEach((r) => {
      const tid = r.trainerId ?? r.trainer
      if (tid && byTrainer[tid]) {
        byTrainer[tid].ratings.push(r)
      }
    })

    shifts.forEach((s) => {
      const tid = s.trainerId ?? s.trainer
      if (tid && byTrainer[tid]) {
        byTrainer[tid].step3Total++
        if (s.step3Checklist?.completed) byTrainer[tid].step3Done++
      }
    })

    return Object.entries(byTrainer).map(([uid, v]) => ({
      trainerId: uid,
      traineeCount: v.trainees.size,
      ratings: v.ratings,
      step3Completion: v.step3Total > 0 ? (v.step3Done / v.step3Total) * 100 : 0,
    }))
  } catch (_) {
    return []
  }
}

/**
 * Fetch chatbot flag stats.
 */
export async function fetchChatbotHealth(orgId) {
  if (!db) return { unresolved: 0, byReason: {}, total: 0 }
  try {
    const snap = await getDocs(
      query(collection(db, 'chatbotFlags'), limit(500))
    ).catch(() => ({ docs: [] }))

    const flags = snap.docs?.map((d) => ({ id: d.id, ...d.data() })) ?? []
    const unresolved = flags.filter((f) => !f.resolved).length
    const byReason = {}
    flags.forEach((f) => {
      const r = f.flagReason || 'Other'
      byReason[r] = (byReason[r] || 0) + 1
    })

    return { unresolved, byReason, total: flags.length }
  } catch (_) {
    return { unresolved: 0, byReason: {}, total: 0 }
  }
}
