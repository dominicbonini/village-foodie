// app/api/orders/submit/route.ts
// Receives order from the frontend, saves to Supabase,
// fires WhatsApp to truck and email confirmation to customer

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendWhatsApp, logMessage } from '@/lib/twilio'
import { calculateOrderTotal, validateOrderTotals } from '@/lib/order-calculations'
import {
  addOrderToProductionSlot,
  getProductionSlotUnits,
  buildItemCatMap,
} from '@/lib/slot-bookings'
import { canFitInProductionSlot, orderItemsToQtyByCat } from '@/lib/slot-capacity'
import { generateCollectionTimes } from '@/lib/slot-generation'
import type { CatConfig } from '@/lib/prep-utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  name: string
  quantity: number
  unit_price: number
  modifiers?: { name: string; price: number }[]
  specialInstructions?: string
}

interface AppliedDeal {
  name: string
  slots: Record<string, string>
  slotModifiers?: Record<string, { name: string; price: number }[]>
  slotNotes?: Record<string, string>
}

// ─── Order ID generator ───────────────────────────────────────────────────────

async function nextOrderId(truckId: string): Promise<string> {
  const { data, error } = await supabase.rpc('increment_order_counter', {
    p_truck_id: truckId,
  })
  if (error) throw new Error(`Order counter failed: ${error.message}`)
  return String(data).padStart(4, '0')
}

// ─── WhatsApp message formatter ───────────────────────────────────────────────

function formatWhatsAppOrder(params: {
  orderId: string
  truckName: string
  customerName: string
  customerPhone: string
  customerEmail: string
  slot: string | null
  eventDate: string
  items: OrderItem[]
  deals: AppliedDeal[]
  discountCode: string | null
  discountAmt: number
  total: number
  notes: string | null
}): string {
  const divider = '─────────────────────────────'
  const lines: string[] = [
    `*NEW ORDER — #${params.orderId}*`,
    `${params.truckName}`,
    params.slot ? `Collection: ${params.slot}` : `Date: ${params.eventDate}`,
    '',
    `*${params.customerName}*`,
    `📞 ${params.customerPhone}`,
    `📧 ${params.customerEmail}`,
    '',
  ]

  params.items.forEach(item => {
    const lineTotal = (item.unit_price * item.quantity).toFixed(2)
    lines.push(`  ${item.quantity}× ${item.name.padEnd(20)} £${lineTotal}`)
  })

  if (params.deals.length > 0) {
    lines.push('')
    params.deals.forEach(deal => {
      lines.push(`  🎁 ${deal.name}`)
      Object.entries(deal.slots).forEach(([cat, item]) => {
        if (item) lines.push(`     ${cap(cat)}: ${item}`)
      })
    })
  }

  lines.push(divider)

  if (params.discountCode && params.discountAmt > 0) {
    lines.push(`  Code ${params.discountCode}`.padEnd(28) + `-£${params.discountAmt.toFixed(2)}`)
  }

  lines.push(`  *TOTAL${' '.repeat(22)}£${params.total.toFixed(2)}*`)

  if (params.notes) {
    lines.push('')
    lines.push(`📝 ${params.notes}`)
  }

  lines.push('')
  lines.push(`Reply:`)
  lines.push(`  CONFIRM ${params.orderId}`)
  lines.push(`  REJECT ${params.orderId}`)
  lines.push(`  MODIFY ${params.orderId} SLOT`)
  lines.push(`  MODIFY ${params.orderId} ITEM [item] SUB [sub]`)
  lines.push(`  MODIFY ${params.orderId} ITEM [item] REMOVE`)

  return lines.join('\n')
}

// ─── Email confirmation formatter ─────────────────────────────────────────────

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function allOrderLines(
  items: OrderItem[],
  deals: AppliedDeal[] | null | undefined
): { name: string; quantity: number }[] {
  const lines = items.map(i => ({ name: i.name, quantity: i.quantity }))
  ;(deals || []).forEach(d => {
    Object.values(d.slots || {}).filter(Boolean).forEach(name => {
      lines.push({ name, quantity: 1 })
    })
  })
  return lines
}


