import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { sampleContent, startTestServer, TEST_ORIGIN, type TestServer } from './helpers.ts'

const MINUTE = 60_000

async function withServer(options: Parameters<typeof startTestServer>[0], run: (api: TestServer) => Promise<void>) {
  const api = await startTestServer(options)
  try {
    await run(api)
  } finally {
    await api.close()
  }
}

describe('API rate limiting', () => {
  test('returns an understandable 429 with Retry-After once the limit is reached', () =>
    withServer({ rateLimits: { windowMs: MINUTE, apiMax: 3, importMax: 10 } }, async (api) => {
      for (let i = 0; i < 3; i++) assert.equal((await api.request('GET', '/api/users')).status, 200)

      const limited = await api.request('GET', '/api/users', { headers: { origin: TEST_ORIGIN } })
      assert.equal(limited.status, 429)
      assert.equal(limited.body.error.code, 'rate_limited')
      assert.match(limited.body.error.message, /^Too many requests\. Please wait \d+ (seconds?|minutes?) and try again\.$/)
      const retryAfter = Number(limited.headers.get('retry-after'))
      assert.ok(retryAfter >= 1 && retryAfter <= 60, `Retry-After ${retryAfter}`)
      assert.equal(limited.body.error.details.retryAfterSeconds, retryAfter)
      assert.ok(limited.headers.get('ratelimit-policy'), 'standard RateLimit-Policy header')
      // CORS headers are present, so the browser can read the 429 instead of seeing a CORS failure.
      assert.equal(limited.headers.get('access-control-allow-origin'), TEST_ORIGIN)
      assert.match(limited.headers.get('access-control-expose-headers') ?? '', /Retry-After/)
    }))

  test('limits authenticated document routes too, regardless of demo user', () =>
    withServer({ rateLimits: { windowMs: MINUTE, apiMax: 2, importMax: 10 } }, async (api) => {
      assert.equal((await api.request('GET', '/api/documents', { as: 'george' })).status, 200)
      assert.equal((await api.request('GET', '/api/documents', { as: 'alex' })).status, 200)
      assert.equal((await api.request('GET', '/api/documents', { as: 'jordan' })).status, 429)
    }))

  test('health checks are never rate limited', () =>
    withServer({ rateLimits: { windowMs: MINUTE, apiMax: 1, importMax: 1 } }, async (api) => {
      await api.request('GET', '/api/users')
      assert.equal((await api.request('GET', '/api/users')).status, 429)
      for (let i = 0; i < 10; i++) assert.equal((await api.request('GET', '/api/health')).status, 200)
    }))

  test('file imports have their own, stricter limit; other writes are unaffected', () =>
    withServer({ rateLimits: { windowMs: MINUTE, apiMax: 100, importMax: 2 } }, async (api) => {
      const upload = () => api.upload('/api/documents/import', { as: 'george', file: { name: 'n.txt', content: 'hi' } })
      assert.equal((await upload()).status, 201)
      assert.equal((await upload()).status, 201)
      const limited = await upload()
      assert.equal(limited.status, 429)
      assert.match(limited.body.error.message, /^Too many file imports\./)

      // The JSON browser-migration import on the same path and normal creation still work.
      const legacy = await api.request('POST', '/api/documents/import', {
        as: 'george',
        body: { title: 'Legacy', content: sampleContent('x'), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      })
      assert.equal(legacy.status, 201)
      assert.equal((await api.request('POST', '/api/documents', { as: 'george' })).status, 201)
    }))
})

describe('trust proxy', () => {
  test('with TRUST_PROXY=1, clients behind the proxy are limited separately by X-Forwarded-For', () =>
    withServer({ trustProxy: 1, rateLimits: { windowMs: MINUTE, apiMax: 2, importMax: 10 } }, async (api) => {
      const as = (ip: string) => api.request('GET', '/api/users', { headers: { 'x-forwarded-for': ip } })
      assert.equal((await as('203.0.113.1')).status, 200)
      assert.equal((await as('203.0.113.1')).status, 200)
      assert.equal((await as('203.0.113.1')).status, 429)
      assert.equal((await as('203.0.113.2')).status, 200, 'a different client has its own budget')
    }))

  test('without trust proxy, a spoofed X-Forwarded-For cannot bypass the limit', () =>
    // express-rate-limit logs a configuration warning about the unexpected header here; that's expected.
    withServer({ rateLimits: { windowMs: MINUTE, apiMax: 2, importMax: 10 } }, async (api) => {
      const as = (ip: string) => api.request('GET', '/api/users', { headers: { 'x-forwarded-for': ip } })
      assert.equal((await as('198.51.100.1')).status, 200)
      assert.equal((await as('198.51.100.2')).status, 200)
      assert.equal((await as('198.51.100.3')).status, 429)
    }))
})

describe('security headers', () => {
  test('API responses carry conservative security headers', () =>
    withServer({}, async (api) => {
      const response = await api.request('GET', '/api/health')
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(response.headers.get('x-frame-options'), 'DENY')
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
      assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/)
      assert.equal(response.headers.get('x-powered-by'), null)
    }))
})
