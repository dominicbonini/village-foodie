// lib/data-import/store-supabase.ts — the data importer's database access (competitor-check-2, 29 October 2026). SERVICE
// ROLE. Built by scripts/data-import/main.ts from the secrets NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// Writes competitors, competitor_plans, comparison_entries (the pricing check's tables) and public.data_imports — never a
// verification (lib/data-import/research.ts clears it on every row it writes).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImportRecord, ImportStore } from './importer'

type Row = Record<string, unknown>
const COMPETITOR_COLS = 'id, name, website, lifecycle, added_as_candidate, notes, focus, payment_providers, features_checked_on'   // comparison-features-1: the retired feature columns are not read
const missing = (e: { message: string; code?: string }) => e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message)
/** The database's own words (and its constraint name), so the recorded reason says exactly what was refused. */
const fail = (what: string, e: { message: string; details?: string | null }): never => { throw new Error(`${what} refused by the database: ${e.message}${e.details ? ` (${e.details})` : ''}`) }

export function supabaseImportStore(db: SupabaseClient): ImportStore {
  return {
    async imports() {
      const { data, error } = await db.from('data_imports').select('file_path, sha256, imported_at, result, counts, message').order('imported_at', { ascending: false }).limit(500)
      if (error) { if (missing(error)) return null; fail('read data_imports', error) }
      return (data ?? []) as ImportRecord[]
    },
    async recordImport(row) {
      const { error } = await db.from('data_imports').insert(row)
      if (error) fail('record the import', error)
    },
    async competitors() {
      const { data, error } = await db.from('competitors').select(COMPETITOR_COLS)
      if (error) fail('read competitors', error)
      return (data ?? []) as unknown as Row[]
    },
    async plans() {
      const { data, error } = await db.from('competitor_plans').select('id, competitor_id, country_code, plan_name, superseded_at')
      if (error) fail('read plans', error)
      return (data ?? []) as Row[]
    },
    async entries() {
      const { data, error } = await db.from('comparison_entries').select('id, country_code, competitor_id')
      if (error) fail('read comparison entries', error)
      return (data ?? []) as Row[]
    },
    async insertCompetitor(row) {
      const { error } = await db.from('competitors').insert(row)
      if (error) fail(`add competitor "${row.name}"`, error)
    },
    async updateCompetitor(id, cols) {
      const { error } = await db.from('competitors').update(cols).eq('id', id)
      if (error) fail(`update competitor ${id}`, error)
    },
    // One request each: PostgREST inserts a request's rows in one statement, so a refused plan writes none of them.
    async insertPlans(rows) {
      const { error } = await db.from('competitor_plans').insert(rows)
      if (error) fail(`add ${rows.length} plan(s)`, error)
    },
    // comparison-features-1 (20261047): the answers and the master list. A missing table reads as none.
    async featureValues() {
      const out: Row[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from('competitor_feature_values').select('id, competitor_id, feature_key, country_code, value, note, source_url, superseded_at').is('superseded_at', null).order('id').range(from, from + 999)
        if (error) { if (missing(error)) return []; fail('read feature answers', error) }
        out.push(...((data ?? []) as Row[]))
        if ((data ?? []).length < 1000) return out
      }
    },
    async insertFeatureValues(rows) {
      for (let i = 0; i < rows.length; i += 500) { const { error } = await db.from('competitor_feature_values').insert(rows.slice(i, i + 500)); if (error) fail(`add ${rows.length} feature answer(s)`, error) }
    },
    async supersedeFeatureValues(ids, at) {
      const { error } = await db.from('competitor_feature_values').update({ superseded_at: at }).in('id', ids).is('superseded_at', null)
      if (error) fail('supersede placeholder answers', error)
    },
    async features() {
      const { data, error } = await db.from('comparison_features').select('key, checked')
      if (error) { if (missing(error)) return null; fail('read the feature list', error) }
      return (data ?? []) as Row[]
    },
    async insertFeatures(rows) {
      const { error } = await db.from('comparison_features').insert(rows)
      if (error) fail(`add ${rows.length} feature(s)`, error)
    },
    async markFeatureDue(key, today) {
      // An 'unknown' answer for every active competitor without one, and every active competitor due.
      const [c, v] = await Promise.all([
        db.from('competitors').select('id, next_check_at').eq('lifecycle', 'active'),
        db.from('competitor_feature_values').select('competitor_id').eq('feature_key', key).is('country_code', null).is('superseded_at', null),
      ])
      if (c.error) fail('read competitors', c.error)
      if (v.error) fail('read feature answers', v.error)
      const have = new Set(((v.data ?? []) as Row[]).map(r => String(r.competitor_id)))
      const active = (c.data ?? []) as { id: string; next_check_at: string | null }[]
      const rows = active.filter(x => !have.has(x.id)).map(x => ({ competitor_id: x.id, feature_key: key, country_code: null, value: 'unknown' }))
      for (let i = 0; i < rows.length; i += 500) { const { error } = await db.from('competitor_feature_values').insert(rows.slice(i, i + 500)); if (error) fail('mark the feature due', error) }
      const due = active.filter(x => !x.next_check_at || x.next_check_at > today).map(x => x.id)
      for (let i = 0; i < due.length; i += 200) { const { error } = await db.from('competitors').update({ next_check_at: today }).in('id', due.slice(i, i + 200)); if (error) fail('mark competitors due', error) }
      return rows.length
    },
    async insertEntries(rows) {
      const { error } = await db.from('comparison_entries').insert(rows)
      if (error) fail(`add ${rows.length} comparison entr${rows.length === 1 ? 'y' : 'ies'}`, error)
    },
  }
}
