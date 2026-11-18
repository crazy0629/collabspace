/** Minimal JSON client for the CollabSpace API. Errors are normalized to `ApiError`. */
import { API_BASE_URL } from './apiConfig'
import { trackRequest } from './connection'

// Generous enough for a sleeping free-tier host to wake (30–60 s), but never unbounded.
const REQUEST_TIMEOUT_MS = 70_000
const UPLOAD_TIMEOUT_MS = 120_000

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  get isNetworkError() {
    return this.status === 0
  }
}

/** User-facing message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'Something went wrong. Please try again.'
}

const unreachableError = () =>
  new ApiError(
    0,
    'network_error',
    import.meta.env.DEV
      ? `Can’t reach the CollabSpace server at ${API_BASE_URL}. Is it running?`
      : 'Can’t reach the document service. It may be waking up — this can take up to a minute.',
  )

const timeoutError = () =>
  new ApiError(0, 'timeout', 'The document service took too long to respond. Please try again.')

interface RequestOptions {
  /** Demo identity sent as x-demo-user-id (simulated auth — see server README). */
  userId?: string
  body?: unknown
}

// Requests flagged keepalive survive page unload (used for the final autosave). Browsers cap
// keepalive bodies at 64 KB, so larger bodies are sent normally.
const KEEPALIVE_LIMIT = 60_000

export function apiRequest<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  return trackRequest(sendRequest<T>(method, path, options, controller.signal), () => controller.abort())
}

async function sendRequest<T>(method: string, path: string, { userId, body }: RequestOptions, signal: AbortSignal): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body)
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(userId ? { 'x-demo-user-id': userId } : {}),
      },
      body: payload,
      keepalive: payload !== undefined && payload.length < KEEPALIVE_LIMIT,
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    })
  } catch (error) {
    throw error instanceof DOMException && error.name === 'TimeoutError' ? timeoutError() : unreachableError()
  }

  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(response.status, data)
  return data as T
}

function toApiError(status: number, data: unknown): ApiError {
  const error = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
  if (!error && (status === 502 || status === 503 || status === 504)) {
    // A gateway error without our JSON body: the host is (re)starting the service.
    return new ApiError(status, 'service_unavailable', 'The document service is starting up. Please try again in a moment.')
  }
  return new ApiError(status, error?.code ?? 'http_error', error?.message ?? `Request failed with status ${status}.`, error?.details)
}

interface UploadOptions {
  userId?: string
  /** Called with upload progress from 0 to 1. */
  onProgress?: (fraction: number) => void
}

/** POSTs multipart form data. Uses XHR because fetch can't report upload progress. */
export function uploadRequest<T>(path: string, form: FormData, { userId, onProgress }: UploadOptions = {}): Promise<T> {
  const xhr = new XMLHttpRequest()
  return trackRequest(
    new Promise<T>((resolve, reject) => {
      xhr.open('POST', `${API_BASE_URL}${path}`)
      xhr.timeout = UPLOAD_TIMEOUT_MS
      if (userId) xhr.setRequestHeader('x-demo-user-id', userId)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total)
      }
      xhr.onload = () => {
        let data: unknown = null
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null
        } catch {
          // Non-JSON response (e.g. a proxy error page); handled below.
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data as T)
        else reject(toApiError(xhr.status, data))
      }
      xhr.onerror = () => reject(unreachableError())
      xhr.onabort = () => reject(unreachableError())
      xhr.ontimeout = () => reject(timeoutError())
      xhr.send(form)
    }),
    () => xhr.abort(),
  )
}
