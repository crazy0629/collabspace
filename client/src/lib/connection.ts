/**
 * Tracks whether the API is reachable, for the "waking up" UX on hosts that sleep idle services
 * (e.g. Render's free tier takes 30–60 s to wake).
 *
 * - A request taking longer than SLOW_REQUEST_MS marks the service as "waking".
 * - A network failure / timeout / 502–504 marks it "offline".
 * - Either starts a single, capped health-check loop with backoff (paused while the tab is
 *   hidden). Any successful response proves the API is up: requests that were already stuck
 *   before it (e.g. on a dead connection) stop counting, the state returns to "online" and
 *   `onReconnect` listeners run (to reload data or retry autosave).
 */
import { useSyncExternalStore } from 'react'
import { API_BASE_URL } from './apiConfig'

export type ConnectionStatus = 'online' | 'waking' | 'offline'

export interface ConnectionSnapshot {
  status: ConnectionStatus
  /** True while automatic health checks are still scheduled. */
  autoRetrying: boolean
}

const SLOW_REQUEST_MS = 3000
// ~95 s of automatic checks in total, then stop until the user retries.
const HEALTH_CHECK_DELAYS_MS = [2000, 3000, 5000, 10000, 15000, 15000, 15000, 15000, 15000]
// Health checks are tiny; give up on a stuck one quickly and let the next attempt try again.
const HEALTH_CHECK_TIMEOUT_MS = 15_000

interface SlowRequest {
  startedAt: number
  /** Cancels the request (so callers like autosave can retry instead of waiting for a timeout). */
  abort?: () => void
}

/** In-flight requests that have exceeded SLOW_REQUEST_MS. */
const slowRequests = new Set<SlowRequest>()
/** When the API last answered; slow requests started before this are considered stale. */
let lastReachableAt = 0
let lastRequestFailed = false
let checkAttempt = 0
let checkTimer: number | undefined
let checkInFlight: Promise<boolean> | null = null
let snapshot: ConnectionSnapshot = { status: 'online', autoRetrying: false }
const listeners = new Set<() => void>()
const reconnectListeners = new Set<() => void>()

/** Network failure, timeout, or a gateway error while the host starts the service. */
export function isConnectionError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status
  return status === 0 || status === 502 || status === 503 || status === 504
}

function currentStatus(): ConnectionStatus {
  const waking = [...slowRequests].some((request) => request.startedAt > lastReachableAt)
  return waking ? 'waking' : lastRequestFailed ? 'offline' : 'online'
}

function publish() {
  const status = currentStatus()
  const autoRetrying = checkTimer !== undefined || checkInFlight !== null
  if (status === snapshot.status && autoRetrying === snapshot.autoRetrying) return
  const recovered = snapshot.status !== 'online' && status === 'online'
  snapshot = { status, autoRetrying }
  listeners.forEach((listener) => listener())
  if (recovered) reconnectListeners.forEach((listener) => listener())
}

function stopHealthChecks() {
  window.clearTimeout(checkTimer)
  checkTimer = undefined
  checkAttempt = 0
}

function scheduleHealthCheck() {
  if (checkTimer !== undefined || checkInFlight || checkAttempt >= HEALTH_CHECK_DELAYS_MS.length) return
  checkTimer = window.setTimeout(() => {
    checkTimer = undefined
    if (currentStatus() === 'online') return stopHealthChecks()
    // Don't poll from background tabs; resume when the tab becomes visible.
    if (document.visibilityState === 'hidden') return publish()
    checkAttempt++
    void checkConnection()
  }, HEALTH_CHECK_DELAYS_MS[checkAttempt])
  publish()
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentStatus() !== 'online') scheduleHealthCheck()
})

/** Cancels requests that were already stuck before the API last answered (likely dead connections). */
function abortStaleRequests() {
  for (const request of slowRequests) {
    if (request.startedAt >= lastReachableAt) continue
    slowRequests.delete(request)
    request.abort?.()
  }
}

/**
 * Wraps an API request so its timing and outcome update the connection state. `abort` lets the
 * monitor cancel the request if it is still stuck after the API has answered something else.
 */
export function trackRequest<T>(request: Promise<T>, abort?: () => void): Promise<T> {
  const entry: SlowRequest = { startedAt: Date.now(), abort }
  const timer = window.setTimeout(() => {
    slowRequests.add(entry)
    // A request may be stuck on a dead connection; health checks can confirm recovery sooner.
    scheduleHealthCheck()
    publish()
  }, SLOW_REQUEST_MS)
  const settle = (failedToConnect: boolean) => {
    window.clearTimeout(timer)
    slowRequests.delete(entry)
    if (!failedToConnect) {
      lastReachableAt = Date.now()
      lastRequestFailed = false
      stopHealthChecks()
      abortStaleRequests()
    } else if (entry.startedAt > lastReachableAt) {
      // Failures of requests that started before the API last answered are stale; ignore them.
      lastRequestFailed = true
      scheduleHealthCheck()
    }
    publish()
  }
  return request.then(
    (value) => {
      settle(false)
      return value
    },
    (error: unknown) => {
      // Any HTTP response (even 4xx/500) proves the service is reachable.
      settle(isConnectionError(error))
      throw error
    },
  )
}

/** Pings /api/health (one at a time). Resolves true if the API answered. */
export function checkConnection(): Promise<boolean> {
  checkInFlight ??= trackRequest(
    fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) }).then(
      (response) => {
        if (!response.ok) throw Object.assign(new Error('Health check failed'), { status: response.status })
        return true
      },
      () => {
        throw Object.assign(new Error('API unreachable'), { status: 0 })
      },
    ),
  )
    .catch(() => false)
    .finally(() => {
      checkInFlight = null
      // Queue the next check here: while this one was in flight, scheduling was blocked.
      if (currentStatus() !== 'online') scheduleHealthCheck()
      else publish()
    })
  return checkInFlight
}

/** User-initiated retry: restarts the automatic schedule and checks immediately. */
export function retryConnectionNow(): Promise<boolean> {
  stopHealthChecks()
  return checkConnection()
}

/** Runs `listener` whenever the API becomes reachable again. Returns an unsubscribe function. */
export function onReconnect(listener: () => void): () => void {
  reconnectListeners.add(listener)
  return () => reconnectListeners.delete(listener)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useConnection(): ConnectionSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot)
}
