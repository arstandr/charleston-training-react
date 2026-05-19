import { getStoreDisplayName } from '../../constants'

/** Global store filter — shows display names, values are internal keys */
export default function StoreFilter({ stores, value, onChange }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-sm text-gray-600 font-medium">Store:</span>
      <select
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All stores (Company)</option>
        {(stores || []).map((s) => (
          <option key={s} value={s}>{getStoreDisplayName(s)}</option>
        ))}
      </select>
    </label>
  )
}
