import { useState } from 'react'
import { app } from '../firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { authFetch } from '../utils/authFetch'
import { syncEmployeesToFirestore } from '../services/toast'
import { syncTrainersFromToast, syncTrainerSchedules, syncManagersFromToast } from '../services/ToastSyncService'
import { getStoreDisplayName } from '../constants'

export function useManagerToastSync({ store, getRestaurantGuid, storeNames, loadTrainersFromFirestoreForStore, staffAccounts, saveStaffAccounts, reloadStaffAccounts, isAdminOrOwner }) {
  const [toastSyncLoading, setToastSyncLoading] = useState(false)
  const [toastSyncMessage, setToastSyncMessage] = useState(null)
  const [toastShiftsLoading, setToastShiftsLoading] = useState(false)
  const [toastShiftsResult, setToastShiftsResult] = useState(null)
  const [toastTrainersSchedulesLoading, setToastTrainersSchedulesLoading] = useState(false)
  const [allSchedulesData, setAllSchedulesData] = useState(null)
  const [allSchedulesLoading, setAllSchedulesLoading] = useState(false)
  const [allSchedulesError, setAllSchedulesError] = useState(null)

  async function handleSyncFromToast() {
    const restaurantGuid = getRestaurantGuid(store)
    if (!restaurantGuid) {
      setToastSyncMessage({ error: `No Toast GUID configured for ${store}.` })
      return
    }
    setToastSyncLoading(true)
    setToastSyncMessage({ text: 'Syncing employees from Toast…', loading: true })
    try {
      const result = await syncEmployeesToFirestore(restaurantGuid)
      setToastSyncMessage({
        success: true,
        text: `Synced: ${result.created ?? 0} created, ${result.updated ?? 0} updated, ${result.skipped ?? 0} skipped.`,
      })
    } catch (err) {
      setToastSyncMessage({ error: err.message || 'Sync failed' })
    } finally {
      setToastSyncLoading(false)
    }
  }

  async function handleSyncTrainersAndSchedules() {
    const restaurantGuid = getRestaurantGuid(store)
    if (!restaurantGuid) {
      setToastSyncMessage({ error: `No Toast GUID configured for ${store}.` })
      return
    }
    setToastTrainersSchedulesLoading(true)
    setToastSyncMessage({ text: 'Syncing trainers & schedules from Toast…', loading: true })
    try {
      setToastSyncMessage({ text: 'Authenticating with Toast…', loading: true })
      const trainerResult = await syncTrainersFromToast(restaurantGuid, store)
      setToastSyncMessage({ text: `Found ${trainerResult.count} Trainer${trainerResult.count !== 1 ? 's' : ''}… syncing schedules…`, loading: true })
      const scheduleResult = await syncTrainerSchedules(restaurantGuid, store)
      setToastSyncMessage({ text: `Downloaded 3 weeks of schedules (${scheduleResult.shiftCount} shifts)… finishing up…`, loading: true })
      setToastSyncMessage({
        text: `✅ Sync complete. Dashboard updated. (${trainerResult.count} trainers, ${scheduleResult.shiftCount} shifts)`,
      })
      await loadTrainersFromFirestoreForStore(store)
    } catch (err) {
      const msg = err?.message || 'Sync failed'
      const stack = err?.stack ? String(err.stack).slice(0, 500) : ''
      if (typeof console !== 'undefined' && console.error) console.error('[Sync trainers]', msg, err?.stack)
      setToastSyncMessage({ error: stack ? `${msg}\n\n${stack}` : msg })
    } finally {
      setToastTrainersSchedulesLoading(false)
    }
  }

  async function handleSyncSchedulesOnly() {
    setToastTrainersSchedulesLoading(true)
    setToastSyncMessage({ text: 'Syncing schedules from Toast…', loading: true })
    try {
      const functions = getFunctions(app)
      const syncSchedulesFn = httpsCallable(functions, 'syncTrainerSchedules')
      const result = await syncSchedulesFn()
      const data = result?.data || {}
      await loadTrainersFromFirestoreForStore(store)
      const matched = data.matchedTrainers || []
      const unmatched = data.totalUnmatched || 0
      let message = ''
      if (matched.length > 0) {
        message = '✅ Synced schedules for:\n' + matched.map(m =>
          '• ' + m.name + ' (' + getStoreDisplayName(m.store) + ', ' + m.shifts + ' shifts)'
        ).join('\n')
        if (unmatched > 0) {
          message += '\n\n⚠️ ' + unmatched + ' Toast employees could not be matched to trainers'
        }
      } else {
        message = '⚠️ No schedules matched. Toast returned shifts but none matched trainers in the system.'
      }
      setToastSyncMessage({ text: message })
    } catch (err) {
      setToastSyncMessage({ error: err?.message || 'Sync failed' })
      throw err
    } finally {
      setToastTrainersSchedulesLoading(false)
    }
  }

  async function loadAllSchedules() {
    setAllSchedulesLoading(true)
    setAllSchedulesError(null)
    try {
      const url = 'https://us-central1-chartrain-20901.cloudfunctions.net/allSchedules'
      const res = await authFetch(url)
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load schedules')
      setAllSchedulesData(data)
    } catch (err) {
      setAllSchedulesError(err?.message || 'Failed to load schedules')
      setAllSchedulesData(null)
    } finally {
      setAllSchedulesLoading(false)
    }
  }

  async function handleSyncManagers() {
    setToastSyncLoading(true)
    setToastSyncMessage({ text: 'Syncing managers from Toast…', loading: true })
    try {
      let merged = { ...(staffAccounts || {}) }
      let totalCount = 0
      let totalCreated = 0
      let totalUpdated = 0
      const storeResults = []
      const allCreatedNames = []
      const syncStores = isAdminOrOwner ? storeNames : [store]

      for (const storeName of syncStores) {
        const guid = getRestaurantGuid(storeName)
        if (!guid) continue
        const result = await syncManagersFromToast(guid, storeName, merged)
        merged = result.staffAccounts
        totalCount += result.count
        totalCreated += result.created
        totalUpdated += result.updated
        if (result.createdNames?.length) allCreatedNames.push(...result.createdNames)
        if (result.count > 0) storeResults.push(`${storeName}: ${result.count}`)
      }

      await saveStaffAccounts(merged)
      reloadStaffAccounts()
      let msg = `Managers synced: ${totalCreated} new, ${totalUpdated} updated (${totalCount} found across ${storeResults.length} store${storeResults.length !== 1 ? 's' : ''}).`
      if (allCreatedNames.length) msg += `\nAdded: ${allCreatedNames.join(', ')}`
      setToastSyncMessage({ text: msg })
    } catch (err) {
      setToastSyncMessage({ error: err?.message || 'Manager sync failed' })
    } finally {
      setToastSyncLoading(false)
    }
  }

  async function handleSyncTrainersOnly() {
    const restaurantGuid = getRestaurantGuid(store)
    if (!restaurantGuid) {
      setToastSyncMessage({ error: `No Toast GUID configured for ${store}.` })
      throw new Error(`No Toast GUID for ${store}.`)
    }
    setToastTrainersSchedulesLoading(true)
    setToastSyncMessage({ text: 'Syncing trainers from Toast…', loading: true })
    try {
      const trainerResult = await syncTrainersFromToast(restaurantGuid, store)
      await loadTrainersFromFirestoreForStore(store)
      setToastSyncMessage({
        text: `✅ Trainers synced. (${trainerResult.count} trainers)`,
      })
    } catch (err) {
      setToastSyncMessage({ error: err?.message || 'Sync failed' })
      throw err
    } finally {
      setToastTrainersSchedulesLoading(false)
    }
  }

  return {
    toastSyncLoading, toastSyncMessage, setToastSyncMessage,
    toastShiftsLoading, setToastShiftsLoading,
    toastShiftsResult, setToastShiftsResult,
    toastTrainersSchedulesLoading,
    allSchedulesData, allSchedulesLoading, allSchedulesError,
    handleSyncFromToast,
    handleSyncTrainersAndSchedules,
    handleSyncSchedulesOnly,
    handleSyncTrainersOnly,
    handleSyncManagers,
    loadAllSchedules,
  }
}