async function buildCatConfigs(truckId: string): Promise<Record<string, CatConfig>> {
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('name, prep_secs, batch_size')
    .eq('truck_id', truckId)
  const catConfigs: Record<string, CatConfig> = {}
  ;(categories || []).forEach(c => {
    catConfigs[c.name.toLowerCase()] = {
      secs: c.prep_secs || 0,
      batch: c.batch_size || 1,
    }
  })
  return catConfigs
}

/** Resolve collection slot after auto-accept; bump if production window is batch-full. */
async function resolveAutoAcceptSlot(
  truckId: string,
  eventDate: string,
  requestedSlot: string,
  orderLines: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>,
  catConfigs: Record<string, CatConfig>,
  eventStartTime?: string | null,
  eventEndTime?: string | null,
  intervalMins?: number,
  slotDurationMins?: number,
): Promise<{ confirmedSlot: string; slotChanged: boolean; canConfirm: boolean }> {
  const [{ data: staticTimes }, { data: capacities }, slotUnits] = await Promise.all([
    supabase
      .from('collection_times')
      .select('collection_time, production_slot')
      .eq('truck_id', truckId)
      .order('collection_time', { ascending: true }),
    supabase
      .from('slot_capacity')
      .select('slot, max_orders')
      .eq('truck_id', truckId)
      .eq('event_date', eventDate),
    getProductionSlotUnits(supabase, truckId, eventDate),
  ])

  // Prefer dynamic slot generation from event times when static table is empty
  const iv = intervalMins ?? 0
  const dur = slotDurationMins ?? iv
  const times =
    staticTimes?.length
      ? staticTimes
      : eventStartTime && eventEndTime && iv > 0
        ? generateCollectionTimes(eventStartTime, eventEndTime, iv, dur)
        : []

  const capacityMap = Object.fromEntries((capacities || []).map(c => [c.slot, c.max_orders]))
  const timeEntry = times.find(t => t.collection_time === requestedSlot)
  if (!timeEntry) {
    return { confirmedSlot: requestedSlot, slotChanged: false, canConfirm: true }
  }

  const trySlot = (collectionTime: string, productionSlot: string) =>
    canFitInProductionSlot(
      slotUnits[productionSlot] || {},
      orderLines,
      itemCatMap,
      capacityMap[productionSlot] || 999,
      catConfigs
    )

  if (trySlot(requestedSlot, timeEntry.production_slot)) {
    return { confirmedSlot: requestedSlot, slotChanged: false, canConfirm: true }
  }

  const requestedMins = timeToMins(requestedSlot)
  const sorted = (times || [])
    .filter(t => timeToMins(t.collection_time) > requestedMins)
    .sort((a, b) => timeToMins(a.collection_time) - timeToMins(b.collection_time))

  for (const s of sorted) {
    if (trySlot(s.collection_time, s.production_slot)) {
      return {
        confirmedSlot: s.collection_time,
        slotChanged: s.collection_time !== requestedSlot,
        canConfirm: true,
      }
    }
  }

  return { confirmedSlot: requestedSlot, slotChanged: false, canConfirm: false }
}

