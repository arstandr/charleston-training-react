/**
 * Pure helper functions and constants for flashcard study modes.
 * Extracted from FlashcardsPageContent.jsx — no React dependencies.
 */

export function cleanJeopardyText(description, answer) {
  if (!description || !answer) return description || ''
  const name = String(answer).trim()
  if (!name) return description
  let out = String(description)
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  out = out.replace(new RegExp(escaped + '\\s*[\\-–:]?\\s*', 'gi'), ' ')
  out = out.replace(new RegExp('\\b' + escaped + '\\b', 'gi'), ' ')
  const words = name.split(/\s+/).filter((w) => w.length > 1)
  for (const word of words) {
    const wEsc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp('\\b' + wEsc + '\\b', 'gi'), ' ')
  }
  out = out.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n\n+/g, '\n').trim()
  const lines = out.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  const filtered = lines.filter((line) => {
    const lower = line.toLowerCase()
    const nameLower = name.toLowerCase()
    if (lower === nameLower || lower.startsWith(nameLower + ' ') || lower.startsWith(nameLower + ':') || lower.startsWith(nameLower + '-')) return false
    const lineWords = line.split(/\s+/)
    if (lineWords.length <= 2 && words.some((w) => lower.includes(w.toLowerCase()))) return false
    return true
  })
  out = filtered.join('\n').trim()
  return out || '(Details hidden — guess the item)'
}

export const MANAGER_QUESTION_TYPES = [
  {
    id: 'sell_me',
    template: (context) => `Sell me two of your favorite ${context.category?.toLowerCase() || 'menu items'}.`,
    hint: 'Describe the items as you would to a guest — include key ingredients and why you like them.',
  },
  {
    id: 'whats_in_it',
    template: (item) => `A guest asks about the ${item.front || item.itemName}. What do you tell them?`,
    hint: 'Include all main ingredients, preparation method, and any sides.',
  },
  {
    id: 'garnish',
    template: (item) => `What's the garnish on the ${item.front || item.itemName}?`,
    hint: 'Name the specific garnish items.',
    appliesTo: ['soup'],
  },
  {
    id: 'upsell',
    template: () => {
      const scenarios = [
        'A guest orders a vodka and tonic. What do you upsell?',
        'A guest orders a Manhattan. What bourbon do you suggest?',
        'A guest orders a burger. What can you upsell as an extra?',
        'A guest orders a cup of soup. What do you suggest for $1 more?',
        'A guest orders dessert. What drink do you pair with it?',
        'A guest orders an entrée without a salad. How do you ring in the upsell?',
      ]
      return scenarios[Math.floor(Math.random() * scenarios.length)]
    },
    hint: 'Think about what increases the check total.',
  },
  {
    id: 'identify',
    template: (item) => {
      const details = item.back || item.details || ''
      const ingredients = details.replace(/^-|^•/gm, '').split('\n').filter((l) => l.trim()).slice(0, 4).join(', ')
      return ingredients ? `I'm describing a menu item: ${ingredients}. What is it?` : 'What menu item has these components?'
    },
    hint: 'Name the menu item based on the description.',
  },
  {
    id: 'service',
    template: () => {
      const questions = [
        'What is our maximum greet time?',
        'How long to get first round of drinks out?',
        'Name the 7 Steps of Service.',
        'What does a perfect pre-bus consist of?',
        "What are the 4 R's for the Red Check Procedure?",
        "A guest's steak is undercooked. What do you do?",
        'What is Tile Talk and how is it effective?',
        'What is the 10-step rule?',
        'How do you check out with a Shift Leader?',
        'What is our Mission Statement?',
      ]
      return questions[Math.floor(Math.random() * questions.length)]
    },
    hint: "Think about Charleston's service standards.",
  },
  {
    id: 'wine',
    template: () => {
      const questions = [
        'What is our sweetest white wine?',
        'What is our driest red wine?',
        'How much wine do we pour per glass?',
        'A guest orders a martini. What three things do you ask?',
        "Name the 3 V's of wine presentation.",
        'Describe the proper wine bottle opening procedure.',
      ]
      return questions[Math.floor(Math.random() * questions.length)]
    },
    hint: 'Think about bar and wine service knowledge.',
  },
]

