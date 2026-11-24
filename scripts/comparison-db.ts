// scripts/comparison-db.ts — the ONE database connection of the comparison entry points (compare-fix-2, 24 November 2026;
// docs/compare-fix-2-report.md): scripts/data-import/main.ts and scripts/comparison-publish/main.ts.
//
// 🔴 The connection string is read EXACTLY as scripts/db-migrate.cjs reads it — by calling that script's own dbUrl() (SUPABASE_DB_URL
// from .env.local, nothing else in the file is read or kept), or, in GitHub Actions where there is no .env.local, from the
// SUPABASE_DB_URL secret. It is never printed: every message that leaves here goes through db-migrate.cjs's scrub(). The pg driver is
// db-migrate.cjs's loadPg() (run through `npx -y -p pg@8.13.1 …`).
import { createRequire } from 'node:module'
import path from 'node:path'
import type { PgLike } from '@/lib/pg-rows'

interface PgClient extends PgLike { connect(): Promise<void>; end(): Promise<void>; on(ev: 'notice', fn: (n: { message: string }) => void): void }
interface Migrate {
  dbUrl(): string
  scrub(msg: unknown, url: string): string
  loadPg(): { Client: new (o: Record<string, unknown>) => PgClient }
  withoutSslmode(url: string): string
}

export interface ComparisonDb { client: PgClient; scrub: (msg: unknown) => string; close: () => Promise<void> }

export async function connectComparisonDb(app: string, log: (line: string) => void): Promise<ComparisonDb> {
  const m = createRequire(path.join(process.cwd(), 'package.json'))('./scripts/db-migrate.cjs') as Migrate
  const url = process.env.SUPABASE_DB_URL || m.dbUrl()
  const scrub = (msg: unknown) => m.scrub(msg instanceof Error ? msg.message : String(msg), url)
  const { Client } = m.loadPg()
  const client = new Client({ connectionString: m.withoutSslmode(url), ssl: { rejectUnauthorized: false }, application_name: `${app} (compare-fix-2)` })
  client.on('notice', n => log(`  notice: ${scrub(n.message)}`))
  try { await client.connect() } catch (e) { throw new Error(`could not connect: ${scrub(e)}`) }
  await client.query("set statement_timeout = '120s'")
  await client.query("set lock_timeout = '10s'")
  return { client, scrub, close: async () => { try { await client.end() } catch { /* closed */ } } }
}

/** The comparison tables' row counts (and what an import must never leave behind) — printed before, inside and after a dry run. */
export async function comparisonTally(c: PgLike): Promise<Record<string, number>> {
  const r = await c.query(`select
     (select count(*) from public.competitors)::int as competitors,
     (select count(*) from public.competitors where lifecycle = 'active')::int as active_competitors,
     (select count(*) from public.competitor_plans)::int as plans,
     (select count(*) from public.competitor_plans where superseded_at is null)::int as current_plans,
     (select count(*) from public.comparison_entries)::int as entries,
     (select count(*) from public.competitor_feature_values)::int as answers,
     (select count(*) from public.competitor_feature_values where superseded_at is null)::int as current_answers,
     (select count(*) from public.competitor_feature_values where superseded_at = '9999-12-31T00:00:00Z')::int as pending_answers,
     (select count(*) from (select distinct competitor_id, feature_key, coalesce(country_code, '') cc from public.competitor_feature_values s
        where not exists (select 1 from public.competitor_feature_values v where v.competitor_id = s.competitor_id and v.feature_key = s.feature_key
          and coalesce(v.country_code, '') = coalesce(s.country_code, '') and v.superseded_at is null)) x)::int as pairs_without_current,
     (select count(*) from public.competitor_feature_checks)::int as feature_checks,
     (select count(*) from public.data_imports)::int as data_imports,
     (select count(*) from public.comparison_publish where auto_live)::int as live_countries,
     (select count(*) from public.comparison_publish_events)::int as publish_events,
     (select count(*) from public.comparison_entries where auto_verified_at is not null)::int as marked_entries`)
  return r.rows[0] as Record<string, number>
}
/** What changed between two tallies (only the counts that moved). */
export function tallyDiff(a: Record<string, number>, b: Record<string, number>): string {
  const d = Object.keys(b).filter(k => a[k] !== b[k]).map(k => `${k} ${a[k]} → ${b[k]} (${b[k] - a[k] >= 0 ? '+' : ''}${b[k] - a[k]})`)
  return d.length ? d.join('; ') : 'no change'
}
