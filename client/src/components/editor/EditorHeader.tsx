import { ArrowLeft, Crown, Eye, FileUp, PenLine, Share2, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Autosave } from '../../hooks/useAutosave'
import { useDocuments } from '../../store/useDocuments'
import type { Access, Document } from '../../types'
import { UserMenu } from '../layout/UserMenu'
import { Logo } from '../ui/Logo'
import { DocumentTitleInput } from './DocumentTitleInput'
import { SaveStatusIndicator } from './SaveStatusIndicator'

interface EditorHeaderProps {
  doc: Document
  title: string
  onTitleChange: (title: string) => void
  onTitleSubmit: () => void
  autoSelectTitle: boolean
  readOnly: boolean
  autosave: Pick<Autosave<object>, 'status' | 'lastSavedAt' | 'flush'>
  onShare: () => void
  /** Opens the file import dialog; omitted when the user can't edit. */
  onImport?: () => void
}

export function EditorHeader({
  doc,
  title,
  onTitleChange,
  onTitleSubmit,
  autoSelectTitle,
  readOnly,
  autosave,
  onShare,
  onImport,
}: EditorHeaderProps) {
  const { toggleFavorite } = useDocuments()
  const owner = doc.owner
  const isOwner = doc.permission === 'owner'

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5">
      <Link
        to="/"
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        aria-label="Back to dashboard"
        title="Back to dashboard"
      >
        <ArrowLeft className="size-5" />
        <span className="hidden md:inline">Dashboard</span>
      </Link>
      <span className="hidden h-6 w-px bg-slate-200 sm:block" />
      <div className="hidden shrink-0 sm:block">
        <Logo compact />
      </div>

      <div className="min-w-0 flex-1">
        <DocumentTitleInput
          value={title}
          onChange={onTitleChange}
          onSubmit={onTitleSubmit}
          readOnly={readOnly}
          autoSelect={autoSelectTitle}
        />
        <div className="flex min-w-0 items-center gap-1.5 px-2 text-xs whitespace-nowrap">
          <AccessBadge permission={doc.permission} />
          {!isOwner && (
            <span className="hidden items-center gap-1 text-slate-500 lg:inline-flex">
              Shared by {owner.name}
              <span aria-hidden="true">·</span>
            </span>
          )}
          {readOnly ? (
            // Viewers already see the "View only" badge; trashed documents are read-only too.
            doc.trashedAt && <span className="text-slate-500">In trash</span>
          ) : (
            <SaveStatusIndicator status={autosave.status} lastSavedAt={autosave.lastSavedAt} onRetry={autosave.flush} />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {!doc.trashedAt && (
          <button
            type="button"
            onClick={() => toggleFavorite(doc.id)}
            aria-pressed={doc.isFavorite}
            aria-label={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            title={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <Star className={`size-5 ${doc.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
        )}
        {onImport && (
          <button
            type="button"
            onClick={onImport}
            title="Import a .txt or .md file at the cursor"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileUp className="size-4" />
            <span className="hidden sm:inline">Import</span>
          </button>
        )}
        <button
          type="button"
          onClick={onShare}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 sm:px-4"
        >
          <Share2 className="size-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
        <UserMenu />
      </div>
    </div>
  )
}

const ACCESS_BADGES: Record<Access, { label: string; icon: typeof Eye; className: string }> = {
  owner: { label: 'Owner', icon: Crown, className: 'bg-indigo-50 text-indigo-700' },
  editor: { label: 'Can edit', icon: PenLine, className: 'bg-sky-50 text-sky-700' },
  viewer: { label: 'View only', icon: Eye, className: 'bg-amber-50 text-amber-800' },
}

function AccessBadge({ permission }: { permission: Access }) {
  const { label, icon: Icon, className } = ACCESS_BADGES[permission]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium ${className}`}>
      <Icon className="size-3" />
      {label}
    </span>
  )
}
