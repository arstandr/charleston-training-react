/**
 * Data import: parse CSV/JSON, optional AI mapping.
 * Export: serialize Firestore data for download.
 */

/**
 * Parse CSV text into array of objects (first row = headers).
 */
export function parseCSV(text) {
  const lines = (text || '').trim().split(/\r?\n/)
  if (lines.length === 0) return []
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
    const obj = {}
    headers.forEach((h, j) => { obj[h] = values[j] ?? '' })
    rows.push(obj)
  }
  return rows
}

/**
 * Parse JSON text. Returns array or object.
 */
export function parseJSON(text) {
  const t = (text || '').trim()
  if (!t) return null
  return JSON.parse(t)
}

/**
 * Read file as text.
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result ?? '')
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file, 'UTF-8')
  })
}

/**
 * Read file as ArrayBuffer.
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Extract text from a PDF file (client-side). Requires pdfjs-dist.
 */
export async function extractTextFromPDF(file) {
  const arrayBuffer = await readFileAsArrayBuffer(file)
  const pdfjsLib = await import('pdfjs-dist')
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages
  const parts = []
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item) => item.str).join(' ')
    parts.push(text)
  }
  return parts.join('\n\n')
}

/**
 * Extract text from a Word .docx file. Requires mammoth.
 */
export async function extractTextFromWord(file) {
  const arrayBuffer = await readFileAsArrayBuffer(file)
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value || ''
}

/**
 * Infer structure from file: if array of objects, return as-is; if object, wrap in [obj].
 */
export function normalizeToRows(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') return [parsed]
  return []
}
