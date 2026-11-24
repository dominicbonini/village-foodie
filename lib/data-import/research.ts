// lib/data-import/research.ts — imports a pricing-research data file (competitors, plans, comparison entries) into the
// pricing check's tables (competitor-check-2, 29 October 2026; docs/competitor-check-2-report.md). PURE apart from the store.
//
// Replaces the one-time "Import German comparison research" button (compare-de-1). Run by lib/data-import/importer.ts,
// which records each file's sha256 in public.data_imports, so a file is imported once per version.
//
// 🔴 EVERY ROW IS CHECKED BEFORE ANYTHING IS WRITTEN — the same rules as the tables' CHECKs (20261039, 20261042, 20261043).
// The button failed on 25 and 27 October because five price-hidden plans were status 'counted' with no monthly price
// (competitor_plans_counted_has_price), and it had already written the competitors when the plans insert failed.
// 🔴 IDEMPOTENT ROW BY ROW: a competitor is matched by id, then by name, then by domain — candidates included (a researched
// competitor UPGRADES a matching candidate to active rather than adding a second row); a match only gets its EMPTY fields
// filled ('unknown' features, empty texts). A plan is skipped when its id is already in the table or the competitor already
// has a current plan of the same name in the same country. An entry is skipped when its id, or one for the same country
// and competitor, is already there. So a run that stopped half-way is finished by the next one, and nothing is duplicated.
// Every plan and entry arrives source 'research' and unverified: nothing is public until an admin verifies it.
// global-players-1 (29 October 2026): a file row may be a CANDIDATE (data/global-players/competitors.json — the big POS
// players, name, website, focus 'pos', "countries: all switched-on" in its notes, nothing else). A candidate row never
// raises a match to active and never lowers it: an existing match keeps its lifecycle (a not-relevant one — a POS ruled
// out before the 29 Oct decision — becomes a candidate again), gets focus 'pos' even over another focus (the "upgrade"),
// and gets the row's "countries: …" in its notes.
// competitor-wtt-1 (4 November 2026): a competitor row may also carry
//   • "answers": [{ key, value, note?, quote?, source_url? }] — feature answers for every country, written with the vendor's
//     verbatim quote and its page, unverified, with the file's date. The rules are the checker's own: yes / partial / no need
//     a quote (35.an-4); "no" needs a quote in which the vendor says it is not offered (35.ao-7, `saysNotOffered`); silence is
//     not_mentioned and carries no quote; unknown carries its reason in the note. A key must be in the feature list. An
//     answer wins over the same feature's legacy column in the same row, and, like those, is written only where the competitor
//     has no current answer that says anything (a placeholder is superseded).
//   • "request_check": true — the import sets check_requested_at, the column Admin's "Check now" sets (35.an-3: the checker
//     then checks it with its own quotes; a deep check while its country's deep check is running, "Check now" first).
//   Neither key is a column: both are stripped from the competitor row.
// compare-fix-1 (24 November 2026; docs/compare-fix-1-report.md): five more instruction keys, each with its evidence kept —
//   • competitor row "set_lifecycle": { value: "not_relevant" | "active", reason, source_url } — marks a STORED competitor not relevant,
//     or brings a not-relevant one back to active; the reason and page go into its notes (a new competitor is never inserted not relevant);
//   • competitor row "not_sold_in": [{ country, reason, source_url }] — adds countries to not_in_countries (never shown there);
//   • competitor row "set_focus": true — the file's focus replaces the stored one (research read it on the vendor's own site);
//   • plan row "correct": true — supersedes the competitor's CURRENT plan of that name in that country and inserts this one (history kept,
//     never edited in place);
//   • plan row "monthly_major" / "setup_major" — the price in MAJOR units, converted with toMinorUnits; a monthly price above its
//     currency's plausible ceiling (lib/price-units.ts) is NOT stored: the plan arrives hidden and unclear.
// And: a quoted answer now replaces a stored answer that has no quote (Admin's verified or blocked answers are never touched), and each
// answer written records its check (competitor_feature_checks, every country) with the pages the research read.
import { hostOf, APP_STORE_HOSTS, FEATURE_ANSWERS, QUOTE_MAX, saysNotOffered } from '@/lib/competitor-check/model'
import { toMinorUnits, minorDigits } from '@/lib/money-format'
import { implausibleMonthly } from '@/lib/price-units'
import { COUNTRIES_MARK } from '@/lib/competitor-check/core'
import { LEGACY_FEATURE_COLUMNS } from '@/lib/comparison-features'
// comparison-features-1 (29 Oct 2026): a file's feature columns (pre_orders … pay_at_truck, payment_methods, min_term) are
// written as ANSWERS — competitor_feature_values rows for every country, unverified, with the file's date — never to the
// retired competitor columns. An answer is added only where the competitor has none that says anything; a placeholder
// ('unknown', nothing stated) is superseded by it.

type Row = Record<string, unknown>
export interface ResearchFile { id?: string; checked_on: string; competitors: Row[]; plans: Row[]; entries: Row[] }

