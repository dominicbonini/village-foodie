// lib/public-script.ts — cwv-2 (6 November 2026, docs/cwv-2-report.md §3): WHICH SCRIPT FONT A PUBLIC PAGE'S LANGUAGE NEEDS. Pure, no imports.
// The public root layouts (components/public/PublicDocument.tsx) cannot import lib/script-fonts.ts: that module declares all five script
// fonts, so importing it puts every script's @font-face rules (~76 KB) into every public page's CSS. This is the SAME language test as
// lib/script-fonts.ts scriptFontClassOf (scripts/cwv-2.cjs proves it for every locale), answering a key instead of a class, and each
// key's font is declared in its own module (components/public/script-fonts/<key>.tsx), loaded only on that language's pages.
export type ScriptKey = 'greek-cyrillic' | 'ja' | 'zh-hk' | 'th' | 'ar'

/** The script font a language needs, or null (every Latin-script language). Same rule as lib/script-fonts.ts scriptFontClassOf. */
export function scriptKeyOf(lang: string | null | undefined): ScriptKey | null {
  const l = String(lang ?? '').toLowerCase()
  if (/^(el|bg)(-|$)/.test(l)) return 'greek-cyrillic'
  return l.startsWith('ja') ? 'ja' : l.startsWith('zh') ? 'zh-hk' : l.startsWith('th') ? 'th' : l.startsWith('ar') ? 'ar' : null
}

/** The <body> class that turns that script's font on (components/public/script-fonts/<key>.tsx defines it). */
export const scriptClassOf = (key: ScriptKey): string => `hg-script-${key}`

/** Right to left: Arabic, (languages-world-1) Hebrew and (languages-world-2) Urdu. Same rule as lib/script-fonts.ts isRtl. */
export const isRtlLang = (lang: string | null | undefined): boolean => /^(ar|he|ur)(-|$)/i.test(String(lang ?? ''))
