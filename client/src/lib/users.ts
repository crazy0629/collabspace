import type { User } from '../types'

const AVATAR_COLORS = ['bg-indigo-600', 'bg-rose-500', 'bg-emerald-600', 'bg-amber-500', 'bg-sky-600', 'bg-violet-600']

/** Stable avatar color per user id. */
export function userColor(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function toUser(user: { id: string; name: string; email: string }): User {
  return { id: user.id, name: user.name, email: user.email, color: userColor(user.id) }
}
