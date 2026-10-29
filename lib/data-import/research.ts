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
import { hostOf, APP_STORE_HOSTS } from '@/lib/competitor-check/model'
import { COUNTRIES_MARK } from '@/lib/competitor-check/core'

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
  updateCompetitor(id: string, cols: Row): Promise<void>
  insertPlans(rows: Row[]): Promise<void>
  insertEntries(rows: Row[]): Promise<void>
}

export interface ResearchCounts {
  competitors: number; added: number; updated: number; upgraded: number
  plans: number; plansAdded: number; plansExisting: number
  entries: number; entriesAdded: number; entriesExisting: number
}

const TRI = ['yes', 'no', 'unknown']
const FEATURES = ['pre_orders', 'whatsapp', 'social_posts', 'own_domain', 'ios_app', 'android_app', 'capacity_slots', 'multi_location_schedule', 'kds', 'pay_at_truck']
const TEXTS = ['website', 'focus', 'payment_providers', 'payment_methods', 'min_term']
const FOCUS = ['food_truck', 'street_food_markets', 'nearest_local', 'pop_up', 'pos']
const NON_NEGATIVE = ['monthly_minor', 'setup_minor', 'truck_fee_bps', 'truck_fee_fixed_minor', 'customer_fee_bps', 'customer_fee_fixed_minor', 'card_bps', 'card_fixed_minor', 'included_orders', 'overage_fixed_minor']

const nameKey = (v: unknown) => String(v ?? '').trim().toLowerCase()
const planKey = (cid: unknown, cc: unknown, name: unknown) => `${cid}|${cc}|${nameKey(name)}`
/** The domain a competitor is matched on: its website's host without "www.", never an app store. */
const domainOf = (url: unknown) => { const h = hostOf(typeof url === 'string' ? url : null); return h && !(APP_STORE_HOSTS as readonly string[]).includes(h) ? h : null }

