// Trucks the LOGGED-IN user may access (plan b — the membership gate). SESSION-authed via Bearer access
// token (the native session lives in localStorage, not cookies, so the server can't read a cookie).
// "Permitted" = owner (operators → trucks.operator_id) UNION member (truck_users). The client is NEVER
// trusted to filter — this endpoint is the sole source of the switchable truck list. Also returns the
// device's current pinned config (only if pinned to a permitted truck).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function userIdFromBearer(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!jwt) return null
  const { data } = await supabaseAdmin.auth.getUser(jwt)
  return data.user?.id ?? null
}

// ADMIN → all active trucks; else owner (operators → trucks.operator_id) UNION member (truck_users).
// Mirrors the WEB admin model EXACTLY (no broader scope invented):
//   • operators.is_admin — the same flag the web checks (/dashboard/page.tsx:26 → /admin; /api/dashboard:25
//     is_admin owner-equivalent all-access).
//   • admin scope = ALL trucks — the same set the /admin console lists.
// Used by BOTH my-trucks (GET, path #1) and switch-truck (path #4), so admin acceptance is consistent
// across them from this one place.
export async function permittedTruckIds(userId: string): Promise<Set<string>> {
  const ids = new Set<string>()
  const { data: op } = await supabaseAdmin.from('operators').select('id, is_admin').eq('auth_user_id', userId).maybeSingle()
  if (op?.is_admin) {
    const { data: all } = await supabaseAdmin.from('trucks').select('id').eq('active', true)
    all?.forEach((t: { id: string }) => ids.add(t.id))
    return ids
  }
  if (op) {
    const { data: owned } = await supabaseAdmin.from('trucks').select('id').eq('operator_id', op.id).eq('active', true)
    owned?.forEach((t: { id: string }) => ids.add(t.id))
  }
  const { data: memberships } = await supabaseAdmin.from('truck_users').select('truck_id').eq('auth_user_id', userId)
  memberships?.forEach((m: { truck_id: string | null }) => { if (m.truck_id) ids.add(m.truck_id) })
  return ids
}

export async function GET(req: NextRequest) {
  const userId = await userIdFromBearer(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const deviceId = new URL(req.url).searchParams.get('device_id')

  const truckIds = await permittedTruckIds(userId)
  const ids = [...truckIds]
  if (!ids.length) return NextResponse.json({ trucks: [], device: null })

  const [{ data: trucks }, { data: vans }] = await Promise.all([
    supabaseAdmin.from('trucks').select('id, name, dashboard_token').in('id', ids).eq('active', true),
    supabaseAdmin.from('truck_vans').select('id, name, truck_id').in('truck_id', ids).eq('active', true),
  ])
  const vansByTruck = new Map<string, { id: string; name: string }[]>()
  ;(vans || []).forEach((v: { id: string; name: string; truck_id: string }) => {
    const a = vansByTruck.get(v.truck_id) || []; a.push({ id: v.id, name: v.name }); vansByTruck.set(v.truck_id, a)
  })
  const trucksOut = (trucks || []).map((t: { id: string; name: string; dashboard_token: string }) => ({
    truck_id: t.id, name: t.name, dashboard_token: t.dashboard_token, vans: vansByTruck.get(t.id) || [],
  }))

  // Current pinned device config — ONLY exposed when pinned to a permitted truck.
  let device: { truck_id: string; van_id: string | null; default_screen: string } | null = null
  if (deviceId) {
    const { data: d } = await supabaseAdmin.from('van_devices').select('truck_id, van_id, default_screen').eq('device_id', deviceId).maybeSingle()
    if (d && truckIds.has(d.truck_id)) device = d
  }
  return NextResponse.json({ trucks: trucksOut, device })
}
