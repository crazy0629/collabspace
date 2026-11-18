import type { Document } from '../../types'
import { DocumentCard } from './DocumentCard'

const gridClass = 'grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'

export function DocumentGrid({ documents }: { documents: Document[] }) {
  return (
    <div className={gridClass}>
      {documents.map((document) => (
        <DocumentCard key={document.id} document={document} />
      ))}
    </div>
  )
}

export function DocumentGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={gridClass} aria-busy="true" aria-label="Loading documents">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-white">
          <div className="h-32 rounded-t-2xl bg-slate-50" />
          <div className="space-y-3 p-4">
            <div className="h-3 w-2/3 rounded bg-slate-100" />
            <div className="h-2.5 w-1/3 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  )
}
