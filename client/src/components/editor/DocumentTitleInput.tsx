import { useEffect, useRef } from 'react'
import { DEFAULT_TITLE } from '../../lib/documentContent'

interface DocumentTitleInputProps {
  value: string
  onChange: (title: string) => void
  /** Called on Enter so focus can move into the document body. */
  onSubmit: () => void
  readOnly: boolean
  autoSelect: boolean
}

export function DocumentTitleInput({ value, onChange, onSubmit, readOnly, autoSelect }: DocumentTitleInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // New documents start with the title selected so typing replaces the default.
  useEffect(() => {
    if (autoSelect) inputRef.current?.select()
  }, [autoSelect])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => !value.trim() && onChange(DEFAULT_TITLE)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onSubmit()
        }
      }}
      readOnly={readOnly}
      placeholder={DEFAULT_TITLE}
      maxLength={200}
      aria-label="Document title"
      className="w-full min-w-0 truncate rounded-md border border-transparent px-1.5 py-0.5 text-base font-semibold text-slate-900 outline-none placeholder:text-slate-400 hover:border-slate-200 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/15 read-only:hover:border-transparent read-only:focus:border-transparent read-only:focus:ring-0"
    />
  )
}
