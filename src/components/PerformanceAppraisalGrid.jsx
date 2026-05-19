import React from 'react'

const APPRAISAL_ITEMS_BY_SHIFT = {
  follow: ['Greet Times','Beverage Service','Sidework','Running Food','Weaving','Perfect Pre-bus','Sense of Urgency','Personality/Attitude','Teamwork','Silent Service','Tile Talk','Timing Courses','Uniform'],
  rev1:   ['Greet Times','Beverage Service','Sidework','Running Food','Weaving','Perfect Pre-bus','Sense of Urgency','Personality/Attitude','Teamwork','Check Presentation','POS Knowledge','Liquor Knowledge','Uniform'],
  rev2:   ['Greet Times','Beverage Service','Sidework','Running Food','Weaving','Perfect Pre-bus','Sense of Urgency','Team Greets','Personality/Attitude','Teamwork','Full Hands In/Out','Liquor Knowledge','Uniform'],
  rev3:   ['Greet Times','Beverage Service','Sidework','Running Food','Weaving','Perfect Pre-bus','Sense of Urgency','Tile Talk','Personality/Attitude','Teamwork','Upselling','Liquor Knowledge','Uniform'],
  rev4:   ['Greet Times','Beverage Service','Sidework','Running Food','Weaving','Perfect Pre-bus','Sense of Urgency','Tile Talk','Personality/Attitude','Teamwork','Upselling','Liquor Knowledge','Uniform'],
}

const DEFAULT_ITEMS = ['Greet Times','Beverage Service','Sidework','Running Food','Weaving','Perfect Pre-bus','Sense of Urgency','Personality/Attitude','Teamwork','Uniform']

export function getAppraisalItems(shiftType) {
  return APPRAISAL_ITEMS_BY_SHIFT[shiftType] || DEFAULT_ITEMS
}

const RATING_META = {
  '1': { label: 'Far Below', color: 'bg-red-500 border-red-500 text-white', light: 'bg-red-50 border-red-200', headerBg: 'bg-red-500', headerText: 'text-white' },
  '2': { label: 'Below', color: 'bg-amber-400 border-amber-400 text-white', light: 'bg-amber-50 border-amber-200', headerBg: 'bg-amber-400', headerText: 'text-white' },
  '3': { label: 'Meets Std', color: 'bg-green-500 border-green-500 text-white', light: 'bg-green-50 border-green-200', headerBg: 'bg-green-500', headerText: 'text-white' },
}

export default function PerformanceAppraisalGrid({ shiftType, ratings = {}, onChange, disabled }) {
  const items = APPRAISAL_ITEMS_BY_SHIFT[shiftType] || DEFAULT_ITEMS
  const update = (key, val) => onChange({ ...ratings, [key]: val })

  const ratedCount = items.filter((item) => {
    const key = item.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
    return !!ratings[key]
  }).length

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Title bar */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <h4 className="text-base font-bold text-white">Performance Appraisal</h4>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          ratedCount === items.length ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-300'
        }`}>
          {ratedCount}/{items.length}
        </span>
      </div>

      {/* Grid table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          {/* Column headers */}
          <thead>
            <tr>
              <th className="text-left px-4 py-3 text-sm font-bold text-gray-500 uppercase tracking-wide border-b-2 border-gray-200 bg-gray-50 w-1/2">
                Category
              </th>
              {['1','2','3'].map((opt) => {
                const meta = RATING_META[opt]
                return (
                  <th key={opt} className="px-2 py-3 border-b-2 border-gray-200 bg-gray-50 text-center" style={{ minWidth: 90 }}>
                    <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${meta.headerBg} ${meta.headerText} text-lg font-bold mb-1`}>
                      {opt}
                    </div>
                    <div className="text-xs font-semibold text-gray-500">{meta.label}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const key = item.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
              const val = ratings[key]
              const isRated = !!val
              return (
                <tr key={key} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'} ${isRated ? '' : ''}`}>
                  <td className={`px-4 py-3 text-base font-semibold border-b border-gray-100 ${isRated ? 'text-gray-800' : 'text-gray-600'}`}>
                    {item}
                    {!isRated && <span className="ml-1.5 text-amber-500 text-sm">*</span>}
                  </td>
                  {['1','2','3'].map((opt) => {
                    const meta = RATING_META[opt]
                    const isSelected = val === opt
                    return (
                      <td key={opt} className="px-2 py-3 text-center border-b border-gray-100">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => update(key, opt)}
                          className={`w-full max-w-[80px] mx-auto h-14 rounded-xl text-xl font-bold border-2 transition-all duration-200 active:scale-90 disabled:cursor-not-allowed ${
                            isSelected
                              ? meta.color
                              : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
                          }`}
                        >
                          {isSelected ? '✓' : opt}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      {ratedCount > 0 && (
        <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Average: <span className="font-bold text-gray-800">
              {(items.reduce((sum, item) => {
                const key = item.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
                return sum + (parseInt(ratings[key], 10) || 0)
              }, 0) / ratedCount).toFixed(1)}
            </span> / 3.0
          </span>
          <div className="flex gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
              {items.filter((i) => ratings[i.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()] === '1').length}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
              {items.filter((i) => ratings[i.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()] === '2').length}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
              {items.filter((i) => ratings[i.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()] === '3').length}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
