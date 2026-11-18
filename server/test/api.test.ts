import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { TEST_ORIGIN, sampleContent, startTestServer, type TestServer } from './helpers.ts'

let api: TestServer

before(async () => {
  api = await startTestServer()
})
after(async () => {
  await api.close()
})

/** Creates a document as `owner` and returns it. */
async function createDocument(owner = 'george', body: object = { title: 'Test document', content: sampleContent('Hello') }) {
  const response = await api.request('POST', '/api/documents', { as: owner, body })
  assert.equal(response.status, 201)
  return response.body.document
}

async function share(documentId: string, target: { userId?: string; email?: string }, permission: string, as = 'george') {
  return api.request('PUT', `/api/documents/${documentId}/shares`, { as, body: { ...target, permission } })
}

describe('health and users', () => {
  test('GET /api/health reports ok', async () => {
    const response = await api.request('GET', '/api/health')
    assert.equal(response.status, 200)
    assert.equal(response.body.status, 'ok')
    assert.equal(response.body.database, 'ok')
  })

  test('GET /api/users lists the three seeded demo users', async () => {
    const response = await api.request('GET', '/api/users')
    assert.equal(response.status, 200)
    assert.deepEqual(
      response.body.users.map((user: { email: string }) => user.email).sort(),
      ['alex@example.com', 'george@example.com', 'jordan@example.com'],
    )
  })

  test('unknown API routes return a JSON 404', async () => {
    const response = await api.request('GET', '/api/nope')
    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'route_not_found')
  })
})

describe('demo authentication', () => {
  test('rejects requests without x-demo-user-id', async () => {
    const response = await api.request('GET', '/api/documents')
    assert.equal(response.status, 401)
    assert.equal(response.body.error.code, 'unauthenticated')
  })

  test('rejects unknown user ids', async () => {
    for (const id of ['mallory', "george' OR 1=1 --"]) {
      const response = await api.request('GET', '/api/documents', { as: id })
      assert.equal(response.status, 401)
      assert.equal(response.body.error.code, 'unknown_user')
    }
  })
})

describe('creating and reading documents', () => {
  test('POST creates a document owned by the current user', async () => {
    const doc = await createDocument('george', { title: '  Launch   plan ', content: sampleContent('Draft') })
    assert.match(doc.id, /^[0-9a-f-]{36}$/)
    assert.equal(doc.title, 'Launch plan', 'title whitespace is normalized')
    assert.deepEqual(doc.content, sampleContent('Draft'))
    assert.equal(doc.owner.id, 'george')
    assert.equal(doc.permission, 'owner')
    assert.equal(doc.version, 1)
    assert.deepEqual(doc.shares, [])
  })

  test('POST with no body creates an untitled empty document', async () => {
    const response = await api.request('POST', '/api/documents', { as: 'alex' })
    assert.equal(response.status, 201)
    assert.equal(response.body.document.title, 'Untitled document')
    assert.equal(response.body.document.content.type, 'doc')
  })

  test('owner can retrieve their document', async () => {
    const doc = await createDocument()
    const response = await api.request('GET', `/api/documents/${doc.id}`, { as: 'george' })
    assert.equal(response.status, 200)
    assert.equal(response.body.document.id, doc.id)
    assert.deepEqual(response.body.document.content, doc.content)
  })

  test('nonexistent documents return 404; malformed ids return 400', async () => {
    const missing = await api.request('GET', '/api/documents/00000000-0000-4000-8000-000000000000', { as: 'george' })
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'document_not_found')

    const malformed = await api.request('GET', '/api/documents/not-a-uuid', { as: 'george' })
    assert.equal(malformed.status, 400)
    assert.equal(malformed.body.error.code, 'invalid_document_id')
  })
})

