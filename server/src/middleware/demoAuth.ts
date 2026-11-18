/**
 * SIMULATED AUTHENTICATION — DEMO ONLY, NOT SECURE.
 *
 * The caller says who they are via the `x-demo-user-id` header and we believe them.
 * Anyone can impersonate any seeded user. This exists so reviewers can exercise the
 * authorization rules without a login flow; replace it with real authentication
 * (sessions or signed tokens) before any real deployment.
 */
import type { Request, RequestHandler } from 'express'
import { HttpError } from '../errors.ts'
import type { UserRepository } from '../repositories/userRepository.ts'
import type { User } from '../types.ts'
import { isValidUserId } from '../validation.ts'

export const DEMO_USER_HEADER = 'x-demo-user-id'

/** The user attached by `demoAuth`; throws 401 if a route is reached without it. */
export function currentUser(req: Request): User {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Not authenticated.')
  return req.user
}

export function demoAuth(users: UserRepository): RequestHandler {
  return (req, _res, next) => {
    const userId = req.get(DEMO_USER_HEADER)
    if (!userId) {
      throw new HttpError(401, 'unauthenticated', `Missing ${DEMO_USER_HEADER} header.`)
    }
    const user = isValidUserId(userId) ? users.findById(userId) : undefined
    if (!user) throw new HttpError(401, 'unknown_user', 'Unknown demo user.')
    req.user = user
    next()
  }
}
