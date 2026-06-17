// lib/image-utils.ts
// Single source of truth for turning a stored image path into a renderable URL. Shared so every
// surface resolves the same path the same way (the logo-fallback class of bug was two surfaces
// resolving the same image differently). Full URLs and absolute (/…) paths pass through untouched;
// a bare filename is prefixed with the default folder (e.g. 'logos' → /logos/<file>). '' when null.

export function formatImageUrl(rawPath: string | null, defaultFolder: string): string {
  if (!rawPath) return ''
  const cleanPath = rawPath.trim()
  if (cleanPath.startsWith('http') || cleanPath.startsWith('/')) return cleanPath
  return `/${defaultFolder}/${cleanPath}`
}
