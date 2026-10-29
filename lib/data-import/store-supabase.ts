// lib/data-import/store-supabase.ts — the data importer's database access (competitor-check-2, 29 October 2026). SERVICE
// ROLE. Built by scripts/data-import/main.ts from the secrets NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// Writes competitors, competitor_plans, comparison_entries (the pricing check's tables) and public.data_imports — never a
// verification (lib/data-import/research.ts clears it on every row it writes).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImportRecord, ImportStore } from './importer'

type Row = Record<string, unknown>
const COMPETITOR_COLS = 'id, name, website, lifecycle, added_as_candidate, notes, focus, payment_providers, payment_methods, min_term, features_checked_on, pre_orders, whatsapp, social_posts, own_domain, ios_app, android_app, capacity_slots, multi_location_schedule, kds, pay_at_truck'
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
    async insertEntries(rows) {
      const { error } = await db.from('comparison_entries').insert(rows)
      if (error) fail(`add ${rows.length} comparison entr${rows.length === 1 ? 'y' : 'ies'}`, error)
    },
  }
}
