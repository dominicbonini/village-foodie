// Trucks the LOGGED-IN user may access (plan b — the membership gate). SESSION-authed via Bearer access
// token (the native session lives in localStorage, not cookies, so the server can't read a cookie).
// "Permitted" = owner (operators → trucks.operator_id) UNION member (truck_users). The client is NEVER
// trusted to filter — this endpoint is the sole source of the switchable truck list. Also returns the
// device's current pinned config (only if pinned to a permitted truck).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function userIdFromBearer(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!jwt) return null
  const { data } = await supabaseAdmin.auth.getUser(jwt)
  return data.user?.id ?? null
}

// ADMIN → all active NON-DEMO trucks; else owner (operators → trucks.operator_id) UNION member
// (truck_users).
// Mirrors the WEB admin model EXACTLY (no broader scope invented):
//   • operators.is_admin — the same flag the web checks (/dashboard/page.tsx:26 → /admin; /api/dashboard:25
//     is_admin owner-equivalent all-access).
//   • admin scope = ALL trucks — the same set the /admin console lists.
// Used by BOTH my-trucks (GET, path #1) and switch-truck (path #4), so admin acceptance is consistent
// across them from this one place.
//
// ⚠️ DEMO EXCLUSION IS PREFIX-AS-MARKER, AND THAT IS FRAGILE. There is NO demo flag on `trucks` — the
// `demo-` prefix on id/slug/dashboard_token (lib/demo.ts) is the ONLY signal that a truck is a demo, so
// this filter is a string convention standing in for a schema fact. PRECEDENT FOR WHY THAT ROTS: the
// `hg_outbox_seq` incident (reference-manual §11) — a per-device COUNTER shared the op-key prefix
// `'hg_outbox_'`, so every outbox enumerator swept the counter in as a malformed op and reported "1 order
// syncing" forever, surviving reinstall. A prefix convention held for a while, then a neighbouring key
// grew into it. THE DURABLE FIX IS A REAL COLUMN — `trucks.is_demo boolean not null default false`,
// backfilled from the prefix and written by lib/provision-truck.ts — after which this filter becomes
// `.eq('is_demo', false)` and stops depending on how ids are spelled. Until then, do not weaken
// assertReservedPrefix() (provision-truck.ts), which is what keeps the prefix trustworthy at all.
//
// SCOPE: the ADMIN bypass ONLY. A non-admin who genuinely OWNS a demo truck (the demo-signup claim path)
// resolves through the owner/membership branches below and is NOT filtered — they must still reach it.
export async function resolvePermittedTrucks(userId: string): Promise<{ isAdmin: boolean; ids: Set<string> }> {
  const ids = new Set<string>()
  const { data: op } = await supabaseAdmin.from('operators').select('id, is_admin').eq('auth_user_id', userId).maybeSingle()
  if (op?.is_admin) {
    // ORDER BY created_at ASC — same column and direction as the web router (app/dashboard/page.tsx:41,63).
    // Without it PostgREST returns rows in unspecified (heap) order, which made the caller's "first truck"
    // landing UNDEFINED rather than merely wrong — see the GET below.
    const { data: all } = await supabaseAdmin.from('trucks').select('id').eq('active', true).order('created_at', { ascending: true })
    all?.forEach((t: { id: string }) => { if (!isDemoIdentifier(t.id)) ids.add(t.id) })
    return { isAdmin: true, ids }
  }
  if (op) {
    const { data: owned } = await supabaseAdmin.from('trucks').select('id').eq('operator_id', op.id).eq('active', true)
    owned?.forEach((t: { id: string }) => ids.add(t.id))
  }
  const { data: memberships } = await supabaseAdmin.from('truck_users').select('truck_id').eq('auth_user_id', userId)
  memberships?.forEach((m: { truck_id: string | null }) => { if (m.truck_id) ids.add(m.truck_id) })
  return { isAdmin: false, ids }
}

/** Ids only — the pre-existing signature, kept so switch-truck's import and gate are unchanged. */
export async function permittedTruckIds(userId: string): Promise<Set<string>> {
  return (await resolvePermittedTrucks(userId)).ids
}

export async function GET(req: NextRequest) {
  const userId = await userIdFromBearer(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const deviceId = new URL(req.url).searchParams.get('device_id')

  const { isAdmin, ids: truckIds } = await resolvePermittedTrucks(userId)
  const ids = [...truckIds]
  if (!ids.length) return NextResponse.json({ trucks: [], device: null, is_admin: isAdmin })

  const [{ data: trucks }, { data: vans }] = await Promise.all([
    // ORDER BY created_at ASC — THIS is the load-bearing one: `trucksOut` is built from THIS result, so
    // its order is what the caller's trucks[0] resolves to. Matches the web router's ordering exactly.
    supabaseAdmin.from('trucks').select('id, name, dashboard_token').in('id', ids).eq('active', true).order('created_at', { ascending: true }),
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
  // `is_admin` is ADDITIVE — existing consumers read `trucks`/`device` and are unaffected. It exists so the
  // native landing (app/app/page.tsx) can route an admin to /admin instead of falling through to "first
  // permitted truck", mirroring the web router (app/dashboard/page.tsx:30). Bearer-authed and resolved
  // server-side from operators.is_admin; the client never asserts it.
  return NextResponse.json({ trucks: trucksOut, device, is_admin: isAdmin })
}
