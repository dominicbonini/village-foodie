// app/api/printing — the WIRED printer's shared record: the van's address, and the ONE device allowed to
// print to it. Authenticated exactly as /api/dashboard/action is (dashboard token + optional PIN —
// verifyToken below is a copy of that route's, including its 503/401 split).
//
// ── THE NAMED-SELECT RULE ───────────────────────────────────────────────────────────────────────────
// truck_vans.network_printer_address and network_print_device_id are added by migration 20260919 and
// may not exist yet. They are read HERE ONLY, by a SEPARATE probed select. PGRST204 (schema cache not
// reloaded) and 42703 (column absent) are logged distinguishably and reported as
// `columnsAvailable: false`, so the WIRED SETTING degrades and nothing else does — the van list,
// the dashboard and Bluetooth printing never touch this route.
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseNetAddress, NET_ADDRESS_HELP } from '@/lib/printing/netAddress'

// ── COPIED from app/api/dashboard/action/route.ts (verifyToken) — same rules, same outcomes ──────────
//   'unavailable' → 503. We could not check.
//   'no_truck'    → 401. We checked; the token does not exist.
//   'bad_pin'     → 401. We checked; the PIN is wrong.
async function verifyToken(token: string, pin?: string) {
  const { data: truck, error } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).maybeSingle()
  if (error) {
    console.error('[printing] truck lookup FAILED (not an auth failure) — returning 503:', error.message, error.code)
    return { ok: false as const, reason: 'unavailable' as const }
  }
  if (!truck) return { ok: false as const, reason: 'no_truck' as const }
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return { ok: false as const, reason: 'bad_pin' as const }
  return { ok: true as const, truck }
}
const authFail = (reason: 'unavailable' | 'no_truck' | 'bad_pin') =>
  reason === 'unavailable'
    ? NextResponse.json({ error: 'Could not check your sign-in right now' }, { status: 503 })
    : NextResponse.json({ error: 'Unauthorised', requiresPin: reason === 'bad_pin' }, { status: 401 })

/** The device's van, by its EXISTING van_devices binding — the same row /api/native/bind-device reads. */
async function vanForDevice(truckId: string, deviceId: string): Promise<{ vanId: string | null; vanName: string | null }> {
  const { data: device } = await supabase
    .from('van_devices').select('van_id').eq('device_id', deviceId).eq('truck_id', truckId).maybeSingle()
  const vanId = (device as { van_id?: string | null } | null)?.van_id ?? null
  if (!vanId) return { vanId: null, vanName: null }
  const { data: van } = await supabase.from('truck_vans').select('name').eq('id', vanId).eq('truck_id', truckId).maybeSingle()
  return { vanId, vanName: (van as { name?: string } | null)?.name ?? null }
}

/** The probed read of the two new columns. `ok: false` ⇒ they could not be read. */
async function readNetColumns(vanId: string): Promise<{ ok: boolean; address: string | null; printingDeviceId: string | null }> {
  const { data, error } = await supabase
    .from('truck_vans')
    .select('network_printer_address, network_print_device_id')
    .eq('id', vanId)
    .maybeSingle()
  if (error) {
    const code = (error as { code?: string }).code
    if (code === 'PGRST204') console.warn(`[printing] van ${vanId}: network printer columns not in PostgREST's schema cache (PGRST204) — reload the schema; wired printing unavailable`)
    else if (code === '42703') console.warn(`[printing] van ${vanId}: network printer columns absent (42703) — migration 20260919 not applied; wired printing unavailable`)
    else console.warn(`[printing] van ${vanId}: network printer read failed (${code ?? 'no code'}): ${error.message}; wired printing unavailable`)
    return { ok: false, address: null, printingDeviceId: null }
  }
  const row = data as { network_printer_address?: string | null; network_print_device_id?: string | null } | null
  return { ok: true, address: row?.network_printer_address ?? null, printingDeviceId: row?.network_print_device_id ?? null }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const pin = req.nextUrl.searchParams.get('pin') ?? undefined
  const deviceId = req.nextUrl.searchParams.get('device_id') ?? ''
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const auth = await verifyToken(token, pin || undefined)
  if (!auth.ok) return authFail(auth.reason)
  if (!deviceId) return NextResponse.json({ error: 'device_id required' }, { status: 400 })
  const { vanId, vanName } = await vanForDevice(auth.truck.id, deviceId)
  const truckName = (auth.truck as { name?: string | null }).name ?? null
  if (!vanId) return NextResponse.json({ columnsAvailable: true, vanId: null, vanName: null, truckName, address: null, printingDeviceId: null })
  const cols = await readNetColumns(vanId)
  return NextResponse.json({ columnsAvailable: cols.ok, vanId, vanName, truckName, address: cols.address, printingDeviceId: cols.printingDeviceId })
}

export async function POST(req: NextRequest) {
  let body: { token?: string; pin?: string; device_id?: string; action?: string; address?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const { token, pin, device_id: deviceId, action } = body
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const auth = await verifyToken(token, pin || undefined)
  if (!auth.ok) return authFail(auth.reason)
  if (!deviceId || typeof deviceId !== 'string') return NextResponse.json({ error: 'device_id required' }, { status: 400 })
  if (action !== 'claim' && action !== 'release' && action !== 'set_address') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const { vanId } = await vanForDevice(auth.truck.id, deviceId)
  if (!vanId) return NextResponse.json({ error: "This device isn't set to a van yet, so wired printing isn't available." }, { status: 400 })

  const fail = (error: { code?: string; message: string } | null, what: string) => {
    const code = error?.code
    if (code === 'PGRST204' || code === '42703') console.warn(`[printing] van ${vanId}: ${what} rejected — network printer columns ${code === 'PGRST204' ? 'not in the schema cache (PGRST204)' : 'absent (42703)'}`)
    else console.warn(`[printing] van ${vanId}: ${what} failed (${code ?? 'no code'}): ${error?.message}`)
    return NextResponse.json({ error: 'Wired printing could not be saved right now.' }, { status: 500 })
  }

  if (action === 'claim') {
    const { error } = await supabase.from('truck_vans').update({ network_print_device_id: deviceId }).eq('id', vanId).eq('truck_id', auth.truck.id)
    if (error) return fail(error, 'claim')
    return NextResponse.json({ ok: true, printingDeviceId: deviceId })
  }
  if (action === 'release') {
    // Only the holder may release. Releasing someone else's claim would be "move", and that is claim.
    const { error } = await supabase.from('truck_vans').update({ network_print_device_id: null })
      .eq('id', vanId).eq('truck_id', auth.truck.id).eq('network_print_device_id', deviceId)
    if (error) return fail(error, 'release')
    return NextResponse.json({ ok: true, printingDeviceId: null })
  }
  // set_address — validated with the SAME parser the card and the transport use.
  const parsed = typeof body.address === 'string' ? parseNetAddress(body.address) : null
  if (!parsed) return NextResponse.json({ error: NET_ADDRESS_HELP }, { status: 400 })
  const { error } = await supabase.from('truck_vans').update({ network_printer_address: parsed.normalised }).eq('id', vanId).eq('truck_id', auth.truck.id)
  if (error) return fail(error, 'set_address')
  return NextResponse.json({ ok: true, address: parsed.normalised })
}
