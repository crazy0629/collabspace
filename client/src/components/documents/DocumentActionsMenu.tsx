import { Copy, ExternalLink, FileText, MoreHorizontal, RotateCcw, Star, StarOff, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDocuments } from '../../store/useDocuments'
import type { Document } from '../../types'
import { Dropdown, MenuItem } from '../ui/Dropdown'

const iconClass = 'size-4 text-slate-400'

export function DocumentActionsMenu({ document }: { document: Document }) {
  const { toggleFavorite, duplicateDocument, moveToTrash, restoreDocument, deleteForever } = useDocuments()
  const navigate = useNavigate()
  const isOwner = document.permission === 'owner'
  const path = `/documents/${document.id}`

  return (
    <Dropdown
      panelClassName="w-52"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Actions for ${document.title}`}
          aria-expanded={open}
          className={`rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 ${
            open ? 'bg-slate-100 text-slate-700' : ''
          }`}
        >
          <MoreHorizontal className="size-5" />
        </button>
      )}
    >
      {(close) => {
        const run = (action: () => void) => () => {
          close()
          action()
        }

        if (document.trashedAt) {
          return (
            <div className="py-1">
              <MenuItem icon={<RotateCcw className={iconClass} />} onSelect={run(() => restoreDocument(document.id))}>
                Restore
              </MenuItem>
              <MenuItem
                tone="danger"
                icon={<Trash2 className="size-4" />}
                onSelect={run(() => {
                  if (window.confirm(`Delete “${document.title}” forever? This can’t be undone.`)) {
                    deleteForever(document.id)
                  }
                })}
              >
                Delete forever
              </MenuItem>
            </div>
          )
        }

        return (
          <div className="py-1">
            <MenuItem icon={<FileText className={iconClass} />} onSelect={run(() => navigate(path))}>
              Open
            </MenuItem>
            <MenuItem icon={<ExternalLink className={iconClass} />} onSelect={run(() => window.open(path, '_blank'))}>
              Open in new tab
            </MenuItem>
            <MenuItem
              icon={document.isFavorite ? <StarOff className={iconClass} /> : <Star className={iconClass} />}
              onSelect={run(() => toggleFavorite(document.id))}
            >
              {document.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            </MenuItem>
            <MenuItem icon={<Copy className={iconClass} />} onSelect={run(() => duplicateDocument(document.id))}>
              Make a copy
            </MenuItem>
            {isOwner && (
              <>
                <div className="my-1 border-t border-slate-100" />
                <MenuItem tone="danger" icon={<Trash2 className="size-4" />} onSelect={run(() => moveToTrash(document.id))}>
                  Move to trash
                </MenuItem>
              </>
            )}
          </div>
        )
      }}
    </Dropdown>
  )
}
