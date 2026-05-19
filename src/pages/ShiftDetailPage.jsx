import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getExistingRating } from '../services/trainerRatingsService'
import { createPostShiftCheck } from '../services/postShiftCheckService'
import { getUserProfile } from '../services/userProfileService'
import { getShift, updateShift } from '../services/trainingShiftsService'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import {
  SHIFT_TYPES,
  SHIFT_TEMPLATES,
  SEVEN_STEPS_OF_SERVICE,
  MISSION_STATEMENT,
} from '../data/shiftChecklistTemplates'
import { EXERCISE_DEFINITIONS } from '../data/shiftChecklistTemplates'
import { ChecklistSection, SevenStepsBox, SignOffSection } from '../components/ChecklistSections'
import Step3ChecklistSection from '../components/Step3ChecklistSection'
import ReadinessScoring from '../components/ReadinessScoring'
import PerformanceAppraisalGrid from '../components/PerformanceAppraisalGrid'
import TrainerRatingModalFirestore from '../components/TrainerRatingModalFirestore'
import PracticeGreetExercise from '../components/exercises/PracticeGreetExercise'
import ServiceReviewExercise from '../components/exercises/ServiceReviewExercise'
import WineExercise from '../components/exercises/WineExercise'
import UpsellingExercise from '../components/exercises/UpsellingExercise'

