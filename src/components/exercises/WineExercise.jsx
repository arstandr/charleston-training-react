import React from 'react'

/**
 * Wine Bottle Opening/Service Exercise
 * Day 4 (page 8): Present and open a bottle of wine to Manager and Trainer.
 * Certification (page 22): Open bottle half corked by Bartender.
 */

const DAY4_ITEMS = [
  'Presents wine bottle to Host',
  "3 V's (Vintage, Vineyard, Varietal)",
  'Opening bottle with wine key (Keeping label towards Host)',
  'Pours 1 oz. sample to Host',
  'Pours Ladies first',
  'Pours Host last',
  'Leaves wine glasses on table',
  'Using twist motion & linen for no spills',
  'Leaving wine in the bottle',
  'Red on linen, white in chiller',
  'Controlling the pour throughout the meal',
]

const CERT_ITEMS = [
  'Presents wine bottle to Host',
  "3 V's (Vintage, Vineyard, Varietal)",
  'Opening bottle that has been half corked by Bartender (Keeping label towards Host)',
  'Pours 1 oz. sample to Host',
  'Pours Ladies first',
  'Pours Host last',
  'Leaves wine glasses on table',
  'Using twist motion & linen for no spills',
  'Leaving wine in the bottle',
  'Red on linen, white in chiller',
  'Controlling the pour throughout the meal',
]

export default function WineExercise({ data, onChange, variant = 'day4', disabled }) {
  const items = variant === 'cert' ? CERT_ITEMS : DAY4_ITEMS
  const checks = data?.checks || {}
  const wineBottle = data?.wineBottle || ''
  const comments = data?.comments || ''

  const checkedCount = Object.values(checks).filter(Boolean).length
  const isComplete = checkedCount === items.length
  const progress = items.length > 0 ? (checkedCount / items.length) * 100 : 0

  function toggleCheck(idx) {
    if (disabled) return
    onChange({ ...data, checks: { ...checks, [idx]: !checks[idx] } })
  }

  const instructions =
    variant === 'cert'
      ? 'Please open a bottle of wine for your Manager. Describe how to appropriately pour wine for a couple dining.'
      : 'Please present and open a bottle of wine to your Manager and Trainer. Describe how to appropriately service a bottle of wine for a couple dining.'

  const verifyNote =
    variant === 'cert'
      ? 'Manager — Please verify the following proper procedures are utilized:'
      : 'Manager & Trainer — Please verify the following proper procedures are utilized:'

  return (
    <div className="space-y-5">
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
        <p className="text-sm text-purple-800 dark:text-purple-200 leading-relaxed">{instructions}</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
          🍷 Wine Bottle Presented:
        </label>
        <input
          type="text"
          value={wineBottle}
          onChange={(e) => onChange({ ...data, wineBottle: e.target.value })}
          placeholder="e.g. 2019 Caymus Cabernet Sauvignon"
          disabled={disabled}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-300 dark:focus:ring-purple-500 focus:border-purple-300 dark:focus:border-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {verifyNote}
      </p>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-600 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-green-500' : 'bg-purple-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span
          className={`text-xs font-bold ${isComplete ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}
        >
          {checkedCount}/{items.length}
        </span>
      </div>

      <div className="space-y-1">
        {items.map((item, idx) => (
          <label
            key={idx}
            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
              checks[idx] ? 'bg-green-50 dark:bg-green-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
            } ${disabled ? 'cursor-default' : ''}`}
          >
            <div className="mt-0.5 flex-shrink-0">
              <div
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                  checks[idx] ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700'
                }`}
              >
                {checks[idx] && (
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <input
                type="checkbox"
                checked={!!checks[idx]}
                onChange={() => toggleCheck(idx)}
                className="sr-only"
              />
            </div>
            <span
              className={`text-sm ${checks[idx] ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'}`}
            >
              {item}
            </span>
          </label>
        ))}
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Comments:</label>
        <textarea
          value={comments}
          onChange={(e) => onChange({ ...data, comments: e.target.value })}
          placeholder="Notes on wine service technique, areas to improve..."
          disabled={disabled}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-300 dark:focus:ring-purple-500 focus:border-purple-300 dark:focus:border-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          rows={4}
        />
      </div>
    </div>
  )
}
