import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { migrations } from './schema.ts'

export type DB = Database.Database

export function openDatabase(filename: string): DB {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true })

  const db = new Database(filename)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  return db
}

function migrate(db: DB) {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let index = current; index < migrations.length; index++) {
    db.transaction(() => {
      db.exec(migrations[index])
      db.pragma(`user_version = ${index + 1}`)
    })()
  }
}

export function now(): string {
  return new Date().toISOString()
}
