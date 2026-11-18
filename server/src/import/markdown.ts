/**
 * Small Markdown → TipTap JSON converter covering the structures the editor supports:
 * ATX/setext headings, paragraphs (line breaks preserved as hard breaks), bullet and
 * numbered lists (nested), blockquotes, fenced code, horizontal rules, and inline
 * bold / italic / strikethrough / code / links. Anything else is kept as plain text.
 *
 * Written to be safe on hostile input: recursion is depth-capped and every scan is
 * bounded or cached, so a 2 MB upload cannot trigger quadratic work or a stack overflow.
 */
import { doc, joinLines, paragraph, text, type TipTapMark, type TipTapNode } from './tiptap.ts'

const MAX_BLOCK_DEPTH = 12
const MAX_INLINE_DEPTH = 8
const LINK_SCAN_LIMIT = 2000
const SAFE_LINK = /^(https?:|mailto:|\/|#)/i

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)/
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const HORIZONTAL_RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const BLOCKQUOTE = /^ {0,3}>/
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/
const SETEXT_H1 = /^ {0,3}=+[ \t]*$/
const SETEXT_H2 = /^ {0,3}-+[ \t]*$/
const ESCAPABLE = /[!-/:-@[-`{-~]/

export function markdownToDoc(source: string): TipTapNode {
  return doc(parseBlocks(source.split('\n'), 0))
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

interface ListMarker {
  indent: number
  ordered: boolean
  start: number
  text: string
}

function indentWidth(line: string): number {
  let width = 0
  for (const char of line) {
    if (char === ' ') width++
    else if (char === '\t') width += 4 - (width % 4)
    else break
  }
  return width
}

function matchListItem(line: string): ListMarker | null {
  const match = LIST_ITEM.exec(line)
  if (!match) return null
  const ordered = /\d/.test(match[2])
  return { indent: indentWidth(match[1]), ordered, start: ordered ? parseInt(match[2], 10) : 1, text: match[3] }
}

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    ATX_HEADING.test(line) ||
    BLOCKQUOTE.test(line) ||
    HORIZONTAL_RULE.test(line) ||
    LIST_ITEM.test(line)
  )
}

const isBlank = (line: string) => line.trim() === ''

function inlineLines(lines: string[]): TipTapNode[] {
  return joinLines(lines.map((line) => parseInline(line.trim())))
}

function heading(level: number, source: string): TipTapNode {
  const content = parseInline(source.trim())
  return content.length ? { type: 'heading', attrs: { level }, content } : { type: 'heading', attrs: { level } }
}

function parseBlocks(lines: string[], depth: number): TipTapNode[] {
  const blocks: TipTapNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (isBlank(line)) {
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const closing = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`)
      const body: string[] = []
      i++
      while (i < lines.length && !closing.test(lines[i])) body.push(lines[i++])
      i++ // closing fence (or end of input)
      const language = /^[\w+#.-]{1,30}$/.test(fence[2]) ? fence[2] : null
      const code = body.join('\n')
      blocks.push({ type: 'codeBlock', attrs: { language }, ...(code ? { content: [text(code)] } : {}) })
      continue
    }

    if (HORIZONTAL_RULE.test(line)) {
      blocks.push({ type: 'horizontalRule' })
      i++
      continue
    }

    const atx = ATX_HEADING.exec(line)
    if (atx) {
      blocks.push(heading(atx[1].length, atx[2] ?? ''))
      i++
      continue
    }

    if (depth < MAX_BLOCK_DEPTH && BLOCKQUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && BLOCKQUOTE.test(lines[i])) inner.push(lines[i++].replace(/^ {0,3}> ?/, ''))
      const content = parseBlocks(inner, depth + 1)
      blocks.push({ type: 'blockquote', content: content.length ? content : [paragraph([])] })
      continue
    }

    const item = matchListItem(line)
    if (depth < MAX_BLOCK_DEPTH && item) {
      const list = parseList(lines, i, item, depth + 1)
      blocks.push(list.node)
      i = list.next
      continue
    }

    // Paragraph, possibly turned into a setext heading by an underline of === or ---.
    const paragraphLines = [line]
    let setextLevel = 0
    i++
    while (i < lines.length && !isBlank(lines[i])) {
      if (SETEXT_H1.test(lines[i])) setextLevel = 1
      else if (SETEXT_H2.test(lines[i])) setextLevel = 2
      else if (startsBlock(lines[i])) break
      else {
        paragraphLines.push(lines[i++])
        continue
      }
      i++
      break
    }
    blocks.push(
      setextLevel
        ? heading(setextLevel, paragraphLines.map((l) => l.trim()).join(' '))
        : paragraph(inlineLines(paragraphLines)),
    )
  }

  return blocks
}

