import path from 'node:path'

export interface RateLimitConfig {
  windowMs: number
  /** Requests per window per client IP across the API (health checks excluded). */
  apiMax: number
  /** File uploads (multipart import) per window per client IP. */
  importMax: number
}

export interface Config {
  port: number
  databasePath: string
  corsOrigins: string[]
  seedDemoDocuments: boolean
  /** Express `trust proxy` setting; must match the real proxy chain so client IPs can't be spoofed. */
  trustProxy: boolean | number | string
  rateLimits: RateLimitConfig
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  // Autosave sends at most one request per pause in typing, so ~1 request/second sustained is plenty.
  apiMax: 1000,
  importMax: 20,
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid PORT: ${value}`)
  return port
}

function parsePositiveInt(name: string, value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Invalid ${name}: ${value}`)
  return parsed
}

/**
 * TRUST_PROXY: unset/"false" → don't trust X-Forwarded-For (local development);
 * a number → trust that many proxy hops (Render: 1); otherwise an Express trust-proxy
 * string such as "loopback" or a subnet list. "true" trusts everything and lets clients spoof
 * their IP, which defeats rate limiting — avoid it.
 */
function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value || value === 'false') return false
  if (value === 'true') return true
  if (/^\d+$/.test(value)) return Number(value)
  return value
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.PORT, 3001),
    databasePath: path.resolve(env.DATABASE_PATH ?? 'data/collabspace.db'),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    seedDemoDocuments: env.SEED_DEMO_DOCUMENTS !== 'false',
    trustProxy: parseTrustProxy(env.TRUST_PROXY?.trim()),
    rateLimits: {
      windowMs: parsePositiveInt('RATE_LIMIT_WINDOW_MINUTES', env.RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
      apiMax: parsePositiveInt('RATE_LIMIT_API_MAX', env.RATE_LIMIT_API_MAX, DEFAULT_RATE_LIMITS.apiMax),
      importMax: parsePositiveInt('RATE_LIMIT_IMPORT_MAX', env.RATE_LIMIT_IMPORT_MAX, DEFAULT_RATE_LIMITS.importMax),
    },
  }
}
