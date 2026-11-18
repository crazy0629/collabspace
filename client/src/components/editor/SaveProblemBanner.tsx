import { CircleAlert, CloudOff, GitMerge } from 'lucide-react'
import { errorMessage } from '../../lib/api'
import { isConnectionError } from '../../lib/connection'
import { DocumentConflictError } from '../../services/documentService'

interface SaveProblemBannerProps {
  error: unknown
  onLoadLatest: (error: DocumentConflictError) => void
  onKeepMine: (error: DocumentConflictError) => void
  onRetry: () => void
}

const buttonClass = 'rounded-lg bg-white px-3 py-1 font-medium ring-1'

/** Explains a failed autosave and offers the right recovery action. */
export function SaveProblemBanner({ error, onLoadLatest, onKeepMine, onRetry }: SaveProblemBannerProps) {
  if (error instanceof DocumentConflictError) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" role="alert">
        <GitMerge className="size-4" />
        <span>Someone else saved a newer version of this document. Your latest edits are not saved yet.</span>
        <span className="flex gap-2">
          <button type="button" onClick={() => onLoadLatest(error)} className={`${buttonClass} ring-amber-300 hover:bg-amber-100`}>
            Load latest version
          </button>
          <button type="button" onClick={() => onKeepMine(error)} className={`${buttonClass} ring-amber-300 hover:bg-amber-100`}>
            Keep my changes
          </button>
        </span>
      </div>
    )
  }

  if (isConnectionError(error)) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" role="status">
        <CloudOff className="size-4" />
        <span>
          Your latest changes aren’t saved yet — the document service is waking up or unreachable. They’re kept in this
          tab and will be saved automatically.
        </span>
        <button type="button" onClick={onRetry} className={`${buttonClass} ring-amber-300 hover:bg-amber-100`}>
          Retry now
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800" role="alert">
      <CircleAlert className="size-4" />
      <span>Couldn’t save your changes: {errorMessage(error)}</span>
      <button type="button" onClick={onRetry} className={`${buttonClass} ring-rose-300 hover:bg-rose-100`}>
        Retry
      </button>
    </div>
  )
}