function parseList(lines: string[], start: number, first: ListMarker, depth: number): { node: TipTapNode; next: number } {
  const { indent, ordered } = first
  const items: TipTapNode[] = []
  let i = start

  while (i < lines.length) {
    const item = matchListItem(lines[i])
    if (!item || item.indent !== indent || item.ordered !== ordered) break
    i++

    const children: TipTapNode[] = []
    let paragraphLines: string[] = [item.text]
    const flushParagraph = () => {
      if (paragraphLines.length) children.push(paragraph(inlineLines(paragraphLines)))
      paragraphLines = []
    }

    while (i < lines.length) {
      const line = lines[i]
      if (isBlank(line)) {
        // A blank line continues the item only if indented content follows.
        let j = i + 1
        while (j < lines.length && isBlank(lines[j])) j++
        if (j < lines.length && indentWidth(lines[j]) > indent && !matchListItem(lines[j])) {
          flushParagraph()
          i = j
          continue
        }
        if (j < lines.length && (matchListItem(lines[j])?.indent ?? -1) > indent) {
          i = j
          continue
        }
        break
      }
      const nested = matchListItem(line)
      if (nested && nested.indent > indent && depth < MAX_BLOCK_DEPTH) {
        flushParagraph()
        const list = parseList(lines, i, nested, depth + 1)
        children.push(list.node)
        i = list.next
        continue
      }
      if (nested || (indentWidth(line) <= indent && startsBlock(line))) break
      paragraphLines.push(line) // continuation line
      i++
    }
    flushParagraph()
    items.push({ type: 'listItem', content: children })

    // Blank lines between sibling items don't end the list.
    let j = i
    while (j < lines.length && isBlank(lines[j])) j++
    const sibling = j < lines.length ? matchListItem(lines[j]) : null
    if (sibling && sibling.indent === indent && sibling.ordered === ordered) i = j
  }

  const node: TipTapNode = ordered
    ? { type: 'orderedList', attrs: { start: first.start }, content: items }
    : { type: 'bulletList', content: items }
  return { node, next: i }
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

const EMPHASIS = [
  { token: '**', mark: 'bold' },
  { token: '__', mark: 'bold' },
  { token: '~~', mark: 'strike' },
  { token: '*', mark: 'italic' },
  { token: '_', mark: 'italic' },
] as const

const isWhitespace = (char: string | undefined) => char === undefined || /\s/.test(char)
const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char)

function withMark(marks: TipTapMark[], mark: TipTapMark): TipTapMark[] {
  return marks.some((existing) => existing.type === mark.type) ? marks : [...marks, mark]
}

