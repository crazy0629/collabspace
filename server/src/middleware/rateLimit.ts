import type { Request, RequestHandler } from 'express'
import { rateLimit, type RateLimitInfo } from 'express-rate-limit'

interface LimiterOptions {
  windowMs: number
  limit: number
  /** Explains what was limited, e.g. "Too many requests." */
  message: string
}

function describeWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

/**
 * Per-client-IP fixed-window limiter (in memory — fine for a single instance). Limited requests
 * get 429 with a Retry-After header and the API's usual JSON error shape.
 */
export function createRateLimiter({ windowMs, limit, message }: LimiterOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      // express-rate-limit stores its counters on req.rateLimit.
      const resetTime = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit?.resetTime
      const retryAfter = Math.max(1, Math.ceil(((resetTime?.getTime() ?? Date.now() + windowMs) - Date.now()) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: `${message} Please wait ${describeWait(retryAfter)} and try again.`,
          details: { retryAfterSeconds: retryAfter },
        },
      })
    },
  })
}
