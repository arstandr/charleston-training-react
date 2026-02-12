import { useState, useEffect } from 'react'

export default function ToastNotification({ message, type = 'info', duration = 4000, onClose }) {
  const [visible, setVisible] = useState(!!message)

  useEffect(() => {
    if (!message) return
    setVisible(true)
    const t = duration > 0 ? setTimeout(() => { setVisible(false); onClose?.() }, duration) : null
    return () => { if (t) clearTimeout(t) }
  }, [message, duration, onClose])

  if (!visible || !message) return null

  const bg = type === 'error' ? 'bg-red-100 border-red-400 text-red-800' : type === 'success' ? 'bg-green-100 border-green-400 text-green-800' : 'bg-blue-100 border-blue-400 text-blue-800'

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg border shadow-lg ${bg}`}>
      {message}
    </div>
  )
}
