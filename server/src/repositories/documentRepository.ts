import type { DB } from '../db/database.ts'
import { now } from '../db/database.ts'
import type { Access, DocumentDto, DocumentShareDto, SharePermission } from '../types.ts'

export interface DocumentRow {
  id: string
  title: string
  content: string
  owner_id: string
  version: number
  created_at: string
  updated_at: string
  trashed_at: string | null
}

/** A document joined with its owner and the requesting user's access + UI state. */
interface AccessibleDocumentRow extends DocumentRow {
  owner_name: string
  owner_email: string
  access: Access
  is_favorite: number | null
  last_opened_at: string | null
}

interface ShareRow {
  document_id: string
  user_id: string
  name: string
  email: string
  permission: SharePermission
  created_at: string
}

export interface NewDocument {
  id: string
  ownerId: string
  title: string
  content: string
  createdAt?: string
  updatedAt?: string
  trashedAt?: string | null
}

const ACCESSIBLE_SELECT = `
  SELECT d.*, o.name AS owner_name, o.email AS owner_email,
         CASE WHEN d.owner_id = @userId THEN 'owner' ELSE s.permission END AS access,
         st.is_favorite, st.last_opened_at
  FROM documents d
  JOIN users o ON o.id = d.owner_id
  LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = @userId
  LEFT JOIN document_user_state st ON st.document_id = d.id AND st.user_id = @userId`

export function createDocumentRepository(db: DB) {
  const statements = {
    findById: db.prepare<[string], DocumentRow>('SELECT * FROM documents WHERE id = ?'),
    findShare: db.prepare<[string, string], { permission: SharePermission }>(
      'SELECT permission FROM document_shares WHERE document_id = ? AND user_id = ?',
    ),
    // Owners see their own documents (including trashed); collaborators only see non-trashed shares.
    listAccessible: db.prepare<{ userId: string }, AccessibleDocumentRow>(
      `${ACCESSIBLE_SELECT}
       WHERE d.owner_id = @userId OR (s.user_id IS NOT NULL AND d.trashed_at IS NULL)
       ORDER BY d.updated_at DESC`,
    ),
    findAccessible: db.prepare<{ userId: string; id: string }, AccessibleDocumentRow>(
      `${ACCESSIBLE_SELECT} WHERE d.id = @id`,
    ),
    sharesForDocuments: db.prepare<[string], ShareRow>(
      `SELECT s.document_id, s.user_id, u.name, u.email, s.permission, s.created_at
       FROM document_shares s JOIN users u ON u.id = s.user_id
       WHERE s.document_id IN (SELECT value FROM json_each(?))
       ORDER BY s.created_at, u.name`,
    ),
    insert: db.prepare(
      `INSERT INTO documents (id, title, content, owner_id, created_at, updated_at, trashed_at)
       VALUES (@id, @title, @content, @ownerId, @createdAt, @updatedAt, @trashedAt)`,
    ),
    // The version check makes the update atomic: a stale client version changes nothing.
    update: db.prepare<{ id: string; title: string; content: string; version: number; updatedAt: string }>(
      `UPDATE documents SET title = @title, content = @content, version = version + 1, updated_at = @updatedAt
       WHERE id = @id AND version = @version`,
    ),
    setTrashed: db.prepare<[string | null, string]>('UPDATE documents SET trashed_at = ? WHERE id = ?'),
    delete: db.prepare<[string]>('DELETE FROM documents WHERE id = ?'),
    upsertShare: db.prepare<[string, string, SharePermission, string]>(
      `INSERT INTO document_shares (document_id, user_id, permission, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (document_id, user_id) DO UPDATE SET permission = excluded.permission`,
    ),
    deleteShare: db.prepare<[string, string]>('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?'),
    setFavorite: db.prepare<[string, string, number]>(
      `INSERT INTO document_user_state (user_id, document_id, is_favorite) VALUES (?, ?, ?)
       ON CONFLICT (user_id, document_id) DO UPDATE SET is_favorite = excluded.is_favorite`,
    ),
    markOpened: db.prepare<[string, string, string]>(
      `INSERT INTO document_user_state (user_id, document_id, last_opened_at) VALUES (?, ?, ?)
       ON CONFLICT (user_id, document_id) DO UPDATE SET last_opened_at = excluded.last_opened_at`,
    ),
  }

  function toDtos(rows: AccessibleDocumentRow[]): DocumentDto[] {
    const shares = statements.sharesForDocuments.all(JSON.stringify(rows.map((row) => row.id)))
    const sharesByDocument = new Map<string, DocumentShareDto[]>()
    for (const share of shares) {
      const list = sharesByDocument.get(share.document_id) ?? []
      list.push({ userId: share.user_id, name: share.name, email: share.email, permission: share.permission, createdAt: share.created_at })
      sharesByDocument.set(share.document_id, list)
    }
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: JSON.parse(row.content),
      version: row.version,
      owner: { id: row.owner_id, name: row.owner_name, email: row.owner_email },
      permission: row.access,
      shares: sharesByDocument.get(row.id) ?? [],
      isFavorite: row.is_favorite === 1,
      lastOpenedAt: row.last_opened_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      trashedAt: row.trashed_at,
    }))
  }

  return {
    findById: (id: string) => statements.findById.get(id),
    findSharePermission: (documentId: string, userId: string) => statements.findShare.get(documentId, userId)?.permission,

    listAccessible: (userId: string) => toDtos(statements.listAccessible.all({ userId })),

    /** DTO from `userId`'s point of view. Callers must have checked access first. */
    getDto: (id: string, userId: string): DocumentDto => {
      const row = statements.findAccessible.get({ id, userId })
      if (!row) throw new Error(`Document ${id} disappeared`)
      return toDtos([row])[0]
    },

    insert: (doc: NewDocument) => {
      const timestamp = now()
      statements.insert.run({
        ...doc,
        createdAt: doc.createdAt ?? timestamp,
        updatedAt: doc.updatedAt ?? timestamp,
        trashedAt: doc.trashedAt ?? null,
      })
    },

    /** Returns false if `version` is stale (someone else saved first). */
    update: (id: string, changes: { title: string; content: string }, version: number) =>
      statements.update.run({ id, ...changes, version, updatedAt: now() }).changes === 1,

    setTrashed: (id: string, trashed: boolean) => statements.setTrashed.run(trashed ? now() : null, id),
    delete: (id: string) => statements.delete.run(id),

    upsertShare: (documentId: string, userId: string, permission: SharePermission) =>
      statements.upsertShare.run(documentId, userId, permission, now()),
    deleteShare: (documentId: string, userId: string) => statements.deleteShare.run(documentId, userId).changes === 1,

    setFavorite: (documentId: string, userId: string, favorite: boolean) =>
      statements.setFavorite.run(userId, documentId, favorite ? 1 : 0),
    markOpened: (documentId: string, userId: string) => statements.markOpened.run(userId, documentId, now()),

    transaction: <T>(fn: () => T) => db.transaction(fn)(),
  }
}

export type DocumentRepository = ReturnType<typeof createDocumentRepository>
