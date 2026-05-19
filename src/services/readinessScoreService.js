/**
 * Comprehensive Gemini Readiness Score — synthesizes all trainee data into a 0–100 score.
 * Uses Gemini to weight factors holistically. Extends/replaces simple average scoring.
 */
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { callGeminiJSON } from './geminiService'

const SHIFTS_WITH_STEP3 = ['follow', 'rev1', 'rev2', 'rev3', 'rev4', 'foodrun']

async function fetchTraineeData(userId, traineeId, trainingData) {
  const traineeRec = trainingData?.[traineeId] || {}
  const schedule = traineeRec?.schedule || {}
  const out = {
    flashcardEngagement: null,
    flashcardPerformance: null,
    practiceTestEngagement: null,
    practiceTestPerformance: null,
    officialTestResults: null,
    trainerFeedback: null,
    managerFeedback: null,
    step3ChecklistCompletion: null,
    trainingPaceChanges: null,
    shifts: [],
  }

  if (!db || !userId) return out

  try {
    // 1–2. Flashcard progress and sessions
    const progressRef = collection(db, 'flashcardProgress', userId, 'cards')
    const progressSnap = await getDocs(progressRef)
    const cards = progressSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    const mastered = cards.filter((c) => (c.leitnerBox ?? 1) >= 4).length
    const learning = cards.filter((c) => {
      const b = c.leitnerBox ?? 1
      return b >= 2 && b < 4
    }).length
    const bySet = {}
    cards.forEach((c) => {
      const sid = c.setId || (c.id && c.id.includes('_') ? c.id.split('_')[0] : null)
      if (sid) {
        if (!bySet[sid]) bySet[sid] = { mastered: 0, learning: 0, total: 0 }
        bySet[sid].total++
        if ((c.leitnerBox ?? 1) >= 4) bySet[sid].mastered++
        else if ((c.leitnerBox ?? 1) >= 2) bySet[sid].learning++
      }
    })
    const setsSnap = await getDocs(collection(db, 'flashcardSets'))
    const setCountById = {}
    setsSnap.docs.forEach((d) => {
      const data = d.data()
      setCountById[d.id] = typeof data.cardCount === 'number' ? data.cardCount : 0
    })
    const totalCards = Object.values(setCountById).reduce((a, b) => a + b, 0)
    out.flashcardPerformance = {
      totalCards,
      mastered,
      learning,
      masteryPct: totalCards > 0 ? (mastered / totalCards) * 100 : 0,
      bySet: Object.entries(bySet).map(([setId, s]) => ({
        setId,
        ...s,
        masteryPct: s.total > 0 ? (s.mastered / s.total) * 100 : 0,
      })),
    }

    const sessionSnap = await getDoc(doc(db, 'flashcardSessions', userId))
    const sessionData = sessionSnap.exists() ? sessionSnap.data() : {}
    const setCounts = sessionData?.setCounts || {}
    const totalSessions = Object.values(setCounts).reduce((a, b) => (a || 0) + (typeof b === 'number' ? b : 0), 0)
    const trainingDays = Object.keys(schedule).length || 1
    out.flashcardEngagement = {
      totalSessions: totalSessions || 0,
      sessionsPerDay: trainingDays > 0 ? (totalSessions || 0) / trainingDays : 0,
    }

    // 3–4. Quiz attempts (practice tests)
    const quizRef = collection(db, 'quizAttempts')
    const quizQ = query(
      quizRef,
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(200)
    )
    const quizSnap = await getDocs(quizQ).catch(() => ({ docs: [] }))
    const attempts = quizSnap.docs?.map((d) => ({ id: d.id, ...d.data() })) || []
    const byQuiz = {}
    attempts.forEach((a) => {
      const qid = a.quizId || a.quizSessionId || 'unknown'
      if (!byQuiz[qid]) byQuiz[qid] = []
      byQuiz[qid].push(a)
    })
    const correct = attempts.filter((a) => a.correct).length
    out.practiceTestEngagement = { totalAttempts: attempts.length, byQuiz: Object.keys(byQuiz).length }
    out.practiceTestPerformance = {
      correct,
      total: attempts.length,
      avgCorrectPct: attempts.length > 0 ? (correct / attempts.length) * 100 : 0,
    }

    // 5. Official test results (quiz attempts with mode=official or similar — if tracked)
    out.officialTestResults = attempts.filter((a) => a.mode === 'official' || a.quizId?.includes('official')).slice(0, 10)

    // 6. Trainer ratings
    const ratingsRef = collection(db, 'trainerRatings')
    const ratingsQ = query(
      ratingsRef,
      where('traineeId', '==', traineeId),
      limit(50)
    )
    const ratingsSnap = await getDocs(ratingsQ).catch(() => ({ docs: [] }))
    const ratings = ratingsSnap.docs?.map((d) => ({ id: d.id, ...d.data() })) || []
    out.trainerFeedback = ratings.map((r) => ({
      shiftId: r.shiftId,
      criteria: r.criteria || r.ratings,
      notes: r.notes,
      overall: r.overall,
    }))

    // 7. Manager feedback (from shift feedback, readiness)
    // 8. Step 3 checklists
    // 9. Training pace
    const shiftsRef = collection(db, 'trainingShifts')
    const shiftsQ = query(
      shiftsRef,
      where('traineeId', '==', traineeId),
      limit(50)
    )
    const shiftsSnap = await getDocs(shiftsQ).catch(() => ({ docs: [] }))
    const shifts = shiftsSnap.docs?.map((d) => ({ id: d.id, ...d.data() })) || []
    out.shifts = shifts

    const step3Shifts = shifts.filter((s) => SHIFTS_WITH_STEP3.includes(s.shiftType))
    const step3Completed = step3Shifts.filter((s) => s.step3Checklist?.completed).length
    out.step3ChecklistCompletion = {
      total: step3Shifts.length,
      completed: step3Completed,
      pct: step3Shifts.length > 0 ? (step3Completed / step3Shifts.length) * 100 : 0,
      notesQuality: step3Shifts
        .filter((s) => s.step3Checklist?.notes)
        .map((s) => {
          const n = s.step3Checklist.notes || {}
          const filled = Object.values(n).filter((v) => v && String(v).trim()).length
          return { shiftType: s.shiftType, filledSteps: filled }
        }),
    }

    const managerFeedback = []
    shifts.forEach((s) => {
      if (s.feedback?.strengths || s.feedback?.opportunities || s.feedback?.goalsNext) {
        managerFeedback.push({
          shiftType: s.shiftType,
          strengths: s.feedback.strengths,
          opportunities: s.feedback.opportunities,
          goalsNext: s.feedback.goalsNext,
        })
      }
      if (s.readiness) {
        managerFeedback.push({
          shiftType: s.shiftType,
          readiness: s.readiness,
        })
      }
    })
    out.managerFeedback = managerFeedback

    // Training extensions: check schedule for repeated shifts or extensions
    const shiftKeys = Object.keys(schedule)
    const extended = shiftKeys.filter((k) => {
      const entry = schedule[k]
      return entry?.extended || entry?.repeated || entry?.notes?.toLowerCase?.().includes('extend')
    })
    out.trainingPaceChanges = { extensions: extended.length, scheduleKeys: shiftKeys }
  } catch (e) {
    console.warn('[ReadinessScore] Fetch error:', e?.message)
  }
  return out
}

