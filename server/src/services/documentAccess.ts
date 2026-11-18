/**
 * Server-side authorization for documents. Every document route goes through
 * `authorize`, so the rules live in one place:
 *
 *   owner  — read, update, trash/delete, manage sharing
 *   editor — read, update title/content
 *   viewer — read only
 *   anyone else — 403; missing document — 404
 *
 * Trashed documents are only visible to their owner (collaborators get 404).
 */
import { HttpError, forbidden, notFound } from '../errors.ts'
import type { DocumentRepository, DocumentRow } from '../repositories/documentRepository.ts'
import type { Access, User } from '../types.ts'

export type DocumentAction = 'read' | 'write' | 'manage'

const ALLOWED: Record<DocumentAction, readonly Access[]> = {
  read: ['owner', 'editor', 'viewer'],
  write: ['owner', 'editor'],
  manage: ['owner'],
}

const DENIED_MESSAGE: Record<DocumentAction, string> = {
  read: 'You do not have access to this document.',
  write: 'You have view-only access to this document.',
  manage: 'Only the document owner can do this.',
}

export function resolveAccess(documents: DocumentRepository, row: DocumentRow, user: User): Access | null {
  if (row.owner_id === user.id) return 'owner'
  return documents.findSharePermission(row.id, user.id) ?? null
}

/** Loads a document and asserts `user` may perform `action` on it. */
export function authorize(
  documents: DocumentRepository,
  documentId: string,
  user: User,
  action: DocumentAction,
): { row: DocumentRow; access: Access } {
  const row = documents.findById(documentId)
  if (!row) throw notFound('document_not_found', 'Document not found.')

  const access = resolveAccess(documents, row, user)
  if (!access) throw forbidden(DENIED_MESSAGE.read)
  if (row.trashed_at && access !== 'owner') throw notFound('document_not_found', 'Document not found.')
  if (!ALLOWED[action].includes(access)) throw forbidden(DENIED_MESSAGE[action])

  return { row, access }
}

/** 409 for a save based on a stale `version`, carrying the current document for the client to resolve. */
export function versionConflict(documents: DocumentRepository, documentId: string, user: User): HttpError {
  return new HttpError(409, 'version_conflict', 'This document was changed by someone else since you loaded it.', {
    document: documents.getDto(documentId, user.id),
  })
}

export function assertNotTrashed(row: DocumentRow) {
  if (row.trashed_at) {
    throw new HttpError(409, 'document_trashed', 'This document is in the trash. Restore it before editing.')
  }
}
