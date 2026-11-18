import { decodeTextFile, detectFormat, titleFromFilename, type ImportFormat } from './decode.ts'
import { markdownToDoc } from './markdown.ts'
import { plainTextToDoc } from './plainText.ts'
import type { TipTapNode } from './tiptap.ts'

export { MAX_UPLOAD_BYTES, SUPPORTED_EXTENSIONS } from './decode.ts'
export type { ImportFormat } from './decode.ts'

export interface ConvertedFile {
  title: string
  format: ImportFormat
  content: TipTapNode
}

/** Validates and converts an uploaded .txt/.md file into a TipTap document. */
export function convertUploadedFile(filename: string, buffer: Buffer): ConvertedFile {
  const format = detectFormat(filename)
  const source = decodeTextFile(buffer)
  return {
    title: titleFromFilename(filename),
    format,
    content: format === 'markdown' ? markdownToDoc(source) : plainTextToDoc(source),
  }
}