// Service review questions with known correct answers (from training manual)
export const SERVICE_REVIEW_POOL = [
  { question: 'What is our maximum amount of time to greet a table?', correctAnswer: '30 seconds' },
  { question: 'How long do you have to get your first round of drinks to a table?', correctAnswer: '2 minutes' },
  { question: 'All alcoholic beverages and hot beverages automatically receive what?', correctAnswer: 'A beverage napkin (bev nap)' },
  { question: 'Who has the "right of way" when moving about in Charleston\'s?', correctAnswer: 'The Guest always has the right of way' },
  { question: 'How many "Hellos/Thank you\'s" should a Guest hear?', correctAnswer: '5 of each during their visit' },
  { question: 'If a Guest asks "where is the restroom?" — what do you do?', correctAnswer: 'Say "Absolutely, right this way" and walk them there' },
  { question: 'How often do we perform Restroom Checks?', correctAnswer: 'Every 30 minutes' },
  { question: 'Where should your hand be when carrying glassware?', correctAnswer: 'By the stem or the bottom third — never the rim' },
  { question: 'Do we automatically serve straws with our waters, tea & sodas?', correctAnswer: 'Yes for sodas and tea, no for water (request only)' },
  { question: 'What does manicure your table mean?', correctAnswer: 'Remove small items like straw wrappers, sugar packets, and empty ramekins' },
  { question: 'What does a perfect pre-bus consist of?', correctAnswer: 'Removing finished plates, used silverware, and empty glasses' },
  { question: 'What is our Mission Statement?', correctAnswer: "To Consistently Exceed Our Guests' Expectations" },
  { question: "What are the 4 R's of the Red Check Procedure?", correctAnswer: 'Remove, Report, Red Check, Run' },
  { question: 'What is the 10-step rule?', correctAnswer: 'Once check is down, stay within 10 steps to process payment immediately' },
  { question: 'What does "Full Hands In" mean?', correctAnswer: 'Always enter the kitchen with dirty dishes — never go in empty handed' },
]

export const RECALL_TEMPLATES = [
  (front) => `Tell me about ${front} — what should you know?`,
  (front) => `A guest asks about ${front}. What do you tell them?`,
  (front) => `What are the key details for ${front}?`,
  (front) => `Walk me through ${front}.`,
  (front) => `Pop quiz: ${front} — go!`,
  (front) => `What can you tell me about ${front}?`,
]

/** Forgiving answer matching — any meaningful part of the answer counts. */
export function isAnswerClose(userAnswer, correctAnswer) {
  if (!userAnswer?.trim() || !correctAnswer) return false
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  const user = norm(userAnswer)
  const correct = norm(correctAnswer)
  if (!user) return false
  if (user === correct) return true
  // User's text found inside correct answer (min 3 chars)
  if (user.length >= 3 && correct.includes(user)) return true
  // Check against each line of multi-line answers
  const lines = correctAnswer.split(/[\n•]/).map((l) => norm(l)).filter((l) => l.length > 0)
  for (const line of lines) {
    if (user.length >= 3 && line.includes(user)) return true
    if (line.length >= 3 && user.includes(line)) return true
  }
  // Number matching: user typed a number that appears in the answer
  const userNums = user.match(/\d+/g) || []
  const correctNums = correct.match(/\d+/g) || []
  if (userNums.length > 0 && userNums.some((n) => correctNums.includes(n))) return true
  // Word overlap: significant words (3+ chars, not stop words)
  const stops = new Set(['the', 'and', 'for', 'are', 'was', 'not', 'you', 'our', 'with', 'that', 'this', 'from', 'they', 'been', 'have', 'will'])
  const userWords = user.split(' ').filter((w) => w.length >= 3 && !stops.has(w))
  if (userWords.length > 0) {
    const matches = userWords.filter((w) => correct.includes(w))
    if (matches.length > 0 && matches.length >= Math.ceil(userWords.length * 0.4)) return true
  }
  return false
}
