import type { DocumentContent } from '../types'

export const DEFAULT_TITLE = 'Untitled document'

/** Concatenated text of a TipTap JSON tree, with block nodes separated by spaces. */
export function getPlainText(node: DocumentContent): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(getPlainText).join(' ').replace(/\s+/g, ' ').trim()
}

/** Plain-text excerpt for previews, skipping a leading H1 that usually repeats the title. */
export function getExcerpt(content: DocumentContent, maxLength = 140): string {
  const blocks = content.content ?? []
  const body = blocks[0]?.type === 'heading' && blocks[0].attrs?.level === 1 ? blocks.slice(1) : blocks
  const text = getPlainText({ type: 'doc', content: body })
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text
}
