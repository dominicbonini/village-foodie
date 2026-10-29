// lib/admin/pricing-check-store.ts — the admin Pricing check page's database access. SERVICE ROLE, SERVER ONLY.
//
// Implements PricingStore (lib/admin/pricing-check-actions.ts) against public.competitors, public.competitor_plans and
// public.country_benchmarks (supabase/migrations/20261039_pricing_check.sql: RLS on, no policies, service role only).
// "Current" is superseded_at IS NULL; every supersede carries that condition in its WHERE clause, so a write that lost
// a race changes nothing.

import 'server-only'
import type { PricingStore } from '@/lib/admin/pricing-check-actions'
import { COLUMNS } from '@/lib/admin/pricing-check-actions'
import type { ImportRecord } from '@/lib/data-import/importer'

type Row = Record<string, unknown>
const db = async () => (await import('@/lib/supabase')).supabase
const TABLE = { competitors: 'competitors', plans: 'competitor_plans', benchmarks: 'country_benchmarks' } as const

/** The tables are not there yet — the migration has not been run. The page says so instead of failing. */
export class TablesMissing extends Error {}
function fail(what: string, error: { message: string; code?: string }): never {
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) throw new TablesMissing(error.message)
  throw new Error(`[pricing-check-store] ${what}: ${error.message}`)
}

async function count(table: string, filter?: (q: any) => any): Promise<number> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = (await db()).from(table).select('id', { count: 'exact', head: true })
  if (filter) q = filter(q)
  const { count: n, error } = await q
  if (error) fail(`count ${table}`, error)
  return n ?? 0
}

/** compare-de-1: a column 20261042 adds is not there yet (42703 undefined column). */
const missingColumn = (error: { message: string; code?: string } | null) => !!error && (error.code === '42703' || /column .* does not exist/i.test(error.message))
/** compare-de-1 / competitor-check-1: a competitors read with every column, falling back to the select before 20261043,
 *  then to the one before 20261042 — so the tab works whichever migrations have run. */
async function readCompetitors(build: (cols: string) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>) {
  let r = await build(COLUMNS.competitors)
  if (missingColumn(r.error)) r = await build(COLUMNS.competitorsNoCheck)
  return missingColumn(r.error) ? build(COLUMNS.competitorsLegacy) : r
}
/** competitor-check-2: public.data_imports (20261045), for the tab's read-only import lines; null while it is not there. */
export async function readDataImports(): Promise<ImportRecord[] | null> {
  const { data, error } = await (await db()).from('data_imports').select('file_path, sha256, imported_at, result, counts, message').order('imported_at', { ascending: false }).limit(200)
  if (error) { if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) return null; fail('read data_imports', error) }
  return (data ?? []) as ImportRecord[]
}
/** comparison-features-1 (20261047). */
const FEATURE_COLUMNS = 'key, group_key, sort_order, checked, show_scope, show_countries, hatchgrab_source, labels, explanations, updated_at'
const VALUE_COLUMNS = 'id, competitor_id, feature_key, country_code, value, note, quote, source_url, checked_on, verified_at, verified_by, superseded_at, created_at'
const tableMissing = (error: { message: string; code?: string }) => error.code === '42P01' || error.code === 'PGRST205' || /relation .* does not exist|schema cache/i.test(error.message)
const ENTRY_COLUMNS_BASE = 'id, country_code, competitor_id, primary_plan_id, choose_when, sort_order, verified_at, verified_by, created_at'
/** global-players-1: group_label (20261046), falling back to the select before it runs. */
async function entryCols<R extends { error: { message: string; code?: string } | null }>(build: (cols: string) => PromiseLike<R>): Promise<R> {
  const r = await build(`${ENTRY_COLUMNS_BASE}, group_label`)
  return missingColumn(r.error) ? build(ENTRY_COLUMNS_BASE) : r
}

