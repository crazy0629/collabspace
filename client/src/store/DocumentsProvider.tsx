import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { errorMessage } from '../lib/api'
import { onReconnect } from '../lib/connection'
import { createDocumentService } from '../services/documentService'
import { LEGACY_TARGET_USER_ID, migrateLegacyDocuments, type MigrationResult } from '../services/legacyMigration'
import type { Document } from '../types'
import { DocumentsContext, type DocumentsContextValue, type LoadStatus } from './DocumentsContext'
import { useSession } from './useSession'
import { useToast } from './useToast'

function describeMigration({ imported, failed, notImported }: MigrationResult): string | null {
  if (imported === 0 && failed === 0) return null
  const parts = [`Imported ${imported} document${imported === 1 ? '' : 's'} saved in this browser into your account.`]
  if (failed) parts.push(`${failed} couldn’t be imported.`)
  if (notImported) parts.push(`${notImported} old sample document${notImported === 1 ? ' was' : 's were'} skipped.`)
  parts.push('A backup remains in this browser’s local storage.')
  return parts.join(' ')
}

function titleOf(documents: Document[], id: string): string {
  return documents.find((doc) => doc.id === id)?.title ?? 'Document'
}

/** Server-backed document store for the current demo user. Remount it (via `key`) when the user changes. */
export function DocumentsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useSession()
  const toast = useToast()
  const service = useMemo(() => createDocumentService(currentUser.id), [currentUser.id])
  const [documents, setDocuments] = useState<Document[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  // Mirror of `documents` so async actions read the latest version without stale closures.
  const documentsRef = useRef<Document[]>([])
  const loadedRef = useRef(false)

  const commit = useCallback((next: Document[]) => {
    documentsRef.current = next
    setDocuments(next)
  }, [])

  const upsertDocument = useCallback(
    (doc: Document) => {
      const exists = documentsRef.current.some((item) => item.id === doc.id)
      commit(exists ? documentsRef.current.map((item) => (item.id === doc.id ? doc : item)) : [doc, ...documentsRef.current])
    },
    [commit],
  )

  const removeDocument = useCallback(
    (id: string) => commit(documentsRef.current.filter((doc) => doc.id !== id)),
    [commit],
  )

  const refresh = useCallback(async () => {
    try {
      commit(await service.listDocuments())
      loadedRef.current = true
      setLoadError(null)
      setStatus('ready')
    } catch (error) {
      // Keep showing the documents we have if a background refresh fails.
      if (loadedRef.current) toast.error(error)
      else {
        setLoadError(errorMessage(error))
        setStatus('error')
      }
    }
  }, [service, commit, toast])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (currentUser.id === LEGACY_TARGET_USER_ID) {
        const result = await migrateLegacyDocuments(service).catch((error) => {
          console.error('[DocumentsProvider] Legacy migration failed', error)
          return null
        })
        const message = result && describeMigration(result)
        if (message && !cancelled) toast.info(message)
      }
      if (!cancelled) await refresh()
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentUser.id, service, refresh, toast])

  // If the initial load failed because the API was asleep/unreachable, load once it answers.
  useEffect(
    () =>
      onReconnect(() => {
        if (!loadedRef.current) void refresh()
      }),
    [refresh],
  )

  /** Runs a mutation, caches the returned document, and reports failures as toasts. */
  const run = useCallback(
    (action: () => Promise<Document>, successMessage?: string) => {
      action()
        .then((doc) => {
          upsertDocument(doc)
          if (successMessage) toast.success(successMessage)
        })
        .catch(toast.error)
    },
    [upsertDocument, toast],
  )

  const getDocument = useCallback((id: string) => documents.find((doc) => doc.id === id), [documents])

  const fetchDocument = useCallback(
    async (id: string) => {
      const doc = await service.getDocument(id)
      upsertDocument(doc)
      return doc
    },
    [service, upsertDocument],
  )

  const createDocument = useCallback(async () => {
    const doc = await service.createDocument()
    upsertDocument(doc)
    return doc
  }, [service, upsertDocument])

  const importFile = useCallback<DocumentsContextValue['importFile']>(
    async (file, onProgress) => {
      const doc = await service.importFile(file, onProgress)
      upsertDocument(doc)
      return doc
    },
    [service, upsertDocument],
  )

  const convertFileForDocument = useCallback<DocumentsContextValue['convertFileForDocument']>(
    (id, file, onProgress) => service.convertFile(id, file, onProgress),
    [service],
  )

  const saveDocument = useCallback<DocumentsContextValue['saveDocument']>(
    async (id, changes, baseVersion) => {
      // The editor supplies the version its content is based on; the cached copy may be
      // newer after a background refresh and must not be used, or we'd overwrite others' edits.
      const saved = await service.updateDocument(id, changes, baseVersion)
      upsertDocument(saved)
      return saved
    },
    [service, upsertDocument],
  )

  const markOpened = useCallback(
    (id: string) => {
      service
        .markOpened(id)
        .then(upsertDocument)
        .catch((error) => console.warn('[DocumentsProvider] Could not record open', error))
    },
    [service, upsertDocument],
  )

  const toggleFavorite = useCallback(
    (id: string) => {
      const doc = documentsRef.current.find((item) => item.id === id)
      if (doc) run(() => service.setFavorite(id, !doc.isFavorite))
    },
    [service, run],
  )

  const duplicateDocument = useCallback(
    async (id: string) => {
      const source = documentsRef.current.find((doc) => doc.id === id)
      if (!source) return undefined
      try {
        const copy = await service.createDocument({ title: `Copy of ${source.title}`.slice(0, 200), content: source.content })
        upsertDocument(copy)
        toast.success(`Created “${copy.title}”.`)
        return copy
      } catch (error) {
        toast.error(error)
        return undefined
      }
    },
    [service, upsertDocument, toast],
  )

  const moveToTrash = useCallback(
    (id: string) => run(() => service.setTrashed(id, true), `Moved “${titleOf(documentsRef.current, id)}” to trash.`),
    [service, run],
  )

  const restoreDocument = useCallback(
    (id: string) => run(() => service.setTrashed(id, false), `Restored “${titleOf(documentsRef.current, id)}”.`),
    [service, run],
  )

  const deleteForever = useCallback(
    (id: string) => {
      const title = titleOf(documentsRef.current, id)
      service
        .deleteDocument(id)
        .then(() => {
          removeDocument(id)
          toast.success(`Deleted “${title}” forever.`)
        })
        .catch(toast.error)
    },
    [service, removeDocument, toast],
  )

  const shareDocument = useCallback<DocumentsContextValue['shareDocument']>(
    async (id, email, permission) => upsertDocument(await service.shareDocument(id, email, permission)),
    [service, upsertDocument],
  )

  const updateSharePermission = useCallback<DocumentsContextValue['updateSharePermission']>(
    (id, userId, permission) => run(() => service.updateSharePermission(id, userId, permission)),
    [service, run],
  )

  const removeShare = useCallback<DocumentsContextValue['removeShare']>(
    (id, userId) => run(() => service.removeShare(id, userId)),
    [service, run],
  )

  const value = useMemo<DocumentsContextValue>(
    () => ({
      currentUser,
      status,
      loadError,
      documents,
      refresh,
      getDocument,
      fetchDocument,
      upsertDocument,
      createDocument,
      importFile,
      convertFileForDocument,
      saveDocument,
      markOpened,
      toggleFavorite,
      duplicateDocument,
      moveToTrash,
      restoreDocument,
      deleteForever,
      shareDocument,
      updateSharePermission,
      removeShare,
    }),
    [
      importFile,
      convertFileForDocument,
      currentUser,
      status,
      loadError,
      documents,
      refresh,
      getDocument,
      fetchDocument,
      upsertDocument,
      createDocument,
      saveDocument,
      markOpened,
      toggleFavorite,
      duplicateDocument,
      moveToTrash,
      restoreDocument,
      deleteForever,
      shareDocument,
      updateSharePermission,
      removeShare,
    ],
  )

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>
}
