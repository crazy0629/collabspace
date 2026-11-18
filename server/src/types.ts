export type SharePermission = 'viewer' | 'editor'

/** What the current user may do with a document. */
export type Access = 'owner' | SharePermission

export interface User {
  id: string
  name: string
  email: string
  createdAt: string
}

export interface DocumentShareDto {
  userId: string
  name: string
  email: string
  permission: SharePermission
  createdAt: string
}

export interface DocumentDto {
  id: string
  title: string
  content: unknown
  version: number
  owner: Pick<User, 'id' | 'name' | 'email'>
  /** The requesting user's access level. */
  permission: Access
  shares: DocumentShareDto[]
  isFavorite: boolean
  lastOpenedAt: string | null
  createdAt: string
  updatedAt: string
  trashedAt: string | null
}