/**
 * Compute comprehensive readiness score via Gemini.
 * @param {{ userId: string, traineeId: string, traineeName?: string, trainingData?: object }}
 * @returns {{ score: number, summary: string, strengths: string[], needsImprovement: string[], recommendation: 'Ready'|'Almost Ready'|'Needs More Time', error?: string }}
 */
export async function computeGeminiReadinessScore({ userId, traineeId, traineeName = 'Trainee', trainingData = {} }) {
  const data = await fetchTraineeData(userId, traineeId, trainingData)
  const prompt = `You are evaluating a restaurant server trainee's readiness for certification. Given the following data, produce a comprehensive readiness assessment.

TRAINEE: ${traineeName}

DATA (JSON):
${JSON.stringify(data, null, 2)}

INSTRUCTIONS:
1. Compute an overall readiness score 0-100. Weight factors: Flashcard performance (15%), Flashcard engagement (15%), Practice test performance (15%), Practice test engagement (10%), Official test results (20% if any), Trainer feedback (10%), Manager feedback (5%), Step 3 checklist completion (10%), Training pace/extensions (up to -10 if many extensions).
2. If a factor has no data, exclude it and redistribute weight among available factors.
3. Weight recent activity more than old.
4. Synthesize holistically — a trainee who improved late should score better than one who declined.
5. Provide a 2-3 sentence summary.
6. List 1-3 strongest factors and 1-3 that need improvement.
7. Recommend exactly one of: "Ready", "Almost Ready", "Needs More Time".

Respond ONLY with valid JSON in this exact format (no markdown):
{
  "score": number,
  "summary": "string",
  "strengths": ["string"],
  "needsImprovement": ["string"],
  "recommendation": "Ready" | "Almost Ready" | "Needs More Time"
}`

  try {
    const result = await callGeminiJSON(prompt, userId, { temperature: 0.3, maxTokens: 1024 })
    if (result && typeof result.score === 'number') {
      return {
        score: Math.min(100, Math.max(0, Math.round(result.score))),
        summary: result.summary || '',
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        needsImprovement: Array.isArray(result.needsImprovement) ? result.needsImprovement : [],
        recommendation: ['Ready', 'Almost Ready', 'Needs More Time'].includes(result.recommendation)
          ? result.recommendation
          : 'Needs More Time',
      }
    }
    return { score: 0, summary: 'Unable to compute score.', strengths: [], needsImprovement: [], recommendation: 'Needs More Time' }
  } catch (e) {
    return {
      score: 0,
      summary: '',
      strengths: [],
      needsImprovement: [],
      recommendation: 'Needs More Time',
      error: e?.message || 'Failed to compute readiness',
    }
  }
}
