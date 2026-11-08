// lib/comparison-publish-store.ts — the automatic publishing run's reads and writes (compare-autopublish-1, 7 November 2026), over a given
// Supabase client: the checker's own service-role client in GitHub Actions (scripts/competitor-check/main.ts). Writes only:
// comparison_publish, comparison_publish_events, the auto_verified_at marks, competitor_check_findings' automatic review, and
// competitors.check_urls / check_urls_by / check_failures. Prices, answers and classifications change only through acceptFinding.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublishStore, PublishCountry } from '@/lib/comparison-publish-run'

type Row = Record<string, unknown>
const fail = (what: string, e: { message: string }): never => { throw new Error(`[comparison-publish-store] ${what}: ${e.message}`) }
const COMPETITOR_COLS = ['check_urls', 'check_urls_by', 'check_failures'] as const

/** Every row of a select, 1,000 at a time. */
async function paged(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, what: string): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999)
    if (error) fail(what, error)
    out.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) return out
  }
}

export function supabasePublishStore(db: SupabaseClient): PublishStore {
  return {
    async countries() {
      const { data, error } = await db.from('country_settings').select('country_code, currency, locale, enabled, comparison_status')
      if (error) fail('read countries', error)
      return ((data ?? []) as Row[]).map(r => ({ code: String(r.country_code), currency: String(r.currency), locale: String(r.locale), enabled: r.enabled === true,
        comparisonStatus: String(r.comparison_status ?? 'off') })) as PublishCountry[]
    },
    async publishRows() {
      const { data, error } = await db.from('comparison_publish').select('*')
      if (error) fail('read comparison_publish', error)
      return (data ?? []) as Row[]
    },
    async savePublish(code, cols) {
      const { error } = await db.from('comparison_publish').upsert({ country_code: code, ...cols }, { onConflict: 'country_code' })
      if (error) fail('save comparison_publish', error)
    },
    async pendingFindings() {
      return paged((a, b) => db.from('competitor_check_findings').select('*').eq('review_status', 'pending').order('id').range(a, b), 'read pending findings')
    },
    async priceEvidence() {
      return paged((a, b) => db.from('competitor_check_findings').select('competitor_id, country_code, plan_id, found, created_at').eq('field', 'monthly_price')
        .eq('second_check', 'confirmed').eq('quote_in_page', true).neq('review_status', 'rejected').order('id').range(a, b), 'read price evidence')
    },
    async noteFinding(id, reason) {
      const { error } = await db.from('competitor_check_findings').update({ auto_reason: reason.slice(0, 2000) }).eq('id', id).eq('review_status', 'pending')
      if (error) fail('note finding', error)
    },
    async rejectFinding(id, reason, at) {
      const { error } = await db.from('competitor_check_findings').update({ review_status: 'rejected', reviewed_by: null, reviewed_at: at, auto_reviewed: true, auto_reason: reason.slice(0, 2000) })
        .eq('id', id).eq('review_status', 'pending')
      if (error) fail('reject finding', error)
    },
    async markAccepted(id, reason) {
      const { error } = await db.from('competitor_check_findings').update({ auto_reviewed: true, auto_reason: reason.slice(0, 2000) }).eq('id', id)
      if (error) fail('mark finding', error)
    },
    async setAutoVerified(table, ids, at) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await db.from(table).update({ auto_verified_at: at }).in('id', ids.slice(i, i + 200))
        if (error) fail(`mark ${table}`, error)
      }
    },
    async setCompetitor(id, cols) {
      const bad = Object.keys(cols).filter(k => !(COMPETITOR_COLS as readonly string[]).includes(k))
      if (bad.length) throw new Error(`[comparison-publish-store] refused competitor columns: ${bad.join(', ')}`)
      const { error } = await db.from('competitors').update(cols).eq('id', id)
      if (error) fail('save competitor', error)
    },
    async featureChecks() {
      return paged((a, b) => db.from('competitor_feature_checks').select('competitor_id, checked_on, pages_checked').not('pages_checked', 'is', null).order('competitor_id').order('feature_key').order('country_code').range(a, b), 'read feature checks')
    },
    async addEvents(rows, at) {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from('comparison_publish_events').insert(rows.slice(i, i + 500).map(r => ({ ...r, at, detail: r.detail.slice(0, 2000) })))
        if (error) fail('save events', error)
      }
    },
  }
}
