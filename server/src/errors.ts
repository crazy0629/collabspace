/** An error that maps directly to an HTTP response: `{ error: { code, message, details? } }`. */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message)
export const forbidden = (message: string) => new HttpError(403, 'forbidden', message)
export const notFound = (code: string, message: string) => new HttpError(404, code, message)
