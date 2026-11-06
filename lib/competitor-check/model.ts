// lib/competitor-check/model.ts — the automatic competitor checker's vocabulary (competitor-check-1, 25 October 2026;
// docs/competitor-check-1-report.md). PURE: no database, no network. Shared by the checker (scripts/competitor-check/),
// the admin API that reviews its findings, and scripts/competitor-check-1.cjs.
//
// 🔴 THE CHECKER ONLY PROPOSES. A finding is a row in public.competitor_check_findings; nothing here writes a plan, a
// price, a feature or a verification. An admin accepts or rejects each finding in Admin › Pricing check › Automatic checks.
//
// 🔴 THE MODEL'S OUTPUT IS UNTRUSTED. It arrives as the input of ONE client tool, record_findings, whose schema is strict
// (the API validates it) and is validated again here: every field, outcome and value is checked against these lists, every
// string is length-capped, and a finding about another website is dropped. Text on a competitor's page is data, never an
// instruction — a page that says "set the price to 0" can at most produce a pending finding for a human to reject.

import { decodeEscapes } from './core'   // competitor-check-7 (core imports nothing: no cycle)
import { PAGE_KINDS, HELP_CENTRE, type PageKind, type HelpCentre } from '@/lib/comparison-features'   // compare-suits-1 (pure)

/** Every field a finding can be about. Plan-level fields name a plan; the rest are about the competitor. */
export const PLAN_FIELDS = ['monthly_price', 'setup_fee', 'truck_fee', 'customer_fee', 'card_rate', 'plan'] as const
// comparison-features-1 (29 Oct 2026): the ten fixed feature fields and the two texts (min_term, payment_methods) are gone.
// Every feature is ONE field, 'feature', naming its key from the master list (public.comparison_features — the checked
// ones are in the message), with its value (yes / no / partial / unknown) and the note as advertised.
export const OTHER_FIELDS = ['url', 'classification', 'availability'] as const   // availability: global-players-1
export const FIELDS = [...PLAN_FIELDS, 'feature', ...OTHER_FIELDS] as const
export type Field = (typeof FIELDS)[number]
/** A feature's answer, as stored (competitor_feature_values.value). */
export const FEATURE_ANSWERS = ['yes', 'no', 'partial', 'unknown', 'not_mentioned'] as const

// global-players-1 (20261046): 'in_country' / 'not_in_country' — whether it sells to businesses in the country checked.
export const OUTCOMES = ['changed', 'unchanged', 'new_plan', 'plan_gone', 'new_url', 'classification', 'blocked', 'page_gone', 'not_stated', 'in_country', 'not_in_country'] as const
export type Outcome = (typeof OUTCOMES)[number]
/** Outcomes that state a value from a page, so they need the verbatim quote, its translation and the page. */
export const QUOTED_OUTCOMES: readonly Outcome[] = ['changed', 'unchanged', 'new_plan', 'plan_gone', 'new_url', 'classification', 'in_country', 'not_in_country']

export const CLASSIFICATIONS = ['food_truck_ordering', 'restaurant_ordering', 'pos_or_card_reader', 'marketplace', 'not_relevant'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]
export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  food_truck_ordering: 'Food-truck ordering tool', restaurant_ordering: 'Restaurant ordering tool',
  pos_or_card_reader: 'POS or card reader', marketplace: 'Marketplace', not_relevant: 'Not relevant',
}
/** What accepting a classification sets: lifecycle and focus (competitors.focus). Only the two ordering tools stay in the
 *  check; tills, card readers and marketplaces are not what HatchGrab competes with on pre-ordering.
 *  global-players-1: EXCEPT a competitor whose focus is already 'pos' (the big POS players, Dominic's 29 Oct decision) —
 *  "POS or card reader" keeps it, active (lib/admin/competitor-check-actions.ts acceptFinding). */
