// app/api/demo/walkthrough/route.ts — demo-2 (30 October 2026, docs/demo-2-report.md): the demo walkthrough's ONLY API.
//
// The walkthrough (/try/<slug>) shows a visitor their own menu as a customer, then THEIR order arriving on a kitchen
// screen, where they press Start cooking and Ready. It is a DEMO-ONLY SCOPED VIEW, so it never needs the dashboard token:
//   • it is keyed on the demo's SLUG — the identifier the customer order page already shows in its URL — and refuses
//     anything that is not a `demo-` truck by its own id;
//   • the kitchen reads ONLY the orders whose keys the visitor's browser placed (passed in `orders`), and only if they
//     belong to that demo truck — never the truck's other orders;
//   • the two buttons move only those orders, only forward (confirmed → cooking → ready), and send nothing: a demo
//     never emails.
// Every step is counted server-side in public.demo_events (lib/demo-events): menu_viewed on open, cooking_started,
// ready_pressed, and signup_started when the page says "Start free" was pressed.
//
// 🔴 NO GET SIDE EFFECTS. Opening the walkthrough may restart the demo's service (a fresh event when the old one has
// ended, or the outreach prospect's first open), so `open` is a POST the page sends after it loads — a link scanner
// fetching /try/<slug> changes nothing. GET only reads orders.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'
import { restartDemoService } from '@/lib/demo-restart'
import { claimDemoFirstOpen } from '@/lib/demo-session'
import { recordDemoEvent, isDemoEvent } from '@/lib/demo-events'
import { verifyAdmin } from '@/lib/auth/admin'
import { truckTimeZone, truckTimeSettings } from '@/lib/truck-time'
import { instantOfLocal } from '@/lib/time-utils'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { getPlanCatalog } from '@/lib/plans-server'
import { signupDefaultPlan, trialMonthsOf } from '@/lib/plans'
import { displayTruckName } from '@/lib/demo'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
// A restart wipes and re-provisions the event (no seeding since demo-2): well inside this.
export const maxDuration = 60

const ORDER_KEY_RE = /^[0-9a-f-]{36}$/i
const MAX_KEYS = 20
const refuse = (status: number, code: string) => NextResponse.json({ ok: false, code }, { status })

type DemoTruck = { id: string; slug: string; name: string | null; country: string | null; timezone: string | null }
/** The demo truck for a slug — by its OWN id a demo, or null. */
async function demoTruckOf(slug: unknown): Promise<DemoTruck | null> {
  const s = typeof slug === 'string' ? slug.trim() : ''
  if (!isDemoIdentifier(s)) return null
  const { data } = await supabase.from('trucks').select('id, slug, name, country, timezone').eq('slug', s).maybeSingle()
  if (!data || !isDemoIdentifier(String(data.id))) return null
  return data as DemoTruck
}

/** Is the demo's newest event still running on the truck's own clock? (The dashboard's demoBoardLive rule.) */
async function boardIsLive(truck: DemoTruck, now: Date): Promise<boolean> {
  const { data } = await supabase.from('truck_events').select('id, status, event_date, end_time')
    .eq('truck_id', truck.id).order('event_date', { ascending: false }).order('end_time', { ascending: false }).limit(1)
  const ev = (data ?? [])[0] as { status?: string; event_date?: string; end_time?: string } | undefined
  if (!ev || ev.status === 'closed' || ev.status === 'cancelled') return false
  if (!ev.event_date || !ev.end_time) return true
  return now.getTime() <= instantOfLocal(ev.event_date, ev.end_time, await truckTimeZone(truck))
}

