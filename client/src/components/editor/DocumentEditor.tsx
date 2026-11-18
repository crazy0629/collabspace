import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Eye, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAutosave } from '../../hooks/useAutosave'
import type { ApiError } from '../../lib/api'
import { isConnectionError, onReconnect } from '../../lib/connection'
import { DEFAULT_TITLE, getPlainText } from '../../lib/documentContent'
import type { DocumentConflictError } from '../../services/documentService'
import { useDocuments } from '../../store/useDocuments'
import { useToast } from '../../store/useToast'
import type { Document, DocumentContent } from '../../types'
import { ImportFileDialog } from '../import/ImportFileDialog'
import { DocumentCanvas } from './DocumentCanvas'
import { EditorHeader } from './EditorHeader'
import { EditorToolbar } from './EditorToolbar'
import { SaveProblemBanner } from './SaveProblemBanner'
import { ShareDialog } from './ShareDialog'

type DocumentChanges = { title?: string; content?: DocumentContent }

/** Worth retrying automatically: the API is waking/unreachable, or we were rate-limited. */
const isTransientSaveError = (error: unknown) => isConnectionError(error) || (error as ApiError | null)?.status === 429

/** Owns the working copy of one document. Mount with `key={doc.id}`. */
export function DocumentEditor({ doc }: { doc: Document }) {
  const { saveDocument, markOpened, restoreDocument, upsertDocument, convertFileForDocument } = useDocuments()
  const toast = useToast()
  const [title, setTitle] = useState(doc.title)
  const [shareOpen, setShareOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // Whether the user has placed a cursor yet; if not, imports go to the end of the document.
  const hasFocusedRef = useRef(false)
  // Captured once: a blank new document gets its title pre-selected.
  const [isBlankOnOpen] = useState(() => doc.title === DEFAULT_TITLE && getPlainText(doc.content) === '')
  // The server version this editor's content is based on. Every save sends it, so a save made on
  // top of an outdated version is rejected (409) instead of overwriting someone else's changes.
  const baseVersionRef = useRef(doc.version)

  const isTrashed = Boolean(doc.trashedAt)
  const canEdit = !isTrashed && doc.permission !== 'viewer'

  const save = useCallback(
    async (changes: DocumentChanges) => {
      const saved = await saveDocument(doc.id, changes, baseVersionRef.current)
      baseVersionRef.current = saved.version
    },
    [saveDocument, doc.id],
  )
  const autosave = useAutosave(save, doc.updatedAt, { shouldRetry: isTransientSaveError })
  const { schedule, flush, discard } = autosave

  // Save queued edits as soon as a sleeping/unreachable API answers again.
  useEffect(() => onReconnect(() => void flush()), [flush])

  const editor = useEditor({
    immediatelyRender: true,
    extensions: [StarterKit],
    content: doc.content,
    editable: canEdit,
    editorProps: {
      attributes: { class: 'tiptap-content', 'aria-label': 'Document body' },
    },
    onUpdate: ({ editor }) => schedule({ content: editor.getJSON() }),
    onFocus: () => {
      hasFocusedRef.current = true
    },
  })

  useEffect(() => {
    markOpened(doc.id)
  }, [doc.id, markOpened])

  // useEditor only applies `editable` on creation; keep it in sync (e.g. after restoring from trash).
  // emitUpdate=false: setEditable otherwise fires `update`, which would trigger a spurious autosave.
  useEffect(() => {
    if (editor.isEditable !== canEdit) editor.setEditable(canEdit, false)
  }, [editor, canEdit])

  useEffect(() => {
    window.document.title = `${title.trim() || DEFAULT_TITLE} – CollabSpace`
    return () => {
      window.document.title = 'CollabSpace'
    }
  }, [title])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        flush()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [flush])

  function handleTitleChange(value: string) {
    setTitle(value)
    schedule({ title: value.trim() || DEFAULT_TITLE })
  }

  /**
   * Converts the file on the server (which checks edit access), then inserts it at the cursor.
   * The insertion is a normal edit, so the existing autosave persists it.
   */
  async function importIntoDocument(file: File, onProgress: (fraction: number) => void) {
    const content = await convertFileForDocument(doc.id, file, onProgress)
    editor
      .chain()
      .focus(hasFocusedRef.current ? undefined : 'end')
      .insertContent(content.content ?? [])
      .run()
    toast.success(`Imported “${file.name}” into this document.`)
  }

  /** Conflict resolution: throw away local edits and show the server's version. */
  function loadLatest({ latest }: DocumentConflictError) {
    discard(latest.updatedAt)
    baseVersionRef.current = latest.version
    upsertDocument(latest)
    setTitle(latest.title)
    editor.commands.setContent(latest.content, { emitUpdate: false })
  }

  /** Conflict resolution: re-save local edits on top of the server's version. */
  function keepMine({ latest }: DocumentConflictError) {
    baseVersionRef.current = latest.version
    upsertDocument(latest)
    flush()
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <EditorHeader
          doc={doc}
          title={title}
          onTitleChange={handleTitleChange}
          onTitleSubmit={() => editor.commands.focus('start')}
          autoSelectTitle={isBlankOnOpen && canEdit}
          readOnly={!canEdit}
          autosave={autosave}
          onShare={() => setShareOpen(true)}
          onImport={canEdit ? () => setImportOpen(true) : undefined}
        />
        {canEdit && (
          <div className="overflow-x-auto border-t border-slate-100 px-3 py-1.5 sm:px-5">
            <EditorToolbar editor={editor} />
          </div>
        )}
      </header>

      {autosave.status === 'error' && (
        <SaveProblemBanner error={autosave.error} onLoadLatest={loadLatest} onKeepMine={keepMine} onRetry={flush} />
      )}

      {isTrashed ? (
        <Banner icon={<Trash2 className="size-4" />}>
          This document is in the trash and is read-only.
          <button
            type="button"
            onClick={() => restoreDocument(doc.id)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 font-medium text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
          >
            <RotateCcw className="size-3.5" />
            Restore
          </button>
        </Banner>
      ) : (
        !canEdit && (
          <Banner icon={<Eye className="size-4" />}>
            {doc.owner.name} shared this document with you as a viewer, so it’s read-only.
          </Banner>
        )
      )}

      <main className="flex-1">
        <DocumentCanvas editor={editor} />
      </main>

      {shareOpen && <ShareDialog doc={doc} onClose={() => setShareOpen(false)} />}
      {importOpen && (
        <ImportFileDialog
          title="Import into this document"
          description="Insert the contents of a text or Markdown file at your cursor. Existing content is kept."
          submitLabel="Insert"
          onImport={importIntoDocument}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  )
}

function Banner({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      {icon}
      {children}
    </div>
  )
}
