import { useMemo } from 'react'

const RETRAIN_AREAS = [
  { key: 'phase2', label: 'Local Options' },
  { key: 'phase3', label: 'Food Menu' },
  { key: 'phase4', label: 'Bar' },
  { key: 'phase5', label: 'Service' },
  { key: 'pos', label: 'POS speed' },
]

function Meter({ score, max }) {
  const pct = max ? Math.round((score / max) * 100) : 0
  return (
    <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
      <div className="h-full rounded-full bg-green-700" style={{ width: `${pct}%` }} />
    </div>
  )
}

function PhaseRow({ label, score, max }) {
  return (
    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-gray-800 dark:text-gray-100">{label}</span>
        <span className="font-bold tabular-nums text-gray-800 dark:text-gray-100">
          {score}
          <span className="font-normal text-gray-400"> / {max}</span>
        </span>
      </div>
      <Meter score={score} max={max} />
    </div>
  )
}

/**
 * Final step of Verbal Certification — review the scorecard, add notes,
 * record an outcome, and sign off. Presentational only; VerbalCertPage owns
 * the state and the write path.
 */
export default function CertificationReview({
  traineeName,
  traineeId,
  store,
  phaseMax,
  scores,
  phase1Passed,
  phase1Notes,
  totalScore,
  maxScore,
  reviewNotes,
  onReviewNotesChange,
  outcome,
  onOutcomeChange,
  retrainAreas,
  onRetrainAreasChange,
  attested,
  onAttestedChange,
  certifierName,
  certifierEmpNum,
  saving,
  error,
  onSubmit,
}) {
  const pct = maxScore ? Math.round((totalScore / maxScore) * 100) : 0
  const canSubmit = phase1Passed !== null && attested && !saving

  const effects = useMemo(() => {
    if (outcome === 'certified') {
      return [
        'Signs the Certification shift — trainer and manager',
        'Marks training complete, 6 of 6 shifts',
        `Moves ${traineeName || 'this trainee'} off the active roster to Alumni`,
        "Saves the scorecard to the trainee's record",
      ]
    }
    return [
      'Leaves the Certification shift open for a re-take',
      'Flags the selected areas on the trainee card',
      `Keeps ${traineeName || 'this trainee'} on the active roster`,
      "Saves this attempt to the trainee's record",
    ]
  }, [outcome, traineeName])

  function toggleArea(key) {
    const next = retrainAreas.includes(key)
      ? retrainAreas.filter((a) => a !== key)
      : [...retrainAreas, key]
    onRetrainAreasChange(next)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800 dark:text-white">Review &amp; sign-off</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Check the scorecard, then record how {traineeName || 'the trainee'} did.
        </p>
      </div>

      {/* scorecard */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-4 py-4 flex items-baseline flex-wrap gap-x-4 gap-y-1 bg-gray-50 dark:bg-gray-900/40">
          <div className="text-3xl font-bold tabular-nums text-gray-800 dark:text-white">
            {totalScore}
            <span className="text-lg font-normal text-gray-400"> / {maxScore}</span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">{pct}%</div>
          <span
            className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${
              phase1Passed
                ? 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            }`}
          >
            {phase1Passed ? 'Phase 1 satisfactory' : 'Phase 1 needs improvement'}
          </span>
        </div>
        <PhaseRow label="Phase 2 — Local Options" score={scores.phase2} max={phaseMax.phase2} />
        <PhaseRow label="Phase 3 — Food Menu" score={scores.phase3} max={phaseMax.phase3} />
        <PhaseRow label="Phase 4 — Bar" score={scores.phase4} max={phaseMax.phase4} />
        <PhaseRow label="Phase 5 — Service" score={scores.phase5} max={phaseMax.phase5} />
      </div>

      {/* notes */}
      {phase1Notes ? (
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
            From Phase 1 — Training Review
          </div>
          <p className="rounded-r-lg border-l-4 border-green-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
            {phase1Notes}
          </p>
        </div>
      ) : null}

      <label className="block">
        <span className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
          Certification notes
        </span>
        <textarea
          rows={4}
          value={reviewNotes}
          onChange={(e) => onReviewNotesChange(e.target.value)}
          placeholder="What stood out, what to keep coaching, anything the next manager should know."
          className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-gray-100"
        />
        <span className="text-xs text-gray-500">
          Shows on the trainee card and in the printed summary.
        </span>
      </label>

      {/* outcome */}
      <div className="space-y-2">
        {[
          {
            value: 'certified',
            title: 'Certify — cleared to take tables',
            desc: 'Completes the Certification shift and closes out training.',
          },
          {
            value: 'needs_more_training',
            title: 'Needs more training',
            desc: 'Stays on the roster. Re-certify after another shift.',
          },
        ].map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer transition-colors ${
              outcome === opt.value
                ? 'border-green-700 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-400'
            }`}
          >
            <input
              type="radio"
              name="cert-outcome"
              value={opt.value}
              checked={outcome === opt.value}
              onChange={() => onOutcomeChange(opt.value)}
              className="mt-1 accent-green-700"
            />
            <span>
              <span className="block font-semibold text-gray-800 dark:text-gray-100">{opt.title}</span>
              <span className="block text-xs text-gray-500">{opt.desc}</span>
            </span>
          </label>
        ))}
      </div>

      {outcome === 'needs_more_training' && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
            Areas to retrain
          </div>
          <div className="flex flex-wrap gap-2">
            {RETRAIN_AREAS.map((a) => {
              const on = retrainAreas.includes(a.key)
              return (
                <button
                  key={a.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleArea(a.key)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    on
                      ? 'border-amber-500 bg-amber-50 font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {a.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* sign-off */}
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-3">
        <div className="text-xl italic text-gray-800 dark:text-gray-100" style={{ fontFamily: 'Georgia, serif' }}>
          {certifierName || 'Manager'}
        </div>
        <div className="text-xs text-gray-500">
          <div className="font-semibold text-gray-700 dark:text-gray-300">
            #{certifierEmpNum || '—'} · {store || '—'}
          </div>
          <div>
            {traineeName} · #{String(traineeId || '').replace(/^T-[^-]+-/, '')}
          </div>
        </div>
      </div>

      <label className="flex items-start gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => onAttestedChange(e.target.checked)}
          className="mt-1 accent-green-700"
        />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          I certified this trainee in person and the scores above reflect their answers.
        </span>
      </label>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className={`w-full min-h-[50px] rounded-xl font-bold text-white disabled:opacity-40 ${
          outcome === 'certified' ? 'bg-green-700 hover:bg-green-800' : 'bg-amber-600 hover:bg-amber-700'
        }`}
      >
        {saving
          ? 'Saving…'
          : outcome === 'certified'
            ? `Certify ${traineeName || 'trainee'}`
            : 'Save review — more training'}
      </button>

      <ul className="space-y-1.5">
        {effects.map((t) => (
          <li key={t} className="flex items-baseline gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-bold text-green-700">→</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