/** The visitor's orders, read for the kitchen view — only keys that belong to this demo truck. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const truck = await demoTruckOf(url.searchParams.get('slug'))
  if (!truck) return refuse(404, 'demo_not_found')
  const keys = (url.searchParams.get('orders') ?? '').split(',').map(k => k.trim()).filter(k => ORDER_KEY_RE.test(k)).slice(0, MAX_KEYS)
  // G11 (demo-2b): `?info=1` — the demo ORDER PAGE asks once which signup-button variant to show (its extraction
  // source), so its banner button says what the dashboard's and the kitchen screen's say. Nothing else is read.
  if (url.searchParams.get('info') === '1') {
    const { data: session } = await supabase.from('demo_sessions').select('extraction_source').eq('truck_id', truck.id).maybeSingle()
    return NextResponse.json({ ok: true, extractionSource: (session as { extraction_source?: string | null } | null)?.extraction_source ?? null })
  }
  if (!keys.length) return NextResponse.json({ ok: true, orders: [] })
  const { data, error } = await supabase.from('orders')
    .select('order_key, id, customer_name, slot, status, items, deals, created_at')
    .eq('truck_id', truck.id).in('order_key', keys)
  if (error) return refuse(500, 'read_failed')
  const orders = (data ?? []).map(o => ({
    orderKey: String(o.order_key), number: String(o.id ?? ''), name: String(o.customer_name ?? ''),
    slot: (o.slot as string | null) ?? null, status: String(o.status ?? 'confirmed'),
    items: ((o.items as { name?: string; quantity?: number }[] | null) ?? []).map(i => ({ name: String(i.name ?? ''), quantity: Number(i.quantity ?? 1) })),
    deals: ((o.deals as { name?: string }[] | null) ?? []).map(d => ({ name: String(d.name ?? '') })),
    createdAt: (o.created_at as string | null) ?? null,
  })).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  return NextResponse.json({ ok: true, orders })
}

export async function POST(req: NextRequest) {
  let body: { slug?: unknown; action?: unknown; orderKey?: unknown; event?: unknown }
  try { body = await req.json() } catch { return refuse(400, 'invalid_request_body') }
  const truck = await demoTruckOf(body.slug)
  if (!truck) return refuse(404, 'demo_not_found')
  const action = String(body.action ?? '')

  // ── open: make sure there is a live service, count the visit, and say what the page needs ──────────────────────
  if (action === 'open') {
    const { data: session } = await supabase.from('demo_sessions')
      .select('truck_id, discovery_truck_id, first_opened_at, extraction_source').eq('truck_id', truck.id).maybeSingle()
    if (!session) return refuse(410, 'demo_gone')
    const outreach = !!(session as { discovery_truck_id?: string | null }).discovery_truck_id
    const now = new Date()
    let restarted = false
    try {
      // T2 — an OUTREACH demo's first open by the prospect starts a fresh service from their moment. An admin's
      // preview never consumes it (verifyAdmin, server-side; fails open, as in /api/demo/restart).
      let firstOpen = false
      if (outreach && !(session as { first_opened_at?: string | null }).first_opened_at) {
        let admin = false
        try { admin = await verifyAdmin(req) } catch { admin = false }
        if (!admin) firstOpen = (await claimDemoFirstOpen(supabase, truck.id)).claimed
      }
      // T1 — no live service (ended, closed, or none) → a fresh, EMPTY one.
      if (firstOpen || !(await boardIsLive(truck, now))) {
        await restartDemoService(supabase, truck.id, { now, tz: await truckTimeZone(truck) })
        restarted = true
      }
    } catch (err) {
      console.error(`[demo/walkthrough] could not make ${truck.id} live:`, err instanceof Error ? err.message : err)
      return refuse(500, 'new_service_failed')
    }
    await recordDemoEvent(supabase, { demoId: truck.id, event: 'menu_viewed', source: outreach ? 'outreach' : 'landing' })
    let trialMonths: number | null = null
    try { trialMonths = trialMonthsOf(signupDefaultPlan(await getPlanCatalog())) } catch { trialMonths = null }
    const time = await truckTimeSettings(truck).catch(() => null)
    return NextResponse.json({
      ok: true, restarted, source: outreach ? 'outreach' : 'landing', trialMonths, time,
      truckName: displayTruckName(truck.name ?? ''),
      // G11 (demo-2b): the signup button's variant — a SAMPLE demo ('template') must not call the menu "yours".
      extractionSource: (session as { extraction_source?: string | null }).extraction_source ?? null,
    })
  }

  // ── the kitchen's two buttons — only this demo's order, only forward, nothing sent ──────────────────────────
  if (action === 'start_cooking' || action === 'ready') {
    const key = String(body.orderKey ?? '')
    if (!ORDER_KEY_RE.test(key)) return refuse(400, 'order_not_found')
    const { data: order } = await supabase.from('orders').select('order_key, status, event_date')
      .eq('truck_id', truck.id).eq('order_key', key).maybeSingle()
    if (!order) return refuse(404, 'order_not_found')
    const from = String(order.status)
    if (action === 'start_cooking') {
      if (!['pending', 'confirmed', 'modified'].includes(from)) return NextResponse.json({ ok: true, status: from })
      const { error } = await supabase.from('orders').update({ status: 'cooking' }).eq('truck_id', truck.id).eq('order_key', key)
      if (error) return refuse(500, 'update_failed')
      await recordDemoEvent(supabase, { demoId: truck.id, event: 'cooking_started' })
      return NextResponse.json({ ok: true, status: 'cooking' })
    }
    if (!['pending', 'confirmed', 'modified', 'cooking'].includes(from)) return NextResponse.json({ ok: true, status: from })
    const { error } = await supabase.from('orders').update({ status: 'ready' }).eq('truck_id', truck.id).eq('order_key', key)
    if (error) return refuse(500, 'update_failed')
    // As the dashboard's Ready does: a ready order frees its kitchen-capacity slot. No email — this is a demo.
    if (order.event_date) await rebuildProductionSlotUsage(supabase, truck.id, String(order.event_date)).catch(() => undefined)
    await recordDemoEvent(supabase, { demoId: truck.id, event: 'ready_pressed' })
    return NextResponse.json({ ok: true, status: 'ready' })
  }

  // ── a step with no request of its own (the visitor pressing "Start free") ──────────────────────────────────
  if (action === 'event') {
    if (body.event !== 'signup_started' || !isDemoEvent(body.event)) return refuse(400, 'unknown_event')
    await recordDemoEvent(supabase, { demoId: truck.id, event: 'signup_started' })
    return NextResponse.json({ ok: true })
  }

  return refuse(400, 'unknown_action')
}
