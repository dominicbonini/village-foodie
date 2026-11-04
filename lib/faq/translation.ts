// lib/faq/translation.ts — 🔴 THE FAQ IN EVERY LANGUAGE: which locales a question is written in, when a translation is out of date,
// what a translation must pass, and which row a page shows (faq-2, 2 November 2026; docs/faq-2-seo-geo-2-report.md Part A).
//
// PURE AND CLIENT-SAFE (no hashing here — lib/faq/source-hash.ts hashes, on the server and in the translator).
//
// THE LOCALES (lib/i18n/locales.ts — no list is typed here):
//   • every LANGUAGE BASE (all 28) gets a translated row;
//   • de-CH is DERIVED from de-DE (ß → ss, the site's Swiss rule; de-LI inherits de-CH) — a row only where de-DE has a ß;
//   • every other variant (the English variants, de-AT, nl-BE, el-CY, fr-LU, es-MX …) is asked of the model with its parent and
//     gets a row ONLY where its wording truly differs (35.am-5) — with no row it reads its parent.
// FRESH = status 'ok' AND source_hash equal to the current English's. A page shows only fresh text: a non-English page hides a
// question that has no fresh translation (never English, never out of date); an English page falls back to the English itself.
import { LOCALES, LANGUAGE_BASES, LOCALE_PARENT, DEFAULT_LOCALE, overrideChain, isEnglish, type AppLocale } from '@/lib/i18n/locales'
import { tokensIn } from '@/lib/faq/live-values'
import { BANNED_WORDING } from '@/lib/faq/check'

/** One stored translation (public.faq_translations), as the code reads it. */
export interface FaqTranslationRow {
  itemId: string | null; sectionId: string | null; locale: string
  question: string | null; answer: string | null; answerSinglePlan: string | null; title: string | null
  sourceHash: string; model: string | null; translatedAt: string; status: 'ok' | 'failed'; reason: string | null
}

/** The 28 language bases — every one gets a row. */
export const TRANSLATED_BASES: readonly string[] = LANGUAGE_BASES
/** Variants derived without the model: locale → [its parent, the rule]. */
export const DERIVED: Readonly<Record<string, { from: string; rule: 'eszett' }>> = { 'de-CH': { from: 'de-DE', rule: 'eszett' } }
/** The parent a variant is compared with (LOCALE_PARENT; an English locale without one → en-GB). */
export const parentOf = (locale: string): string => LOCALE_PARENT[locale as AppLocale] ?? (isEnglish(locale) ? DEFAULT_LOCALE : locale)
/** Variants inherited from another variant without a row of their own (de-LI reads de-CH). */
const INHERITS_ONLY = new Set(Object.entries(LOCALE_PARENT).filter(([, p]) => p && DERIVED[p as string]).map(([l]) => l))
/** Variants the MODEL decides (a row only where the wording differs from the parent). */
export const MODEL_VARIANTS: readonly string[] = LOCALES.filter(l => l !== DEFAULT_LOCALE && !LANGUAGE_BASES.includes(l) && !DERIVED[l] && !INHERITS_ONLY.has(l))

/** The Swiss and Liechtenstein German rule: ß → ss. */
export const eszett = (s: string | null): string | null => (s == null ? s : s.replace(/ß/g, 'ss'))

const isFresh = (r: FaqTranslationRow | undefined, hash: string) => !!r && r.status === 'ok' && r.sourceHash === hash

// ── what a run must do ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Source { kind: 'item' | 'section'; id: string; hash: string }
export interface Job extends Source {
  /** Locales to ask the model for (bases, and variants with their parent). */
  locales: string[]
  /** True when the English changed (or was never translated): every model variant is re-decided, and a variant row the model
   *  no longer returns is deleted. False: only failed or missing rows are retried. */
  full: boolean
}

/** The work for one question or section, or null when every row is fresh. */
export function jobFor(source: Source, rows: FaqTranslationRow[]): Job | null {
  const mine = rows.filter(r => (source.kind === 'item' ? r.itemId : r.sectionId) === source.id)
  const by = new Map(mine.map(r => [r.locale, r]))
  const full = mine.length === 0 || mine.some(r => r.sourceHash !== source.hash)
  const bases = TRANSLATED_BASES.filter(l => !isFresh(by.get(l), source.hash))
  const variants = full ? [...MODEL_VARIANTS] : MODEL_VARIANTS.filter(l => by.has(l) && !isFresh(by.get(l), source.hash))
  // A derived variant is redone with its parent; on its own only when its row is stale or failed.
  const derivedStale = Object.keys(DERIVED).some(l => by.has(l) && !isFresh(by.get(l), source.hash))
  const locales = [...bases, ...variants]
  if (!locales.length && !derivedStale) return null
  if (!locales.length && derivedStale) locales.push(...Object.values(DERIVED).map(d => d.from).filter(f => !locales.includes(f)))
  return { ...source, locales, full }
}

