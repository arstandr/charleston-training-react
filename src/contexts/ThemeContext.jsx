import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { getUserProfile, updateUserProfile } from '../services/userProfileService'

const ThemeContext = createContext(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark', 'dark-mode')
  } else {
    document.documentElement.classList.remove('dark', 'dark-mode')
  }
}

export function ThemeProvider({ children }) {
  const { currentUser } = useAuth()
  const userId = currentUser?.uid || currentUser?.id
  const [theme, setThemeState] = useState('light')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setThemeState('light')
      applyTheme('light')
      setLoading(false)
      return
    }
    let cancelled = false
    getUserProfile(userId)
      .then((profile) => {
        if (cancelled) return
        if (profile?.theme) {
          setThemeState(profile.theme)
          applyTheme(profile.theme)
        } else {
          setThemeState('light')
          applyTheme('light')
        }
      })
      .catch(() => {
        if (!cancelled) applyTheme(theme)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId])

  const toggleTheme = useCallback(async () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setThemeState(next)
    applyTheme(next)
    if (userId) {
      try {
        await updateUserProfile(userId, { theme: next, updatedAt: new Date().toISOString() })
      } catch (e) {
        console.error('Error saving theme:', e)
      }
    }
  }, [theme, userId])

  const value = {
    theme,
    toggleTheme,
    isDark: theme === 'dark',
    loading,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
