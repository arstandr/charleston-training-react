export const STAFF_LOGINS = {}
// All staff accounts now flow from Toast → Firestore config/staffAccounts.
// Use the Manager Dashboard "Sync from Toast" button to refresh.
export const STORE_TO_TOAST_GUID = {
  Westfield: '86326c13-2905-455f-924a-a970ba974785',
  Castleton: 'b2965271-1d9f-4507-a427-0451c2e54cbf',
}
/** Display names for UI. Use throughout UI instead of internal keys. */
export const STORE_DISPLAY_NAMES = {
  Westfield: 'Westfield',
  Castleton: 'Castleton',
}
/** Reverse lookup: display name → internal key */
export const DISPLAY_NAME_TO_STORE = {
  Westfield: 'Westfield',
  Castleton: 'Castleton',
}
/** Helper: get display name for a store key, falls back to the key itself */
export function getStoreDisplayName(storeKey) {
  return STORE_DISPLAY_NAMES[storeKey] || storeKey
}
/** Store configurations: Toast GUID and Google Sheet URL (legacy). */
export const STORES = {
  Westfield: {
    guid: '86326c13-2905-455f-924a-a970ba974785',
    sheetUrl: 'https://script.google.com/macros/s/AKfycbwbzFjIIZZXvf0LI4NfVIF2ST9TCPONzx3STT19ppSkc8lGcTAEdsrjgnfRV9-tS4WS1Q/exec',
  },
  Castleton: {
    guid: 'b2965271-1d9f-4507-a427-0451c2e54cbf',
    sheetUrl: 'https://script.google.com/macros/s/AKfycbzMuL274SsxxfgqweLUWV-5zBCACPzSU6kTk8_2Pa9Ey8TCbNjhrZC6Z-tiHMebRNcV/exec',
  },
}
export const SHIFT_TYPES = [
  { key: 'host', label: 'Host shift (optional)', required: false },
  { key: 'follow', label: 'Follow shift', required: true },
  { key: 'rev1', label: '1st reverse', required: true },
  { key: 'rev2', label: '2nd reverse', required: true },
  { key: 'rev3', label: '3rd reverse', required: true },
  { key: 'rev4', label: '4th reverse (optional)', required: false },
  { key: 'foodrun', label: 'Food running shift', required: true },
  { key: 'cert', label: 'Certification', required: true },
]
export const STAFF_ACCOUNTS_KEY = 'staffAccounts_v1'
/** Required shift keys for certification (6 required; rev4 optional) */
export const REQUIRED_SHIFT_KEYS = ['follow', 'rev1', 'rev2', 'rev3', 'foodrun', 'cert']
/** The optional day-1 host shift. No trainer, no checklist, no test — completes on its own date. */
export const HOST_SHIFT_KEY = 'host'
/** Shifts the trainee works without a trainer assigned. */
export const NO_TRAINER_SHIFT_KEYS = [HOST_SHIFT_KEY, 'foodrun']
/** Whether a shift needs a trainer (or, for cert, a manager) assigned to it. */
export function shiftNeedsTrainer(shiftKey) {
  return !NO_TRAINER_SHIFT_KEYS.includes(shiftKey)
}
/** True when this trainee has a host shift on their plan. */
export function hasHostShift(rec) {
  return !!rec?.schedule?.[HOST_SHIFT_KEY]?.when
}
/**
 * Shift keys that count toward this trainee's certification.
 * The host shift is optional, so it only counts for trainees who were actually scheduled one.
 */
export function getRequiredShiftKeys(rec) {
  return hasHostShift(rec) ? [HOST_SHIFT_KEY, ...REQUIRED_SHIFT_KEYS] : REQUIRED_SHIFT_KEYS
}
/** Shift metadata: label, icon, flashcard set id for trainee dashboard */
export const SHIFT_META = {
  host: { label: 'Host shift', icon: '🛎️', flashcardSetId: null },
  follow: { label: 'Follow shift', icon: '👣', flashcardSetId: 'starters-soups-salads' },
  rev1: { label: '1st reverse', icon: '🔁', flashcardSetId: 'steaks-specialties' },
  rev2: { label: '2nd reverse', icon: '🍺', flashcardSetId: 'bar-beer' },
  rev3: { label: '3rd reverse', icon: '🧩', flashcardSetId: 'wines-cocktails' },
  rev4: { label: '4th reverse (optional)', icon: '🔄', flashcardSetId: null },
  foodrun: { label: 'Food running shift', icon: '🍽️', flashcardSetId: 'starters-soups-salads' },
  cert: { label: 'Certification', icon: '✅', flashcardSetId: null },
}
/** Criteria for trainee rating of trainer (1–5 stars each). Used in Rate modal and Trainer breakdown. */
export const TRAINER_RATING_CRITERIA = [
  "Explained the 'Why', not just the 'What'",
  'Gave clear, constructive feedback',
  'Made me feel comfortable asking questions',
  'Was organized and prepared',
  'I feel more confident after this shift',
]
export const TERMINATION_REASONS = [
  { key: 'quit', label: 'Quit / Personal reasons' },
  { key: 'too_long', label: 'Training taking too long' },
  { key: 'performance', label: 'Performance issues' },
  { key: 'trainer_conflict', label: 'Trainer conflict' },
  { key: 'attendance', label: 'Attendance / No-show' },
  { key: 'conduct', label: 'Conduct issues' },
  { key: 'position_eliminated', label: 'Position eliminated' },
  { key: 'other', label: 'Other' },
]
