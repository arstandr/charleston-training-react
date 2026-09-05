import { useState } from 'react'

/**
 * Reveals the reference answer for a verbal-cert item, always visible (no
 * expand/collapse — the manager needs it at a glance mid-conversation). For a
 * checklist answer, the manager taps off each part as the trainee says it;
 * onComplete fires once every part is checked so the caller can drive its own
 * existing scoring control (thumbs/checkbox/points) — this component never
 * scores anything itself, it's a memory aid over data/verbalCertAnswers.js.
 * Rows are large tap targets (44px+) since this gets used one-handed, live.
 */
export default function VerbalCertAnswerReveal({ answer, onComplete }) {
  const [checked, setChecked] = useState({})

  if (!answer) return null

  if (answer.type === 'single') {
    return (
      <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
        <p className="text-[15px] leading-snug text-amber-900 dark:text-amber-200">{answer.text}</p>
      </div>
    )
  }

  const total = answer.items.length
  const checkedCount = Object.values(checked).filter(Boolean).length

  function toggle(i) {
    const next = { ...checked, [i]: !checked[i] }
    setChecked(next)
    if (onComplete) onComplete(answer.items.every((_, idx) => next[idx]))
  }

  return (
    <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2">
      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 px-1.5 pb-1">
        {checkedCount}/{total} said
      </p>
      <div className="space-y-1">
        {answer.items.map((item, i) => {
          const isChecked = !!checked[i]
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className="w-full flex items-center gap-3 py-2.5 px-2 rounded-lg text-left active:bg-amber-200/70 dark:active:bg-amber-800/40 hover:bg-amber-100/80 dark:hover:bg-amber-900/30 transition-colors"
            >
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 transition-colors ${
                  isChecked
                    ? 'bg-amber-600 border-amber-600 dark:bg-amber-500 dark:border-amber-500'
                    : 'bg-white dark:bg-gray-800 border-amber-300 dark:border-amber-700'
                }`}
              >
                {isChecked && (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className={`text-[15px] leading-snug ${isChecked ? 'line-through text-amber-700/50 dark:text-amber-500/50' : 'text-amber-900 dark:text-amber-200'}`}>
                {item}
              </span>
            </button>
          )
        })}
      </div>
      {answer.note && <p className="mt-1 px-2 text-xs text-amber-700 dark:text-amber-400">{answer.note}</p>}
    </div>
  )
}
