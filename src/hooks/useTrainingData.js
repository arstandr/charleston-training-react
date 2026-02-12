import { useState, useCallback, useEffect } from 'react'
import { db } from '../firebase'
import { ensureTrainingDataFromFirestore } from '../utils/firestore'
import { getFromFirestore, saveToFirestore } from '../utils/firestore'
import { normalizeVerbalCert } from '../utils/helpers'

const TRAINING_DATA_KEY = 'trainingData'

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

  const reload = useCallback(() => {
    setTrainingData(loadFromStorage())
  }, [])

  useEffect(() => {
    let cancelled = false
    ensureTrainingDataFromFirestore().then(() => {
      if (cancelled) return
      setTrainingDataLoading(false)
      let data = loadFromStorage()
      const has7777 = Object.values(data || {}).some((r) => r && String(r.employeeNumber || '').trim() === '7777')
      if (!has7777) {
        data = { ...data }
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
        try {
          localStorage.setItem(TRAINING_DATA_KEY, JSON.stringify(data))
        } catch (_) {}
        saveTrainingData(data)
      } else {
        setTrainingData(data)
      }
    })
    return () => { cancelled = true }
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
      console.warn('[TrainingData] Firestore save failed:', e?.message)
    }
  }, [trainingData])

  const archiveTrainee = useCallback(async (id) => {
    const next = { ...trainingData }
    if (!next[id]) return
    next[id] = { ...next[id], archived: true }
    setTrainingData(next)
    await saveTrainingData(next)
  }, [trainingData, saveTrainingData])

  const restoreTrainee = useCallback((id) => {
    const next = { ...trainingData }
    if (next[id]) next[id] = { ...next[id], archived: false }
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
    reload,
    saveTrainingData,
    listTrainees: (opts) => listTrainees(trainingData, opts),
    archiveTrainee,
    restoreTrainee,
    restartTraineeTraining,
    deleteTrainee,
    addTrainee,
    updateTrainee,
    addTraineeNote,
  }
}