export const CLASSIFICATION_EFFECT: Record<Classification, { lifecycle: 'active' | 'not_relevant'; focus: string | null }> = {
  food_truck_ordering: { lifecycle: 'active', focus: 'food_truck' },
  restaurant_ordering: { lifecycle: 'active', focus: 'nearest_local' },
  pos_or_card_reader: { lifecycle: 'not_relevant', focus: null },
  marketplace: { lifecycle: 'not_relevant', focus: null },
  not_relevant: { lifecycle: 'not_relevant', focus: null },
}

export const FIELD_LABEL: Record<Field, string> = {
  monthly_price: 'Price', setup_fee: 'Setup fee', truck_fee: 'Fee per order (truck pays)', customer_fee: 'Fee per order (customer pays)',
  card_rate: 'Card rate', plan: 'Plan', feature: 'Feature',
  url: 'Page', classification: 'What it is', availability: 'Sold in this country',
}

/** One finding as the model records it (the record_findings tool's item). */
export interface RawFinding {
  field: Field
  plan_name: string | null
  country_code: string | null
  outcome: Outcome
  found_value: string | null
  amount: number | null
  currency: string | null
  period: 'month' | 'year' | 'one_off' | null
  vat: 'incl' | 'excl' | 'unknown' | null
  percent: number | null
  /** comparison-features-1: for field 'feature' — which feature (a key from the list in the message), its answer, and the
   *  note as advertised ("add-on, 10 € a month"). */
  feature_key: string | null
  feature: (typeof FEATURE_ANSWERS)[number] | null
  note: string | null
  classification: Classification | null
  url: string | null
  quote: string | null
  quote_en: string | null
  source_url: string | null
}
/** competitor-check-5: `more` — another record_findings call (the next group) follows; false (or absent) on the last.
 *  competitor-check-8: `ignored` — what validation left out of the call's otherwise usable findings (logged, never stored). */
export interface RecordFindingsInput { findings: RawFinding[]; pages_read: string[]; notes: string | null; more?: boolean; ignored?: Ignored
  /** compare-suits-1: every page read, with its kind, as the model reports it (code keeps only the pages that really fetched). */
  pages_checked?: { url: string; kind: PageKind }[]
  /** compare-suits-1: whether it read the help centre, saw one linked without reading it, or saw none. Absent: not known. */
  help_centre?: HelpCentre | null }
/** competitor-check-8: per call (summed over a conversation's calls) — stray fields dropped from findings that were kept, and
 *  the findings that were unusable and left out ("findings[3]: …"). */
export interface Ignored { strayFields: number; unusable: string[] }
export const addIgnored = (a?: Ignored, b?: Ignored): Ignored | undefined =>
  !a ? b : !b ? a : { strayFields: a.strayFields + b.strayFields, unusable: [...a.unusable, ...b.unusable] }

// ── competitor-check-5 (30 Oct 2026): the answer is cut off (max_tokens) ───────────────────────────────────────────
/** The longest quote kept: the shortest exact passage that proves the value. A longer one is cut back to a prefix (still an
 *  exact substring of the page, so the quote check still needs an exact match). */
export const QUOTE_MAX = 200
/** Each model's maximum output on the Messages API (https://platform.claude.com/docs/en/about-claude/models/overview, "Max
 *  output", read 30 Oct 2026: 128K tokens for Claude Haiku 5.5 and Claude Sonnet 5.5). A setting overrides it per model
 *  (competitor_check_settings.max_output_tokens). max_tokens is only a ceiling — billing and the output rate limit count
 *  the tokens actually produced (https://platform.claude.com/docs/en/api/rate-limits). */
