/**
 * Charlie Service — Cloud Function wrapper, system prompt builder, tool definitions.
 */
import { app } from '../firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'

const functions = getFunctions(app)

/**
 * Call the authenticated charlieChat Cloud Function.
 * @param {Array} contents - Gemini conversation contents
 * @param {Array} tools - Tool definitions for function calling
 * @param {string} traineeId - Trainee ID (for trainee auth)
 * @param {string} sessionToken - Session token (for trainee auth)
 * @param {object} generationConfig - Optional Gemini generation config overrides
 */
export async function callCharlieChat(contents, tools = [], traineeId = null, sessionToken = null, generationConfig = {}) {
  const fn = httpsCallable(functions, 'charlieChat', { timeout: 60000 })
  const payload = { contents, generationConfig }
  if (tools.length > 0) payload.tools = tools
  if (traineeId && sessionToken) {
    payload.traineeId = traineeId
    payload.sessionToken = sessionToken
  }
  const result = await fn(payload)
  return result.data
}

/**
 * Build Charlie's system prompt based on role and context.
 */
export function buildSystemPrompt(role, userName, categoryInfo = '') {
  const roleInstructions = {
    trainee: `ROLE: You are talking to a trainee named ${userName || 'there'}.
You can look up their personal progress, quiz scores, weak areas, and study history using your tools.
You can run conversational quizzes — ask questions naturally, evaluate answers, and save results.
You can log study sessions and update their mastery data.
Always encourage them and be supportive of their learning journey.`,

    trainer: `ROLE: You are talking to a trainer named ${userName || 'there'}.
You can look up any trainee's progress and compare trainees using your tools.
You can search flashcards for reference.
Help them understand how their trainees are doing and suggest focus areas.`,

  }

  // Manager/owner/admin share the same capabilities, only the title and style differ
  const leaderBase = (title, style) => `ROLE: You are talking to ${title} named ${userName || 'there'}.
You can look up what needs their attention: pending trainer claims, sign-offs, stalled trainees, and failed tests.
You can check team certification readiness and compare any trainees.
You can check content health: missing quizzes, pending approvals, and chatbot flags.
You can approve or deny trainer claims and sign off on shifts. ALWAYS confirm before executing any write action — tell them exactly what you're about to do and wait for their OK.
You can create, edit, and delete flashcards. You can generate quiz questions for cards and approve them.
You can bulk-create flashcards from pasted text (menu descriptions, etc.).
When creating or editing content, ALWAYS confirm before executing.
When showing quiz questions for approval, display the question, all 4 options, the correct answer, and explanation clearly.
${style}
When they ask "what do I need to do" or similar, ALWAYS call getManagerActionItems yourself — never tell them to use a tool.
NEVER reference tool names in your responses. Just call the tools and summarize the results naturally.
ALWAYS use traineeName (the person's real name) when talking about trainees — NEVER show traineeId or raw IDs to the user.`

  roleInstructions.manager = leaderBase('a manager', 'Provide data-driven insights. Be concise — managers are busy.')
  roleInstructions.owner = leaderBase('an owner', 'Provide data-driven insights and high-level views of training programs.')
  roleInstructions.admin = leaderBase('an admin', 'Provide data-driven insights and high-level views of training programs.')

  return `You are Charlie, a friendly and experienced senior trainer at Charleston's Restaurant. You're texting like a supportive colleague — casual, warm, and never condescending.

PERSONALITY:
- Use their first name naturally.
- Sound like real texts: 1-3 short sentences max. No long paragraphs.
- Use restaurant lingo naturally: "the line", "expo", "86'd", "on the fly", "behind you", "all day", "fire", "heard".
- Encourage them: "You're getting it!", "That's exactly right.", "Almost — think about it this way..."
- Gentle corrections only; never talk down.
- Occasional emoji is fine but don't overdo it.

${roleInstructions[role] || roleInstructions.trainee}

KNOWLEDGE:
${categoryInfo || 'Use the searchFlashcards tool to look up specific menu items, recipes, or training content.'}

CRITICAL SERVICE PRIORITIES (every server must know):
1. HOT FOOD — Priority #1. Hot food dies fast. Run it immediately.
2. COLD DRINKS — Priority #2. Guests notice an empty glass before anything else.
3. EVERYTHING ELSE — Priority #3. Side work, rolling, polishing — never before 1 and 2.

CONVERSATIONAL QUIZZING:
When a trainee asks to be quizzed or you think it would help:
1. Use searchFlashcards to find relevant cards for the topic
2. Ask ONE question at a time, conversationally — don't list all questions at once
3. Wait for their answer before asking the next question
4. Evaluate their answer — partial credit is OK, be encouraging
5. Give brief feedback and explain the correct answer if they got it wrong
6. After 3-5 questions, summarize their performance and use saveQuizResult to record it
7. If they struggle, suggest studying specific topics

TOOL USAGE:
- Use tools to give personalized, data-driven responses
- When looking up data, briefly tell the user what you're doing (e.g., "Let me check your scores...")
- Present data conversationally, not as raw JSON
- If a tool fails, apologize briefly and move on

If you don't know something, say so honestly. Keep every response brief and text-like.`
}

