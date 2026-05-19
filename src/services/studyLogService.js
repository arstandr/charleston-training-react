/**
 * Study Log Service — fetches and merges all study activity for a trainee.
 * Returns a unified reverse-chronological timeline of flashcard sessions,
 * quiz/test sessions, and login events.
 */
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

const MAX_RESULTS = 200

/** Fetch flashcard sessions from flashcardAnalytics.
 *  Tries traineeId field first (new data), falls back to userId (old data stored Firebase UID). */
async function fetchFlashcardSessions(traineeId) {
  if (!db || !traineeId) return []
  const mapDocs = (snap) => snap.docs.map((d) => {
    const data = d.data()
    return {
      type: 'flashcard',
      id: d.id,
      timestamp: data.timestamp || '',
      setId: data.setId || '',
      category: data.category || '',
      cardsViewed: data.cardsViewed || 0,
      gotIt: data.gotIt || 0,
      needsPractice: data.needsPractice || 0,
      timeSpent: data.timeSpent || null,
    }
  })
  try {
    // Try traineeId field (new sessions after update)
    const q1 = query(
      collection(db, 'flashcardAnalytics'),
      where('traineeId', '==', String(traineeId)),
      orderBy('timestamp', 'desc'),
      limit(MAX_RESULTS),
    )
    const snap1 = await getDocs(q1)
    const results = mapDocs(snap1)
    // Also try userId field (old sessions stored employee number directly in some cases)
    const q2 = query(
      collection(db, 'flashcardAnalytics'),
      where('userId', '==', String(traineeId)),
      orderBy('timestamp', 'desc'),
      limit(MAX_RESULTS),
    )
    const snap2 = await getDocs(q2)
    const oldResults = mapDocs(snap2)
    // Merge and deduplicate by doc id
    const seen = new Set(results.map((r) => r.id))
    for (const r of oldResults) {
      if (!seen.has(r.id)) results.push(r)
    }
    return results
  } catch (e) {
    console.warn('[StudyLog] flashcard sessions failed:', e?.message)
    return []
  }
}

/** Fetch quiz/test session summaries from practiceTestSessions */
async function fetchQuizSessions(traineeId) {
  if (!db || !traineeId) return []
  try {
    const q = query(
      collection(db, 'practiceTestSessions'),
      where('traineeId', '==', traineeId),
      orderBy('timestamp', 'desc'),
      limit(MAX_RESULTS),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => {
      const data = d.data()
      return {
        type: 'quiz',
        id: d.id,
        timestamp: data.timestamp || '',
        quizId: data.quizId || '',
        quizTitle: data.quizTitle || '',
        mode: data.mode || 'practice',
        totalQuestions: data.totalQuestions || 0,
        correctCount: data.correctCount || 0,
        wrongCount: data.wrongCount || 0,
        score: data.score || 0,
        timeSpent: data.timeSpent || null,
        passed: data.passed ?? null,
        attemptNumber: data.attemptNumber ?? null,
        source: 'logged',
      }
    })
  } catch (e) {
    console.warn('[StudyLog] quiz sessions failed:', e?.message)
    return []
  }
}

/** Fetch login events from auditLog */
async function fetchLoginEvents(traineeId) {
  if (!db || !traineeId) return []
  try {
    const q = query(
      collection(db, 'auditLog'),
      where('userId', '==', traineeId),
      where('action', '==', 'trainee_login'),
      orderBy('timestamp', 'desc'),
      limit(MAX_RESULTS),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => {
      const data = d.data()
      return {
        type: 'login',
        id: d.id,
        timestamp: data.timestamp || '',
      }
    })
  } catch (e) {
    console.warn('[StudyLog] login events failed:', e?.message)
    return []
  }
}

/** Reconstruct historical quiz sessions from individual quizAttempts docs */
async function reconstructQuizSessions(traineeId) {
  if (!db || !traineeId) return []
  try {
    // quizAttempts stores userId as Firebase Auth UID, but traineeId as employee number
    const q = query(
      collection(db, 'quizAttempts'),
      where('traineeId', '==', String(traineeId)),
      orderBy('timestamp', 'desc'),
      limit(2000),
    )
    const snap = await getDocs(q)
    const bySession = {}
    snap.docs.forEach((d) => {
      const data = { id: d.id, ...d.data() }
      const sid = data.quizSessionId
      if (!sid) return
      if (!bySession[sid]) bySession[sid] = []
      bySession[sid].push(data)
    })

    return Object.entries(bySession).map(([sessionId, attempts]) => {
      const first = attempts[attempts.length - 1] // oldest
      const correctCount = attempts.filter((a) => a.correct).length
      const wrongCount = attempts.length - correctCount
      const score = first?.score || (attempts.length ? Math.round((correctCount / attempts.length) * 100) : 0)
      // Detect mode from question details (official tests have questionText embedded)
      const hasQuestionText = attempts.some((a) => a.questionText != null)
      const mode = hasQuestionText ? 'official' : 'practice'
      return {
        type: 'quiz',
        id: `recon_${sessionId}`,
        timestamp: first?.timestamp || '',
        quizId: first?.quizId || first?.topic || '',
        quizTitle: '',
        mode,
        totalQuestions: attempts.length,
        correctCount,
        wrongCount,
        score,
        timeSpent: null,
        passed: null,
        attemptNumber: null,
        source: 'reconstructed',
        quizSessionId: sessionId,
      }
    })
  } catch (e) {
    console.warn('[StudyLog] quiz reconstruction failed:', e?.message)
    return []
  }
}

/** Parse timestamp string or Firestore timestamp to epoch ms */
function toMs(ts) {
  if (!ts) return 0
  if (typeof ts === 'string') return new Date(ts).getTime() || 0
  if (ts?.toMillis) return ts.toMillis()
  if (ts?.seconds) return ts.seconds * 1000
  return 0
}

/**
 * Fetch all study activity for a trainee: flashcard sessions, quiz sessions,
 * reconstructed historical quiz sessions, and login events.
 * Returns a unified timeline sorted by timestamp desc.
 */
export async function fetchStudyLog(traineeId) {
  const [flashcardSessions, quizSessions, loginEvents, historicalQuizSessions] = await Promise.all([
    fetchFlashcardSessions(traineeId),
    fetchQuizSessions(traineeId),
    fetchLoginEvents(traineeId),
    reconstructQuizSessions(traineeId),
  ])

  // Deduplicate: prefer logged sessions over reconstructed ones (by quizSessionId)
  const loggedSessionIds = new Set()
  quizSessions.forEach((s) => {
    if (s.quizSessionId) loggedSessionIds.add(s.quizSessionId)
  })
  // Also match by quizSessionId field from the logged data
  quizSessions.forEach((s) => {
    // practiceTestSessions may store quizSessionId too
    const data = s
    if (data.quizSessionId) loggedSessionIds.add(data.quizSessionId)
  })
  const dedupedHistorical = historicalQuizSessions.filter(
    (s) => !s.quizSessionId || !loggedSessionIds.has(s.quizSessionId)
  )

  const all = [...flashcardSessions, ...quizSessions, ...dedupedHistorical, ...loginEvents]
  all.sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp))
  return all
}
