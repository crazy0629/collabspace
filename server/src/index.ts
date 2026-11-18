import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { openDatabase } from './db/database.ts'
import { seedDatabase } from './db/seed.ts'

const config = loadConfig()
const db = openDatabase(config.databasePath)
seedDatabase(db, { documents: config.seedDemoDocuments })

const app = createApp({
  db,
  corsOrigins: config.corsOrigins,
  trustProxy: config.trustProxy,
  rateLimits: config.rateLimits,
})
const server = app.listen(config.port, () => {
  const { windowMs, apiMax, importMax } = config.rateLimits
  console.log(`CollabSpace API listening on http://localhost:${config.port}/api`)
  console.log(`Database: ${config.databasePath}`)
  console.log(`CORS origins: ${config.corsOrigins.join(', ')}`)
  console.log(`Trust proxy: ${String(config.trustProxy)}`)
  console.log(`Rate limits per IP per ${windowMs / 60000} min: ${apiMax} API requests, ${importMax} file imports`)
})
// Drop clients that trickle a request in too slowly (slowloris-style), well above normal upload times.
server.requestTimeout = 120_000

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
