// lib/legal-documents.ts — legal-languages-1 (1 November 2026, docs/legal-languages-1-report.md §1): A LEGAL DOCUMENT'S TEXT
// IN THE READER'S LANGUAGE, on the server.
//
// English (content/legal/<file>) is the governing version and is returned exactly as written — the /privacy, /terms and
// /country-terms pages keep reading their own file at build time and never come through here. A non-English locale reads its
// language base's translation (content/legal/<base>/<file>, lib/legal.ts legalBaseOf), which:
//   • carries a source stamp on its first line (scripts/_legal-translations.cjs) — removed here, never shown;
//   • has `{{LAST_UPDATED}}` where its date goes — replaced here with the ENGLISH document's own date, written the way the
//     language writes dates (the Gregorian calendar and Latin digits everywhere, so Thai shows 2026, not 2569) — so a
//     translation can never show a date of its own (the legal-date rule, manual §43);
//   • keeps the English links' targets (/terms, /privacy, /country-terms) — pointed here at the same country's translations;
//   • for Swiss German (de-CH, and de-LI over it) is de-DE's text written the Swiss way, "ss" for "ß".
// A language with no translation file yet reads English (and the page says nothing about a translation).
import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import { LEGAL_DOC_FILE, LEGAL_DOCS, legalBaseOf, legalPath, legalUpdatedDate, type LegalDoc } from '@/lib/legal'
import { overrideChain, resolveLocale, type AppLocale } from '@/lib/i18n/locales'
import { intlDateLocale } from '@/lib/i18n/intl-locale'   // pricing-copy-3: Serbian dates in Latin script

const DIR = path.join(process.cwd(), 'content/legal')
const STAMP = /^<!-- translation-of: [\w.-]+ sha256:[0-9a-f]{64} -->\n/
const cache = new Map<string, string | null>()
const readOnce = (p: string): string | null => {
  if (!cache.has(p)) { try { cache.set(p, fs.readFileSync(p, 'utf8')) } catch { cache.set(p, null) } }
  return cache.get(p)!
}

/** The English document's own date line ("1 November 2026"). */
function englishDate(doc: LegalDoc): string {
  const m = /^\*\*Last updated:\*\* (.+)$/m.exec(readOnce(path.join(DIR, LEGAL_DOC_FILE[doc])) ?? '')
  if (!m) throw new Error(`[legal] ${LEGAL_DOC_FILE[doc]}: no "**Last updated:**" line`)
  return m[1].trim()
}

/** A legal date ("1 November 2026") the way `locale` writes it ("1. November 2026", "2026年11月1日"). */
export function localLegalDate(written: string, locale: string): string {
  return new Intl.DateTimeFormat(intlDateLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC', calendar: 'gregory', numberingSystem: 'latn' })
    .format(legalUpdatedDate(written))
}

export interface LegalSource {
  /** The markdown to render. */
  md: string
  /** The language base the text is a translation from English into — null when it is the English document itself. */
  translatedInto: AppLocale | null
}

/** A legal document's markdown for a reader in `country` reading `locale`. */
export function legalDocumentSource(doc: LegalDoc, where: { country: string; locale: string }): LegalSource {
  const english = readOnce(path.join(DIR, LEGAL_DOC_FILE[doc]))
  if (english === null) throw new Error(`[legal] ${LEGAL_DOC_FILE[doc]} is missing`)
  const base = legalBaseOf(where.locale)
  const raw = base ? readOnce(path.join(DIR, base, LEGAL_DOC_FILE[doc])) : null
  if (!base || raw === null) return { md: english, translatedInto: null }
  let md = raw.replace(STAMP, '').replace('{{LAST_UPDATED}}', localLegalDate(englishDate(doc), where.locale))
  for (const d of LEGAL_DOCS) md = md.split(`](${legalPath(d)})`).join(`](${legalPath(d, where)})`)
  if (overrideChain(resolveLocale(where.locale)).includes('de-CH')) md = md.replace(/ß/g, 'ss')
  return { md, translatedInto: base }
}
