import { Check, CircleAlert, LoaderCircle } from 'lucide-react'
import { formatRelativeTime, formatTime } from '../../lib/format'
import type { SaveStatus } from '../../types'

interface SaveStatusIndicatorProps {
  status: SaveStatus
  lastSavedAt: number
  onRetry: () => void
}

function describeLastSaved(timestamp: number): string {
  const isToday = new Date(timestamp).toDateString() === new Date().toDateString()
  return isToday ? `at ${formatTime(timestamp)}` : formatRelativeTime(timestamp).toLowerCase()
}

export function SaveStatusIndicator({ status, lastSavedAt, onRetry }: SaveStatusIndicatorProps) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-500" role="status">
        <LoaderCircle className="size-3.5 animate-spin" />
        Saving…
      </span>
    )
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-rose-600" role="alert">
        <CircleAlert className="size-3.5" />
        Couldn’t save
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2 hover:text-rose-700">
          Retry
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-slate-500" role="status" title={new Date(lastSavedAt).toLocaleString()}>
      <Check className="size-3.5 text-emerald-600" />
      Saved
      <span className="hidden text-slate-400 sm:inline">· Last saved {describeLastSaved(lastSavedAt)}</span>
    </span>
  )
}