function linkMark(href: string): TipTapMark {
  return { type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow', class: null } }
}

/** Finds a closing emphasis delimiter for `token` at or after `from`, or -1. */
function findEmphasisClose(source: string, from: number, token: string): number {
  const single = token.length === 1
  for (let j = source.indexOf(token, from); j !== -1; j = source.indexOf(token, j + 1)) {
    if (isWhitespace(source[j - 1])) continue
    // A single * or _ must not be part of a ** / __ run.
    if (single && (source[j + 1] === token || source[j - 1] === token)) continue
    if (token[0] === '_' && isWordChar(source[j + token.length])) continue
    return j
  }
  return -1
}

/**
 * Index of the matching closer for every `[` and `(` in one linear pass (escapes honored),
 * so link detection never rescans the line.
 */
function matchBrackets(source: string): Map<number, number> {
  const matches = new Map<number, number>()
  const stacks: Record<string, number[]> = { ']': [], ')': [] }
  for (let j = 0; j < source.length; j++) {
    const char = source[j]
    if (char === '\\') j++
    else if (char === '[') stacks[']'].push(j)
    else if (char === '(') stacks[')'].push(j)
    else if (char === ']' || char === ')') {
      const open = stacks[char].pop()
      if (open !== undefined) matches.set(open, j)
    }
  }
  return matches
}

function parseInline(source: string, marks: TipTapMark[] = [], depth = 0): TipTapNode[] {
  const nodes: TipTapNode[] = []
  // Delimiters with no closer after some position can't have one after a later position either.
  const unclosable = new Set<string>()
  let brackets: Map<number, number> | null = null
  let buffer = ''
  const flush = () => {
    if (buffer) nodes.push(text(buffer, marks))
    buffer = ''
  }

  let i = 0
  while (i < source.length) {
    const char = source[i]

    if (char === '\\' && ESCAPABLE.test(source[i + 1] ?? '')) {
      buffer += source[i + 1]
      i += 2
      continue
    }

    if (char === '`') {
      let run = 1
      while (source[i + run] === '`') run++
      const ticks = '`'.repeat(run)
      const close = unclosable.has(ticks) ? -1 : source.indexOf(ticks, i + run)
      if (close === -1) {
        unclosable.add(ticks)
        buffer += ticks
        i += run
        continue
      }
      flush()
      const code = source.slice(i + run, close).replace(/^ (.+) $/, '$1')
      // Code excludes other marks in TipTap, so it is applied alone.
      if (code) nodes.push(text(code, [{ type: 'code' }]))
      i = close + run
      continue
    }

    if (char === '<') {
      const autolink = /^<(https?:\/\/[^\s<>]{1,2000})>/.exec(source.slice(i, i + 2010))
      if (autolink) {
        flush()
        nodes.push(text(autolink[1], withMark(marks, linkMark(autolink[1]))))
        i += autolink[0].length
        continue
      }
    }

    const isImage = char === '!' && source[i + 1] === '['
    if ((char === '[' || isImage) && depth < MAX_INLINE_DEPTH) {
      brackets ??= matchBrackets(source)
      const open = isImage ? i + 1 : i
      const closeBracket = brackets.get(open) ?? -1
      const closeParen = closeBracket !== -1 && source[closeBracket + 1] === '(' ? (brackets.get(closeBracket + 1) ?? -1) : -1
      if (closeParen !== -1 && closeBracket - open < LINK_SCAN_LIMIT && closeParen - closeBracket < LINK_SCAN_LIMIT) {
        const label = source.slice(open + 1, closeBracket)
        const href = source.slice(closeBracket + 2, closeParen).trim().split(/\s+/)[0].replace(/^<|>$/g, '')
        flush()
        if (isImage) {
          if (label) nodes.push(text(label, marks)) // images become their alt text
        } else {
          const labelMarks = SAFE_LINK.test(href) ? withMark(marks, linkMark(href)) : marks
          nodes.push(...parseInline(label || href, labelMarks, depth + 1))
        }
        i = closeParen + 1
        continue
      }
    }

    const emphasis = depth < MAX_INLINE_DEPTH ? EMPHASIS.find(({ token }) => source.startsWith(token, i)) : undefined
    if (emphasis) {
      const { token } = emphasis
      const opensWord = !isWhitespace(source[i + token.length]) && !(token[0] === '_' && isWordChar(source[i - 1]))
      const close = opensWord && !unclosable.has(token) ? findEmphasisClose(source, i + token.length + 1, token) : -1
      if (close === -1) {
        if (opensWord) unclosable.add(token)
        buffer += token
        i += token.length
        continue
      }
      flush()
      nodes.push(...parseInline(source.slice(i + token.length, close), withMark(marks, { type: emphasis.mark }), depth + 1))
      i = close + token.length
      continue
    }

    buffer += char
    i++
  }

  flush()
  return nodes
}
