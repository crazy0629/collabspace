import { ChevronsUpDown, LoaderCircle, Plus, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useCreateDocument } from '../../hooks/useCreateDocument'
import { VIEWS, filterByView } from '../../lib/views'
import { useDocuments } from '../../store/useDocuments'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { Logo } from '../ui/Logo'
import { DemoAccountList } from './DemoAccountList'

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { documents, currentUser } = useDocuments()
  const { create: createDocument, creating } = useCreateDocument()

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-slate-50 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/60 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-4 pt-2 pb-4">
          <button
            type="button"
            onClick={createDocument}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-wait disabled:opacity-70"
          >
            {creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={2.5} />}
            New Document
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Documents">
          {VIEWS.map(({ view, path, label, icon: Icon }) => {
            const count = filterByView(documents, view).length
            return (
              <NavLink
                key={view}
                to={path}
                end
                onClick={onClose}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`size-4.5 ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    <span className="flex-1">{label}</span>
                    {count > 0 && (
                      <span className={`text-xs tabular-nums ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>{count}</span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <Dropdown
            side="top"
            align="left"
            panelClassName="w-full min-w-58"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-label="Switch demo account"
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-slate-200/50"
              >
                <Avatar user={currentUser} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-900">{currentUser.name}</span>
                    <span className="rounded bg-amber-100 px-1 py-px text-[10px] font-semibold text-amber-800 uppercase">Demo</span>
                  </span>
                  <span className="block truncate text-xs text-slate-500">{currentUser.email}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
              </button>
            )}
          >
            {(close) => <DemoAccountList onSwitched={close} />}
          </Dropdown>
        </div>
      </aside>
    </>
  )
}
