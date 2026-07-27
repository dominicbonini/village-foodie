// lib/demo-event-refresh.ts
// Keeps a demo's event window ALIVE, so a demo left open (or returned to) can still take an order.
//
// ── THE BUG THIS FIXES (verified, not theorised — 2026-07-23) ───────────────────────────────────────
// A demo event is provisioned `auto_close: false` so the scheduler can't end a demo mid-session. Correct,
// and it stays. But it means the window simply EXPIRES with the event still `status: 'open'`, and slots
// are generated for the window — so once `end_time` passes there is nothing bookable:
//
//   demo-f1dz…  event 11:33–14:00, checked at 17:12 →  36 slots, 0 available, 30 is_past, asap: null
//   /api/events for the same truck →  status: "open"
//
// The demo showed "Live" while its CENTRAL LOOP — place an order, watch it arrive — silently could not
// happen. That is the worst possible failure for a demo: it doesn't look broken, it looks like the product
// doesn't work.
//
// ── WHY ROLL THE WINDOW RATHER THAN ENABLE auto_close ───────────────────────────────────────────────
// Enabling auto_close would make the label honest and the demo dead — a visitor who wandered off for an
// hour returns to a closed event and no way to try anything. Rolling forward keeps the demo permanently
// usable. It does teach that events never end, which is a real cost; it is the smaller one, because the
// demo's job is the ORDERING loop, not the event lifecycle (the DEMO MODE banner does the honesty work),
// and the alternative teaches that the product doesn't work at all.
//
// ── WHY THE WINDOW LENGTH IS PRESERVED ─────────────────────────────────────────────────────────────
// The obvious move is to recompute with demoEventWindow(now), but that produces a DIFFERENT length (it
// rounds to the next whole hour + 2h). The seeded orders were packed against the original window with a
// per-slot mains budget that provably never breaches the category ceiling — re-anchoring them into a
// shorter window would either push orders past the end or pile them onto the final slots, breaching the
// very capacity guarantee the demo exists to demonstrate. Keeping the duration and shifting everything by
// one delta preserves the seeded distribution EXACTLY: same slots, same peak, same traffic lights.

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateSlots } from '@/lib/slots'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { isDemoIdentifier } from '@/lib/demo'
import { demoEventWindow } from '@/lib/provision-demo-event'

// The rolled window is derived from demoEventWindow (single source of truth), which owns the half-hour
// anchor, the fixed 3h length, and the midnight clamp — so no LATEST_END constant is needed here any more.
const SLOT_INTERVAL_MINS = 5

