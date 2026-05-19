/**
 * Fetch bonus questions from Firestore via Cloud Function getBonusQuestions.
 * Used to add 3 bonus questions to official tests.
 */
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../firebase'

/**
 * @param {number} [count=3] - Number of bonus questions to return
 * @param {string[]} [excludeIds=[]] - Question IDs to exclude (e.g. already used)
 * @returns {Promise<{ id: string, question: string, answer: string, category: string, points?: number }[]>}
 */
export async function getBonusQuestions(count = 3, excludeIds = []) {
  try {
    const functions = getFunctions(app)
    const getBonusQuestionsFn = httpsCallable(functions, 'getBonusQuestions')
    const result = await getBonusQuestionsFn({ count, excludeIds })
    const data = result?.data
    if (data?.success && Array.isArray(data.questions)) {
      return data.questions
    }
    console.error('getBonusQuestions: unexpected response', data)
    return []
  } catch (error) {
    console.error('Error fetching bonus questions:', error)
    return []
  }
}
