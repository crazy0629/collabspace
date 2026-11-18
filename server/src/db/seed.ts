import type { DB } from './database.ts'
import { now } from './database.ts'

/** Demo accounts used with the simulated `x-demo-user-id` header. IDs are stable on purpose. */
export const DEMO_USERS = [
  { id: 'george', name: 'George', email: 'george@example.com' },
  { id: 'alex', name: 'Alex', email: 'alex@example.com' },
  { id: 'jordan', name: 'Jordan', email: 'jordan@example.com' },
] as const

const text = (value: string, marks: string[] = []) => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
})
const paragraph = (...parts: ReturnType<typeof text>[]) => ({ type: 'paragraph', content: parts })
const heading = (level: number, value: string) => ({ type: 'heading', attrs: { level }, content: [text(value)] })
const bulletList = (...items: string[]) => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(text(item))] })),
})
const doc = (...content: object[]) => ({ type: 'doc', content })

const DEMO_DOCUMENTS = [
  {
    id: '6f1b2c4e-1d3a-4b8e-9c7f-0a1b2c3d4e01',
    ownerId: 'george',
    title: 'Welcome to CollabSpace',
    content: doc(
      heading(1, 'Welcome to CollabSpace'),
      paragraph(text('This document is owned by '), text('George', ['bold']), text(' and shared with Alex (editor) and Jordan (viewer).')),
      heading(2, 'Try it'),
      bulletList('Switch demo accounts from the sidebar', 'Edit as Alex — changes save automatically', 'Open as Jordan — the document is read-only'),
    ),
    shares: [
      { userId: 'alex', permission: 'editor' },
      { userId: 'jordan', permission: 'viewer' },
    ],
  },
  {
    id: '6f1b2c4e-1d3a-4b8e-9c7f-0a1b2c3d4e02',
    ownerId: 'george',
    title: 'Q1 Planning (private)',
    content: doc(heading(1, 'Q1 Planning'), paragraph(text('Only George can see this document.'))),
    shares: [],
  },
  {
    id: '6f1b2c4e-1d3a-4b8e-9c7f-0a1b2c3d4e03',
    ownerId: 'alex',
    title: 'Design Review Notes',
    content: doc(
      heading(1, 'Design Review Notes'),
      paragraph(text('Owned by Alex. George can edit; Jordan has no access.')),
      bulletList('Tighten card spacing', 'Increase toolbar contrast'),
    ),
    shares: [{ userId: 'george', permission: 'editor' }],
  },
  {
    id: '6f1b2c4e-1d3a-4b8e-9c7f-0a1b2c3d4e04',
    ownerId: 'jordan',
    title: 'User Research Summary',
    content: doc(
      heading(1, 'User Research Summary'),
      paragraph(text('Owned by Jordan and shared with George as a '), text('viewer', ['italic']), text('.')),
    ),
    shares: [{ userId: 'george', permission: 'viewer' }],
  },
] as const

/**
 * Idempotent: demo users are inserted if missing. Demo documents are only created on the very
 * first run (empty database), so documents users delete or unshare don't reappear on restart.
 */
export function seedDatabase(db: DB, { documents }: { documents: boolean }) {
  const timestamp = now()
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)')
  const insertDocument = db.prepare(
    'INSERT INTO documents (id, title, content, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const insertShare = db.prepare(
    'INSERT INTO document_shares (document_id, user_id, permission, created_at) VALUES (?, ?, ?, ?)',
  )

  db.transaction(() => {
    const { count } = db.prepare('SELECT count(*) AS count FROM users').get() as { count: number }
    const isFirstRun = count === 0
    for (const user of DEMO_USERS) insertUser.run(user.id, user.name, user.email, timestamp)
    if (!documents || !isFirstRun) return
    for (const demo of DEMO_DOCUMENTS) {
      insertDocument.run(demo.id, demo.title, JSON.stringify(demo.content), demo.ownerId, timestamp, timestamp)
      for (const share of demo.shares) insertShare.run(demo.id, share.userId, share.permission, timestamp)
    }
  })()
}
