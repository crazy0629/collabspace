import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'

interface ModalProps {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}

/** Centered dialog. Render it conditionally; it closes on Escape or a backdrop click. */
export function Modal({ title, description, onClose, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useClickOutside(panelRef, onClose, true)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[10vh]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