describe('updating documents', () => {
  test('owner can update title and content; version increments', async () => {
    const doc = await createDocument()
    const response = await api.request('PATCH', `/api/documents/${doc.id}`, {
      as: 'george',
      body: { title: 'Renamed', content: sampleContent('Updated body'), version: doc.version },
    })
    assert.equal(response.status, 200)
    assert.equal(response.body.document.title, 'Renamed')
    assert.deepEqual(response.body.document.content, sampleContent('Updated body'))
    assert.equal(response.body.document.version, doc.version + 1)

    const reloaded = await api.request('GET', `/api/documents/${doc.id}`, { as: 'george' })
    assert.equal(reloaded.body.document.title, 'Renamed')
  })

  test('a stale version is rejected with 409 and the current document', async () => {
    const doc = await createDocument()
    await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'george', body: { title: 'First', version: 1 } })
    const stale = await api.request('PATCH', `/api/documents/${doc.id}`, {
      as: 'george',
      body: { content: sampleContent('Older edit'), version: 1 },
    })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.error.code, 'version_conflict')
    assert.equal(stale.body.error.details.document.title, 'First')
    assert.equal(stale.body.error.details.document.version, 2)

    const current = await api.request('GET', `/api/documents/${doc.id}`, { as: 'george' })
    assert.deepEqual(current.body.document.content, sampleContent('Hello'), 'stale write did not apply')
  })

  test('rejects invalid input', async () => {
    const doc = await createDocument()
    const cases: Array<[string, unknown, string]> = [
      ['empty title', { title: '   ' }, 'invalid_title'],
      ['overlong title', { title: 'x'.repeat(201) }, 'invalid_title'],
      ['non-string title', { title: 42 }, 'invalid_title'],
      ['non-doc root', { content: { type: 'paragraph' } }, 'invalid_content'],
      ['unknown node type', { content: { type: 'doc', content: [{ type: 'iframe' }] } }, 'invalid_content'],
      ['script link', {
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] },
      }, 'invalid_content'],
      ['bad version', { title: 'ok', version: 0 }, 'invalid_version'],
      ['unknown field', { title: 'ok', ownerId: 'alex' }, 'unknown_field'],
      ['no changes', {}, 'invalid_update'],
    ]
    for (const [name, body, code] of cases) {
      const response = await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'george', body })
      assert.equal(response.status, 400, name)
      assert.equal(response.body.error.code, code, name)
    }
  })

  test('malformed JSON returns 400 invalid_json', async () => {
    const doc = await createDocument()
    const response = await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'george', rawBody: '{"title": ' })
    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'invalid_json')
  })

  test('oversized content is rejected', async () => {
    const doc = await createDocument()
    // Just over the 5 MB content limit, but within the JSON body limit: rejected by content validation.
    const overContentLimit = sampleContent('x'.repeat(5 * 1024 * 1024 + 1024))
    const response = await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'george', body: { content: overContentLimit } })
    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'content_too_large')
  })

  test('request bodies over the JSON body limit are rejected before parsing (413)', async () => {
    const doc = await createDocument()
    const huge = sampleContent('x'.repeat(6 * 1024 * 1024))
    const response = await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'george', body: { content: huge } })
    assert.equal(response.status, 413)
    assert.equal(response.body.error.code, 'payload_too_large')
  })
})

