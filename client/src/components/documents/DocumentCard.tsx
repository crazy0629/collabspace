import { Eye, FileText, PenLine, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getExcerpt } from '../../lib/documentContent'
import { formatRelativeTime } from '../../lib/format'
import { useDocuments } from '../../store/useDocuments'
import type { Document } from '../../types'
import { Avatar, AvatarStack } from '../ui/Avatar'
import { DocumentActionsMenu } from './DocumentActionsMenu'

export function DocumentCard({ document }: { document: Document }) {
  const { currentUser } = useDocuments()
  const owner = document.owner
  const isOwner = document.permission === 'owner'
  const collaborators = document.shares.map((share) => share.user).filter((user) => user.id !== currentUser.id)
  const excerpt = getExcerpt(document.content)

  return (
    <article className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs transition-all hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5">
      {/* Stretched link keeps the whole card clickable without nesting the actions menu inside an anchor. */}
      <Link
        to={`/documents/${document.id}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        aria-label={`Open ${document.title}`}
      />

      <div className="pointer-events-none relative h-32 overflow-hidden rounded-t-2xl border-b border-slate-100 bg-slate-50 px-5 pt-4">
        <div className="h-full rounded-t-lg border border-b-0 border-slate-200 bg-white px-4 pt-3 shadow-xs">
          <p className="truncate text-[11px] font-semibold text-slate-800">{document.title}</p>
          {excerpt ? (
            <p className="mt-1.5 line-clamp-4 text-[10px] leading-relaxed text-slate-400">{excerpt}</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              <div className="h-1.5 w-3/4 rounded bg-slate-100" />
              <div className="h-1.5 w-1/2 rounded bg-slate-100" />
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute top-3 right-3 flex gap-1.5">
          {document.isFavorite && (
            <span className="flex size-6 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
              isOwner ? 'bg-indigo-50 text-indigo-600' : 'bg-sky-50 text-sky-600'
            }`}
          >
            <FileText className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-slate-900">{document.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {document.trashedAt
                ? `Trashed ${formatRelativeTime(document.trashedAt).toLowerCase()}`
                : `Edited ${formatRelativeTime(document.updatedAt).toLowerCase()}`}
            </p>
          </div>
          <div className="relative z-10 -mt-1 -mr-1">
            <DocumentActionsMenu document={document} />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar user={owner} size="xs" />
            <span className="truncate text-xs text-slate-600">{isOwner ? 'You' : owner.name}</span>
            {isOwner ? (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">Owner</span>
            ) : (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
                title={`Shared with you · ${document.permission === 'editor' ? 'you can edit' : 'view only'}`}
              >
                {document.permission === 'editor' ? <PenLine className="size-3" /> : <Eye className="size-3" />}
                {document.permission === 'editor' ? 'Editor' : 'Viewer'}
              </span>
            )}
          </div>
          {collaborators.length > 0 && <AvatarStack users={collaborators} />}
        </div>
      </div>
    </article>
  )
}
