import { useState } from 'react'
import { setToastCredentials } from '../../services/toast'

export default function ToastConfigModal({ onClose }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [adminCode, setAdminCode] = useState('0304')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSave() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Client ID and Client Secret are required.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const result = await setToastCredentials({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        adminCode: adminCode.trim(),
      })
      if (result.success) {
        setSuccess(result.message || 'Toast credentials saved.')
        setClientId('')
        setClientSecret('')
        setTimeout(onClose, 1500)
      } else {
        setError(result.error || 'Failed to save')
      }
    } catch (err) {
      setError(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Configure Toast POS</h2>
        <p className="text-sm text-gray-600 mb-4">
          Client ID and Secret are used for all Toast API calls. Leave blank to keep current values.
        </p>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
            <input
              type="text"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Toast API Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Toast API Client Secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin code</label>
            <input
              type="text"
              autoComplete="off"
              className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {success && <p className="text-sm text-green-600 mb-2">{success}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !clientId.trim() || !clientSecret.trim()}
            className="flex-1 px-4 py-3 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save credentials'}
          </button>
        </div>
      </div>
    </div>
  )
}
