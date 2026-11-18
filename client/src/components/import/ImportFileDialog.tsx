import { FileText, FileUp, LoaderCircle, X } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { errorMessage } from '../../lib/api'
import { IMPORT_ACCEPT, MAX_IMPORT_BYTES, formatBytes, validateImportFile } from '../../lib/fileImport'
import { Modal } from '../ui/Modal'

interface ImportFileDialogProps {
  title: string
  description: string
  submitLabel: string
  /** Performs the import; reject to show the error in the dialog. The dialog closes on success. */
  onImport: (file: File, onProgress: (fraction: number) => void) => Promise<void>
  onClose: () => void
}

/** File picker with drag-and-drop, client-side validation and upload progress. */
export function ImportFileDialog({ title, description, submitLabel, onImport, onClose }: ImportFileDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const uploading = progress !== null

  function selectFile(selected: File | undefined) {
    if (!selected) return
    const problem = validateImportFile(selected)
    setFile(problem ? null : selected)
    setError(problem)
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (uploading) return
    if (event.dataTransfer.files.length > 1) {
      setError('Drop one file at a time.')
      return
    }
    selectFile(event.dataTransfer.files[0])
  }

  async function submit() {
    if (!file || uploading) return
    setError(null)
    setProgress(0)
    try {
      await onImport(file, setProgress)
      onClose()
    } catch (importError) {
      setError(errorMessage(importError))
      setProgress(null)
    }
  }

  // Closing mid-upload would hide the result; wait for it to finish.
  const close = () => !uploading && onClose()

  return (
    <Modal title={title} description={description} onClose={close}>
      <div className="space-y-4 px-6 pt-5 pb-2">
        <div
          onDragOver={(event) => {
            event.preventDefault()
            if (!uploading) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            dragging ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 bg-slate-50/60'
          }`}
        >
          <span className="flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-indigo-600 shadow-xs">
            <FileUp className="size-6" strokeWidth={1.75} />
          </span>
          <p className="mt-3 text-sm font-medium text-slate-900">Drag and drop a file here</p>
          <p className="mt-1 text-sm text-slate-500">
            or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
            >
              browse files
            </button>
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Supports .txt and .md (Markdown) · Max {formatBytes(MAX_IMPORT_BYTES)}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={IMPORT_ACCEPT}
            className="sr-only"
            aria-label="Choose a file to import"
            onChange={(event) => {
              selectFile(event.target.files?.[0])
              event.target.value = '' // allow re-selecting the same file
            }}
          />
        </div>

        {file && (
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <FileText className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
              </div>
              {!uploading && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {uploading && (
              <div className="mt-3">
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuenow={Math.round(progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${Math.max(progress, 0.03) * 100}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-slate-500" role="status">
                  {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Converting…'}
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 px-6 pt-3 pb-5">
        <button
          type="button"
          onClick={close}
          disabled={uploading}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!file || uploading}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading && <LoaderCircle className="size-4 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </Modal>
  )
}
