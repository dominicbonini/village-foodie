// lib/admin/competitor-check-store.ts — Admin › Automatic checks' database access (competitor-check-1, 25 October 2026).
// SERVICE ROLE, SERVER ONLY. Implements CheckAdminStore (lib/admin/competitor-check-actions.ts) against the three
// competitor_check_* tables and the competitors' scheduling/lifecycle columns (20261043). Missing tables → settings() null,
// and the tab says to run the migration.
import 'server-only'
import type { CheckAdminStore } from '@/lib/admin/competitor-check-actions'

type Row = Record<string, unknown>
const db = async () => (await import('@/lib/supabase')).supabase
const missing = (e: { message: string; code?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || /does not exist|schema cache/i.test(e.message))
const fail = (what: string, e: { message: string }): never => { throw new Error(`[competitor-check-store] ${what}: ${e.message}`) }
/** The admin's competitor writes on this tab — never a price, a feature value or a verification (those go through the
 *  Pricing check store, in acceptFinding). */
const ADMIN_COLS = ['check_requested_at', 'check_urls', 'check_interval_days', 'lifecycle', 'focus'] as const
const COMPETITOR_COLS = 'id, name, website, lifecycle, added_as_candidate, check_urls, check_interval_days, next_check_at, last_checked_at, deep_checked_at, check_requested_at, features_verified_at, notes'

export const serviceCheckStore: CheckAdminStore = {
  async settings() {
    const { data, error } = await (await db()).from('competitor_check_settings').select('*').eq('id', true).maybeSingle()
    if (error) { if (missing(error)) return null; fail('read settings', error) }
    return (data as Row) ?? null
  },
  async updateSettings(cols) {
    const { data, error } = await (await db()).from('competitor_check_settings').update(cols).eq('id', true).select('*').single()
    if (error) fail('save settings', error)
    return data as Row
  },
  async runs(limit) {
    const { data, error } = await (await db()).from('competitor_check_runs').select('*').order('started_at', { ascending: false }).limit(limit)
    if (error) { if (missing(error)) return []; fail('read runs', error) }
    return (data ?? []) as Row[]
  },
  async findings(limit) {
    // Every pending one, and the most recent reviewed ones for the "All" chip.
    const s = await db()
    const [p, r] = await Promise.all([
      s.from('competitor_check_findings').select('*').eq('review_status', 'pending').order('created_at', { ascending: false }).limit(2000),
      s.from('competitor_check_findings').select('*').neq('review_status', 'pending').order('created_at', { ascending: false }).limit(limit),
    ])
    for (const x of [p, r]) if (x.error) { if (missing(x.error)) return []; fail('read findings', x.error) }
    return [...(p.data ?? []), ...(r.data ?? [])] as Row[]
  },
  async getFinding(id) {
    const { data, error } = await (await db()).from('competitor_check_findings').select('*').eq('id', id).maybeSingle()
    if (error) fail('read finding', error)
    return (data as Row) ?? null
  },
  async reviewFinding(id, cols) {
    const { data, error } = await (await db()).from('competitor_check_findings').update(cols).eq('id', id).eq('review_status', 'pending').select('*')
    if (error) fail('review finding', error)
    return ((data ?? []) as Row[])[0] ?? null
  },
  async competitors() {
    const { data, error } = await (await db()).from('competitors').select(COMPETITOR_COLS).order('name')
    if (error) { if (missing(error)) return []; fail('read competitors', error) }
    return (data ?? []) as unknown as Row[]
  },
  async updateCompetitor(id, cols) {
    const bad = Object.keys(cols).filter(k => !(ADMIN_COLS as readonly string[]).includes(k))
    if (bad.length) throw new Error(`[competitor-check-store] refused columns: ${bad.join(', ')}`)
    const { data, error } = await (await db()).from('competitors').update(cols).eq('id', id).select('id')
    if (error) fail('save competitor', error)
    return ((data ?? []) as Row[])[0] ?? null
  },
  async setAllIntervals(days) {
    const { error } = await (await db()).from('competitors').update({ check_interval_days: days }).neq('check_interval_days', days)
    if (error) fail('save intervals', error)
  },
  async touchPlanChecked(id, date) {
    const { data, error } = await (await db()).from('competitor_plans').update({ checked_on: date }).eq('id', id).is('superseded_at', null).select('id')
    if (error) fail('save checked date', error)
    return (data ?? []).length === 1
  },
  // competitor-check-2: read only — the Deep check picker and the default queue.
  async countries() {
    const s = await db()
    let r = await s.from('country_settings').select('country_code, name, enabled, comparison_status')
    if (r.error && missing(r.error)) r = await s.from('country_settings').select('country_code, name, enabled') as typeof r   // before 20261042
    if (r.error) fail('read countries', r.error)
    return ((r.data ?? []) as Row[]).map(c => ({ code: String(c.country_code), name: String(c.name ?? c.country_code), enabled: c.enabled === true, comparisonStatus: (c.comparison_status as string | null) ?? null }))
  },
  async planCountries() {
    const { data, error } = await (await db()).from('competitor_plans').select('competitor_id, country_code').is('superseded_at', null)
    if (error) { if (missing(error)) return []; fail('read plan countries', error) }
    return (data ?? []) as { competitor_id: string; country_code: string }[]
  },
}
