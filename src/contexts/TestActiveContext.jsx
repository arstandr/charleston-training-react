import { createContext, useContext, useState, useCallback } from 'react'

const TestActiveContext = createContext({ isTestActive: false, setTestActive: () => {} })

export function useTestActive() {
  const ctx = useContext(TestActiveContext)
  return ctx || { isTestActive: false, setTestActive: () => {} }
}

export function TestActiveProvider({ children }) {
  const [isTestActive, setTestActive] = useState(false)
  const setTestActiveStable = useCallback((value) => {
    setTestActive(Boolean(value))
  }, [])
  return (
    <TestActiveContext.Provider value={{ isTestActive, setTestActive: setTestActiveStable }}>
      {children}
    </TestActiveContext.Provider>
  )
}
