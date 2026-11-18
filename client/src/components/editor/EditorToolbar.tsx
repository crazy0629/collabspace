import { useEditorState, type Editor } from '@tiptap/react'
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { Fragment } from 'react'

interface ToolbarButton {
  label: string
  shortcut?: string
  icon: LucideIcon
  isActive?: boolean
  disabled?: boolean
  run: () => void
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  // TipTap v3 doesn't re-render on every transaction; subscribe to just the state the toolbar shows.
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      h1: editor.isActive('heading', { level: 1 }),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      paragraph: editor.isActive('paragraph'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      blockquote: editor.isActive('blockquote'),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  })

  const chain = () => editor.chain().focus()

  const groups: ToolbarButton[][] = [
    [
      { label: 'Undo', shortcut: 'Ctrl+Z', icon: Undo2, disabled: !state.canUndo, run: () => chain().undo().run() },
      { label: 'Redo', shortcut: 'Ctrl+Shift+Z', icon: Redo2, disabled: !state.canRedo, run: () => chain().redo().run() },
    ],
    [
      { label: 'Paragraph', icon: Pilcrow, isActive: state.paragraph, run: () => chain().setParagraph().run() },
      { label: 'Heading 1', icon: Heading1, isActive: state.h1, run: () => chain().toggleHeading({ level: 1 }).run() },
      { label: 'Heading 2', icon: Heading2, isActive: state.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
      { label: 'Heading 3', icon: Heading3, isActive: state.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    ],
    [
      { label: 'Bold', shortcut: 'Ctrl+B', icon: Bold, isActive: state.bold, run: () => chain().toggleBold().run() },
      { label: 'Italic', shortcut: 'Ctrl+I', icon: Italic, isActive: state.italic, run: () => chain().toggleItalic().run() },
      { label: 'Underline', shortcut: 'Ctrl+U', icon: Underline, isActive: state.underline, run: () => chain().toggleUnderline().run() },
      { label: 'Strikethrough', shortcut: 'Ctrl+Shift+S', icon: Strikethrough, isActive: state.strike, run: () => chain().toggleStrike().run() },
    ],
    [
      { label: 'Bulleted list', icon: List, isActive: state.bulletList, run: () => chain().toggleBulletList().run() },
      { label: 'Numbered list', icon: ListOrdered, isActive: state.orderedList, run: () => chain().toggleOrderedList().run() },
      { label: 'Quote', icon: Quote, isActive: state.blockquote, run: () => chain().toggleBlockquote().run() },
    ],
  ]

  return (
    <div className="flex w-max items-center gap-y-1 sm:w-auto sm:flex-wrap" role="toolbar" aria-label="Formatting">
      {groups.map((group, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="mx-1.5 h-5 w-px bg-slate-200" role="separator" aria-orientation="vertical" />}
          <div className="flex items-center gap-0.5">
            {group.map(({ label, shortcut, icon: Icon, isActive, disabled, run }) => (
              <button
                key={label}
                type="button"
                title={shortcut ? `${label} (${shortcut})` : label}
                aria-label={label}
                aria-pressed={isActive}
                disabled={disabled}
                // Keep the editor selection while clicking toolbar buttons.
                onMouseDown={(event) => event.preventDefault()}
                onClick={run}
                className={`flex size-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  )
}
