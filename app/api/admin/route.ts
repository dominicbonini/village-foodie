// app/api/admin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'   // canonical admin check (shared with the /landing gate)
import { getPlanCatalog } from '@/lib/plans-server'
import { isPlanKey, type PlanCatalog } from '@/lib/plans'
import { getCountrySettings, getCountrySettingsMany } from '@/lib/country-settings'
import type { CountrySettings } from '@/lib/country-settings-types'
import { MARKETING_COUNTRY } from '@/lib/marketing-country'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section')

  if (section === 'check_admin') {
    const isAdmin = await verifyAdmin(req)
    return NextResponse.json({ isAdmin })
  }

  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Last demo-cleanup run. This is the ONLY layer that can catch the job dying COMPLETELY — nothing
  // inside a job that never fires can report that it never fired, which is exactly how the pg_cron edge
  // functions died silently when the Vault secret was deleted. A human seeing a stale timestamp in the
  // console they already use is the detector. Best-effort: if the table doesn't exist yet (migration
  // 20260723 unapplied), return null rather than 500 the whole admin page.
  if (section === 'demo_cleanup') {
    try {
      const { data } = await supabase
        .from('demo_cleanup_log')
        .select('run_at, ok, expired_deleted, orphans_deleted, error, gap_mins')
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      // Age computed HERE, not in the client's render: Date.now() during render is impure (the
      // react-hooks/purity rule this file's siblings already trip) and the server clock is the better
      // reference anyway.
      const ageMins = data?.run_at
        ? Math.round((Date.now() - new Date(data.run_at as string).getTime()) / 60000)
        : null
      return NextResponse.json({ lastRun: data ? { ...data, ageMins } : null })
    } catch {
      return NextResponse.json({ lastRun: null })
    }
  }

  if (section === 'discovery') {
    const { data: discoveryTrucks } = await supabase
      .from('discovery_trucks')
      .select('id, name, visibility, hatchgrab_truck_id, exclude_reason, show_on_vf, show_on_hg, excluded')
      .order('name')
    return NextResponse.json({ discoveryTrucks: discoveryTrucks || [] })
  }

  const { data: trucks } = await supabase
    .from('trucks')
    .select('id,name,slug,country,timezone,dashboard_token,plan,trial_expires_at,feature_overrides,active,auto_accept,contact_email,onboarded_at,operator_id,lifetime_discount_pct,lifetime_discount_note,hide_pricing,plan_price_override_minor,plan_price_override_until,plan_price_override_note,show_on_vf,show_on_hg,order_link_vf,order_link_hg,is_customer,excluded,custom_domain,custom_domain_verified_at,custom_domain_confirmed_at,custom_domain_setup_state,custom_domain_setup_started_at,custom_domain_last_checked_at,custom_domain_last_ok_at,custom_domain_last_seen_value')
    .order('name')

  // ── J3: THE SIGNUP PROMO CODE, KEYED BY OPERATOR ────────────────────────────────────────────────
  // 🔴 ITS OWN STATEMENT, AND THAT IS THE J1 TOLERANCE. `operators.signup_promo_code` does not exist
  // until the migration is run by hand, and a named select over a missing column fails the WHOLE
  // statement with 42703. Folding it into the trucks query above would therefore have blanked the
  // ENTIRE admin console on preview until the migration landed. Separate query, error swallowed: the
  // codes column is simply empty until the column exists, and everything else renders as it does today.
  let operators: { id: string; signup_promo_code: string | null }[] = []
  {
    const { data, error } = await supabase.from('operators').select('id, signup_promo_code')
    if (error) console.warn('[admin] signup_promo_code unavailable (migration not run?):', error.message)
    else operators = data ?? []
  }
  // ── THE COUNTRY SETTINGS THIS SCREEN QUOTES — the marketing country's (the plan matrix) plus every
  // truck's own (one truck's modal). public.country_settings is service-role only (V12.1), so the admin
  // page never reads it: it rides here, behind verifyAdmin above. ⚠️ FATAL: a read that fails returns 500
  // rather than letting the matrix render guessed figures.
  let countrySettings: Record<string, CountrySettings>
  try {
    countrySettings = await getCountrySettingsMany([MARKETING_COUNTRY, ...(trucks || []).map(t => t.country as string)])
  } catch (e) {
    console.error('[admin] country settings read failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not load country settings.' }, { status: 500 })
  }
  // ── THE PLAN CATALOGUE (plans-data-model Stage A): the plan buttons, names and prices this screen shows come from
  // public.plans / public.plan_prices — service-role only, so it rides here behind verifyAdmin. ⚠️ FATAL, like the
  // country settings: an admin screen that guessed the plan list would offer plans that do not exist.
  let plans: PlanCatalog
  try {
    plans = await getPlanCatalog()
  } catch (e) {
    console.error('[admin] plan catalogue read failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not load the plans.' }, { status: 500 })
  }
  // currency-registry (21 October 2026): + every country the catalogue PRICES, so the plans table formats each price in
  // its own currency (Ireland has prices and no trucks — it printed "2900 (minor units)"). BEST EFFORT, one by one: these
  // rows are only quoted in the table, so one that cannot be read shows "—" there instead of failing the console.
  for (const cc of new Set(plans.prices.map(p => p.countryCode))) {
    if (countrySettings[cc]) continue
    try { countrySettings[cc] = await getCountrySettings(cc) }
    catch (e) { console.warn(`[admin] ${cc} settings unreadable for the plans table:`, e instanceof Error ? e.message : e) }
  }
  return NextResponse.json({ trucks: trucks || [], operators, countrySettings, plans })
}

