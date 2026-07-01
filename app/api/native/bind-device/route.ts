// Per-device operator config (Package 3). GET = read this device's row + the truck's vans + an optional
// single-van staff hint (for the multi-van picker pre-fill). POST = upsert the row (bind van / set default
// screen / toggle notify / attach APNs push_token), keyed on device_id.
//
// SECURITY (mirrors existing truck-ownership scoping): the dashboard `token` authorises to ONE truck; a
// device may only bind to a van whose van.truck_id === that truck. body.truck_id is never trusted — it's
// resolved from the token. Multiple device_ids per token is expected/allowed.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function truckFromToken(token: string | null) {
  if (!token) return null
  const { data } = await supabaseAdmin
    .from('trucks').select('id, name').eq('dashboard_token', token).eq('active', true).single()
  return data
}

// Optional pre-fill hint: if the cookie session resolves to a STAFF member of this truck who is scoped to
// exactly ONE van, suggest it. Soft hint only — NOT a security boundary (van-scoping is not enforced).
async function singleVanStaffHint(truckId: string): Promise<string | null> {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return null
    const { data: member } = await supabaseAdmin
      .from('truck_users').select('id, role').eq('auth_user_id', user.id).eq('truck_id', truckId).maybeSingle()
    if (!member || member.role !== 'staff') return null
    const { data: vans } = await supabaseAdmin
      .from('truck_user_vans').select('van_id').eq('truck_user_id', member.id)
    return (vans && vans.length === 1) ? (vans[0].van_id as string) : null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const deviceId = url.searchParams.get('device_id')
  const truck = await truckFromToken(token)
  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const [{ data: device }, { data: vans }, vanHint] = await Promise.all([
    deviceId
      ? supabaseAdmin.from('van_devices').select('*').eq('device_id', deviceId).eq('truck_id', truck.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('truck_vans').select('id, name').eq('truck_id', truck.id).eq('active', true),
    singleVanStaffHint(truck.id),
  ])
  // truck = the CURRENT bound truck (from the token) — for the "You're viewing: <truck> — <van>" display.
  return NextResponse.json({ device: device ?? null, vans: vans ?? [], vanHint, truck: { id: truck.id, name: (truck as any).name ?? null } })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { token, device_id, van_id, default_screen, notify_enabled, push_token, platform } = body as {
    token?: string; device_id?: string; van_id?: string | null; default_screen?: string
    notify_enabled?: boolean; push_token?: string | null; platform?: string
  }
  const truck = await truckFromToken(token ?? null)
  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!device_id) return NextResponse.json({ error: 'device_id required' }, { status: 400 })

  // SECURITY GATE: van must belong to THIS truck. Reject a cross-truck van_id outright.
  if (van_id) {
    const { data: van } = await supabaseAdmin
      .from('truck_vans').select('id').eq('id', van_id).eq('truck_id', truck.id).eq('active', true).single()
    if (!van) return NextResponse.json({ error: 'van not found for this truck' }, { status: 404 })
  }
  if (default_screen && default_screen !== 'dashboard' && default_screen !== 'kds') {
    return NextResponse.json({ error: 'invalid default_screen' }, { status: 400 })
  }

  // Upsert by device_id (unique). Only patch provided fields; always refresh truck_id + last_seen.
  const patch: Record<string, unknown> = { truck_id: truck.id, device_id, last_seen: new Date().toISOString() }
  if (van_id !== undefined) patch.van_id = van_id
  if (default_screen !== undefined) patch.default_screen = default_screen
  if (notify_enabled !== undefined) patch.notify_enabled = !!notify_enabled
  if (push_token !== undefined) patch.push_token = push_token
  if (platform !== undefined) patch.platform = platform

  const { data, error } = await supabaseAdmin
    .from('van_devices').upsert(patch, { onConflict: 'device_id' }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, device: data })
}
