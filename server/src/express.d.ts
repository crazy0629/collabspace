import type { User } from './types.ts'

declare global {
  namespace Express {
    interface Request {
      /** Set by the demo auth middleware. */
      user?: User
    }
  }
}

export {}
