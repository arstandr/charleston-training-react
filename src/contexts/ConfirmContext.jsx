import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false, message: '', title: 'Confirm' })
  const resolveRef = useRef(null)

  const confirm = useCallback((message, title = 'Confirm') => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({ open: true, message, title })
    })
  }, [])

  const handleClose = useCallback((result) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setState({ open: false, message: '', title: 'Confirm' })
  }, [])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-800">{state.title}</h3>
            <p className="mt-2 text-gray-600">{state.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => handleClose(false)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={() => handleClose(true)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  return ctx ? ctx.confirm : () => Promise.resolve(false)
}
