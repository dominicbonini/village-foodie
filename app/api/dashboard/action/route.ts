// app/api/dashboard/action/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { formatConfirmationEmail, sendConfirmationEmail } from '@/lib/email'
import {
  addOrderToProductionSlot,
  removeOrderFromProductionSlot,
  moveSlotBooking,
  buildItemCatMap,
  getProductionSlotUnits,
  normaliseOrderLines,
  deriveProductionSlot,
} from '@/lib/slot-bookings'
import { orderItemsToQtyByCat } from '@/lib/slot-capacity'
import { projectOrderTailWindow } from '@/lib/slot-availability'
import { generateCollectionTimes } from '@/lib/slot-generation'
import { buildCatConfigs } from '@/lib/prep-utils'
import { nextOrderId } from '@/lib/order-utils'
import { getLiveItemCounts, enforceStockLimits } from '@/lib/stock-availability'

async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).eq('active', true).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}

async function notifyCustomer(email: string, subject: string, html: string, truckName?: string) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey || !email) return
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: truckName || 'Village Foodie', email: 'donotreply@villagefoodie.co.uk' },
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
      await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey)
      if (order.customer_email) {
        const { data: eventRow } = await supabase
          .from('truck_events')
          .select('venue_name, town, postcode')
          .eq('truck_id', truck.id)
          .eq('event_date', order.event_date)
          .neq('status', 'cancelled')
          .maybeSingle()
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
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'rejected' }).eq('order_key', orderKey)
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
        await notifyCustomer(order.customer_email, `Order #${order.id} update`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Order update</h2>
            <p>Unfortunately <strong>${truck.name}</strong> is unable to fulfil order #${order.id}.</p>
            <p>Please order at the truck on arrival. Sorry for the inconvenience.</p>
            <p style="color:#64748b;font-size:13px">Powered by Village Foodie · villagefoodie.co.uk</p>
          </body>`, truck.name)
      }
      return NextResponse.json({ success: true, status: 'rejected' })
    }

    // ── CANCEL ────────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const { cancellationReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancellationReason || null }).eq('order_key', orderKey)
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
            <p style="color:#94a3b8;font-size:12px">Powered by Village Foodie · villagefoodie.co.uk</p>
          </body>`, truck.name)
      }
      return NextResponse.json({ success: true, status: 'cancelled' })
    }

    // ── READY ─────────────────────────────────────────────────────────────────
    if (action === 'ready') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'ready' }).eq('order_key', orderKey)
      if (order.customer_email) {
        await notifyCustomer(order.customer_email, `Your order is ready`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Your order is ready! 🎉</h2>
            <p>Order #${order.id} from <strong>${truck.name}</strong> is ready for collection.</p>
            <p>Come and collect now — pay at the truck.</p>
            <p style="color:#64748b;font-size:13px">Powered by Village Foodie · villagefoodie.co.uk</p>
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
      // Gap 1: free kitchen usage on collect. Fire for ANY still-booked prior state
      // — including cooking/ready, which the old {pending,confirmed,modified} guard
      // skipped, leaking units forever. Excluding terminal states (cancelled/rejected/
      // collected) keeps it idempotent: those are already unbooked, and a second
      // subtract would wrongly remove co-located orders' items from the slot total.
      const BOOKED_STATES = ['pending', 'confirmed', 'modified', 'cooking', 'ready']
      if (order?.event_date && BOOKED_STATES.includes(order.status)) {
        const full = await supabase.from('orders').select('items, deals').eq('order_key', orderKey).single()
        if (full.data) {
          const itemCatMap = await buildItemCatMap(supabase, truck.id)
          await removeOrderFromProductionSlot(
            supabase, truck.id, order.event_id, order.slot,
            normaliseOrderLines(full.data.items || [], full.data.deals), itemCatMap
          )
        }
      }
      return NextResponse.json({ success: true, status: 'collected' })
    }

    // ── UNDO COLLECTED ────────────────────────────────────────────────────────
    if (action === 'undo_collected') {
      const { data: order } = await supabase.from('orders').select('slot, event_date, event_id').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (order?.event_date) {
        // re-book on undo; order.slot may be null (ASAP) → event-start window
        const full = await supabase.from('orders').select('items, deals').eq('order_key', orderKey).single()
        if (full.data) {
          const itemCatMap = await buildItemCatMap(supabase, truck.id)
          await addOrderToProductionSlot(
            supabase, truck.id, order.event_id, order.slot,
            normaliseOrderLines(full.data.items || [], full.data.deals), itemCatMap
          )
        }
      }
      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    // ── EDIT ORDER ────────────────────────────────────────────────────────────
    if (action === 'edit') {
      const { items, slot, notes, deals: editedDeals } = editedOrder || {}
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

      const originalItemsSubtotal = (order.items || []).reduce((s: number, i: any) => s + parseFloat(i.unit_price) * parseFloat(i.quantity), 0)
      const dealContribution = Number(order.total) - originalItemsSubtotal

      const newItemsSubtotal = items
        ? items.reduce((s: number, i: any) => s + parseFloat(i.unit_price) * parseFloat(i.quantity), 0)
        : originalItemsSubtotal
      const newSubtotal = newItemsSubtotal
      const newTotal = Math.max(0, newItemsSubtotal + dealContribution)

      const newSlot = slot !== undefined ? slot : order.slot
      await supabase.from('orders').update({
        items:    items    || order.items,
        deals:    editedDeals !== undefined ? editedDeals : order.deals,
        slot:     newSlot,
        notes:    notes    !== undefined ? notes : order.notes,
        total:    newTotal,
        subtotal: newSubtotal,
        status:   'modified',
      }).eq('order_key', orderKey)

      if (order.event_date && (items || slot !== undefined)) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        const oldLines = normaliseOrderLines(order.items || [], order.deals)
        // TODO(Gap 4): newLines reuses order.deals even when editedDeals changes the
        // deal — a deal edit can miscount production usage. Left as-is for this pass.
        const newLines = normaliseOrderLines(items || order.items || [], order.deals)
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
        const updatedItemRows = finalItems.map((i: any) => {
          const modRows = (i.modifiers||[]).map((m: any) =>
            `<tr><td colspan="2" style="padding:1px 0 1px 14px;font-size:12px;color:#64748b">+ ${m.name}${m.price>0?` +£${m.price.toFixed(2)}`:''}</td></tr>`
          ).join('')
          const noteRow = i.specialInstructions ? `<tr><td colspan="2" style="padding:1px 0 3px 14px;font-size:12px;color:#64748b;font-style:italic">📝 ${i.specialInstructions}</td></tr>` : ''
          return `<tr><td style="padding:3px 0 1px;color:#475569">${i.quantity}× ${i.name}</td><td style="text-align:right;padding:3px 0 1px">£${(parseFloat(i.unit_price)*parseFloat(i.quantity)).toFixed(2)}</td></tr>${modRows}${noteRow}`
        }).join('')
        const updatedDealRows = finalDeals.map((d: any) => {
          const slotNames = Object.values(d.slots||{}).filter(Boolean).join(', ')
          const subRows = Object.entries(d.slots||{}).flatMap(([cat, itemName]: [string, any]) => {
            if (!itemName) return []
            const rows: string[] = []
            const mods = (d.slotModifiers||{})[cat]||[]
            if (mods.length) rows.push(`<tr><td colspan="2" style="padding:1px 0 1px 14px;font-size:12px;color:#64748b">↳ ${itemName}: ${mods.map((m: any) => `+ ${m.name}`).join(', ')}</td></tr>`)
            const note = (d.slotNotes||{})[cat]
            if (note) rows.push(`<tr><td colspan="2" style="padding:1px 0 1px 14px;font-size:12px;color:#64748b;font-style:italic">↳ ${itemName}: 📝 ${note}</td></tr>`)
            return rows
          }).join('')
          return `<tr><td colspan="2" style="padding:3px 0 1px;color:#d97706">🎁 ${d.name}: ${slotNames}</td></tr>${subRows}`
        }).join('')
        const slotToShow = slot !== undefined ? slot : order.slot
        await notifyCustomer(order.customer_email, `Order #${order.id} updated`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Your order has been updated ✓</h2>
            <p><strong>${truck.name}</strong> has updated order #${order.id}.</p>
            ${slotToShow ? `<p><strong>Collection time:</strong> ${slotToShow}</p>` : ''}
            <p style="font-size:12px;color:#64748b;margin-bottom:4px">Updated order:</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">
              ${updatedItemRows}
              ${updatedDealRows}
              <tr style="border-top:1px solid #e2e8f0">
                <td style="padding-top:8px;font-weight:700">New total</td>
                <td style="text-align:right;padding-top:8px;font-weight:700">£${newTotal.toFixed(2)}</td>
              </tr>
            </table>
            <p style="color:#64748b;font-size:13px">Pay at the truck on collection · Powered by Village Foodie</p>
          </body>`, truck.name)
      }
      return NextResponse.json({ success: true, status: 'modified' })
    }

    // ── ITEM AVAILABILITY (sold out toggle) ───────────────────────────────────
    if (action === 'set_item_availability') {
      if (!itemName) return NextResponse.json({ error: 'itemName required' }, { status: 400 })
      await supabase.from('item_overrides').upsert({
        truck_id:   truck.id,
        item_name:  itemName,
        available:  available !== false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'truck_id,item_name' })
      return NextResponse.json({ success: true, item: itemName, available })
    }

    // ── GET ITEM OVERRIDES ────────────────────────────────────────────────────
    if (action === 'get_item_overrides') {
      const { data } = await supabase
        .from('item_overrides').select('item_name, available')
        .eq('truck_id', truck.id).eq('available', false)
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
      let autoConfirm = true
      const manualLines = normaliseOrderLines(items || [])
      const itemCatMap = await buildItemCatMap(supabase, truck.id)
      const catConfigs = await buildCatConfigs(supabase, truck.id)
      // Need a concrete event_id to read this event's (un-pooled) production usage. An
      // ambiguous date leaves orderEventId null → skip the capacity gate (autoConfirm).
      if (slot && orderEventId) {
        // Same oven-occupancy projection the dots/claim use: autoConfirm only if this
        // order's TAIL-COMPLETION (last item cooked, given the queue) is by the chosen
        // slot. If it can't be ready by then → pending (operator can still confirm).
        // kitchen_capacity comes live from the event's van; slot_capacity unused.
        const [{ data: staticTimes }, slotUnits, { data: evRow }] = await Promise.all([
          supabase.from('collection_times').select('collection_time, production_slot').eq('truck_id', truck.id).order('collection_time', { ascending: true }),
          getProductionSlotUnits(supabase, truck.id, orderEventId),
          supabase.from('truck_events').select('start_time, end_time, van_id').eq('truck_id', truck.id).eq('event_date', eventDate).neq('status', 'cancelled').order('start_time', { ascending: true }).limit(1).maybeSingle(),
        ])
        let kitchenCapacity: number | null = null
        if (evRow?.van_id) {
          const { data: van } = await supabase.from('truck_vans').select('kitchen_capacity').eq('id', evRow.van_id).single()
          kitchenCapacity = van?.kitchen_capacity ?? null
        }
        const iv = truck.collection_interval_mins ?? 0
        const dur = truck.slot_duration_mins ?? iv
        const times = staticTimes?.length
          ? staticTimes
          : (evRow?.start_time && evRow?.end_time && iv > 0 ? generateCollectionTimes(evRow.start_time, evRow.end_time, iv, dur) : [])
        if (times.length) {
          const windowSecs = (dur > 0 ? dur : iv > 0 ? iv : 5) * 60
          const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
          const tail = projectOrderTailWindow(times, slotUnits, catConfigs, kitchenCapacity, windowSecs, orderItemsToQtyByCat(manualLines, itemCatMap), slot)
          if (tail && toMins(tail) > toMins(slot)) autoConfirm = false
        }
      }
      // Display number (per-event, restarts at 1) — order_key UUID is set by the
      // column default. orderEventId may be null (ambiguous/no event) → truck fallback.
      let newOrderId: string
      try {
        newOrderId = await nextOrderId(orderEventId, truck.id)
      } catch (err: any) {
        console.error('[manual] order counter failed:', err.message)
        return NextResponse.json({ error: 'Failed to generate order ID' }, { status: 500 })
      }
      const total = (items || []).reduce((s: number, i: any) => s + (parseFloat(i.unit_price) * parseInt(i.quantity)), 0)
      // .select() returns the default-generated order_key for the cancel link.
      const { data: manualOrderRow, error: insertErr } = await supabase.from('orders').insert({
        id: newOrderId, truck_id: truck.id,
        customer_name: customerName || 'Walk-up', customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        slot: slot || null, order_type: 'collection', event_date: eventDate,
        event_id: orderEventId,
        items, deals, discount_code: null,
        subtotal: subtotal || total, discount_amt: discountAmt || 0, total: passedTotal || total,
        notes: notes || null, status: autoConfirm ? 'confirmed' : 'pending',
        payment_status: 'unpaid',
      }).select('order_key').single()
      if (insertErr || !manualOrderRow) {
        console.error('[manual] order insert failed:', insertErr?.message, insertErr?.details, insertErr?.hint)
        return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
      }
      const manualOrderKey = manualOrderRow.order_key

      // slot may be null (manual ASAP) → booked into this event's start window.
      // orderEventId null (ambiguous/no event) → addOrderToProductionSlot skips it.
      await addOrderToProductionSlot(supabase, truck.id, orderEventId, slot, manualLines, itemCatMap)

      const { data: manualEventRow } = await supabase
        .from('truck_events')
        .select('venue_name, town, postcode')
        .eq('truck_id', truck.id)
        .eq('event_date', eventDate)
        .neq('status', 'cancelled')
        .maybeSingle()

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
        const { subject, html, text } = formatConfirmationEmail({
          orderId: newOrderId,
          orderKey: manualOrderKey,
          truckName: truck.name,
          customerName: customerName || 'Walk-up',
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
        await sendConfirmationEmail({
          to: truck.contact_email,
          subject: `[Order copy] ${subject}`,
          html,
          text,
          truckName: truck.name,
          senderName: 'HatchGrab',
        })
      }

      return NextResponse.json({ success: true, orderId: newOrderId, autoConfirmed: autoConfirm, slotFull: !autoConfirm })
    }

    // ── GET STOCK ─────────────────────────────────────────────────────────────
    if (action === 'get_stock') {
      const today = new Date().toISOString().split('T')[0]
      const [{ data: overrides }, { data: cats }, liveItemCounts, { data: menuItems }, { data: menuCats }] = await Promise.all([
        supabase.from('item_overrides')
          .select('item_name, available, stock_count, category')
          .eq('truck_id', truck.id),
        supabase.from('category_stock')
          .select('category, stock_count')
          .eq('truck_id', truck.id).eq('date', today),
        getLiveItemCounts(supabase, truck.id, today),
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
        .filter(name => (liveItemCounts[name] || 0) > 0 || overrideMap[name]?.stock_count != null)
        .map(name => {
          const override = overrideMap[name]
          return {
            name,
            available:   override?.available ?? true,
            stock_count: override?.stock_count ?? null,
            orders_count: liveItemCounts[name] || 0,
            category:    override?.category ?? itemCatMap[name] ?? null,
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

    // ── SET ITEM STOCK ────────────────────────────────────────────────────────
    if (action === 'set_stock') {
      const { itemName, available, stockCount, category } = body
      if (!itemName) return NextResponse.json({ error: 'itemName required' }, { status: 400 })
      await supabase.from('item_overrides').upsert({
        truck_id:    truck.id,
        item_name:   itemName,
        available:   available !== false,
        stock_count: stockCount ?? null,
        category:    category ?? null,
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'truck_id,item_name' })
      return NextResponse.json({ success: true })
    }

    // ── SET CATEGORY STOCK ────────────────────────────────────────────────────
    if (action === 'set_category_stock') {
      const { category, stockCount } = body
      if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })
      const today = new Date().toISOString().split('T')[0]
      await supabase.from('category_stock').upsert({
        truck_id:    truck.id,
        category,
        stock_count: stockCount ?? null,
        date:        today,
      }, { onConflict: 'truck_id,category,date' })
      return NextResponse.json({ success: true })
    }

    // ── DECREMENT STOCK ON ORDER ──────────────────────────────────────────────
    if (action === 'decrement_stock') {
      const { categoryMap } = body
      const today = new Date().toISOString().split('T')[0]
      // Live counts are read from the orders table — no counters to maintain.
      // categoryMap: { itemName: categoryName } from the caller.
      await enforceStockLimits(supabase, truck.id, today, categoryMap || {})
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

    // ── set_paused ───────────────────────────────────────────────────────────
    if (action === 'set_paused') {
      const { paused_until, vanId } = body
      if (vanId) {
        await supabase.from('truck_vans').update({ paused_until: paused_until ?? null }).eq('id', vanId).eq('truck_id', truck.id)
      } else {
        await supabase.from('trucks').update({ paused_until: paused_until ?? null }).eq('id', truck.id)
      }
      return NextResponse.json({ success: true })
    }

    // ── set_extra_wait ────────────────────────────────────────────────────────
    if (action === 'set_extra_wait') {
      const mins = parseInt(body.minutes) || 0
      await supabase.from('trucks').update({
        extra_wait_mins: mins,
        extra_wait_started_at: mins > 0 ? new Date().toISOString() : null,
      }).eq('id', truck.id)
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
      const { categoryId, name, prep_secs, batch_size, allow_notes } = body
      if (!categoryId) return NextResponse.json({ error: 'categoryId required' }, { status: 400 })
      await supabase.from('menu_categories')
        .update({ name, prep_secs, batch_size, allow_notes })
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