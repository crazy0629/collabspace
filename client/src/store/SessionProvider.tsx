import { LoaderCircle, ServerCrash } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { WakeUpScreen } from '../components/ui/WakeUpScreen'
import { errorMessage } from '../lib/api'
import { isConnectionError, onReconnect, retryConnectionNow, useConnection } from '../lib/connection'
import { listUsers } from '../services/userService'
import type { User } from '../types'
import { SessionContext, type SessionContextValue } from './SessionContext'

// Remembered per browser for convenience; this is demo identity, not a credential.
const STORAGE_KEY = 'collabspace.demoUserId'
const DEFAULT_USER_ID = 'george'

function readStoredUserId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_USER_ID
  } catch {
    return DEFAULT_USER_ID
  }
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; connectionProblem: boolean }
  | { status: 'ready'; users: User[] }

/** Loads the demo accounts and renders children only once a current user is known. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [currentUserId, setCurrentUserId] = useState(readStoredUserId)
  const [attempt, setAttempt] = useState(0)
  const connection = useConnection()
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  })

  useEffect(() => {
    let cancelled = false
    listUsers()
      .then((users) => !cancelled && setState({ status: 'ready', users }))
      .catch(
        (error) =>
          !cancelled &&
          setState({ status: 'error', message: errorMessage(error), connectionProblem: isConnectionError(error) }),
      )
    return () => {
      cancelled = true
    }
  }, [attempt])

  // The connection monitor keeps health-checking a sleeping server; load as soon as it answers.
  // Also covers a first request stuck on a dead connection: a fresh attempt replaces it.
  useEffect(
    () =>
      onReconnect(() => {
        if (stateRef.current.status === 'ready') return
        setState({ status: 'loading' })
        setAttempt((count) => count + 1)
      }),
    [],
  )

  const switchUser = useCallback((userId: string) => {
    setCurrentUserId(userId)
    try {
      localStorage.setItem(STORAGE_KEY, userId)
    } catch {
      // Storage unavailable (private mode); the choice just won't persist.
    }
  }, [])

  const value = useMemo<SessionContextValue | null>(() => {
    if (state.status !== 'ready' || state.users.length === 0) return null
    const currentUser =
      state.users.find((user) => user.id === currentUserId) ??
      state.users.find((user) => user.id === DEFAULT_USER_ID) ??
      state.users[0]
    return { users: state.users, currentUser, switchUser }
  }, [state, currentUserId, switchUser])

  if (state.status === 'loading') {
    // Slow first request: the host is most likely starting the service.
    if (connection.status !== 'online') return <WakeUpScreen onRetryNow={() => void retryConnectionNow()} />
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-slate-400" aria-busy="true">
        <LoaderCircle className="size-6 animate-spin" aria-label="Connecting to CollabSpace" />
      </div>
    )
  }

  if (state.status === 'error' && state.connectionProblem && (connection.autoRetrying || connection.status === 'waking')) {
    return <WakeUpScreen onRetryNow={() => void retryConnectionNow()} />
  }

  if (!value) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-rose-500">
            <ServerCrash className="size-7" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Can’t connect to CollabSpace</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {state.status === 'error' ? state.message : 'The server returned no demo accounts.'}{' '}
            {import.meta.env.DEV ? (
              <>
                Start the API with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">npm run dev</code> in
                the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">server</code> folder, then retry.
              </>
            ) : (
              'Please try again in a moment.'
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              // Connection problems: restart the health-check loop; a successful check reloads via onReconnect.
              if (state.status === 'error' && state.connectionProblem) {
                void retryConnectionNow()
                return
              }
              setState({ status: 'loading' })
              setAttempt((count) => count + 1)
            }}
            className="mt-6 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