/** Every problem with the file, in plain words naming the row — empty when it can be imported. */
export function researchProblems(file: ResearchFile): string[] {
  if (!file || !Array.isArray(file.competitors) || !Array.isArray(file.plans) || !Array.isArray(file.entries) || !/^\d{4}-\d{2}-\d{2}$/.test(String(file.checked_on)))
    return ['The file is not in the expected shape (checked_on, competitors, plans, entries).']
  const out: string[] = []
  const names = new Map(file.competitors.map(c => [String(c.id), String(c.name)]))
  const planIds = new Set(file.plans.map(p => String(p.id)))
  for (const c of file.competitors) {
    const who = `Competitor "${c.name ?? c.id}"`
    if (!c.id || !String(c.name ?? '').trim()) out.push(`${who}: needs an id and a name.`)
    for (const f of FEATURES) if (c[f] != null && !TRI.includes(String(c[f]))) out.push(`${who}: ${f} must be yes, no or unknown (is "${c[f]}").`)
    if (c.focus != null && !FOCUS.includes(String(c.focus))) out.push(`${who}: focus "${c.focus}" is not one the table allows.`)
    if (c.features_verified_at) out.push(`${who}: arrives verified — research must arrive unverified.`)
    if (c.lifecycle != null && !['active', 'candidate'].includes(String(c.lifecycle))) out.push(`${who}: lifecycle must be active or candidate.`)
  }
  for (const p of file.plans) {
    const who = `Plan "${names.get(String(p.competitor_id)) ?? p.competitor_id} · ${p.plan_name}" (${p.country_code})`
    if (!names.has(String(p.competitor_id))) out.push(`${who}: its competitor is not in the file.`)
    if (!/^[A-Z]{2}$/.test(String(p.country_code))) out.push(`${who}: the country must be a two-letter code.`)
    if (!/^[A-Z]{3}$/.test(String(p.currency))) out.push(`${who}: the currency must be a three-letter code.`)
    if (!['counted', 'hidden', 'closed', 'excluded'].includes(String(p.status))) out.push(`${who}: status "${p.status}" is not counted, hidden, closed or excluded.`)
    if (p.status === 'counted' && p.monthly_minor == null) out.push(`${who}: status counted needs a monthly price — a price on request is status "hidden".`)
    if (p.status === 'counted' && p.price_hidden === true) out.push(`${who}: a hidden price can't be counted — status "hidden".`)
    for (const k of NON_NEGATIVE) if (p[k] != null && !(typeof p[k] === 'number' && (p[k] as number) >= 0)) out.push(`${who}: ${k} must be a number of 0 or more.`)
    if (p.order_cap != null && !(typeof p.order_cap === 'number' && p.order_cap > 0)) out.push(`${who}: order_cap must be above 0.`)
    if (p.card_mode != null && !['bundled', 'separate', 'unknown'].includes(String(p.card_mode))) out.push(`${who}: card_mode "${p.card_mode}" is not allowed.`)
    if (p.vat != null && !['incl', 'excl', 'unknown'].includes(String(p.vat))) out.push(`${who}: vat "${p.vat}" is not allowed.`)
    if (p.source !== 'research' || p.verified_at) out.push(`${who}: must be source research and unverified.`)
  }
  const pairs = new Set<string>()
  for (const e of file.entries) {
    const who = `Entry for "${names.get(String(e.competitor_id)) ?? e.competitor_id}" (${e.country_code})`
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
export async function importResearch(store: ResearchStore, file: ResearchFile, stamp: { today: string; path: string }): Promise<ResearchCounts> {
  const problems = researchProblems(file)
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
  try {
    for (const c of file.competitors) {
      const match = find(c)
      const fileCandidate = c.lifecycle === 'candidate'
      if (!match) {
        const { features_verified_at: _skip, ...row } = c   // eslint-disable-line @typescript-eslint/no-unused-vars
        // A candidate row has had no features checked: no checked date, and added_as_candidate (hidden until verified).
        await store.insertCompetitor({ ...row, ...(fileCandidate ? { added_as_candidate: true } : {}),
          features_checked_on: c.features_checked_on ?? (fileCandidate ? null : file.checked_on), features_verified_at: null })
        existing.push({ ...row, lifecycle: fileCandidate ? 'candidate' : 'active' })
        idOf.set(String(c.id), String(c.id)); counts.added++
        continue
      }
      idOf.set(String(c.id), String(match.id))
      const cols: Row = {}
      for (const f of FEATURES) if ((match[f] ?? 'unknown') === 'unknown' && c[f] != null && c[f] !== 'unknown') cols[f] = c[f]
      for (const f of TEXTS) if ((match[f] == null || match[f] === '') && c[f] != null && c[f] !== '') cols[f] = c[f]
      const checkedOn = String(c.features_checked_on ?? file.checked_on)
      if (Object.keys(cols).length && (!match.features_checked_on || String(match.features_checked_on) < checkedOn)) cols.features_checked_on = checkedOn
      if (match.lifecycle === 'candidate' && !fileCandidate) {
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
      if (Object.keys(cols).length) { await store.updateCompetitor(String(match.id), cols); Object.assign(match, cols); counts.updated++ }
    }
  } catch (e) { throw new Error(`Competitors: ${msg(e)} (already written: ${done()}; the next run carries on).`) }

  // ── plans: skip an id already in, or a current plan of the same name in the same country ──
  const plans = await store.plans()
  const ids = new Set(plans.map(p => String(p.id)))
  const current = new Map(plans.filter(p => p.superseded_at == null).map(p => [planKey(p.competitor_id, p.country_code, p.plan_name), String(p.id)]))
  const planIdOf = new Map<string, string>()
  const fresh: Row[] = []
  for (const p of file.plans) {
    const cid = idOf.get(String(p.competitor_id)) ?? String(p.competitor_id)
    const same = ids.has(String(p.id)) ? String(p.id) : current.get(planKey(cid, p.country_code, p.plan_name))
    if (same) { planIdOf.set(String(p.id), same); counts.plansExisting++; continue }
    planIdOf.set(String(p.id), String(p.id))
    fresh.push({ ...p, competitor_id: cid, verified_at: null, verified_by: null })
  }
  try { if (fresh.length) await store.insertPlans(fresh) } catch (e) { throw new Error(`Plans: ${msg(e)} (already written: ${done()}; the next run carries on).`) }
  counts.plansAdded = fresh.length

  // ── entries: skip an id already in, or one for the same country and competitor ──
  const entries = await store.entries()
  const entryIds = new Set(entries.map(e => String(e.id)))
  const pairs = new Set(entries.map(e => `${e.country_code}|${e.competitor_id}`))
  const newEntries: Row[] = []
  for (const e of file.entries) {
    const cid = idOf.get(String(e.competitor_id)) ?? String(e.competitor_id)
    if (entryIds.has(String(e.id)) || pairs.has(`${e.country_code}|${cid}`)) { counts.entriesExisting++; continue }
    newEntries.push({ ...e, competitor_id: cid, primary_plan_id: e.primary_plan_id ? planIdOf.get(String(e.primary_plan_id)) ?? null : null, verified_at: null, verified_by: null })
  }
  try { if (newEntries.length) await store.insertEntries(newEntries) } catch (e) { throw new Error(`Comparison entries: ${msg(e)} (already written: ${done()}; the next run carries on).`) }
  counts.entriesAdded = newEntries.length
  return counts
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
