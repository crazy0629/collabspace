/**
 * One-time import of documents saved by the pre-backend frontend (localStorage key
 * `collabspace.documents.v1`) into the API.
 *
 * Safety rules:
 * - The original data is copied to `collabspace.documents.v1.backup` before anything else
 *   and is never deleted, so nothing can silently disappear.
 * - Only documents the old local user ("u-george") owned are imported, into George's account.
 *   Old sample documents owned by fictional users stay in the backup only.
 * - Each imported document is removed from the pending list immediately, so an interrupted
 *   run (closed tab, server down) resumes later without creating duplicates.
 */
import { ApiError } from '../lib/api'
import { DEFAULT_TITLE } from '../lib/documentContent'
import type { DocumentContent } from '../types'
import type { DocumentService } from './documentService'

const LEGACY_KEY = 'collabspace.documents.v1'
const BACKUP_KEY = 'collabspace.documents.v1.backup'
const LEGACY_OWNER_ID = 'u-george'
/** Demo account that inherits the old local user's documents. */
export const LEGACY_TARGET_USER_ID = 'george'

interface LegacyDocument {
  title: string
  content: DocumentContent
  ownerId: string
  createdAt: number
  updatedAt: number
  isFavorite?: boolean
  trashedAt?: number | null
}

export interface MigrationResult {
  imported: number
  failed: number
  /** Sample documents owned by other (fictional) users; kept in the backup only. */
  notImported: number
}

function isLegacyDocument(value: unknown): value is LegacyDocument {
  const doc = value as Partial<LegacyDocument> | null
  return (
    !!doc &&
    typeof doc.title === 'string' &&
    typeof doc.ownerId === 'string' &&
    typeof doc.content === 'object' &&
    doc.content !== null &&
    typeof doc.createdAt === 'number' &&
    typeof doc.updatedAt === 'number'
  )
}

function readPending(): unknown[] | null {
  const raw = localStorage.getItem(LEGACY_KEY)
  if (raw === null) return null
  if (localStorage.getItem(BACKUP_KEY) === null) localStorage.setItem(BACKUP_KEY, raw)
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] // Unreadable; the raw text is preserved in the backup key.
  }
}

async function migrate(service: DocumentService): Promise<MigrationResult | null> {
  const pending = readPending()
  if (pending === null) return null

  const result: MigrationResult = { imported: 0, failed: 0, notImported: 0 }
  const remaining = pending.filter((doc) => {
    const importable = isLegacyDocument(doc) && doc.ownerId === LEGACY_OWNER_ID
    if (!importable) result.notImported++
    return importable
  }) as LegacyDocument[]

  while (remaining.length > 0) {
    const doc = remaining[0]
    try {
      const now = Date.now()
      const createdAt = Math.min(doc.createdAt, now)
      await service.importDocument({
        title: doc.title.trim() || DEFAULT_TITLE,
        content: doc.content,
        createdAt,
        updatedAt: Math.max(createdAt, Math.min(doc.updatedAt, now)),
        isFavorite: Boolean(doc.isFavorite),
        trashed: Boolean(doc.trashedAt),
      })
      result.imported++
    } catch (error) {
      // Anything but a validation rejection (server down, auth misconfigured…) may be temporary:
      // stop and resume on a later visit.
      if (!(error instanceof ApiError) || ![400, 413].includes(error.status)) break
      // Rejected by validation: it will never succeed. It stays in the backup.
      console.error('[legacyMigration] Could not import document', doc.title, error)
      result.failed++
    }
    remaining.shift()
    localStorage.setItem(LEGACY_KEY, JSON.stringify(remaining))
  }

  if (remaining.length === 0) localStorage.removeItem(LEGACY_KEY)
  return result
}

let inFlight: Promise<MigrationResult | null> | null = null

/** Runs the migration at most once at a time (StrictMode double effects, multiple tabs). */
export function migrateLegacyDocuments(service: DocumentService): Promise<MigrationResult | null> {
  if (localStorage.getItem(LEGACY_KEY) === null) return Promise.resolve(null)
  inFlight ??= (
    navigator.locks
      ? navigator.locks.request('collabspace-legacy-migration', () => migrate(service))
      : migrate(service)
  ).finally(() => {
    inFlight = null
  })
  return inFlight
}
