import type { ErrorRequestHandler, RequestHandler } from 'express'
import { HttpError } from '../errors.ts'

export const notFoundHandler: RequestHandler = (req) => {
  throw new HttpError(404, 'route_not_found', `No route for ${req.method} ${req.path}.`)
}

/** body-parser errors carry an HTTP status and a `type`. */
interface BodyParserError extends Error {
  status?: number
  type?: string
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  let httpError: HttpError
  if (error instanceof HttpError) {
    httpError = error
  } else if ((error as BodyParserError).type === 'entity.parse.failed') {
    httpError = new HttpError(400, 'invalid_json', 'Request body is not valid JSON.')
  } else if ((error as BodyParserError).type === 'entity.too.large') {
    httpError = new HttpError(413, 'payload_too_large', 'Request body is too large.')
  } else if ((error as BodyParserError).status === 415 || (error as BodyParserError).type === 'encoding.unsupported') {
    httpError = new HttpError(415, 'unsupported_media_type', 'Unsupported request encoding.')
  } else {
    console.error('[server] Unhandled error', error)
    httpError = new HttpError(500, 'internal_error', 'Something went wrong on the server.')
  }

  res.status(httpError.status).json({
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.details !== undefined ? { details: httpError.details } : {}),
    },
  })
}
