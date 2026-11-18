import { randomUUID } from 'node:crypto'
import { Router, type Request, type RequestHandler } from 'express'
import { badRequest, notFound } from '../errors.ts'
import { currentUser } from '../middleware/demoAuth.ts'
import { isMultipart, uploadSingleFile } from '../middleware/upload.ts'
import type { DocumentRepository } from '../repositories/documentRepository.ts'
import type { UserRepository } from '../repositories/userRepository.ts'
import { assertNotTrashed, authorize, versionConflict } from '../services/documentAccess.ts'
import { fileImportHandler } from './fileImport.ts'
import {
  DEFAULT_TITLE,
  emptyContent,
  parseBody,
  parseBoolean,
  parseContent,
  parseDocumentId,
  parseEmail,
  parsePermission,
  parseTimestamp,
  parseTitle,
  parseUserId,
  parseVersion,
} from '../validation.ts'

/** Express 5 types params as string | string[]; ours are always single strings. */
const param = (req: Request, name: string) => String(req.params[name])

export function documentsRouter(
  documents: DocumentRepository,
  users: UserRepository,
  { importLimiter }: { importLimiter: RequestHandler },
): Router {
  const router = Router()

  router.param('id', (req, _res, next, value) => {
    try {
      req.params.id = parseDocumentId(value)
      next()
    } catch (error) {
      next(error)
    }
  })

  /** Documents the user owns plus those shared with them. */
  router.get('/', (req, res) => {
    res.json({ documents: documents.listAccessible(currentUser(req).id) })
  })

  router.post('/', (req, res) => {
    const user = currentUser(req)
    const body = parseBody(req.body ?? {}, ['title', 'content'])
    const id = randomUUID()
    documents.insert({
      id,
      ownerId: user.id,
      title: body.title === undefined ? DEFAULT_TITLE : parseTitle(body.title),
      content: parseContent(body.content === undefined ? emptyContent() : body.content),
    })
    res.status(201).location(`/api/documents/${id}`).json({ document: documents.getDto(id, user.id) })
  })

  /**
   * POST /import serves two clients, chosen by Content-Type:
   *  - multipart/form-data: .txt/.md file upload (see fileImport.ts)
   *  - application/json: one-time import of pre-backend browser documents (below)
   */
  // The upload limiter runs before multer, so rejected uploads are never buffered.
  router.post('/import', isMultipart, importLimiter, uploadSingleFile, fileImportHandler(documents))

  router.post('/import', (req, res) => {
    const user = currentUser(req)
    const body = parseBody(req.body, ['title', 'content', 'createdAt', 'updatedAt', 'isFavorite', 'trashed'])
    const createdAt = parseTimestamp(body.createdAt, 'createdAt')
    const updatedAt = parseTimestamp(body.updatedAt, 'updatedAt')
    if (updatedAt < createdAt) throw badRequest('invalid_timestamp', 'updatedAt cannot be before createdAt.')
    const trashed = body.trashed === undefined ? false : parseBoolean(body.trashed, 'trashed')
    const favorite = body.isFavorite === undefined ? false : parseBoolean(body.isFavorite, 'isFavorite')
    const id = randomUUID()

    documents.transaction(() => {
      documents.insert({
        id,
        ownerId: user.id,
        title: parseTitle(body.title),
        content: parseContent(body.content),
        createdAt,
        updatedAt,
        trashedAt: trashed ? updatedAt : null,
      })
      if (favorite) documents.setFavorite(id, user.id, true)
    })
    res.status(201).location(`/api/documents/${id}`).json({ document: documents.getDto(id, user.id) })
  })

  router.get('/:id', (req, res) => {
    const user = currentUser(req)
    authorize(documents, param(req, 'id'), user, 'read')
    res.json({ document: documents.getDto(param(req, 'id'), user.id) })
  })

  /**
   * Edit title/content (owner or editor), or move to/restore from trash (owner).
   * Send `version` (from the last response) to guard against overwriting newer changes:
   * a stale version gets 409 with the current document in `error.details.document`.
   */
  router.patch('/:id', (req, res) => {
    const user = currentUser(req)
    const id = param(req, 'id')
    const body = parseBody(req.body, ['title', 'content', 'version', 'trashed'])
    const isEdit = body.title !== undefined || body.content !== undefined
    const isTrashChange = body.trashed !== undefined
    if (isEdit === isTrashChange) {
      throw badRequest('invalid_update', 'Send title and/or content, or trashed — not both, and not neither.')
    }

    documents.transaction(() => {
      const { row } = authorize(documents, id, user, isTrashChange ? 'manage' : 'write')

      if (isTrashChange) {
        documents.setTrashed(id, parseBoolean(body.trashed, 'trashed'))
        return
      }

      assertNotTrashed(row)
      const version = body.version === undefined ? row.version : parseVersion(body.version)
      const changes = {
        title: body.title === undefined ? row.title : parseTitle(body.title),
        content: body.content === undefined ? row.content : parseContent(body.content),
      }
      if (!documents.update(id, changes, version)) throw versionConflict(documents, id, user)
    })

    res.json({ document: documents.getDto(id, user.id) })
  })

  router.delete('/:id', (req, res) => {
    const id = param(req, 'id')
    authorize(documents, id, currentUser(req), 'manage')
    documents.delete(id)
    res.status(204).end()
  })

  /** Grant or change access. Body: `{ userId | email, permission }`. Owner only. */
  router.put('/:id/shares', (req, res) => {
    const user = currentUser(req)
    const id = param(req, 'id')
    const { row } = authorize(documents, id, user, 'manage')
    const body = parseBody(req.body, ['userId', 'email', 'permission'])
    if ((body.userId === undefined) === (body.email === undefined)) {
      throw badRequest('invalid_share_target', 'Send exactly one of userId or email.')
    }
    const permission = parsePermission(body.permission)
    const target =
      body.userId !== undefined ? users.findById(parseUserId(body.userId)) : users.findByEmail(parseEmail(body.email))
    if (!target) throw notFound('user_not_found', 'No CollabSpace user matches that account.')
    if (target.id === row.owner_id) throw badRequest('cannot_share_with_owner', 'The owner already has full access.')

    documents.upsertShare(id, target.id, permission)
    res.json({ document: documents.getDto(id, user.id) })
  })

  /** Revoke access. Owner only. */
  router.delete('/:id/shares/:userId', (req, res) => {
    const user = currentUser(req)
    const id = param(req, 'id')
    authorize(documents, id, user, 'manage')
    if (!documents.deleteShare(id, parseUserId(param(req, 'userId')))) {
      throw notFound('share_not_found', 'That user does not have access to this document.')
    }
    res.json({ document: documents.getDto(id, user.id) })
  })

  /** Per-user favorite flag. Anyone with read access. */
  router.put('/:id/favorite', (req, res) => {
    const user = currentUser(req)
    const id = param(req, 'id')
    authorize(documents, id, user, 'read')
    const body = parseBody(req.body, ['isFavorite'])
    documents.setFavorite(id, user.id, parseBoolean(body.isFavorite, 'isFavorite'))
    res.json({ document: documents.getDto(id, user.id) })
  })

  /** Records that the user opened the document (drives "Recently opened"). */
  router.post('/:id/open', (req, res) => {
    const user = currentUser(req)
    const id = param(req, 'id')
    authorize(documents, id, user, 'read')
    documents.markOpened(id, user.id)
    res.json({ document: documents.getDto(id, user.id) })
  })

  return router
}
