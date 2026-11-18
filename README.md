# CollabSpace

A collaborative document editor: a React + TipTap frontend (`client/`) backed by an
Express + SQLite REST API (`server/`).

```
collabspace/
  client/   React 19, TypeScript, Vite, Tailwind CSS v4, TipTap
  server/   Node.js 24, Express 5, TypeScript, SQLite (better-sqlite3)
```

## Requirements

- Node.js **24+** (the server runs its TypeScript sources directly with Node's built-in type stripping)
- npm 10+

## Getting started

```bash
# 1. Install dependencies (or `npm run install:all` from the repo root)
cd server && npm install
cd ../client && npm install

# 2. Optional: configure (defaults work out of the box)
cp server/.env.example server/.env
cp client/.env.example client/.env.local

# 3. Run both apps (two terminals)
cd server && npm run dev     # API on http://localhost:3001/api
cd client && npm run dev     # UI  on http://localhost:5173
```

On first start the server creates `server/data/collabspace.db`, seeds three demo users and a few
demo documents that are shared between them.

### Scripts

| Where     | Command             | What it does                                              |
|-----------|---------------------|-----------------------------------------------------------|
| `server/` | `npm run dev`       | API with auto-restart on file changes                     |
| `server/` | `npm test`          | Backend test suite (uses a throwaway temporary database)  |
| `server/` | `npm run typecheck` | TypeScript check                                          |
| `server/` | `npm run build`     | Compile to `dist/`                                        |
| `server/` | `npm start`         | Run the compiled build (`npm run build` first)            |
| `client/` | `npm run dev`       | Vite dev server                                           |
| `client/` | `npm run typecheck` | TypeScript check                                          |
| `client/` | `npm run build`     | Type-check and build to `client/dist/`                    |
| `client/` | `npm run lint`      | ESLint                                                    |
| root      | `npm test`, `npm run typecheck`, `npm run build` | Run the above for both apps   |

### Configuration

**server/.env**

| Variable              | Default                                        | Purpose                                  |
|-----------------------|------------------------------------------------|------------------------------------------|
| `PORT`                | `3001`                                         | API port                                 |
| `DATABASE_PATH`       | `./data/collabspace.db`                        | SQLite file                              |
| `CORS_ORIGINS`        | `http://localhost:5173,http://127.0.0.1:5173`  | Allowed frontend origins (comma-separated) |
| `SEED_DEMO_DOCUMENTS` | `true`                                         | Create demo documents on the first run   |
| `TRUST_PROXY`         | unset (false)                                  | Proxy hops in front of the API; set `1` on Render. Never `true` |
| `RATE_LIMIT_WINDOW_MINUTES` | `15`                                     | Rate-limit window                        |
| `RATE_LIMIT_API_MAX`  | `1000`                                         | API requests per IP per window (health excluded) |
| `RATE_LIMIT_IMPORT_MAX` | `20`                                         | File imports per IP per window           |

**client/.env.local**

| Variable            | Default                      | Purpose          |
|---------------------|------------------------------|------------------|
| `VITE_API_BASE_URL` | `http://localhost:3001/api` (dev server only) | Public API base URL. **Required for production builds** |

`VITE_*` values are embedded in the public JavaScript bundle — never put secrets in them.
`npm run build` fails with a clear message if `VITE_API_BASE_URL` is missing, not an absolute URL,
or not `https://` (plain `http://` is allowed only for localhost), and if any `VITE_*` variable
name looks like a secret (`SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE`, `CREDENTIAL`). For a local
production build:

```bash
cd client
VITE_API_BASE_URL=http://localhost:3001/api npm run build   # PowerShell: $env:VITE_API_BASE_URL='http://localhost:3001/api'; npm run build
```

To reset all data, stop the server and delete `server/data/`.

## Deployment notes

- **Vercel (client):** root directory `client`, build `npm run build`, output `dist`, and set
  `VITE_API_BASE_URL=https://<service>.onrender.com/api`. `client/vercel.json` rewrites every path
  to `index.html` so deep links like `/documents/:id` work on refresh.
- **Render (server):** root directory `server`, build `npm ci --include=dev && npm test && npm run build`,
  start `npm start`, health check path `/api/health`; set `NODE_VERSION=24`, `TRUST_PROXY=1` and
  `CORS_ORIGINS=https://<app>.vercel.app`.
- **Sleeping free-tier API:** when a request takes longer than 3 s or the API is unreachable, the
  app shows "Our document service is waking up. This may take up to a minute." It health-checks
  `/api/health` with backoff (at most ~10 checks over ~95 s, paused in background tabs) and
  reconnects automatically; a *Retry now* button restarts the checks. Unsaved editor changes stay
  in the tab, autosave retries with backoff (5 s → 30 s, 6 attempts) and on reconnect, and the
  browser asks before closing a tab with unsaved changes.
- **Rate limiting:** per client IP, in memory (single instance). 429 responses use the normal
  JSON error shape with a `Retry-After` header and CORS headers, so the UI can show the message.
  JSON request bodies are capped at 5.25 MB; uploads at 2 MB.

## Demo authentication (simulated — not secure)

> **This is not real authentication.** The client sends an `x-demo-user-id` header and the
> server trusts it. Anyone can act as any seeded user. It exists only so reviewers can exercise
> the authorization rules without a login flow. Replace it with real authentication (sessions or
> signed tokens) before any real deployment.

Seeded accounts:

| id       | Name   | Email               |
|----------|--------|---------------------|
| `george` | George | george@example.com  |
| `alex`   | Alex   | alex@example.com    |
| `jordan` | Jordan | jordan@example.com  |

In the UI, switch accounts from the sidebar profile or the avatar menu (George is the default).

The middleware (`server/src/middleware/demoAuth.ts`) responds **401** when the header is missing
or names an unknown user, and otherwise attaches the user to the request.

## Authorization

All rules are enforced on the server in `server/src/services/documentAccess.ts`; the UI only
mirrors them.

| Role   | Read | Edit title/content | Trash / delete | Manage sharing |
|--------|:----:|:------------------:|:--------------:|:--------------:|
| Owner  | ✓    | ✓                  | ✓              | ✓              |
| Editor | ✓    | ✓                  |                |                |
| Viewer | ✓    |                    |                |                |

- No access → **403**. Nonexistent document → **404**. Malformed id → **400**.
- Trashed documents are visible only to their owner (collaborators get 404) and must be restored
  before editing (409).

## REST API

All responses are JSON. Errors use `{ "error": { "code": "...", "message": "...", "details"?: ... } }`.
Every `/api/documents` route requires the `x-demo-user-id` header.

| Method | Path                                   | Who            | Description |
|--------|----------------------------------------|----------------|-------------|
| GET    | `/api/health`                          | anyone         | Health and database check |
| GET    | `/api/users`                           | anyone         | Demo accounts (used by the account switcher) |
| GET    | `/api/documents`                       | any user       | Documents you own plus documents shared with you |
| POST   | `/api/documents`                       | any user       | Create `{ title?, content? }`; you become the owner |
| GET    | `/api/documents/:id`                   | owner/editor/viewer | Fetch one document |
| PATCH  | `/api/documents/:id`                   | owner/editor   | Update `{ title?, content?, version? }` |
| PATCH  | `/api/documents/:id`                   | owner          | Move to / restore from trash `{ trashed: boolean }` |
| DELETE | `/api/documents/:id`                   | owner          | Delete permanently |
| PUT    | `/api/documents/:id/shares`            | owner          | Grant/change access `{ userId \| email, permission: "viewer" \| "editor" }` |
| DELETE | `/api/documents/:id/shares/:userId`    | owner          | Revoke access |
| PUT    | `/api/documents/:id/favorite`          | owner/editor/viewer | Per-user favorite `{ isFavorite: boolean }` |
| POST   | `/api/documents/:id/open`              | owner/editor/viewer | Record "last opened" for the Recent list |
| POST   | `/api/documents/import` (multipart)    | any user / owner/editor | Import a `.txt`/`.md` file — see [File import](#file-import) |
| POST   | `/api/documents/import` (JSON)         | any user       | One-time import of pre-backend browser documents |

Document responses include the caller's `permission` (`owner`, `editor` or `viewer`), the owner,
the share list and a `version` number.

### Preventing lost updates

Every document has a `version` that increments on each title/content change. The editor sends the
version its content is based on; if someone else saved in the meantime the server answers
**409 `version_conflict`** with the latest document instead of overwriting it, and the editor
offers *Load latest version* or *Keep my changes*. Within one tab, autosaves are debounced by
800 ms and sent strictly one at a time, so an older request can never land after a newer one.

### Validation

- Document ids must be UUIDs; titles are 1–200 characters (whitespace collapsed).
- Content must be a TipTap JSON document using the node/mark types the editor supports
  (StarterKit), at most 5 MB, with safe link protocols only.
- Unknown request fields, malformed JSON, invalid permissions and oversized bodies are rejected
  with 4xx errors. All SQL uses prepared statements with bound parameters.

## File import

Users can import `.txt` and `.md` files (max **2 MB**, UTF-8):

- **Dashboard → Import File** creates a new document titled after the file name and opens it.
- **Editor → Import** (owners and editors only) inserts the file's contents at the cursor (or at
  the end if no cursor was placed). Existing content is kept and the change is saved by the normal
  800 ms autosave, with the usual conflict detection.

Both use a dialog with drag-and-drop, a browse button, client-side checks and upload progress.

### Endpoint

`POST /api/documents/import` with `multipart/form-data` (requests with a JSON body still go to
the browser-migration import on the same path):

| Field        | Required | Description |
|--------------|----------|-------------|
| `file`       | yes      | One `.txt` or `.md` file |
| `documentId` | no       | Import into this document instead of creating a new one (owner or editor) |
| `mode`       | no       | With `documentId`: `append` (default) saves the content at the end of the document; `convert` returns `{ content }` without saving (used by the editor to insert at the cursor) |
| `version`    | no       | With `append`: reject with 409 if the document changed since this version |

Responses: `201 { document, import }` for a new document, `200 { document, import }` for
`append`, `200 { content, import }` for `convert`.

### Safety

- Multer **memory storage** only — uploads are never written to disk.
- Limits: 2 MB (`413 file_too_large`), one file, small text fields.
- The file type is decided by the **extension only**; the client-supplied MIME type is ignored.
- Content must be valid **UTF-8** text: empty, binary (NUL bytes), UTF-16 and invalid UTF-8 files
  are rejected with 400. BOMs are stripped and line endings normalized.
- Importing into a document goes through the same `authorize()` check as `PATCH` (viewers and
  users without access get 403) and runs before the file is inspected.
- The converted document passes the same content validation as every other write.

### Conversion

- **TXT:** blank lines separate paragraphs; single line breaks are kept as line breaks.
- **Markdown** (small built-in converter, no extra dependency): headings (`#` and underline
  style), paragraphs with line breaks, bullet and numbered lists (nested, start number kept),
  blockquotes, fenced code blocks, horizontal rules, and **bold**, *italic*, ~~strike~~, `code`
  and links (http/https/mailto only; others become plain text). Images become their alt text;
  other syntax (tables, HTML) is kept as plain text. The parser is linear-time and depth-capped,
  so hostile input can't stall the server.

## Database

SQLite with foreign keys enforced (`PRAGMA foreign_keys = ON`) and WAL journaling. Schema:
`server/src/db/schema.ts` (versioned with `PRAGMA user_version`).

- `users` (`id`, `name`, `email` unique, `created_at`)
- `documents` (`id`, `title`, `content` TipTap JSON, `owner_id` → users, `created_at`,
  `updated_at`, plus `version` for conflict detection and `trashed_at` for the trash)
- `document_shares` (`id`, `document_id` → documents, `user_id` → users, `permission`
  viewer/editor, `created_at`; unique per document + user)
- `document_user_state` (per-user favorites and last-opened time)

Deleting a document cascades to its shares and per-user state.

## Migrating documents from the browser-only version

Before the backend existed, documents were stored in the browser's `localStorage`
(`collabspace.documents.v1`). When you open the app as **George**, those documents are imported
once into George's account, keeping their titles, content, timestamps, favorite and trash state.

- The original data is first copied to `collabspace.documents.v1.backup` and never deleted.
- Each document is removed from the pending list as soon as it's imported, so an interrupted
  import resumes later without duplicates.
- Old sample documents that belonged to fictional users (not the local user) are not imported;
  they remain in the backup.

## Testing

```bash
cd server && npm test
```

Tests use Node's built-in test runner. Each run starts the real Express app on a random port
against a brand-new SQLite file in the OS temp directory, which is deleted afterwards — the
development database is never touched.
