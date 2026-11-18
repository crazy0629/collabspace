import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { RequestHandler } from 'express'
import { badRequest } from '../errors.ts'
import { convertUploadedFile } from '../import/index.ts'
import { currentUser } from '../middleware/demoAuth.ts'
import type { DocumentRepository } from '../repositories/documentRepository.ts'
import { assertNotTrashed, authorize, versionConflict } from '../services/documentAccess.ts'
import { parseBody, parseContent, parseDocumentId, parseVersion } from '../validation.ts'

type ImportMode = 'create' | 'append' | 'convert'

/**
 * POST /api/documents/import (multipart/form-data). Runs after `demoAuth` and `uploadSingleFile`.
 *
 * Fields:
 *   file        required — a .txt or .md file, max 2 MB
 *   documentId  optional — import into this existing document (owner or editor only)
 *   mode        with documentId: "append" (default) saves the content at the end of the document;
 *               "convert" only returns the converted content so the editor can insert it at the
 *               cursor and save it through the normal autosave PATCH
 *   version     optional, with mode=append — rejects the import with 409 if the document changed
 */
export function fileImportHandler(documents: DocumentRepository): RequestHandler {
  return (req, res) => {
    const user = currentUser(req)
    const body = parseBody({ ...req.body }, ['documentId', 'mode', 'version'])
    const documentId = body.documentId ? parseDocumentId(body.documentId) : undefined
    const mode = parseMode(body.mode, documentId)

    // Authorize before decoding/converting the upload, so viewers and strangers get 403 regardless of the file.
    if (documentId) assertNotTrashed(authorize(documents, documentId, user, 'write').row)

    if (!req.file) throw badRequest('missing_file', 'Attach a .txt or .md file in the "file" field.')
    const converted = convertUploadedFile(req.file.originalname, req.file.buffer)
    const serialized = parseContent(converted.content) // same validation as every other content write
    const meta = { filename: path.basename(req.file.originalname), format: converted.format, size: req.file.size }

    if (mode === 'create') {
      const id = randomUUID()
      documents.insert({ id, ownerId: user.id, title: converted.title, content: serialized })
      res.status(201).location(`/api/documents/${id}`).json({ document: documents.getDto(id, user.id), import: meta })
      return
    }

    const id = documentId as string
    if (mode === 'convert') {
      res.json({ content: converted.content, import: meta })
      return
    }

    documents.transaction(() => {
      // Re-check inside the transaction so the append applies to exactly what was authorized.
      const { row } = authorize(documents, id, user, 'write')
      assertNotTrashed(row)
      const version = body.version === undefined ? row.version : parseVersion(toInteger(body.version))
      const existing = JSON.parse(row.content) as { content?: unknown[] }
      const blocks = isBlankDocument(existing.content) ? [] : (existing.content ?? [])
      const merged = { type: 'doc', content: [...blocks, ...(converted.content.content ?? [])] }
      if (!documents.update(id, { title: row.title, content: parseContent(merged) }, version)) {
        throw versionConflict(documents, id, user)
      }
    })
    res.json({ document: documents.getDto(id, user.id), import: meta })
  }
}

function parseMode(value: unknown, documentId: string | undefined): ImportMode {
  if (!documentId) {
    if (value !== undefined && value !== 'create') {
      throw badRequest('invalid_mode', 'mode requires a documentId.')
    }
    return 'create'
  }
  if (value === undefined || value === 'append' || value === 'convert') return (value as ImportMode) ?? 'append'
  throw badRequest('invalid_mode', 'mode must be "append" or "convert".')
}

/** Multipart fields arrive as strings. */
function toInteger(value: unknown): unknown {
  return typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value
}

/** A brand-new document holds a single empty paragraph; imported content replaces it. */
function isBlankDocument(content: unknown[] | undefined): boolean {
  if (!content || content.length === 0) return true
  const [first] = content as Array<{ type?: string; content?: unknown[] }>
  return content.length === 1 && first.type === 'paragraph' && !first.content?.length
}
