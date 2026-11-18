import { FileUp } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDocuments } from '../../store/useDocuments'
import { useToast } from '../../store/useToast'
import { ImportFileDialog } from './ImportFileDialog'

/** Dashboard action: upload a .txt/.md file as a new document, then open it. */
export function ImportDocumentButton() {
  const { importFile } = useDocuments()
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        <FileUp className="size-4" />
        Import File
      </button>
      {open && (
        <ImportFileDialog
          title="Import a file"
          description="Create a new document from a text or Markdown file. The file name becomes the title."
          submitLabel="Import"
          onClose={() => setOpen(false)}
          onImport={async (file, onProgress) => {
            const doc = await importFile(file, onProgress)
            toast.success(`Imported “${doc.title}”.`)
            navigate(`/documents/${doc.id}`)
          }}
        />
      )}
    </>
  )
}
