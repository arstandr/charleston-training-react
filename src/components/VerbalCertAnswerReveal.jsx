import { useState } from 'react'

/**
 * Reveals the reference answer for a verbal-cert item. For a checklist answer,
 * the manager taps off each part as the trainee says it; onComplete fires once
 * every part is checked so the caller can drive its own existing scoring
 * control (thumbs/checkbox/points) — this component never scores anything
 * itself, it's a memory aid over the answer key in data/verbalCertAnswers.js.
 */
export default function VerbalCertAnswerReveal({ answer, onComplete }) {
  const [checked, setChecked] = useState({})

  if (!answer) return null

  if (answer.type === 'single') {
    return (
      <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
        <p className="text-sm text-amber-900 dark:text-amber-200">{answer.text}</p>
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
    <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
        {checkedCount}/{total} said
      </p>
      <div className="space-y-0.5">
        {answer.items.map((item, i) => (
          <label
            key={i}
            className="flex items-center gap-2 py-1 px-1.5 -mx-1.5 rounded cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-900/30"
          >
            <input
              type="checkbox"
              checked={!!checked[i]}
              onChange={() => toggle(i)}
              className="rounded"
            />
            <span className={`text-sm ${checked[i] ? 'line-through text-amber-700/50 dark:text-amber-500/50' : 'text-amber-900 dark:text-amber-200'}`}>
              {item}
            </span>
          </label>
        ))}
      </div>
      {answer.note && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">{answer.note}</p>}
    </div>
  )
}