/**
 * Build Gemini tool definitions based on user role.
 */
export function buildToolDefinitions(role) {
  const readTools = [
    {
      name: 'searchFlashcards',
      description: 'Search flashcards by topic keyword. Returns matching cards with front (question/item) and back (answer/description).',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Search keyword or topic (e.g., "filet", "cocktails", "expo procedures")' },
          maxResults: { type: 'INTEGER', description: 'Maximum results to return (default 5)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'getFlashcardCategories',
      description: 'Get all flashcard categories/sets with their card counts.',
      parameters: { type: 'OBJECT', properties: {} },
    },
  ]

  const traineeTools = [
    {
      name: 'getMyProgress',
      description: "Get the trainee's overall mastery stats: total cards studied, mastered count, needs-practice count, mastery percentage.",
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'getMyQuizScores',
      description: "Get the trainee's recent quiz and test scores.",
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'getMyWeakAreas',
      description: "Get the trainee's weak spots — topics and cards they struggle with most.",
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'getMyStudyHistory',
      description: "Get the trainee's recent study activity: flashcard sessions, quizzes, logins.",
      parameters: {
        type: 'OBJECT',
        properties: {
          maxResults: { type: 'INTEGER', description: 'Maximum results (default 10)' },
        },
      },
    },
    {
      name: 'getStudyRecommendation',
      description: "Get personalized study recommendation — which cards are due for review based on Leitner spaced repetition.",
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'logStudySession',
      description: 'Record a study session for the trainee (use after conversational quizzing).',
      parameters: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING', description: 'Topic studied' },
          cardsReviewed: { type: 'INTEGER', description: 'Number of cards/questions reviewed' },
          correctCount: { type: 'INTEGER', description: 'Number answered correctly' },
        },
        required: ['topic', 'cardsReviewed', 'correctCount'],
      },
    },
    {
      name: 'saveQuizResult',
      description: 'Save the result of a conversational quiz session.',
      parameters: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING', description: 'Quiz topic' },
          totalQuestions: { type: 'INTEGER', description: 'Total questions asked' },
          correctCount: { type: 'INTEGER', description: 'Number answered correctly' },
        },
        required: ['topic', 'totalQuestions', 'correctCount'],
      },
    },
  ]

  const staffTools = [
    {
      name: 'getTraineeList',
      description: 'Get list of all trainees with their names and stores.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'getTraineeProgress',
      description: "Get a specific trainee's mastery data and stats.",
      parameters: {
        type: 'OBJECT',
        properties: {
          traineeName: { type: 'STRING', description: 'Trainee name to look up (partial match OK)' },
        },
        required: ['traineeName'],
      },
    },
    {
      name: 'compareTrainees',
      description: 'Compare progress between two or more trainees side-by-side.',
      parameters: {
        type: 'OBJECT',
        properties: {
          traineeNames: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'List of trainee names to compare',
          },
        },
        required: ['traineeNames'],
      },
    },
  ]

  const managerTools = [
    {
      name: 'getManagerActionItems',
      description: 'Get pending action items: claims to approve, sign-offs needed, stalled trainees, failed tests.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'getTeamReadiness',
      description: 'Get team certification readiness: per-trainee progress, certified count, average progress.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'getContentHealth',
      description: 'Get content health status: missing quizzes, pending quiz approvals, unresolved chatbot flags.',
      parameters: { type: 'OBJECT', properties: {} },
    },
  ]

  const managerWriteTools = [
    {
      name: 'approveClaim',
      description: 'Approve a pending trainer claim on a trainee\'s shift. IMPORTANT: Always confirm with the manager before calling this.',
      parameters: {
        type: 'OBJECT',
        properties: {
          traineeId: { type: 'STRING', description: 'Trainee ID (from getManagerActionItems)' },
          shiftKey: { type: 'STRING', description: 'Shift key, e.g. "follow", "rev1", "rev2"' },
        },
        required: ['traineeId', 'shiftKey'],
      },
    },
    {
      name: 'denyClaim',
      description: 'Deny a pending trainer claim on a trainee\'s shift. IMPORTANT: Always confirm with the manager before calling this.',
      parameters: {
        type: 'OBJECT',
        properties: {
          traineeId: { type: 'STRING', description: 'Trainee ID (from getManagerActionItems)' },
          shiftKey: { type: 'STRING', description: 'Shift key, e.g. "follow", "rev1", "rev2"' },
        },
        required: ['traineeId', 'shiftKey'],
      },
    },
    {
      name: 'signOffShift',
      description: 'Manager sign-off on a trainee\'s shift (after trainer has already signed). IMPORTANT: Always confirm with the manager before calling this.',
      parameters: {
        type: 'OBJECT',
        properties: {
          traineeId: { type: 'STRING', description: 'Trainee ID (from getManagerActionItems)' },
          shiftKey: { type: 'STRING', description: 'Shift key, e.g. "follow", "rev1", "rev2"' },
        },
        required: ['traineeId', 'shiftKey'],
      },
    },
  ]

  const contentManagementTools = [
    {
      name: 'createFlashcard',
      description: 'Create a new flashcard. IMPORTANT: Always confirm with the user before calling this.',
      parameters: {
        type: 'OBJECT',
        properties: {
          front: { type: 'STRING', description: 'Front of the card (question or item name)' },
          back: { type: 'STRING', description: 'Back of the card (answer or description)' },
          setId: { type: 'STRING', description: 'Category/set ID (e.g., "bar-beer", "food-entrees")' },
        },
        required: ['front', 'back', 'setId'],
      },
    },
    {
      name: 'editFlashcard',
      description: 'Edit an existing flashcard. Use searchFlashcards first to find the card ID. IMPORTANT: Always confirm before calling this.',
      parameters: {
        type: 'OBJECT',
        properties: {
          cardId: { type: 'STRING', description: 'Flashcard document ID (from searchFlashcards)' },
          front: { type: 'STRING', description: 'New front text (optional)' },
          back: { type: 'STRING', description: 'New back text (optional)' },
          setId: { type: 'STRING', description: 'New category/set ID (optional)' },
        },
        required: ['cardId'],
      },
    },
    {
      name: 'graveyardFlashcard',
      description: 'Soft-delete a flashcard (move to graveyard). IMPORTANT: Always confirm before calling this.',
      parameters: {
        type: 'OBJECT',
        properties: {
          cardId: { type: 'STRING', description: 'Flashcard document ID to graveyard' },
        },
        required: ['cardId'],
      },
    },
    {
      name: 'restoreFlashcard',
      description: 'Restore a graveyarded flashcard back to active.',
      parameters: {
        type: 'OBJECT',
        properties: {
          cardId: { type: 'STRING', description: 'Flashcard document ID to restore' },
        },
        required: ['cardId'],
      },
    },
    {
      name: 'generateQuizForCard',
      description: 'Generate an AI quiz question for a flashcard. The quiz will need approval before trainees can see it.',
      parameters: {
        type: 'OBJECT',
        properties: {
          cardId: { type: 'STRING', description: 'Flashcard document ID to generate a quiz for' },
        },
        required: ['cardId'],
      },
    },
    {
      name: 'approveQuiz',
      description: 'Approve a pending quiz question on a flashcard so trainees can be tested on it.',
      parameters: {
        type: 'OBJECT',
        properties: {
          cardId: { type: 'STRING', description: 'Flashcard document ID whose quiz to approve' },
        },
        required: ['cardId'],
      },
    },
    {
      name: 'bulkCreateFlashcards',
      description: 'Generate multiple flashcards from pasted text (menu descriptions, training materials, etc.) using AI. IMPORTANT: Always confirm before calling this.',
      parameters: {
        type: 'OBJECT',
        properties: {
          sourceText: { type: 'STRING', description: 'The text to convert into flashcards' },
          setId: { type: 'STRING', description: 'Category/set ID for all generated cards' },
          count: { type: 'INTEGER', description: 'Target number of cards to generate (default 10)' },
        },
        required: ['sourceText', 'setId'],
      },
    },
    {
      name: 'getPendingQuizApprovals',
      description: 'List flashcards with quiz questions pending approval. Shows each quiz question, options, and correct answer for review.',
      parameters: {
        type: 'OBJECT',
        properties: {
          setId: { type: 'STRING', description: 'Filter by category/set ID (optional)' },
        },
      },
    },
  ]

  // Build tools array
  const tools = [...readTools]
  if (role === 'trainee') {
    tools.push(...traineeTools)
  } else {
    // trainer, manager, admin, owner
    tools.push(...staffTools)
    if (role === 'manager' || role === 'owner' || role === 'admin') {
      tools.push(...managerTools, ...managerWriteTools, ...contentManagementTools)
    }
  }

  return [{ functionDeclarations: tools }]
}
