import path from 'node:path'
import { badRequest } from '../errors.ts'
import { MAX_TITLE_LENGTH } from '../validation.ts'

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export const SUPPORTED_EXTENSIONS = ['.txt', '.md'] as const
export type ImportFormat = 'text' | 'markdown'

const FALLBACK_TITLE = 'Imported document'

/** Decides the format from the file name only — client-supplied MIME types are not trusted. */
export function detectFormat(filename: string): ImportFormat {
  const extension = path.extname(filename).toLowerCase()
  if (extension === '.md') return 'markdown'
  if (extension === '.txt') return 'text'
  throw badRequest(
    'unsupported_file_type',
    `Unsupported file type${extension ? ` "${extension}"` : ''}. Upload a .txt or .md file.`,
  )
}

/** Document title from an uploaded file name: no directories, extension or control characters. */
export function titleFromFilename(filename: string): string {
  const base = path.posix.basename(filename.replace(/\\/g, '/'))
  const title = base
    .replace(/\.(txt|md)$/i, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH)
    .trim()
  return title || FALLBACK_TITLE
}

/**
 * Strictly decodes an upload as UTF-8 text. Rejects empty, binary and non-UTF-8 input,
 * strips a BOM, normalizes line endings and drops control characters other than tab/newline.
 */
export function decodeTextFile(buffer: Buffer): string {
  if (buffer.length === 0) throw badRequest('empty_file', 'The file is empty.')
  if ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff)) {
    throw badRequest('invalid_encoding', 'The file is UTF-16 encoded. Save it as UTF-8 and try again.')
  }
  if (buffer.includes(0)) throw badRequest('binary_file', 'The file looks like binary data, not text.')

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw badRequest('invalid_encoding', 'The file is not valid UTF-8 text.')
  }

  text = text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  if (!text.trim()) throw badRequest('empty_file', 'The file has no text content.')
  return text
}