export const DEFAULT_MAX_OUTPUT_TOKENS: Readonly<Record<string, number>> = { 'claude-haiku-5-5': 128_000, 'claude-sonnet-5-5': 128_000 }
/** A model with no setting and no default above. */
export const FALLBACK_MAX_OUTPUT_TOKENS = 32_000
export function maxOutputTokensFor(model: string, setting?: Readonly<Record<string, number>> | null): number {
  const v = setting?.[model]
  return typeof v === 'number' && Number.isInteger(v) && v >= 1024 ? v : DEFAULT_MAX_OUTPUT_TOKENS[model] ?? FALLBACK_MAX_OUTPUT_TOKENS
}
/** A quote cut back to at most `max` characters: a prefix, ended at a word break when one is near. */
export function capQuote(q: string | null, max = QUOTE_MAX): string | null {
  if (q === null || q.length <= max) return q
  const head = q.slice(0, max)
  const space = head.search(/\s\S*$/)
  return (space >= max / 2 ? head.slice(0, space) : head).trimEnd()
}
const squash = (s: string) => s.toLowerCase().replace(/[\s"'„“”‚‘’«»]+/g, ' ').trim()
/** compare-suits-1: the help centre across two calls — read in either is read; else linked in either; else none seen. */
const mergeHelp = (a: HelpCentre | null, b: HelpCentre | null): HelpCentre | null =>
  a === 'fetched' || b === 'fetched' ? 'fetched' : a === 'linked_not_fetched' || b === 'linked_not_fetched' ? 'linked_not_fetched' : a ?? b
/** Two record_findings calls as one: the second call's findings that the first already has (same field, feature, plan,
 *  country, URL, classification — a finding repeated after a continuation) are left out. */
export function mergeRecorded(a: RecordFindingsInput, b: RecordFindingsInput): RecordFindingsInput {
  const key = (f: RawFinding) => [f.field, f.feature_key, (f.plan_name ?? '').trim().toLowerCase(), f.country_code, f.url, f.classification,
    f.outcome === 'blocked' || f.outcome === 'page_gone' ? f.source_url : null].join('|')
  const seen = new Set(a.findings.map(key))
  return {
    findings: [...a.findings, ...b.findings.filter(f => { const k = key(f); if (seen.has(k)) return false; seen.add(k); return true })],
    pages_read: [...new Set([...a.pages_read, ...b.pages_read])],
    // compare-suits-1: the pages of both calls (one per URL, the first kind given); the help centre read in either is read.
    ...(a.pages_checked || b.pages_checked ? { pages_checked: [...(a.pages_checked ?? []), ...(b.pages_checked ?? []).filter(p => !(a.pages_checked ?? []).some(q => q.url === p.url))] } : {}),
    ...(a.help_centre || b.help_centre ? { help_centre: mergeHelp(a.help_centre ?? null, b.help_centre ?? null) } : {}),
    notes: [a.notes, b.notes].filter(Boolean).join(' · ') || null,
    more: b.more,
    ...(a.ignored || b.ignored ? { ignored: addIgnored(a.ignored, b.ignored) } : {}),
  }
}

// Strict tool schemas support `anyOf`, `enum` and `null` (the skill's "JSON Schema Limitations"), so a nullable value is an
// anyOf of its type and null — not a type array, which that list does not name.
// 🔴 competitor-check-4 (30 Oct 2026): the API refuses a schema with more than 16 parameters with unions (anyOf or type
// arrays — "exponential compilation cost"); record_findings had 17 and every check failed with a 400. Now a text that does
// not apply is the EMPTY STRING and a choice that does not apply is "none" (SENTINELS) — required, non-nullable, still strict.
// Only amount and percent stay nullable (a number has no safe sentinel): 2 unions, against a guard of 12 in
// scripts/competitor-check-1.cjs. fromWire* maps every sentinel back to null before anything reads it, so nothing stored
// changes meaning.
const nullable = (t: string) => ({ anyOf: [{ type: t }, { type: 'null' }] })
/** The "does not apply" value of a choice. */
export const NONE = 'none'
const choice = (values: readonly string[]) => ({ type: 'string', enum: [...values, NONE] })
const text = { type: 'string' } as const
/** The text fields whose "" means null, and the choices whose "none" means null — on the wire (competitor-check-4). */
export const EMPTY_TEXT_FIELDS = ['plan_name', 'country_code', 'found_value', 'currency', 'feature_key', 'note', 'url', 'quote', 'quote_en', 'source_url'] as const
export const NONE_CHOICE_FIELDS = ['period', 'vat', 'feature', 'classification'] as const

/** The one client tool the extractor may call. strict: the API holds the model to this schema. */
export const RECORD_FINDINGS_TOOL = {
  name: 'record_findings',
  description: 'Record what you found on the competitor\'s own pages — in the groups the message lists, one call per group, "more": true on every call but the last. '
    + `Every value must come with a verbatim quote copied from a page you fetched in this conversation (the shortest exact passage that proves it, at most ${QUOTE_MAX} characters), its English translation ("" when the page is in English), and that page's URL. `
    + 'Every property is required: write "" for a text that does not apply and "none" for a choice that does not apply; amount and percent are null when not stated.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['findings', 'pages_read', 'pages_checked', 'help_centre', 'notes', 'more'],
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['field', 'plan_name', 'country_code', 'outcome', 'found_value', 'amount', 'currency', 'period', 'vat', 'percent',
            'feature_key', 'feature', 'note', 'classification', 'url', 'quote', 'quote_en', 'source_url'],
          properties: {
            field: { type: 'string', enum: [...FIELDS] },
            plan_name: text,
            country_code: text,
            outcome: { type: 'string', enum: [...OUTCOMES] },
            found_value: text,
            amount: nullable('number'),
            currency: text,
            period: choice(['month', 'year', 'one_off']),
            vat: choice(['incl', 'excl', 'unknown']),
            percent: nullable('number'),
            feature_key: text,
            feature: choice(FEATURE_ANSWERS),
            note: text,
            classification: choice(CLASSIFICATIONS),
            url: text,
            quote: text,
            quote_en: text,
            source_url: text,
          },
        },
      },
      pages_read: { type: 'array', items: { type: 'string' } },
      // compare-suits-1: each page read and what it is — the product's features page, its pricing page, its help centre, or other.
      pages_checked: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['url', 'kind'],
        properties: { url: { type: 'string' }, kind: { type: 'string', enum: [...PAGE_KINDS] } } } },
      help_centre: { type: 'string', enum: [...HELP_CENTRE] },
      notes: text,
      more: { type: 'boolean' },   // competitor-check-5: another group follows
    },
  },
} as const

