import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { sampleContent, startTestServer, type TestServer } from './helpers.ts'

let api: TestServer

before(async () => {
  api = await startTestServer()
})
after(async () => {
  await api.close()
})

const IMPORT_URL = '/api/documents/import'
const MB = 1024 * 1024

async function createDocument(owner = 'george') {
  const response = await api.request('POST', '/api/documents', { as: owner, body: { title: 'Target', content: sampleContent('Existing text') } })
  assert.equal(response.status, 201)
  return response.body.document
}

async function share(documentId: string, userId: string, permission: 'viewer' | 'editor') {
  const response = await api.request('PUT', `/api/documents/${documentId}/shares`, { as: 'george', body: { userId, permission } })
  assert.equal(response.status, 200)
}

/** Reads the row straight from SQLite to prove persistence. */
function storedRow(id: string) {
  return api.db.prepare('SELECT title, content, owner_id, version FROM documents WHERE id = ?').get(id) as
    | { title: string; content: string; owner_id: string; version: number }
    | undefined
}

describe('POST /api/documents/import — new documents', () => {
  test('imports a .txt file as a new document titled after the file', async () => {
    const response = await api.upload(IMPORT_URL, {
      as: 'george',
      file: { name: 'Meeting notes.txt', content: 'First line\nsecond line\n\nNew paragraph' },
    })
    assert.equal(response.status, 201)
    const { document } = response.body
    assert.equal(document.title, 'Meeting notes')
    assert.equal(document.owner.id, 'george')
    assert.deepEqual(document.content, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First line' }, { type: 'hardBreak' }, { type: 'text', text: 'second line' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'New paragraph' }] },
      ],
    })
    assert.deepEqual(response.body.import, { filename: 'Meeting notes.txt', format: 'text', size: 37 })

    const row = storedRow(document.id)
    assert.ok(row, 'persisted in SQLite')
    assert.equal(row.title, 'Meeting notes')
    assert.equal(row.owner_id, 'george')
    assert.deepEqual(JSON.parse(row.content), document.content)
  })

  test('imports a .md file, converting headings, lists, quotes and inline formatting', async () => {
    const markdown = [
      '# Project Plan',
      '',
      'Intro with **bold**, *italic* and [a link](https://example.com).',
      'Same paragraph, new line.',
      '',
      '## Tasks',
      '- first',
      '- second',
      '  - nested',
      '',
      '1. one',
      '2. two',
      '',
      '> quoted',
      '',
      '```ts',
      'const x = 1',
      '```',
    ].join('\r\n') // Windows line endings are normalized
    const response = await api.upload(IMPORT_URL, { as: 'george', file: { name: 'plan.md', content: markdown } })
    assert.equal(response.status, 201)
    const blocks = response.body.document.content.content
    assert.deepEqual(blocks.map((b: { type: string }) => b.type), [
      'heading', 'paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock',
    ])
    assert.deepEqual(blocks[0], { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project Plan' }] })
    assert.deepEqual(blocks[2].attrs, { level: 2 })
    const intro = blocks[1].content
    assert.deepEqual(intro.find((n: { text?: string }) => n.text === 'bold').marks, [{ type: 'bold' }])
    assert.deepEqual(intro.find((n: { text?: string }) => n.text === 'italic').marks, [{ type: 'italic' }])
    assert.equal(intro.find((n: { text?: string }) => n.text === 'a link').marks[0].attrs.href, 'https://example.com')
    assert.ok(intro.some((n: { type: string }) => n.type === 'hardBreak'), 'line break preserved')
    assert.equal(blocks[3].content.length, 2)
    assert.equal(blocks[3].content[1].content[1].type, 'bulletList', 'nested list')
    assert.equal(blocks[4].content.length, 2)
    assert.equal(blocks[6].attrs.language, 'ts')
    assert.equal(response.body.import.format, 'markdown')
    assert.ok(storedRow(response.body.document.id), 'persisted in SQLite')
  })

  test('file names are sanitized into titles (paths stripped, UTF-8 kept)', async () => {
    const traversal = await api.upload(IMPORT_URL, { as: 'george', file: { name: '../../etc/passwd.txt', content: 'x' } })
    assert.equal(traversal.status, 201)
    assert.equal(traversal.body.document.title, 'passwd')
    const unicode = await api.upload(IMPORT_URL, { as: 'george', file: { name: 'Café résumé.md', content: 'x' } })
    assert.equal(unicode.body.document.title, 'Café résumé')
  })

  test('the client MIME type is ignored: only the extension and content decide', async () => {
    const spoofed = await api.upload(IMPORT_URL, { as: 'george', file: { name: 'payload.exe', content: 'hello', type: 'text/plain' } })
    assert.equal(spoofed.status, 400)
    assert.equal(spoofed.body.error.code, 'unsupported_file_type')
    const oddMime = await api.upload(IMPORT_URL, { as: 'george', file: { name: 'notes.md', content: 'hello', type: 'application/octet-stream' } })
    assert.equal(oddMime.status, 201)
  })
})

