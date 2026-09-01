// app/api/admin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'   // canonical admin check (shared with the /landing gate)
import { PLAN_META, type Plan } from '@/lib/features'

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
    .select('id,name,slug,dashboard_token,plan,trial_expires_at,feature_overrides,active,auto_accept,contact_email,onboarded_at,operator_id,lifetime_discount_pct,lifetime_discount_note,hide_pricing,show_on_vf,show_on_hg,order_link_vf,order_link_hg,is_customer,excluded,custom_domain,custom_domain_verified_at,custom_domain_confirmed_at,custom_domain_setup_state,custom_domain_setup_started_at,custom_domain_last_checked_at,custom_domain_last_ok_at,custom_domain_last_seen_value')
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
  return NextResponse.json({ trucks: trucks || [], operators })
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

  const { error } = await supabase.from('trucks').update(updates).eq('id', truckId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
