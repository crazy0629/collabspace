import { Layers } from 'lucide-react'
import { Link } from 'react-router-dom'

/** `compact` shows only the mark, e.g. in the editor's top bar. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="CollabSpace home"
      className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-indigo-500"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/30">
        <Layers className="size-5" strokeWidth={2.25} />
      </span>
      {!compact && <span className="text-[17px] font-semibold tracking-tight text-slate-900">CollabSpace</span>}
    </Link>
  )
}
