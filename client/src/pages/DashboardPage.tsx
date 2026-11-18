import { Clock, CloudOff, LoaderCircle, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DocumentGrid, DocumentGridSkeleton } from '../components/documents/DocumentGrid'
import { EmptyState, NoSearchResults } from '../components/documents/EmptyState'
import { ImportDocumentButton } from '../components/import/ImportDocumentButton'
import { useCreateDocument } from '../hooks/useCreateDocument'
import { getPlainText } from '../lib/documentContent'
import { getGreeting } from '../lib/format'
import { VIEWS, filterByView } from '../lib/views'
import { useDocuments } from '../store/useDocuments'
import type { Document, DocumentView } from '../types'

const RECENT_LIMIT = 4

function matchesQuery(doc: Document, query: string): boolean {
  const haystack = `${doc.title} ${doc.owner.name} ${getPlainText(doc.content)}`
  return haystack.toLowerCase().includes(query)
}

export function DashboardPage({ view }: { view: DocumentView }) {
  const { documents, currentUser, status, loadError, refresh } = useDocuments()
  const [searchParams, setSearchParams] = useSearchParams()
  const { create: createDocument, creating } = useCreateDocument()
  const config = VIEWS.find((v) => v.view === view)!
  const query = (searchParams.get('q') ?? '').trim()

  // Returning to the dashboard (e.g. from the editor) picks up changes made by other users.
  // The initial load is handled by DocumentsProvider, so only refresh if data is already there.
  const initialStatus = useRef(status)
  useEffect(() => {
    if (initialStatus.current === 'ready') refresh()
  }, [refresh])

  const viewDocuments = useMemo(() => {
    const sortKey = (doc: Document) => (view === 'trash' ? (doc.trashedAt ?? 0) : doc.updatedAt)
    return filterByView(documents, view).sort((a, b) => sortKey(b) - sortKey(a))
  }, [documents, view])

  const visibleDocuments = useMemo(
    () => (query ? viewDocuments.filter((doc) => matchesQuery(doc, query.toLowerCase())) : viewDocuments),
    [viewDocuments, query],
  )

  const recentDocuments = useMemo(
    () =>
      viewDocuments
        .filter((doc) => doc.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
        .slice(0, RECENT_LIMIT),
    [viewDocuments],
  )

  const isHome = view === 'all'
  const canCreate = view !== 'trash'
  const createActions = (
    <div className="flex flex-wrap items-center gap-2">
      <ImportDocumentButton />
      <button
        type="button"
        onClick={createDocument}
        disabled={creating}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-wait disabled:opacity-70"
      >
        {creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={2.5} />}
        Create New Document
      </button>
    </div>
  )

  let body: ReactNode
  if (status === 'loading') {
    body = <DocumentGridSkeleton />
  } else if (status === 'error') {
    body = (
      <EmptyState
        icon={CloudOff}
        title="Couldn’t load your documents"
        message={loadError ?? 'Something went wrong while loading documents.'}
        action={
          <button
            type="button"
            onClick={refresh}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50"
          >
            Retry
          </button>
        }
      />
    )
  } else if (viewDocuments.length === 0) {
    body = (
      <EmptyState
        icon={isHome ? undefined : config.icon}
        title={config.emptyTitle}
        message={config.emptyMessage}
        action={canCreate && (view === 'all' || view === 'mine') ? createActions : undefined}
      />
    )
  } else if (query) {
    body = (
      <Section title={`Results for “${query}”`} count={visibleDocuments.length}>
        {visibleDocuments.length > 0 ? (
          <DocumentGrid documents={visibleDocuments} />
        ) : (
          <NoSearchResults query={query} onClear={() => setSearchParams({}, { replace: true })} />
        )}
      </Section>
    )
  } else {
    body = (
      <div className="space-y-10">
        {isHome && recentDocuments.length > 0 && (
          <Section title="Recently opened" icon={<Clock className="size-4 text-slate-400" />}>
            <DocumentGrid documents={recentDocuments} />
          </Section>
        )}
        <Section title={isHome ? 'All documents' : config.label} count={viewDocuments.length}>
          <DocumentGrid documents={viewDocuments} />
        </Section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {isHome ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {getGreeting()}, {currentUser.name.split(' ')[0]}
              </h1>
              <p className="mt-2 text-slate-500">Manage your documents and collaborate with your team.</p>
            </>
          ) : (
            <>
              <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-900">
                <config.icon className="size-6 text-indigo-600" />
                {config.label}
              </h1>
              <p className="mt-2 text-slate-500">{config.description}</p>
            </>
          )}
        </div>
        {canCreate && viewDocuments.length > 0 && <div className="shrink-0">{createActions}</div>}
      </div>
      {body}
    </div>
  )
}

interface SectionProps {
  title: string
  count?: number
  icon?: ReactNode
  children: ReactNode
}

function Section({ title, count, icon, children }: SectionProps) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 tabular-nums">{count}</span>
        )}
      </div>
      {children}
    </section>
  )
}