export default function ShiftDetailPage() {
  const { shiftId } = useParams()
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  const { theme, setTheme } = useTheme()

  const [shift, setShift] = useState(null)
  const [trainee, setTrainee] = useState(null)
  const [trainer, setTrainer] = useState(null)
  const [feedback, setFeedback] = useState({
    strengths: '',
    opportunities: '',
    goal1: '',
    goal2: '',
    goal3: '',
    appraisalRatings: {},
  })
  const [checkedItems, setCheckedItems] = useState({})
  const [sectionComments, setSectionComments] = useState({})
  const [ratings, setRatings] = useState({})
  const [goals, setGoals] = useState(['', '', ''])
  const [appraisalComments, setAppraisalComments] = useState('')
  const [signOffs, setSignOffs] = useState({})
  const [shiftDate, setShiftDate] = useState('')
  const [amPm, setAmPm] = useState('')
  const [sevenStepsAnswers, setSevenStepsAnswers] = useState([])
  const [exerciseData, setExerciseData] = useState({})
  const [serviceReviewAnswers, setServiceReviewAnswers] = useState({})
  const [step3Checklist, setStep3Checklist] = useState({ notes: {} })
  const [activeTab, setActiveTab] = useState('checklist')
  const [readinessScores, setReadinessScores] = useState({
    knowledge: null,
    execution: null,
    confidence: null,
    average: null,
  })
  const [showTrainerRating, setShowTrainerRating] = useState(false)
  const [existingRating, setExistingRating] = useState(null)
  const [checkingRating, setCheckingRating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openExercise, setOpenExercise] = useState(null)
  const [exercisePanelData, setExercisePanelData] = useState({})
  const [feedbackToast, setFeedbackToast] = useState(null)
  const [sectionIdx, setSectionIdx] = useState(0)
  const exerciseDataRef = useRef({})
  const swipeStartRef = useRef(null)

  const showToast = (text, type = 'success') => {
    setFeedbackToast({ text, type })
    setTimeout(() => setFeedbackToast(null), 3500)
  }

  const userId = currentUser?.uid || currentUser?.id
  const role = (currentUser?.role || '').toLowerCase()
  const isTrainer = role === 'trainer' || (typeof role === 'string' && role.includes('manager')) || role === 'admin' || role === 'owner'

  const shiftKey = shift?.shiftType
  const template = shiftKey ? SHIFT_TEMPLATES[shiftKey] : null
  const isReadOnly = !isTrainer || shift?.status === 'completed'

  useEffect(() => {
    loadShiftData()
  }, [shiftId])

  useEffect(() => {
    if (!shift?.id || !shift?.traineeId || userId !== shift.traineeId) return
    setCheckingRating(true)
    getExistingRating(shift.id, shift.traineeId)
      .then((result) => setExistingRating(result))
      .catch((e) => console.error('Error checking trainer rating:', e))
      .finally(() => setCheckingRating(false))
  }, [shift?.id, shift?.traineeId, userId])

  async function loadShiftData() {
    try {
      setLoading(true)
      const shiftData = await getShift(shiftId)

      if (!shiftData) {
        alert('Shift not found')
        navigate(role === 'manager' ? '/manager' : '/training', { replace: true })
        return
      }
      setShift(shiftData)

      if (shiftData.traineeId) {
        const traineeProfile = await getUserProfile(shiftData.traineeId)
        if (traineeProfile) setTrainee(traineeProfile)
      }
      if (shiftData.trainerId) {
        const trainerProfile = await getUserProfile(shiftData.trainerId)
        if (trainerProfile) setTrainer(trainerProfile)
      }

      const fb = shiftData.feedback || {}
      setFeedback({
        strengths: fb.strengths ?? '',
        opportunities: fb.opportunities ?? '',
        goal1: fb.goal1 ?? fb.goalsNext ?? '',
        goal2: fb.goal2 ?? '',
        goal3: fb.goal3 ?? '',
        appraisalRatings: fb.appraisalRatings ?? {},
      })

      setCheckedItems(shiftData.checkedItems || {})
      setSectionComments(shiftData.sectionComments || {})
      setRatings(shiftData.ratings || {})
      setGoals(shiftData.goals || ['', '', ''])
      setAppraisalComments(shiftData.appraisalComments || '')
      setSignOffs(shiftData.signOffs || {})
      setShiftDate(shiftData.shiftDate || '')
      setAmPm(shiftData.amPm || '')
      setSevenStepsAnswers(shiftData.sevenStepsAnswers || [])
      setExerciseData(shiftData.exerciseData || {})
      setExercisePanelData(shiftData.exercisePanelData || {})
      setServiceReviewAnswers(shiftData.serviceReviewAnswers || {})
      setStep3Checklist(shiftData.step3Checklist || { notes: {} })

      if (shiftData.readiness) {
        setReadinessScores({
          knowledge: shiftData.readiness.knowledge ?? null,
          execution: shiftData.readiness.execution ?? null,
          confidence: shiftData.readiness.confidence ?? null,
          average: shiftData.readiness.average ?? null,
        })
      }
    } catch (error) {
      console.error('Error loading shift:', error)
      alert('Failed to load shift data')
    } finally {
      setLoading(false)
    }
  }

  function handleToggleItem(itemId) {
    setCheckedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  function handleSectionComment(sectionKey, value) {
    setSectionComments((prev) => ({ ...prev, [sectionKey]: value }))
  }

  async function saveFeedback() {
    console.log('[SaveFeedback] isTrainer:', isTrainer, 'role:', role, 'feedback:', feedback)
    if (!isTrainer) {
      showToast('Only trainers can save feedback', 'error')
      return
    }
    if (!readinessScores.knowledge || !readinessScores.execution || !readinessScores.confidence) {
      showToast('Tip: Complete all 3 readiness categories for a full assessment', 'warning')
    }
    try {
      setSaving(true)
      await updateShift(shiftId, {
        feedback: {
          strengths: feedback.strengths,
          opportunities: feedback.opportunities,
          goal1: feedback.goal1,
          goal2: feedback.goal2,
          goal3: feedback.goal3,
          appraisalRatings: feedback.appraisalRatings || {},
        },
        checkedItems,
        sectionComments,
        ratings,
        goals,
        appraisalComments,
        signOffs,
        shiftDate,
        amPm,
        sevenStepsAnswers,
        exerciseData,
        exercisePanelData,
        serviceReviewAnswers,
        step3Checklist: {
          ...step3Checklist,
          notes: step3Checklist.notes || {},
          completed: !!Object.values(step3Checklist.notes || {}).some((v) => v && String(v).trim()),
          completedAt: new Date().toISOString(),
          completedBy: currentUser?.name || userId,
        },
        readiness: {
          ...readinessScores,
          ratedBy: userId,
          ratedByName: currentUser?.name || 'Trainer',
          ratedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      })
      setShift((prev) =>
        prev ? { ...prev, feedback: { ...feedback }, updatedAt: new Date().toISOString() } : null
      )
      showToast('Feedback saved ✓', 'success')
    } catch (error) {
      console.error('Error saving feedback:', error)
      showToast('Failed to save — please try again', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function completeShift() {
    if (!readinessScores.knowledge || !readinessScores.execution || !readinessScores.confidence) {
      alert('Please complete the Trainee Readiness scoring before signing off')
      return
    }
    if (!feedback.strengths?.trim() || !feedback.opportunities?.trim() || !feedback.goal1?.trim() || !feedback.goal2?.trim() || !feedback.goal3?.trim()) {
      alert('Please complete all feedback sections before signing off')
      return
    }
    try {
      setSaving(true)
      await updateShift(shiftId, {
        status: 'completed',
        trainerSignedOff: true,
        trainerSignedAt: new Date().toISOString(),
        completedDate: new Date().toISOString(),
        checkedItems,
        sectionComments,
        ratings,
        goals,
        appraisalComments,
        signOffs,
        shiftDate,
        amPm,
        sevenStepsAnswers,
        exerciseData,
        exercisePanelData,
        serviceReviewAnswers,
        step3Checklist: {
          ...step3Checklist,
          notes: step3Checklist.notes || {},
          completed: !!Object.values(step3Checklist.notes || {}).some((v) => v && String(v).trim()),
          completedAt: new Date().toISOString(),
          completedBy: currentUser?.name || userId,
        },
        readiness: {
          ...readinessScores,
          ratedBy: userId,
          ratedByName: currentUser?.name || 'Trainer',
          ratedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      })
      setShift((prev) =>
        prev
          ? {
              ...prev,
              status: 'completed',
              trainerSignedOff: true,
              trainerSignedAt: new Date().toISOString(),
              completedDate: new Date().toISOString(),
            }
          : null
      )
      // Create post-shift knowledge check for the trainee
      if (shift?.traineeId && shiftKey) {
        createPostShiftCheck(shift.traineeId, shiftKey).catch(() => {})
      }
      alert('Shift completed and signed off')
      navigate(role === 'manager' ? '/manager' : '/training', { replace: true })
    } catch (error) {
      console.error('Error completing shift:', error)
      alert('Failed to complete shift: ' + (error?.message || error))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Determines if an exercise has been sufficiently completed.
   * Accepts data as parameter so it works with latest data when panel closes (state may not have updated yet).
   */
  function isExerciseComplete(exerciseKey, data) {
    const exerciseData = data ?? exercisePanelData[exerciseKey] ?? exerciseDataRef.current[exerciseKey]
    if (!exerciseData) return false

    switch (exerciseKey) {
      case 'practice_greet':
      case 'practiceGreet': {
        const greetPoints = exerciseData.greetPoints
        const filledPoints = Array.isArray(greetPoints)
          ? greetPoints.filter((p) => p && String(p).trim()).length
          : Object.values(greetPoints || {}).filter(Boolean).length
        const managerName = (exerciseData.managerName || exerciseData.managerGreeted || '').trim()
        return filledPoints >= 3 && managerName.length > 0
      }
      case 'service_review_1':
      case 'serviceReview_rev1': {
        const graded = Object.values(exerciseData.grades || {}).filter((v) => v === 'pass' || v === 'fail').length
        return graded >= 5
      }
      case 'service_review_2':
      case 'serviceReview_rev4': {
        const graded = Object.values(exerciseData.grades || {}).filter((v) => v === 'pass' || v === 'fail').length
        return graded >= 6
      }
      case 'wine_exercise_day4':
      case 'wine_exercise_cert':
      case 'wineExercise': {
        const steps = exerciseData.steps || exerciseData.checks || {}
        const checked = Object.values(steps).filter(Boolean).length
        return checked >= 11
      }
      case 'upselling_exercise':
      case 'upsellingExercise': {
        const answers = exerciseData.answers || {}
        const answered = Object.values(answers).filter((v) => v !== undefined && v !== null && String(v).trim()).length
        return answered >= 5
      }
      default:
        return false
    }
  }

  function handleOpenExercise(exerciseKey, _itemId) {
    setOpenExercise(exerciseKey)
  }

  function handleCloseExercise() {
    const key = openExercise
    if (!key) {
      setOpenExercise(null)
      return
    }
    const data = exerciseDataRef.current[key] ?? exercisePanelData[key]
    const nextPanelData = { ...exercisePanelData, [key]: data }
    setExercisePanelData(nextPanelData)
    if (data && isExerciseComplete(key, data) && template?.sections) {
      const isComplete = (id) => {
        const pd = data
        if (id === 'practiceGreet') return !!(pd?.comments?.trim())
        if (id.startsWith('serviceReview')) return Object.keys(pd?.grades || {}).length > 0
        if (id === 'upsellingExercise') return Object.values(pd?.answers || {}).filter(a => a?.trim()).length >= 5
        if (id === 'wineExercise' || id === 'wine_exercise_cert') return Object.values(pd?.checks || pd?.steps || {}).filter(Boolean).length >= 11
        return false
      }
      for (const section of template.sections) {
        for (const item of section.items || []) {
          const exId = item.exerciseId || item.linkedExercise
          if (exId === key && isComplete(exId) && !checkedItems[item.id]) {
            handleToggleItem(item.id)
            break
          }
        }
      }
    }
    if (shift?.id && data) {
      updateShift(shift.id, {
        exercisePanelData: nextPanelData,
        updatedAt: new Date().toISOString(),
      }).catch((err) => console.error('Failed to save exercise data on close:', err))
    }
    setOpenExercise(null)
  }

  function handleExerciseDataChange(exerciseKey, newData) {
    exerciseDataRef.current[exerciseKey] = newData
    setExercisePanelData((prev) => ({ ...prev, [exerciseKey]: newData }))
  }

  // Build swipeable screens for checklist tab
  const checklistScreens = useMemo(() => {
    if (!template?.sections) return []
    const screens = template.sections.map((section, idx) => ({
      type: 'section',
      key: section.id ?? `section_${idx}`,
      section,
      idx,
    }))
    screens.push({ type: 'sevenSteps', key: 'sevenSteps' })
    if (isTrainer && template?.appraisalCategories) {
      screens.push({ type: 'appraisal', key: 'appraisal' })
    }
    return screens
  }, [template, isTrainer])

  // Reset section index when shift type changes
  useEffect(() => { setSectionIdx(0) }, [shiftKey])

  function handleSwipeStart(e) {
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function handleSwipeEnd(e) {
    if (!swipeStartRef.current) return
    const dx = e.changedTouches[0].clientX - swipeStartRef.current.x
    const dy = e.changedTouches[0].clientY - swipeStartRef.current.y
    swipeStartRef.current = null
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return
    if (dx < 0 && sectionIdx < checklistScreens.length - 1) setSectionIdx((i) => i + 1)
    if (dx > 0 && sectionIdx > 0) setSectionIdx((i) => i - 1)
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">Loading shift details…</p>
        </div>
      </div>
    )
  }

  if (!shift) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-300">Shift not found</p>
        </div>
      </div>
    )
  }

  const shiftTypeInfo = SHIFT_TYPES[shift.shiftType]
  const scheduledDate = shift.scheduledDate?.toDate?.() ?? (shift.scheduledDate ? new Date(shift.scheduledDate) : null)
  const trainerName = trainer?.name || currentUser?.name || 'Unknown'

  const SHIFTS_WITH_STEP3 = ['follow', 'rev1', 'rev2', 'rev3', 'rev4', 'foodrun']
  const showStep3Tab = shiftKey && SHIFTS_WITH_STEP3.includes(shiftKey)

  const tabConfig = useMemo(() => {
    const tabs = [{ key: 'checklist', label: 'Checklist', icon: '✅' }]
    if (showStep3Tab) tabs.push({ key: 'step3', label: 'Step 3', icon: '🔄' })
    tabs.push({ key: 'signoff', label: 'Review & Sign Off', icon: '✍️' })
    return tabs
  }, [template, showStep3Tab, shiftKey])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {feedbackToast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg border px-4 py-3 shadow-lg text-sm ${
            feedbackToast.type === 'error'
              ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-600 dark:bg-red-900/30 dark:text-red-200'
              : 'border-green-200 bg-white text-gray-800 dark:border-green-700 dark:bg-gray-800 dark:text-gray-100'
          }`}
        >
          {feedbackToast.text}
        </div>
      )}
      <header className="bg-gradient-to-r from-green-700 to-green-800 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between text-white">
          <h1 className="text-2xl font-bold text-white">Charleston&apos;s Training</h1>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 hover:bg-green-600 rounded-lg transition-colors"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            {isTrainer && (
              <span className="px-3 py-1 bg-yellow-500 text-yellow-900 rounded-full text-sm font-semibold">
                TRAINER
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                logout?.()
                navigate('/login', { replace: true })
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
            >
              Log out ({currentUser?.name || 'User'})
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <button
          type="button"
          onClick={() => navigate(role === 'manager' ? '/manager' : '/training')}
          className="mb-6 flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors font-semibold"
        >
          ← Back
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="text-4xl">{shiftTypeInfo?.icon}</div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {template?.day && `${template.day} — `}
                  {shiftTypeInfo?.label}
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  {scheduledDate
                    ? `${scheduledDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })} at ${scheduledDate.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`
                    : 'No date set'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Trainer: {trainerName}</p>
                {trainee?.name && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Trainee: {trainee.name}</p>
                )}
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                shift.status === 'completed'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                  : shift.status === 'in-progress'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
              }`}
            >
              {shift.status === 'completed' ? 'Completed' : shift.status === 'in-progress' ? 'In Progress' : 'Scheduled'}
            </span>
          </div>

          {template?.subtitle && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4">
              <p className="text-sm text-blue-800 dark:text-blue-200 italic leading-relaxed">{template.subtitle}</p>
            </div>
          )}

          <div className="text-center py-3 mb-4">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Mission Statement
            </p>
            <p className="text-lg font-bold text-gray-800 dark:text-white italic mt-1">{MISSION_STATEMENT}</p>
          </div>

          {template?.test && (
            <button
              type="button"
              onClick={() => navigate(`/quizzes?shift=${encodeURIComponent(shiftKey)}&mode=practice`)}
              className="w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 mb-4 flex items-center gap-2 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors text-left"
            >
              <span>📝</span>
              <div className="flex-1">
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">Test: {template.test}</span>
                <span className="text-xs text-amber-600 dark:text-amber-400 ml-2">Tap to practice →</span>
              </div>
            </button>
          )}

          {template?.reminderNote && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
              <span>⚠️</span>
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">{template.reminderNote}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {shiftTypeInfo?.linkedTest && (
              <button
                type="button"
                onClick={() => navigate(`/quizzes`)}
                className="px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors font-semibold"
              >
                Quiz: Standards & 7 Steps
              </button>
            )}
            {currentUser?.role === 'trainee' &&
              shift?.traineeId === (currentUser?.uid || currentUser?.id) &&
              shift?.status === 'completed' && (
                <button
                  type="button"
                  onClick={() => setShowTrainerRating(true)}
                  disabled={checkingRating}
                  className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {checkingRating ? (
                    <>
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Loading...
                    </>
                  ) : existingRating ? (
                    <>⭐ Update Trainer Rating</>
                  ) : (
                    <>⭐ Rate Your Trainer</>
                  )}
                </button>
              )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-6 overflow-x-auto">
            {tabConfig.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {activeTab === 'checklist' && template && (
            <div className="mb-8">
              {/* Swipe navigation bar */}
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  disabled={sectionIdx === 0}
                  onClick={() => setSectionIdx((i) => Math.max(0, i - 1))}
                  className="px-3 py-1.5 sm:px-5 sm:py-2.5 sm:text-base text-sm font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 transition-all active:scale-95"
                >
                  ← Prev
                </button>
                <div className="flex items-center gap-1.5">
                  {checklistScreens.map((s, i) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setSectionIdx(i)}
                      className={`rounded-full transition-all ${
                        i === sectionIdx
                          ? 'w-3 h-3 sm:w-4 sm:h-4 bg-green-600 dark:bg-green-500'
                          : i < sectionIdx
                            ? 'w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-300 dark:bg-green-700'
                            : 'w-2.5 h-2.5 sm:w-3 sm:h-3 bg-gray-300 dark:bg-gray-600'
                      }`}
                      aria-label={`Section ${i + 1}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={sectionIdx >= checklistScreens.length - 1}
                  onClick={() => setSectionIdx((i) => Math.min(checklistScreens.length - 1, i + 1))}
                  className="px-3 py-1.5 sm:px-5 sm:py-2.5 sm:text-base text-sm font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 transition-all active:scale-95"
                >
                  Next →
                </button>
              </div>

              {/* Section label */}
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 mb-3">
                {sectionIdx + 1} of {checklistScreens.length}
                {checklistScreens[sectionIdx]?.type === 'section' && (
                  <span className="ml-1 font-medium">— {checklistScreens[sectionIdx].section.title}</span>
                )}
                {checklistScreens[sectionIdx]?.type === 'sevenSteps' && (
                  <span className="ml-1 font-medium">— 7 Steps of Service</span>
                )}
                {checklistScreens[sectionIdx]?.type === 'appraisal' && (
                  <span className="ml-1 font-medium">— Performance Appraisal</span>
                )}
              </p>

              {/* Swipeable content area */}
              <div
                onTouchStart={handleSwipeStart}
                onTouchEnd={handleSwipeEnd}
                className="min-h-[200px]"
              >
                {checklistScreens[sectionIdx]?.type === 'section' && (() => {
                  const screen = checklistScreens[sectionIdx]
                  const sectionKey = screen.section.id ?? `section_${screen.idx}`
                  return (
                    <ChecklistSection
                      key={sectionKey}
                      section={screen.section}
                      sectionIndex={screen.idx}
                      checkedItems={checkedItems}
                      onToggleItem={handleToggleItem}
                      comments={sectionComments[sectionKey]}
                      onCommentChange={(val) => handleSectionComment(sectionKey, val)}
                      disabled={isReadOnly}
                      defaultExpanded={true}
                      onOpenExercise={handleOpenExercise}
                      isExerciseComplete={(id) => {
                        const pd = exercisePanelData[id] || {}
                        if (id === 'practiceGreet') return !!(pd.comments?.trim())
                        if (id.startsWith('serviceReview')) return Object.keys(pd.grades || {}).length > 0
                        if (id === 'upsellingExercise') return Object.values(pd.answers || {}).filter(a => a?.trim()).length >= 5
                        if (id === 'wineExercise' || id === 'wine_exercise_cert') return Object.values(pd?.checks || pd?.steps || {}).filter(Boolean).length >= 11
                        return false
                      }}
                      openExercise={openExercise}
                      onOpenFlashcards={(setId) => navigate(`/flashcards?set=${encodeURIComponent(setId || '')}`)}
                    />
                  )
                })()}

                {checklistScreens[sectionIdx]?.type === 'sevenSteps' && (
                  <SevenStepsBox
                    steps={SEVEN_STEPS_OF_SERVICE}
                    traineeAnswers={sevenStepsAnswers}
                    onAnswerChange={(idx, val) => {
                      const newAnswers = [...sevenStepsAnswers]
                      newAnswers[idx] = val
                      setSevenStepsAnswers(newAnswers)
                    }}
                    disabled={isReadOnly}
                  />
                )}

                {checklistScreens[sectionIdx]?.type === 'appraisal' && (
                  <PerformanceAppraisalGrid
                    shiftType={shift?.shiftType}
                    ratings={feedback.appraisalRatings || {}}
                    onChange={(ratings) => setFeedback((f) => ({ ...f, appraisalRatings: ratings }))}
                    disabled={!isTrainer || shift?.status === 'completed'}
                  />
                )}
              </div>

              {/* Exercise overlay panel (shows when an exercise is opened from a checklist item) */}
              {openExercise && (() => {
                const exerciseDef = EXERCISE_DEFINITIONS[openExercise]
                if (!exerciseDef) return null
                const panelData = exercisePanelData[openExercise] || {}
                let content = null
                if (exerciseDef.component === 'PracticeGreetExercise') {
                  content = <PracticeGreetExercise data={panelData} onChange={(d) => handleExerciseDataChange(openExercise, d)} disabled={isReadOnly} />
                } else if (exerciseDef.component === 'ServiceReviewExercise') {
                  content = <ServiceReviewExercise data={panelData} onChange={(d) => handleExerciseDataChange(openExercise, d)} questions={exerciseDef.questions} title={exerciseDef.title} disabled={isReadOnly} />
                } else if (exerciseDef.component === 'WineExercise') {
                  content = <WineExercise data={panelData} onChange={(d) => handleExerciseDataChange(openExercise, d)} variant={exerciseDef.variant || 'day4'} disabled={isReadOnly} />
                } else if (exerciseDef.component === 'UpsellingExercise') {
                  content = <UpsellingExercise data={panelData} onChange={(d) => handleExerciseDataChange(openExercise, d)} disabled={isReadOnly} />
                }
                return (
                  <div className="mt-2 mb-4 rounded-xl border-2 border-green-400 dark:border-green-600 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 bg-green-50 dark:bg-green-900/30 border-b border-green-200 dark:border-green-700">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{exerciseDef.icon}</span>
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-white text-base">{exerciseDef.title}</h3>
                          <p className="text-xs text-green-700 dark:text-green-300 font-medium">{exerciseDef.subtitle}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseExercise}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                      >
                        ✕ Close
                      </button>
                    </div>
                    <div className="p-5">{content}</div>
                  </div>
                )
              })()}
            </div>
          )}

          {activeTab === 'step3' && (
            <div className="mb-8">
              <Step3ChecklistSection
                notes={step3Checklist.notes || {}}
                onNotesChange={(notes) => setStep3Checklist((prev) => ({ ...prev, notes }))}
                disabled={isReadOnly}
                completed={step3Checklist.completed}
                completedAt={step3Checklist.completedAt}
                completedBy={step3Checklist.completedBy}
                shiftType={shift?.shiftType}
              />
              {isTrainer && !shift?.status?.includes('completed') && (
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  Save feedback to persist Step 3 notes.
                </p>
              )}
            </div>
          )}

          {activeTab === 'signoff' && (
            <div className="mb-8 space-y-8">
              {isTrainer && (
                <div>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                    📊 Performance Appraisal (1–3)
                  </h3>
                  <PerformanceAppraisalGrid
                    shiftType={shift?.shiftType}
                    ratings={feedback.appraisalRatings || {}}
                    onChange={(ratings) => setFeedback((f) => ({ ...f, appraisalRatings: ratings }))}
                    disabled={!isTrainer || shift?.status === 'completed'}
                  />
                </div>
              )}
              {isTrainer && (
                <ReadinessScoring
                  initialScores={readinessScores}
                  onChange={setReadinessScores}
                  isTrainer={isTrainer}
                  readonly={shift.status === 'completed'}
                />
              )}
              <div>
                <h4 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-4">
                  STRENGTHS / OPPORTUNITIES / GOALS
                </h4>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Strengths</label>
                  <textarea
                    value={feedback.strengths}
                    onChange={(e) => setFeedback((f) => ({ ...f, strengths: e.target.value }))}
                    placeholder="What went well..."
                    rows={3}
                    disabled={!isTrainer}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Opportunities</label>
                  <textarea
                    value={feedback.opportunities}
                    onChange={(e) => setFeedback((f) => ({ ...f, opportunities: e.target.value }))}
                    placeholder="Areas to improve..."
                    rows={3}
                    disabled={!isTrainer}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Developmental Goal #1</label>
                  <textarea
                    value={feedback.goal1}
                    onChange={(e) => setFeedback((f) => ({ ...f, goal1: e.target.value }))}
                    placeholder="First developmental goal..."
                    rows={2}
                    disabled={!isTrainer}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Developmental Goal #2</label>
                  <textarea
                    value={feedback.goal2}
                    onChange={(e) => setFeedback((f) => ({ ...f, goal2: e.target.value }))}
                    placeholder="Second developmental goal..."
                    rows={2}
                    disabled={!isTrainer}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Developmental Goal #3</label>
                  <textarea
                    value={feedback.goal3}
                    onChange={(e) => setFeedback((f) => ({ ...f, goal3: e.target.value }))}
                    placeholder="Third developmental goal..."
                    rows={2}
                    disabled={!isTrainer}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              {isTrainer && (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={saveFeedback}
                    disabled={saving}
                    className="flex-1 min-w-[140px] px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving…' : 'Save feedback'}
                  </button>
                  {shift.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={completeShift}
                      disabled={saving}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Complete & Sign Off
                    </button>
                  )}
                </div>
              )}
              <SignOffSection
                signOffs={signOffs}
                onSignOff={(role) => {
                  setSignOffs((prev) => ({
                    ...prev,
                    [role]: {
                      signed: true,
                      name: currentUser?.name || currentUser?.displayName || role,
                      timestamp: new Date().toISOString(),
                      role: currentUser?.role || role,
                    },
                  }))
                }}
                shiftDate={shiftDate}
                onShiftDateChange={setShiftDate}
                amPm={amPm}
                onAmPmChange={setAmPm}
                disabled={isReadOnly}
              />
            </div>
          )}
        </div>
      </main>

      <button
        type="button"
        className="fixed bottom-6 right-6 w-14 h-14 bg-green-700 text-white rounded-full shadow-lg hover:bg-green-800 transition-all hover:scale-110 flex items-center justify-center text-2xl font-bold"
        onClick={() => alert('Help documentation coming soon')}
        aria-label="Help"
      >
        ?
      </button>

      {showTrainerRating && shift && trainee && (
        <TrainerRatingModalFirestore
          shift={shift}
          trainee={trainee}
          trainer={{ id: shift.trainerId, name: trainerName }}
          onClose={async () => {
            setShowTrainerRating(false)
            if (!shift?.id || !shift?.traineeId || userId !== shift.traineeId) return
            try {
              setExistingRating(await getExistingRating(shift.id, shift.traineeId))
            } catch (_) {}
          }}
          existingRating={existingRating}
        />
      )}
    </div>
  )
}
