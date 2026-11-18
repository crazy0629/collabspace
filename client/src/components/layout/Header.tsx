import { Bell, CircleHelp, Menu, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatRelativeTime } from '../../lib/format'
import { useDocuments } from '../../store/useDocuments'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { UserMenu } from './UserMenu'

const iconButton =
  'relative flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900'

export function Header({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button type="button" onClick={onOpenSidebar} className={`${iconButton} lg:hidden`} aria-label="Open navigation">
        <Menu className="size-5" />
      </button>
      <SearchInput />
      <div className="ml-auto flex items-center gap-1">
        <HelpMenu />
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  )
}

function SearchInput() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  function setQuery(value: string) {
    setSearchParams(value ? { q: value } : {}, { replace: true })
  }

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
        placeholder="Search documents…"
        aria-label="Search documents"
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pr-16 pl-9 text-sm text-slate-900 placeholder:text-slate-400 transition-colors outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 [&::-webkit-search-cancel-button]:hidden"
      />
      {query ? (
        <button
          type="button"
          onClick={() => setQuery('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[11px] text-slate-400 sm:block">
          Ctrl K
        </kbd>
      )}
    </div>
  )
}

const SHORTCUTS = [
  { keys: 'Ctrl K', label: 'Search documents' },
  { keys: 'Ctrl S', label: 'Save now (in editor)' },
  { keys: 'Ctrl B', label: 'Bold (in editor)' },
  { keys: 'Ctrl I', label: 'Italic (in editor)' },
  { keys: 'Ctrl U', label: 'Underline (in editor)' },
  { keys: 'Ctrl Z', label: 'Undo (in editor)' },
]

function HelpMenu() {
  return (
    <Dropdown
      panelClassName="w-72"
      trigger={({ open, toggle }) => (
        <button type="button" onClick={toggle} className={iconButton} aria-label="Help" aria-expanded={open}>
          <CircleHelp className="size-5" />
        </button>
      )}
    >
      {() => (
        <div className="p-4">
          <p className="text-sm font-semibold text-slate-900">Keyboard shortcuts</p>
          <ul className="mt-3 space-y-2">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.keys} className="flex items-center justify-between text-sm text-slate-600">
                {shortcut.label}
                <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] text-slate-500">
                  {shortcut.keys}
                </kbd>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
            Tip: use a card’s <span className="font-medium text-slate-700">⋯</span> menu to favorite, duplicate, or move a
            document to the trash.
          </p>
        </div>
      )}
    </Dropdown>
  )
}

const NOTIFICATION_LIMIT = 10

function readStoredIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** "X shared Y with you" notifications, derived from the documents the server says are shared with you. */
function NotificationsMenu() {
  const { documents, currentUser } = useDocuments()
  const navigate = useNavigate()
  // Read state is a per-browser convenience, keyed by demo user.
  const storageKey = `collabspace.readNotifications.${currentUser.id}`
  const [readIds, setReadIds] = useState(() => readStoredIds(storageKey))

  const notifications = useMemo(
    () =>
      documents
        .filter((doc) => doc.permission !== 'owner')
        .map((doc) => {
          const sharedAt = doc.shares.find((share) => share.user.id === currentUser.id)?.sharedAt ?? doc.createdAt
          return { id: `${doc.id}:${sharedAt}`, doc, sharedAt }
        })
        .sort((a, b) => b.sharedAt - a.sharedAt)
        .slice(0, NOTIFICATION_LIMIT)
        .map((item) => ({ ...item, read: readIds.includes(item.id) })),
    [documents, currentUser.id, readIds],
  )
  const unreadCount = notifications.filter((n) => !n.read).length

  function markRead(ids: string[]) {
    const next = [...new Set([...readIds, ...ids])]
    setReadIds(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Storage unavailable; read state just won't persist.
    }
  }

  return (
    <Dropdown
      panelClassName="w-80"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={iconButton}
          aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
          aria-expanded={open}
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 size-2 rounded-full bg-indigo-600 ring-2 ring-white" />
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markRead(notifications.map((n) => n.id))}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                Mark all as read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              When someone shares a document with you, it will show up here.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {notifications.map(({ id, doc, sharedAt, read }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      markRead([id])
                      close()
                      navigate(`/documents/${doc.id}`)
                    }}
                    className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <Avatar user={doc.owner} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">{doc.owner.name}</span> shared{' '}
                        <span className="font-medium text-slate-900">{doc.title}</span> with you
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {doc.permission === 'editor' ? 'Can edit' : 'Can view'} · {formatRelativeTime(sharedAt)}
                      </p>
                    </div>
                    {!read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-indigo-600" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dropdown>
  )
}