/* ══ 🔴 THE TRUCK FIELDS ADMIN MAY WRITE — AN ALLOWLIST, EACH VALIDATED (plans-data-model Stage A, 19 October 2026) ══
 * ⛔ THIS ROUTE USED TO WRITE THE REQUEST BODY STRAIGHT INTO `trucks` (`update(updates)`): any column, any value, from
 * one admin request. It now accepts exactly the fields the admin screen edits, each checked; anything else is refused
 * by name. The plan is checked against public.plans (active plans only) — the database's foreign key is the second
 * line, not the first. */
type Check = (v: unknown, plans: PlanCatalog) => boolean
const isBool: Check = v => typeof v === 'boolean'
const nullOr = (c: Check): Check => (v, p) => v === null || c(v, p)
const isText: Check = v => typeof v === 'string' && v.length <= 2000
const isIsoInstant: Check = v => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const isYmd: Check = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
const isNonNegInt: Check = v => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100_000_000
const ADMIN_TRUCK_FIELDS: Record<string, Check> = {
  plan: (v, plans) => isPlanKey(plans, v, { activeOnly: true }),
  trial_expires_at: nullOr(isIsoInstant),            // the plan's END DATE (lib/plans.ts planEndDate)
  plan_price_override_minor: nullOr(isNonNegInt),
  plan_price_override_until: nullOr(isYmd),
  plan_price_override_note: nullOr(isText),
  active: isBool,
  hide_pricing: isBool,
  show_on_vf: isBool,
  show_on_hg: isBool,
  order_link_vf: isBool,
  order_link_hg: isBool,
  excluded: isBool,
  feature_overrides: v => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v as Record<string, unknown>).every(x => typeof x === 'boolean'),
  lifetime_discount_pct: nullOr(v => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100),
  lifetime_discount_note: nullOr(isText),
  scraper_rule: nullOr(v => v === 'scroll_lazy' || v === 'scroll_next'),
}

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { truckId, discoveryTruckId, ...updates } = body

  if (discoveryTruckId) {
    const { visibility, show_on_vf, show_on_hg, excluded } = updates
    // Per-site booleans + `excluded` master-hide are the live controls; `visibility` still accepted for
    // back-compat until it's dropped. (linkDiscoveryTruck / hatchgrab_truck_id is no longer set from the UI.)
    const patch: Record<string, any> = {}
    if (show_on_vf !== undefined) patch.show_on_vf = show_on_vf
    if (show_on_hg !== undefined) patch.show_on_hg = show_on_hg
    if (excluded !== undefined) patch.excluded = excluded
    if (visibility !== undefined) patch.visibility = visibility
    await supabase.from('discovery_trucks').update(patch).eq('id', discoveryTruckId)
    return NextResponse.json({ ok: true })
  }

  if (!truckId) return NextResponse.json({ error: 'Missing truckId' }, { status: 400 })

  let plans: PlanCatalog
  try {
    plans = await getPlanCatalog()
  } catch (e) {
    console.error('[admin] plan catalogue read failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not load the plans.' }, { status: 500 })
  }
  const patch: Record<string, unknown> = {}
  const unknown: string[] = [], invalid: string[] = []
  for (const [k, v] of Object.entries(updates as Record<string, unknown>)) {
    const check = ADMIN_TRUCK_FIELDS[k]
    if (!check) unknown.push(k)
    else if (!check(v, plans)) invalid.push(k)
    else patch[k] = v
  }
  if (unknown.length) return NextResponse.json({ error: `These fields cannot be changed here: ${unknown.join(', ')}` }, { status: 400 })
  if (invalid.length) return NextResponse.json({ error: `Invalid value for: ${invalid.join(', ')}` }, { status: 400 })
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

  const { error } = await supabase.from('trucks').update(patch).eq('id', truckId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