export interface ResearchStore {
  /** Every competitor, candidates included. */
  competitors(): Promise<Row[]>
  /** id, competitor_id, country_code, plan_name, superseded_at of every plan (current and superseded). */
  plans(): Promise<Row[]>
  /** id, country_code, competitor_id of every comparison entry. */
  entries(): Promise<Row[]>
  insertCompetitor(row: Row): Promise<void>
  /** comparison-features-1: current answers (competitor_id, feature_key, country_code, value, note, source_url, id); and
   *  their writes. Optional: without them the file's features are not written. */
  featureValues?(): Promise<Row[]>
  insertFeatureValues?(rows: Row[]): Promise<void>
  supersedeFeatureValues?(ids: string[], at: string): Promise<void>
  updateCompetitor(id: string, cols: Row): Promise<void>
  insertPlans(rows: Row[]): Promise<void>
  insertEntries(rows: Row[]): Promise<void>
  /** compare-fix-2: makes answers written "pending" current (superseded_at back to null). */
  activateFeatureValues?(ids: string[]): Promise<void>
  /** compare-fix-1: supersedes plans (a corrected plan replaces them). */
  supersedePlans?(ids: string[], at: string): Promise<void>
  /** compare-fix-1: records the checks the file's answers come from (competitor_feature_checks, upsert). */
  upsertFeatureChecks?(rows: Row[]): Promise<void>
}

export interface ResearchCounts {
  competitors: number; added: number; updated: number; upgraded: number
  plans: number; plansAdded: number; plansExisting: number
  entries: number; entriesAdded: number; entriesExisting: number
  answersAdded?: number
  /** competitor-wtt-1: competitors whose check this import requested (check_requested_at). */
  checksRequested?: number
  /** compare-fix-1: instructions applied. */
  notRelevant?: number; revived?: number; failuresReset?: number; notSoldIn?: number; focusSet?: number; plansCorrected?: number; implausible?: number; answersReplaced?: number; checksRecorded?: number
}

