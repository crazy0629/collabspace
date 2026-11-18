// Production builds fail in vite.config.ts unless VITE_API_BASE_URL is set, so the localhost
// fallback can only ever apply to the dev server.
const DEV_FALLBACK_URL = 'http://localhost:3001/api'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? DEV_FALLBACK_URL : '')).replace(
  /\/+$/,
  '',
)