// ── what a translation must pass ─────────────────────────────────────────────────────────────────────────────────────────────
const TOKEN = /\{([^{}]*)\}/g
const tokenCounts = (s: string) => { const m = new Map<string, number>(); for (const x of s.matchAll(TOKEN)) m.set(x[1], (m.get(x[1]) ?? 0) + 1); return m }
const bare = (s: string) => s.replace(TOKEN, ' ')
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A plan name as a whole word in Latin script (a name next to CJK or Thai letters still counts). */
const nameRe = (name: string) => new RegExp(`(^|[^A-Za-z\\u00C0-\\u024F0-9])${escapeRe(name)}($|[^A-Za-z\\u00C0-\\u024F0-9])`, 'u')

export interface Rules {
  /** Every plan name to refuse: the English names and the locale's own (lib/plan-names.ts). */
  planNames: string[]
  /** Extra banned phrases in the locale (its "Pay at Hatch" words, planFeatures.priceWord.payAtHatch). */
  bannedLocal: string[]
  /** import-and-cs-fix: the locale's ordinary words that happen to be spelt like a plan name (ORDINARY_WORDS) — never "typed". */
  ordinaryWords?: string[]
  /** The shortest a translation may be against the English (default 0.25; Japanese and Chinese write far fewer characters —
   *  "Reaching customers" is 集客 — so theirs is lower: minRatioOf). */
  minRatio?: number
}
/**
 * import-and-cs-fix (4 November 2026, docs/import-and-cs-fix-report.md): words of a language that are spelt EXACTLY like a plan name
 * (case and whole word) but are ordinary words there, so a translation using them has not typed a plan name. By language subtag.
 * Czech "Pro" is "For" at the start of a sentence ("Pro nejlepší zážitek doporučujeme tablet" — FAQ 7's answer, refused on 4 Nov).
 * ⚠️ The cost is known and accepted: a Czech translation that typed the plan name "Pro" itself would pass this one check.
 */
export const ORDINARY_WORDS: Readonly<Record<string, readonly string[]>> = { cs: ['Pro'] }
export const ordinaryWordsOf = (locale: string): string[] => [...(ORDINARY_WORDS[locale.split('-')[0]] ?? [])]

/** A locale's shortest sane length against the English. */
export const minRatioOf = (locale: string): number => (/^(ja|zh)\b/.test(locale) ? 0.1 : 0.25)

/** Why one translated field is refused, or null. `english` is the field's English. */
export function fieldProblem(field: string, english: string | null, translated: string | null | undefined, rules: Rules): string | null {
  if (english == null || english === '') return translated ? `${field}: the English has none, so there must be none` : null
  if (typeof translated !== 'string' || !translated.trim()) return `${field}: missing`
  const want = tokenCounts(english), got = tokenCounts(translated)
  for (const [t, n] of want) if ((got.get(t) ?? 0) !== n) return `${field}: {${t}} must appear ${n === 1 ? 'exactly once' : `exactly ${n} times, as in the English`} (found ${got.get(t) ?? 0})`
  for (const [t] of got) if (!want.has(t)) return `${field}: {${t}} is not in the English`
  const b = bare(translated)
  if (/[{}]/.test(b)) return `${field}: a stray brace`
  // Typed digits: only the English's own figures, in ASCII ("60 seconds" in question 6). No other digit, in any script.
  const allowed = new Set(bare(english).match(/\d+/g) ?? [])
  for (const d of b.match(/\p{Nd}+/gu) ?? []) if (!/^[0-9]+$/.test(d) || !allowed.has(d)) return `${field}: a typed number "${d}" (prices and figures come from live values)`
  // import-and-cs-fix: a currency symbol or plan name fails only where the English did not have it outside its {tokens} — like
  // with like: the same symbol; the same name in the same case, as a whole word — and never a language's own ordinary word.
  const en = bare(english)
  const sym = (b.match(/\p{Sc}/gu) ?? []).find(s => !en.includes(s))
  if (sym) return `${field}: a currency symbol "${sym}"`
  const ordinary = new Set(rules.ordinaryWords ?? [])
  for (const n of rules.planNames) if (n && !ordinary.has(n) && nameRe(n).test(b) && !nameRe(n).test(en)) return `${field}: the plan name "${n}" typed in (plan names come from live values)`
  const low = translated.toLowerCase()
  for (const w of [...BANNED_WORDING, ...rules.bannedLocal]) if (w && low.includes(w.toLowerCase())) return `${field}: mentions paying at the truck ("${w}")`
  const ratio = translated.trim().length / english.trim().length, min = rules.minRatio ?? 0.25
  if (ratio < min || ratio > 3) return `${field}: length ${translated.trim().length} against the English ${english.trim().length} — outside ${min}–3×`
  if (translated.length > 4000) return `${field}: longer than 4000 characters`
  return null
}

