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

/** Every field a finding can be about. Plan-level fields name a plan; the rest are about the competitor. */
export const PLAN_FIELDS = ['monthly_price', 'setup_fee', 'truck_fee', 'customer_fee', 'card_rate', 'plan'] as const
// comparison-features-1 (29 Oct 2026): the ten fixed feature fields and the two texts (min_term, payment_methods) are gone.
// Every feature is ONE field, 'feature', naming its key from the master list (public.comparison_features — the checked
// ones are in the message), with its value (yes / no / partial / unknown) and the note as advertised.
export const OTHER_FIELDS = ['url', 'classification', 'availability'] as const   // availability: global-players-1
export const FIELDS = [...PLAN_FIELDS, 'feature', ...OTHER_FIELDS] as const
export type Field = (typeof FIELDS)[number]
/** A feature's answer, as stored (competitor_feature_values.value). */
export const FEATURE_ANSWERS = ['yes', 'no', 'partial', 'unknown'] as const

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
  feature: 'yes' | 'no' | 'partial' | 'unknown' | null
  note: string | null
  classification: Classification | null
  url: string | null
  quote: string | null
  quote_en: string | null
  source_url: string | null
}
export interface RecordFindingsInput { findings: RawFinding[]; pages_read: string[]; notes: string | null }

// Strict tool schemas support `anyOf`, `enum` and `null` (the skill's "JSON Schema Limitations"), so a nullable value is an
// anyOf of its type and null — not a type array, which that list does not name.
const nullable = (t: string) => ({ anyOf: [{ type: t }, { type: 'null' }] })
const nullableEnum = (values: readonly string[]) => ({ anyOf: [{ type: 'string', enum: [...values] }, { type: 'null' }] })

/** The one client tool the extractor may call. strict: the API holds the model to this schema. */
export const RECORD_FINDINGS_TOOL = {
  name: 'record_findings',
  description: 'Record what you found on the competitor\'s own pages. Call it exactly once, at the end, with every finding. '
    + 'Every value must come with a verbatim quote copied from a page you fetched in this conversation, its English translation, and that page\'s URL.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['findings', 'pages_read', 'notes'],
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
            plan_name: nullable('string'),
            country_code: nullable('string'),
            outcome: { type: 'string', enum: [...OUTCOMES] },
            found_value: nullable('string'),
            amount: nullable('number'),
            currency: nullable('string'),
            period: nullableEnum(['month', 'year', 'one_off']),
            vat: nullableEnum(['incl', 'excl', 'unknown']),
            percent: nullable('number'),
            feature_key: nullable('string'),
            feature: nullableEnum(FEATURE_ANSWERS),
            note: nullable('string'),
            classification: nullableEnum(CLASSIFICATIONS),
            url: nullable('string'),
            quote: nullable('string'),
            quote_en: nullable('string'),
            source_url: nullable('string'),
          },
        },
      },
      pages_read: { type: 'array', items: { type: 'string' } },
      notes: nullable('string'),
    },
  },
} as const

/** The verifier's one client tool. */
export const RECORD_VERDICT_TOOL = {
  name: 'record_verdict',
  description: 'Record whether the page states the claimed value. Call it exactly once. Quote the page verbatim.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdict', 'value', 'quote', 'quote_en'],
    properties: {
      verdict: { type: 'string', enum: ['confirmed', 'disagreed', 'not_found'] },
      value: nullable('string'),
      quote: nullable('string'),
      quote_en: nullable('string'),
    },
  },
} as const
export interface RecordVerdictInput { verdict: 'confirmed' | 'disagreed' | 'not_found'; value: string | null; quote: string | null; quote_en: string | null }

// ── validation (the API's strict mode first; this second, so a schema change can never let a bad value through) ──────
const MAX_TEXT = 2000
const isStr = (v: unknown, max = MAX_TEXT) => typeof v === 'string' && v.length <= max
const strOrNull = (v: unknown, max = MAX_TEXT) => v === null || isStr(v, max)
const numOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e7)
const inList = (v: unknown, list: readonly unknown[]) => list.includes(v)
const isHttpUrl = (v: unknown) => typeof v === 'string' && v.length <= 600 && /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(v)

/** Validates the record_findings input. Returns the findings or a list of plain errors (sent back to the model once). */
export function validateRecordFindings(input: unknown): { ok: true; value: RecordFindingsInput } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['The input must be an object.'] }
  const o = input as Record<string, unknown>
  const extra = Object.keys(o).filter(k => !['findings', 'pages_read', 'notes'].includes(k))
  if (extra.length) errors.push(`Unknown properties: ${extra.join(', ')}.`)
  if (!Array.isArray(o.findings)) return { ok: false, errors: [...errors, '"findings" must be an array.'] }
  if (o.findings.length > 200) errors.push('Too many findings (at most 200).')
  if (!Array.isArray(o.pages_read) || !o.pages_read.every(p => isStr(p, 600))) errors.push('"pages_read" must be a list of URLs.')
  if (!strOrNull(o.notes)) errors.push('"notes" must be text or null.')
  const KEYS = Object.keys(RECORD_FINDINGS_TOOL.input_schema.properties.findings.items.properties)
  o.findings.forEach((f, i) => {
    const at = `findings[${i}]`
    if (!f || typeof f !== 'object' || Array.isArray(f)) { errors.push(`${at} must be an object.`); return }
    const r = f as Record<string, unknown>
    const unknown = Object.keys(r).filter(k => !KEYS.includes(k)); if (unknown.length) errors.push(`${at}: unknown properties ${unknown.join(', ')}.`)
    const missing = KEYS.filter(k => !(k in r)); if (missing.length) errors.push(`${at}: missing ${missing.join(', ')}.`)
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
    if (inList(r.outcome, QUOTED_OUTCOMES) && (!isStr(r.quote) || !String(r.quote).trim() || !isStr(r.quote_en) || !isHttpUrl(r.source_url)))
      errors.push(`${at}: a "${String(r.outcome)}" finding needs a verbatim quote, its English translation and the page's URL.`)
    if (r.field === 'feature' && (r.feature_key === null || (inList(r.outcome, ['changed', 'unchanged']) && r.feature === null)))
      errors.push(`${at}: a feature finding needs "feature_key" (from the list) and "feature" (yes / no / partial / unknown).`)
    if (r.field !== 'feature' && r.feature_key !== null) errors.push(`${at}: "feature_key" goes with the field "feature" only.`)
    if (r.outcome === 'classification' && r.classification === null) errors.push(`${at}: a classification finding needs "classification".`)
    if (r.outcome === 'new_url' && r.url === null) errors.push(`${at}: a new_url finding needs "url".`)
    if ((r.outcome === 'in_country' || r.outcome === 'not_in_country') !== (r.field === 'availability')) errors.push(`${at}: "in_country" and "not_in_country" go with the field "availability", and only they do.`)
  })
  return errors.length ? { ok: false, errors } : { ok: true, value: o as unknown as RecordFindingsInput }
}

export function validateRecordVerdict(input: unknown): RecordVerdictInput | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const o = input as Record<string, unknown>
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