/** competitor-wtt-1: the row keys that are instructions to the importer, never competitor columns. */
const ROW_ONLY = ['answers', 'request_check', 'set_lifecycle', 'not_sold_in', 'set_focus']
const QUOTED = ['yes', 'partial', 'no']
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
/** compare-fix-2: the superseded_at an answer carries while it is written and not yet current (outside the unique current index). */
export const PENDING_AT = '9999-12-31T00:00:00.000Z'
const newId = () => globalThis.crypto.randomUUID()
/** compare-fix-1: a page address that is a pricing page (for the check record's page kinds). */
const PRICING_PATH = /\/(pricing|prices|price|plans|preise|preis|tarife?|kosten|precios|prix|tarifs|prezzi|prijzen|cennik|hinnasto|priser|ceny|planos|precos)(\/|$|[.?#-])/i

/** competitor-wtt-1: the problems with one competitor's "answers" (empty when it has none, or they can be imported). */
function answerProblems(who: string, answers: unknown, featureKeys?: readonly string[]): string[] {
  if (answers == null) return []
  if (!Array.isArray(answers)) return [`${who}: answers must be a list.`]
  const out: string[] = []
  const seen = new Set<string>()
  for (const a of answers as Row[]) {
    const key = str(a?.key), value = String(a?.value ?? ''), quote = str(a?.quote), note = str(a?.note)
    const what = `${who}, answer "${key || '?'}"`
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(key)) out.push(`${what}: the key is not a feature key.`)
    else if (!featureKeys) out.push(`${what}: the feature list could not be read, so the key can't be checked.`)
    else if (!featureKeys.includes(key)) out.push(`${what}: not in the feature list.`)
    if (seen.has(key)) out.push(`${what}: appears twice.`)
    seen.add(key)
    if (!(FEATURE_ANSWERS as readonly string[]).includes(value)) out.push(`${what}: value "${value}" is not one of ${FEATURE_ANSWERS.join(', ')}.`)
    if (QUOTED.includes(value) && !quote) out.push(`${what}: "${value}" needs the vendor's own words as a quote (35.an-4).`)
    if (value === 'no' && quote && !saysNotOffered(quote, null)) out.push(`${what}: "no" needs a quote in which the vendor says it is not offered (35.ao-7) — silence is not_mentioned.`)
    if (value === 'not_mentioned' && quote) out.push(`${what}: not_mentioned is silence — it carries no quote.`)
    if (value === 'unknown' && !note) out.push(`${what}: unknown needs its reason in the note.`)
    if (quote && !/^https?:\/\//i.test(str(a?.source_url))) out.push(`${what}: a quote needs the page it is on (source_url).`)
    if (str(a?.source_url) && !/^https?:\/\//i.test(str(a?.source_url))) out.push(`${what}: source_url must be an http(s) address (competitor_feature_values_source_url_check).`)
    if (quote.length > QUOTE_MAX) out.push(`${what}: the quote is longer than ${QUOTE_MAX} characters.`)
    if (note.length > 300) out.push(`${what}: the note is longer than 300 characters.`)
  }
  return out
}

const TRI = ['yes', 'no', 'unknown']
const FEATURES = ['pre_orders', 'whatsapp', 'social_posts', 'own_domain', 'ios_app', 'android_app', 'capacity_slots', 'multi_location_schedule', 'kds', 'pay_at_truck']
const TEXTS = ['website', 'focus', 'payment_providers']
const FOCUS = ['food_truck', 'street_food_markets', 'nearest_local', 'pop_up', 'pos']
const NON_NEGATIVE = ['monthly_minor', 'setup_minor', 'truck_fee_bps', 'truck_fee_fixed_minor', 'customer_fee_bps', 'customer_fee_fixed_minor', 'card_bps', 'card_fixed_minor', 'included_orders', 'overage_fixed_minor']

const nameKey = (v: unknown) => String(v ?? '').trim().toLowerCase()
const planKey = (cid: unknown, cc: unknown, name: unknown) => `${cid}|${cc}|${nameKey(name)}`
/** The domain a competitor is matched on: its website's host without "www.", never an app store. */
const domainOf = (url: unknown) => { const h = hostOf(typeof url === 'string' ? url : null); return h && !(APP_STORE_HOSTS as readonly string[]).includes(h) ? h : null }

/** Every problem with the file, in plain words naming the row — empty when it can be imported. */
export function researchProblems(file: ResearchFile, opts: { featureKeys?: readonly string[] } = {}): string[] {
  if (!file || !Array.isArray(file.competitors) || !Array.isArray(file.plans) || !Array.isArray(file.entries) || !/^\d{4}-\d{2}-\d{2}$/.test(String(file.checked_on)))
    return ['The file is not in the expected shape (checked_on, competitors, plans, entries).']
  const out: string[] = []
  const names = new Map(file.competitors.map(c => [String(c.id), String(c.name)]))
  const planIds = new Set(file.plans.map(p => String(p.id)))
  // compare-fix-2: EACH COMPETITOR ONCE PER FILE — by id, by name (as competitors_name_ci_key: lower(btrim(name))) and by domain (the
  // importer matches a stored competitor by id, then name, then domain; two rows landing on one competitor wrote its answers twice and
  // broke competitor_feature_values_current on 24 Nov).
  const seenId = new Map<string, string>(), seenName = new Map<string, string>(), seenDomain = new Map<string, string>()
  for (const c of file.competitors) {
    const label = String(c.name ?? c.id), id = String(c.id ?? ''), nm = nameKey(c.name), dom = domainOf(c.website)
    if (id && seenId.has(id)) out.push(`Competitor "${label}": appears twice in the file (the same id as "${seenId.get(id)}") — merge them.`)
    if (nm && seenName.has(nm)) out.push(`Competitor "${label}": appears twice in the file (the same name as "${seenName.get(nm)}") — merge them.`)
    if (dom && seenDomain.has(dom)) out.push(`Competitor "${label}": appears twice in the file (the same website domain ${dom} as "${seenDomain.get(dom)}") — merge them.`)
    if (id) seenId.set(id, label); if (nm) seenName.set(nm, label); if (dom) seenDomain.set(dom, label)
  }
  for (const c of file.competitors) {
    const who = `Competitor "${c.name ?? c.id}"`
    if (!c.id || !String(c.name ?? '').trim()) out.push(`${who}: needs an id and a name.`)
    // compare-fix-2: the competitors table's own CHECKs, mirrored (MIRRORED_DB_RULES).
    if (c.check_interval_days != null && !(Number.isInteger(c.check_interval_days) && (c.check_interval_days as number) >= 7 && (c.check_interval_days as number) <= 365)) out.push(`${who}: check_interval_days must be 7–365 (competitors_check_interval_chk).`)
    if (c.category != null && !['food_truck', 'general_pos', 'restaurant', 'marketplace'].includes(String(c.category))) out.push(`${who}: category "${c.category}" is not one the table allows (competitors_category_check).`)
    if (c.category_by != null && !['auto', 'admin'].includes(String(c.category_by))) out.push(`${who}: category_by must be auto or admin (competitors_category_by_check).`)
    if (c.check_urls_by != null && !['auto', 'admin'].includes(String(c.check_urls_by))) out.push(`${who}: check_urls_by must be auto or admin (competitors_check_urls_by_check).`)
    if (c.check_urls != null && !(Array.isArray(c.check_urls) && (c.check_urls as unknown[]).every(u => typeof u === 'string'))) out.push(`${who}: check_urls must be a list of addresses.`)
    for (const f of FEATURES) if (c[f] != null && !TRI.includes(String(c[f]))) out.push(`${who}: ${f} must be yes, no or unknown (is "${c[f]}").`)
    if (c.focus != null && !FOCUS.includes(String(c.focus))) out.push(`${who}: focus "${c.focus}" is not one the table allows.`)
    if (c.features_verified_at) out.push(`${who}: arrives verified — research must arrive unverified.`)
    if (c.lifecycle != null && !['active', 'candidate'].includes(String(c.lifecycle))) out.push(`${who}: lifecycle must be active or candidate.`)
    out.push(...answerProblems(who, c.answers, opts.featureKeys))
    if (c.request_check != null && typeof c.request_check !== 'boolean') out.push(`${who}: request_check must be true or false.`)
    // compare-fix-1: the lifecycle, country and focus instructions — each with its reason and page.
    if (c.set_lifecycle != null) {
      const l = c.set_lifecycle as Row
      if (!l || typeof l !== 'object' || !['not_relevant', 'active'].includes(String(l.value))) out.push(`${who}: set_lifecycle.value must be not_relevant or active.`)
      else { if (!str(l.reason)) out.push(`${who}: set_lifecycle needs its reason.`); if (!/^https?:\/\//i.test(str(l.source_url))) out.push(`${who}: set_lifecycle needs the page (source_url) it rests on.`) }
    }
    if (c.not_sold_in != null) {
      if (!Array.isArray(c.not_sold_in)) out.push(`${who}: not_sold_in must be a list.`)
      else for (const n of c.not_sold_in as Row[]) {
        if (!/^[A-Z]{2}$/.test(str(n?.country))) out.push(`${who}: not_sold_in needs a two-letter country.`)
        if (!str(n?.reason)) out.push(`${who}: not_sold_in ${str(n?.country) || '?'} needs its reason.`)
        if (!/^https?:\/\//i.test(str(n?.source_url))) out.push(`${who}: not_sold_in ${str(n?.country) || '?'} needs the page (source_url) it rests on.`)
      }
    }
    if (c.set_focus != null && typeof c.set_focus !== 'boolean') out.push(`${who}: set_focus must be true or false.`)
    if (c.set_focus === true && !FOCUS.includes(String(c.focus))) out.push(`${who}: set_focus needs a focus the table allows.`)
  }
  const seenPlan = new Set<string>()
  for (const p of file.plans) {
    const who = `Plan "${names.get(String(p.competitor_id)) ?? p.competitor_id} · ${p.plan_name}" (${p.country_code})`
    if (!p.id) out.push(`${who}: needs an id (competitor_plans_pkey).`)
    else if (seenPlan.has(String(p.id))) out.push(`${who}: its id appears twice in the file (competitor_plans_pkey).`)
    seenPlan.add(String(p.id))
    if (!names.has(String(p.competitor_id))) out.push(`${who}: its competitor is not in the file.`)
    if (!/^[A-Z]{2}$/.test(String(p.country_code))) out.push(`${who}: the country must be a two-letter code.`)
    if (!/^[A-Z]{3}$/.test(String(p.currency))) out.push(`${who}: the currency must be a three-letter code.`)
    if (!['counted', 'hidden', 'closed', 'excluded'].includes(String(p.status))) out.push(`${who}: status "${p.status}" is not counted, hidden, closed or excluded.`)
    // compare-fix-1: MAJOR units, explicitly — and, when both are given, they must agree (the 100× guard).
    for (const k of ['monthly_major', 'setup_major']) if (p[k] != null && !(typeof p[k] === 'number' && Number.isFinite(p[k] as number) && (p[k] as number) >= 0)) out.push(`${who}: ${k} must be a number of 0 or more.`)
    if (typeof p.monthly_major === 'number' && typeof p.monthly_minor === 'number' && /^[A-Z]{3}$/.test(String(p.currency)) && toMinorUnits(p.monthly_major, String(p.currency)) !== p.monthly_minor)
      out.push(`${who}: monthly_major ${p.monthly_major} and monthly_minor ${p.monthly_minor} disagree — one of them is in the wrong unit.`)
    if (p.correct != null && typeof p.correct !== 'boolean') out.push(`${who}: correct must be true or false.`)
    if (p.status === 'counted' && p.monthly_minor == null && p.monthly_major == null) out.push(`${who}: status counted needs a monthly price — a price on request is status "hidden".`)
    if (p.status === 'counted' && p.price_hidden === true) out.push(`${who}: a hidden price can't be counted — status "hidden".`)
    for (const k of NON_NEGATIVE) if (p[k] != null && !(typeof p[k] === 'number' && (p[k] as number) >= 0)) out.push(`${who}: ${k} must be a number of 0 or more.`)
    if (p.order_cap != null && !(typeof p.order_cap === 'number' && p.order_cap > 0)) out.push(`${who}: order_cap must be above 0.`)
    if (p.card_mode != null && !['bundled', 'separate', 'unknown'].includes(String(p.card_mode))) out.push(`${who}: card_mode "${p.card_mode}" is not allowed.`)
    if (p.vat != null && !['incl', 'excl', 'unknown'].includes(String(p.vat))) out.push(`${who}: vat "${p.vat}" is not allowed.`)
    if (p.source !== 'research' || p.verified_at) out.push(`${who}: must be source research and unverified.`)
  }
  const pairs = new Set<string>(), seenEntry = new Set<string>()
  for (const e of file.entries) {
    const who = `Entry for "${names.get(String(e.competitor_id)) ?? e.competitor_id}" (${e.country_code})`
    if (!e.id) out.push(`${who}: needs an id (comparison_entries_pkey).`)
    else if (seenEntry.has(String(e.id))) out.push(`${who}: its id appears twice in the file (comparison_entries_pkey).`)
    seenEntry.add(String(e.id))
    if (!/^[A-Z]{2}$/.test(String(e.country_code))) out.push(`${who}: the country must be a two-letter code (comparison_entries_country_code_check).`)
    if (e.group_label != null && !(typeof e.group_label === 'string' && e.group_label.trim().length >= 1 && e.group_label.trim().length <= 60)) out.push(`${who}: group_label must be 1–60 characters (comparison_entries_group_label_chk).`)
    if (!names.has(String(e.competitor_id))) out.push(`${who}: its competitor is not in the file.`)
    if (e.primary_plan_id && !planIds.has(String(e.primary_plan_id))) out.push(`${who}: its main plan is not in the file.`)
    if (e.verified_at) out.push(`${who}: arrives verified — research must arrive unverified.`)
    const k = `${e.country_code}|${e.competitor_id}`
    if (pairs.has(k)) out.push(`${who}: appears twice.`)
    pairs.add(k)
  }
  return out
}

/** Imports the file. Throws (with the step that failed, and what was already written) only when the database refuses a write. */
export async function importResearch(store: ResearchStore, file: ResearchFile, stamp: { today: string; path: string; featureKeys?: readonly string[]; nowIso?: string }): Promise<ResearchCounts> {
  const problems = researchProblems(file, { featureKeys: stamp.featureKeys })
  if (problems.length) throw new Error(`Nothing was written — the file has ${problems.length} problem${problems.length === 1 ? '' : 's'}: ${problems.slice(0, 8).join(' ')}`)
  const counts: ResearchCounts = { competitors: file.competitors.length, added: 0, updated: 0, upgraded: 0, plans: file.plans.length, plansAdded: 0, plansExisting: 0,
    entries: file.entries.length, entriesAdded: 0, entriesExisting: 0 }
  const done = () => `${counts.added} competitor(s) added, ${counts.updated} updated, ${counts.plansAdded} plan(s) added`

  // ── competitors: by id, then name, then domain (candidates included); fill empty fields; upgrade a candidate ──
  const existing = await store.competitors()
  const rank = (r: Row) => (r.lifecycle === 'active' ? 0 : r.lifecycle === 'candidate' ? 1 : 2)
  const find = (c: Row) => existing.find(r => r.id === c.id)
    ?? existing.filter(r => nameKey(r.name) === nameKey(c.name)).sort((a, b) => rank(a) - rank(b))[0]
    ?? (domainOf(c.website) ? existing.filter(r => domainOf(r.website) === domainOf(c.website)).sort((a, b) => rank(a) - rank(b))[0] : undefined)
  const idOf = new Map<string, string>()
  const requestedAt = stamp.nowIso ?? new Date().toISOString()
  try {
    for (const c of file.competitors) {
      const match = find(c)
      const fileCandidate = c.lifecycle === 'candidate'
      const setLife = (c.set_lifecycle ?? null) as Row | null
      // compare-fix-1: a competitor the research found not relevant is never ADDED — the instruction only marks a stored one.
      if (!match && setLife?.value === 'not_relevant') continue
      if (!match) {
        const { features_verified_at: _skip, ...all } = c   // eslint-disable-line @typescript-eslint/no-unused-vars
        // The retired feature columns never reach the competitors table (they become answers below), nor do the
        // importer's own instructions (competitor-wtt-1: answers, request_check).
        const row = Object.fromEntries(Object.entries(all).filter(([k]) => !(k in LEGACY_FEATURE_COLUMNS) && !ROW_ONLY.includes(k)))
        // A candidate row has had no features checked: no checked date, and added_as_candidate (hidden until verified).
        await store.insertCompetitor({ ...row, ...(fileCandidate ? { added_as_candidate: true } : {}),
          ...(c.request_check === true ? { check_requested_at: requestedAt } : {}),
          features_checked_on: c.features_checked_on ?? (fileCandidate ? null : file.checked_on), features_verified_at: null })
        existing.push({ ...row, lifecycle: fileCandidate ? 'candidate' : 'active' })
        idOf.set(String(c.id), String(c.id)); counts.added++
        if (c.request_check === true) counts.checksRequested = (counts.checksRequested ?? 0) + 1
        continue
      }
      idOf.set(String(c.id), String(match.id))
      const cols: Row = {}
      for (const f of TEXTS) if ((match[f] == null || match[f] === '') && c[f] != null && c[f] !== '') cols[f] = c[f]
      const checkedOn = String(c.features_checked_on ?? file.checked_on)
      if (FEATURES.some(f => c[f] != null && c[f] !== 'unknown') && (!match.features_checked_on || String(match.features_checked_on) < checkedOn)) cols.features_checked_on = checkedOn
      if (match.lifecycle === 'candidate' && !fileCandidate && setLife?.value !== 'not_relevant') {   // compare-fix-1: never upgraded on its way to not relevant
        // A researched competitor (read on its own website) is no longer a candidate: active and counted like the file's
        // other competitors, still unverified. The note keeps where it came from.
        cols.lifecycle = 'active'; cols.added_as_candidate = false
        cols.notes = `${match.notes ? `${match.notes} · ` : ''}upgraded from candidate by ${stamp.path} (${stamp.today})`
        counts.upgraded++
      }
      if (fileCandidate) {
        // global-players-1: the upgrade a candidate row brings — focus 'pos' over any other focus, its countries in the
        // notes; a not-relevant match (a POS ruled out before 29 Oct) becomes a candidate again. Never active → candidate.
        if (c.focus === 'pos' && match.focus !== 'pos') cols.focus = 'pos'
        const mark = typeof c.notes === 'string' ? COUNTRIES_MARK.exec(c.notes)?.[0] : undefined
        const notes = String(cols.notes ?? match.notes ?? '')
        if (mark && COUNTRIES_MARK.exec(notes)?.[0] !== mark)
          cols.notes = COUNTRIES_MARK.test(notes) ? notes.replace(COUNTRIES_MARK, mark) : `${notes ? `${notes} · ` : ''}${stamp.path} · ${mark}`
        if (match.lifecycle === 'not_relevant') { cols.lifecycle = 'candidate'; cols.added_as_candidate = true }
      }
      // compare-fix-1: the lifecycle, country and focus instructions, each with its evidence in the notes.
      const note = (text: string) => { const base = String(cols.notes ?? match.notes ?? ''); cols.notes = `${base ? `${base} · ` : ''}${text}` }
      if (setLife?.value === 'not_relevant' && match.lifecycle !== 'not_relevant') {
        cols.lifecycle = 'not_relevant'
        note(`not relevant (${stamp.path}, ${file.checked_on}): ${str(setLife.reason)} — ${str(setLife.source_url)}`)
        counts.notRelevant = (counts.notRelevant ?? 0) + 1
      }
      if (setLife?.value === 'active' && match.lifecycle === 'not_relevant') {
        cols.lifecycle = 'active'; cols.added_as_candidate = false
        note(`back to active (${stamp.path}, ${file.checked_on}): ${str(setLife.reason)} — ${str(setLife.source_url)}`)
        counts.revived = (counts.revived ?? 0) + 1
      }
      if (Array.isArray(c.not_sold_in) && c.not_sold_in.length) {
        const had = Array.isArray(match.not_in_countries) ? (match.not_in_countries as string[]) : []
        const add = (c.not_sold_in as Row[]).filter(n => !had.includes(str(n.country)))
        if (add.length) {
          cols.not_in_countries = [...new Set([...had, ...add.map(n => str(n.country))])].sort()
          for (const n of add) note(`not sold in ${str(n.country)} (${stamp.path}, ${file.checked_on}): ${str(n.reason)} — ${str(n.source_url)}`)
          counts.notSoldIn = (counts.notSoldIn ?? 0) + add.length
        }
      }
      if (c.set_focus === true && typeof c.focus === 'string' && c.focus !== match.focus) { cols.focus = c.focus; counts.focusSet = (counts.focusSet ?? 0) + 1 }
      // A check is requested only for a competitor that ends up counted (never for one just marked, or left, not relevant).
      if (c.request_check === true && (cols.lifecycle ?? match.lifecycle) !== 'not_relevant') {
        cols.check_requested_at = requestedAt; counts.checksRequested = (counts.checksRequested ?? 0) + 1
        // compare-fix-1: read on its own site today by the research — a good check, so the failed-check count starts again (the
        // 20–23 Nov API outage counted five failures against every competitor in the deep share).
        if (Number(match.check_failures ?? 0) > 0) { cols.check_failures = 0; counts.failuresReset = (counts.failuresReset ?? 0) + 1 }
      }
      if (Object.keys(cols).length) { await store.updateCompetitor(String(match.id), cols); Object.assign(match, cols); counts.updated++ }
    }
  } catch (e) { throw new Error(`Competitors: ${msg(e)} (already written: ${done()}; the next run carries on).`) }

  // ── comparison-features-1: the file's feature columns, as answers (every country, unverified, the file's date) ──
  if (store.featureValues && store.insertFeatureValues) {
    try {
      const current = await store.featureValues()
      const says = (r: Row) => r.value !== 'unknown' || !!r.note || !!r.source_url
      const fresh: Row[] = [], placeholders: string[] = [], checks: Row[] = []
      for (const c of file.competitors) {
        if (!idOf.has(String(c.id))) continue   // compare-fix-1: a competitor not added (found not relevant) gets nothing
        const cid = idOf.get(String(c.id)) ?? String(c.id)
        // competitor-wtt-1: the row's quoted answers first; they win over a legacy column for the same feature.
        const answered = new Set<string>()
        const pages = (Array.isArray(c.check_urls) ? c.check_urls as string[] : []).filter(u => typeof u === 'string').slice(0, 10)
          .map(url => ({ url, kind: PRICING_PATH.test(url) ? 'pricing' : 'other', ok: true, status: 'fetched', fetchedAt: null }))
        for (const a of (Array.isArray(c.answers) ? c.answers : []) as Row[]) {
          const key = str(a.key)
          answered.add(key)
          const cur = current.find(r => r.competitor_id === cid && r.feature_key === key && r.country_code == null && r.superseded_at == null)
          if (cur && says(cur)) {
            // compare-fix-1: a quoted answer replaces a BARE stored one — no quote and no note (the 23 Oct research's legacy "yes" etc.);
            // Admin's verified or blocked answers, and any answer with its own quote or note, are kept.
            const better = !!str(a.quote) && !str(cur.quote) && !str(cur.note) && !cur.verified_at && cur.auto_blocked !== true
            if (!better) continue
            placeholders.push(String(cur.id)); counts.answersReplaced = (counts.answersReplaced ?? 0) + 1
          } else if (cur) placeholders.push(String(cur.id))
          fresh.push({ competitor_id: cid, feature_key: key, country_code: null, value: a.value, note: str(a.note) || null,
            quote: str(a.quote) || null, source_url: str(a.source_url) || null,
            checked_on: c.features_checked_on ?? file.checked_on, verified_at: null, verified_by: null })
          // compare-fix-1: the check this answer comes from (every country), with the pages the research read — so the page's display
          // rule (a row shows once it was checked for every competitor shown) counts it.
          checks.push({ competitor_id: cid, feature_key: key, country_code: '', checked_on: c.features_checked_on ?? file.checked_on, rejudge: false,
            pages_checked: { pages, helpCentre: null, checkedAt: String(c.features_checked_on ?? file.checked_on) } })
        }
        for (const [col, m] of Object.entries(LEGACY_FEATURE_COLUMNS)) {
          const raw = c[col]
          const note = m.text && typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 300) : null
          if (m.text ? !note : raw !== 'yes' && raw !== 'no') continue
          if (answered.has(m.key)) continue
          const cur = current.find(r => r.competitor_id === cid && r.feature_key === m.key && r.country_code == null && r.superseded_at == null)
          if (cur && says(cur)) continue
          if (cur) placeholders.push(String(cur.id))
          fresh.push({ competitor_id: cid, feature_key: m.key, country_code: null, value: m.text ? 'unknown' : raw, note,
            checked_on: c.features_checked_on ?? file.checked_on, verified_at: null, verified_by: null })
        }
      }
      // compare-fix-2: the NEW answers are written FIRST — "pending" (superseded at PENDING_AT, outside the one-current-answer index) —
      // then the old ones superseded, then the new ones made current. A store that cannot activate (none in the repo now) keeps the
      // old order. Inside the import's one transaction the order is invisible; without one, nothing is ever left without an answer.
      const at = stamp.nowIso ?? new Date().toISOString()
      if (store.activateFeatureValues) {
        for (const r of fresh) { r.id = r.id ?? newId(); r.superseded_at = PENDING_AT }
        if (fresh.length) await store.insertFeatureValues(fresh)
        if (placeholders.length && store.supersedeFeatureValues) await store.supersedeFeatureValues(placeholders, at)
        if (fresh.length) await store.activateFeatureValues(fresh.map(r => String(r.id)))
      } else {
        if (placeholders.length && store.supersedeFeatureValues) await store.supersedeFeatureValues(placeholders, at)
        if (fresh.length) await store.insertFeatureValues(fresh)
      }
      counts.answersAdded = fresh.length
      if (checks.length && store.upsertFeatureChecks) { await store.upsertFeatureChecks(checks); counts.checksRecorded = checks.length }
    } catch (e) { throw new Error(`Feature answers: ${msg(e)} (already written: ${done()}; the next run carries on).`) }
  }

  // ── plans: skip an id already in, or a current plan of the same name in the same country ──
  const plans = await store.plans()
  const ids = new Set(plans.map(p => String(p.id)))
  const current = new Map(plans.filter(p => p.superseded_at == null).map(p => [planKey(p.competitor_id, p.country_code, p.plan_name), String(p.id)]))
  const planIdOf = new Map<string, string>()
  const fresh: Row[] = [], supersede: string[] = []
  for (const p of file.plans) {
    if (!idOf.has(String(p.competitor_id))) continue   // compare-fix-1: its competitor was not added (found not relevant)
    const cid = idOf.get(String(p.competitor_id)) ?? String(p.competitor_id)
    const { monthly_major: monthlyMajor, setup_major: setupMajor, correct, ...base } = p
    if (ids.has(String(p.id))) { planIdOf.set(String(p.id), String(p.id)); counts.plansExisting++; continue }
    const sameName = current.get(planKey(cid, p.country_code, p.plan_name))
    // compare-fix-1: "correct": the stored plan of that name is superseded (kept as history) and this one inserted.
    if (sameName && correct !== true) { planIdOf.set(String(p.id), sameName); counts.plansExisting++; continue }
    if (sameName) { supersede.push(sameName); counts.plansCorrected = (counts.plansCorrected ?? 0) + 1 }
    const cur = String(p.currency)
    const row: Row = { ...base, competitor_id: cid, verified_at: null, verified_by: null }
    // compare-fix-1: MAJOR units are converted here (lib/money-format.ts knows zero-decimal currencies), and a monthly price above its
    // currency's plausible ceiling is never stored as a price: the plan arrives hidden and unclear.
    if (typeof monthlyMajor === 'number') row.monthly_minor = toMinorUnits(monthlyMajor, cur)
    if (typeof setupMajor === 'number') row.setup_minor = toMinorUnits(setupMajor, cur)
    if (typeof row.monthly_minor === 'number' && implausibleMonthly(row.monthly_minor / 10 ** minorDigits(cur), cur)) {
      row.notes = `${row.notes ? `${String(row.notes)} · ` : ''}NOT STORED as a price: ${row.monthly_minor / 10 ** minorDigits(cur)} ${cur} a month is above the plausible ceiling (a unit slip?).`
      row.monthly_minor = null; row.price_hidden = true; row.status = 'hidden'; row.unclear = true
      counts.implausible = (counts.implausible ?? 0) + 1
    }
    planIdOf.set(String(p.id), String(p.id))
    fresh.push(row)
  }
  if (supersede.length && !store.supersedePlans) throw new Error('Plans: this store cannot supersede a plan, so a corrected plan cannot be written (nothing written for the plans).')
  try {
    // compare-fix-2: the new plans first, then the corrected ones superseded (no index forbids two current plans of a name).
    if (fresh.length) await store.insertPlans(fresh)
    if (supersede.length) await store.supersedePlans!(supersede, stamp.nowIso ?? new Date().toISOString())
  } catch (e) { throw new Error(`Plans: ${msg(e)} (already written: ${done()}; the next run carries on).`) }
  counts.plansAdded = fresh.length

  // ── entries: skip an id already in, or one for the same country and competitor ──
  const entries = await store.entries()
  const entryIds = new Set(entries.map(e => String(e.id)))
  const pairs = new Set(entries.map(e => `${e.country_code}|${e.competitor_id}`))
  const newEntries: Row[] = []
  for (const e of file.entries) {
    if (!idOf.has(String(e.competitor_id))) continue   // compare-fix-1: its competitor was not added
    const cid = idOf.get(String(e.competitor_id)) ?? String(e.competitor_id)
    if (entryIds.has(String(e.id)) || pairs.has(`${e.country_code}|${cid}`)) { counts.entriesExisting++; continue }
    newEntries.push({ ...e, competitor_id: cid, primary_plan_id: e.primary_plan_id ? planIdOf.get(String(e.primary_plan_id)) ?? null : null, verified_at: null, verified_by: null })
  }
  try { if (newEntries.length) await store.insertEntries(newEntries) } catch (e) { throw new Error(`Comparison entries: ${msg(e)} (already written: ${done()}; the next run carries on).`) }
  counts.entriesAdded = newEntries.length
  return counts
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** compare-fix-2: EVERY unique index and constraint of the tables the importer writes (read from pg_indexes / pg_constraint on 24 Nov
 *  2026 — the snapshot is docs/compare-fix-2/db-rules.json; scripts/compare-fix-2.cjs checks that each one has an entry here) and
 *  where it is enforced before anything is written: by researchProblems ("validator"), by the importer's own rows ("importer"), by
 *  both, or it is a column the importer never writes. A database rule without an entry here fails the harness. */
export const MIRRORED_DB_RULES: Readonly<Record<string, string>> = {
  // unique indexes
  competitors_pkey: 'validator: each competitor id once per file; importer: matches a stored id before inserting',
  competitors_name_ci_key: 'validator: each name (lower, trimmed) once per file; importer: matches a stored name before inserting',
  competitor_plans_pkey: 'validator: each plan id once per file; importer: skips an id already stored',
  comparison_entries_pkey: 'validator: each entry id once per file; importer: skips an id already stored',
  comparison_entries_country_code_competitor_id_key: 'validator: each (country, competitor) once per file; importer: skips a pair already stored',
  competitor_feature_values_current: 'validator: each answer key once per competitor, each competitor once per file (id, name, domain); importer: writes only where no current answer says anything, supersedes first',
  competitor_feature_values_pkey: 'importer: new ids',
  competitor_feature_checks_pkey: 'importer: upsert on (competitor_id, feature_key, country_code)',
  data_imports_ok_once: 'importer: an ok row only for a file version not yet imported',
  data_imports_pkey: 'importer: database default id',
  // competitors
  competitors_name_check: 'validator: needs a name', competitors_focus_check: 'validator: focus in the table\'s list',
  competitors_lifecycle_chk: 'validator: lifecycle active or candidate (set_lifecycle: not_relevant or active)',
  competitors_not_in_countries_chk: 'validator: not_sold_in countries are two-letter codes', competitors_category_check: 'validator',
  competitors_category_by_check: 'validator', competitors_check_interval_chk: 'validator', competitors_check_urls_by_check: 'validator',
  competitors_pre_orders_check: 'validator: legacy feature columns yes / no / unknown', competitors_whatsapp_check: 'validator', competitors_social_posts_check: 'validator',
  competitors_own_domain_check: 'validator', competitors_ios_app_check: 'validator', competitors_android_app_check: 'validator',
  competitors_compare_features_chk: 'validator: capacity_slots, multi_location_schedule, kds, pay_at_truck yes / no / unknown',
  competitors_deep_checked_in_chk: 'not written by the importer (database default)', competitors_pass_state_chk: 'not written by the importer (database default)',
  // competitor_plans
  competitor_plans_competitor_id_fkey: 'validator: a plan\'s competitor is in the file; importer: never writes a plan for a competitor it did not add or match',
  competitor_plans_counted_has_price: 'validator: counted needs a monthly price; importer: an implausible price is written hidden',
  competitor_plans_country_code_check: 'validator', competitor_plans_currency_check: 'validator', competitor_plans_status_check: 'validator',
  competitor_plans_source_check: 'validator: source research', competitor_plans_vat_check: 'validator', competitor_plans_card_mode_check: 'validator',
  competitor_plans_monthly_minor_check: 'validator: 0 or more', competitor_plans_setup_minor_check: 'validator', competitor_plans_truck_fee_bps_check: 'validator',
  competitor_plans_truck_fee_fixed_minor_check: 'validator', competitor_plans_customer_fee_bps_check: 'validator', competitor_plans_customer_fee_fixed_minor_check: 'validator',
  competitor_plans_card_bps_check: 'validator', competitor_plans_card_fixed_minor_check: 'validator', competitor_plans_included_orders_check: 'validator',
  competitor_plans_overage_fixed_minor_check: 'validator', competitor_plans_order_cap_check: 'validator: above 0',
  // comparison_entries
  comparison_entries_competitor_id_fkey: 'validator: an entry\'s competitor is in the file', comparison_entries_primary_plan_id_fkey: 'validator: its main plan is in the file',
  comparison_entries_country_code_check: 'validator', comparison_entries_group_label_chk: 'validator: 1–60 characters',
  // competitor_feature_values
  competitor_feature_values_competitor_id_fkey: 'importer: answers only for competitors it added or matched',
  competitor_feature_values_feature_key_check: 'validator: a key from the feature list', competitor_feature_values_value_check: 'validator: yes / no / partial / unknown / not_mentioned',
  competitor_feature_values_note_check: 'validator: at most 300 characters', competitor_feature_values_quote_check: 'validator: at most 200 (QUOTE_MAX; the table allows 2000)',
  competitor_feature_values_source_url_check: 'validator: an http(s) address', competitor_feature_values_country_code_check: 'importer: every-country answers (country null)',
  // competitor_feature_checks
  competitor_feature_checks_competitor_id_fkey: 'importer: checks only for competitors it added or matched', competitor_feature_checks_country_code_check: "importer: '' (every country)",
  competitor_feature_checks_feature_key_check: 'validator: the answer\'s key', competitor_feature_checks_pages_checked_check: 'importer: an object { pages, helpCentre, checkedAt }',
  // data_imports
  data_imports_file_path_check: 'importer: a registered path', data_imports_result_check: "importer: 'ok' or 'error'", data_imports_sha256_check: 'importer: sha256 hex of the file',
}
