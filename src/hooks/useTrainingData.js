import { useState, useCallback, useEffect } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { ensureTrainingDataFromFirestore, saveToFirestore } from '../utils/firestore'
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

  const reload = useCallback(() => {
    setTrainingData(loadFromStorage())
  }, [])

  const refreshFromFirestore = useCallback(async () => {
    await ensureTrainingDataFromFirestore()
    setTrainingData(loadFromStorage())
  }, [])

  useEffect(() => {
    if (!db) {
      setTrainingDataLoading(false)
      return
    }
    const ref = doc(db, 'config', 'trainingData')
    const unsub = onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        setTrainingDataLoading(false)
        return
      }
      const { data: dataKey, ...rest } = snap.data()
      const remote = dataKey && typeof dataKey === 'object' ? dataKey : rest
      if (typeof remote !== 'object') {
        setTrainingDataLoading(false)
        return
      }
      const now = new Date().toISOString()
      try { localStorage.setItem(TRAINING_DATA_KEY, JSON.stringify(remote)) } catch (_) {}
      try { localStorage.setItem(TRAINING_DATA_FETCHED_AT_KEY, now) } catch (_) {}
      setTrainingDataFetchedAt(now)
      setTrainingDataLoading(false)
      const has7777 = Object.values(remote || {}).some((r) => r && String(r.employeeNumber || '').trim() === '7777')
      if (!has7777) {
        const data = { ...remote }
        const id = 'T-Westfield-7777'
        data[id] = {
          id,
          employeeNumber: '7777',
          name: 'Demo Trainee',
          store: 'Westfield',
          schedule: {},
          archived: false,
        }
        setTrainingData(data)
        try { localStorage.setItem(TRAINING_DATA_KEY, JSON.stringify(data)) } catch (_) {}
        try {
          await saveToFirestore('config', 'trainingData', { data, updatedAt: now })
        } catch (_) {}
      } else {
        setTrainingData(remote)
      }
    }, (err) => {
      console.warn('[TrainingData] onSnapshot error, falling back to one-time fetch:', err?.message)
      ensureTrainingDataFromFirestore().then(() => {
        setTrainingData(loadFromStorage())
        setTrainingDataLoading(false)
      })
    })
    return () => unsub()
  }, [])

  const saveTrainingData = useCallback(async (data) => {
    const payload = data || trainingData
    try {
      localStorage.setItem(TRAINING_DATA_KEY, JSON.stringify(payload))
    } catch (_) {}
    setTrainingData(payload)
    if (!db) return
    try {
      const toSave = JSON.parse(JSON.stringify({ data: payload, updatedAt: new Date().toISOString() }))
      await saveToFirestore('config', 'trainingData', toSave)
    } catch (e) {
      console.error('[TrainingData] Firestore save FAILED:', e?.message, e?.code, e)
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
    const entry = {
      id,
      employeeNumber: emp,
      empNum: emp,
      name: (name || '').trim() || `Trainee ${emp}`,
      store: store || 'Westfield',
      schedule: {},
      archived: false,
    }
    next[id] = entry
    setTrainingData(next)
    saveTrainingData(next)
    // Also write to trainees/{empNum} as an independent fallback so login always works
    // even if the config/trainingData write fails or is delayed
    if (db) {
      setDoc(doc(db, 'trainees', emp), {
        empNum: emp,
        employeeNumber: emp,
        name: entry.name,
        store: entry.store,
        archived: false,
        traineeId: id,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch((e) => console.warn('[TrainingData] trainees fallback write failed:', e?.message))
    }
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

  const updateTrainee = useCallback((oldId, { name, employeeNumber, store: newStore }) => {
    const rec = trainingData[oldId]
    if (!rec) return null
    const emp = String(employeeNumber ?? rec.employeeNumber ?? '').trim()
    const store = newStore ?? rec.store ?? 'Westfield'
    const newId = `T-${store}-${emp}`
    const next = { ...trainingData }
    if (newId !== oldId) {
      if (next[newId]) return null
      next[newId] = { ...rec, id: newId, employeeNumber: emp, name: (name ?? rec.name ?? '').trim() || `Trainee ${emp}`, store }
      delete next[oldId]
    } else {
      next[oldId] = { ...rec, name: (name ?? rec.name ?? '').trim() || rec.name, employeeNumber: emp, store }
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
