import { createContext } from 'react'
import type { User } from '../types'

export interface SessionContextValue {
  /** All demo accounts (from GET /api/users). */
  users: User[]
  currentUser: User
  /** Switches the simulated signed-in account. */
  switchUser: (userId: string) => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)
