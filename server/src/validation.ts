import { badRequest } from './errors.ts'
import type { SharePermission } from './types.ts'

export const DEFAULT_TITLE = 'Untitled document'
export const MAX_TITLE_LENGTH = 200
// Large enough for the TipTap JSON of a 2 MB imported text file (JSON adds structural overhead).
export const MAX_CONTENT_BYTES = 5 * 1024 * 1024
const MAX_CONTENT_DEPTH = 50

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const USER_ID_PATTERN = /^[a-z0-9_-]{1,64}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Node and mark types produced by the client's TipTap StarterKit. Unknown types are rejected
// because TipTap refuses to load a document containing them, which would lock everyone out.
const NODE_TYPES = new Set([
  'doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem',
  'blockquote', 'codeBlock', 'horizontalRule', 'hardBreak',
])
const MARK_TYPES = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link'])
const SAFE_LINK = /^(https?:|mailto:|\/|#)/i

export type JsonObject = Record<string, unknown>

export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Ensures the body is a JSON object containing only `allowed` keys. */
export function parseBody(body: unknown, allowed: readonly string[]): JsonObject {
  if (!isPlainObject(body)) throw badRequest('invalid_body', 'Request body must be a JSON object.')
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key))
  if (unknown.length) throw badRequest('unknown_field', `Unknown field(s): ${unknown.join(', ')}.`)
  return body
}

export function parseDocumentId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw badRequest('invalid_document_id', 'Document id must be a UUID.')
  }
  return value.toLowerCase()
}

export function isValidUserId(value: unknown): value is string {
  return typeof value === 'string' && USER_ID_PATTERN.test(value)
}

export function parseUserId(value: unknown): string {
  if (!isValidUserId(value)) throw badRequest('invalid_user_id', 'User id is invalid.')
  return value
}

export function parseEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254 || !EMAIL_PATTERN.test(value.trim())) {
    throw badRequest('invalid_email', 'Email address is invalid.')
  }
  return value.trim().toLowerCase()
}

export function parseTitle(value: unknown): string {
  if (typeof value !== 'string') throw badRequest('invalid_title', 'Title must be a string.')
  // Collapse whitespace (including newlines) so titles stay single-line.
  const title = value.replace(/\s+/g, ' ').trim()
  if (!title) throw badRequest('invalid_title', 'Title cannot be empty.')
  if (title.length > MAX_TITLE_LENGTH) {
    throw badRequest('invalid_title', `Title must be at most ${MAX_TITLE_LENGTH} characters.`)
  }
  return title
}

export function parsePermission(value: unknown): SharePermission {
  if (value !== 'viewer' && value !== 'editor') {
    throw badRequest('invalid_permission', 'Permission must be "viewer" or "editor".')
  }
  return value
}

export function parseVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw badRequest('invalid_version', 'Version must be a positive integer.')
  }
  return value as number
}

export function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw badRequest('invalid_field', `${field} must be a boolean.`)
  return value
}

/** ISO-8601 timestamp, not in the future (small clock-skew allowance). */
export function parseTimestamp(value: unknown, field: string): string {
  const date = typeof value === 'string' ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 5 * 60_000) {
    throw badRequest('invalid_timestamp', `${field} must be a valid ISO timestamp that is not in the future.`)
  }
  return date.toISOString()
}

export function emptyContent() {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/** Validates a TipTap document and returns its serialized JSON. */
export function parseContent(value: unknown): string {
  validateNode(value, 0, true)
  const serialized = JSON.stringify(value)
  if (Buffer.byteLength(serialized) > MAX_CONTENT_BYTES) {
    throw badRequest('content_too_large', `Content must be at most ${MAX_CONTENT_BYTES / 1024 / 1024} MB.`)
  }
  return serialized
}

function invalidContent(message: string): never {
  throw badRequest('invalid_content', `Invalid document content: ${message}`)
}

function validateAttrs(attrs: unknown, where: string) {
  if (attrs === undefined) return
  if (!isPlainObject(attrs)) invalidContent(`${where} attrs must be an object.`)
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      invalidContent(`${where} attribute "${key}" must be a primitive value.`)
    }
  }
}

function validateNode(node: unknown, depth: number, isRoot = false) {
  if (depth > MAX_CONTENT_DEPTH) invalidContent('document is nested too deeply.')
  if (!isPlainObject(node)) invalidContent('every node must be an object.')
  const { type, attrs, content, marks, text, ...rest } = node
  if (Object.keys(rest).length) invalidContent(`unexpected node field(s): ${Object.keys(rest).join(', ')}.`)
  if (typeof type !== 'string' || !NODE_TYPES.has(type)) invalidContent(`unsupported node type "${String(type)}".`)
  if (isRoot !== (type === 'doc')) invalidContent(isRoot ? 'root node must be "doc".' : '"doc" can only be the root node.')
  validateAttrs(attrs, `"${type}"`)

  if (type === 'text') {
    if (typeof text !== 'string' || text.length === 0) invalidContent('text nodes need non-empty text.')
  } else if (text !== undefined) {
    invalidContent(`"${type}" nodes cannot have text.`)
  }

  if (marks !== undefined) {
    if (type !== 'text' || !Array.isArray(marks)) invalidContent('only text nodes can have a marks array.')
    for (const mark of marks) {
      if (!isPlainObject(mark) || typeof mark.type !== 'string' || !MARK_TYPES.has(mark.type)) {
        invalidContent('unsupported mark.')
      }
      validateAttrs(mark.attrs, `"${mark.type}" mark`)
      if (mark.type === 'link' && isPlainObject(mark.attrs) && !SAFE_LINK.test(String(mark.attrs.href ?? ''))) {
        invalidContent('links must use http, https or mailto.')
      }
    }
  }

  if (content !== undefined) {
    if (!Array.isArray(content)) invalidContent('content must be an array.')
    for (const child of content) validateNode(child, depth + 1)
  }
}
