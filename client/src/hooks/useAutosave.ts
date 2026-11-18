import { useCallback, useEffect, useRef, useState } from 'react'
import type { SaveStatus } from '../types'

export interface Autosave<T extends object> {
  status: SaveStatus
  /** The last save error (cleared by the next successful save or `discard`). */
  error: unknown
  lastSavedAt: number
  /** Queues changes (merged with any pending ones) and restarts the debounce timer. */
  schedule: (changes: T) => void
  /** Saves pending changes immediately. Also used to retry after an error. */
  flush: () => Promise<void>
  /** Drops pending changes, e.g. after loading a newer version from the server. */
  discard: (savedAt: number) => void
}

export interface AutosaveOptions {
  /** Debounce before saving, in ms. */
  delay?: number
  /** Failed saves for which this returns true are retried automatically with backoff. */
  shouldRetry?: (error: unknown) => boolean
}

// Bounded automatic retries (~2 min in total); after that the user retries manually.
const RETRY_DELAYS_MS = [5000, 10000, 20000, 30000, 30000, 30000]

/**
 * Debounced autosave. Pending changes are flushed on unmount, tab hide and page unload,
 * so navigating away never drops edits. Saves run strictly one at a time, in order, so a
 * slow earlier request can never land after (and overwrite) a later one. Failed changes stay
 * queued (never discarded) and the browser warns before closing a tab with unsaved changes.
 */
export function useAutosave<T extends object>(
  save: (changes: T) => Promise<void>,
  initialSavedAt: number,
  { delay = 800, shouldRetry }: AutosaveOptions = {},
): Autosave<T> {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [error, setError] = useState<unknown>(null)
  const [lastSavedAt, setLastSavedAt] = useState(initialSavedAt)
  const pendingRef = useRef<T | null>(null)
  const savingRef = useRef(0)
  const timerRef = useRef<number | undefined>(undefined)
  const retryRef = useRef(0)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const saveRef = useRef(save)
  const shouldRetryRef = useRef(shouldRetry)
  // Lets the retry timer inside `flush` call the latest `flush` without a self-reference.
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    saveRef.current = save
    shouldRetryRef.current = shouldRetry
  })

  const flush = useCallback(() => {
    window.clearTimeout(timerRef.current)
    const changes = pendingRef.current
    if (!changes) return queueRef.current
    pendingRef.current = null
    savingRef.current++

    queueRef.current = queueRef.current
      .then(() => saveRef.current(changes))
      .then(
        () => {
          savingRef.current--
          retryRef.current = 0
          // More edits may have arrived while this save ran; stay in "saving" until they land.
          if (pendingRef.current) return
          setStatus('saved')
          setError(null)
          setLastSavedAt(Date.now())
        },
        (saveError: unknown) => {
          savingRef.current--
          console.error('[useAutosave] Save failed', saveError)
          // Re-queue the failed changes underneath any newer ones so a retry includes both.
          pendingRef.current = { ...changes, ...pendingRef.current }
          window.clearTimeout(timerRef.current)
          setStatus('error')
          setError(saveError)
          if (shouldRetryRef.current?.(saveError) && retryRef.current < RETRY_DELAYS_MS.length) {
            timerRef.current = window.setTimeout(() => void flushRef.current(), RETRY_DELAYS_MS[retryRef.current++])
          }
        },
      )
    return queueRef.current
  }, [])

  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  const schedule = useCallback(
    (changes: T) => {
      pendingRef.current = { ...pendingRef.current, ...changes }
      setStatus('saving')
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(flush, delay)
    },
    [flush, delay],
  )

  const discard = useCallback((savedAt: number) => {
    window.clearTimeout(timerRef.current)
    retryRef.current = 0
    pendingRef.current = null
    setStatus('saved')
    setError(null)
    setLastSavedAt(savedAt)
  }, [])

  useEffect(() => {
    const flushIfHidden = () => document.visibilityState === 'hidden' && flush()
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const unsaved = pendingRef.current !== null || savingRef.current > 0
      flush() // best effort: keepalive requests can outlive the page
      // Ask before leaving if changes might not reach the server (e.g. while it's waking up).
      if (unsaved) event.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', flushIfHidden)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', flushIfHidden)
      flush()
    }
  }, [flush])

  return { status, error, lastSavedAt, schedule, flush, discard }
}
