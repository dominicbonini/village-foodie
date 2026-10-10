// lib/flags.ts — a country's flag as a small image, for the country menus (Phase 2D-1). SERVER-ONLY.
// 🔴 FROM A MAINTAINED PACKAGE, NEVER EMOJI: country-flag-icons, pinned exactly in package.json. The SVGs are
// read HERE, on the server, and only the flags actually shown travel to a browser — as data URIs in the
// props of the menu — so the client bundle never carries the whole set.
import 'server-only'
import * as FLAGS from 'country-flag-icons/string/3x2'

/** `data:` URI of the country's 3:2 flag, or null for a code the package does not know. */
export function flagDataUri(code: string): string | null {
  const svg = (FLAGS as unknown as Record<string, string | undefined>)[code.toUpperCase()]
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null
}
