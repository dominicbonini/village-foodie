import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEventCancellationEmail } from '@/lib/email'
import { getSoleActiveVanId } from '@/lib/van-utils'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { hasValidEventTimes } from '@/lib/time-utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getTruck(token: string) {
  const { data } = await supabase
    .from('trucks')
    .select('id, name, plan, feature_overrides, trial_expires_at')
    .eq('dashboard_token', token)
    .single()
  return data
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, action, eventId, payload } = body

  if (!token || !action) {
    return NextResponse.json({ error: 'Token and action required' }, { status: 400 })
  }

  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Truck not found' }, { status: 404 })

  const now = new Date().toISOString()

  // ── CONFIRM ──────────────────────────────────────────────
  if (action === 'confirm') {
    const { auto_open, auto_close, venue_address, customer_note } = payload

    if (typeof auto_open !== 'boolean' || typeof auto_close !== 'boolean') {
      return NextResponse.json(
        { error: 'auto_open and auto_close are required' },
        { status: 400 }
      )
    }

    // FIX 3 (single-van auto-assign): on confirm, if this event has no van and the
    // truck has exactly one active van, assign it. Don't override an existing choice.
    const { data: ev } = await supabase
      .from('truck_events')
      .select('van_id, start_time, end_time')
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .single()
    // LIVE-TIME GATE: an event can't go live without both times (the engine needs them). Drafts stay null-OK
    // — this fires only on the confirm transition.
    if (!hasValidEventTimes(ev?.start_time, ev?.end_time)) {
      return NextResponse.json({ error: 'Add a start and end time before this event can go live.' }, { status: 400 })
    }
    const soleVanId = ev?.van_id ? null : await getSoleActiveVanId(supabase, truck.id)
    const vanPatch = (!ev?.van_id) ? { van_id: soleVanId } : {}

    // ── 🔴 LIVE-VAN GATE — A MULTI-VAN TRUCK MUST CHOOSE, 10 August 2026 ─────────────────────────────
    // The single-van auto-assign above has already run. If the event STILL has no van, the truck has
    // either zero active vans or more than one — and `getSoleActiveVanId` cannot tell those apart, so it
    // is counted here rather than inferred.
    //
    // 🔴 WHY THIS IS A LIVE-DATA DEFECT AND NOT A BLANK FIELD. `van_id` is what resolves KITCHEN
    // CAPACITY, and it does so at READ time, not at confirm time: app/api/slots/[truckId]/route.ts only
    // looks up `truck_vans.kitchen_capacity` when `todayEvent.van_id` is set, and with it null
    // `kitchenCapacity` stays null — which lib/slot-availability.ts treats as **UNLIMITED**. So a
    // confirmed van-less event does not merely look unfinished: it takes orders with **no capacity
    // enforcement at all**, every slot, all day.
    // ⚠️ THE MANUAL'S §14 SAYS slot_capacity ROWS ARE WRITTEN FROM THE VAN AT CONFIRM. That is no longer
    // how it works — confirm writes no capacity rows at all (grep this route for `slot_capacity`:
    // nothing), and the slot route's own comment says the batch cache "is no longer consulted for the
    // decision". The good news in that is the failure SELF-HEALS: assign a van later and capacity starts
    // being enforced immediately, because it is computed live.
    //
    // 🔴 ENFORCED ON THE SERVER, NOT ONLY IN THE UI. The client gate is the good experience; this is the
    // rule. It also covers the paths the UI does not go through — anything confirming an event that did
    // not come from a human pressing Approve in Manage.
    if (!ev?.van_id && !soleVanId) {
      const { count } = await supabase
        .from('truck_vans')
        .select('id', { count: 'exact', head: true })
        .eq('truck_id', truck.id)
        .eq('active', true)
      if ((count ?? 0) > 1) {
        return NextResponse.json(
          { error: 'Choose which truck is working this event before it can go live.' },
          { status: 400 },
        )
      }
      // Zero active vans falls THROUGH deliberately: there is nothing to choose, so blocking would
      // strand a truck that has not set a van up yet — the same posture the time gate takes toward
      // drafts. Capacity is unenforced for such an event, which is what having no van means.
    }

    const { error } = await supabase
      .from('truck_events')
      .update({
        status: 'confirmed',
        confirmed_at: now,
        auto_open,
        auto_close,
        venue_address: venue_address || null,
        customer_note: customer_note || null,
        ...vanPatch,
      })
      .eq('id', eventId)
      .eq('truck_id', truck.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── OPEN ─────────────────────────────────────────────────
  if (action === 'open') {
    // LIVE-TIME GATE: opening/reopening makes the event live → both times required (same rule as confirm).
    const { data: openEv } = await supabase
      .from('truck_events')
      .select('start_time, end_time')
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .single()
    if (!hasValidEventTimes(openEv?.start_time, openEv?.end_time)) {
      return NextResponse.json({ error: 'Add a start and end time before this event can go live.' }, { status: 400 })
    }
    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'open', opened_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .in('status', ['confirmed', 'closed']) // can open a confirmed or reopen a closed event

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── CLOSE ────────────────────────────────────────────────
  if (action === 'close') {
    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'closed', closed_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .eq('status', 'open') // can only close an open event

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── UPDATE ───────────────────────────────────────────────
  if (action === 'update') {
    const allowed = [
      'venue_name', 'venue_address', 'start_time', 'end_time',
      'customer_note', 'auto_open', 'auto_close', 'notes'
    ]
    const safe = Object.fromEntries(
      Object.entries(payload).filter(([k]) => allowed.includes(k))
    )

    const { error } = await supabase
      .from('truck_events')
      .update({ ...safe, updated_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── CANCEL ───────────────────────────────────────────────
  if (action === 'cancel') {
    const { cancellationNote, cancellationReason } = payload ?? {}
    const fullNote = [cancellationReason, cancellationNote].filter(Boolean).join(' — ')

    // Fetch event details before cancelling (for email + reject-memory).
    const { data: eventRow } = await supabase
      .from('truck_events')
      .select('venue_name, village, event_date, scraped_signature')
      .eq('id', eventId)
      .single()

    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'cancelled', cancellation_note: fullNote || null, updated_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Reject-memory (Stage 3): when rejecting a scraped pending event (suppress flag), store its
    // IMMUTABLE scraped signature so the bridge never re-creates it. Independent of this row, so it
    // stays suppressed even if the row is later deleted. Best-effort — failure must not block reject.
    if (payload?.suppress && eventRow) {
      const { error: supErr } = await supabase.from('rejected_event_signatures').insert({
        truck_id: truck.id,
        event_date: eventRow.event_date,
        scraped_signature: eventRow.scraped_signature || eventRow.venue_name || '',
      })
      if (supErr) console.warn('[cancel] suppression write failed:', supErr.message)
    }

    // Cancel affected orders and notify customers
    const { data: affectedOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'pending'])

    let cancelledOrders = 0
    if (affectedOrders && affectedOrders.length > 0) {
      // Scope by order_key (UUID) — display id is not unique across events, so
      // .in('id', ...) would cancel matching display numbers in OTHER events too.
      const orderKeys = affectedOrders.map((o: any) => o.order_key)
      await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancellation_reason: `Event cancelled${fullNote ? ': ' + fullNote : ''}`,
        })
        .in('order_key', orderKeys)

      cancelledOrders = affectedOrders.length

      for (const order of affectedOrders) {
        if (order.customer_email) {
          await sendEventCancellationEmail({
            to: order.customer_email,
            customerName: order.customer_name,
            orderId: order.id,
            truckName: truck.name ?? '',
            venueName: eventRow?.venue_name ?? null,
            village: eventRow?.village ?? null,
            eventDate: eventRow?.event_date ?? null,
            note: fullNote || null,
            paymentStatus: order.paid_at ? 'paid' : null,
          })
        }
      }
    }

    // The event's orders are now cancelled, but their items still sit in the
    // date-keyed production_slot_usage rows. Recompute the date from LIVE orders so
    // the cancelled load no longer bleeds into other same-date events' projections.
    // Best-effort (reuses the existing rebuild; never block the cancel).
    if (eventRow?.event_date) {
      try {
        await rebuildProductionSlotUsage(supabase, truck.id, eventRow.event_date)
      } catch (err) {
        console.warn('[events/cancel] production_slot_usage rebuild failed (drift risk):', err)
      }
    }

    return NextResponse.json({ ok: true, cancelledOrders })
  }

  // ── RESTORE REJECTED (undo a scraped-event reject) ───────────
  // Reverses the `cancel`+`suppress` reject: status 'cancelled' → 'unconfirmed' (back into the pending
  // queue) AND deletes the suppress-signature. The DELETE is MANDATORY — inbound-schedule skips any event
  // whose signature is in rejected_event_signatures, so without it the event re-vanishes on the next
  // scrape, defeating the undo. Status-only otherwise (a rejected scraped event never booked slots).
  if (action === 'restore_rejected') {
    const { data: eventRow } = await supabase
      .from('truck_events')
      .select('venue_name, event_date, scraped_signature')
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .single()
    if (!eventRow) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'unconfirmed', cancellation_note: null, updated_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Delete the exact suppress-signature the reject inserted (same key derivation as the cancel insert).
    const { error: sigErr } = await supabase
      .from('rejected_event_signatures')
      .delete()
      .eq('truck_id', truck.id)
      .eq('event_date', eventRow.event_date)
      .eq('scraped_signature', eventRow.scraped_signature || eventRow.venue_name || '')
    if (sigErr) console.warn('[restore_rejected] signature delete failed:', sigErr.message)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
