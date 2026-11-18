import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Toaster } from '../components/ui/Toaster'
import { ToastContext, type Toast, type ToastContextValue, type ToastTone } from './ToastContext'

const DURATION_MS = { success: 4000, info: 6000, error: 7000 }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((toast) => toast.id !== id)), [])

  const show = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++
      // Collapse identical messages (e.g. several failed requests while the server is down).
      setToasts((items) => [...items.filter((toast) => toast.message !== message), { id, tone, message }].slice(-4))
      window.setTimeout(() => dismiss(id), DURATION_MS[tone])
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(() => ({ toasts, show, dismiss }), [toasts, show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  )
}
