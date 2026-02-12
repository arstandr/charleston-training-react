import { useState, useEffect, useRef } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useTestActive } from '../contexts/TestActiveContext'
import { useLocation } from 'react-router-dom'
import { DEFAULT_HELP_CONTENT } from '../data/defaultHelpContent'
import { chatWithHandbook } from '../services/ai'

const HELP_DOC_ID = 'helpContent'

export default function HelpButton() {
  const { currentUser } = useAuth()
  const { isTestActive } = useTestActive()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [knowledgeBase, setKnowledgeBase] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingContent, setLoadingContent] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (!open || !currentUser) return
    setLoadingContent(true)
    getDoc(doc(db, 'config', HELP_DOC_ID))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data()
          const content = (data.content ?? data.text ?? '').trim()
          setKnowledgeBase(content || DEFAULT_HELP_CONTENT)
        } else {
          setKnowledgeBase(DEFAULT_HELP_CONTENT)
        }
      })
      .catch(() => setKnowledgeBase(DEFAULT_HELP_CONTENT))
      .finally(() => setLoadingContent(false))
  }, [open, currentUser])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const userMsg = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)
    try {
      const history = [...messages, userMsg].slice(-10)
      const reply = await chatWithHandbook(text, history.slice(0, -1), knowledgeBase)
      setMessages((prev) => [...prev, { role: 'model', content: reply }])
    } catch (e) {
      const errMsg = e?.message || 'Connection error. Check that AI is configured in Admin → Settings.'
      setMessages((prev) => [...prev, { role: 'model', content: `❌ ${errMsg}` }])
    } finally {
      setLoading(false)
    }
  }

  if (!currentUser || location.pathname === '/login') return null
  if (isTestActive) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-lg hover:bg-[#5CB85C] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-primary)]"
        title="Help – ask a question"
        aria-label="Open help chat"
      >
        <span className="text-xl font-bold">?</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed bottom-20 right-6 z-50 flex flex-col w-[min(400px,calc(100vw-3rem))] h-[min(500px,70vh)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
            role="dialog"
            aria-label="Help chat"
          >
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2 shrink-0">
              <span className="font-semibold text-gray-800">Handbook AI</span>
              <button
                type="button"
                className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50/80 min-h-0">
              {loadingContent ? (
                <p className="text-gray-500 text-sm">Loading…</p>
              ) : messages.length === 0 ? (
                <div className="msg bot rounded-2xl rounded-bl-md px-4 py-3 bg-white border border-gray-200 shadow-sm text-gray-800 text-sm max-w-[85%] self-start">
                  Hi! I know the menu and handbook. Try: <strong>Quiz me</strong> (practice question), <strong>Upsell me</strong> (guest roleplay), or ask about recipes, policies, or definitions (e.g. &quot;Dry&quot;, &quot;Plain&quot;)!
                </div>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-2xl px-4 py-3 text-sm max-w-[85%] ${
                      m.role === 'user'
                        ? 'rounded-br-md bg-[var(--color-primary)] text-white self-end'
                        : 'rounded-bl-md bg-white border border-gray-200 shadow-sm text-gray-800 self-start'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                ))
              )}
              {loading && (
                <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-white border border-gray-200 shadow-sm text-gray-500 text-sm max-w-[85%] self-start">
                  Thinking…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 border-t border-gray-200 bg-white flex gap-2 items-center shrink-0">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder='Ask a question... or try "Quiz me" / "Upsell me"'
                className="flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                disabled={loading || loadingContent}
                aria-label="Your question"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || loadingContent || !input.trim()}
                className="h-10 w-10 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#143a11] transition-colors"
                aria-label="Send"
              >
                ➤
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