const toMins = (t: string): number => {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
const toHHMM = (mins: number): string =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/** London wall-clock date + minutes-since-midnight. The DB stores venue-local times, and the runtime is
 *  UTC — the same mismatch that produced the auto-event-scheduler's stale-live bug. Compare like for like. */
function londonNow(now: Date, tz = 'Europe/London'): { date: string; mins: number } {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '00'
  return { date: `${g('year')}-${g('month')}-${g('day')}`, mins: Number(g('hour')) * 60 + Number(g('minute')) }
}

export interface RollResult {
  rolled: boolean
  /** True when a CLOSED demo event was revived to 'open' (with or without a window roll). */
  reopened?: boolean
  reason?: 'not-demo' | 'no-event' | 'still-in-window' | 'no-times'
  from?: { date: string; start: string; end: string }
  to?: { date: string; start: string; end: string }
  ordersShifted?: number
}

/**
 * Keep a demo's event PLAYABLE on dashboard load. Two failure modes it heals:
 *   • an OPEN event whose window has elapsed → roll the window (and everything anchored to it) forward.
 *   • a CLOSED event (a dead board, no recovery now that Restart is locked in demo) → REOPEN it; roll the
 *     window too if it has also elapsed.
 * No-op for non-demo trucks, and no-op for a live open event still inside its window (the ~always case).
 *
 * SAFE TO CALL ON EVERY READ: the still-in-window path is one SELECT and no writes.
 */
export async function rollDemoEventIfStale(
  supabase: SupabaseClient,
  truckId: string,
  now: Date = new Date(),
): Promise<RollResult> {
  // 🔴 HARD GUARD — the ONLY thing scoping this to demos. This function moves live event times, rewrites
  // order rows, and now REOPENS closed events; it must never touch a real operator's truck. Every branch
  // below is behind this early return, and the sole caller (app/api/dashboard/route.ts) already wraps the
  // call in its own `if (isDemoIdentifier(truck.id))`, so a non-demo truck cannot reach the reopen path.
  if (!isDemoIdentifier(truckId)) return { rolled: false, reason: 'not-demo' }

  // Widened to include 'closed' (safe — the whole function is demo-only, above). status is selected so the
  // reopen decision below can tell an open-elapsed event from a closed one.
  const { data: event } = await supabase
    .from('truck_events')
    .select('id, status, event_date, start_time, end_time, van_id')
    .eq('truck_id', truckId)
    .in('status', ['open', 'closed'])
    .order('event_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!event) return { rolled: false, reason: 'no-event' }
  if (!event.start_time || !event.end_time || !event.event_date) return { rolled: false, reason: 'no-times' }

  const wasClosed = event.status === 'closed'
  const oldDate = event.event_date as string
  const oldStart = event.start_time as string
  const oldEnd = event.end_time as string

  const { date: today, mins: nowMins } = londonNow(now)

  // Still inside its window? DATE first — an event on an earlier date is past regardless of clock time.
  const stillInWindow = today < oldDate || (today === oldDate && nowMins < toMins(oldEnd))

  // OPEN + still live → nothing to do (the hot path).
  if (!wasClosed && stillInWindow) {
    return { rolled: false, reason: 'still-in-window' }
  }

  // CLOSED + still inside its window → REOPEN in place, do NOT re-window. The times are still valid, so
  // shifting orders/capacity would move a perfectly good board for no reason; a closed demo is a dead demo
  // regardless of the clock, so reviving it is the whole point (spec step 3). status='open' + opened_at is
  // MANDATORY together (§9.3 #4 — a null/stale opened_at is a known downstream "live" hazard).
  if (wasClosed && stillInWindow) {
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'open', opened_at: nowIso, updated_at: nowIso })
      .eq('id', event.id)
    if (error) throw new Error(`Demo event reopen failed: ${error.message}`)
    return {
      rolled: true, reopened: true,
      from: { date: oldDate, start: oldStart, end: oldEnd },
      to: { date: oldDate, start: oldStart, end: oldEnd },   // window unchanged — reopen only
      ordersShifted: 0,
    }
  }

  // Falls through here when the window has ELAPSED (open-stale OR closed-stale) → roll it forward below.
  // A closed-stale event is additionally reopened as part of the same event UPDATE.

  // ── New window: the SAME rule as first-run (demoEventWindow), NOT the old duration ────────────────
  // Previously this preserved the previous window's LENGTH (newEnd = newStart + oldDuration), which is
  // exactly how a legacy 2h10 window kept propagating across rolls. Re-deriving from demoEventWindow(now)
  // gives every rolled demo an identical half-hour-anchored 3h window (with the same midnight clamp), so a
  // rolled demo is indistinguishable from a freshly-provisioned one. The duration therefore CHANGES on the
  // first roll after this ships — see the delta note below.
  const win = demoEventWindow(now)
  const newStart = win.start
  const newEnd = win.end
  const newStartMins = toMins(newStart)

  // ONE delta, applied to the event and to every order anchored to it. The delta is start-to-start
  // (newStart − oldStart) and is INDEPENDENT of the window length, so it stays correct even though the new
  // duration differs from the old: each order keeps its offset FROM THE START, and the seeder placed every
  // order within [start+10, end], so a 3h window is ≥ any legacy length and the shifted orders still fit
  // inside the new window. See the report note for the one visible consequence (front-weighting).
  const deltaMins = newStartMins - toMins(oldStart)

  // A closed-stale event is reopened as part of this SAME update — status='open' + opened_at together
  // (§9.3 #4). An already-open event keeps its status/opened_at untouched (it is already live, already
  // stamped at provisioning — the roll only moves its window).
  const nowIso = new Date().toISOString()
  const evPatch: Record<string, unknown> = { event_date: today, start_time: newStart, end_time: newEnd, updated_at: nowIso }
  if (wasClosed) { evPatch.status = 'open'; evPatch.opened_at = nowIso }

  const { error: evErr } = await supabase
    .from('truck_events')
    .update(evPatch)
    .eq('id', event.id)
  if (evErr) throw new Error(`Demo event roll failed: ${evErr.message}`)

  // ── Shift the seeded orders by the same delta ────────────────────────────────────────────────────
  // Orders carry `slot` (HH:MM) + `event_date`. Left behind, the board would show a full service whose
  // every collection time is in the past, and the occupancy rebuild below would find nothing to count —
  // green lights over a busy board, which is the exact misinformation the capacity model exists to avoid.
  const { data: orders } = await supabase
    .from('orders').select('order_key, slot').eq('event_id', event.id)

  let ordersShifted = 0
  for (const o of orders ?? []) {
    if (!o.slot) continue
    const shifted = toMins(o.slot as string) + deltaMins
    // Clamped by the same midnight rule as the window; a shifted slot can never land outside it.
    const slot = toHHMM(Math.max(0, Math.min(shifted, toMins(newEnd))))
    const { error } = await supabase
      .from('orders').update({ slot, event_date: today }).eq('order_key', o.order_key)
    if (error) throw new Error(`Demo order shift failed: ${error.message}`)
    ordersShifted++
  }

  // ── Rebuild the capacity model for the new window ────────────────────────────────────────────────
  // slot_capacity is keyed (truck_id, event_date, slot), so the old rows are simply orphaned by the date
  // change rather than wrong; new rows are written for the new grid. Only when the van has a total — a
  // NULL kitchen_capacity is a valid demo configuration (category batch is then the only ceiling).
  if (event.van_id) {
    const { data: van } = await supabase
      .from('truck_vans').select('kitchen_capacity').eq('id', event.van_id as string).single()
    if (van?.kitchen_capacity) {
      const rows = generateSlots(newStart, newEnd, SLOT_INTERVAL_MINS)
        .map(slot => ({ truck_id: truckId, event_date: today, slot, max_orders: van.kitchen_capacity }))
      const { error: capErr } = await supabase
        .from('slot_capacity').upsert(rows, { onConflict: 'truck_id,event_date,slot' })
      if (capErr) throw new Error(`Demo slot_capacity rewrite failed: ${capErr.message}`)
    }
  }

  // Rebuild BOTH dates: the new one so occupancy reflects the shifted orders, the old one so its usage
  // rows don't linger claiming capacity for a window that no longer has any orders in it.
  await rebuildProductionSlotUsage(supabase, truckId, today)
  if (oldDate !== today) await rebuildProductionSlotUsage(supabase, truckId, oldDate)

  return {
    rolled: true,
    reopened: wasClosed,
    from: { date: oldDate, start: oldStart, end: oldEnd },
    to: { date: today, start: newStart, end: newEnd },
    ordersShifted,
  }
}
