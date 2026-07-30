import { useState, useCallback, useEffect, useRef } from 'react'
import { collection, doc, onSnapshot, writeBatch, deleteDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { ensureTrainingDataFromFirestore } from '../utils/firestore'
import { normalizeVerbalCert } from '../utils/helpers'

const TRAINING_DATA_KEY = 'trainingData'
const TRAINING_DATA_FETCHED_AT_KEY = 'trainingData_fetchedAt'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(TRAINING_DATA_KEY) || '{}'
    return JSON.parse(raw) || {}
  } catch (_) {
    return {}
  }
}

function cacheLocally(data) {
  try { localStorage.setItem(TRAINING_DATA_KEY, JSON.stringify(data)) } catch (_) {}
}

export function listTrainees(trainingData, { store = null, includeArchived = false } = {}) {
  const out = []
  for (const [id, rec] of Object.entries(trainingData || {})) {
    if (!rec || (!includeArchived && rec.archived)) continue
    if (store && (rec.store || '') !== store) continue
    const copy = { ...rec }
    normalizeVerbalCert(copy)
    copy.certified = copy.certified ?? copy.verbalCert?.completed
    out.push({ id, ...copy })
  }
  out.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  return out
}

export function useTrainingData() {
  const [trainingData, setTrainingData] = useState(loadFromStorage)
  const [trainingDataLoading, setTrainingDataLoading] = useState(true)
  const [trainingDataFetchedAt, setTrainingDataFetchedAt] = useState(() => {
    try { return localStorage.getItem(TRAINING_DATA_FETCHED_AT_KEY) || null } catch (_) { return null }
  })
  const [saveError, setSaveError] = useState(null)

  // Tracks the state at last Firestore write — used by saveTrainingData diff logic
  const lastSavedRef = useRef(null)

  const reload = useCallback(() => {
    setTrainingData(loadFromStorage())
  }, [])

  const refreshFromFirestore = useCallback(async () => {
    await ensureTrainingDataFromFirestore()
    setTrainingData(loadFromStorage())
  }, [])

  useEffect(() => {
    if (!db) {
      console.log('[TrainingData] db not ready, skipping listener setup')
      setTrainingDataLoading(false)
      return
    }
    console.log('[TrainingData] Setting up onSnapshot listener...')
    const ref = collection(db, 'trainees')
    const unsub = onSnapshot(ref, async (snap) => {
      const remote = {}
      snap.docs.forEach((d) => {
        remote[d.id] = d.data()
      })
      console.log('[TrainingData] Loaded from Firestore:', Object.keys(remote).slice(0, 10), `(${Object.keys(remote).length} total)`)

      const now = new Date().toISOString()
      cacheLocally(remote)
      try { localStorage.setItem(TRAINING_DATA_FETCHED_AT_KEY, now) } catch (_) {}
      setTrainingDataFetchedAt(now)
      setTrainingData(remote)
      lastSavedRef.current = remote
      setTrainingDataLoading(false)
    }, (err) => {
      console.error('[TrainingData] onSnapshot ERROR:', err?.code, err?.message)
      console.log('[TrainingData] Falling back to one-time fetch...')
      ensureTrainingDataFromFirestore().then(() => {
        const data = loadFromStorage()
        console.log('[TrainingData] Fallback loaded:', Object.keys(data).length, 'documents')
        setTrainingData(data)
        setTrainingDataLoading(false)
      }).catch(e => {
        console.error('[TrainingData] Fallback also failed:', e?.message)
        setTrainingDataLoading(false)
      })
    })
    return () => unsub()
  }, [])

  // Write only changed/added/deleted entries compared to last saved state
  const saveTrainingData = useCallback(async (data) => {
    const payload = data || trainingData
    cacheLocally(payload)
    setTrainingData(payload)
    if (!db) return

    const prev = lastSavedRef.current || trainingData
    const ops = []

    for (const [id, rec] of Object.entries(payload)) {
      if (!rec) continue
      if (JSON.stringify(prev[id]) !== JSON.stringify(rec)) {
        ops.push({ type: 'set', id, data: rec })
      }
    }
    for (const id of Object.keys(prev)) {
      if (!payload[id]) ops.push({ type: 'delete', id })
    }

    if (ops.length === 0) return

    try {
      if (ops.length === 1 && ops[0].type === 'delete') {
        await deleteDoc(doc(db, 'trainees', ops[0].id))
      } else if (ops.length === 1) {
        await setDoc(doc(db, 'trainees', ops[0].id), ops[0].data, { merge: true })
      } else {
        // Batch writes (up to 500 — well within trainee count)
        const batch = writeBatch(db)
        for (const op of ops) {
          if (op.type === 'delete') {
            batch.delete(doc(db, 'trainees', op.id))
          } else {
            batch.set(doc(db, 'trainees', op.id), op.data, { merge: true })
          }
        }
        await batch.commit()
      }
      lastSavedRef.current = payload
      setSaveError(null)
    } catch (e) {
      console.error('[TrainingData] Firestore save FAILED:', e?.message, e?.code, e)
      setSaveError("Changes couldn't be saved — please log out and back in.")
    }
  }, [trainingData])

  const archiveTrainee = useCallback(async (id) => {
    const prev = trainingData
    const next = { ...trainingData }
    if (!next[id]) return
    next[id] = { ...next[id], archived: true }
    setTrainingData(next)
    try {
      await saveTrainingData(next)
    } catch (e) {
      console.error('[TrainingData] Archive failed, rolling back:', e?.message)
      setTrainingData(prev)
    }
  }, [trainingData, saveTrainingData])

  const terminateTrainee = useCallback(async (id, reason, note, snapshot, byEmpNum) => {
    const prev = trainingData
    const next = { ...trainingData }
    if (!next[id]) return
    next[id] = {
      ...next[id],
      archived: true,
      terminated: true,
      terminatedAt: new Date().toISOString(),
      terminatedBy: byEmpNum || '',
      terminationReason: reason || '',
      terminationNote: note || '',
      terminationSnapshot: snapshot || {},
    }
    setTrainingData(next)
    try {
      await saveTrainingData(next)
    } catch (e) {
      console.error('[TrainingData] Terminate failed, rolling back:', e?.message)
      setTrainingData(prev)
    }
  }, [trainingData, saveTrainingData])

  const restoreTrainee = useCallback((id) => {
    const next = { ...trainingData }
    if (next[id]) {
      const { terminated, terminatedAt, terminatedBy, terminationReason, terminationNote, terminationSnapshot, ...rest } = next[id]
      next[id] = { ...rest, archived: false }
    }
    setTrainingData(next)
    saveTrainingData(next)
  }, [trainingData, saveTrainingData])

  const deleteTrainee = useCallback((id) => {
    const next = { ...trainingData }
    delete next[id]
    setTrainingData(next)
    saveTrainingData(next)
  }, [trainingData, saveTrainingData])

  const addTrainee = useCallback((employeeNumber, name, store) => {
    const emp = String(employeeNumber || '').trim()
    const id = `T-${store || 'Westfield'}-${emp}`
    if (!emp) return null
    const next = { ...trainingData }
    if (next[id]) return id
    next[id] = {
      id,
      employeeNumber: emp,
      name: (name || '').trim() || `Trainee ${emp}`,
      store: store || 'Westfield',
      schedule: {},
      archived: false,
    }
    setTrainingData(next)
    saveTrainingData(next)
    return id
  }, [trainingData, saveTrainingData])

  const addTraineeNote = useCallback((traineeId, text, byEmpNum) => {
    const rec = trainingData[traineeId]
    if (!rec || !(text || '').trim()) return
    const next = { ...trainingData }
    const notes = Array.isArray(next[traineeId].notes) ? [...next[traineeId].notes] : []
    notes.push({ text: (text || '').trim(), at: new Date().toISOString(), by: byEmpNum ?? '' })
    next[traineeId] = { ...next[traineeId], notes }
    setTrainingData(next)
    saveTrainingData(next)
  }, [trainingData, saveTrainingData])

  const updateTrainee = useCallback((oldId, { name, employeeNumber, store: newStore, archiveExempt }) => {
    const rec = trainingData[oldId]
    if (!rec) return null
    const emp = String(employeeNumber ?? rec.employeeNumber ?? '').trim()
    const store = newStore ?? rec.store ?? 'Westfield'
    // archiveExempt only changes when explicitly passed as a boolean (manager toggle in EditTraineeModal)
    const exemptPatch = typeof archiveExempt === 'boolean' ? { archiveExempt } : {}
    const newId = `T-${store}-${emp}`
    const next = { ...trainingData }
    if (newId !== oldId) {
      if (next[newId]) return null
      next[newId] = { ...rec, id: newId, employeeNumber: emp, name: (name ?? rec.name ?? '').trim() || `Trainee ${emp}`, store, ...exemptPatch }
      delete next[oldId]
    } else {
      next[oldId] = { ...rec, name: (name ?? rec.name ?? '').trim() || rec.name, employeeNumber: emp, store, ...exemptPatch }
    }
    setTrainingData(next)
    saveTrainingData(next)
    return newId
  }, [trainingData, saveTrainingData])

  /** Clear schedule, checklists, and localStorage test attempts for this trainee; save. */
  const restartTraineeTraining = useCallback((id) => {
    const rec = trainingData[id]
    if (!rec) return
    const next = { ...trainingData }
    next[id] = { ...next[id], schedule: {}, checklists: {} }
    setTrainingData(next)
    saveTrainingData(next)
    try {
      const raw = localStorage.getItem('testAttempts') || '{}'
      const attempts = JSON.parse(raw) || {}
      let changed = false
      for (const key of Object.keys(attempts)) {
        if (key.startsWith(id + '_')) {
          delete attempts[key]
          changed = true
        }
      }
      if (changed) localStorage.setItem('testAttempts', JSON.stringify(attempts))
    } catch (_) {}
  }, [trainingData, saveTrainingData])

  return {
    trainingData,
    setTrainingData,
    trainingDataLoading,
    trainingDataFetchedAt,
    reload,
    refreshFromFirestore,
    saveTrainingData,
    saveError,
    clearSaveError: () => setSaveError(null),
    listTrainees: (opts) => listTrainees(trainingData, opts),
    archiveTrainee,
    terminateTrainee,
    restoreTrainee,
    restartTraineeTraining,
    deleteTrainee,
    addTrainee,
    updateTrainee,
    addTraineeNote,
  }
}