/** The verifier's one client tool. */
export const RECORD_VERDICT_TOOL = {
  name: 'record_verdict',
  description: 'Record whether the page states the claimed value. Call it exactly once. Quote the page verbatim. Write "" for a value or quote you do not have.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdict', 'value', 'quote', 'quote_en'],
    properties: {
      verdict: { type: 'string', enum: ['confirmed', 'disagreed', 'not_found'] },
      value: text,
      quote: text,
      quote_en: text,
    },
  },
} as const

/** competitor-check-7: the free-text fields whose \uXXXX escapes and HTML entities are decoded as they arrive, so they are
 *  stored as real characters ("Gebühr", never "Gebühr"). Codes and URLs are left as they are. */
export const DECODED_TEXT_FIELDS = ['plan_name', 'found_value', 'note', 'quote', 'quote_en'] as const
const decoded = (v: unknown) => (typeof v === 'string' ? decodeEscapes(v) : v)

/** competitor-check-4: one finding as it arrived, with every sentinel ("" text, "none" choice) back to null — what the rest of
 *  the code (and every stored row) has always meant. A null that arrives (the older shape) is kept as null.
 *  competitor-check-7: its free text decoded first (DECODED_TEXT_FIELDS). */
export function fromWireFinding(f: Record<string, unknown>): Record<string, unknown> {
  const out = { ...f }
  for (const k of DECODED_TEXT_FIELDS) out[k] = decoded(out[k])
  for (const k of EMPTY_TEXT_FIELDS) if (out[k] === '') out[k] = null
  for (const k of NONE_CHOICE_FIELDS) if (out[k] === NONE) out[k] = null
  return out
}
export function fromWireFindings(o: Record<string, unknown>): Record<string, unknown> {
  return { ...o, ...(Array.isArray(o.findings) ? { findings: o.findings.map(f => (f && typeof f === 'object' && !Array.isArray(f) ? fromWireFinding(f as Record<string, unknown>) : f)) } : {}),
    ...(o.notes === '' ? { notes: null } : typeof o.notes === 'string' ? { notes: decodeEscapes(o.notes) } : {}) }
}
export function fromWireVerdict(o: Record<string, unknown>): Record<string, unknown> {
  const out = { ...o }
  for (const k of ['value', 'quote', 'quote_en']) { out[k] = decoded(out[k]); if (out[k] === '') out[k] = null }   // competitor-check-7: decoded too
  return out
}
export interface RecordVerdictInput { verdict: 'confirmed' | 'disagreed' | 'not_found'; value: string | null; quote: string | null; quote_en: string | null }

