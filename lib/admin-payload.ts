// lib/admin-payload.ts — admin-speed-1 (16 November 2026, docs/admin-speed-1-report.md): WHAT GET /api/admin RETURNS, BUILT
// IN PARALLEL. Server only (service role); app/api/admin/route.ts calls it AFTER verifyAdmin and nothing else may.
//
// ⛔ IT USED TO TAKE ~15 SECONDS on a cold instance: after the plan catalogue it read every priced country's settings ONE BY
// ONE (208 sequential queries since the 210-country rollout), and every other read waited for the one before it. Now:
//   1. trucks, operators and the plan catalogue are read at the same time;
//   2. every country the screen quotes is read in ONE query (getCountrySettingsMany): the marketing country and the trucks'
//      countries are FATAL (500, as before — the matrix must never render guessed figures), every other priced country is
//      BEST EFFORT (left out, so the plans table shows "—", as before).
// 🔴 THE PAYLOAD IS UNCHANGED, key for key and in the same order (the report diffs it). scripts/admin-speed-1.cjs fails if a
// per-country loop or a pile of sequential reads comes back.
import { getPlanCatalog } from '@/lib/plans-server'
import type { PlanCatalog } from '@/lib/plans'
import { getCountrySettingsMany } from '@/lib/country-settings'
import type { CountrySettings } from '@/lib/country-settings-types'
import { MARKETING_COUNTRY } from '@/lib/marketing-country'

/** The shared service-role client (lib/supabase.ts), imported lazily like lib/country-settings.ts does, so this module loads
 *  without a database (scripts/admin-speed-1.cjs runs it against a fake one). */
async function db() { return (await import('@/lib/supabase')).supabase }

/** A failure the route answers with this status and message (the same two 500s as before). */
export class AdminLoadError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** Optional step timer (the report's measurement); the route passes none. */
export type AdminStepTimer = (step: string, ms: number, note?: string) => void

const TRUCK_COLUMNS = 'id,name,slug,country,timezone,dashboard_token,plan,trial_expires_at,feature_overrides,active,auto_accept,contact_email,onboarded_at,operator_id,lifetime_discount_pct,lifetime_discount_note,hide_pricing,plan_price_override_minor,plan_price_override_until,plan_price_override_note,show_on_vf,show_on_hg,order_link_vf,order_link_hg,is_customer,excluded,custom_domain,custom_domain_verified_at,custom_domain_confirmed_at,custom_domain_setup_state,custom_domain_setup_started_at,custom_domain_last_checked_at,custom_domain_last_ok_at,custom_domain_last_seen_value'

async function step<T>(time: AdminStepTimer | undefined, name: string, f: () => Promise<T>, note?: (v: T) => string): Promise<T> {
  if (!time) return f()
  const t = performance.now()
  const v = await f()
  time(name, performance.now() - t, note?.(v))
  return v
}

/** The main payload: trucks, operators' signup codes, the country settings the screen quotes, the plan catalogue. */
export async function adminPayload(time?: AdminStepTimer): Promise<{
  trucks: Record<string, unknown>[]
  operators: { id: string; signup_promo_code: string | null }[]
  countrySettings: Record<string, CountrySettings>
  plans: PlanCatalog
}> {
  const t0 = performance.now()
  const supabase = await db()
  const [trucksRes, operators, plansRes] = await Promise.all([
    step(time, 'trucks', async () => supabase.from('trucks').select(TRUCK_COLUMNS).order('name'), r => `${r.data?.length ?? 0} rows`),
    // ── J3: THE SIGNUP PROMO CODE, KEYED BY OPERATOR — its own statement, error swallowed (the J1 tolerance): before
    // `operators.signup_promo_code` exists a named select over it fails with 42703, and that must not blank the console.
    step(time, 'operators', async () => {
      const { data, error } = await supabase.from('operators').select('id, signup_promo_code')
      if (error) { console.warn('[admin] signup_promo_code unavailable (migration not run?):', error.message); return [] }
      return (data ?? []) as { id: string; signup_promo_code: string | null }[]
    }, v => `${v.length} rows`),
    // ── THE PLAN CATALOGUE (plans-data-model Stage A), service role only. ⚠️ FATAL — reported after the countries below, in
    // the order the route always checked them.
    step(time, 'plan catalogue', async () => {
      try { return { ok: true as const, plans: await getPlanCatalog() } }
      catch (e) { return { ok: false as const, error: e } }
    }, v => (v.ok ? `${v.plans.plans.length} plans, ${v.plans.prices.length} prices` : 'failed')),
  ])
  const trucks = (trucksRes.data || []) as Record<string, unknown>[]
  // ── THE COUNTRY SETTINGS THIS SCREEN QUOTES, IN ONE QUERY — the marketing country's (the plan matrix) and every truck's own
  // (one truck's modal) are FATAL; every other country the catalogue PRICES (currency-registry: Ireland has prices and no
  // trucks) is BEST EFFORT, quoted only in the plans table, which shows "—" for one that cannot be read.
  const priced = plansRes.ok ? [...new Set(plansRes.plans.prices.map(p => p.countryCode))] : []
  let countrySettings: Record<string, CountrySettings>
  try {
    countrySettings = await step(time, 'country settings (all, one query)',
      () => getCountrySettingsMany([MARKETING_COUNTRY, ...trucks.map(t => t.country as string)], { bestEffort: priced }),
      v => `${Object.keys(v).length} countries`)
  } catch (e) {
    console.error('[admin] country settings read failed', e instanceof Error ? e.message : e)
    throw new AdminLoadError(500, 'Could not load country settings.')
  }
  if (!plansRes.ok) {
    console.error('[admin] plan catalogue read failed', plansRes.error instanceof Error ? plansRes.error.message : plansRes.error)
    throw new AdminLoadError(500, 'Could not load the plans.')
  }
  time?.('total (after verifyAdmin)', performance.now() - t0)
  return { trucks, operators, countrySettings, plans: plansRes.plans }
}

/** section=discovery: the discovery_trucks rows — only the fields the admin page reads (it never read visibility or
 *  exclude_reason). 268 rows on 16 Nov 2026, ~21 kB. */
export async function adminDiscovery(): Promise<{ discoveryTrucks: Record<string, unknown>[] }> {
  const supabase = await db()
  const { data } = await supabase
    .from('discovery_trucks')
    .select('id, name, hatchgrab_truck_id, show_on_vf, show_on_hg, excluded')
    .order('name')
  return { discoveryTrucks: data || [] }
}

/** section=demo_cleanup: the last demo-cleanup run, with its age computed on the server. Best effort: null, never a 500. */
export async function adminDemoCleanup(): Promise<{ lastRun: Record<string, unknown> | null }> {
  try {
    const supabase = await db()
    const { data } = await supabase
      .from('demo_cleanup_log')
      .select('run_at, ok, expired_deleted, orphans_deleted, error, gap_mins')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    // Age computed HERE, not in the client's render: Date.now() during render is impure, and the server clock is the better
    // reference anyway.
    const ageMins = data?.run_at ? Math.round((Date.now() - new Date(data.run_at as string).getTime()) / 60000) : null
    return { lastRun: data ? { ...data, ageMins } : null }
  } catch {
    return { lastRun: null }
  }
}
