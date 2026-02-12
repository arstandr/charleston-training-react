import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { validateEmployeeNumber } from '../utils/helpers'

const REMEMBER_KEY = 'loginRememberEmp'
const REMEMBER_DAYS = 30

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [empNum, setEmpNum] = useState(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY)
      if (saved) {
        const { value, expires } = JSON.parse(saved)
        if (expires && Date.now() < expires) return value || ''
      }
    } catch (_) {}
    return ''
  })
  const [remember, setRemember] = useState(!!localStorage.getItem(REMEMBER_KEY))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const trimmed = (empNum || '').trim()
    if (!trimmed) {
      setError('Please enter your employee number.')
      return
    }
    if (!validateEmployeeNumber(trimmed)) {
      setError('Employee number must be 3-10 digits.')
      return
    }
    setSubmitting(true)
    try {
      await login(trimmed)
      if (remember) {
        const expires = Date.now() + REMEMBER_DAYS * 86400 * 1000
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ value: trimmed, expires }))
      } else {
        localStorage.removeItem(REMEMBER_KEY)
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err?.message || 'Sign-in error. Try again or use a supported browser.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-container">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Charleston&apos;s Training</h1>
      <p className="text-gray-600 mb-8">Sign in to access your training</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="loginEmpNum">Employee Number</label>
          <input
            id="loginEmpNum"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g., 4444"
            value={empNum}
            onChange={(e) => setEmpNum(e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-base focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
        <label className="flex items-center gap-2 my-4 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-4 h-4"
          />
          <span>Remember me for 30 days</span>
        </label>
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        <button type="submit" disabled={submitting} className="btn w-full min-h-[44px]">
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
        <p className="mt-4 text-center text-sm text-gray-500">
          Don&apos;t know your employee number? Ask your manager.
        </p>
      </form>
    </div>
  )
}
