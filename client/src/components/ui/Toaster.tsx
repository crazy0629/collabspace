import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useContext } from 'react'
import { ToastContext, type ToastTone } from '../../store/ToastContext'

const TONES: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: 'text-emerald-600' },
  error: { icon: CircleAlert, className: 'text-rose-600' },
  info: { icon: Info, className: 'text-indigo-600' },
}

export function Toaster() {
  const context = useContext(ToastContext)
  if (!context) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      aria-live="polite"
    >
      {context.toasts.map((toast) => {
        const { icon: Icon, className } = TONES[toast.tone]
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg shadow-slate-900/10"
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} />
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => context.dismiss(toast.id)}
              className="-mr-1 rounded p-0.5 text-slate-400 hover:text-slate-700"
              aria-label="Dismiss notification"
            >
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