describe('POST /api/documents/import — rejected uploads', () => {
  test('unsupported file extensions', async () => {
    for (const name of ['report.pdf', 'page.html', 'README', 'notes.md.js']) {
      const response = await api.upload(IMPORT_URL, { as: 'george', file: { name, content: 'text' } })
      assert.equal(response.status, 400, name)
      assert.equal(response.body.error.code, 'unsupported_file_type', name)
    }
  })

  test('empty and whitespace-only files', async () => {
    for (const content of ['', '   \n\t\n ']) {
      const response = await api.upload(IMPORT_URL, { as: 'george', file: { name: 'empty.txt', content } })
      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'empty_file')
    }
  })

  test('files over 2 MB are rejected with 413; exactly 2 MB is accepted', async () => {
    const tooBig = await api.upload(IMPORT_URL, { as: 'george', file: { name: 'big.txt', content: 'a'.repeat(2 * MB + 1) } })
    assert.equal(tooBig.status, 413)
    assert.equal(tooBig.body.error.code, 'file_too_large')

    const limit = await api.upload(IMPORT_URL, { as: 'george', file: { name: 'limit.txt', content: 'a'.repeat(2 * MB) } })
    assert.equal(limit.status, 201)
  })

  test('invalid UTF-8, UTF-16 and binary content', async () => {
    const cases: Array<[Uint8Array, string]> = [
      [new Uint8Array([0x68, 0x69, 0xc3, 0x28]), 'invalid_encoding'], // truncated multi-byte sequence
      [new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]), 'invalid_encoding'], // UTF-16 LE BOM
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x1a, 0x0a]), 'binary_file'],
    ]
    for (const [content, code] of cases) {
      const response = await api.upload(IMPORT_URL, { as: 'george', file: { name: 'weird.txt', content } })
      assert.equal(response.status, 400, code)
      assert.equal(response.body.error.code, code)
    }
  })

  test('missing file, wrong field name and malformed multipart bodies', async () => {
    const noFile = await api.upload(IMPORT_URL, { as: 'george', fields: { mode: 'create' } })
    assert.equal(noFile.status, 400)
    assert.equal(noFile.body.error.code, 'missing_file')

    const wrongField = await api.upload(IMPORT_URL, { as: 'george', field: 'upload', file: { name: 'a.txt', content: 'x' } })
    assert.equal(wrongField.status, 400)
    assert.equal(wrongField.body.error.code, 'invalid_upload')

    const malformed = await api.request('POST', IMPORT_URL, {
      as: 'george',
      rawBody: '--abc\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\nunterminated',
      headers: { 'content-type': 'multipart/form-data; boundary=abc' },
    })
    assert.equal(malformed.status, 400)
    assert.equal(malformed.body.error.code, 'malformed_upload')
  })

  test('requires demo authentication', async () => {
    const missing = await api.upload(IMPORT_URL, { file: { name: 'a.txt', content: 'x' } })
    assert.equal(missing.status, 401)
    assert.equal(missing.body.error.code, 'unauthenticated')
    const unknown = await api.upload(IMPORT_URL, { as: 'mallory', file: { name: 'a.txt', content: 'x' } })
    assert.equal(unknown.status, 401)
  })

  test('the JSON browser-migration import on the same path still works', async () => {
    const response = await api.request('POST', IMPORT_URL, {
      as: 'george',
      body: { title: 'Legacy', content: sampleContent('old'), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    })
    assert.equal(response.status, 201)
    assert.equal(response.body.document.title, 'Legacy')
  })
})

