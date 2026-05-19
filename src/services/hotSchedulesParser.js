/**
 * HotSchedules "Extended Schedule Report" PDF parser.
 *
 * Parses the browser-printed PDF from HotSchedules which has:
 * - Full date headers: "Monday, February 23, 2026"
 * - Employee names in "First Last" format (may span 2 lines)
 * - AM/PM sub-rows with shift start times
 * - [Shift Released] prefixes on some times
 */

// ---------------------------------------------------------------------------
// PDF text extraction (position-aware)
// ---------------------------------------------------------------------------

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

async function extractTextWithPositions(file) {
  const arrayBuffer = await readFileAsArrayBuffer(file)
  const pdfjsLib = await import('pdfjs-dist')

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
  }

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const items = content.items
      .filter((item) => item.str && item.str.trim())
      .map((item) => ({
        str: item.str,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
        width: item.width,
        height: item.height,
        fontSize: Math.abs(item.transform[0]) || 12,
      }))
    pages.push({ pageIndex: i, items })
  }

  return pages
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Parse "February 23, 2026" → "2026-02-23" */
function parseFullDate(text) {
  const m = text.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i,
  )
  if (!m) return null
  const month = MONTH_NAMES[m[1].toLowerCase()]
  if (month === undefined) return null
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(parseInt(m[2])).padStart(2, '0')}`
}

/** Parse "4:45 PM" or "[Shift Released]10:45 AM" into "HH:MM" 24-hour. */
function parseTime(raw) {
  if (!raw) return null
  const cleaned = raw.replace(/\[.*?\]/g, '').trim()
  const m = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!m) return null
  let hours = parseInt(m[1], 10)
  const minutes = m[2]
  const ampm = m[3].toUpperCase()
  if (ampm === 'PM' && hours !== 12) hours += 12
  if (ampm === 'AM' && hours === 12) hours = 0
  return `${String(hours).padStart(2, '0')}:${minutes}`
}

/** Estimate shift end time — default 6 hours after start. */
function estimateEndTime(startTime24) {
  if (!startTime24) return null
  const [h, m] = startTime24.split(':').map(Number)
  let endH = h + 6
  if (endH >= 24) endH -= 24
  return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Group items by approximate y-coordinate (within tolerance). Top-to-bottom. */
function groupByRow(items, tolerance = 4) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows = []
  let currentRow = null
  let currentY = null

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) > tolerance) {
      currentRow = []
      rows.push(currentRow)
      currentY = item.y
    }
    currentRow.push(item)
  }

  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
  }

  return rows
}

/** Check if text is report metadata (not employee data). */
function isMetaText(str) {
  const t = str.trim()
  return (
    /^Report\s+Window$/i.test(t) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(t) ||
    /^Page\s+\d/i.test(t) ||
    /^\d+\s+of\s+\d+$/i.test(t) ||
    /^Generated/i.test(t) ||
    /^Extended\s+Schedule/i.test(t) ||
    /^Front\s+of\s+House/i.test(t) ||
    /^\[Status/i.test(t) ||
    /^Posted\]?$/i.test(t) ||
    /^Close$/i.test(t) ||
    /^https?:/i.test(t) ||
    /^Support\s+and/i.test(t) ||
    /^Charleston/i.test(t) ||
    /^Monday,?$/i.test(t) || /^Tuesday,?$/i.test(t) || /^Wednesday,?$/i.test(t) ||
    /^Thursday,?$/i.test(t) || /^Friday,?$/i.test(t) || /^Saturday,?$/i.test(t) || /^Sunday,?$/i.test(t) ||
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(t) ||
    /^\d{4}$/i.test(t) ||
    /^Back\s+of\s+House$/i.test(t)
  )
}

// ---------------------------------------------------------------------------
// Phase 1: Find the week dates from the date range header
// ---------------------------------------------------------------------------

function findWeekDates(pages) {
  if (!pages.length) return []

  // Look for "Monday, February 23, 2026 - Sunday, March 1, 2026" pattern
  const rows = groupByRow(pages[0].items, 5)
  for (const row of rows) {
    const text = row.map((it) => it.str).join(' ')
    const m = text.match(
      /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4})\s*[-–]\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4})/i,
    )
    if (m) {
      const start = parseFullDate(m[1])
      const end = parseFullDate(m[2])
      if (start && end) {
        const dates = []
        const curr = new Date(start + 'T12:00:00')
        const endD = new Date(end + 'T12:00:00')
        while (curr <= endD && dates.length < 14) {
          dates.push(curr.toISOString().slice(0, 10))
          curr.setDate(curr.getDate() + 1)
        }
        if (dates.length >= 5) return dates
      }
    }
  }

  return []
}

// ---------------------------------------------------------------------------
// Phase 2: Detect grid layout (column x-positions, AM/PM column)
// ---------------------------------------------------------------------------

function detectLayout(pages) {
  if (!pages.length) return null

  // Find day column x-positions from weekday name items on page 1
  const weekdayItems = []
  for (const item of pages[0].items) {
    const t = item.str.trim()
    const match = WEEKDAY_NAMES.find((d) => t.startsWith(d))
    if (match) {
      weekdayItems.push({ dayName: match, x: item.x, y: item.y })
    }
  }

  // Group by approximate y — the column headers should be 7 items at similar y
  const yGroups = []
  for (const item of weekdayItems) {
    let found = false
    for (const group of yGroups) {
      if (Math.abs(item.y - group[0].y) < 12) {
        group.push(item)
        found = true
        break
      }
    }
    if (!found) yGroups.push([item])
  }

  // Pick the y-group with the most weekday items (should be 7 for column headers)
  let headerGroup = []
  for (const group of yGroups) {
    if (group.length > headerGroup.length) headerGroup = group
  }

  headerGroup.sort((a, b) => a.x - b.x)
  const dayColumnXs = headerGroup.map((it) => it.x)
  console.log('[HotSchedules] Day column x-positions:', dayColumnXs, 'from', headerGroup.map((it) => it.dayName))

  // Find AM/PM label column x-position
  // Standalone "AM"/"PM" items that are LEFT of the first day column
  const allItems = pages.flatMap((p) => p.items)
  const firstColX = dayColumnXs[0] || 9999
  const ampmCandidates = allItems.filter(
    (it) => /^(AM|PM)$/i.test(it.str.trim()) && it.x < firstColX - 10,
  )

  // Cluster their x-positions and pick the most common
  const xBuckets = new Map()
  for (const item of ampmCandidates) {
    const key = Math.round(item.x / 8) * 8
    xBuckets.set(key, (xBuckets.get(key) || 0) + 1)
  }

  let ampmX = 0
  let maxCount = 0
  for (const [x, count] of xBuckets) {
    if (count > maxCount) {
      maxCount = count
      ampmX = x
    }
  }
  console.log('[HotSchedules] AM/PM column x:', ampmX, `(${maxCount} items)`)

  if (!dayColumnXs.length || !ampmX) return null

  return { dayColumnXs, ampmX }
}

// ---------------------------------------------------------------------------
// Phase 3: Parse employee schedules
// ---------------------------------------------------------------------------

function parseEmployeeSchedules(pages, layout, weekDates) {
  const { dayColumnXs, ampmX } = layout
  const employees = []
  let currentName = ''
  let currentShifts = [] // array of { date, startTime, period }

  // Build column boundaries (midpoints between adjacent columns)
  const colBounds = []
  for (let i = 0; i < dayColumnXs.length; i++) {
    const left = i > 0
      ? Math.round((dayColumnXs[i - 1] + dayColumnXs[i]) / 2)
      : ampmX + 10
    const right = i < dayColumnXs.length - 1
      ? Math.round((dayColumnXs[i] + dayColumnXs[i + 1]) / 2)
      : dayColumnXs[i] + 100
    colBounds.push({ left, right, idx: i })
  }
  console.log('[HotSchedules] Column bounds:', colBounds.map((c) => `[${c.left}-${c.right}]`).join(' '))

  function getColIndex(x) {
    for (const { left, right, idx } of colBounds) {
      if (x >= left && x < right) return idx
    }
    return -1
  }

  for (const page of pages) {
    const rows = groupByRow(page.items, 3)

    for (const row of rows) {
      const nameTexts = []
      let hasAmLabel = false
      let hasPmLabel = false
      let rowPeriod = null // 'AM' or 'PM' from label

      // Items in the day-column area, grouped by column index
      const colItems = {} // colIdx -> [item strings]

      for (const item of row) {
        const str = item.str.trim()
        if (!str) continue

        // Standalone AM/PM label at the AM/PM column position
        if (/^(AM|PM)$/i.test(str) && Math.abs(item.x - ampmX) < 25) {
          if (/^AM$/i.test(str)) { hasAmLabel = true; rowPeriod = 'AM' }
          else { hasPmLabel = true; rowPeriod = 'PM' }
          continue
        }

        // Items in the day-column area (right of AM/PM column)
        if (item.x > ampmX + 5) {
          const ci = getColIndex(item.x)
          if (ci >= 0) {
            if (!colItems[ci]) colItems[ci] = []
            colItems[ci].push(str)
          }
          continue
        }

        // Name text — left of AM/PM column, has letters, not metadata
        if (item.x < ampmX - 5 && /[a-zA-Z]/.test(str) && !isMetaText(str)) {
          nameTexts.push(str)
        }
      }

      // AM label = start of a new employee
      if (hasAmLabel) {
        // Save previous employee
        if (currentName && currentShifts.length > 0) {
          employees.push({ name: currentName, shifts: currentShifts })
        }
        currentName = nameTexts.join(' ').trim()
        currentShifts = []
      } else if (hasPmLabel && nameTexts.length > 0) {
        // PM row with additional name text (multi-line name)
        currentName = (currentName + ' ' + nameTexts.join(' ')).trim()
      }

      // Extract times from each column (join items first to handle split text)
      for (const [ciStr, parts] of Object.entries(colItems)) {
        const ci = parseInt(ciStr, 10)
        if (ci < 0 || ci >= weekDates.length) continue

        // Join all items in this column cell
        const cellText = parts.join(' ')

        // Try to parse a time with AM/PM
        let time24 = parseTime(cellText)

        // Fallback: time without AM/PM — use the row's period label
        if (!time24 && rowPeriod) {
          const bare = cellText.replace(/\[.*?\]/g, '').trim()
          const m = bare.match(/(\d{1,2}):(\d{2})/)
          if (m) {
            let hours = parseInt(m[1], 10)
            const minutes = m[2]
            if (rowPeriod === 'PM' && hours < 12) hours += 12
            if (rowPeriod === 'AM' && hours === 12) hours = 0
            time24 = `${String(hours).padStart(2, '0')}:${minutes}`
          }
        }

        if (time24) {
          const date = weekDates[ci]
          const period = time24 < '12:00' ? 'AM' : 'PM'
          // Allow multiple shifts per day (double shifts) — only skip exact duplicates
          const isDuplicate = currentShifts.some((s) => s.date === date && s.startTime === time24)
          if (!isDuplicate) {
            currentShifts.push({ date, startTime: time24, period })
          }
        }
      }
    }
  }

  // Save last employee
  if (currentName && currentShifts.length > 0) {
    employees.push({ name: currentName, shifts: currentShifts })
  }

  // Deduplicate employees across pages (same name → merge shifts)
  const deduped = []
  const seen = new Map()
  for (const emp of employees) {
    const key = normalizeName(emp.name)
    if (seen.has(key)) {
      const existing = seen.get(key)
      for (const shift of emp.shifts) {
        if (!existing.shifts.find((s) => s.date === shift.date && s.startTime === shift.startTime)) {
          existing.shifts.push(shift)
        }
      }
    } else {
      seen.set(key, emp)
      deduped.push(emp)
    }
  }

  return deduped
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a HotSchedules Extended Schedule Report PDF.
 *
 * @param {File} file - The PDF file object
 * @returns {{ weekDates: string[], storeName: string, employees: ParsedEmployee[] }}
 */
export async function parseHotSchedulesPDF(file) {
  const pages = await extractTextWithPositions(file)
  if (!pages.length || !pages[0].items.length) {
    return { weekDates: [], storeName: '', employees: [] }
  }

  // Debug: dump raw text structure
  console.group('[HotSchedules] PDF extraction debug')
  for (const page of pages.slice(0, 2)) {
    console.group(`Page ${page.pageIndex} (${page.items.length} items)`)
    const rows = groupByRow(page.items)
    rows.slice(0, 30).forEach((row, ri) => {
      console.log(`Row ${ri}: ${row.map((it) => `"${it.str}"@(${it.x},${it.y})`).join('  ')}`)
    })
    if (rows.length > 30) console.log(`  ... ${rows.length - 30} more rows`)
    console.groupEnd()
  }
  console.groupEnd()

  // 1. Find week dates from date range header
  const weekDates = findWeekDates(pages)
  console.log('[HotSchedules] Week dates:', weekDates)
  if (!weekDates.length) {
    return { weekDates: [], storeName: '', employees: [] }
  }

  // 2. Find store name
  let storeName = ''
  for (const item of pages[0].items) {
    if (/Charleston/i.test(item.str)) {
      storeName = item.str.trim()
      break
    }
  }

  // 3. Detect grid layout
  const layout = detectLayout(pages)
  if (!layout) {
    console.warn('[HotSchedules] Could not detect grid layout')
    return { weekDates, storeName, employees: [] }
  }

  // 4. Parse employee schedules
  const employees = parseEmployeeSchedules(pages, layout, weekDates)
  console.log('[HotSchedules] Parsed', employees.length, 'employees with shifts')

  return { weekDates, storeName, employees }
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s,]/g, '')
    .replace(/\s+/g, ' ')
}

function lastFirstToFirstLast(name) {
  const parts = name.split(',').map((p) => p.trim())
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`
  return name
}