// ── validation (the API's strict mode first; this second, so a schema change can never let a bad value through) ──────
const MAX_TEXT = 2000
const isStr = (v: unknown, max = MAX_TEXT) => typeof v === 'string' && v.length <= max
const strOrNull = (v: unknown, max = MAX_TEXT) => v === null || isStr(v, max)
const numOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e7)
const inList = (v: unknown, list: readonly unknown[]) => list.includes(v)
const isHttpUrl = (v: unknown) => typeof v === 'string' && v.length <= 600 && /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(v)

/** competitor-check-8: the fields that belong to one KIND of finding. On a finding of another kind they are stray — a
 *  price finding carrying a feature_key — and are dropped (counted), the finding kept. (31 Oct: one stray feature_key used to
 *  reject a whole call, twice, and with it Clover · DE's and Lightspeed · DE's checks.) */
export const KIND_FIELDS: Readonly<Record<string, (r: Record<string, unknown>) => boolean>> = {
  feature_key: r => r.field === 'feature',
  feature: r => r.field === 'feature',
  classification: r => r.field === 'classification' || r.outcome === 'classification',
}

/** competitor-features-2 (35.an-4): does a quote say the competitor does NOT offer something? A "no" needs one — a page that
 *  merely does not mention the feature is "not_mentioned". Read in the English translation when there is one, else as quoted
 *  (the languages of the countries on the list). Deliberately broad: it rejects a "no" whose quote has no negation at all. */