describe('POST /api/documents/import — existing documents', () => {
  test('owner appends imported content after the existing content', async () => {
    const doc = await createDocument()
    const response = await api.upload(IMPORT_URL, {
      as: 'george',
      fields: { documentId: doc.id },
      file: { name: 'more.md', content: '## Appended\n\n- item' },
    })
    assert.equal(response.status, 200)
    const blocks = response.body.document.content.content
    assert.deepEqual(blocks.map((b: { type: string }) => b.type), ['paragraph', 'heading', 'bulletList'])
    assert.equal(blocks[0].content[0].text, 'Existing text', 'existing content preserved')
    assert.equal(response.body.document.title, 'Target', 'title unchanged')
    assert.equal(response.body.document.version, doc.version + 1)
    assert.equal(JSON.parse(storedRow(doc.id)!.content).content.length, 3, 'persisted in SQLite')
  })

  test('editor can import into a shared document', async () => {
    const doc = await createDocument()
    await share(doc.id, 'alex', 'editor')
    const response = await api.upload(IMPORT_URL, { as: 'alex', fields: { documentId: doc.id }, file: { name: 'e.txt', content: 'From Alex' } })
    assert.equal(response.status, 200)
    assert.equal(response.body.document.permission, 'editor')
    assert.match(storedRow(doc.id)!.content, /From Alex/)
  })

  test('viewer cannot import (append or convert)', async () => {
    const doc = await createDocument()
    await share(doc.id, 'jordan', 'viewer')
    for (const mode of ['append', 'convert']) {
      const response = await api.upload(IMPORT_URL, { as: 'jordan', fields: { documentId: doc.id, mode }, file: { name: 'v.txt', content: 'nope' } })
      assert.equal(response.status, 403, mode)
      assert.equal(response.body.error.code, 'forbidden')
    }
    assert.equal(storedRow(doc.id)!.version, doc.version, 'document unchanged')
  })

  test('a user without access cannot import into the document', async () => {
    const doc = await createDocument()
    const response = await api.upload(IMPORT_URL, { as: 'jordan', fields: { documentId: doc.id }, file: { name: 'x.txt', content: 'intrusion' } })
    assert.equal(response.status, 403)
    assert.doesNotMatch(storedRow(doc.id)!.content, /intrusion/)
  })

  test('authorization is checked before the file is inspected', async () => {
    const doc = await createDocument()
    const response = await api.upload(IMPORT_URL, { as: 'jordan', fields: { documentId: doc.id }, file: { name: 'x.pdf', content: '' } })
    assert.equal(response.status, 403)
  })

  test('convert mode returns content without modifying the document', async () => {
    const doc = await createDocument()
    await share(doc.id, 'alex', 'editor')
    const response = await api.upload(IMPORT_URL, {
      as: 'alex',
      fields: { documentId: doc.id, mode: 'convert' },
      file: { name: 'c.md', content: '# Inserted' },
    })
    assert.equal(response.status, 200)
    assert.deepEqual(response.body.content.content[0], { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Inserted' }] })
    assert.equal(response.body.document, undefined)
    assert.equal(storedRow(doc.id)!.version, doc.version, 'not persisted')
  })

  test('stale version → 409; unknown → 404; malformed id → 400; trashed → 409; bad mode → 400', async () => {
    const doc = await createDocument()
    const file = { name: 'x.txt', content: 'x' }
    await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'george', body: { title: 'Bumped', version: 1 } })
    const stale = await api.upload(IMPORT_URL, { as: 'george', fields: { documentId: doc.id, version: '1' }, file })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.error.code, 'version_conflict')

    const missing = await api.upload(IMPORT_URL, { as: 'george', fields: { documentId: '00000000-0000-4000-8000-000000000000' }, file })
    assert.equal(missing.status, 404)
    const malformed = await api.upload(IMPORT_URL, { as: 'george', fields: { documentId: 'nope' }, file })
    assert.equal(malformed.status, 400)
    assert.equal(malformed.body.error.code, 'invalid_document_id')
    const badMode = await api.upload(IMPORT_URL, { as: 'george', fields: { documentId: doc.id, mode: 'replace' }, file })
    assert.equal(badMode.body.error.code, 'invalid_mode')

    await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'george', body: { trashed: true } })
    const trashed = await api.upload(IMPORT_URL, { as: 'george', fields: { documentId: doc.id }, file })
    assert.equal(trashed.status, 409)
    assert.equal(trashed.body.error.code, 'document_trashed')
  })

  test('importing into a blank new document replaces its empty paragraph', async () => {
    const blank = (await api.request('POST', '/api/documents', { as: 'george' })).body.document
    const response = await api.upload(IMPORT_URL, { as: 'george', fields: { documentId: blank.id }, file: { name: 'b.txt', content: 'Only this' } })
    assert.deepEqual(response.body.document.content.content, [{ type: 'paragraph', content: [{ type: 'text', text: 'Only this' }] }])
  })
})
