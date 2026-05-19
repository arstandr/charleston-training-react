// Trainee Readiness Scale - 1-5 scoring for trainers after each shift

export const READINESS_SCALE = [
  { value: 1, label: '1 – Not Ready', short: 'Not Ready', description: 'Needs constant supervision; does not know core menu/procedures.', color: '#d32f2f' },
  { value: 2, label: '2 – Barely Ready', short: 'Barely Ready', description: 'Knows some basics but inconsistent; needs frequent reminders.', color: '#f57c00' },
  { value: 3, label: '3 – Conditionally Ready', short: 'Conditionally Ready', description: 'Can work solo in slow/normal shifts; needs help with complex situations.', color: '#fbc02d' },
  { value: 4, label: '4 – Ready', short: 'Ready', description: 'Can handle a normal shift independently; solid knowledge and execution.', color: '#7cb342' },
  { value: 5, label: '5 – Fully Ready / Trainer-Level', short: 'Fully Ready', description: 'Exceeds expectations; could train the next person.', color: '#2e7d32' },
]

export const READINESS_CATEGORIES = [
  { id: 'knowledge', label: 'Knowledge (menu, systems)', description: 'Does the trainee know the menu, POS system, policies, and procedures?' },
  { id: 'execution', label: 'Execution (speed, accuracy)', description: 'Can the trainee execute tasks quickly and accurately without errors?' },
  { id: 'confidence', label: 'Confidence / Guest Handling', description: 'Is the trainee confident with guests? Can they handle difficult situations?' },
]

export function calculateReadinessAverage(knowledge, execution, confidence) {
  const scores = [knowledge, execution, confidence].filter((s) => typeof s === 'number' && s >= 1 && s <= 5)
  if (scores.length < 3) return null
  const sum = scores.reduce((acc, score) => acc + score, 0)
  return Math.round((sum / scores.length) * 10) / 10
}

export function getReadinessLabel(average) {
  if (average === null) return 'Not Rated'
  if (average < 2) return 'Not Ready'
  if (average < 3) return 'Barely Ready'
  if (average < 4) return 'Conditionally Ready'
  if (average < 5) return 'Ready'
  return 'Fully Ready'
}

export function getReadinessColor(average) {
  if (average === null) return '#9e9e9e'
  if (average < 2) return '#d32f2f'
  if (average < 3) return '#f57c00'
  if (average < 4) return '#fbc02d'
  if (average < 5) return '#7cb342'
  return '#2e7d32'
}
