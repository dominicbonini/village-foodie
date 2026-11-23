import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEventCancellationEmail } from '@/lib/email'
import { truckTimeSettings } from '@/lib/truck-time'
import { getSoleActiveVanId } from '@/lib/van-utils'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { hasValidEventTimes, clockMins } from '@/lib/time-utils'
/* ── 🔴 PRIVATE EVENTS (20261014) ──────────────────────────────────────────────────────────────── */
import { applyPrivacy } from '@/lib/private-events/write'
import { isEventPrivate } from '@/lib/private-events/read'
import { featureRefusal } from '@/lib/plan-refusal'
// Language Phase 1d: a refusal of ours is `{ error: <today's English>, …, code, params }` (lib/i18n/manage-errors.ts), in the
// truck's language (en-GB before the truck is known). A database's or exception's message is passed on as it comes.
import { manageErrorBody, type ManageErrorCode, type ManageErrorParams } from '@/lib/i18n/manage-errors'
import { localeForTruck } from '@/lib/i18n/server-locale'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/manageApi'
import { readEventRegion } from '@/lib/event-region-read'
import { addressFormatForTruck } from '@/lib/country-settings'   // address-formats-1
import { requireMember } from '@/lib/auth/require-member'   // dashboard-auth-2: the member gate (log mode)
import { logOrderEvent } from '@/lib/audit/order-audit'   // france-records-1

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getTruck(token: string) {
  const { data } = await supabase
    .from('trucks')
    .select('id, name, plan, feature_overrides, trial_expires_at, timezone, country')
    .eq('dashboard_token', token)
    .single()
  return data
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, action, eventId, payload } = body

  if (!token || !action) {
    return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'token_and_action_required'), { status: 400 })
  }

  const truck = await getTruck(token)
  if (!truck) return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'truck_not_found'), { status: 404 })
  // dashboard-auth-2: the member gate, LOG MODE (lib/auth/require-member.ts) — records a caller the planned
  // "signed-in team members only" rule would refuse; never refuses or delays while AUTH_MODE is 'log'.
  { const gate = await requireMember(req, supabase, truck, action, { route: '/api/events/action', group: 'group1' }); if (gate.refuse) return gate.refuse }
  /** A refusal of ours, in the truck's language (read only when one is sent). */
  const refuse = async (code: ManageErrorCode, status: number, params: ManageErrorParams = {}, extra?: Record<string, unknown>) =>
    NextResponse.json(manageErrorBody(await localeForTruck(truck), code, params, extra), { status })

  const now = new Date().toISOString()
  /** events-overlap-2: a 409 naming the event's CURRENT status (read now, or given), so the screen can say why. */
  const stateRefusal = async (code: 'event_cannot_start' | 'event_cannot_finish' | 'event_cannot_dismiss', known?: string) => {
    let status = known
    if (!status) {
      const { data: cur } = await supabase.from('truck_events').select('status').eq('id', eventId).eq('truck_id', truck.id).maybeSingle()
      if (!cur) return refuse('event_not_found', 404)
      status = String(cur.status)
    }
    return refuse(code, 409, { status }, { status })
  }

  // ── CONFIRM ──────────────────────────────────────────────
  if (action === 'confirm') {
    const { venue_address, customer_note } = payload
    let { auto_open, auto_close } = payload
    // events-overlap-2: the dashboard's "Approve" does not hold the truck's Settings defaults, so it sends
    // `truck_defaults: true` and the defaults are read here — the same `?? true` Manage's add-event uses.
    if (payload?.truck_defaults === true && (typeof auto_open !== 'boolean' || typeof auto_close !== 'boolean')) {
      const { data: d } = await supabase.from('trucks').select('default_auto_open, default_auto_close').eq('id', truck.id).maybeSingle()
      if (typeof auto_open !== 'boolean') auto_open = d?.default_auto_open ?? true
      if (typeof auto_close !== 'boolean') auto_close = d?.default_auto_close ?? true
    }

    if (typeof auto_open !== 'boolean' || typeof auto_close !== 'boolean') {
      return refuse('auto_open_close_required', 400)
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
      /* ⚠️ A PRIVATE EVENT GETS THE SHARPER MESSAGE (20261014, decision 9). The scraper never captures
       * times for these rows, so this is the NORMAL path for an approved private event, not an edge
       * case — and "a private event taking orders by link needs them" tells the operator why, where
       * the generic sentence just says no. The RULE is identical; only the wording differs. */
      const stillPrivate = payload.is_private === undefined
        ? await isEventPrivate(supabase, eventId, 'events/action confirm')
        : payload.is_private === true
      /* ⚠️ `private_needs_times` IS `privateEvents.form.needsTimes` (the approval card's line) word for word. */
      return refuse(stillPrivate ? 'private_needs_times' : 'event_needs_times', 400)
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
        return refuse('choose_truck_for_event', 400)
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

    /* ══ 🔴 THE APPROVAL CARD'S PRIVATE TICK, APPLIED ON CONFIRM (20261014, decision 9) ═════════════
     * The card arrives already marked private when the scraper found the word (`is_private` was set at
     * insert, by the bridge). Confirming is where the operator's decision is recorded:
     *   • they left it ticked  ⇒ `applyPrivacy` writes the Private type and ISSUES THE TOKEN, so the
     *     link exists from the moment the event goes live and not before;
     *   • they unticked it     ⇒ the event becomes an ordinary public one.
     * ⛔ ONLY WHEN THE CLIENT SENT THE KEY. `undefined` means "this caller did not ask about privacy"
     * — the same rule `upsert_event` follows — so every other path that confirms an event leaves the
     * flag exactly as the bridge set it, rather than silently publishing it.
     * ⚠️ A FAILURE DOES NOT UNDO THE CONFIRM. The event is live either way; the operator is told the
     * privacy part failed and can fix it from Edit event. Rolling the confirm back would leave a truck
     * unable to approve an event because a type row could not be made.
     * ⚠️ THE GATE IS CHECKED ONLY WHEN KEEPING IT PRIVATE — a downgraded truck must always be able to
     * make an event public. */
    if (payload.is_private !== undefined) {
      const wantPrivate = payload.is_private === true
      if (wantPrivate) {
        // Stage A2: override → the effective plan's switch → allowed; worded by why it is off (lib/plan-refusal.ts).
        const off = await featureRefusal(truck, 'private_events', await localeForTruck(truck))
        if (off) return refuse(off.code, 403, off.params)
      }
      const pr = await applyPrivacy(supabase, truck.id, eventId, {
        isPrivate: wantPrivate,
        /* The operator may type a name on the approval card. Never from the scrape — see
         * `scrapedPrivacyFields`. */
        name: payload.private_name,
      })
      if (!pr.ok) {
        return NextResponse.json(
          { ok: true, warning: pr.error || translatorFor(await localeForTruck(truck), 'manageApi')('privacyNotSaved') },
        )
      }
      return NextResponse.json({ ok: true, isPrivate: pr.isPrivate, token: pr.token })
    }
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
      return refuse('event_needs_times', 400)
    }
    const { data: opened, error } = await supabase
      .from('truck_events')
      .update({ status: 'open', opened_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .in('status', ['confirmed', 'closed']) // can open a confirmed or reopen a closed event
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // events-overlap-2: NOTHING MATCHED IS A REFUSAL, NOT AN "ok". This answered { ok: true } when the event was unconfirmed,
    // already open or cancelled, so a screen showed "Event started" for a write that never happened (docs/events-overlap-1
    // §3c). It now says what the event IS. 409 = the request was fine, the event's state does not allow it.
    if (!opened?.length) return stateRefusal('event_cannot_start')
    return NextResponse.json({ ok: true })
  }

  // ── CLOSE ────────────────────────────────────────────────
  if (action === 'close') {
    const { data: closed, error } = await supabase
      .from('truck_events')
      .update({ status: 'closed', closed_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .eq('status', 'open') // can only close an open event
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // events-overlap-2: as for OPEN — a close that changed nothing says why (not started, already finished, not approved…).
    if (!closed?.length) return stateRefusal('event_cannot_finish')
    return NextResponse.json({ ok: true })
  }

  // ── DISMISS OVERLAP (events-overlap-2) ───────────────────
  // "Keep {other}" on the dashboard's overlap dialog: the unapproved event stays unapproved and is never offered as a
  // duplicate again, on any device. Only an unconfirmed event can be dismissed; the first dismissal's time is kept.
  if (action === 'dismiss_overlap') {
    if (!eventId) return refuse('event_id_required', 400)
    const { data: row, error: readErr } = await supabase
      .from('truck_events')
      .select('id, status, overlap_dismissed_at')
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .maybeSingle()
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
    if (!row) return refuse('event_not_found', 404)
    if (row.overlap_dismissed_at) return NextResponse.json({ ok: true, overlap_dismissed_at: row.overlap_dismissed_at })
    if (row.status !== 'unconfirmed') return stateRefusal('event_cannot_dismiss', row.status)
    const { error } = await supabase
      .from('truck_events')
      .update({ overlap_dismissed_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .eq('status', 'unconfirmed')
      .is('overlap_dismissed_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, overlap_dismissed_at: now })
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

    // 🔴 A TIME IS VALIDATED NOW (17 October 2026). This wrote `end_time` with no check at all — the finish-time
    // control's write lands here. The pair it would leave (the payload's times over the event's stored ones) must pass
    // hasValidEventTimes: an end EARLIER than the start is an event that runs past midnight (lib/event-window.ts) and
    // is accepted; an end EQUAL to the start is refused. A draft may still hold a missing time — only a pair is judged.
    // The refusal names the case: `event_times_same` when both are clock times and equal; anything malformed keeps
    // `live_event_needs_times`. The response shape is every other refusal's here.
    if ('start_time' in safe || 'end_time' in safe) {
      const { data: cur } = await supabase
        .from('truck_events')
        .select('start_time, end_time')
        .eq('id', eventId)
        .eq('truck_id', truck.id)
        .maybeSingle()
      const start = ('start_time' in safe ? safe.start_time : cur?.start_time) as string | null | undefined
      const end = ('end_time' in safe ? safe.end_time : cur?.end_time) as string | null | undefined
      if (start != null && end != null && !hasValidEventTimes(start, end)) {
        return refuse(clockMins(start) != null && clockMins(start) === clockMins(end) ? 'event_times_same' : 'live_event_needs_times', 400)
      }
    }

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
    // ── 🔴 THIS SELECTED `village`, A COLUMN truck_events DOES NOT HAVE, AND THREW THE ERROR AWAY. ──
    // `const { data: eventRow } = …` with no `error` binding meant PostgREST's 42703 was discarded,
    // `eventRow` came back null on EVERY cancel, and three things below silently stopped happening:
    // the `rejected_event_signatures` write (its branch is `payload?.suppress && eventRow`), the
    // locality/date on the customer cancellation email, and the `rebuildProductionSlotUsage` call
    // (`if (eventRow?.event_date)`). The cancel itself still returned `ok: true`, so nothing surfaced it
    // — and `rejected_event_signatures` has never received a single row.
    // 🔴 THE LOCALITY COLUMN ON THIS TABLE IS `town`. `village` exists on venues / discovery_events /
    // subscribers, never here. NOT joined from `venues`: across all 103 events a venue join rescues ZERO
    // of the 13 events with no town, and disagrees with `town` on 12 — it would add no coverage and a
    // second source of truth. Two other reads in this codebase already select `town` from this table
    // (dashboard/action and manage), which is the pattern followed here.
    // ⚠️ BEST-EFFORT, NOT FATAL. A failure here is logged and the cancel continues, because the cancel
    // succeeding is existing behaviour: the UPDATE below is its own statement with its own checked error.
    // What a null `eventRow` costs is the three effects above, which is what the log is for.
    // ── 🔴 AND IT IS ALSO THE OWNERSHIP GATE. ONE GATE, NOT FOUR FILTERS. ──────────────────────────
    // This branch had NO ownership check. The truck_events UPDATE below carries `.eq('truck_id', …)`,
    // but a Supabase update matching ZERO rows returns NO error, so `if (error)` did not fire and
    // execution simply continued — into an orders query filtered on `.eq('event_id', eventId)` with no
    // ownership filter at all. A caller authenticated for truck A, posting truck B's event uuid, left
    // B's event untouched while CANCELLING EVERY ONE OF B'S LIVE ORDERS and emailing B's customers a
    // cancellation carrying truck A's name — and still returned `ok: true` with a count.
    // 🔴 GATED HERE, ONCE, BEFORE ANY WRITE — so every write below is unreachable for a foreign event
    // BY CONSTRUCTION. Deliberately NOT four `.eq('truck_id', …)` filters that all have to agree: the
    // orders writes cannot carry one anyway (orders are reached through `event_id`), which is exactly
    // how the hole opened. `truck_id` is added to the select this branch ALREADY makes, so the gate
    // costs no extra round trip.
    // ⚠️ A NULL ROW MUST ALSO 404, AND THAT IS A DELIBERATE BEHAVIOUR CHANGE. Ownership cannot be
    // confirmed without the row, and "could not verify" must fail closed. Previously a missing or
    // unreadable row fell through and the branch carried on writing.
    const { data: eventRow, error: eventRowErr } = await supabase
      .from('truck_events')
      .select('truck_id, venue_name, town, event_date, scraped_signature')
      .eq('id', eventId)
      .single()
    if (eventRowErr) console.warn('[cancel] event detail fetch failed — suppression, email locality and slot-usage rebuild will be skipped:', eventRowErr.message)
    if (!eventRow || eventRow.truck_id !== truck.id) {
      console.warn(`[cancel] refused: event ${eventId} is not owned by truck ${truck.id} (or could not be read)`)
      return refuse('event_not_found', 404)
    }

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
      // france-records-1: each cancellation, in action_audit_log (best-effort — never stops the event cancel).
      for (const o of affectedOrders as Record<string, unknown>[]) {
        await logOrderEvent(supabase, { action: 'order_cancelled', truckId: String(o.truck_id ?? ''), orderKey: String(o.order_key ?? ''), before: o,
          after: { ...o, status: 'cancelled' }, note: { by: 'event_cancelled', event_id: eventId }, actor: { actorKind: 'unknown', actorId: null, actorLabel: 'event cancellation' }, source: 'web' })
      }

      // The truck's time settings — the email's date in its country's words (Phase 2B).
      const truckTime = await truckTimeSettings(truck)
      for (const order of affectedOrders) {
        if (order.customer_email) {
          await sendEventCancellationEmail({
            time: truckTime,
            to: order.customer_email,
            customerName: order.customer_name,
            orderId: order.id,
            truckName: truck.name ?? '',
            venueName: eventRow?.venue_name ?? null,
            // The email's parameter is named `village` (lib/email.ts) and is consumed only as
            // `[venueName, village].filter(Boolean).join(', ')` — a locality string. Fed from `town`,
            // this table's actual locality column. Parameter name, copy and template are unchanged.
            village: eventRow?.town ?? null,
            region: await readEventRegion(supabase, eventId, await addressFormatForTruck(truck)),
            addressFormat: await addressFormatForTruck(truck),   // address-formats-1: the truck's address format
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
    if (!eventRow) return refuse('event_not_found', 404)

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

  return refuse('unknown_action', 400)
}
