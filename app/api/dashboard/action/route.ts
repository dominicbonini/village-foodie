// app/api/dashboard/action/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { formatConfirmationEmail, formatNewOrderEmail, sendConfirmationEmail, renderOrderLinesHtml } from '@/lib/email'
import {
  addOrderToProductionSlot,
  removeOrderFromProductionSlot,
  moveSlotBooking,
  buildItemCatMap,
  normaliseOrderLines,
  deriveProductionSlot,
  rebuildProductionSlotUsage,
} from '@/lib/slot-bookings'
import { nextOrderId } from '@/lib/order-utils'
import { getLiveItemCounts, enforceStockLimits } from '@/lib/stock-availability'
import { acquireEventLock, releaseEventLock, checkStockShortfall } from '@/lib/stock-guard'

async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}

// Escape operator free-text before interpolating into a customer email's HTML (prevents broken
// markup / injection from a rejection/cancellation reason). NOTE: the CANCEL email (:cancellation
// reasonLine) does NOT escape today — same risk there; escape it too if/when that's touched.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function notifyCustomer(email: string, subject: string, html: string, truckName?: string) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey || !email) return
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: truckName || 'HatchGrab', email: process.env.EMAIL_FROM_ADDRESS || 'donotreply@villagefoodie.co.uk' },
        to:          [{ email }],
        subject,
        htmlContent: html,
      }),
    })
  } catch (err) { console.error('Email failed:', err) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // order_key (UUID) is the row identity for every order op. orderId is gone as a
    // lookup key — orders are addressed only by order_key now.
    const { token, pin, action, order_key: orderKey, manualOrder, itemName, available, editedOrder } = body

    const truck = await verifyToken(token, pin)
    if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    // ── CONFIRM ───────────────────────────────────────────────────────────────
    if (action === 'confirm') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (order.customer_email) {
        // Resolve the venue strictly by the order's OWN event_id (cross-event fix): an
        // event_date+maybeSingle lookup returns null/the wrong row on multi-event dates,
        // putting the wrong venue in the confirmation email. Fall back to date only when the
        // order has no event_id (legacy rows).
        let eventQuery = supabase
          .from('truck_events')
          .select('venue_name, town, postcode')
          .eq('truck_id', truck.id)
        eventQuery = order.event_id
          ? eventQuery.eq('id', order.event_id)
          : eventQuery.eq('event_date', order.event_date).neq('status', 'cancelled')
        const { data: eventRow } = await eventQuery.maybeSingle()
        const { subject, html, text } = formatConfirmationEmail({
          orderId: order.id,
          orderKey: order.order_key,
          customerName: order.customer_name,
          truckName: truck.name,
          items: order.items || [],
          deals: order.deals || [],
          slot: order.slot ?? null,
          discountAmt: order.discount_amt ?? 0,
          total: Number(order.total),
          notes: order.notes ?? null,
          autoAccepted: true,
          venueName: eventRow?.venue_name ?? null,
          venueTown: eventRow?.town ?? null,
          venuePostcode: eventRow?.postcode ?? null,
          preferredContactMethod: truck.preferred_contact_method ?? null,
          contactPhone: truck.contact_phone ?? null,
          whatsappSender: truck.whatsapp_sender ?? null,
          socialFacebook: truck.social_facebook ?? null,
          socialInstagram: truck.social_instagram ?? null,
          contactEmail: truck.contact_email ?? null,
          allowCancellation: truck.allow_customer_cancellation ?? true,
          cancellationCutoffMins: truck.cancellation_cutoff_mins ?? 30,
          baseUrl: process.env.NEXT_PUBLIC_HATCHGRAB_URL,
          truckSlug: truck.slug ?? undefined,
        })
        await sendConfirmationEmail({ to: order.customer_email, subject, html, text, senderName: truck.name })
      }
      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    // ── REJECT ────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const { rejectionReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      // Dedicated rejection_reason column (NOT cancellation_reason — a rejected order isn't cancelled).
      await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (order.event_date) {
        // order.slot may be null (ASAP) — removeOrderFromProductionSlot resolves
        // it to the same event-start window the booking used, so it unbooks cleanly.
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap
        )
      }
      if (order.customer_email) {
        // Mirrors the cancel email's reasonLine — the operator's reason, escaped, shown to the customer.
        const reasonLine = rejectionReason ? `<p style="color:#475569">Reason: ${escapeHtml(rejectionReason)}</p>` : ''
        await notifyCustomer(order.customer_email, `Order #${order.id} update`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Order update</h2>
            <p>Unfortunately <strong>${truck.name}</strong> is unable to fulfil order #${order.id}.</p>
            ${reasonLine}
            <p>Please order at the truck on arrival. Sorry for the inconvenience.</p>
            <p style="color:#64748b;font-size:13px">Powered by HatchGrab · hatchgrab.com</p>
          </body>`, truck.name)
      }
      return NextResponse.json({ success: true, status: 'rejected' })
    }

    // ── CANCEL ────────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const { cancellationReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancellationReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (order.event_date) {
        // order.slot may be null (ASAP) — resolved to the event-start window so it unbooks.
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap
        )
      }
      if (order.customer_email) {
        const reasonLine = cancellationReason ? `<p style="color:#475569">${cancellationReason}</p>` : ''
        const refundLine = order.paid_at ? `<p>Your refund will be processed automatically within 3–5 working days.</p>` : ''
        await notifyCustomer(order.customer_email, `Your order has been cancelled — ${truck.name}`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#334155">
            <p>Hi ${order.customer_name || 'there'},</p>
            <p>Your order <strong>#${order.id}</strong> from <strong>${truck.name}</strong> has been cancelled.</p>
            ${reasonLine}
            ${refundLine}
            <p>We're sorry for any inconvenience.</p>
            <p>${truck.name}</p>
            <p style="color:#94a3b8;font-size:12px">Powered by HatchGrab · hatchgrab.com</p>
          </body>`, truck.name)
      }
      return NextResponse.json({ success: true, status: 'cancelled' })
    }

    // ── READY ─────────────────────────────────────────────────────────────────
    if (action === 'ready') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'ready' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (order.customer_email) {
        await notifyCustomer(order.customer_email, `Your order is ready`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Your order is ready! 🎉</h2>
            <p>Order #${order.id} from <strong>${truck.name}</strong> is ready for collection.</p>
            <p>Come and collect now — pay at the truck.</p>
            <p style="color:#64748b;font-size:13px">Powered by HatchGrab · hatchgrab.com</p>
          </body>`, truck.name)
      }
      return NextResponse.json({ success: true, status: 'ready' })
    }

    // ── COLLECTED ─────────────────────────────────────────────────────────────
    if (action === 'cooking') {
      await supabase.from('orders').update({ status: 'cooking' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      return NextResponse.json({ success: true, status: 'cooking' })
    }

    if (action === 'collected') {
      const now = new Date().toISOString()
      const { data: order } = await supabase.from('orders').select('slot, event_date, event_id, status').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      await supabase.from('orders').update({ status: 'collected', paid_at: now, collected_at: now }).eq('order_key', orderKey).eq('truck_id', truck.id)
      // Free kitchen usage on collect by REBUILDING the date's production_slot_usage from the live
      // orders (deterministic), not an incremental subtract. The order is now 'collected' so the
      // rebuild (buildUnitsFromOrders filters pending/confirmed/modified) excludes it → its capacity
      // is freed AND co-located orders in the same slot are preserved exactly. This replaces the old
      // removeOrderFromProductionSlot, whose read-only reseed could wipe co-located orders and drift.
      // Idempotent: re-firing (or completing an already-collected order) yields the same state.
      if (order?.event_date) {
        await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
      }
      return NextResponse.json({ success: true, status: 'collected' })
    }

    // ── UNDO COLLECTED ────────────────────────────────────────────────────────
    if (action === 'undo_collected') {
      const { data: order } = await supabase.from('orders').select('slot, event_date, event_id').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      // Re-book on undo by REBUILDING the date's production_slot_usage from the live orders, not an
      // incremental add. The order is now 'confirmed' so the rebuild includes it → re-booked exactly.
      // This replaces the old unguarded addOrderToProductionSlot, which re-booked unconditionally and
      // double-counted on a re-fire (we surface two undo entry points — toast + completed list). A
      // rebuild from live orders is naturally idempotent: firing it twice gives the identical slot state.
      if (order?.event_date) {
        await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
      }
      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    // ── EDIT ORDER ────────────────────────────────────────────────────────────
    if (action === 'edit') {
      const { items, slot, notes, deals: editedDeals, customerName, customerEmail, customerPhone } = editedOrder || {}
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

      // Recompute the total DEAL-AWARE from the EDITED items + deals — the same formula
      // Add Order uses (calculateOrderTotal): items subtotal + Σ(deal bundle_price + slot
      // modifiers), less the order's existing discount. The previous delta carried the
      // ORIGINAL order's deal contribution, so a newly-added/changed deal's price was
      // dropped and the stored total went stale. Recomputed from the persisted items+deals
      // so the total can never drift from the contents (identical to the Add Order path).
      const effItems = items || order.items || []
      const effDeals = editedDeals !== undefined ? editedDeals : (order.deals || [])
      const newItemsSubtotal = effItems.reduce((s: number, i: any) => s + parseFloat(i.unit_price) * parseFloat(i.quantity), 0)
      const { data: bundleRows } = await supabase.from('bundles_db').select('name, bundle_price').eq('truck_id', truck.id)
      const bundlePrice = (name: string) => Number(bundleRows?.find(b => b.name === name)?.bundle_price ?? 0)
      const dealsTotal = (effDeals || []).reduce((s: number, d: any) => {
        const modExtra = (Object.values(d.slotModifiers || {}) as any[]).flat().reduce((sm: number, m: any) => sm + (Number(m?.price) || 0), 0)
        return s + bundlePrice(d.name) + modExtra
      }, 0)
      const discountAmt = Number(order.discount_amt) || 0
      const newSubtotal = newItemsSubtotal
      const newTotal = Math.max(0, newItemsSubtotal + dealsTotal - discountAmt)

      // Persist deals in EXACTLY the Add Order shape {name, slots, slotModifiers, slotNotes,
      // price} — set price = bundle_price (what OrderCard's deal price column reads, the same
      // £15 the total uses) and drop UI-only fields (isNew / itemsTakenFromBasket). So an
      // edit-saved deal renders byte-identically to an Add-Order deal.
      const dealsToStore = editedDeals !== undefined
        ? (editedDeals as any[]).map(d => ({
            name: d.name, slots: d.slots, slotModifiers: d.slotModifiers, slotNotes: d.slotNotes,
            price: bundlePrice(d.name),
          }))
        : order.deals

      const newSlot = slot !== undefined ? slot : order.slot
      await supabase.from('orders').update({
        items:    items    || order.items,
        deals:    dealsToStore,
        slot:     newSlot,
        notes:    notes    !== undefined ? notes : order.notes,
        // Customer contact — all optional; blank clears to null. Preserve when not sent.
        // Blank name → the "Walk-up" sentinel (same default as the manual insert), so a
        // walk-up edited with the name left empty still reads "Walk-up", not blank.
        customer_name:  customerName  !== undefined ? ((customerName || '').trim() || 'Walk-up') : order.customer_name,
        customer_email: customerEmail !== undefined ? (customerEmail || null) : order.customer_email,
        customer_phone: customerPhone !== undefined ? (customerPhone || null) : order.customer_phone,
        total:    newTotal,
        subtotal: newSubtotal,
        status:   'modified',
      }).eq('order_key', orderKey)

      if (order.event_date && (items || slot !== undefined)) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        // REMOVE uses the PRIOR stored state (old items + old deals) to subtract exactly
        // what was previously booked. ADD uses the EDITED state — the SAME items+deals
        // written to the row above — so a deal CHANGE re-counts production usage correctly
        // (Gap 4). Deal constituents are counted via normaliseOrderLines' deals arg.
        const oldLines = normaliseOrderLines(order.items || [], order.deals)
        const newDeals = editedDeals !== undefined ? editedDeals : order.deals
        const newLines = normaliseOrderLines(items || order.items || [], newDeals)
        // No slot gate: order.slot / newSlot may be null (ASAP) — both resolve to the
        // event-start window inside the helpers, so old usage is freed and new re-booked.
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot, oldLines, itemCatMap
        )
        await addOrderToProductionSlot(
          supabase, truck.id, order.event_id, newSlot, newLines, itemCatMap
        )
      }

      if (order.customer_email) {
        const finalItems = items || order.items
        const finalDeals = editedDeals !== undefined ? editedDeals : (order.deals || [])
        // Route through the SHARED renderer (renderOrderLinesHtml) so the deal bundle price (£15)
        // and per-modifier prices (+£1.50) render — the inline fork omitted them. Ensure each deal
        // carries .price (bundlePrice is already resolved in this handler for newTotal/dealsToStore).
        const emailDeals = (finalDeals || []).map((d: any) => ({
          name: d.name,
          slots: d.slots || {},
          slotModifiers: d.slotModifiers || {},
          slotNotes: d.slotNotes || {},
          price: d.price != null ? Number(d.price) : bundlePrice(d.name),
        }))
        const linesHtml = renderOrderLinesHtml(finalItems || [], emailDeals)
        const slotToShow = slot !== undefined ? slot : order.slot
        const html = `<body style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1e293b">
            <h2>Your order has been updated ✓</h2>
            <p><strong>${truck.name}</strong> has updated order #${order.id}.</p>
            ${slotToShow ? `<p><strong>Collection time:</strong> ${slotToShow}</p>` : ''}
            <p style="font-size:12px;color:#64748b;margin-bottom:4px">Updated order:</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">
              ${linesHtml}
              <tr style="border-top:1px solid #e2e8f0">
                <td style="padding-top:8px;font-weight:700">New total</td>
                <td style="text-align:right;padding-top:8px;font-weight:700">£${newTotal.toFixed(2)}</td>
              </tr>
            </table>
            <p style="color:#94a3b8;font-size:12px">Pay at the truck on collection · Powered by HatchGrab · hatchgrab.com</p>
          </body>`
        // Send via the shared, HatchGrab-branded, Brevo-verified sender (same path as the
        // confirmation/new-order emails) — replaces the inline notifyCustomer (Village Foodie).
        await sendConfirmationEmail({
          to: order.customer_email,
          subject: `Order #${order.id} updated`,
          html,
          text: `${truck.name} has updated your order #${order.id}. New total £${newTotal.toFixed(2)}. Pay at the truck on collection. — HatchGrab`,
          truckName: truck.name,
        })
      }
      return NextResponse.json({ success: true, status: 'modified' })
    }

    // ── ITEM AVAILABILITY (sold out toggle) — PER-EVENT (Phase 5) ──────────────
    if (action === 'set_item_availability') {
      if (!itemName) return NextResponse.json({ error: 'itemName required' }, { status: 400 })
      const { event_id } = body
      if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
      // Omit stock_count → preserved on an existing row, defaults null on a new row (no ceiling
      // override). Writes only this event's row (onConflict event_id,item_name).
      await supabase.from('event_item_stock').upsert({
        truck_id:  truck.id,
        event_id,
        item_name: itemName,
        available: available !== false,
      }, { onConflict: 'event_id,item_name' })
      return NextResponse.json({ success: true, item: itemName, available })
    }

    // ── GET ITEM OVERRIDES — PER-EVENT (Phase 5) ───────────────────────────────
    if (action === 'get_item_overrides') {
      const { event_id } = body
      if (!event_id) return NextResponse.json({ success: true, soldOut: [] })
      const { data } = await supabase
        .from('event_item_stock').select('item_name')
        .eq('truck_id', truck.id).eq('event_id', event_id).eq('available', false)
      return NextResponse.json({ success: true, soldOut: (data || []).map((r: any) => r.item_name) })
    }

    // ── UPDATE EVENT TIMES ────────────────────────────────────────────────────
    if (action === 'update_event') {
      const { event_id, start_time, end_time, event_date } = body
      const date = event_date || new Date().toISOString().split('T')[0]
      if (event_id) {
        await supabase.from('truck_events')
          .update({ start_time, end_time, updated_at: new Date().toISOString() })
          .eq('id', event_id)
          .eq('truck_id', truck.id)
      } else {
        await supabase.from('truck_events')
          .insert({ truck_id: truck.id, event_date: date, start_time, end_time, source: 'manual' })
      }
      return NextResponse.json({ success: true })
    }

    // ── MANUAL ORDER ──────────────────────────────────────────────────────────
    if (action === 'manual') {
      const { customerName, customerPhone, customerEmail, slot, items, notes, discountAmt, total: passedTotal, subtotal, event_date: passedEventDate, event_id: passedEventId } = manualOrder
      const deals = manualOrder.deals ?? null
      if (!items?.length && !deals?.length) {
        return NextResponse.json({ error: 'Items required' }, { status: 400 })
      }
      const eventDate = passedEventDate || new Date().toISOString().split('T')[0]
      // Resolve event_id: prefer the explicit ID from the panel; fall back to a
      // truck_id + event_date lookup ONLY when exactly one event matches that date
      // (same-day multi-event would be ambiguous — leave null and let the display
      // fallback in the dashboard handle it).
      let orderEventId: string | null = passedEventId || null
      if (!orderEventId) {
        const { data: dateEvents } = await supabase
          .from('truck_events')
          .select('id')
          .eq('truck_id', truck.id)
          .eq('event_date', eventDate)
          .neq('status', 'cancelled')
        if (dateEvents?.length === 1) {
          orderEventId = dateEvents[0].id
        } else if ((dateEvents?.length ?? 0) > 1) {
          console.warn(`[manual] ${dateEvents!.length} events on ${eventDate} for truck ${truck.id} — leaving event_id null`)
        }
      }
      // Walk-up / manual orders ALWAYS confirm (Section 5): the operator is present and
      // knows the queue, so the manual path bypasses auto_accept and ALL capacity gating
      // (that gate lives only on the customer path / claimAvailableSlot). The order still
      // occupies the oven via addOrderToProductionSlot below — confirm always, occupy always.
      // Pass `deals` so a deal's cookable constituents (deals[].slots) count toward oven
      // capacity, exactly like standalone items — same shared extractor every other path
      // uses (submit/edit/rebuild). Without it, walk-up deal pizzas were dropped from the
      // incremental capacity write. Instant constituents are skipped later by projectOvenOccupancy.
      const manualLines = normaliseOrderLines(items || [], deals)
      const itemCatMap = await buildItemCatMap(supabase, truck.id)
      const total = (items || []).reduce((s: number, i: any) => s + (parseFloat(i.unit_price) * parseInt(i.quantity)), 0)
      // Informed-override flag: the operator only sees this AFTER an atomic check reported the
      // real shortfall, then consciously chooses to proceed. It does NOT skip the check.
      const override = manualOrder.override === true

      // ── Atomic stock guard + insert under the per-event lock (Stage 3) ──
      // SAME race-proof guarantee as the customer path: NO order inserts without holding the
      // lock AND (for a non-override submit) passing the stock check, so ACCIDENTAL oversell is
      // impossible. The ONLY oversell is a deliberate, INFORMED override — the check still RUNS
      // (the operator was shown the real remaining); override just inserts past the reported
      // shortfall. Contended past the retry budget → bail WITHOUT inserting (never unguarded).
      const haveLock = await acquireEventLock(truck.id, eventDate)
      let newOrderId = ''
      let manualOrderKey = ''
      try {
        if (!haveLock) {
          return NextResponse.json(
            { error: 'We are handling a lot of orders right now — please try again', retry: true },
            { status: 409 },
          )
        }

        // (a) STOCK CHECK — atomic (deal-inclusive). Null event → no-op (no event-scoped count
        //     possible; never block a null-event walk-up). On a shortfall WITHOUT override → do
        //     NOT insert; return the real per-item remaining so the operator can decide. With
        //     override:true → the operator has SEEN the shortfall and proceeds (informed oversell).
        if (orderEventId && !override) {
          const shortfall = await checkStockShortfall(truck.id, orderEventId, eventDate, manualLines, itemCatMap)
          if (shortfall) {
            return NextResponse.json({ error: 'Not enough stock', stock: true, items: shortfall }, { status: 409 })
          }
        }

        // (b) Display number (per-event, restarts at 1) — under the lock. order_key UUID is set
        //     by the column default. orderEventId may be null (ambiguous/no event) → truck fallback.
        try {
          newOrderId = await nextOrderId(orderEventId, truck.id)
        } catch (err: any) {
          console.error('[manual] order counter failed:', err.message)
          return NextResponse.json({ error: 'Failed to generate order ID' }, { status: 500 })
        }

        // (c) INSERT — walk-up/manual orders ALWAYS confirm (operator present). .select() returns
        //     the default-generated order_key for the cancel link.
        const { data: manualOrderRow, error: insertErr } = await supabase.from('orders').insert({
          id: newOrderId, truck_id: truck.id,
          customer_name: customerName || 'Walk-up', customer_phone: customerPhone || null,
          customer_email: customerEmail || null,
          slot: slot || null, order_type: 'collection', event_date: eventDate,
          event_id: orderEventId,
          items, deals, discount_code: null,
          subtotal: subtotal || total, discount_amt: discountAmt || 0, total: passedTotal || total,
          notes: notes || null, status: 'confirmed',
          payment_status: 'unpaid',
        }).select('order_key').single()
        if (insertErr || !manualOrderRow) {
          console.error('[manual] order insert failed:', insertErr?.message, insertErr?.details, insertErr?.hint)
          return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
        }
        manualOrderKey = manualOrderRow.order_key

        // (d) Occupy the oven window — under the lock. slot may be null (manual ASAP) → booked
        //     into this event's start window. orderEventId null → addOrderToProductionSlot skips.
        await addOrderToProductionSlot(supabase, truck.id, orderEventId, slot, manualLines, itemCatMap)
      } finally {
        if (haveLock) await releaseEventLock(truck.id, eventDate)
      }

      // Venue strictly by the resolved orderEventId (cross-event fix) — date+maybeSingle
      // returns the wrong/no row on multi-event dates. Fall back to date only when ambiguous
      // (orderEventId null), mirroring the order row that was just written.
      let manualEventQuery = supabase
        .from('truck_events')
        .select('venue_name, town, postcode')
        .eq('truck_id', truck.id)
      manualEventQuery = orderEventId
        ? manualEventQuery.eq('id', orderEventId)
        : manualEventQuery.eq('event_date', eventDate).neq('status', 'cancelled')
      const { data: manualEventRow } = await manualEventQuery.maybeSingle()

      const manualEmailItems = (items || []).map((i: any) => ({
        name: i.name,
        quantity: parseInt(i.quantity) || 1,
        unit_price: parseFloat(i.unit_price) || 0,
        modifiers: i.modifiers,
        specialInstructions: i.specialInstructions,
      }))

      if (customerEmail) {
        const { subject, html, text } = formatConfirmationEmail({
          orderId: newOrderId,
          orderKey: manualOrderKey,
          truckName: truck.name,
          customerName,
          slot: slot || null,
          items: manualEmailItems,
          deals: deals || [],
          discountAmt: manualOrder.discountAmt || 0,
          total: passedTotal || total,
          notes: notes || null,
          autoAccepted: true,
          venueName:              manualEventRow?.venue_name ?? null,
          venueTown:              manualEventRow?.town ?? null,
          venuePostcode:          manualEventRow?.postcode ?? null,
          preferredContactMethod: truck.preferred_contact_method ?? null,
          contactPhone:           truck.contact_phone ?? null,
          whatsappSender:         truck.whatsapp_sender ?? null,
          socialFacebook:         truck.social_facebook ?? null,
          socialInstagram:        truck.social_instagram ?? null,
          contactEmail:           truck.contact_email ?? null,
          allowCancellation:      truck.allow_customer_cancellation ?? true,
          cancellationCutoffMins: truck.cancellation_cutoff_mins ?? 30,
          baseUrl:                process.env.NEXT_PUBLIC_HATCHGRAB_URL,
          truckSlug:              truck.slug ?? undefined,
        })
        await sendConfirmationEmail({ to: customerEmail, subject, html, text, truckName: truck.name })
      }

      if (truck.contact_email) {
        // Truck gets the canonical 🔔 New order notification (shared builder) — the
        // SAME email the customer self-order path sends the truck. Never a copy of the
        // customer confirmation. The customer email above is unchanged.
        const { subject, html, text } = formatNewOrderEmail({
          orderId: newOrderId,
          customerName: customerName || 'Walk-up',
          customerPhone: customerPhone || null,
          slot: slot || null,
          items: manualEmailItems,
          deals: deals || [],
          total: passedTotal || total,
          notes: notes || null,
          venueName:     manualEventRow?.venue_name ?? null,
          venueTown:     manualEventRow?.town ?? null,
          venuePostcode: manualEventRow?.postcode ?? null,
          autoAccepted: true,
        })
        await sendConfirmationEmail({
          to: truck.contact_email,
          subject,
          html,
          text,
          truckName: truck.name,
          senderName: 'HatchGrab',
        })
      }

      return NextResponse.json({ success: true, orderId: newOrderId, autoConfirmed: true })
    }

    // ── GET STOCK ─────────────────────────────────────────────────────────────
    if (action === 'get_stock') {
      // Per-event (Phase 5): the dashboard shows the override for the SELECTED event so it edits and
      // displays the same per-event value. No event selected → no override rows + empty counts (shows
      // live Settings defaults). Reads are scoped by the SAME event_id the writes/guard/menu use.
      const eventId: string | null = body.eventId ?? null
      const [{ data: overrides }, { data: cats }, liveItemCounts, { data: menuItems }, { data: menuCats }] = await Promise.all([
        eventId
          ? supabase.from('event_item_stock')
              .select('item_name, available, stock_count, no_item_cap')
              .eq('truck_id', truck.id).eq('event_id', eventId)
          : Promise.resolve({ data: [] as any[] }),
        eventId
          ? supabase.from('event_category_stock')
              .select('category, stock_count')
              .eq('truck_id', truck.id).eq('event_id', eventId)
          : Promise.resolve({ data: [] as any[] }),
        eventId ? getLiveItemCounts(supabase, truck.id, eventId) : Promise.resolve({} as Record<string, number>),
        supabase.from('menu_items_db')
          .select('name, menu_categories!category_id(name)')
          .eq('truck_id', truck.id),
        supabase.from('menu_categories')
          .select('*')
          .eq('truck_id', truck.id),
      ])

      // Build item→category map from menu for category order counting
      const itemCatMap: Record<string, string> = {}
      for (const item of menuItems || []) {
        const cat = (item.menu_categories as any)?.name
        if (cat) itemCatMap[item.name] = cat
      }

      // Merge overrides + live counts; also include items that were ordered today
      // but have no explicit override row (so ordered counts show for everyone)
      const overrideMap: Record<string, any> = {}
      for (const r of overrides || []) overrideMap[r.item_name] = r

      const allNames = new Set([
        ...Object.keys(overrideMap),
        ...Object.keys(liveItemCounts),
      ])

      const stocks = Array.from(allNames)
        // Surface a row if it has sales, an explicit cap, OR a no_item_cap flag (follow-category state
        // has stock_count=null, so it must be included explicitly or the dashboard would miss it).
        .filter(name => (liveItemCounts[name] || 0) > 0 || overrideMap[name]?.stock_count != null || overrideMap[name]?.no_item_cap === true)
        .map(name => {
          const override = overrideMap[name]
          return {
            name,
            available:   override?.available ?? true,
            stock_count: override?.stock_count ?? null,
            no_item_cap: override?.no_item_cap ?? false,
            orders_count: liveItemCounts[name] || 0,
            category:    itemCatMap[name] ?? null,  // event_item_stock has no category — map via menu
          }
        })

      // Live category order counts
      const liveCatCounts: Record<string, number> = {}
      for (const [itemName, qty] of Object.entries(liveItemCounts)) {
        const cat = itemCatMap[itemName]
        if (cat) liveCatCounts[cat] = (liveCatCounts[cat] || 0) + qty
      }

      // category_stock row takes precedence; fall back to default_stock from menu_categories
      const catDefaultMap: Record<string, number | null> = {}
      for (const mc of menuCats || []) catDefaultMap[mc.name] = mc.default_stock ?? null

      const catStockMap: Record<string, number | null> = {}
      for (const r of cats || []) catStockMap[r.category] = r.stock_count

      // Build merged list: all categories that have either explicit stock or a default
      const allCatNames = new Set([
        ...Object.keys(catStockMap),
        ...Object.keys(catDefaultMap).filter(n => catDefaultMap[n] !== null),
        ...Object.keys(liveCatCounts),
      ])

      const categoryStocks = Array.from(allCatNames).map(category => ({
        category,
        stock_count:   catStockMap[category] ?? null,
        default_stock: catDefaultMap[category] ?? null,
        orders_count:  liveCatCounts[category] || 0,
      }))

      return NextResponse.json({ success: true, stocks, categoryStocks })
    }

    // ── SET MODIFIER OPTION AVAILABILITY ─────────────────────────────────────
    if (action === 'set_modifier_option_available') {
      const { optionId, available } = body
      if (!optionId) return NextResponse.json({ error: 'optionId required' }, { status: 400 })
      // Verify the option belongs to this truck via its group
      const { data: opt } = await supabase.from('modifier_options').select('group_id').eq('id', optionId).single()
      if (opt) {
        const { data: grp } = await supabase.from('modifier_groups').select('id').eq('id', opt.group_id).eq('truck_id', truck.id).single()
        if (!grp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        await supabase.from('modifier_options').update({ available: available !== false }).eq('id', optionId)
      }
      return NextResponse.json({ success: true })
    }

    // ── SET ITEM STOCK — PER-EVENT (Phase 5) ──────────────────────────────────
    if (action === 'set_stock') {
      const { itemName, available, stockCount, noItemCap, event_id } = body
      if (!itemName) return NextResponse.json({ error: 'itemName required' }, { status: 400 })
      if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
      // Writes stock_count, available AND no_item_cap together for THIS event. no_item_cap=true =
      // "follow category" (ceiling resolves to null); false + stock_count=null = "use default". This
      // is the RECOVERY path Phase 4 flagged: available !== false clears a prior enforce-set sold-out.
      // (event_item_stock has no category/updated_at columns.)
      await supabase.from('event_item_stock').upsert({
        truck_id:    truck.id,
        event_id,
        item_name:   itemName,
        available:   available !== false,
        stock_count: stockCount ?? null,
        no_item_cap: noItemCap === true,
      }, { onConflict: 'event_id,item_name' })
      return NextResponse.json({ success: true })
    }

    // ── SET CATEGORY STOCK — PER-EVENT (Phase 5) ──────────────────────────────
    if (action === 'set_category_stock') {
      const { category, stockCount, event_id } = body
      if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })
      if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
      await supabase.from('event_category_stock').upsert({
        truck_id:    truck.id,
        event_id,
        category,
        stock_count: stockCount ?? null,
      }, { onConflict: 'event_id,category' })
      return NextResponse.json({ success: true })
    }

    // ── DECREMENT STOCK ON ORDER ──────────────────────────────────────────────
    // NOTE: no live client caller (kept for completeness). enforceStockLimits is per-event (Phase 4)
    // — pass event_id from the body; it no-ops without one.
    if (action === 'decrement_stock') {
      const { categoryMap, event_id } = body
      // Live counts are read from the orders table — no counters to maintain.
      // categoryMap: { itemName: categoryName } from the caller.
      await enforceStockLimits(supabase, truck.id, event_id, categoryMap || {})
      return NextResponse.json({ success: true })
    }

    // ── adjust_slot ───────────────────────────────────────────────────────────
    if (action?.startsWith('adjust_slot_+')) {
      const mins = parseInt(action.replace('adjust_slot_+', ''))
      if (!orderKey || isNaN(mins)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
      const { data: ord } = await supabase.from('orders').select('id,slot,event_date,event_id,customer_email,customer_name,items,deals,total,notes,discount_amt').eq('order_key', orderKey).single()
      if (!ord?.slot) return NextResponse.json({ error: 'No slot' }, { status: 400 })
      const [h, m] = ord.slot.split(':').map(Number)
      const newTotal = h * 60 + m + mins
      const newSlot = `${String(Math.floor(newTotal / 60) % 24).padStart(2, '0')}:${String(newTotal % 60).padStart(2, '0')}`
      if (ord.event_date) {
        const full = await supabase.from('orders').select('items, deals').eq('order_key', orderKey).single()
        if (full.data) {
          const itemCatMap = await buildItemCatMap(supabase, truck.id)
          await moveSlotBooking(
            supabase, truck.id, ord.event_id, ord.slot, newSlot,
            normaliseOrderLines(full.data.items || [], full.data.deals), itemCatMap
          )
        }
      }
      await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('order_key', orderKey)
      // Notify customer of time change
      if (ord.customer_email) {
        const { data: slotEventRow } = await supabase
          .from('truck_events')
          .select('venue_name, town, postcode')
          .eq('truck_id', truck.id)
          .eq('event_date', ord.event_date)
          .neq('status', 'cancelled')
          .maybeSingle()
        const { html, text } = formatConfirmationEmail({
          orderId: ord.id,
          orderKey,
          customerName: ord.customer_name,
          truckName: truck.name,
          items: ord.items || [],
          deals: ord.deals || [],
          slot: newSlot,
          slotAdjustedFrom: ord.slot,
          discountAmt: ord.discount_amt ?? 0,
          total: Number(ord.total),
          notes: ord.notes ?? null,
          autoAccepted: true,
          venueName: slotEventRow?.venue_name ?? null,
          venueTown: slotEventRow?.town ?? null,
          venuePostcode: slotEventRow?.postcode ?? null,
          preferredContactMethod: truck.preferred_contact_method ?? null,
          contactPhone: truck.contact_phone ?? null,
          whatsappSender: truck.whatsapp_sender ?? null,
          socialFacebook: truck.social_facebook ?? null,
          socialInstagram: truck.social_instagram ?? null,
          contactEmail: truck.contact_email ?? null,
          allowCancellation: truck.allow_customer_cancellation ?? true,
          cancellationCutoffMins: truck.cancellation_cutoff_mins ?? 30,
          baseUrl: process.env.NEXT_PUBLIC_HATCHGRAB_URL,
          truckSlug: truck.slug ?? undefined,
        })
        await sendConfirmationEmail({
          to: ord.customer_email,
          subject: `Your order #${ord.id} has been updated`,
          html,
          text,
          senderName: truck.name,
        })
      }
      return NextResponse.json({ success: true, newSlot })
    }

    // ── update_keep_screen_on ─────────────────────────────────────────────────
    if (action === 'update_keep_screen_on') {
      const { keepScreenOn } = body
      await supabase.from('trucks').update({ keep_screen_on: !!keepScreenOn }).eq('id', truck.id)
      return NextResponse.json({ ok: true })
    }

    // ── set_auto_accept ──────────────────────────────────────────────────────
    if (action === 'set_auto_accept') {
      const { value } = body
      await supabase.from('trucks').update({ auto_accept: !!value }).eq('id', truck.id)
      return NextResponse.json({ success: true })
    }

    // ── set_paused ── EVENT-scoped (truck_events), not truck/van ───────────────
    if (action === 'set_paused') {
      const { paused_until, eventId } = body
      if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
      const resuming = !paused_until // null/undefined ⇒ "Resume orders"
      // Resume = operator forcing orders back on for THIS event → clear both the manual pause and
      // any offline auto-pause on the event. (If still genuinely offline, the heartbeat-monitor
      // re-applies online_paused_until on its next run for the live event; the heartbeat clears it
      // while the device beats.) Pause sets only paused_until, leaving any offline pause untouched.
      const patch = resuming
        ? { paused_until: null, online_paused_until: null }
        : { paused_until }
      await supabase.from('truck_events').update(patch).eq('id', eventId).eq('truck_id', truck.id)
      return NextResponse.json({ success: true })
    }

    // ── set_offline_protection ── EVENT-scoped offline_protection_override (truck_events) ──────────
    // SERVICE-ROLE write (the dashboard toggle used to write via the browser anon client, which RLS
    // silently no-op'd → the toggle never persisted). value: true (force on) / false (force off) /
    // null (reset to the van default). Disabling (false) ALSO clears any active offline auto-pause
    // (online_paused_until) for this event — "don't offline-pause this event" should take effect now,
    // not wait for the AND-gate with a leftover value. NEVER touches paused_until (a manual pause is
    // separate). Mirrors the set_paused clear, but offline-only.
    if (action === 'set_offline_protection') {
      const { value, eventId } = body
      if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
      if (value !== true && value !== false && value !== null) {
        return NextResponse.json({ error: 'value must be true, false, or null' }, { status: 400 })
      }
      const patch: Record<string, unknown> = { offline_protection_override: value }
      if (value === false) patch.online_paused_until = null // disabling clears the offline pause too
      const { error } = await supabase.from('truck_events').update(patch).eq('id', eventId).eq('truck_id', truck.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ── set_extra_wait ── EVENT-scoped (truck_events), not trucks ──────────────
    if (action === 'set_extra_wait') {
      const { eventId } = body
      if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
      const mins = parseInt(body.minutes) || 0
      await supabase.from('truck_events').update({
        extra_wait_mins: mins,
        extra_wait_started_at: mins > 0 ? new Date().toISOString() : null,
      }).eq('id', eventId).eq('truck_id', truck.id)
      return NextResponse.json({ success: true })
    }

    // ── SAVE PREP CONFIGS ─────────────────────────────────────────────────────
    if (action === 'save_prep_configs') {
      const configs: Record<string, { secs: number; batch: number }> = body.configs || {}
      const { data: cats } = await supabase
        .from('menu_categories')
        .select('id, name')
        .eq('truck_id', truck.id)
      for (const cat of (cats || [])) {
        const cfg = configs[cat.name.toLowerCase()]
        if (!cfg) continue
        await supabase.from('menu_categories').update({
          prep_secs: cfg.secs,
          batch_size: cfg.batch,
        }).eq('id', cat.id)
      }
      return NextResponse.json({ success: true })
    }

    // ── UPDATE CATEGORY ───────────────────────────────────────────────────────
    if (action === 'update_category') {
      const { categoryId, name, prep_secs, batch_size, allow_notes, counts_toward_capacity } = body
      if (!categoryId) return NextResponse.json({ error: 'categoryId required' }, { status: 400 })
      await supabase.from('menu_categories')
        // counts_toward_capacity only set when explicitly provided (the capacity tickbox) — a
        // prep/batch save omits it and must NOT reset it. undefined fields are dropped by the PATCH.
        .update({ name, prep_secs, batch_size, allow_notes, ...(counts_toward_capacity !== undefined ? { counts_toward_capacity: !!counts_toward_capacity } : {}) })
        .eq('id', categoryId)
        .eq('truck_id', truck.id)
      return NextResponse.json({ success: true })
    }

    // ── GET EVENTS ────────────────────────────────────────────────────────────
    if (action === 'get_events') {
      const today = new Date().toISOString().split('T')[0]
      const { data: events } = await supabase
        .from('truck_events')
        .select('id, event_date, start_time, end_time, venue_name')
        .eq('truck_id', truck.id)
        .neq('status', 'cancelled')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(20)
      return NextResponse.json({ success: true, events: events || [] })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (err: any) {
    console.error('Dashboard action error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}