describe('sharing and authorization', () => {
  test('owner can share with another user; it appears in their document list', async () => {
    const doc = await createDocument()
    const response = await share(doc.id, { userId: 'alex' }, 'viewer')
    assert.equal(response.status, 200)
    assert.deepEqual(
      response.body.document.shares.map((s: { userId: string; permission: string }) => [s.userId, s.permission]),
      [['alex', 'viewer']],
    )

    const list = await api.request('GET', '/api/documents', { as: 'alex' })
    const shared = list.body.documents.find((d: { id: string }) => d.id === doc.id)
    assert.ok(shared, 'shared document is listed for alex')
    assert.equal(shared.permission, 'viewer')
    assert.equal(shared.owner.id, 'george')
  })

  test('sharing by email works and re-sharing updates the permission', async () => {
    const doc = await createDocument()
    await share(doc.id, { email: 'JORDAN@example.com' }, 'viewer')
    const response = await share(doc.id, { email: 'jordan@example.com' }, 'editor')
    assert.equal(response.status, 200)
    assert.equal(response.body.document.shares.length, 1)
    assert.equal(response.body.document.shares[0].permission, 'editor')
  })

  test('viewer can read but cannot edit, delete or manage sharing', async () => {
    const doc = await createDocument()
    await share(doc.id, { userId: 'alex' }, 'viewer')

    const read = await api.request('GET', `/api/documents/${doc.id}`, { as: 'alex' })
    assert.equal(read.status, 200)
    assert.equal(read.body.document.permission, 'viewer')

    const edit = await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'alex', body: { title: 'Hijacked' } })
    assert.equal(edit.status, 403)
    assert.equal((await api.request('DELETE', `/api/documents/${doc.id}`, { as: 'alex' })).status, 403)
    assert.equal((await share(doc.id, { userId: 'jordan' }, 'editor', 'alex')).status, 403)

    const unchanged = await api.request('GET', `/api/documents/${doc.id}`, { as: 'george' })
    assert.equal(unchanged.body.document.title, 'Test document')
  })

  test('editor can edit title and content', async () => {
    const doc = await createDocument()
    await share(doc.id, { userId: 'jordan' }, 'editor')
    const response = await api.request('PATCH', `/api/documents/${doc.id}`, {
      as: 'jordan',
      body: { title: 'Edited by Jordan', content: sampleContent('Jordan was here'), version: 1 },
    })
    assert.equal(response.status, 200)
    assert.equal(response.body.document.title, 'Edited by Jordan')
    assert.equal(response.body.document.permission, 'editor')
  })

  test('editor cannot delete, trash or manage sharing', async () => {
    const doc = await createDocument()
    await share(doc.id, { userId: 'jordan' }, 'editor')
    assert.equal((await api.request('DELETE', `/api/documents/${doc.id}`, { as: 'jordan' })).status, 403)
    assert.equal((await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'jordan', body: { trashed: true } })).status, 403)
    assert.equal((await share(doc.id, { userId: 'alex' }, 'viewer', 'jordan')).status, 403)
    assert.equal((await api.request('DELETE', `/api/documents/${doc.id}/shares/jordan`, { as: 'jordan' })).status, 403)
  })

  test('a user without access gets 403 and the document is not listed', async () => {
    const doc = await createDocument()
    assert.equal((await api.request('GET', `/api/documents/${doc.id}`, { as: 'jordan' })).status, 403)
    assert.equal(
      (await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'jordan', body: { title: 'x' } })).status,
      403,
    )
    assert.equal((await api.request('PUT', `/api/documents/${doc.id}/favorite`, { as: 'jordan', body: { isFavorite: true } })).status, 403)
    const list = await api.request('GET', '/api/documents', { as: 'jordan' })
    assert.ok(!list.body.documents.some((d: { id: string }) => d.id === doc.id))
  })

  test('only the owner can revoke access; revoked users lose access', async () => {
    const doc = await createDocument()
    await share(doc.id, { userId: 'alex' }, 'editor')
    await share(doc.id, { userId: 'jordan' }, 'editor')

    const byEditor = await api.request('DELETE', `/api/documents/${doc.id}/shares/alex`, { as: 'jordan' })
    assert.equal(byEditor.status, 403)

    const byOwner = await api.request('DELETE', `/api/documents/${doc.id}/shares/alex`, { as: 'george' })
    assert.equal(byOwner.status, 200)
    assert.deepEqual(byOwner.body.document.shares.map((s: { userId: string }) => s.userId), ['jordan'])
    assert.equal((await api.request('GET', `/api/documents/${doc.id}`, { as: 'alex' })).status, 403)

    const again = await api.request('DELETE', `/api/documents/${doc.id}/shares/alex`, { as: 'george' })
    assert.equal(again.status, 404)
  })

  test('only the owner can delete; deletion cascades to shares', async () => {
    const doc = await createDocument()
    await share(doc.id, { userId: 'alex' }, 'editor')
    assert.equal((await api.request('DELETE', `/api/documents/${doc.id}`, { as: 'alex' })).status, 403)

    const deleted = await api.request('DELETE', `/api/documents/${doc.id}`, { as: 'george' })
    assert.equal(deleted.status, 204)
    assert.equal((await api.request('GET', `/api/documents/${doc.id}`, { as: 'george' })).status, 404)
    const { count } = api.db.prepare('SELECT count(*) AS count FROM document_shares WHERE document_id = ?').get(doc.id) as { count: number }
    assert.equal(count, 0)
  })

  test('share validation: bad permission, unknown user, sharing with the owner', async () => {
    const doc = await createDocument()
    assert.equal((await share(doc.id, { userId: 'alex' }, 'admin')).body.error.code, 'invalid_permission')
    const unknown = await share(doc.id, { email: 'nobody@example.com' }, 'viewer')
    assert.equal(unknown.status, 404)
    assert.equal(unknown.body.error.code, 'user_not_found')
    const self = await share(doc.id, { userId: 'george' }, 'editor')
    assert.equal(self.status, 400)
    assert.equal(self.body.error.code, 'cannot_share_with_owner')
    const both = await api.request('PUT', `/api/documents/${doc.id}/shares`, {
      as: 'george',
      body: { userId: 'alex', email: 'alex@example.com', permission: 'viewer' },
    })
    assert.equal(both.body.error.code, 'invalid_share_target')
  })
})

