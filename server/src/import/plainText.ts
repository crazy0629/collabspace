import { doc, joinLines, paragraph, text, type TipTapNode } from './tiptap.ts'

/** Plain text → TipTap: blank lines separate paragraphs, single newlines become hard breaks. */
export function plainTextToDoc(source: string): TipTapNode {
  const paragraphs = source
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/^\n+|\n+$/g, ''))
    .filter((block) => block.trim() !== '')
    .map((block) =>
      paragraph(joinLines(block.split('\n').map((line) => (line.trimEnd() ? [text(line.trimEnd())] : [])))),
    )
  return doc(paragraphs)
}
