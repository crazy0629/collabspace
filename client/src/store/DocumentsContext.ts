import { createContext } from 'react'
import type { Document, DocumentContent, SharePermission, User } from '../types'

export type LoadStatus = 'loading' | 'ready' | 'error'

export interface DocumentsContextValue {
  currentUser: User
  status: LoadStatus
  loadError: string | null
  /** Documents the current user owns or has been granted access to. */
  documents: Document[]
  /** Re-fetches the list without showing a loading state. */
  refresh: () => Promise<void>
  getDocument: (id: string) => Document | undefined
  /** Fetches one document from the API and caches it. Rejects with ApiError (403/404…). */
  fetchDocument: (id: string) => Promise<Document>
  /** Replaces the cached copy, e.g. with the latest version after a conflict. */
  upsertDocument: (doc: Document) => void
  createDocument: () => Promise<Document>
  /** Uploads a .txt/.md file as a new document. Rejects with ApiError for invalid files. */
  importFile: (file: File, onProgress?: (fraction: number) => void) => Promise<Document>
  /** Converts a .txt/.md file to TipTap content for document `id` (edit access required); nothing is saved. */
  convertFileForDocument: (id: string, file: File, onProgress?: (fraction: number) => void) => Promise<DocumentContent>
  /**
   * Persists title/content edits made on top of `baseVersion` and resolves with the saved
   * document. Rejects (incl. DocumentConflictError) so autosave can react.
   */
  saveDocument: (
    id: string,
    changes: { title?: string; content?: DocumentContent },
    baseVersion: number,
  ) => Promise<Document>
  markOpened: (id: string) => void
  toggleFavorite: (id: string) => void
  duplicateDocument: (id: string) => Promise<Document | undefined>
  moveToTrash: (id: string) => void
  restoreDocument: (id: string) => void
  deleteForever: (id: string) => void
  shareDocument: (id: string, email: string, permission: SharePermission) => Promise<void>
  updateSharePermission: (id: string, userId: string, permission: SharePermission) => void
  removeShare: (id: string, userId: string) => void
}

export const DocumentsContext = createContext<DocumentsContextValue | null>(null)
