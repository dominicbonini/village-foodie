// lib/comparison-publish-store-pg.ts — the publish step's reads and writes over ONE Postgres connection (compare-fix-2, 24 November
// 2026; docs/compare-fix-2-report.md). scripts/comparison-publish/main.ts runs the whole publish inside one transaction on this client:
// every country's verdict, mark, plan pointer and event is kept together or not at all, and `--dry-run` is the same run ending in a
// ROLLBACK. The same reads and writes as lib/comparison-publish-store.ts (Supabase REST) and, for the three reads runPublish makes of
// Admin's pricing store, the same selects as lib/admin/pricing-check-store.ts — rows come back as JSON (lib/pg-rows.ts selectJson), so
// the run sees exactly the values the REST client would give it.
//
// The pricing and check-admin stores here are READ-ONLY subsets for a run with skipFindings (the countries only): any other method —
// a finding's accept, which writes prices and answers — throws, and the transaction rolls back.
import type { PublishStore, PublishCountry } from '@/lib/comparison-publish-run'
import { COLUMNS, type PricingStore } from '@/lib/admin/pricing-check-actions'
import type { CheckAdminStore } from '@/lib/admin/competitor-check-actions'
import { ident, insertRows, refused, selectJson, updateRows, type PgLike } from '@/lib/pg-rows'

type Row = Record<string, unknown>
const COMPETITOR_COLS = ['check_urls', 'check_urls_by', 'check_failures'] as const
const MARK_TABLES = ['comparison_entries', 'competitor_plans', 'competitor_feature_values'] as const
/** As lib/admin/pricing-check-store.ts (its entry select once every migration has run, and VALUE_COLUMNS); scripts/compare-fix-2.cjs
 *  checks the two stay the same. */
export const ENTRY_COLUMNS = 'id, country_code, competitor_id, primary_plan_id, choose_when, sort_order, verified_at, verified_by, created_at, group_label, pinned, hidden, auto_verified_at, auto_blocked'
export const VALUE_COLUMNS = 'id, competitor_id, feature_key, country_code, value, note, quote, source_url, checked_on, verified_at, verified_by, superseded_at, created_at, auto_verified_at, auto_blocked'

export function pgPublishStore(c: PgLike): PublishStore {
  const run = async (what: string, sql: string, params: unknown[]) => { try { return await c.query(sql, params) } catch (e) { throw refused(what, e) } }
  return {
    async countries() {
      const rows = await selectJson(c, 'select country_code, currency, locale, enabled, comparison_status from public.country_settings')
      return rows.map(r => ({ code: String(r.country_code), currency: String(r.currency), locale: String(r.locale), enabled: r.enabled === true,
        comparisonStatus: String(r.comparison_status ?? 'off') })) as PublishCountry[]
    },
    async publishRows() { return selectJson(c, 'select * from public.comparison_publish') },
    async savePublish(code, cols) {
      await insertRows(c, 'comparison_publish', [{ country_code: code, ...cols }], { onConflict: { target: ['country_code'], update: 'all' } })
    },
    async pendingFindings() { return selectJson(c, "select * from public.competitor_check_findings where review_status = 'pending' order by id") },
    async priceEvidence() {
      return selectJson(c, `select competitor_id, country_code, plan_id, found, created_at from public.competitor_check_findings
        where field = 'monthly_price' and second_check = 'confirmed' and quote_in_page = true and review_status <> 'rejected' order by id`)
    },
    async noteFinding(id, reason) {
      await run('note finding', "update public.competitor_check_findings set auto_reason = $2 where id = $1 and review_status = 'pending'", [id, reason.slice(0, 2000)])
    },
    async rejectFinding(id, reason, at) {
      await run('reject finding', `update public.competitor_check_findings set review_status = 'rejected', reviewed_by = null, reviewed_at = $3, auto_reviewed = true, auto_reason = $2
        where id = $1 and review_status = 'pending'`, [id, reason.slice(0, 2000), at])
    },
    async markAccepted(id, reason) {
      await run('mark finding', 'update public.competitor_check_findings set auto_reviewed = true, auto_reason = $2 where id = $1', [id, reason.slice(0, 2000)])
    },
    async setAutoVerified(table, ids, at) {
      if (!(MARK_TABLES as readonly string[]).includes(table)) throw new Error(`[comparison-publish-store-pg] refused table: ${table}`)
      if (ids.length) await run(`mark ${table}`, `update public.${ident(table)} set auto_verified_at = $2 where id = any($1::uuid[])`, [ids, at])
    },
    async setCompetitor(id, cols) {
      const bad = Object.keys(cols).filter(k => !(COMPETITOR_COLS as readonly string[]).includes(k))
      if (bad.length) throw new Error(`[comparison-publish-store-pg] refused competitor columns: ${bad.join(', ')}`)
      await updateRows(c, 'competitors', cols, { id })
    },
    async featureChecks() {
      return selectJson(c, 'select competitor_id, checked_on, pages_checked from public.competitor_feature_checks where pages_checked is not null order by competitor_id, feature_key, country_code')
    },
    async addEvents(rows, at) {
      await insertRows(c, 'comparison_publish_events', rows.map(r => ({ ...r, at, detail: r.detail.slice(0, 2000) })))
    },
    async setEntryPlan(entryId, planId) {
      await run('point the entry at its plan', 'update public.comparison_entries set primary_plan_id = $2 where id = $1', [entryId, planId])
    },
  }
}

const refuse = (store: string) => (name: string) => () => { throw new Error(`[comparison-publish-store-pg] ${store}.${name} is not available to the publish step on its own (countries only)`) }
/** The three reads runPublish makes of Admin's pricing store (lib/admin/pricing-check-store.ts's selects); everything else refuses. */
export function pgPricingReads(c: PgLike): PricingStore {
  const reads: Partial<PricingStore> = {
    async listAll() {
      const [competitors, plans, benchmarks] = [
        await selectJson(c, `select ${COLUMNS.competitors} from public.competitors order by name`),
        await selectJson(c, `select ${COLUMNS.plans} from public.competitor_plans order by created_at`),
        await selectJson(c, `select ${COLUMNS.benchmarks} from public.country_benchmarks order by created_at`),
      ]
      return { competitors, plans, benchmarks }
    },
    async listEntries() { return selectJson(c, `select ${ENTRY_COLUMNS} from public.comparison_entries order by sort_order`) },
    async featureValues() { return selectJson(c, `select ${VALUE_COLUMNS} from public.competitor_feature_values where superseded_at is null order by id`) },
  }
  const no = refuse('pricing')
  return new Proxy(reads, { get: (t, k) => (k in t ? (t as Row)[k as string] : typeof k === 'string' && k !== 'then' ? no(k) : undefined) }) as PricingStore
}
/** runPublish reaches the check-admin store only to accept findings — never with skipFindings; every method refuses. */
export function noCheckStore(): CheckAdminStore {
  const no = refuse('checks')
  return new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k !== 'then' ? no(k) : undefined) }) as CheckAdminStore
}
