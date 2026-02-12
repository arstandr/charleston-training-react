export const STAFF_LOGINS = {
  '0000': { role: 'admin', name: 'Adam', store: 'All' },
  '1111': { role: 'manager', name: 'Ben', store: 'Castleton' },
  '1234': { role: 'manager', name: 'Adam', store: 'Westfield' },
  '7890': { role: 'trainer', name: 'Frank', store: 'Westfield' },
  '1002': { role: 'trainer', name: 'Joe', store: 'Westfield' },
  '3333': { role: 'trainer', name: 'Joe', store: 'Castleton' },
  '6666': { role: 'trainer', name: 'Jim', store: 'Castleton' },
}

export const STORE_TO_TOAST_GUID = {
  Westfield: '86326c13-2905-455f-924a-a970ba974785',
  Castleton: 'b2965271-1d9f-4507-a427-0451c2e54cbf',
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

/** Shift metadata: label, icon, flashcard set id for trainee dashboard */
export const SHIFT_META = {
  follow: { label: 'Follow shift', icon: '👣', flashcardSetId: 'starters-soups-salads' },
  rev1: { label: '1st reverse', icon: '🔁', flashcardSetId: 'steaks-specialties' },
  rev2: { label: '2nd reverse', icon: '🍺', flashcardSetId: 'bar-beer' },
  rev3: { label: '3rd reverse', icon: '🧩', flashcardSetId: 'wines-cocktails' },
  rev4: { label: '4th reverse (optional)', icon: '🔄', flashcardSetId: null },
  foodrun: { label: 'Food running shift', icon: '🍽️', flashcardSetId: 'wines-cocktails' },
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
