import { useContext, useMemo } from 'react'
import { errorMessage } from '../lib/api'
import { ToastContext } from './ToastContext'

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within a ToastProvider')
  const { show } = context
  return useMemo(
    () => ({
      success: (message: string) => show('success', message),
      info: (message: string) => show('info', message),
      /** Shows the server's error message (or a generic one). */
      error: (error: unknown) => show('error', typeof error === 'string' ? error : errorMessage(error)),
    }),
    [show],
  )
}
