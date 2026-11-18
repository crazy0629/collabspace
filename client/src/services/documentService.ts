/**
 * Document persistence via the CollabSpace API. Replaces the earlier localStorage service;
 * callers get the same `Document` shape as before (timestamps as epoch milliseconds).
 */
import { ApiError, apiRequest, uploadRequest } from '../lib/api'
import { toUser } from '../lib/users'
import type { Access, Document, DocumentContent, SharePermission } from '../types'

interface UserDto {
  id: string
  name: string
  email: string
}

interface DocumentDto {
  id: string
  title: string
  content: DocumentContent
  version: number
  owner: UserDto
  permission: Access
  shares: Array<UserDto & { userId: string; permission: SharePermission; createdAt: string }>
  isFavorite: boolean
  lastOpenedAt: string | null
  createdAt: string
  updatedAt: string
  trashedAt: string | null
}

const toMillis = (iso: string | null) => (iso ? Date.parse(iso) : null)

function toDocument(dto: DocumentDto): Document {
  return {
    id: dto.id,
    title: dto.title,
    content: dto.content,
    version: dto.version,
    owner: toUser(dto.owner),
    permission: dto.permission,
    shares: dto.shares.map((share) => ({
      user: toUser({ id: share.userId, name: share.name, email: share.email }),
      permission: share.permission,
      sharedAt: Date.parse(share.createdAt),
    })),
    isFavorite: dto.isFavorite,
    lastOpenedAt: toMillis(dto.lastOpenedAt),
    createdAt: Date.parse(dto.createdAt),
    updatedAt: Date.parse(dto.updatedAt),
    trashedAt: toMillis(dto.trashedAt),
  }
}

/** Thrown when a save is rejected because someone else saved first. */
export class DocumentConflictError extends ApiError {
  readonly latest: Document

  constructor(error: ApiError, latest: Document) {
    super(error.status, error.code, error.message, error.details)
    this.name = 'DocumentConflictError'
    this.latest = latest
  }
}

export interface LegacyDocumentImport {
  title: string
  content: DocumentContent
  createdAt: number
  updatedAt: number
  isFavorite: boolean
  trashed: boolean
}

/** Document API bound to one (demo) user, so in-flight requests keep their identity. */
export function createDocumentService(userId: string) {
  const request = async (method: string, path: string, body?: unknown) => {
    const { document } = await apiRequest<{ document: DocumentDto }>(method, `/documents${path}`, { userId, body })
    return toDocument(document)
  }

  return {
    async listDocuments(): Promise<Document[]> {
      const { documents } = await apiRequest<{ documents: DocumentDto[] }>('GET', '/documents', { userId })
      return documents.map(toDocument)
    },

    getDocument: (id: string) => request('GET', `/${encodeURIComponent(id)}`),

    createDocument: (input: { title?: string; content?: DocumentContent } = {}) => request('POST', '', input),

    /** Saves title/content against `version`; throws DocumentConflictError if it's stale. */
    async updateDocument(id: string, changes: { title?: string; content?: DocumentContent }, version: number) {
      try {
        return await request('PATCH', `/${id}`, { ...changes, version })
      } catch (error) {
        const latest = (error as ApiError).details as { document?: DocumentDto } | undefined
        if (error instanceof ApiError && error.code === 'version_conflict' && latest?.document) {
          throw new DocumentConflictError(error, toDocument(latest.document))
        }
        throw error
      }
    },

    setTrashed: (id: string, trashed: boolean) => request('PATCH', `/${id}`, { trashed }),

    deleteDocument: (id: string) => apiRequest<void>('DELETE', `/documents/${id}`, { userId }),

    setFavorite: (id: string, isFavorite: boolean) => request('PUT', `/${id}/favorite`, { isFavorite }),

    markOpened: (id: string) => request('POST', `/${id}/open`),

    shareDocument: (id: string, email: string, permission: SharePermission) =>
      request('PUT', `/${id}/shares`, { email, permission }),

    updateSharePermission: (id: string, targetUserId: string, permission: SharePermission) =>
      request('PUT', `/${id}/shares`, { userId: targetUserId, permission }),

    removeShare: (id: string, targetUserId: string) => request('DELETE', `/${id}/shares/${encodeURIComponent(targetUserId)}`),

    /** Uploads a .txt/.md file as a new document owned by the user. */
    async importFile(file: File, onProgress?: (fraction: number) => void): Promise<Document> {
      const form = new FormData()
      form.append('file', file)
      const { document } = await uploadRequest<{ document: DocumentDto }>('/documents/import', form, { userId, onProgress })
      return toDocument(document)
    },

    /**
     * Converts a .txt/.md file into TipTap content for an existing document without saving it
     * (requires edit access). The editor inserts it at the cursor and autosave persists it.
     */
    async convertFile(documentId: string, file: File, onProgress?: (fraction: number) => void): Promise<DocumentContent> {
      const form = new FormData()
      form.append('documentId', documentId)
      form.append('mode', 'convert')
      form.append('file', file)
      const { content } = await uploadRequest<{ content: DocumentContent }>('/documents/import', form, { userId, onProgress })
      return content
    },

    importDocument: (doc: LegacyDocumentImport) =>
      request('POST', '/import', {
        title: doc.title,
        content: doc.content,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
        isFavorite: doc.isFavorite,
        trashed: doc.trashed,
      }),
  }
}

export type DocumentService = ReturnType<typeof createDocumentService>
