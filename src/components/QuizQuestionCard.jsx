const LABELS = ['A', 'B', 'C', 'D']

export default function QuizQuestionCard({
  question, mode, showResult, chosen, eliminatedOptions,
  hintsRemaining, examHint, examHintLoading, socraticHint, socraticLoading,
  onUseHint, onRequestSocraticHint, onRequestExamHint,
  onSelectAnswer,
  flagPromptOpen, flagReason, flagSubmitting, flaggedQuestionIds, flagConfirmMsg, questionIndex,
  onSetFlagPromptOpen, onSetFlagReason, onFlagQuestion,
  onNext, onEndPractice, loadingNextPractice, isLastQuestion,
}) {
  const showExplanation = showResult
  return (
    <>
      <div className={`quiz-question-card rounded-xl border-2 p-6 shadow-sm ${question.isBonus ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-400' : 'glass'}`} style={!question.isBonus ? { borderColor: 'var(--hairline)' } : {}}>
        {question.isBonus && (
          <div className="flex items-center gap-2 mb-3">
            <span className="px-3 py-1 bg-amber-400 text-amber-900 rounded-full text-xs font-bold">
              BONUS QUESTION
            </span>
            <span className="text-xs text-gray-600">Extra credit — not required to pass</span>
          </div>
        )}
        <p className="mb-4 font-medium" style={{ color: 'var(--text-primary)' }}>{question.q}</p>
        {mode === 'official' ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--color-primary)] text-sm text-[var(--color-primary)] font-medium hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={onRequestExamHint}
              disabled={showExplanation || examHintLoading || (hintsRemaining != null && hintsRemaining <= 0)}
            >
              {examHintLoading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5 align-middle" aria-hidden />
                  <span>Loading…</span>
                </>
              ) : (
                `💡 Get a Hint (${hintsRemaining ?? 0} remaining)`
              )}
            </button>
          </div>
        ) : (
          (hintsRemaining === null || hintsRemaining > 0) && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--color-primary)] text-sm text-[var(--color-primary)] font-medium hover:bg-green-50 disabled:opacity-50 transition-colors"
                onClick={onUseHint}
                disabled={showExplanation}
              >
                💡 Eliminate wrong answer
              </button>
              <button
                type="button"
                className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--color-primary)] text-sm text-[var(--color-primary)] font-medium hover:bg-green-50 disabled:opacity-50 transition-colors"
                onClick={onRequestSocraticHint}
                disabled={showExplanation || socraticLoading}
              >
                {socraticLoading ? '…' : '💬 AI hint'}
              </button>
            </div>
          )
        )}
        {examHint && mode === 'official' && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-300 p-3 text-sm text-amber-900" role="alert">
            <strong>Hint:</strong> {examHint}
          </div>
        )}
        {socraticHint && mode === 'practice' && (
          <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-gray-800">
            <strong>Hint:</strong> {socraticHint}
          </div>
        )}
        <div className="space-y-2">
          {(question.opts || []).map((opt, i) => {
            const eliminated = eliminatedOptions.has(i)
            let bg = 'hover:bg-gray-100 border-gray-200'
            if (eliminated) bg = 'border-gray-200 opacity-60 cursor-default'
            if (showExplanation) {
              if (i === question.ans) bg = 'bg-green-100 border-green-500'
              else if (i === chosen) bg = 'bg-red-100 border-red-500'
            }
            return (
              <button
                key={i}
                type="button"
                className={`quiz-option w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${bg}`}
                onClick={() => !eliminated && onSelectAnswer(i)}
                disabled={showExplanation || eliminated}
              >
                <span className="font-semibold">{LABELS[i]}.</span> {opt}
                {eliminated && <span className="ml-2 text-gray-500 text-sm">(eliminated)</span>}
              </button>
            )
          })}
        </div>
        {showExplanation && question.exp && (
          <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--text-secondary)' }}>
            <strong>Explanation:</strong> {question.exp}
          </div>
        )}
        {showExplanation && !flaggedQuestionIds.has(question.cardId || questionIndex) && (
          <div className="mt-3">
            {!flagPromptOpen ? (
              <button
                type="button"
                className="text-xs text-red-500 hover:text-red-700 underline"
                onClick={() => onSetFlagPromptOpen(true)}
              >
                Flag this question
              </button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-800 mb-2">Why is this question wrong?</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['Wrong answer', 'Bad question', 'Typo', 'Outdated info'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`px-2.5 py-1 text-xs rounded-full border transition ${flagReason === r ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-300 hover:bg-red-100'}`}
                      onClick={() => onSetFlagReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg mb-2"
                  placeholder="Or type your own reason…"
                  value={flagReason}
                  onChange={(e) => onSetFlagReason(e.target.value)}
                  maxLength={200}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                    onClick={() => onFlagQuestion(flagReason)}
                    disabled={!flagReason.trim() || flagSubmitting}
                  >
                    {flagSubmitting ? 'Submitting…' : 'Submit Flag'}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                    onClick={() => { onSetFlagPromptOpen(false); onSetFlagReason('') }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {showExplanation && flaggedQuestionIds.has(question.cardId || questionIndex) && (
          <p className="mt-3 text-xs text-green-700">Question flagged for review.</p>
        )}
        {flagConfirmMsg && (
          <p className="mt-2 text-xs text-green-700 font-medium">{flagConfirmMsg}</p>
        )}
      </div>
      {showExplanation && (
        <div className="mt-6 flex justify-center gap-3 flex-wrap">
          <button type="button" className="btn" onClick={onNext} disabled={loadingNextPractice}>
            {loadingNextPractice ? 'Loading…' : mode === 'practice' ? 'Next Question →' : (isLastQuestion ? 'See Results' : 'Next Question →')}
          </button>
          {mode === 'practice' && (
            <button type="button" className="btn btn-secondary" onClick={onEndPractice}>
              End practice
            </button>
          )}
        </div>
      )}
    </>
  )
}
