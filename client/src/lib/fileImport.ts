// Mirrors the server's limits so users get instant feedback; the server re-validates everything.
export const IMPORT_EXTENSIONS = ['.txt', '.md'] as const
export const IMPORT_ACCEPT = '.txt,.md,text/plain,text/markdown'
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Returns a user-facing error, or null if the file can be uploaded. */
export function validateImportFile(file: File): string | null {
  const dot = file.name.lastIndexOf('.')
  const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase()
  if (!(IMPORT_EXTENSIONS as readonly string[]).includes(extension)) {
    return `“${file.name}” isn’t supported. Choose a .txt or .md file.`
  }
  if (file.size === 0) return `“${file.name}” is empty.`
  if (file.size > MAX_IMPORT_BYTES) {
    return `“${file.name}” is ${formatBytes(file.size)}. The maximum size is ${formatBytes(MAX_IMPORT_BYTES)}.`
  }
  return null
}