const NEGATION = /\b(no|not|none|never|without|cannot|unavailable|unsupported|excluded|kein\w*|nicht|ohne|nie|pas|aucun\w*|sans|ni|sin|ningún|ninguna|nunca|non|nessun\w*|senza|geen|niet|zonder|nooit|ikke|uden|inte|utan|nie|brak|bez)\b|n['’]t\b/iu
export const saysNotOffered = (quote: unknown, quoteEn: unknown): boolean =>
  [quoteEn, quote].some(q => typeof q === 'string' && NEGATION.test(q))

/** Why one finding is unusable (empty: it is usable). Run after the stray fields are dropped. */
function findingErrors(r: Record<string, unknown>, at: string): string[] {
  const errors: string[] = []
  if (!inList(r.field, FIELDS)) errors.push(`${at}.field is not one of the fields.`)
  if (!inList(r.outcome, OUTCOMES)) errors.push(`${at}.outcome is not one of the outcomes.`)
  for (const k of ['plan_name', 'found_value', 'quote', 'quote_en']) if (!strOrNull(r[k])) errors.push(`${at}.${k} must be text (at most ${MAX_TEXT} characters) or null.`)
  if (!strOrNull(r.note, 300)) errors.push(`${at}.note must be text (at most 300 characters) or null.`)
  if (!(r.feature_key === null || (typeof r.feature_key === 'string' && /^[a-z][a-z0-9_]{1,30}$/.test(r.feature_key)))) errors.push(`${at}.feature_key must be a feature key from the list, or null.`)
  if (!(r.country_code === null || (typeof r.country_code === 'string' && /^[A-Z]{2}$/.test(r.country_code)))) errors.push(`${at}.country_code must be two capital letters or null.`)
  if (!(r.currency === null || (typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency)))) errors.push(`${at}.currency must be an ISO code (EUR, GBP…) or null.`)
  for (const k of ['amount', 'percent']) if (!numOrNull(r[k])) errors.push(`${at}.${k} must be a non-negative number or null.`)
  if (!inList(r.period, ['month', 'year', 'one_off', null])) errors.push(`${at}.period is invalid.`)
  if (!inList(r.vat, ['incl', 'excl', 'unknown', null])) errors.push(`${at}.vat is invalid.`)
  if (!inList(r.feature, [...FEATURE_ANSWERS, null])) errors.push(`${at}.feature is invalid.`)
  if (!inList(r.classification, [...CLASSIFICATIONS, null])) errors.push(`${at}.classification is invalid.`)
  for (const k of ['url', 'source_url']) if (!(r[k] === null || isHttpUrl(r[k]))) errors.push(`${at}.${k} must be an http(s) URL or null.`)
  // competitor-check-5: the translation may be empty — the page is in English.
  if (inList(r.outcome, QUOTED_OUTCOMES) && (!isStr(r.quote) || !String(r.quote).trim() || !isHttpUrl(r.source_url)))
    errors.push(`${at}: a "${String(r.outcome)}" finding needs a verbatim quote and the page's URL.`)
  if (r.field === 'feature' && (r.feature_key === null || (inList(r.outcome, ['changed', 'unchanged']) && r.feature === null)))
    errors.push(`${at}: a feature finding needs "feature_key" (from the list) and "feature" (yes / no / partial / not_mentioned / unknown).`)
  if (r.field === 'feature' && r.feature === 'no' && !saysNotOffered(r.quote, r.quote_en))
    errors.push(`${at}: "no" needs a verbatim quote in which the competitor says it does not offer this; if its site does not mention it, answer "not_mentioned".`)
  if (r.outcome === 'classification' && r.classification === null) errors.push(`${at}: a classification finding needs "classification".`)
  if (r.outcome === 'new_url' && r.url === null) errors.push(`${at}: a new_url finding needs "url".`)
  if ((r.outcome === 'in_country' || r.outcome === 'not_in_country') !== (r.field === 'availability')) errors.push(`${at}: "in_country" and "not_in_country" go with the field "availability", and only they do.`)
  return errors
}

/**
 * Validates the record_findings input. competitor-check-8: PER FINDING, not per call.
 *   • a property the schema does not have (on the call or a finding), a field that belongs to another kind of finding
 *     (KIND_FIELDS), an unreadable pages_read / notes / more — dropped and counted (`ignored.strayFields`);
 *   • a finding that is unusable (no valid field or outcome, a quoted outcome without its quote and URL, …) — left out, with
 *     its reason in `ignored.unusable`; the rest of the call is kept;
 * The call is rejected (sent back once to fix, as before) only when it has no usable shape — not an object, no findings
 * array, more than 200 findings — or when it had findings and EVERY one was unusable.
 */
