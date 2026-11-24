// lib/data-import/store-pg.ts — the data importer's database access over ONE Postgres connection (compare-fix-2, 24 November 2026;
// docs/compare-fix-2-report.md). scripts/data-import/main.ts runs each file inside one transaction on this client, so a file is
// imported all-or-nothing: on any error the transaction is rolled back and only the data_imports 'error' row is written (outside it).
// The same reads and writes as lib/data-import/store-supabase.ts, plus activateFeatureValues (new answers are written "pending" first,
// then the old ones superseded, then the new ones made current — see lib/data-import/research.ts).
import type { ImportRecord, ImportStore } from './importer'
import { insertRows, refused, selectJson, updateRows, type PgLike } from '@/lib/pg-rows'
import { PENDING_AT } from './research'

type Row = Record<string, unknown>

export function pgImportStore(c: PgLike): ImportStore {
  const run = async (what: string, sql: string, params: unknown[]) => { try { return await c.query(sql, params) } catch (e) { throw refused(what, e) } }
  return {
    async imports() {
      return await selectJson(c, 'select file_path, sha256, imported_at, result, counts, message from public.data_imports order by imported_at desc limit 500') as unknown as ImportRecord[]
    },
    async recordImport(row) {
      await run('record the import', 'insert into public.data_imports (file_path, sha256, imported_at, result, counts, message) values ($1, $2, $3, $4, $5::jsonb, $6)',
        [row.file_path, row.sha256, row.imported_at, row.result, JSON.stringify(row.counts ?? {}), row.message])
    },
    async competitors() {
      return selectJson(c, 'select id, name, website, lifecycle, added_as_candidate, notes, focus, payment_providers, features_checked_on, not_in_countries, check_failures from public.competitors')
    },
    async plans() {
      return selectJson(c, 'select id, competitor_id, country_code, plan_name, superseded_at from public.competitor_plans')
    },
    async entries() {
      return selectJson(c, 'select id, country_code, competitor_id from public.comparison_entries')
    },
    async insertCompetitor(row) { await insertRows(c, 'competitors', [row]) },
    async updateCompetitor(id, cols) { await updateRows(c, 'competitors', cols, { id }) },
    async insertPlans(rows) { await insertRows(c, 'competitor_plans', rows) },
    async featureValues() {
      return selectJson(c, `select id, competitor_id, feature_key, country_code, value, note, quote, source_url, superseded_at, verified_at, auto_blocked
        from public.competitor_feature_values where superseded_at is null`)
    },
    async insertFeatureValues(rows) { await insertRows(c, 'competitor_feature_values', rows) },
    async supersedeFeatureValues(ids, at) { if (ids.length) await run(`supersede ${ids.length} feature answer(s)`, 'update public.competitor_feature_values set superseded_at = $2 where id = any($1::uuid[]) and superseded_at is null', [ids, at]) },
    // only rows this import wrote "pending" (superseded_at = PENDING_AT) are made current
    async activateFeatureValues(ids) { if (ids.length) await run(`make ${ids.length} new feature answer(s) current`, 'update public.competitor_feature_values set superseded_at = null where id = any($1::uuid[]) and superseded_at = $2', [ids, PENDING_AT]) },
    async supersedePlans(ids, at) { if (ids.length) await run(`supersede ${ids.length} corrected plan(s)`, 'update public.competitor_plans set superseded_at = $2 where id = any($1::uuid[]) and superseded_at is null', [ids, at]) },
    async upsertFeatureChecks(rows) {
      await insertRows(c, 'competitor_feature_checks', rows, { onConflict: { target: ['competitor_id', 'feature_key', 'country_code'], update: 'all' } })
    },
    async features() {
      return selectJson(c, 'select key, checked, tier, checked_by, scope_by, updated_by from public.comparison_features')
    },
    async updateFeature(key, cols) { await updateRows(c, 'comparison_features', { ...cols, updated_at: new Date().toISOString() }, { key }) },
    async insertFeatures(rows) { await insertRows(c, 'comparison_features', rows) },
    async markFeatureDue(key, today) {
      // As lib/data-import/store-supabase.ts: an 'unknown' answer for every active competitor without one, and every active competitor due.
      const ins = await run('mark the feature due', `insert into public.competitor_feature_values (competitor_id, feature_key, country_code, value)
        select c.id, $1, null, 'unknown' from public.competitors c where c.lifecycle = 'active'
          and not exists (select 1 from public.competitor_feature_values v where v.competitor_id = c.id and v.feature_key = $1 and v.country_code is null and v.superseded_at is null)`, [key])
      await run('mark competitors due', `update public.competitors set next_check_at = $1 where lifecycle = 'active' and (next_check_at is null or next_check_at > $1)`, [today])
      return ins.rowCount ?? 0
    },
    async insertEntries(rows) { await insertRows(c, 'comparison_entries', rows) },
  } as ImportStore & Row
}
