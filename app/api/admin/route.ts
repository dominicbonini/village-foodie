// app/api/admin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'   // canonical admin check (shared with the /landing gate)
import { getPlanCatalog } from '@/lib/plans-server'
import { isPlanKey, planByKey, planPriceFor, type PlanCatalog } from '@/lib/plans'
import { adminPayload, adminDiscovery, adminDemoCleanup, AdminLoadError } from '@/lib/admin-payload'   // admin-speed-1

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section')

  if (section === 'check_admin') {
    const isAdmin = await verifyAdmin(req)
    return NextResponse.json({ isAdmin })
  }

  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Last demo-cleanup run. This is the ONLY layer that can catch the job dying COMPLETELY — nothing inside a job that never
  // fires can report that it never fired, which is exactly how the pg_cron edge functions died silently when the Vault secret
  // was deleted. A human seeing a stale timestamp in the console they already use is the detector. Best-effort (null, never a
  // 500): lib/admin-payload.ts adminDemoCleanup.
  if (section === 'demo_cleanup') return NextResponse.json(await adminDemoCleanup())

  // The discovery rows, only the fields the page reads (admin-speed-1).
  if (section === 'discovery') return NextResponse.json(await adminDiscovery())

  // ── THE MAIN PAYLOAD (admin-speed-1, 16 November 2026): trucks, operators' signup codes, the country settings the screen
  // quotes and the plan catalogue — read in parallel, every country in ONE query (lib/admin-payload.ts says why; it was ~15 s).
  // ⚠️ FATAL as before: an unreadable marketing / truck country or plan catalogue answers 500 rather than letting the matrix
  // render guessed figures. The admin page now sends this request FIRST (no check_admin round trip before it): a 401 here is
  // its "access denied".
  try {
    return NextResponse.json(await adminPayload())
  } catch (e) {
    if (e instanceof AdminLoadError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
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
  // world-countries-1 (31 October 2026): a public plan whose price row in the truck's country is switched off (offered = false —
  // Unlimited-only countries, where HatchGrab may not take a platform fee) is refused. Every other choice is as before.
  const chosen = 'plan' in patch ? planByKey(plans, patch.plan as string) : null
  if (chosen) {
    const { data: tc } = await supabase.from('trucks').select('country').eq('id', truckId).maybeSingle()
    const row = chosen?.isPublic && tc?.country ? planPriceFor(plans, chosen.key, tc.country) : null
    if (row && row.offered === false) return NextResponse.json({ error: `${chosen!.name} is not offered in ${tc!.country}.` }, { status: 400 })
  }

  const { error } = await supabase.from('trucks').update(patch).eq('id', truckId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
