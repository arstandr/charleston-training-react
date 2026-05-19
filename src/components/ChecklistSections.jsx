import React, { useState, useEffect, useRef } from 'react';

// ─── Custom Checkbox ─────────────────────────────────────
function ThumbsUpSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 20h2c.55 0 1-.45 1-1v-9c0-.55-.45-1-1-1H2v11zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66a4.8 4.8 0 00-.88-1.12L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83v7.84C7 18.95 8.05 20 9.34 20h8.11c.7 0 1.36-.37 1.72-.97l2.66-6.15z"/>
    </svg>
  );
}

function ThumbsDownSvg({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 4h-2c-.55 0-1 .45-1 1v9c0 .55.45 1 1 1h2V4zM2.17 11.12c-.11.25-.17.52-.17.8V13c0 1.1.9 2 2 2h5.5l-.92 4.65c-.05.22-.02.46.08.66.23.4.53.77.88 1.12L10 22l6.41-6.41c.38-.38.59-.89.59-1.42V6.34C17 5.05 15.95 4 14.66 4h-8.1c-.71 0-1.36.37-1.72.97L2.17 11.12z"/>
    </svg>
  );
}

function CheckItem({ item, checked, onChange, disabled, exerciseDisabled, onOpenExercise, isExerciseComplete, onOpenFlashcards, openExercise }) {
  const isDiscuss = item.discuss;
  const exId = item.exerciseId || item.linkedExercise;
  const hasExercise = !!exId;
  const hasFlashcards = !!item.linkedFlashcards;
  const exerciseDone = hasExercise && isExerciseComplete && isExerciseComplete(exId);

  return (
    <div
      className={`flex items-center gap-3 min-h-[52px] px-4 py-3 rounded-xl transition-all duration-200 select-none ${
        disabled ? 'opacity-70' : ''
      } ${
        checked
          ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-600'
          : isDiscuss
            ? 'bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700'
            : hasExercise
              ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700'
              : hasFlashcards
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-700'
                : 'bg-white dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600'
      }`}
    >
      {/* Thumbs up / thumbs down buttons */}
      <button
        type="button"
        onClick={() => !disabled && onChange()}
        disabled={disabled}
        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200 active:scale-90 ${
          checked
            ? 'bg-green-500 text-white'
            : 'bg-gray-100 dark:bg-gray-600 text-gray-400 dark:text-gray-500 hover:bg-green-100 hover:text-green-500'
        }`}
        title="Mark complete"
      >
        <ThumbsUpSvg className="w-5 h-5" />
      </button>

      <div className="flex-1 min-w-0">
        <span
          className={`text-sm leading-relaxed ${
            checked
              ? 'text-green-700 dark:text-green-400 line-through'
              : 'text-gray-800 dark:text-gray-200'
          } ${isDiscuss && !checked ? 'font-bold' : ''}`}
        >
          {item.text}
        </span>
        {isDiscuss && !checked && (
          <span className="ml-2 text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
            Discuss
          </span>
        )}
      </div>

      {hasFlashcards && onOpenFlashcards && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenFlashcards(item.linkedFlashcards)
          }}
          className="flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-full active:scale-95 transition-all shadow-sm bg-indigo-500 text-white hover:bg-indigo-600"
        >
          Study
        </button>
      )}
      {hasExercise && !exerciseDisabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenExercise?.(exId)
          }}
          className={`ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all border-2 ${
            openExercise === exId
              ? 'bg-green-600 text-white border-green-600'
              : isExerciseComplete?.(exId)
              ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-600'
              : 'bg-white text-green-700 border-green-400 hover:bg-green-50 dark:bg-gray-700 dark:text-green-300 dark:border-green-500 dark:hover:bg-green-900/20'
          }`}
        >
          {isExerciseComplete?.(exId) ? '✓ Done' : '▼ Exercise'}
        </button>
      )}
    </div>
  );
}

// ─── Collapsible Section ─────────────────────────────────
function ChecklistSection({
  section,
  sectionIndex,
  checkedItems,
  onToggleItem,
  comments,
  onCommentChange,
  disabled,
  defaultExpanded = true,
  onOpenExercise,
  isExerciseComplete,
  onOpenFlashcards,
  openExercise,
}) {
  const totalItems = section.items?.length || 0;
  const checkedCount = section.items?.filter((item) => checkedItems[item.id])?.length || 0;
  const isComplete = totalItems > 0 && checkedCount === totalItems;
  const progress = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0;

  const [expanded, setExpanded] = useState(defaultExpanded && !isComplete);
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, checkedItems, comments]);

  // Auto-collapse when complete
  useEffect(() => {
    if (isComplete) setExpanded(false);
  }, [isComplete]);

  return (
    <div
      className={`rounded-xl border-2 transition-all duration-300 overflow-hidden ${
        isComplete
          ? 'border-green-200 dark:border-green-600 bg-green-50/30 dark:bg-green-900/20'
          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/50'
      }`}
    >
      {/* Section Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-600/30 transition-colors"
      >
        {/* Completion Badge */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
            isComplete ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
          }`}
        >
          {isComplete ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <span className="text-xs font-bold">
              {checkedCount}/{totalItems}
            </span>
          )}
        </div>

        {/* Title & Subtitle */}
        <div className="flex-1 min-w-0">
          <h3
            className={`font-bold text-sm ${
              isComplete ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-white'
            }`}
          >
            {section.title}
          </h3>
          {(section.subtitle || section.help || section.description) && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {section.subtitle || section.help || section.description}
            </p>
          )}
        </div>

        {/* Expand Arrow */}
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-300 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Progress Bar */}
      {totalItems > 0 && (
        <div className="px-4 pb-2">
          <div className="h-1.5 bg-gray-100 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                isComplete ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Expandable Content */}
      <div
        style={{
          maxHeight: expanded ? `${contentHeight + 100}px` : '0px',
          opacity: expanded ? 1 : 0,
          transition: 'max-height 0.35s ease, opacity 0.25s ease',
        }}
        className="overflow-hidden"
      >
        <div ref={contentRef} className="px-4 pb-4">
          {/* Checklist Items */}
          <div className="space-y-1">
            {section.items?.map((item) => (
              <CheckItem
                key={item.id}
                item={item}
                checked={!!checkedItems[item.id]}
                onChange={() => onToggleItem(item.id)}
                disabled={disabled}
                exerciseDisabled={false}
                onOpenExercise={onOpenExercise}
                isExerciseComplete={isExerciseComplete}
                onOpenFlashcards={onOpenFlashcards}
                openExercise={openExercise}
              />
            ))}
          </div>

          {/* Trainer Notes */}
          {section.hasComments && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Trainer Notes
              </label>
              <textarea
                value={comments || ''}
                onChange={(e) => onCommentChange(e.target.value)}
                placeholder="Notes, observations, areas to improve..."
                disabled={disabled}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-300 dark:focus:border-blue-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                rows={2}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Performance Appraisal Tab ───────────────────────────
function PerformanceAppraisal({
  template,
  ratings,
  onRatingChange,
  goals,
  onGoalChange,
  appraisalComments,
  onAppraisalCommentsChange,
  disabled,
}) {
  if (!template.appraisalCategories) return null;

  const ratingLabels = {
    1: { text: 'Far Below Standard', color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300' },
    2: {
      text: 'Below Standard',
      color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300',
    },
    3: {
      text: 'Meets Standard',
      color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300',
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Server Performance Appraisal</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{template.appraisalNote}</p>
        {template.appraisalSignOffNote && (
          <p className="text-xs text-red-600 dark:text-red-400 font-semibold mt-2 px-4">
            *{template.appraisalSignOffNote}*
          </p>
        )}
      </div>

      {/* Rating Grid */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
        {/* Column Headers */}
        <div className="grid grid-cols-4 gap-0 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600 text-xs font-bold text-center">
          <div className="p-3 text-left text-gray-700 dark:text-gray-300">Item</div>
          <div className="p-3 text-red-600 dark:text-red-400">1</div>
          <div className="p-3 text-amber-600 dark:text-amber-400">2</div>
          <div className="p-3 text-green-600 dark:text-green-400">3</div>
        </div>
        <div className="grid grid-cols-4 gap-0 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600 text-[10px] text-center text-gray-500 dark:text-gray-400">
          <div className="px-3 pb-2 text-left"></div>
          <div className="px-3 pb-2">Far Below</div>
          <div className="px-3 pb-2">Below</div>
          <div className="px-3 pb-2">Meets</div>
        </div>

        {/* Rating Rows */}
        {template.appraisalCategories.map((category, idx) => {
          const currentRating = ratings?.[category] || 0;
          return (
            <div
              key={category}
              className={`grid grid-cols-4 gap-0 items-center border-b border-gray-100 dark:border-gray-600 last:border-0 ${
                idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-700/30'
              }`}
            >
              <div className="p-3 text-sm font-medium text-gray-800 dark:text-gray-200">{category}</div>
              {[1, 2, 3].map((score) => (
                <div key={score} className="p-2 flex justify-center">
                  <button
                    onClick={() => !disabled && onRatingChange(category, score)}
                    disabled={disabled}
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-200 ${
                      currentRating === score
                        ? ratingLabels[score].color
                        : 'border-gray-200 dark:border-gray-500 text-gray-300 dark:text-gray-500 hover:border-gray-400 hover:text-gray-500 dark:hover:text-gray-300'
                    }`}
                  >
                    {score}
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Average Score */}
      {template.appraisalCategories.length > 0 && (
        <div className="text-center">
          {(() => {
            const ratedCategories = template.appraisalCategories.filter((c) => ratings?.[c] > 0);
            if (ratedCategories.length === 0) return null;
            const avg =
              ratedCategories.reduce((sum, c) => sum + ratings[c], 0) / ratedCategories.length;
            return (
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
                  avg >= 2.5
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                    : avg >= 1.5
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                    : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                }`}
              >
                Average: {avg.toFixed(1)} / 3.0
                <span className="text-xs font-normal">
                  ({ratedCategories.length}/{template.appraisalCategories.length} rated)
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Developmental Goals */}
      <div className="space-y-3">
        <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300">Developmental Goals</h4>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 w-4">#{i + 1}</span>
            <input
              type="text"
              value={goals?.[i] || ''}
              onChange={(e) => onGoalChange(i, e.target.value)}
              placeholder={`Developmental Goal #${i + 1}`}
              disabled={disabled}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-300 dark:focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        ))}
      </div>

      {/* Comments */}
      <div>
        <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-2">Comments</h4>
        <textarea
          value={appraisalComments || ''}
          onChange={(e) => onAppraisalCommentsChange(e.target.value)}
          placeholder="Additional comments about trainee performance..."
          disabled={disabled}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-300 dark:focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          rows={4}
        />
      </div>

      {/* Manager Note */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-200">
        <strong>Managers:</strong> Please verify checklist is complete for this shift and spot check the
        Trainee&apos;s knowledge using the bold and italicized items from the checklist.
      </div>
    </div>
  );
}

// ─── 7 Steps of Service Box ──────────────────────────────
function SevenStepsBox({ steps, traineeAnswers, onAnswerChange, disabled }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 p-4">
      <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-3">7 Steps of Service</h3>
      <div className="space-y-2">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className="text-xs font-bold text-gray-400 mt-2 w-4">{idx + 1}.</span>
            <input
              type="text"
              value={traineeAnswers?.[idx] || ''}
              onChange={(e) => onAnswerChange(idx, e.target.value)}
              placeholder={step}
              disabled={disabled}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-300 dark:focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sign-Off Section ────────────────────────────────────
function SignOffSection({
  signOffs,
  onSignOff,
  shiftDate,
  onShiftDateChange,
  amPm,
  onAmPmChange,
  disabled,
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Shift Sign-Off</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          All parties confirm the checklist and appraisal are complete.
        </p>
      </div>

      {/* Shift Date */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Shift Date:</label>
        <input
          type="date"
          value={shiftDate || ''}
          onChange={(e) => onShiftDateChange(e.target.value)}
          disabled={disabled}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        <div className="flex gap-2">
          {['AM', 'PM'].map((label) => (
            <button
              key={label}
              onClick={() => !disabled && onAmPmChange(label)}
              disabled={disabled}
              className={`px-3 py-2 text-sm font-semibold rounded-lg border-2 transition-all ${
                amPm === label
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Signature Cards */}
      {[
        { role: 'trainer', label: 'Trainer Signature', icon: '👨‍🏫' },
        { role: 'trainee', label: 'Trainee Signature', icon: '🎓' },
        { role: 'manager', label: 'Manager Signature', icon: '👔' },
      ].map(({ role, label, icon }) => {
        const signOff = signOffs?.[role];
        return (
          <div
            key={role}
            className={`rounded-xl border-2 p-4 transition-all ${
              signOff?.signed
                ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{icon}</span>
                <div>
                  <h4 className="font-bold text-sm text-gray-900 dark:text-white">{label}</h4>
                  {signOff?.signed && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Signed by {signOff.name} · {new Date(signOff.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              {signOff?.signed ? (
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <button
                  onClick={() => onSignOff(role)}
                  disabled={disabled}
                  className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sign Off
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Exercise Components ─────────────────────────────────
function ExerciseSection({ exercise, exerciseData, onExerciseDataChange, disabled }) {
  if (!exercise) return null;

  if (exercise.type === 'wine_checklist') {
    return (
      <div className="space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white">{exercise.title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{exercise.instructions}</p>
        {exercise.hasWineBottleField && (
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Wine Bottle Presented:</label>
            <input
              type="text"
              value={exerciseData?.wineBottle || ''}
              onChange={(e) => onExerciseDataChange({ ...exerciseData, wineBottle: e.target.value })}
              placeholder="e.g. 2019 Caymus Cabernet Sauvignon"
              disabled={disabled}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        )}
        <div className="space-y-1">
          {exercise.wineItems.map((item, idx) => (
            <label
              key={idx}
              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                exerciseData?.wineChecks?.[idx] ? 'bg-green-50 dark:bg-green-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-600/30'
              } ${disabled ? 'pointer-events-none opacity-70' : ''}`}
            >
              <div className="mt-0.5 flex-shrink-0">
                <div
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                    exerciseData?.wineChecks?.[idx] ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700'
                  }`}
                >
                  {exerciseData?.wineChecks?.[idx] && (
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
                  checked={!!exerciseData?.wineChecks?.[idx]}
                  onChange={() => {
                    const newChecks = { ...(exerciseData?.wineChecks || {}) };
                    newChecks[idx] = !newChecks[idx];
                    onExerciseDataChange({ ...exerciseData, wineChecks: newChecks });
                  }}
                  disabled={disabled}
                  className="sr-only"
                />
              </div>
              <span
                className={`text-sm ${
                  exerciseData?.wineChecks?.[idx] ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'
                }`}
              >
                {item}
              </span>
            </label>
          ))}
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Comments</label>
          <textarea
            value={exerciseData?.comments || ''}
            onChange={(e) => onExerciseDataChange({ ...exerciseData, comments: e.target.value })}
            placeholder="Notes on wine service performance..."
            disabled={disabled}
            className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            rows={3}
          />
        </div>
      </div>
    );
  }

  if (exercise.type === 'bullet_notes') {
    return (
      <div className="space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white">{exercise.title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{exercise.instructions}</p>
        {exercise.trainerNote && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
            <strong>Trainer:</strong> {exercise.trainerNote}
          </div>
        )}
        <textarea
          value={exerciseData?.notes || ''}
          onChange={(e) => onExerciseDataChange({ ...exerciseData, notes: e.target.value })}
          placeholder="Write greet notes, feedback, and improvement suggestions here..."
          disabled={disabled}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          rows={10}
        />
        <div>
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Manager Greeted:</label>
          <input
            type="text"
            value={exerciseData?.managerGreeted || ''}
            onChange={(e) => onExerciseDataChange({ ...exerciseData, managerGreeted: e.target.value })}
            placeholder="Manager name"
            disabled={disabled}
            className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>
    );
  }

  if (exercise.type === 'upselling_matching') {
    return (
      <div className="space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white">{exercise.title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{exercise.instructions}</p>
        <div className="space-y-3">
          {exercise.questions.map((q, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4"
            >
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">{q.question}</p>
              <input
                type="text"
                value={exerciseData?.answers?.[idx] || ''}
                onChange={(e) => {
                  const newAnswers = { ...(exerciseData?.answers || {}) };
                  newAnswers[idx] = e.target.value;
                  onExerciseDataChange({ ...exerciseData, answers: newAnswers });
                }}
                placeholder="Answer..."
                disabled={disabled}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              {exerciseData?.showAnswers && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-semibold">✓ {q.answer}</p>
              )}
            </div>
          ))}
        </div>
        {!disabled && (
          <button
            onClick={() => onExerciseDataChange({ ...exerciseData, showAnswers: !exerciseData?.showAnswers })}
            className="text-sm text-blue-600 dark:text-blue-400 font-semibold hover:text-blue-700 dark:hover:text-blue-300"
          >
            {exerciseData?.showAnswers ? 'Hide Answers' : 'Show Answers'}
          </button>
        )}
      </div>
    );
  }

  return null;
}

// ─── Service Review Questions ────────────────────────────
function ServiceReviewSection({ questions, answers, onAnswerChange, disabled }) {
  if (!questions) return null;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold text-gray-900 dark:text-white">Service Review Points</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Manager uses these to spot-check trainee knowledge
        </p>
      </div>
      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4"
          >
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
              {idx + 1}. {q}
            </p>
            <textarea
              value={answers?.[idx] ?? ''}
              onChange={(e) => onAnswerChange(idx, e.target.value)}
              placeholder="Trainee's response..."
              disabled={disabled}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              rows={2}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────
export {
  ChecklistSection,
  PerformanceAppraisal,
  SevenStepsBox,
  SignOffSection,
  ExerciseSection,
  ServiceReviewSection,
  CheckItem,
};
export default ChecklistSection;