function formatConfirmationEmail(params: {
  orderId: string
  truckName: string
  customerName: string
  slot: string | null
  requestedSlot?: string | null
  slotChanged?: boolean
  items: OrderItem[]
  deals: AppliedDeal[]
  discountAmt: number
  total: number
  notes: string | null
  autoAccepted?: boolean
}): { subject: string; html: string; text: string } {
  const subject = params.autoAccepted
    ? `Order #${params.orderId} confirmed`
    : `Order #${params.orderId} received`

  const itemRows = params.items.map(item => {
    const modRows = (item.modifiers || []).map(m =>
      `<tr><td colspan="2" style="padding:1px 0 1px 16px;font-size:12px;color:#64748b">+ ${m.name}${m.price > 0 ? ` <span style="color:#ea580c">+£${m.price.toFixed(2)}</span>` : ''}</td></tr>`
    ).join('')
    const noteRow = item.specialInstructions
      ? `<tr><td colspan="2" style="padding:1px 0 4px 16px;font-size:12px;color:#64748b;font-style:italic">📝 ${item.specialInstructions}</td></tr>`
      : ''
    return `<tr>
      <td style="padding:4px 0 2px;color:#475569">${item.quantity}× ${item.name}</td>
      <td style="text-align:right;padding:4px 0 2px;color:#1e293b;font-weight:500">£${(item.unit_price * item.quantity).toFixed(2)}</td>
    </tr>${modRows}${noteRow}`
  }).join('')

  const dealRows = params.deals.map(deal => {
    const slotNames = Object.values(deal.slots).filter(Boolean)
    const slotMods = deal.slotModifiers || {}
    const slotNotes = deal.slotNotes || {}
    const subRows = Object.entries(deal.slots).flatMap(([cat, itemName]) => {
      if (!itemName) return []
      const rows: string[] = []
      const mods = slotMods[cat] || []
      if (mods.length > 0) {
        const modStr = mods.map(m => `+ ${m.name}${m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}`).join(', ')
        rows.push(`<tr><td colspan="2" style="padding:1px 0 1px 16px;font-size:12px;color:#64748b">↳ ${itemName}: ${modStr}</td></tr>`)
      }
      const note = slotNotes[cat]
      if (note) {
        rows.push(`<tr><td colspan="2" style="padding:1px 0 1px 16px;font-size:12px;color:#64748b;font-style:italic">↳ ${itemName}: 📝 ${note}</td></tr>`)
      }
      return rows
    }).join('')
    return `<tr><td colspan="2" style="padding:4px 0 2px;color:#d97706;font-size:13px">🎁 ${deal.name}: ${slotNames.join(', ')}</td></tr>${subRows}`
  }).join('')

  const discountRow = params.discountAmt > 0
    ? `<tr><td style="color:#16a34a;padding:4px 0">Discount</td><td style="text-align:right;color:#16a34a">-£${params.discountAmt.toFixed(2)}</td></tr>`
    : ''

  const slotSection = params.slot ? `
    <div style="background:${params.autoAccepted ? '#f0fdf4' : '#fff7ed'};border:1px solid ${params.autoAccepted ? '#bbf7d0' : '#fed7aa'};border-radius:10px;padding:12px;margin-top:12px">
      <p style="margin:0;font-size:14px;color:${params.autoAccepted ? '#166534' : '#92400e'}">
        ${params.autoAccepted
          ? params.slotChanged && (params.requestedSlot ?? params.slot)
            ? `<strong>Sorry, your ${params.requestedSlot ?? params.slot} slot was taken.</strong><br><span style="font-size:12px">Your order will be ready at <strong>${params.slot}</strong>.</span>`
            : `<strong>Order confirmed — collection time ${params.slot}</strong><br><span style="font-size:12px">Your order has been confirmed. See you at the hatch!</span>`
          : `<strong>Preferred collection time: ${params.slot}</strong><br><span style="font-size:12px">${params.truckName} will confirm your collection time when they accept your order.</span>`
        }
      </p>
    </div>` : ''

  const notesSection = params.notes ? `
    <div style="margin-top:12px;padding:10px;background:#f8fafc;border-radius:8px;font-size:13px;color:#64748b">
      <strong>Special instructions:</strong> ${params.notes}
    </div>` : ''

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1e293b;background:#ffffff">

  <div style="text-align:center;padding:20px 0 16px">
    <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:24px;line-height:56px">✓</div>
    <h1 style="font-size:22px;font-weight:800;margin:0 0 4px">Order received!</h1>
    <p style="color:#64748b;margin:0;font-size:14px">from <strong>${params.truckName}</strong></p>
  </div>

  <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:12px">
    <p style="margin:0 0 10px;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;letter-spacing:0.06em">Order #${params.orderId}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${itemRows}
      ${dealRows}
      ${discountRow}
      <tr style="border-top:1px solid #e2e8f0">
        <td style="padding-top:10px;font-weight:800;font-size:15px">Total</td>
        <td style="text-align:right;padding-top:10px;font-weight:800;font-size:15px">£${params.total.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  ${slotSection}
  ${notesSection}

  <div style="background:#f1f5f9;border-radius:10px;padding:12px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:13px;color:#64748b">
      <strong style="color:#1e293b">Pay at the truck on collection</strong><br>
      No card details needed.
    </p>
  </div>

  <p style="text-align:center;margin-top:20px;font-size:11px;color:#94a3b8">
    Powered by <a href="https://villagefoodie.co.uk" style="color:#ea580c;text-decoration:none;font-weight:700">Village Foodie</a>
  </p>

</body>
</html>`

  const text = [
    `Order #${params.orderId} received — ${params.truckName}`,
    '',
    params.items.map(i => {
      const lines = [`${i.quantity}x ${i.name} — £${(i.unit_price * i.quantity).toFixed(2)}`]
      if (i.modifiers?.length) lines.push(`  + ${i.modifiers.map(m => m.name + (m.price > 0 ? ` +£${m.price.toFixed(2)}` : '')).join(', ')}`)
      if (i.specialInstructions) lines.push(`  📝 ${i.specialInstructions}`)
      return lines.join('\n')
    }).join('\n'),
    params.deals.length ? params.deals.map(d => {
      const lines = [`🎁 ${d.name}: ${Object.values(d.slots).filter(Boolean).join(', ')}`]
      Object.entries(d.slots || {}).forEach(([cat, itemName]) => {
        if (!itemName) return
        const mods = (d.slotModifiers || {})[cat] || []
        if (mods.length) lines.push(`  ↳ ${itemName}: ${mods.map(m => `+ ${m.name}`).join(', ')}`)
        const note = (d.slotNotes || {})[cat]
        if (note) lines.push(`  ↳ ${itemName}: 📝 ${note}`)
      })
      return lines.join('\n')
    }).join('\n') : '',
    params.discountAmt > 0 ? `Discount: -£${params.discountAmt.toFixed(2)}` : '',
    `Total: £${params.total.toFixed(2)}`,
    params.autoAccepted && params.slot
      ? params.slotChanged && params.requestedSlot
        ? `Sorry, your ${params.requestedSlot} slot was taken. Your order will be ready at ${params.slot}.`
        : `Order confirmed — collection time ${params.slot}.`
      : params.slot ? `Preferred collection: ${params.slot} — ${params.truckName} will confirm.` : '',
    params.notes ? `Notes: ${params.notes}` : '',
    '',
    'Pay at the truck on collection. No card details needed.',
    '',
    'Powered by Village Foodie — villagefoodie.co.uk',
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}

// ─── Send email via Brevo ────────────────────────────────────────────────────

async function sendConfirmationEmail(params: {
  to: string
  subject: string
  html: string
  text: string
  truckName?: string
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.warn('BREVO_API_KEY not set — skipping email')
    return
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key':      apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender:    { name: params.truckName || 'Village Foodie', email: 'donotreply@villagefoodie.co.uk' },
        to:        [{ email: params.to }],
        subject:   params.subject,
        htmlContent: params.html,
        textContent: params.text,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('Brevo email send failed:', err)
    }
  } catch (err) {
    console.error('Email error:', err)
    // Never throw — email failure must not fail the order
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Main POST handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      truckId,
      customerName,
      customerEmail,
      customerPhone,
      slot,
      eventDate,
      items,
      deals,
      discountCode,
      discountAmt,
      subtotal,
      total,
      notes,
    } = body

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!truckId || !customerName || !customerEmail || !customerPhone || !items?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── Fetch truck (by slug or id) ───────────────────────────────────────────
    let truckQuery = await supabase
      .from('trucks')
      .select('*')
      .eq('slug', truckId)
      .eq('active', true)
      .single()

    if (truckQuery.error || !truckQuery.data) {
      truckQuery = await supabase
        .from('trucks')
        .select('*')
        .eq('id', truckId)
        .eq('active', true)
        .single()
    }

    const truck = truckQuery.data
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // Use the actual truck UUID for all subsequent queries
    const resolvedTruckId = truck.id

    const orderLines = allOrderLines(items, deals)
    const [itemCatMap, catConfigs] = await Promise.all([
      buildItemCatMap(supabase, resolvedTruckId),
      buildCatConfigs(resolvedTruckId),
    ])

    // ── Slot capacity check (batch-based per production window) ───────────────
    if (truck.mode === 'village' && slot && eventDate) {
      const [{ data: timeRow }, slotUnits, { data: capacities }] = await Promise.all([
        supabase
          .from('collection_times')
          .select('production_slot')
          .eq('truck_id', resolvedTruckId)
          .eq('collection_time', slot)
          .maybeSingle(),
        getProductionSlotUnits(supabase, resolvedTruckId, eventDate),
        supabase
          .from('slot_capacity')
          .select('slot, max_orders')
          .eq('truck_id', resolvedTruckId)
          .eq('event_date', eventDate),
      ])
      const capacityMap = Object.fromEntries((capacities || []).map(c => [c.slot, c.max_orders]))
      // For dynamic-slot trucks (no collection_times), derive production_slot from the slot time
      const productionSlot = timeRow?.production_slot ?? (() => {
        const dur = truck.slot_duration_mins ?? (truck.collection_interval_mins ?? 0)
        if (dur > 0) {
          const [h, m] = slot.split(':').map(Number)
          const slotMins = h * 60 + m
          const prodMins = Math.floor(slotMins / dur) * dur
          return `${String(Math.floor(prodMins / 60)).padStart(2, '0')}:${String(prodMins % 60).padStart(2, '0')}`
        }
        return slot
      })()
      const maxBatches = capacityMap[productionSlot] ?? 999

      if (!canFitInProductionSlot(
        slotUnits[productionSlot] || {},
        orderLines,
        itemCatMap,
        maxBatches,
        catConfigs
      )) {
        return NextResponse.json(
          { error: 'This time slot is full — please choose another' },
          { status: 409 }
        )
      }
    }

    // ── Server-side total validation ──────────────────────────────────────────
    const { data: menuItems } = await supabase
      .from('menu_items_db')
      .select('name, price')
      .eq('truck_id', resolvedTruckId)

    const { data: bundles } = await supabase
      .from('bundles_db')
      .select('*')
      .eq('truck_id', resolvedTruckId)

    // Reconstruct deals
    const dealsForCalc = (deals || []).map((d: AppliedDeal) => ({
      bundle: bundles?.find(b => b.name === d.name) || { name: d.name, bundle_price: 0, original_price: null },
      slots: d.slots || {}
    }))

    // Find discount code
    let discountCodeData = null
    if (discountCode) {
      const { data } = await supabase
        .from('discount_codes_db')
        .select('*')
        .eq('truck_id', resolvedTruckId)
        .eq('code', discountCode.toUpperCase())
        .eq('is_active', true)
        .single()
      discountCodeData = data
    }

    // Calculate totals server-side
    const serverCalculation = calculateOrderTotal(
      items,
      dealsForCalc,
      menuItems || [],
      discountCodeData
    )

    // Validate submitted totals
    const validation = validateOrderTotals(
      { subtotal, discountAmt: discountAmt ?? 0, total },
      serverCalculation,
      0.01
    )

    if (!validation.valid) {
      console.error('[ORDER VALIDATION]', validation.error)
      return NextResponse.json({ 
        error: 'Order total validation failed. Please refresh and try again.' 
      }, { status: 400 })
    }

    // ── Generate order ID ─────────────────────────────────────────────────────
    const orderId = await nextOrderId(resolvedTruckId)

    // ── Resolve event_id for this order ──────────────────────────────────────
    const orderEventDate = eventDate ?? new Date().toISOString().split('T')[0]
    const { data: eventRow } = await supabase
      .from('truck_events')
      .select('id, start_time, end_time')
      .eq('truck_id', resolvedTruckId)
      .eq('event_date', orderEventDate)
      .neq('is_cancelled', true)
      .maybeSingle()

    // ── Save to Supabase ──────────────────────────────────────────────────────
    const { data: order, error: insertErr } = await supabase
      .from('orders')
      .insert({
        id:             orderId,
        truck_id:       resolvedTruckId,
        customer_name:  customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        slot:           slot ?? null,
        order_type:     'collection',
        event_date:     orderEventDate,
        items,
        deals:          deals ?? null,
        discount_code:  discountCode ?? null,
        subtotal:       subtotal ?? total,
        discount_amt:   discountAmt ?? 0,
        total,
        notes:          notes ?? null,
        status:         'pending',
        payment_status: 'unpaid',
      })
      .select()
      .single()

    if (insertErr || !order) {
      console.error('Order insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
    }

    // ── Auto-accept if truck has it enabled ───────────────────────────────────
    const requestedSlot = slot ?? null
    let confirmedSlot = requestedSlot
    let autoAccepted = false
    let slotChanged = false

    if (truck.auto_accept) {
      if (requestedSlot && eventDate) {
        const resolved = await resolveAutoAcceptSlot(
          resolvedTruckId, eventDate, requestedSlot, orderLines, itemCatMap, catConfigs,
          eventRow?.start_time ?? null,
          eventRow?.end_time ?? null,
          truck.collection_interval_mins ?? 0,
          truck.slot_duration_mins ?? (truck.collection_interval_mins ?? 0),
        )
        if (resolved.canConfirm) {
          autoAccepted = true
          confirmedSlot = resolved.confirmedSlot
          slotChanged = resolved.slotChanged
          await supabase
            .from('orders')
            .update({
              status: 'confirmed',
              ...(slotChanged ? { slot: confirmedSlot } : {}),
            })
            .eq('id', orderId)
        }
      } else {
        autoAccepted = true
        await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId)
      }
    }

    // Track batch usage — never block the order if this fails
    const slotToBook = confirmedSlot || requestedSlot
    if (slotToBook && eventDate) {
      try {
        await addOrderToProductionSlot(
          supabase, resolvedTruckId, eventDate, slotToBook, orderLines, itemCatMap
        )
      } catch (slotErr) {
        console.error('[submit] production slot tracking failed:', slotErr)
      }
    }

    // ── WhatsApp to truck ─────────────────────────────────────────────────────
    const waMessage = formatWhatsAppOrder({
      orderId,
      truckName:    truck.name,
      customerName,
      customerPhone,
      customerEmail,
      slot:         confirmedSlot ?? slot ?? null,
      eventDate:    eventDate ?? new Date().toISOString().split('T')[0],
      items,
      deals:        deals ?? [],
      discountCode: discountCode ?? null,
      discountAmt:  discountAmt ?? 0,
      total,
      notes:        notes ?? null,
    })

    try {
      await sendWhatsApp(truck.whatsapp, waMessage)
      await logMessage({
        orderId,
        direction: 'outbound',
        channel:   'whatsapp',
        from:      process.env.TWILIO_WHATSAPP_NUMBER!,
        to:        truck.whatsapp,
        body:      waMessage,
      })
    } catch (err) {
      console.error('WhatsApp send failed:', err)
      // Do not fail the order — log and continue
    }

    // ── Email to truck (backup for missed WhatsApp notifications) ───────────
    try {
      const truckEmail = truck.contact_email
      if (truckEmail) {
        const truckItemRows = items.map((i: any) => {
          const modRows = (i.modifiers || []).map((m: any) =>
            `<tr><td colspan="2" style="padding:1px 0 1px 14px;font-size:12px;color:#64748b">+ ${m.name}${m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}</td></tr>`
          ).join('')
          const noteRow = i.specialInstructions
            ? `<tr><td colspan="2" style="padding:1px 0 3px 14px;font-size:12px;color:#64748b;font-style:italic">📝 ${i.specialInstructions}</td></tr>`
            : ''
          return `<tr><td style="padding:3px 0 1px;color:#475569">${i.quantity}× ${i.name}</td><td style="text-align:right;padding:3px 0 1px">£${(parseFloat(i.unit_price)*i.quantity).toFixed(2)}</td></tr>${modRows}${noteRow}`
        }).join('')
        const truckDealRows = (deals || []).map((d: any) => {
          const slotNames = Object.values(d.slots || {}).filter(Boolean).join(', ')
          const subRows = Object.entries(d.slots || {}).flatMap(([cat, itemName]: [string, any]) => {
            if (!itemName) return []
            const rows: string[] = []
            const mods = (d.slotModifiers || {})[cat] || []
            if (mods.length) rows.push(`<tr><td colspan="2" style="padding:1px 0 1px 14px;font-size:12px;color:#64748b">↳ ${itemName}: ${mods.map((m: any) => `+ ${m.name}`).join(', ')}</td></tr>`)
            const note = (d.slotNotes || {})[cat]
            if (note) rows.push(`<tr><td colspan="2" style="padding:1px 0 1px 14px;font-size:12px;color:#64748b;font-style:italic">↳ ${itemName}: 📝 ${note}</td></tr>`)
            return rows
          }).join('')
          return `<tr><td colspan="2" style="padding:3px 0 1px;color:#d97706">🎁 ${d.name}: ${slotNames}</td></tr>${subRows}`
        }).join('')
        await sendConfirmationEmail({
          to: truckEmail,
          subject: `🔔 New order #${orderId} — ${customerName}${slot ? ' · ' + slot : ''}`,
          html: `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2 style="color:#ea580c;margin:0 0 12px">🔔 New order received</h2>
            <p><strong>Order #${orderId}</strong> from <strong>${customerName}</strong></p>
            ${slot ? `<p style="font-size:16px"><strong>⏰ Collection: ${slot}</strong></p>` : '<p>No specific time — ASAP</p>'}
            ${customerPhone ? `<p>📞 <a href="tel:${customerPhone}">${customerPhone}</a></p>` : ''}
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
              ${truckItemRows}
              ${truckDealRows}
              <tr style="border-top:2px solid #e2e8f0">
                <td style="padding-top:8px;font-weight:800">Total</td>
                <td style="text-align:right;padding-top:8px;font-weight:800">£${total.toFixed(2)}</td>
              </tr>
            </table>
            ${notes ? `<p><strong>📝 Notes:</strong> ${notes}</p>` : ''}
            <p style="color:#64748b;font-size:12px;margin-top:16px">Log in to your Village Foodie dashboard to confirm or reject this order.</p>
          </body>`,
          text: `New order #${orderId} from ${customerName}${slot ? ' for ' + slot : ''}. Total £${total.toFixed(2)}.${notes ? ' Notes: ' + notes : ''}`,
        })
      }
    } catch (err) {
      console.error('Truck email failed:', err)
    }

    // ── Email to customer ─────────────────────────────────────────────────────
    const { subject, html, text } = formatConfirmationEmail({
      orderId,
      truckName:    truck.name,
      customerName,
      slot:         confirmedSlot,
      requestedSlot,
      slotChanged,
      items,
      deals:        deals ?? [],
      discountAmt:  discountAmt ?? 0,
      total,
      notes:        notes ?? null,
      autoAccepted,
    })

    try {
      await sendConfirmationEmail({ to: customerEmail, subject, html, text, truckName: truck.name })
    } catch (emailErr) {
      console.error('Customer email failed:', emailErr)
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    return NextResponse.json({
      success:       true,
      orderId,
      truckName:     truck.name,
      slot:          confirmedSlot,
      requestedSlot,
      autoAccepted,
      slotChanged,
      total,
    })

  } catch (err: any) {
    console.error('Order submit error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}