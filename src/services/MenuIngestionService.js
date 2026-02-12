/**
 * Smart Menu Ingestion Engine: 3-stage deduplication + Image Patch rule.
 * Processes raw Toast items and decides new vs duplicate against Menu Studio (database) items.
 */

const FUZZY_THRESHOLD = 0.85

/** Normalize for exact match: lowercase, remove punctuation, collapse spaces. */
export function normalize(name) {
  if (name == null || typeof name !== 'string') return ''
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Levenshtein distance (edit distance). */
function levenshtein(a, b) {
  if (!a.length) return b.length
  if (!b.length) return a.length
  const matrix = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[b.length][a.length]
}

/** Similarity 0..1 (1 = identical). Uses 1 - normalized Levenshtein distance. */
function similarity(s1, s2) {
  const a = normalize(s1)
  const b = normalize(s2)
  if (!a && !b) return 1
  if (!a || !b) return 0
  const maxLen = Math.max(a.length, b.length)
  const dist = levenshtein(a, b)
  return 1 - dist / maxLen
}

/** Image Patch: if incoming has imageUrl and existing doesn't, we should update existing. Returns update payload or null. */
function getImagePatch(incoming, existing) {
  const incomingUrl = incoming?.imageUrl ?? incoming?.image
  const existingUrl = existing?.imageUrl ?? existing?.image
  if (!incomingUrl || existingUrl) return null
  return { imageUrl: incomingUrl }
}

/**
 * Run the 3-stage pipeline. Does NOT run Stage 3 (AI) — caller can run that separately.
 * @param {Array} toastItems - Incoming items from Toast: { name, description?, category?, guid?, imageUrl? }
 * @param {Array} databaseItems - Existing Menu Studio items: { id, name, description?, category?, toastGuid?, imageUrl? }
 * @param {Function} onImagePatch - Optional (dbItem, incomingItem, patch) => void for logging/toast
 * @returns {{ newItems: Array, updatedItems: Array, duplicates: { exact: number, fuzzy: number } }}
 */
export function processIncomingItems(toastItems, databaseItems, onImagePatch) {
  const newItems = []
  const updatedItems = []
  const duplicates = { exact: 0, fuzzy: 0 }
  const dbList = Array.isArray(databaseItems) ? databaseItems : []
  const incomingList = Array.isArray(toastItems) ? toastItems : []

  for (const incoming of incomingList) {
    const name = incoming?.name ?? incoming?.front
    if (!name || !String(name).trim()) continue

    let matched = false
    let matchedDb = null
    let matchType = null

    // Stage 1: Exact & ID match
    const incomingGuid = incoming?.guid ?? incoming?.id
    const normIncoming = normalize(name)
    for (const db of dbList) {
      const dbGuid = db?.toastGuid ?? db?.guid
      if (incomingGuid && dbGuid && String(incomingGuid) === String(dbGuid)) {
        matched = true
        matchedDb = db
        matchType = 'exact'
        break
      }
      if (normIncoming && normalize(db?.name ?? db?.front ?? '') === normIncoming) {
        matched = true
        matchedDb = db
        matchType = 'exact'
        break
      }
    }

    if (matched && matchedDb) {
      if (matchType === 'exact') duplicates.exact++
      const patch = getImagePatch(incoming, matchedDb)
      if (patch) {
        updatedItems.push({
          id: matchedDb.id,
          name: matchedDb.name ?? matchedDb.front,
          patch,
          reason: 'image',
        })
        onImagePatch?.(matchedDb, incoming, patch)
      }
      continue
    }

    // Stage 2: Fuzzy match
    let bestScore = 0
    let bestDb = null
    for (const db of dbList) {
      const dbName = db?.name ?? db?.front ?? ''
      if (!dbName) continue
      const score = similarity(name, dbName)
      if (score > bestScore && score >= FUZZY_THRESHOLD) {
        bestScore = score
        bestDb = db
      }
    }
    if (bestDb) {
      matched = true
      matchedDb = bestDb
      matchType = 'fuzzy'
      duplicates.fuzzy++
      const patch = getImagePatch(incoming, matchedDb)
      if (patch) {
        updatedItems.push({
          id: matchedDb.id,
          name: matchedDb.name ?? matchedDb.front,
          patch,
          reason: 'image',
        })
        onImagePatch?.(matchedDb, incoming, patch)
      }
      continue
    }

    // No match: treat as new (goes to Pending)
    newItems.push({
      ...incoming,
      name: name.trim(),
      description: incoming?.description ?? incoming?.back ?? '',
      category: incoming?.category ?? 'Toast',
    })
  }

  return {
    newItems,
    updatedItems,
    duplicates,
  }
}

/**
 * Build a short summary of database items for AI (name only, truncated).
 */
export function buildDatabaseSummary(databaseItems, maxItems = 100) {
  const list = (databaseItems || []).slice(0, maxItems).map((i) => i?.name ?? i?.front ?? '').filter(Boolean)
  return list.join('\n')
}

/**
 * Call Gemini to identify which pending items are semantic duplicates of database items.
 * Returns { duplicatePairs: [{ pendingIndex, databaseId, databaseName }], error?: string }.
 */
export async function runAiSemanticScan(pendingItems, databaseItems, callGemini) {
  if (!callGemini || !pendingItems?.length) return { duplicatePairs: [] }
  const dbSummary = buildDatabaseSummary(databaseItems)
  const pendingList = pendingItems.map((i, idx) => `${idx}: ${(i?.name ?? '').trim()}`).join('\n')
  const prompt = `You are a menu deduplication assistant. Below are two lists.

DATABASE LIST (existing menu items):
${dbSummary}

PENDING LIST (new items from Toast, format "index: name"):
${pendingList}

Identify items in the PENDING LIST that refer to the SAME food or drink as an item in the DATABASE LIST, even if named differently (e.g. "Filet" vs "Center Cut Filet", "House Salad" vs "House Sal").
Reply with a JSON array only, no other text. Each element: { "pendingIndex": number, "databaseName": "exact name from Database list" }
Example: [{"pendingIndex":0,"databaseName":"Hand-cut Filet"},{"pendingIndex":2,"databaseName":"House Salad"}]
If no duplicates, reply: []`

  try {
    const response = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 1024, temperature: 0.2 })
    const text = (typeof response === 'string' ? response : response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const arr = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    const duplicatePairs = []
    const dbByName = new Map((databaseItems || []).map((d) => [(d?.name ?? d?.front ?? '').trim().toLowerCase(), d]))
    for (const row of arr) {
      const idx = row?.pendingIndex
      const dbName = row?.databaseName
      if (typeof idx !== 'number' || idx < 0 || idx >= pendingItems.length || !dbName) continue
      const db = dbByName.get(dbName.trim().toLowerCase()) || (databaseItems || []).find((d) => (d?.name ?? d?.front) === dbName)
      if (db) duplicatePairs.push({ pendingIndex: idx, databaseId: db.id, databaseName: db.name ?? db.front, pendingItem: pendingItems[idx], databaseItem: db })
    }
    return { duplicatePairs }
  } catch (e) {
    return { duplicatePairs: [], error: e?.message ?? 'AI scan failed' }
  }
}