/**
 * Match parsed employees to Firestore trainer documents by name.
 */
export function matchEmployeesToTrainers(employees, trainers) {
  const matched = []
  const unmatched = []

  const trainersByNormalized = new Map()
  const trainersByLast = new Map()
  for (const trainer of trainers) {
    const norm = normalizeName(trainer.name)
    trainersByNormalized.set(norm, trainer)

    const parts = norm.split(/\s+/)
    if (parts.length >= 2) {
      const lastName = parts[parts.length - 1]
      if (!trainersByLast.has(lastName)) trainersByLast.set(lastName, [])
      trainersByLast.get(lastName).push(trainer)
    }
  }

  for (const employee of employees) {
    const empNorm = normalizeName(employee.name)
    const empFlipped = normalizeName(lastFirstToFirstLast(employee.name))

    // Exact match (handles both "First Last" and "Last, First")
    let trainer = trainersByNormalized.get(empNorm) || trainersByNormalized.get(empFlipped)

    // Partial match: same last name + first name prefix match
    if (!trainer) {
      const empParts = empNorm.split(/\s+/)
      if (empParts.length >= 2) {
        const empFirst = empParts[0]
        const empLast = empParts[empParts.length - 1]
        const candidates = trainersByLast.get(empLast) || []
        for (const c of candidates) {
          const cNorm = normalizeName(c.name)
          const cParts = cNorm.split(/\s+/)
          const cFirst = cParts[0]
          if (cFirst.startsWith(empFirst) || empFirst.startsWith(cFirst)) {
            trainer = c
            break
          }
        }
      }
    }

    if (trainer) {
      matched.push({ employee, trainer, shifts: employee.shifts })
    } else {
      unmatched.push({ employee })
    }
  }

  return { matched, unmatched }
}

// ---------------------------------------------------------------------------
// Schedule array builder
// ---------------------------------------------------------------------------

/**
 * Build a Firestore-ready schedule array from parsed shifts.
 * Format matches the existing Toast sync format used by ScheduleEditor.
 */
export function buildScheduleArray(shifts) {
  return shifts
    .filter((s) => s && s.date && s.startTime)
    .map((s) => {
      const endTime = estimateEndTime(s.startTime)
      return {
        date: s.date,
        inDate: `${s.date}T${s.startTime}:00`,
        outDate: endTime ? `${s.date}T${endTime}:00` : null,
        startTime: `${s.date}T${s.startTime}:00`,
        endTime: endTime ? `${s.date}T${endTime}:00` : null,
        jobName: 'HotSchedules Import',
        source: 'hotschedules',
      }
    })
}
