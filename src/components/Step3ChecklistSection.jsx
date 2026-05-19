/**
 * Step 3 — Performance Appraisal. Trainer-only. Saves to shift doc as step3Checklist.
 */
import React, { useState } from 'react'

const RATING_OPTIONS = [
  { value: '1', label: '1 — Far Below Standard' },
  { value: '2', label: '2 — Below Standard' },
  { value: '3', label: '3 — Meets Standard' },
]

const EXERCISE_RATING_OPTIONS = [
  { value: '1', label: 'Far Below Standards' },
  { value: '2', label: 'Below Standards' },
  { value: '3', label: 'Meets Standards' },
]

const APPRAISAL_ITEMS_BY_SHIFT = {
  follow: [
    'Greet Times', 'Beverage Service', 'Sidework', 'Running Food', 'Weaving',
    'Perfect Pre-bus', 'Sense of Urgency', 'Personality/Attitude', 'Teamwork',
    'Silent Service', 'Tile Talk', 'Timing Courses', 'Uniform',
  ],
  rev1: [
    'Greet Times', 'Beverage Service', 'Sidework', 'Running Food', 'Weaving',
    'Perfect Pre-bus', 'Sense of Urgency', 'Personality/Attitude', 'Teamwork',
    'Check Presentation', 'POS Knowledge', 'Liquor Knowledge', 'Uniform',
  ],
  rev2: [
    'Greet Times', 'Beverage Service', 'Sidework', 'Running Food', 'Weaving',
    'Perfect Pre-bus', 'Sense of Urgency', 'Team Greets', 'Personality/Attitude',
    'Teamwork', 'Full Hands In/Out', 'Liquor Knowledge', 'Uniform',
  ],
  rev3: [
    'Greet Times', 'Beverage Service', 'Sidework', 'Running Food', 'Weaving',
    'Perfect Pre-bus', 'Sense of Urgency', 'Tile Talk', 'Personality/Attitude',
    'Teamwork', 'Upselling', 'Liquor Knowledge', 'Uniform',
  ],
  rev4: [
    'Greet Times', 'Beverage Service', 'Sidework', 'Running Food', 'Weaving',
    'Perfect Pre-bus', 'Sense of Urgency', 'Tile Talk', 'Personality/Attitude',
    'Teamwork', 'Upselling', 'Liquor Knowledge', 'Uniform',
  ],
}

const DEFAULT_APPRAISAL_ITEMS = [
  'Greet Times', 'Beverage Service', 'Sidework', 'Running Food', 'Weaving',
  'Perfect Pre-bus', 'Sense of Urgency', 'Personality/Attitude', 'Teamwork', 'Uniform',
]

const STEP3_STEPS = [
  { key: 'step1', label: '1. Greet & Seat' },
  { key: 'step2', label: '2. Drink Order' },
  { key: 'step3', label: '3. Appetizer / Bread' },
  { key: 'step4', label: '4. Entree Order' },
  { key: 'step5', label: '5. Entree Delivery' },
  { key: 'step6', label: '6. Check Back' },
  { key: 'step7', label: '7. Dessert / Close' },
]

function RatingSelect({ value, onChange, disabled, options = RATING_OPTIONS }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
    >
      <option value="">Select rating…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function SectionHeader({ title }) {
  return (
    <h4 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600 pb-1 mb-3">{title}</h4>
  )
}

export default function Step3ChecklistSection({ notes = {}, onNotesChange, disabled, completed, completedAt, completedBy, shiftType }) {
  const update = (key, value) => onNotesChange({ ...notes, [key]: value })

  return (
    <div className="space-y-6">

      {/* 7 Steps of Service Notes */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6">
        <SectionHeader title="7 Steps of Service — Trainer Notes" />
        <div className="space-y-3">
          {STEP3_STEPS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</label>
              <textarea
                value={notes[key] ?? ''}
                onChange={(e) => update(key, e.target.value)}
                placeholder="How did the trainee perform on this step?"
                rows={2}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Practice Exercises */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6">
        <SectionHeader title="Practice Exercises" />
        <div className="space-y-5">
          {[
            { key: 'practiceGreet', label: 'Practice Greet' },
            { key: 'wineOpening', label: 'Wine Opening Exercise' },
          ].map(({ key, label }) => (
            <div key={key} className="rounded-lg border border-gray-100 dark:border-gray-700 p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</p>
              <RatingSelect
                value={notes[`${key}Rating`]}
                onChange={(v) => update(`${key}Rating`, v)}
                disabled={disabled}
                options={EXERCISE_RATING_OPTIONS}
              />
              <textarea
                value={notes[`${key}Feedback`] ?? ''}
                onChange={(e) => update(`${key}Feedback`, e.target.value)}
                placeholder="Feedback / notes…"
                rows={2}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Performance Appraisal */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6">
        <SectionHeader title="Performance Appraisal (1–3)" />
        <div className="mb-3 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>1 = Far Below Standard</span>
          <span>2 = Below Standard</span>
          <span>3 = Meets Standard</span>
        </div>
        <div className="space-y-3">
          {(APPRAISAL_ITEMS_BY_SHIFT[shiftType] || DEFAULT_APPRAISAL_ITEMS).map((item) => {
            const key = item.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-48 text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">{item}</span>
                <div className="flex gap-2">
                  {RATING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => update(`appraisal_${key}`, opt.value)}
                      className={`w-10 h-10 rounded-lg text-sm font-bold border-2 transition-colors disabled:cursor-not-allowed ${
                        notes[`appraisal_${key}`] === opt.value
                          ? opt.value === '1'
                            ? 'bg-red-500 border-red-500 text-white'
                            : opt.value === '2'
                            ? 'bg-amber-400 border-amber-400 text-white'
                            : 'bg-green-500 border-green-500 text-white'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {opt.value}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Strengths & Opportunities */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6">
        <SectionHeader title="Strengths & Opportunities" />
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Strengths</label>
            <textarea
              value={notes.strengths ?? ''}
              onChange={(e) => update('strengths', e.target.value)}
              placeholder="What did the trainee do well?"
              rows={3}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Opportunities</label>
            <textarea
              value={notes.opportunities ?? ''}
              onChange={(e) => update('opportunities', e.target.value)}
              placeholder="What needs improvement?"
              rows={3}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Developmental Goals */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6">
        <SectionHeader title="Developmental Goals for Next Shift" />
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-start gap-3">
              <span className="mt-2.5 text-sm font-bold text-gray-500 w-4 shrink-0">{n}.</span>
              <input
                type="text"
                value={notes[`goal${n}`] ?? ''}
                onChange={(e) => update(`goal${n}`, e.target.value)}
                placeholder={`Goal ${n}…`}
                disabled={disabled}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Overall Comments */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6">
        <SectionHeader title="Overall Comments" />
        <textarea
          value={notes.overallComments ?? ''}
          onChange={(e) => update('overallComments', e.target.value)}
          placeholder="General trainer notes and observations…"
          rows={4}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {completed && completedAt && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Completed {new Date(completedAt).toLocaleString()}
          {completedBy && ` by ${completedBy}`}
        </p>
      )}
    </div>
  )
}
