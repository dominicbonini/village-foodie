// Re-point a device to another truck the user is a member of (plan b — sick-cover / multi-truck edge).
// SESSION-authed (Bearer). SECURITY GATE: the target truck must be in the user's permitted set (owner OR
// truck_users member) — verified server-side; the client is never trusted. UPDATEs the SINGLE van_devices
// row (keyed by device_id, UNIQUE) → the push_token CARRIES OVER to the new truck/van and the device can
// never appear under two trucks (no cross-truck notification leak). Does NOT log out.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { permittedTruckIds } from '../my-trucks/route'

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function userIdFromBearer(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!jwt) return null
  const { data } = await supabaseAdmin.auth.getUser(jwt)
  return data.user?.id ?? null
}

export async function POST(req: NextRequest) {
  const userId = await userIdFromBearer(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { device_id, target_truck_id, van_id } = await req.json().catch(() => ({})) as {
    device_id?: string; target_truck_id?: string; van_id?: string | null
  }
  if (!device_id || !target_truck_id) return NextResponse.json({ error: 'device_id and target_truck_id required' }, { status: 400 })

  // GATE: user must be a member/owner of the target truck.
  const permitted = await permittedTruckIds(userId)
  if (!permitted.has(target_truck_id)) return NextResponse.json({ error: 'not a member of that truck' }, { status: 403 })

  // Resolve the van: explicit (must belong to the target truck) or the sole/first active van of the target.
  let resolvedVanId: string | null = null
  if (van_id) {
    const { data: van } = await supabaseAdmin.from('truck_vans').select('id').eq('id', van_id).eq('truck_id', target_truck_id).eq('active', true).single()
    if (!van) return NextResponse.json({ error: 'van not found for target truck' }, { status: 404 })
    resolvedVanId = van.id
  } else {
    const { data: vans } = await supabaseAdmin.from('truck_vans').select('id').eq('truck_id', target_truck_id).eq('active', true).order('created_at', { ascending: true })
    resolvedVanId = vans && vans.length ? vans[0].id : null
  }

  // UPDATE the existing row (never insert a 2nd) — upsert on device_id, patching ONLY truck/van so
  // push_token/default_screen/notify_enabled carry over. last_seen refreshed.
  const { data: updated, error } = await supabaseAdmin
    .from('van_devices')
    .upsert({ device_id, truck_id: target_truck_id, van_id: resolvedVanId, last_seen: new Date().toISOString() }, { onConflict: 'device_id' })
    .select('device_id')
    .single()
  if (error || !updated) return NextResponse.json({ error: error?.message || 'switch failed' }, { status: 400 })

  const { data: truck } = await supabaseAdmin.from('trucks').select('dashboard_token').eq('id', target_truck_id).single()
  return NextResponse.json({ ok: true, dashboard_token: truck?.dashboard_token ?? null })
}
