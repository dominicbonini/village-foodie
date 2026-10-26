// lib/admin/pricing-check-store.ts — the admin Pricing check page's database access. SERVICE ROLE, SERVER ONLY.
//
// Implements PricingStore (lib/admin/pricing-check-actions.ts) against public.competitors, public.competitor_plans and
// public.country_benchmarks (supabase/migrations/20261039_pricing_check.sql: RLS on, no policies, service role only).
// "Current" is superseded_at IS NULL; every supersede carries that condition in its WHERE clause, so a write that lost
// a race changes nothing.

import 'server-only'
import type { PricingStore } from '@/lib/admin/pricing-check-actions'
import { COLUMNS } from '@/lib/admin/pricing-check-actions'

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
const ENTRY_COLUMNS = 'id, country_code, competitor_id, primary_plan_id, choose_when, sort_order, verified_at, verified_by, created_at'

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
    const { data, error } = await (await db()).from('comparison_entries').select(ENTRY_COLUMNS).order('sort_order')
    if (error) { if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) return []; fail('read comparison entries', error) }
    return (data ?? []) as unknown as Row[]
  },
  async insertEntry(row) {
    const { data, error } = await (await db()).from('comparison_entries').insert(row).select(ENTRY_COLUMNS).single()
    if (error) fail('add comparison entry', error)
    return data as unknown as Row
  },
  async updateEntry(id, cols) {
    const { data, error } = await (await db()).from('comparison_entries').update(cols).eq('id', id).select(ENTRY_COLUMNS)
    if (error) fail('save comparison entry', error)
    const rows = (data ?? []) as unknown as Row[]
    return rows.length === 1 ? rows[0] : null
  },
  async deleteEntry(id) {
    const { error } = await (await db()).from('comparison_entries').delete().eq('id', id)
    if (error) fail('remove comparison entry', error)
  },
  async existingIds(table, ids) {
    if (!ids.length) return []
    const { data, error } = await (await db()).from(table === 'entries' ? 'comparison_entries' : TABLE[table]).select('id').in('id', ids)
    if (error) fail(`read ${table}`, error)
    return ((data ?? []) as { id: string }[]).map(r => r.id)
  },
}
