import { EditorContent, useEditorState, type Editor } from '@tiptap/react'

export function DocumentCanvas({ editor }: { editor: Editor }) {
  const { isEmpty, isEditable } = useEditorState({
    editor,
    selector: ({ editor }) => ({ isEmpty: editor.isEmpty, isEditable: editor.isEditable }),
  })

  return (
    <div className="px-3 py-6 sm:px-6 sm:py-10">
      <div
        className={`mx-auto min-h-[calc(100vh-14rem)] w-full max-w-[816px] cursor-text rounded-lg border border-slate-200 bg-white px-6 py-10 shadow-sm sm:px-14 sm:py-16 lg:px-[72px] ${
          isEmpty && isEditable ? 'show-placeholder' : ''
        }`}
        // Clicking the page margins should still place the cursor in the document.
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault()
            editor.commands.focus('end')
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
