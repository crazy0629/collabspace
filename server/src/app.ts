import cors from 'cors'
import express, { Router } from 'express'
import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from './config.ts'
import type { DB } from './db/database.ts'
import { DEMO_USER_HEADER, demoAuth } from './middleware/demoAuth.ts'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts'
import { createRateLimiter } from './middleware/rateLimit.ts'
import { securityHeaders } from './middleware/securityHeaders.ts'
import { createDocumentRepository } from './repositories/documentRepository.ts'
import { createUserRepository } from './repositories/userRepository.ts'
import { documentsRouter } from './routes/documents.ts'
import { MAX_CONTENT_BYTES } from './validation.ts'

// Largest valid JSON body: a document at the content limit plus title/version and some slack.
// (File uploads are multipart and capped separately by multer.)
export const JSON_BODY_LIMIT_BYTES = MAX_CONTENT_BYTES + 256 * 1024

export interface AppOptions {
  db: DB
  corsOrigins: string[]
  /** Express `trust proxy` (see config.ts). Defaults to false. */
  trustProxy?: boolean | number | string
  rateLimits?: RateLimitConfig
}

export function createApp({ db, corsOrigins, trustProxy = false, rateLimits = DEFAULT_RATE_LIMITS }: AppOptions) {
  const users = createUserRepository(db)
  const documents = createDocumentRepository(db)
  const app = express()

  app.disable('x-powered-by')
  // Behind Render's proxy, req.ip (used for rate limiting) must come from X-Forwarded-For.
  app.set('trust proxy', trustProxy)
  app.use(securityHeaders)
  // CORS runs before rate limiting so 429 responses still carry CORS headers the browser can read.
  app.use(
    cors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', DEMO_USER_HEADER],
      exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  )

  const api = Router()
  // Health checks (Render's probe, the client's wake-up polling) are cheap and never rate-limited.
  api.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get()
    res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() })
  })

  // Limit before parsing bodies, so rejected requests cost as little as possible.
  api.use(createRateLimiter({ windowMs: rateLimits.windowMs, limit: rateLimits.apiMax, message: 'Too many requests.' }))
  api.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }))

  // Public so the demo account switcher can list accounts before choosing one.
  api.get('/users', (_req, res) => {
    res.json({ users: users.list() })
  })
  const importLimiter = createRateLimiter({
    windowMs: rateLimits.windowMs,
    limit: rateLimits.importMax,
    message: 'Too many file imports.',
  })
  api.use('/documents', demoAuth(users), documentsRouter(documents, users, { importLimiter }))
  api.use(notFoundHandler)

  app.use('/api', api)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
