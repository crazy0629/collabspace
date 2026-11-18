import fs from 'node:fs'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createApp, type AppOptions } from '../src/app.ts'
import type { RateLimitConfig } from '../src/config.ts'
import { openDatabase, type DB } from '../src/db/database.ts'
import { seedDatabase } from '../src/db/seed.ts'

export const TEST_ORIGIN = 'http://localhost:5173'

export interface ApiResponse<T = any> {
  status: number
  headers: Headers
  body: T
}

export interface RequestOptions {
  /** Demo user id sent as x-demo-user-id. Omit to send no identity. */
  as?: string
  body?: unknown
  /** Raw body string, sent as-is with a JSON content type (for malformed JSON tests). */
  rawBody?: string
  headers?: Record<string, string>
}

export interface UploadOptions {
  as?: string
  /** Omit to send a multipart request without a file. */
  file?: { name: string; content: string | Uint8Array; type?: string }
  /** Field name for the file (default "file"). */
  field?: string
  fields?: Record<string, string>
}

export interface TestServer {
  db: DB
  request: <T = any>(method: string, url: string, options?: RequestOptions) => Promise<ApiResponse<T>>
  /** POST multipart/form-data, like a browser file upload. */
  upload: <T = any>(url: string, options?: UploadOptions) => Promise<ApiResponse<T>>
  close: () => Promise<void>
}

/** Effectively unlimited, so functional tests don't trip rate limits. */
const UNLIMITED: RateLimitConfig = { windowMs: 60_000, apiMax: 1_000_000, importMax: 1_000_000 }

/**
 * Starts the real app on a random port against a fresh SQLite file in a temp directory.
 * The development database is never touched; the temp directory is deleted on close.
 */
export async function startTestServer(
  options: Pick<AppOptions, 'rateLimits' | 'trustProxy'> = {},
): Promise<TestServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collabspace-test-'))
  const db = openDatabase(path.join(dir, 'test.db'))
  seedDatabase(db, { documents: false })

  const server = createApp({ db, corsOrigins: [TEST_ORIGIN], rateLimits: UNLIMITED, ...options }).listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  return {
    db,
    async request(method, url, { as, body, rawBody, headers = {} } = {}) {
      const hasBody = body !== undefined || rawBody !== undefined
      const response = await fetch(`${baseUrl}${url}`, {
        method,
        headers: {
          ...(as ? { 'x-demo-user-id': as } : {}),
          ...(hasBody ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
      })
      const text = await response.text()
      return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null }
    },
    async upload(url, { as, file, field = 'file', fields = {} } = {}) {
      const form = new FormData()
      for (const [name, value] of Object.entries(fields)) form.append(name, value)
      if (file) form.append(field, new Blob([file.content], { type: file.type ?? 'text/plain' }), file.name)
      const response = await fetch(`${baseUrl}${url}`, {
        method: 'POST',
        headers: as ? { 'x-demo-user-id': as } : {},
        body: form,
      })
      const text = await response.text()
      return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null }
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
      db.close()
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}

export const sampleContent = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
