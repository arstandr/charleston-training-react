import { createContext, useContext, useState, useCallback } from 'react'

const LoadingContext = createContext(null)

export function LoadingProvider({ children }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('Loading…')

  const showLoading = useCallback((msg = 'Loading…') => {
    setMessage(msg)
    setLoading(true)
  }, [])

  const hideLoading = useCallback(() => {
    setLoading(false)
  }, [])

  return (
    <LoadingContext.Provider value={{ loading, message, showLoading, hideLoading }}>
      {children}
      {loading && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white px-6 py-4 shadow-xl flex items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            <span className="text-gray-800 font-medium">{message}</span>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  )
}

export function useLoading() {
  const ctx = useContext(LoadingContext)
  return ctx || { loading: false, showLoading: () => {}, hideLoading: () => {} }
}
