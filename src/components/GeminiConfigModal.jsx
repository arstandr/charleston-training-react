import { useState, useEffect } from 'react'
import { useGemini } from '../contexts/GeminiContext'

export default function GeminiConfigModal({ isOpen, onClose }) {
  const { saveApiKey, validateKey, apiKey: currentKey } = useGemini()
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (isOpen) {
      setKey(currentKey || '')
      setError('')
      setSuccess('')
    }
  }, [isOpen, currentKey])

  if (!isOpen) return null

  async function handleTest() {
    if (!key.trim()) {
      setError('Please enter an API key')
      return
    }
    setTesting(true)
    setError('')
    setSuccess('')
    try {
      const result = await validateKey(key)
      if (result.valid) {
        setSuccess('API key is valid.')
      } else {
        setError(result.error || 'Validation failed')
      }
    } catch (err) {
      setError('Test failed: ' + err.message)
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!key.trim()) {
      setError('Please enter an API key')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const result = await saveApiKey(key)
      if (result.success) {
        setSuccess('API key saved.')
        setTimeout(() => onClose(), 1500)
      } else {
        setError(result.error || 'Failed to save')
      }
    } catch (err) {
      setError('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Gemini AI Configuration</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Google Gemini API Key
            </label>
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Get your key from{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Google AI Studio
              </a>
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {success}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !key.trim()}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {testing ? 'Testing…' : 'Test Key'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !key.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Saving…' : 'Save Key'}
            </button>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">What does Gemini AI do?</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Generate quiz questions from flashcards</li>
            <li>• Suggest new training content</li>
            <li>• Analyze menu items for training</li>
            <li>• Smart search across content</li>
            <li>• Identify knowledge gaps</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
