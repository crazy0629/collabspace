import type { DB } from '../db/database.ts'
import type { User } from '../types.ts'

interface UserRow {
  id: string
  name: string
  email: string
  created_at: string
}

const toUser = (row: UserRow): User => ({ id: row.id, name: row.name, email: row.email, createdAt: row.created_at })

export function createUserRepository(db: DB) {
  const list = db.prepare<[], UserRow>('SELECT * FROM users ORDER BY created_at, name')
  const byId = db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?')
  const byEmail = db.prepare<[string], UserRow>('SELECT * FROM users WHERE email = ? COLLATE NOCASE')

  return {
    list: () => list.all().map(toUser),
    findById: (id: string) => {
      const row = byId.get(id)
      return row ? toUser(row) : undefined
    },
    findByEmail: (email: string) => {
      const row = byEmail.get(email)
      return row ? toUser(row) : undefined
    },
  }
}

export type UserRepository = ReturnType<typeof createUserRepository>
