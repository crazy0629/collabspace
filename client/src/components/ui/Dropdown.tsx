import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'

interface DropdownProps {
  /** Renders the trigger; call `toggle` from its click handler. */
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  /** Open below (default) or above the trigger, e.g. for triggers at the bottom of the screen. */
  side?: 'bottom' | 'top'
  panelClassName?: string
}

export function Dropdown({ trigger, children, align = 'right', side = 'bottom', panelClassName = 'w-56' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((value) => !value), [])

  useClickOutside(ref, close, open)

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle })}
      {open && (
        <div
          role="menu"
          className={`absolute z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10 ${
            side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
          } ${align === 'right' ? 'right-0' : 'left-0'} ${panelClassName}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

interface MenuItemProps {
  icon?: ReactNode
  children: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
}

export function MenuItem({ icon, children, onSelect, tone = 'default' }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
        tone === 'danger' ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}
