import { ArrowLeft, CloudOff, FileQuestion, LoaderCircle, Lock } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/documents/EmptyState'
import { DocumentEditor } from '../components/editor/DocumentEditor'
import { ApiError, errorMessage } from '../lib/api'
import { isConnectionError, onReconnect, retryConnectionNow } from '../lib/connection'
import { useDocuments } from '../store/useDocuments'

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: unknown }

export function DocumentPage() {
  const { id = '' } = useParams()
  const { getDocument, fetchDocument, currentUser } = useDocuments()
  const [state, setState] = useState<{ id: string; load: LoadState }>({ id, load: { status: 'loading' } })
  const [attempt, setAttempt] = useState(0)

  // Always load the document fresh from the API (the dashboard list may be stale).
  useEffect(() => {
    let cancelled = false
    fetchDocument(id)
      .then(() => !cancelled && setState({ id, load: { status: 'ready' } }))
      .catch((error) => !cancelled && setState({ id, load: { status: 'error', error } }))
    return () => {
      cancelled = true
    }
  }, [id, fetchDocument, attempt])

  // Ignore state left over from a previous :id until this one has loaded.
  const load: LoadState = state.id === id ? state.load : { status: 'loading' }
  const waitingForConnection = load.status === 'error' && isConnectionError(load.error)
  const retryOnReconnect = waitingForConnection || load.status === 'loading'

  // Reload automatically once a sleeping/unreachable API answers again (also replaces a load
  // that is stuck on a dead connection).
  useEffect(() => {
    if (!retryOnReconnect) return
    return onReconnect(() => setAttempt((count) => count + 1))
  }, [retryOnReconnect])
  const doc = getDocument(id)

  if (load.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400" aria-busy="true">
        <LoaderCircle className="size-6 animate-spin" aria-label="Loading document" />
      </div>
    )
  }

  if (load.status === 'error') {
    const error = load.error
    if (error instanceof ApiError && error.status === 403) {
      return (
        <Problem
          icon={Lock}
          title="You don’t have access"
          message={`${currentUser.name} doesn’t have permission to open this document. Ask the owner to share it, or switch demo accounts.`}
        />
      )
    }
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return <NotFound />
    }
    return (
      <Problem
        icon={CloudOff}
        title={waitingForConnection ? 'Waiting for the document service' : 'Couldn’t load this document'}
        message={
          waitingForConnection
            ? 'Our document service is waking up. This may take up to a minute — the document will open automatically.'
            : errorMessage(error)
        }
        extraAction={
          <button
            type="button"
            onClick={() => {
              if (waitingForConnection) {
                void retryConnectionNow()
                return
              }
              setState({ id, load: { status: 'loading' } })
              setAttempt((count) => count + 1)
            }}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Retry
          </button>
        }
      />
    )
  }

  // Deleted while open (e.g. from another menu) — treat as not found.
  if (!doc) return <NotFound />

  // Keyed so all editor state (TipTap instance, title draft, autosave queue) resets per document.
  return <DocumentEditor key={doc.id} doc={doc} />
}

function NotFound() {
  return (
    <Problem
      icon={FileQuestion}
      title="Document not found"
      message="This document may have been deleted, or the link is incorrect."
    />
  )
}

interface ProblemProps {
  icon: typeof Lock
  title: string
  message: string
  extraAction?: ReactNode
}

function Problem({ icon, title, message, extraAction }: ProblemProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-lg">
        <EmptyState
          icon={icon}
          title={title}
          message={message}
          action={
            <div className="flex items-center gap-2">
              {extraAction}
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <ArrowLeft className="size-4" />
                Back to dashboard
              </Link>
            </div>
          }
        />
      </div>
    </div>
  )
}
