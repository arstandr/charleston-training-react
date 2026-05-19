/**
 * Trainer Rating Criteria - Used by trainees to rate their trainer after each shift
 */

export const TRAINER_RATING_CRITERIA = [
  {
    id: 0,
    label: 'Explained the why, not just the what',
    description: 'Did the trainer explain reasons behind procedures, not just steps?',
  },
  {
    id: 1,
    label: 'Gave clear feedback',
    description: 'Was feedback specific, constructive, and helpful?',
  },
  {
    id: 2,
    label: 'Comfortable asking questions',
    description: 'Did you feel safe asking questions without judgment?',
  },
  {
    id: 3,
    label: 'Organized and prepared',
    description: 'Was the trainer organized with a clear plan for the shift?',
  },
  {
    id: 4,
    label: 'I feel confident now',
    description: 'Do you feel more confident after this shift?',
  },
]

export const TRAINER_RATING_NOTES_MAX = 300

export function calculateTrainerAverage(scores) {
  if (!scores || scores.length !== 5) return null
  const validScores = scores.filter((s) => typeof s === 'number' && s >= 1 && s <= 5)
  if (validScores.length !== 5) return null
  const sum = validScores.reduce((acc, score) => acc + score, 0)
  return Math.round((sum / validScores.length) * 10) / 10
}
