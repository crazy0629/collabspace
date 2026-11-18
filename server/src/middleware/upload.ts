import type { RequestHandler } from 'express'
import multer from 'multer'
import { HttpError } from '../errors.ts'
import { MAX_UPLOAD_BYTES } from '../import/index.ts'

/**
 * Parses a multipart request with a single `file` field into memory (`req.file.buffer`).
 * Uploads are never written to disk; the buffer is discarded with the request.
 */
const parseSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5, fieldSize: 1024, parts: 6, headerPairs: 50 },
  // Decode non-ASCII file names as UTF-8 (busboy defaults to latin1).
  defParamCharset: 'utf8',
}).single('file')

const MULTER_ERRORS: Record<string, [number, string, string]> = {
  LIMIT_FILE_SIZE: [413, 'file_too_large', `The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`],
  LIMIT_UNEXPECTED_FILE: [400, 'invalid_upload', 'Upload exactly one file in a field named "file".'],
  LIMIT_FILE_COUNT: [400, 'invalid_upload', 'Upload exactly one file in a field named "file".'],
}

export const uploadSingleFile: RequestHandler = (req, res, next) => {
  parseSingleFile(req, res, (error: unknown) => {
    if (!error) return next()
    if (error instanceof multer.MulterError) {
      const [status, code, message] = MULTER_ERRORS[error.code] ?? [400, 'invalid_upload', 'The upload was not accepted.']
      return next(new HttpError(status, code, message))
    }
    // busboy errors: truncated body, missing boundary, malformed part headers…
    next(new HttpError(400, 'malformed_upload', 'The upload could not be read. Please try again.'))
  })
}

export const isMultipart: RequestHandler = (req, _res, next) => {
  next(req.is('multipart/form-data') ? undefined : 'route')
}
