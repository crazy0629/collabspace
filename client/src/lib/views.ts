import { FileText, Star, Trash2, User, Users, type LucideIcon } from 'lucide-react'
import type { Document, DocumentView } from '../types'

export interface ViewConfig {
  view: DocumentView
  path: string
  label: string
  icon: LucideIcon
  description: string
  emptyTitle: string
  emptyMessage: string
}

export const VIEWS: ViewConfig[] = [
  {
    view: 'all',
    path: '/',
    label: 'All Documents',
    icon: FileText,
    description: 'Every document you own or have access to.',
    emptyTitle: 'Create your first document',
    emptyMessage: 'Start writing, invite your team, and collaborate in real time — all in one place.',
  },
  {
    view: 'mine',
    path: '/my-documents',
    label: 'My Documents',
    icon: User,
    description: 'Documents you created and own.',
    emptyTitle: 'You haven’t created any documents yet',
    emptyMessage: 'Documents you create will appear here. Start with a blank page.',
  },
  {
    view: 'shared',
    path: '/shared',
    label: 'Shared with Me',
    icon: Users,
    description: 'Documents your teammates have shared with you.',
    emptyTitle: 'Nothing shared with you yet',
    emptyMessage: 'When teammates share documents with you, they’ll show up here.',
  },
  {
    view: 'favorites',
    path: '/favorites',
    label: 'Favorites',
    icon: Star,
    description: 'Documents you starred for quick access.',
    emptyTitle: 'No favorites yet',
    emptyMessage: 'Star a document from its actions menu to keep it one click away.',
  },
  {
    view: 'trash',
    path: '/trash',
    label: 'Trash',
    icon: Trash2,
    description: 'Deleted documents. Restore them or delete them forever.',
    emptyTitle: 'Trash is empty',
    emptyMessage: 'Documents you move to the trash will appear here.',
  },
]

export function filterByView(documents: Document[], view: DocumentView): Document[] {
  switch (view) {
    case 'all':
      return documents.filter((doc) => !doc.trashedAt)
    case 'mine':
      return documents.filter((doc) => !doc.trashedAt && doc.permission === 'owner')
    case 'shared':
      return documents.filter((doc) => !doc.trashedAt && doc.permission !== 'owner')
    case 'favorites':
      return documents.filter((doc) => !doc.trashedAt && doc.isFavorite)
    case 'trash':
      return documents.filter((doc) => doc.trashedAt)
  }
}
