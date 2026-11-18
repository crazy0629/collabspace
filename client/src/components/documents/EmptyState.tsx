import { FilePlus2, SearchX, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  message: string
  icon?: LucideIcon
  action?: ReactNode
}

export function EmptyState({ title, message, icon: Icon = FilePlus2, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-16 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 -m-3 rounded-3xl bg-indigo-100/60 blur-xl" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl border border-slate-200 bg-white text-indigo-600 shadow-sm">
          <Icon className="size-7" strokeWidth={1.75} />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function NoSearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title={`No results for “${query}”`}
      message="Try a different title or owner name, or clear the search to see all documents."
      action={
        <button
          type="button"
          onClick={onClear}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50"
        >
          Clear search
        </button>
      }
    />
  )
}
