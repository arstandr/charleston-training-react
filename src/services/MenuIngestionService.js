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
 * Consolidate size variants into single items.
 * "16oz MODELO ESPECIAL" + "20oz MODELO ESPECIAL" → "MODELO ESPECIAL (16oz, 20oz)"
 * "6oz J LOHR CHARDONNAY" + "9oz J LOHR CHARDONNAY" + "BTL J LOHR CHARDONNAY" → "J LOHR CHARDONNAY (6oz, 9oz, Bottle)"
 */
export function consolidateSizeVariants(items) {
  const SIZE_PREFIX = /^(?:(\d+(?:\.\d+)?)\s*oz|BTL|BOTTLE|PINT|QT|QUART|HALF|TALL|SHORT|GRANDE|SM|MED|LG|SMALL|MEDIUM|LARGE)\s+/i
  const SIZE_SUFFIX = /\s+(?:(\d+(?:\.\d+)?)\s*oz|BTL|BOTTLE|PINT|QT|QUART|HALF|TALL|SHORT|GRANDE|SM|MED|LG|SMALL|MEDIUM|LARGE)$/i

  const groups = new Map()

  for (const item of items) {
    const name = (item.name || '').trim()
    let baseName = name
    let size = null

    const prefixMatch = name.match(SIZE_PREFIX)
    if (prefixMatch) {
      size = prefixMatch[0].trim()
      baseName = name.replace(SIZE_PREFIX, '').trim()
    } else {
      const suffixMatch = name.match(SIZE_SUFFIX)
      if (suffixMatch) {
        size = suffixMatch[0].trim()
        baseName = name.replace(SIZE_SUFFIX, '').trim()
      }
    }

    const key = baseName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()

    if (!groups.has(key)) {
      groups.set(key, { baseName, items: [], sizes: [], bestItem: null })
    }

    const group = groups.get(key)
    group.items.push(item)
    if (size) {
      let sizeLabel = size.replace(/^BTL$/i, 'Bottle').replace(/^PINT$/i, 'Pint').replace(/^QT$/i, 'Quart')
      group.sizes.push(sizeLabel)
    }

    if (!group.bestItem
      || (item.description && !group.bestItem.description)
      || (item.imageUrl && !group.bestItem.imageUrl)) {
      group.bestItem = item
    }
  }

  const consolidated = []
  for (const [, group] of groups) {
    if (group.items.length === 1) {
      consolidated.push(group.items[0])
    } else if (group.sizes.length > 0) {
      const sizeList = [...new Set(group.sizes)].sort((a, b) => {
        const na = parseFloat(a)
        const nb = parseFloat(b)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return a.localeCompare(b)
      }).join(', ')

      const representative = { ...group.bestItem }
      representative.name = group.baseName
      representative.description = (representative.description || '') +
        (representative.description ? '\n' : '') +
        'Available in: ' + sizeList
      const images = group.items.map((i) => i.imageUrl).filter(Boolean)
      if (images.length > 0) representative.imageUrl = images[0]
      representative._consolidatedFrom = group.items.map((i) => ({
        name: i.name,
        guid: i.guid,
        imageUrl: i.imageUrl,
      }))
      representative._variantIds = group.items.map((i) => i.id).filter(Boolean)
      representative._sizeLabel = `Available in: ${sizeList}`

      consolidated.push(representative)
    } else {
      consolidated.push(...group.items)
    }
  }

  return consolidated
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

    const normIncoming = normalize(name)
    if (incomingList.indexOf(incoming) === 0) {
      const dbNames = dbList.slice(0, 5).map((db) => ({
        raw: db?.name ?? db?.front,
        normalized: normalize(db?.name ?? db?.front ?? ''),
        matchesIncoming: normalize(db?.name ?? db?.front ?? '') === normIncoming,
      }))
    }

    let matched = false
    let matchedDb = null
    let matchType = null

    // Stage 1: Exact & ID match
    const incomingGuid = incoming?.guid ?? incoming?.id
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
          source: matchedDb?.source,
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
          source: matchedDb?.source,
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
export function buildDatabaseSummary(databaseItems, maxItems = 500) {
  const list = (databaseItems || []).slice(0, maxItems).map((i) => i?.name ?? i?.front ?? '').filter(Boolean)
  return list.join('\n')
}

/**
 * Call Gemini to identify which pending items are semantic duplicates of database items.
 * Processes in batches to avoid token limit issues.
 * Returns { duplicatePairs: [{ pendingIndex, databaseId, databaseName, pendingItem, databaseItem }], error?: string }.
 */
export async function runAiSemanticScan(pendingItems, databaseItems, callGemini) {
  if (!callGemini || !pendingItems?.length) return { duplicatePairs: [] }

  const dbSummary = buildDatabaseSummary(databaseItems, 500)
  const dbByName = new Map((databaseItems || []).map((d) => [(d?.name ?? d?.front ?? '').trim().toLowerCase(), d]))
  const allDuplicatePairs = []
  const BATCH_SIZE = 50

  for (let batchStart = 0; batchStart < pendingItems.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, pendingItems.length)
    const batch = pendingItems.slice(batchStart, batchEnd)
    const pendingList = batch.map((i, idx) => `${batchStart + idx}: ${(i?.name ?? '').trim()}`).join('\n')

    const prompt = `You are a menu deduplication assistant. Below are two lists.

DATABASE LIST (existing menu items):
${dbSummary}

PENDING LIST (new items from Toast, format "index: name"):
${pendingList}

Identify items in the PENDING LIST that refer to the SAME food or drink as an item in the DATABASE LIST, even if named differently (e.g. "Filet" vs "Center Cut Filet", "House Salad" vs "House Sal").
Reply ONLY with a JSON array, no markdown fences, no other text. Each element: { "pendingIndex": number, "databaseName": "exact name from Database list" }
Example: [{"pendingIndex":0,"databaseName":"Hand-cut Filet"},{"pendingIndex":2,"databaseName":"House Salad"}]
If no duplicates, reply: []`

    try {
      const response = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 4096, temperature: 0.2 })
      const rawText = (typeof response === 'string' ? response : response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()

      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

      const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        console.warn('⚠️ Could not parse JSON from AI response for batch', batchStart)
        continue
      }

      let arr
      try {
        arr = JSON.parse(jsonMatch[0])
      } catch (parseErr) {
        console.warn('⚠️ JSON parse failed for AI batch', batchStart, parseErr.message)
        continue
      }

      for (const row of arr) {
        const idx = row?.pendingIndex
        const dbName = row?.databaseName
        if (typeof idx !== 'number' || idx < 0 || idx >= pendingItems.length || !dbName) continue
        const db = dbByName.get(dbName.trim().toLowerCase()) || (databaseItems || []).find((d) => (d?.name ?? d?.front) === dbName)
        if (db) {
          allDuplicatePairs.push({
            pendingIndex: idx,
            databaseId: db.id,
            databaseName: db.name ?? db.front,
            pendingItem: pendingItems[idx],
            databaseItem: db,
          })
        } else {
          console.warn(`⚠️ AI matched pendingIndex ${idx} to "${dbName}" but could not find in database`)
        }
      }
    } catch (e) {
      console.error('AI batch error:', e?.message)
    }
  }

  return { duplicatePairs: allDuplicatePairs }
}
