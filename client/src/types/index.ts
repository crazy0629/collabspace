import type { JSONContent } from '@tiptap/react'

export interface User {
  id: string
  name: string
  email: string
  /** Tailwind background class used for the avatar. */
  color: string
}

/** TipTap/ProseMirror document JSON. */
export type DocumentContent = JSONContent

export type SharePermission = 'viewer' | 'editor'

/** The current user's access to a document, as decided by the server. */
export type Access = 'owner' | SharePermission

export interface DocumentShare {
  user: User
  permission: SharePermission
  sharedAt: number
}

export interface Document {
  id: string
  title: string
  content: DocumentContent
  /** Increments on every title/content change; sent back on save to detect conflicts. */
  version: number
  owner: User
  permission: Access
  shares: DocumentShare[]
  createdAt: number
  updatedAt: number
  lastOpenedAt: number | null
  isFavorite: boolean
  trashedAt: number | null
}

export type DocumentView = 'all' | 'mine' | 'shared' | 'favorites' | 'trash'

export type SaveStatus = 'saved' | 'saving' | 'error'
