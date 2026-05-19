import React from 'react'

/**
 * Practice Greet Exercise — Day 2 (Follow Shift)
 * From the training manual: "Following your Follow Shift, let's practice greeting the Manager and your Trainer.
 * The Trainee should be able to verbally greet a table. Make sure all main points are hit and offer suggestions for improvement."
 *
 * Fields: 16 greet script points, Manager greeted, Comments
 */
export default function PracticeGreetExercise({ data, onChange, disabled }) {
  const greetPoints = data?.greetPoints || Array(16).fill('')
  const managerGreeted = data?.managerGreeted || ''
  const comments = data?.comments || ''

  function updateGreetPoint(idx, value) {
    const updated = [...greetPoints]
    updated[idx] = value
    onChange({ ...data, greetPoints: updated })
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
          Following your Follow Shift, let's practice greeting the Manager and your Trainer. The Trainee should
          be able to verbally greet a table. Make sure all main points are hit and offer suggestions for improvement.
        </p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
        <p className="text-sm text-amber-800 dark:text-amber-200 font-semibold">
          👨‍🏫 Trainer: Use this section to help write out a sample greet including features so your Trainee can practice!
        </p>
      </div>

      <div>
        <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-3">Greet Script Points</h4>
        <div className="space-y-2">
          {greetPoints.map((point, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-[10px] font-bold text-gray-400 flex-shrink-0">
                {idx + 1}
              </span>
              <input
                type="text"
                value={point}
                onChange={(e) => updateGreetPoint(idx, e.target.value)}
                placeholder={`Point ${idx + 1}...`}
                disabled={disabled}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-300 dark:focus:border-blue-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
          Manager who was greeted:
        </label>
        <input
          type="text"
          value={managerGreeted}
          onChange={(e) => onChange({ ...data, managerGreeted: e.target.value })}
          placeholder="Manager name"
          disabled={disabled}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-300 dark:focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
          Comments &amp; Feedback:
        </label>
        <textarea
          value={comments}
          onChange={(e) => onChange({ ...data, comments: e.target.value })}
          placeholder="Feedback on the practice greet, areas to improve, strengths observed..."
          disabled={disabled}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-300 dark:focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          rows={4}
        />
      </div>
    </div>
  )
}
