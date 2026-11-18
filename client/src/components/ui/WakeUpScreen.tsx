import { CloudCog, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

interface WakeUpScreenProps {
  /** Shown when the service hasn't answered yet; omitted while a request is still pending. */
  onRetryNow?: () => void
}

/** Full-page state while a sleeping API host starts up (free tiers can take up to a minute). */
export function WakeUpScreen({ onRetryNow }: WakeUpScreenProps) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="max-w-md text-center" role="status" aria-live="polite">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-slate-200 bg-indigo-50 text-indigo-600">
          <CloudCog className="size-7" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Waking up CollabSpace</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Our document service is waking up. This may take up to a minute. You’ll be connected automatically — no need
          to refresh.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400">
          <LoaderCircle className="size-3.5 animate-spin" />
          Waiting {seconds}s
        </p>
        {onRetryNow && (
          <div>
            <button
              type="button"
              onClick={onRetryNow}
              className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Retry now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
