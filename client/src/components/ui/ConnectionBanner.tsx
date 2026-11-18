import { CloudOff, LoaderCircle } from 'lucide-react'
import { retryConnectionNow, useConnection } from '../../lib/connection'

/** Non-blocking notice shown while the API is slow to wake or unreachable after the app has loaded. */
export function ConnectionBanner() {
  const { status, autoRetrying } = useConnection()
  if (status === 'online') return null

  const retryButton = (
    <button
      type="button"
      onClick={() => void retryConnectionNow()}
      className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold ring-1 ring-amber-300 hover:bg-amber-100"
    >
      Retry now
    </button>
  )

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4" role="status" aria-live="polite">
      <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg shadow-slate-900/10">
        {status === 'waking' ? (
          <>
            <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />
            <p className="flex-1">Our document service is waking up. This may take up to a minute.</p>
          </>
        ) : (
          <>
            <CloudOff className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">
              Can’t reach the document service yet — it may still be waking up
              {autoRetrying ? '. Retrying automatically' : ''}. Your unsaved changes are kept in this tab.
            </p>
          </>
        )}
        {retryButton}
      </div>
    </div>
  )
}
