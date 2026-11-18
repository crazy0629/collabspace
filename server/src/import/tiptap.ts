/** Minimal TipTap JSON node types and builders shared by the import converters. */

export interface TipTapMark {
  type: string
  attrs?: Record<string, string | null>
}

export interface TipTapNode {
  type: string
  attrs?: Record<string, string | number | null>
  content?: TipTapNode[]
  marks?: TipTapMark[]
  text?: string
}

export const doc = (content: TipTapNode[]): TipTapNode => ({
  type: 'doc',
  content: content.length ? content : [{ type: 'paragraph' }],
})

export const paragraph = (content: TipTapNode[]): TipTapNode =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' }

export const text = (value: string, marks: TipTapMark[] = []): TipTapNode =>
  marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value }

export const hardBreak = (): TipTapNode => ({ type: 'hardBreak' })

/** Joins per-line inline content with hard breaks, preserving the original line breaks. */
export function joinLines(lines: TipTapNode[][]): TipTapNode[] {
  return lines.flatMap((line, index) => (index === 0 ? line : [hardBreak(), ...line]))
}
