import { useGemini } from '../contexts/GeminiContext'

export default function RateLimitIndicator() {
  const { rateLimitStatus, isConfigured } = useGemini()

  if (!isConfigured || !rateLimitStatus.isLimited) return null

  const remaining = rateLimitStatus.standard > 0 ? rateLimitStatus.standard : rateLimitStatus.live

  return (
    <div
      className="fixed bottom-4 right-4 bg-amber-100 border-2 border-amber-400 text-amber-800 px-4 py-2 rounded-lg shadow-lg z-50"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>⏱</span>
        <div>
          <div className="font-semibold text-sm">AI Rate Limited</div>
          <div className="text-xs">Available in {remaining}s</div>
        </div>
      </div>
    </div>
  )
}
