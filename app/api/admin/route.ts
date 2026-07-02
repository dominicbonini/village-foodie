// app/api/admin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PLAN_META, type Plan } from '@/lib/features'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function verifyAdmin(req?: NextRequest): Promise<boolean> {
  const supabaseAuth = await createSupabaseServerClient()
  let { data: { user } } = await supabaseAuth.auth.getUser()   // WEB (cookie) — unchanged, resolves first
  // ADDITIVE (native app): no cookie, but sends its Supabase session as a Bearer. Only reached when there's
  // no cookie user AND an Authorization header is present → a browser (cookie auth) never enters this branch,
  // so the web admin path is byte-for-byte unchanged. Bearer validated via the service client's getUser(jwt).
  if (!user && req) {
    const authz = req.headers.get('authorization')
    const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
    if (jwt) {
      const { data: { user: bearerUser } } = await supabase.auth.getUser(jwt)
      if (bearerUser) user = bearerUser
    }
  }
  if (!user) return false
  const { data: operator } = await supabase
    .from('operators')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .single()
  return !!operator?.is_admin
}

export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section')

  if (section === 'check_admin') {
    const isAdmin = await verifyAdmin(req)
    return NextResponse.json({ isAdmin })
  }

  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (section === 'discovery') {
    const { data: discoveryTrucks } = await supabase
      .from('discovery_trucks')
      .select('id, name, visibility, hatchgrab_truck_id, exclude_reason, show_on_vf, show_on_hg, excluded')
      .order('name')
    return NextResponse.json({ discoveryTrucks: discoveryTrucks || [] })
  }

  const { data: trucks } = await supabase
    .from('trucks')
    .select('id,name,slug,dashboard_token,plan,trial_expires_at,feature_overrides,active,auto_accept,contact_email,onboarded_at,operator_id,lifetime_discount_pct,lifetime_discount_note,show_on_vf,show_on_hg,order_link_vf,order_link_hg,is_customer,excluded')
    .order('name')
  return NextResponse.json({ trucks: trucks || [] })
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