/** Why a question's translation is refused (the first problem), or null. */
export function itemProblem(english: { questionEn: string; answerEn: string; answerSinglePlanEn: string | null }, t: { question?: string | null; answer?: string | null; answer_single_plan?: string | null }, rules: Rules): string | null {
  if (tokensIn(t.question ?? '').length || /[{}]/.test(t.question ?? '')) return 'question: live values work in answers only'
  return fieldProblem('question', english.questionEn, t.question, rules)
    ?? fieldProblem('answer', english.answerEn, t.answer, rules)
    ?? fieldProblem('single-plan answer', english.answerSinglePlanEn?.trim() ? english.answerSinglePlanEn : null, t.answer_single_plan?.trim() ? t.answer_single_plan : null, rules)
}

/** Why a section title's translation is refused, or null. */
export function titleProblem(englishTitle: string, title: string | null | undefined, rules: Rules): string | null {
  if (tokensIn(title ?? '').length || /[{}]/.test(title ?? '')) return 'title: no live values in a title'
  return fieldProblem('title', englishTitle, title, rules)
}

// ── what a page shows ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The row a page in `locale` shows for one question or section, 'english' (an English page with no fresh variant row), or null
 *  (hidden: a non-English page with no fresh translation). Most specific first: es-MX → es-MX, es-ES; de-LI → de-LI, de-CH,
 *  de-DE. On a non-English page the FIRST row found decides — a stale or failed variant hides the question rather than fall
 *  through to text its parent wrote for another country. */
export function shownRow(locale: string, rowsOfSource: FaqTranslationRow[], hash: string): FaqTranslationRow | 'english' | null {
  const chain = [...overrideChain(locale as AppLocale)].reverse()
  const by = new Map(rowsOfSource.map(r => [r.locale, r]))
  if (isEnglish(locale)) {
    for (const l of chain) if (isFresh(by.get(l), hash)) return by.get(l) as FaqTranslationRow
    return 'english'
  }
  for (const l of chain) { const r = by.get(l); if (r) return isFresh(r, hash) ? r : null }
  return null
}

/** faq-4 (2 November 2026): the visitor languages each of the 28 bases serves — the base and every regional variant that reads it
 *  (de-DE ← de-AT, de-CH, de-LI; es-ES ← es-MX …), from lib/i18n/locales.ts. English locales are not here: an English page always
 *  has the English. */
export const VISITOR_LOCALES_OF: Readonly<Record<string, readonly string[]>> = Object.fromEntries(TRANSLATED_BASES.map(b =>
  [b, LOCALES.filter(l => !isEnglish(l) && overrideChain(l as AppLocale)[0] === b)]))

/** Admin's indicator for one published question — 🔴 BY THE PUBLIC PAGES' OWN RULE (faq-4): a base counts as covered only when
 *  every visitor language it serves would SHOW the question (shownRow: the same function lib/faq/public.ts renders with), so
 *  "28/28" means every non-English page shows it, and the two can never disagree. Failures: any locale's, for the hover. */
export function translationStatus(rowsOfSource: FaqTranslationRow[], hash: string): { fresh: number; total: number; failed: { locale: string; reason: string }[] } {
  const failed = rowsOfSource.filter(r => r.status === 'failed' && r.sourceHash === hash).map(r => ({ locale: r.locale, reason: r.reason ?? 'failed' }))
  return { fresh: coveredBases(rowsOfSource, hash).length, total: TRANSLATED_BASES.length, failed }
}

/** The bases whose every visitor language shows the question (translationStatus counts these) — shownRow, the public rule. */
export function coveredBases(rowsOfSource: FaqTranslationRow[], hash: string): string[] {
  return TRANSLATED_BASES.filter(b => VISITOR_LOCALES_OF[b].every(l => shownRow(l, rowsOfSource, hash) !== null))
}

/** What Admin › FAQ receives per question or section (computed on the server, where the hash is): the indicator, and every
 *  FRESH text by locale for the preview. `present` lists every locale with a row (fresh or not) — on a non-English page the first
 *  row in the chain decides, so the preview needs to know a stale one is there. */
export interface TranslationSummary {
  fresh: number; total: number; failed: { locale: string; reason: string }[]
  text: Record<string, { question: string | null; answer: string | null; answerSinglePlan: string | null; title: string | null }>
  present: string[]
}

export function summarize(rowsOfSource: FaqTranslationRow[], hash: string): TranslationSummary {
  const st = translationStatus(rowsOfSource, hash)
  const text: TranslationSummary['text'] = {}
  for (const r of rowsOfSource) if (isFresh(r, hash)) text[r.locale] = { question: r.question, answer: r.answer, answerSinglePlan: r.answerSinglePlan, title: r.title }
  return { ...st, text, present: rowsOfSource.map(r => r.locale) }
}

/** The preview's text for one locale from a summary: as shownRow, without the hash (the summary holds only fresh text). */
export function previewTextOf(summary: TranslationSummary | undefined, locale: string): TranslationSummary['text'][string] | 'english' | null {
  const chain = [...overrideChain(locale as AppLocale)].reverse()
  if (isEnglish(locale)) { for (const l of chain) if (summary?.text[l]) return summary.text[l]; return 'english' }
  for (const l of chain) if (summary?.present.includes(l)) return summary.text[l] ?? null
  return null
}