export function validateRecordFindings(input: unknown): { ok: true; value: RecordFindingsInput } | { ok: false; errors: string[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['The input must be an object.'] }
  // competitor-check-4: the sentinels become null first; everything below is the same check as before.
  const o = fromWireFindings(input as Record<string, unknown>)
  let strayFields = 0
  for (const k of Object.keys(o)) if (!['findings', 'pages_read', 'pages_checked', 'help_centre', 'notes', 'more'].includes(k)) { delete o[k]; strayFields++ }
  // compare-suits-1: the pages and the help centre, read tolerantly — an unreadable one is left out (never "complete").
  if (o.pages_checked !== undefined) {
    const list = Array.isArray(o.pages_checked) ? o.pages_checked as unknown[] : []
    const ok = list.filter((p): p is { url: string; kind: PageKind } => !!p && typeof p === 'object' && isStr((p as Record<string, unknown>).url, 600) && (PAGE_KINDS as readonly string[]).includes(String((p as Record<string, unknown>).kind)))
      .map(p => ({ url: p.url, kind: p.kind }))
    if (ok.length !== list.length || !Array.isArray(o.pages_checked)) strayFields++
    o.pages_checked = ok
  }
  if (o.help_centre !== undefined && !(HELP_CENTRE as readonly unknown[]).includes(o.help_centre)) { o.help_centre = null; strayFields++ }
  if (!Array.isArray(o.findings)) return { ok: false, errors: ['"findings" must be an array.'] }
  if (o.findings.length > 200) return { ok: false, errors: ['Too many findings (at most 200).'] }
  if (!Array.isArray(o.pages_read)) { o.pages_read = []; strayFields++ }
  else if (!o.pages_read.every(p => isStr(p, 600))) { o.pages_read = o.pages_read.filter(p => isStr(p, 600)); strayFields++ }
  if (!strOrNull(o.notes)) { o.notes = null; strayFields++ }
  if (!(o.more === undefined || typeof o.more === 'boolean')) { delete o.more; strayFields++ }
  const KEYS = Object.keys(RECORD_FINDINGS_TOOL.input_schema.properties.findings.items.properties)
  const kept: RawFinding[] = [], unusable: string[] = []
  o.findings.forEach((f, i) => {
    const at = `findings[${i}]`
    if (!f || typeof f !== 'object' || Array.isArray(f)) { unusable.push(`${at} must be an object.`); return }
    const r = f as Record<string, unknown>
    for (const k of Object.keys(r)) if (!KEYS.includes(k)) { delete r[k]; strayFields++ }
    for (const k of KEYS) if (!(k in r)) r[k] = null   // a missing property reads as "does not apply"; the checks below decide
    for (const [k, belongs] of Object.entries(KIND_FIELDS)) if (r[k] !== null && !belongs(r)) { r[k] = null; strayFields++ }
    // competitor-features-2: "not mentioned" has no quote — it is the outcome not_stated, whichever outcome came with it; and a
    // feature its site does not state IS not mentioned.
    if (r.field === 'feature' && (r.feature === 'not_mentioned' || r.outcome === 'not_stated')) { r.feature = 'not_mentioned'; r.outcome = 'not_stated' }
    const errs = findingErrors(r, at)
    if (errs.length) unusable.push(errs.join(' ')); else kept.push(r as unknown as RawFinding)
  })
  if (o.findings.length > 0 && kept.length === 0) return { ok: false, errors: unusable }
  // competitor-check-5: a quote longer than QUOTE_MAX is cut back to a prefix (an exact substring still); a "translation"
  // that only repeats the quote (an English page) is empty.
  for (const r of kept) {
    r.quote_en = r.quote_en !== null && r.quote !== null && squash(r.quote_en) === squash(r.quote) ? null : capQuote(r.quote_en, QUOTE_MAX + 100)
    r.quote = capQuote(r.quote)
  }
  const value = { ...(o as unknown as RecordFindingsInput), findings: kept }
  if (strayFields || unusable.length) value.ignored = { strayFields, unusable }
  return { ok: true, value }
}

export function validateRecordVerdict(input: unknown): RecordVerdictInput | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const o = fromWireVerdict(input as Record<string, unknown>)   // competitor-check-4: "" back to null
  if (Object.keys(o).some(k => !['verdict', 'value', 'quote', 'quote_en'].includes(k))) return null
  if (!inList(o.verdict, ['confirmed', 'disagreed', 'not_found'])) return null
  if (!strOrNull(o.value) || !strOrNull(o.quote) || !strOrNull(o.quote_en)) return null
  return o as unknown as RecordVerdictInput
}

/** The host a URL is on, without "www." — "https://www.dish.co/DE/de/" → "dish.co". */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}
/** The official app stores — the one place other than its own website a competitor's words may be read. */
export const APP_STORE_HOSTS = ['apps.apple.com', 'play.google.com'] as const
/** True when `url` is on one of the competitor's own domains (a subdomain counts) or an official app store. */
export function onOwnSite(url: string | null, domains: readonly string[]): boolean {
  const h = hostOf(url)
  if (!h) return false
  return [...domains, ...APP_STORE_HOSTS].some(d => h === d || h.endsWith(`.${d}`))
}