export const servicePricingStore: PricingStore = {
  async counts() {
    const [competitors, plans, benchmarks, research] = await Promise.all([
      count(TABLE.competitors), count(TABLE.plans), count(TABLE.benchmarks),
      count(TABLE.plans, q => q.eq('source', 'research')),
    ])
    return { competitors, plans, benchmarks, research }
  },

  async listAll() {
    const s = await db()
    const [c, p, b] = await Promise.all([
      readCompetitors(cols => s.from(TABLE.competitors).select(cols).order('name')),
      s.from(TABLE.plans).select(COLUMNS.plans).order('created_at'),
      s.from(TABLE.benchmarks).select(COLUMNS.benchmarks).order('created_at'),
    ])
    for (const [what, r] of [['competitors', c], ['plans', p], ['benchmarks', b]] as const) if (r.error) fail(`read ${what}`, r.error)
    return { competitors: (c.data ?? []) as unknown as Row[], plans: (p.data ?? []) as unknown as Row[], benchmarks: (b.data ?? []) as unknown as Row[] }
  },

  async insertMany(table, rows) {
    const s = await db()
    // In chunks, so one request never carries the whole payload.
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await s.from(TABLE[table]).insert(rows.slice(i, i + 100))
      if (error) fail(`import ${table}`, error)
    }
    return rows.length
  },

  async getPlan(id) {
    const { data, error } = await (await db()).from(TABLE.plans).select(COLUMNS.plans).eq('id', id).maybeSingle()
    if (error) fail('read plan', error)
    return (data as unknown as Row) ?? null
  },

  async insertPlan(row) {
    const { data, error } = await (await db()).from(TABLE.plans).insert(row).select(COLUMNS.plans).single()
    if (error) fail('add plan', error)
    return data as unknown as Row
  },

  async supersedePlan(id, at) {
    const { data, error } = await (await db()).from(TABLE.plans).update({ superseded_at: at }).eq('id', id).is('superseded_at', null).select('id')
    if (error) fail('supersede plan', error)
    return (data ?? []).length === 1
  },

  async deletePlan(id) {
    const { error } = await (await db()).from(TABLE.plans).delete().eq('id', id)
    if (error) fail('take back plan', error)
  },

  async setPlanVerified(id, at, by) {
    const { data, error } = await (await db()).from(TABLE.plans).update({ verified_at: at, verified_by: by })
      .eq('id', id).is('superseded_at', null).select(COLUMNS.plans)
    if (error) fail('verify plan', error)
    const rows = (data ?? []) as unknown as Row[]
    return rows.length === 1 ? rows[0] : null
  },

  async getCompetitor(id) {
    const s = await db()
    const { data, error } = await readCompetitors(cols => s.from(TABLE.competitors).select(cols).eq('id', id).maybeSingle())
    if (error) fail('read competitor', error)
    return (data as unknown as Row) ?? null
  },

  async findCompetitorByName(name) {
    // ilike with the wildcards escaped = a case-insensitive equality (the unique index is on lower(btrim(name))).
    const s = await db()
    const { data, error } = await readCompetitors(cols => s.from(TABLE.competitors).select(cols).ilike('name', name.trim().replace(/[\\%_]/g, m => '\\' + m)).limit(1))
    if (error) fail('find competitor', error)
    return ((data ?? []) as unknown as Row[])[0] ?? null
  },

  async insertCompetitor(row) {
    const s = await db()
    const { data, error } = await readCompetitors(cols => s.from(TABLE.competitors).insert(row).select(cols).single())
    if (error) fail('add competitor', error)
    return data as unknown as Row
  },

  async updateCompetitor(id, cols) {
    const s = await db()
    const { data, error } = await readCompetitors(sel => s.from(TABLE.competitors).update(cols).eq('id', id).select(sel))
    if (error) fail('save competitor', error)
    const rows = (data ?? []) as unknown as Row[]
    return rows.length === 1 ? rows[0] : null
  },

  async currentBenchmark(code) {
    const { data, error } = await (await db()).from(TABLE.benchmarks).select(COLUMNS.benchmarks).eq('country_code', code).is('superseded_at', null).maybeSingle()
    if (error) fail('read country data', error)
    return (data as unknown as Row) ?? null
  },

  async supersedeBenchmark(id, at) {
    const { data, error } = await (await db()).from(TABLE.benchmarks).update({ superseded_at: at }).eq('id', id).is('superseded_at', null).select('id')
    if (error) fail('supersede country data', error)
    return (data ?? []).length === 1
  },

  async unsupersedeBenchmark(id) {
    const { error } = await (await db()).from(TABLE.benchmarks).update({ superseded_at: null }).eq('id', id)
    if (error) fail('restore country data', error)
  },

  async insertBenchmark(row) {
    const { data, error } = await (await db()).from(TABLE.benchmarks).insert(row).select(COLUMNS.benchmarks).single()
    if (error) fail('save country data', error)
    return data as unknown as Row
  },

  // ── compare-de-1: public.comparison_entries (20261042). Missing table → `entriesReady` false, and the page and the tab say so.
  async entriesReady() {
    const { error } = await (await db()).from('comparison_entries').select('id', { count: 'exact', head: true })
    if (!error) return true
    if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) return false
    fail('read comparison entries', error)
  },
  async listEntries() {
    const s = await db()
    const { data, error } = await entryCols(cols => s.from('comparison_entries').select(cols).order('sort_order'))
    if (error) { if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) return []; fail('read comparison entries', error) }
    return (data ?? []) as unknown as Row[]
  },
  async insertEntry(row) {
    const s = await db()
    const { data, error } = await entryCols(cols => s.from('comparison_entries').insert(row).select(cols).single())
    if (error) fail('add comparison entry', error)
    return data as unknown as Row
  },
  async updateEntry(id, cols) {
    const s = await db()
    const { data, error } = await entryCols(sel => s.from('comparison_entries').update(cols).eq('id', id).select(sel))
    if (error) fail('save comparison entry', error)
    const rows = (data ?? []) as unknown as Row[]
    return rows.length === 1 ? rows[0] : null
  },
  async deleteEntry(id) {
    const { error } = await (await db()).from('comparison_entries').delete().eq('id', id)
    if (error) fail('remove comparison entry', error)
  },
  // ── comparison-features-1: the master list and the answers (20261047). Missing tables → null / [] (the callers fall back).
  async features() {
    const { data, error } = await (await db()).from('comparison_features').select(FEATURE_COLUMNS)
    if (error) { if (tableMissing(error)) return null; fail('read features', error) }
    return (data ?? []) as unknown as Row[]
  },
  async insertFeature(row) {
    const { data, error } = await (await db()).from('comparison_features').insert(row).select(FEATURE_COLUMNS).single()
    if (error) fail('add feature', error)
    return data as unknown as Row
  },
  async updateFeature(key, cols) {
    const { data, error } = await (await db()).from('comparison_features').update(cols).eq('key', key).select(FEATURE_COLUMNS)
    if (error) fail('save feature', error)
    return ((data ?? []) as unknown as Row[])[0] ?? null
  },
  async featureValues() {
    // Paged: thousands of rows once every feature has a row per competitor.
    const s = await db(), out: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await s.from('competitor_feature_values').select(VALUE_COLUMNS).is('superseded_at', null).order('id').range(from, from + 999)
      if (error) { if (tableMissing(error)) return []; fail('read feature values', error) }
      out.push(...((data ?? []) as unknown as Row[]))
      if ((data ?? []).length < 1000) return out
    }
  },
  async getFeatureValue(id) {
    const { data, error } = await (await db()).from('competitor_feature_values').select(VALUE_COLUMNS).eq('id', id).maybeSingle()
    if (error) fail('read feature value', error)
    return (data as unknown as Row) ?? null
  },
  async insertFeatureValue(row) {
    const { data, error } = await (await db()).from('competitor_feature_values').insert(row).select(VALUE_COLUMNS).single()
    if (error) fail('add feature value', error)
    return data as unknown as Row
  },
  async supersedeFeatureValue(id, at) {
    const { data, error } = await (await db()).from('competitor_feature_values').update({ superseded_at: at }).eq('id', id).is('superseded_at', null).select('id')
    if (error) fail('supersede feature value', error)
    return (data ?? []).length === 1
  },
  async unsupersedeFeatureValue(id) {
    const { error } = await (await db()).from('competitor_feature_values').update({ superseded_at: null }).eq('id', id)
    if (error) fail('restore feature value', error)
  },
  async setFeatureValuesVerified(ids, at, by) {
    if (!ids.length) return 0
    const { data, error } = await (await db()).from('competitor_feature_values').update({ verified_at: at, verified_by: by }).in('id', ids).is('superseded_at', null).select('id')
    if (error) fail('verify feature values', error)
    return (data ?? []).length
  },
  async touchFeatureValueChecked(id, date) {
    const { data, error } = await (await db()).from('competitor_feature_values').update({ checked_on: date }).eq('id', id).is('superseded_at', null).select('id')
    if (error) fail('save checked date', error)
    return (data ?? []).length === 1
  },
  async markFeatureDue(key, today) {
    const s = await db()
    const [c, v] = await Promise.all([
      s.from('competitors').select('id, next_check_at').eq('lifecycle', 'active'),
      s.from('competitor_feature_values').select('competitor_id').eq('feature_key', key).is('country_code', null).is('superseded_at', null),
    ])
    if (c.error) fail('read competitors', c.error)
    if (v.error) fail('read feature values', v.error)
    const have = new Set(((v.data ?? []) as Row[]).map(r => String(r.competitor_id)))
    const active = (c.data ?? []) as { id: string; next_check_at: string | null }[]
    const rows = active.filter(x => !have.has(x.id)).map(x => ({ competitor_id: x.id, feature_key: key, country_code: null, value: 'unknown' }))
    for (let i = 0; i < rows.length; i += 500) { const { error } = await s.from('competitor_feature_values').insert(rows.slice(i, i + 500)); if (error) fail('mark feature due', error) }
    const due = active.filter(x => !x.next_check_at || x.next_check_at > today).map(x => x.id)
    for (let i = 0; i < due.length; i += 200) { const { error } = await s.from('competitors').update({ next_check_at: today }).in('id', due.slice(i, i + 200)); if (error) fail('mark competitors due', error) }
    return rows.length
  },
  async existingIds(table, ids) {
    if (!ids.length) return []
    const { data, error } = await (await db()).from(table === 'entries' ? 'comparison_entries' : TABLE[table]).select('id').in('id', ids)
    if (error) fail(`read ${table}`, error)
    return ((data ?? []) as { id: string }[]).map(r => r.id)
  },
}
