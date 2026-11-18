/**
 * Schema migrations, applied in order. `PRAGMA user_version` records how many have run,
 * so append new migrations rather than editing existing ones.
 */
export const migrations: string[] = [
  /* 1: initial schema */ `
  CREATE TABLE users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE documents (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    content     TEXT NOT NULL CHECK (json_valid(content)),          -- TipTap JSON
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),    -- optimistic concurrency
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    trashed_at  TEXT
  );
  CREATE INDEX idx_documents_owner ON documents(owner_id, updated_at DESC);

  CREATE TABLE document_shares (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission   TEXT NOT NULL CHECK (permission IN ('viewer', 'editor')),
    created_at   TEXT NOT NULL,
    UNIQUE (document_id, user_id)
  );
  CREATE INDEX idx_document_shares_user ON document_shares(user_id);

  -- Per-user, per-document UI state (favorites, recently opened).
  CREATE TABLE document_user_state (
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    is_favorite     INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    last_opened_at  TEXT,
    PRIMARY KEY (user_id, document_id)
  );
  CREATE INDEX idx_document_user_state_document ON document_user_state(document_id);
  `,
]