describe('trash, favorites and import', () => {
  test('trashed documents are hidden from collaborators and cannot be edited until restored', async () => {
    const doc = await createDocument()
    await share(doc.id, { userId: 'alex' }, 'editor')
    const trashed = await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'george', body: { trashed: true } })
    assert.equal(trashed.status, 200)
    assert.ok(trashed.body.document.trashedAt)

    assert.equal((await api.request('GET', `/api/documents/${doc.id}`, { as: 'alex' })).status, 404)
    const edit = await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'george', body: { title: 'x' } })
    assert.equal(edit.status, 409)
    assert.equal(edit.body.error.code, 'document_trashed')

    await api.request('PATCH', `/api/documents/${doc.id}`, { as: 'george', body: { trashed: false } })
    assert.equal((await api.request('GET', `/api/documents/${doc.id}`, { as: 'alex' })).status, 200)
  })

  test('favorites are per user', async () => {
    const doc = await createDocument()
    await share(doc.id, { userId: 'alex' }, 'viewer')
    const favorite = await api.request('PUT', `/api/documents/${doc.id}/favorite`, { as: 'alex', body: { isFavorite: true } })
    assert.equal(favorite.body.document.isFavorite, true)
    const asOwner = await api.request('GET', `/api/documents/${doc.id}`, { as: 'george' })
    assert.equal(asOwner.body.document.isFavorite, false)
  })

  test('opening records lastOpenedAt without changing updatedAt', async () => {
    const doc = await createDocument()
    const opened = await api.request('POST', `/api/documents/${doc.id}/open`, { as: 'george' })
    assert.ok(opened.body.document.lastOpenedAt)
    assert.equal(opened.body.document.updatedAt, doc.updatedAt)
  })

  test('import preserves timestamps, favorite and trash state', async () => {
    const response = await api.request('POST', '/api/documents/import', {
      as: 'george',
      body: {
        title: 'Legacy doc',
        content: sampleContent('From localStorage'),
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-02-01T10:00:00.000Z',
        isFavorite: true,
        trashed: false,
      },
    })
    assert.equal(response.status, 201)
    assert.equal(response.body.document.createdAt, '2026-01-01T10:00:00.000Z')
    assert.equal(response.body.document.updatedAt, '2026-02-01T10:00:00.000Z')
    assert.equal(response.body.document.isFavorite, true)
    assert.equal(response.body.document.owner.id, 'george')

    const future = await api.request('POST', '/api/documents/import', {
      as: 'george',
      body: { title: 'x', content: sampleContent('x'), createdAt: '2999-01-01T00:00:00Z', updatedAt: '2999-01-01T00:00:00Z' },
    })
    assert.equal(future.status, 400)
  })
})

describe('database and CORS', () => {
  test('foreign keys are enforced', () => {
    assert.throws(
      () =>
        api.db
          .prepare("INSERT INTO documents (id, title, content, owner_id, created_at, updated_at) VALUES ('x', 't', '{}', 'nobody', '', '')")
          .run(),
      /FOREIGN KEY constraint failed/,
    )
  })

  test('allows the configured frontend origin and the demo header', async () => {
    const preflight = await api.request('OPTIONS', '/api/documents', {
      headers: {
        origin: TEST_ORIGIN,
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'content-type,x-demo-user-id',
      },
    })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), TEST_ORIGIN)
    assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /x-demo-user-id/)
  })

  test('does not allow other origins', async () => {
    const response = await api.request('GET', '/api/health', { headers: { origin: 'http://evil.example' } })
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  })
})
