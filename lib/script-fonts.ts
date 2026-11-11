// lib/script-fonts.ts — world-countries-1 (31 October 2026, docs/world-countries-1-report.md §3): THE SCRIPT FONTS for Japanese,
// Traditional Chinese (Hong Kong), Thai and Arabic, defined ONCE (Next's "font definitions file") so the root layout (server pages
// whose language the proxy knows) and the language provider (lib/i18n/client.tsx — pages that learn a truck's language in the
// browser: the order page, dashboard, KDS, Manage) put the same class on <body>.
// Each is named in the stacks only under its :lang() (app/globals.css, app/landing/landing.css), BEFORE the size-adjusted local
// fallback — so a Latin page never fetches a file, and a page in one of these languages always draws it with Noto. Never preloaded.
// world-countries-2 (1 November 2026): + GREEK AND CYRILLIC (europe-languages-2's Noto Sans, moved here from app/layout.tsx), so a
// Greek or Bulgarian truck page whose language is learnt in the browser loads it too — it did not before.
import { Noto_Sans, Noto_Sans_JP, Noto_Sans_HK, Noto_Sans_Thai, Noto_Sans_Arabic } from 'next/font/google'

// Geist has Cyrillic but no Greek, and the landing faces (Archivo, Public Sans) have neither: Noto Sans fills ONLY those letters,
// named in the stacks only under :lang(el) / :lang(bg), each @font-face range-scoped.
const greekCyrillic = Noto_Sans({ variable: '--font-script-fallback', subsets: ['greek', 'cyrillic'], preload: false, display: 'swap' })

const ja = Noto_Sans_JP({ variable: '--font-script-ja', preload: false, display: 'swap' })
const zhHk = Noto_Sans_HK({ variable: '--font-script-zh-hk', preload: false, display: 'swap' })
const th = Noto_Sans_Thai({ variable: '--font-script-th', subsets: ['thai'], preload: false, display: 'swap' })
const ar = Noto_Sans_Arabic({ variable: '--font-script-ar', subsets: ['arabic'], preload: false, display: 'swap' })

/** The <body> class a language's script font needs, or null (every Latin-script language). */
export function scriptFontClassOf(lang: string | null | undefined): string | null {
  const l = String(lang ?? '').toLowerCase()
  if (/^(el|bg)(-|$)/.test(l)) return greekCyrillic.variable
  return l.startsWith('ja') ? ja.variable : l.startsWith('zh') ? zhHk.variable : l.startsWith('th') ? th.variable : l.startsWith('ar') ? ar.variable : null
}

/** Right to left: Arabic and (languages-world-1, 10 November 2026) Hebrew. Every other language is left to right (no `dir` attribute is written). */
export const isRtl = (lang: string | null | undefined): boolean => /^(ar|he)(-|$)/i.test(String(lang ?? ''))
