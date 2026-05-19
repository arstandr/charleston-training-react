import React, { useState } from 'react'

/**
 * Upselling Exercise — Day 5 (3rd Reverse)
 * 9 matching-style questions with answer reveal.
 */

// PDF Page 11 — 3rd Reverse Upselling Exercise
const UPSELLING_QUESTIONS = [
  { question: 'Guest orders vodka and tonic – upsell?', answer: "Grey Goose, Tito's, Belvedere, Absolut" },
  { question: 'A B C stands for what in upselling?', answer: 'Avocado, Anchovies, Bacon, Blue Cheese Crumbles, Cheese' },
  { question: 'When featuring, best way to increase sales?', answer: 'True (include wine pairing)' },
  { question: 'Guest orders dessert – upsell?', answer: 'Espresso Martini, Coffee, Chocolatini' },
  { question: 'Guest orders Manhattan/Old Fashioned – upsell?', answer: "Angel's Envy, Basil Hayden, Woodford" },
  { question: "Guest orders entrée without salad – ring in?", answer: 'House $/Caesar $' },
  { question: 'Guest orders burger – upsell extra?', answer: 'Burger Patty' },
  { question: 'Guest orders cup of soup – suggest for $1 more?', answer: 'Bowl of Soup' },
  { question: 'Prime Rib larger portions?', answer: '16oz, 18oz, 20oz, 22oz, etc.' },
]

export default function UpsellingExercise({ data, onChange, disabled }) {
  const answers = data?.answers || {}
  const [revealedAnswers, setRevealedAnswers] = useState({})

  function updateAnswer(idx, value) {
    onChange({ ...data, answers: { ...answers, [idx]: value } })
  }

  function toggleReveal(idx) {
    setRevealedAnswers((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  const answeredCount = Object.values(answers).filter((a) => a && a.trim()).length

  return (
    <div className="space-y-5">
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
        <p className="text-sm text-green-800 dark:text-green-200 leading-relaxed">
          <strong>Upselling</strong> is the easiest way to increase your sales. Our goal as Servers is always to
          make the most amount of money in the least amount of time with the least amount of effort.
        </p>
      </div>

      <div className="text-center">
        <span className="text-sm font-bold text-gray-600 dark:text-gray-300">
          {answeredCount}/{UPSELLING_QUESTIONS.length} answered
        </span>
      </div>

      <div className="space-y-3">
        {UPSELLING_QUESTIONS.map((q, idx) => {
          const isRevealed = revealedAnswers[idx]
          const userAnswer = answers[idx] || ''
          const isCorrectish =
            userAnswer.trim() &&
            q.answer
              .toLowerCase()
              .split(',')
              .some((part) => userAnswer.toLowerCase().includes(part.trim().toLowerCase().slice(0, 5)))

          return (
            <div
              key={idx}
              className={`rounded-xl border-2 overflow-hidden transition-all ${
                isRevealed && isCorrectish
                  ? 'border-green-200 dark:border-green-600 bg-green-50/30 dark:bg-green-900/20'
                  : isRevealed && !isCorrectish
                    ? 'border-amber-200 dark:border-amber-600 bg-amber-50/30 dark:bg-amber-900/20'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-xs font-bold text-green-600 dark:text-green-400 flex-shrink-0">
                    {idx + 1}
                  </span>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-relaxed">
                    {q.question}
                  </p>
                </div>
                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => updateAnswer(idx, e.target.value)}
                  placeholder="Your answer..."
                  disabled={disabled}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-300 dark:focus:ring-green-500 focus:border-green-300 dark:focus:border-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-2"
                />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => toggleReveal(idx)}
                    disabled={disabled}
                    className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50"
                  >
                    {isRevealed ? 'Hide Answer' : 'Show Answer'}
                  </button>
                  {isRevealed && (
                    <span
                      className={`text-xs font-semibold ${isCorrectish ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}
                    >
                      {isCorrectish ? '✅ Great!' : '⚠️ Review answer'}
                    </span>
                  )}
                </div>
                {isRevealed && (
                  <div className="mt-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">✓ {q.answer}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={() => {
            const allRevealed =
              Object.keys(revealedAnswers).length === UPSELLING_QUESTIONS.length &&
              Object.values(revealedAnswers).every(Boolean)
            const newState = {}
            UPSELLING_QUESTIONS.forEach((_, idx) => {
              newState[idx] = !allRevealed
            })
            setRevealedAnswers(newState)
          }}
          className="w-full py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          {Object.keys(revealedAnswers).length === UPSELLING_QUESTIONS.length &&
          Object.values(revealedAnswers).every(Boolean)
            ? 'Hide All Answers'
            : 'Show All Answers'}
        </button>
      )}
    </div>
  )
}
