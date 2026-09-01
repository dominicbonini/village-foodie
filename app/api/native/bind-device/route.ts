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

// ── 🔴 EVERY FAILURE BODY CARRIES A STABLE `reason`. THE `error` STRING IS NOT ONE. ─────────────────
// The five rejections below used to be distinguishable only by their prose `error` text — and one of
// them (`upsert_failed`) does not have a fixed string at all, it forwards whatever PostgREST said. So
// a client could not tell them apart without matching on English, and diagnosing one instance meant
// streaming production logs. `reason` is a closed, machine-readable vocabulary the client switches on.
// ⚠️ ADDITIVE ONLY. `error` is unchanged on every branch, the STATUS CODES are unchanged, and the
// success response at the bottom is untouched — anything already reading those still reads the same
// bytes. ⚠️ `reason` is INTERNAL: it names a cause for a log line, never for an operator to read.
// Client contract: lib/native/device.ts SaveDeviceConfigResult.
type BindDeviceReason =
  | 'unauthorised'            // 401 — token did not resolve to an active truck
  | 'device_id_required'      // 400 — no device_id in the body
  | 'van_not_for_truck'       // 404 — the cross-truck guard refused the van
  | 'invalid_default_screen'  // 400 — default_screen outside ('dashboard'|'kds')
  | 'upsert_failed'           // 400 — the write itself was rejected by the database

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { token, device_id, van_id, default_screen, notify_enabled, push_token, platform } = body as {
    token?: string; device_id?: string; van_id?: string | null; default_screen?: string
    notify_enabled?: boolean; push_token?: string | null; platform?: string
  }
  const truck = await truckFromToken(token ?? null)
  if (!truck) return NextResponse.json({ error: 'Unauthorised', reason: 'unauthorised' satisfies BindDeviceReason }, { status: 401 })
  if (!device_id) return NextResponse.json({ error: 'device_id required', reason: 'device_id_required' satisfies BindDeviceReason }, { status: 400 })

  // SECURITY GATE: van must belong to THIS truck. Reject a cross-truck van_id outright.
  if (van_id) {
    const { data: van } = await supabaseAdmin
      .from('truck_vans').select('id').eq('id', van_id).eq('truck_id', truck.id).eq('active', true).single()
    if (!van) return NextResponse.json({ error: 'van not found for this truck', reason: 'van_not_for_truck' satisfies BindDeviceReason }, { status: 404 })
  }
  if (default_screen && default_screen !== 'dashboard' && default_screen !== 'kds') {
    return NextResponse.json({ error: 'invalid default_screen', reason: 'invalid_default_screen' satisfies BindDeviceReason }, { status: 400 })
  }

  // Upsert by device_id (unique). Only patch provided fields; always refresh truck_id + last_seen.
  const patch: Record<string, unknown> = { truck_id: truck.id, device_id, last_seen: new Date().toISOString() }
  if (van_id !== undefined) {
    patch.van_id = van_id
  } else {
    // ── 🔴 IF truck_id CHANGES, van_id MUST BE REVALIDATED OR CLEARED. ──────────────────────────────
    // The two fields on this row arrive by DIFFERENT ROUTES and were previously reconciled by neither.
    // `truck_id` is DERIVED FROM THE CALLER'S IDENTITY (the token, line 79) and is therefore rewritten on
    // EVERY write, including a partial one. `van_id` is SUPPLIED BY THE CALLER and is therefore validated
    // only when present — the cross-truck gate above sits on `if (van_id)`, so a patch that omits it never
    // enters that gate at all. A derived field that always moves and a supplied field that is only ever
    // checked when sent cannot be left to independent branches: a partial patch of {push_token},
    // {notify_enabled} or {default_screen} bearing a DIFFERENT truck's token used to reassign the row to
    // that truck while leaving the PREVIOUS truck's van_id in place, return 200, and touch no validation
    // on the way past. (Observed: device c6b24668… on 'real-thai-food' holding 'test-truck''s van.)
    // There is no composite FK or CHECK relating the two columns — 20260701_van_devices.sql declares two
    // INDEPENDENT single-column foreign keys — so the reconciliation has to be explicit, and here.
    // ⚠️ CLEAR, DO NOT CARRY OVER. We have no van to substitute: the caller sent none, and picking one for
    // them would be inventing a binding they did not ask for. NULL is the honest state — the device is on
    // the new truck and not yet bound to any of its vans, which is exactly what DeviceSetupGate's
    // `device && device.van_id` test reads as "needs setup".
    // ⚠️ NOT SCOPED BY truck_id, deliberately: this read must see the row AS IT STANDS, under whichever
    // truck currently owns it. The GET above is truck-scoped (line 49) and therefore CANNOT see a
    // cross-truck row — which is what let the picker present a clean slate over a stale binding.
    // A missing row (first-ever bind) leaves van_id off the patch entirely, so the INSERT takes the
    // column default rather than an explicit null.
    const { data: existing } = await supabaseAdmin
      .from('van_devices').select('truck_id').eq('device_id', device_id).maybeSingle()
    if (existing && existing.truck_id !== truck.id) patch.van_id = null
  }
  if (default_screen !== undefined) patch.default_screen = default_screen
  if (notify_enabled !== undefined) patch.notify_enabled = !!notify_enabled
  if (push_token !== undefined) patch.push_token = push_token
  if (platform !== undefined) patch.platform = platform

  const { data, error } = await supabaseAdmin
    .from('van_devices').upsert(patch, { onConflict: 'device_id' }).select('*').single()
  if (error) return NextResponse.json({ error: error.message, reason: 'upsert_failed' satisfies BindDeviceReason }, { status: 400 })
  return NextResponse.json({ ok: true, device: data })
}
