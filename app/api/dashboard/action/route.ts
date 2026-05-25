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
import { canFitInProductionSlot } from '@/lib/slot-capacity'
import { buildCatConfigs } from '@/lib/prep-utils'
import { nextOrderId } from '@/lib/order-utils'

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
    const { token, pin, action, orderId, manualOrder, itemName, available, editedOrder } = body

    const truck = await verifyToken(token, pin)
    if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    // ── CONFIRM ───────────────────────────────────────────────────────────────
    if (action === 'confirm') {
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId)
      if (order.customer_email) {
      {
          const confirmedItemRows = order.items.map((i: any) =>
            `<tr><td style="padding:4px 0;color:#475569">${i.quantity}× ${i.name}</td><td style="text-align:right;padding:4px 0">£${(parseFloat(i.unit_price)*parseInt(i.quantity)).toFixed(2)}</td></tr>`
          ).join('')
          await notifyCustomer(order.customer_email, `Order #${orderId} confirmed`, `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2 style="color:#16a34a">Your order is confirmed ✓</h2>
            <p><strong>${truck.name}</strong> has confirmed your order #${orderId}.</p>
            ${order.slot ? `<p style="font-size:16px"><strong>⏰ Collection time: ${order.slot}</strong></p>` : ''}
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
              ${confirmedItemRows}
              <tr style="border-top:2px solid #e2e8f0">
                <td style="padding-top:8px;font-weight:800">Total</td>
                <td style="text-align:right;padding-top:8px;font-weight:800">£${Number(order.total).toFixed(2)}</td>
              </tr>
            </table>
            <p style="color:#64748b;font-size:13px">Pay at the truck on collection · Powered by Village Foodie</p>
          </body>`, truck.name)
        }
      }
      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    // ── REJECT ────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'rejected' }).eq('id', orderId)
      if (order.slot && order.event_date) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_date, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap
        )
      }
      if (order.customer_email) {
        await notifyCustomer(order.customer_email, `Order #${orderId} update`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Order update</h2>
            <p>Unfortunately <strong>${truck.name}</strong> is unable to fulfil order #${orderId}.</p>
            <p>Please order at the truck on arrival. Sorry for the inconvenience.</p>
            <p style="color:#64748b;font-size:13px">Powered by Village Foodie · villagefoodie.co.uk</p>
          </body>`, truck.name)
      }
      return NextResponse.json({ success: true, status: 'rejected' })
    }

    // ── CANCEL ────────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const { cancellationReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancellationReason || null }).eq('id', orderId)
      if (order.slot && order.event_date) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_date, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap
        )
      }
      if (order.customer_email) {
        const reasonLine = cancellationReason ? `<p style="color:#475569">${cancellationReason}</p>` : ''
        const refundLine = order.paid_at ? `<p>Your refund will be processed automatically within 3–5 working days.</p>` : ''
        await notifyCustomer(order.customer_email, `Your order has been cancelled — ${truck.name}`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#334155">
            <p>Hi ${order.customer_name || 'there'},</p>
            <p>Your order <strong>#${orderId}</strong> from <strong>${truck.name}</strong> has been cancelled.</p>
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
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'ready' }).eq('id', orderId)
      if (order.customer_email) {
        await notifyCustomer(order.customer_email, `Your order is ready`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Your order is ready! 🎉</h2>
            <p>Order #${orderId} from <strong>${truck.name}</strong> is ready for collection.</p>
            <p>Come and collect now — pay at the truck.</p>
            <p style="color:#64748b;font-size:13px">Powered by Village Foodie · villagefoodie.co.uk</p>
          </body>`, truck.name)
      }
      return NextResponse.json({ success: true, status: 'ready' })
    }

    // ── COLLECTED ─────────────────────────────────────────────────────────────
    if (action === 'cooking') {
      await supabase.from('orders').update({ status: 'cooking' }).eq('id', orderId).eq('truck_id', truck.id)
      return NextResponse.json({ success: true, status: 'cooking' })
    }

    if (action === 'collected') {
      const now = new Date().toISOString()
      const { data: order } = await supabase.from('orders').select('slot, event_date, status').eq('id', orderId).eq('truck_id', truck.id).single()
      await supabase.from('orders').update({ status: 'collected', paid_at: now, collected_at: now }).eq('id', orderId).eq('truck_id', truck.id)
      if (order?.slot && order.event_date && ['pending', 'confirmed', 'modified'].includes(order.status)) {
        const full = await supabase.from('orders').select('items, deals').eq('id', orderId).single()
        if (full.data) {
          const itemCatMap = await buildItemCatMap(supabase, truck.id)
          await removeOrderFromProductionSlot(
            supabase, truck.id, order.event_date, order.slot,
            normaliseOrderLines(full.data.items || [], full.data.deals), itemCatMap
          )
        }
      }
      return NextResponse.json({ success: true, status: 'collected' })
    }

    // ── UNDO COLLECTED ────────────────────────────────────────────────────────
    if (action === 'undo_collected') {
      const { data: order } = await supabase.from('orders').select('slot, event_date').eq('id', orderId).eq('truck_id', truck.id).single()
      await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId).eq('truck_id', truck.id)
      if (order?.slot && order.event_date) {
        const full = await supabase.from('orders').select('items, deals').eq('id', orderId).single()
        if (full.data) {
          const itemCatMap = await buildItemCatMap(supabase, truck.id)
          await addOrderToProductionSlot(
            supabase, truck.id, order.event_date, order.slot,
            normaliseOrderLines(full.data.items || [], full.data.deals), itemCatMap
          )
        }
      }
      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    // ── EDIT ORDER ────────────────────────────────────────────────────────────
    if (action === 'edit') {
      const { items, slot, notes, deals: editedDeals } = editedOrder || {}
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('truck_id', truck.id).single()
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
      }).eq('id', orderId)

      if (order.event_date && (items || slot !== undefined)) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        const oldLines = normaliseOrderLines(order.items || [], order.deals)
        const newLines = normaliseOrderLines(items || order.items || [], order.deals)
        if (order.slot) {
          await removeOrderFromProductionSlot(
            supabase, truck.id, order.event_date, order.slot, oldLines, itemCatMap
          )
        }
        if (newSlot) {
          await addOrderToProductionSlot(
            supabase, truck.id, order.event_date, newSlot, newLines, itemCatMap
          )
        }
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
        await notifyCustomer(order.customer_email, `Order #${orderId} updated`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Your order has been updated ✓</h2>
            <p><strong>${truck.name}</strong> has updated order #${orderId}.</p>
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
      const { customerName, customerPhone, customerEmail, slot, items, notes, discountAmt, total: passedTotal, subtotal, event_date: passedEventDate } = manualOrder
      const deals = manualOrder.deals ?? null
      if (!items?.length && !deals?.length) {
        return NextResponse.json({ error: 'Items required' }, { status: 400 })
      }
      const eventDate = passedEventDate || new Date().toISOString().split('T')[0]
      let autoConfirm = true
      const manualLines = normaliseOrderLines(items || [])
      const itemCatMap = await buildItemCatMap(supabase, truck.id)
      const catConfigs = await buildCatConfigs(supabase, truck.id)
      if (slot) {
        const [{ data: timeRow }, slotUnits, { data: capacities }] = await Promise.all([
          supabase.from('collection_times').select('production_slot').eq('truck_id', truck.id).eq('collection_time', slot).maybeSingle(),
          getProductionSlotUnits(supabase, truck.id, eventDate),
          supabase.from('slot_capacity').select('slot, max_orders').eq('truck_id', truck.id).eq('event_date', eventDate),
        ])
        const capacityMap = Object.fromEntries((capacities || []).map(c => [c.slot, c.max_orders]))
        const productionSlot = timeRow?.production_slot ?? deriveProductionSlot(
          slot,
          truck.slot_duration_mins ?? (truck.collection_interval_mins ?? 0)
        )
        const maxBatches = capacityMap[productionSlot] ?? 999
        if (!canFitInProductionSlot(
          slotUnits[productionSlot] || {}, manualLines, itemCatMap, maxBatches, catConfigs
        )) autoConfirm = false
      }
      let newOrderId: string
      try {
        newOrderId = await nextOrderId(truck.id)
      } catch (err: any) {
        console.error('[manual] order counter failed:', err.message)
        return NextResponse.json({ error: 'Failed to generate order ID' }, { status: 500 })
      }
      const total = (items || []).reduce((s: number, i: any) => s + (parseFloat(i.unit_price) * parseInt(i.quantity)), 0)
      const { error: insertErr } = await supabase.from('orders').insert({
        id: newOrderId, truck_id: truck.id,
        customer_name: customerName || 'Walk-up', customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        slot: slot || null, order_type: 'collection', event_date: eventDate,
        items, deals, discount_code: null,
        subtotal: subtotal || total, discount_amt: discountAmt || 0, total: passedTotal || total,
        notes: notes || null, status: autoConfirm ? 'confirmed' : 'pending',
        payment_status: 'unpaid',
      })
      if (insertErr) {
        console.error('[manual] order insert failed:', insertErr.message, insertErr.details, insertErr.hint)
        return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
      }

      if (slot) await addOrderToProductionSlot(supabase, truck.id, eventDate, slot, manualLines, itemCatMap)

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
          truckName: truck.name,
          customerName,
          slot: slot || null,
          items: manualEmailItems,
          deals: deals || [],
          discountAmt: manualOrder.discountAmt || 0,
          total: passedTotal || total,
          notes: notes || null,
          autoAccepted: true,
        })
        await sendConfirmationEmail({ to: customerEmail, subject, html, text, truckName: truck.name })
      }

      if (truck.contact_email) {
        const { subject, html, text } = formatConfirmationEmail({
          orderId: newOrderId,
          truckName: truck.name,
          customerName: customerName || 'Walk-up',
          slot: slot || null,
          items: manualEmailItems,
          deals: deals || [],
          discountAmt: manualOrder.discountAmt || 0,
          total: passedTotal || total,
          notes: notes || null,
          autoAccepted: true,
        })
        await sendConfirmationEmail({
          to: truck.contact_email,
          subject: `[Order copy] ${subject}`,
          html,
          text,
          truckName: truck.name,
        })
      }

      return NextResponse.json({ success: true, orderId: newOrderId, autoConfirmed: autoConfirm, slotFull: !autoConfirm })
    }

    // ── GET STOCK ─────────────────────────────────────────────────────────────
    if (action === 'get_stock') {
      const today = new Date().toISOString().split('T')[0]
      const [{ data: items }, { data: cats }] = await Promise.all([
        supabase.from('item_overrides')
          .select('item_name, available, stock_count, orders_count, category')
          .eq('truck_id', truck.id),
        supabase.from('category_stock')
          .select('category, stock_count, orders_count')
          .eq('truck_id', truck.id).eq('date', today)
      ])
      return NextResponse.json({
        success: true,
        stocks: (items || []).map((r: any) => ({
          name: r.item_name, available: r.available,
          stock_count: r.stock_count, orders_count: r.orders_count || 0,
          category: r.category
        })),
        categoryStocks: (cats || []).map((r: any) => ({
          category: r.category,
          stock_count: r.stock_count,
          orders_count: r.orders_count || 0
        }))
      })
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
      const { items, categoryMap } = body
      // categoryMap: { itemName: categoryName }
      const today = new Date().toISOString().split('T')[0]

      for (const item of (items || [])) {
        const qty = parseInt(item.quantity) || 1
        const cat = categoryMap?.[item.name] || null

        // 1. Decrement item-level stock if set
        const { data: existingItem } = await supabase
          .from('item_overrides')
          .select('stock_count, orders_count, available')
          .eq('truck_id', truck.id)
          .eq('item_name', item.name)
          .single()

        if (existingItem && existingItem.stock_count !== null) {
          const newItemCount = (existingItem.orders_count || 0) + qty
          const itemSoldOut = newItemCount >= existingItem.stock_count
          await supabase.from('item_overrides')
            .update({
              orders_count: newItemCount,
              available: itemSoldOut ? false : existingItem.available
            })
            .eq('truck_id', truck.id).eq('item_name', item.name)
        }

        // 2. Decrement category-level stock if set
        if (cat) {
          const { data: catStock } = await supabase
            .from('category_stock')
            .select('stock_count, orders_count')
            .eq('truck_id', truck.id).eq('category', cat).eq('date', today)
            .single()

          if (catStock && catStock.stock_count !== null) {
            const newCatCount = (catStock.orders_count || 0) + qty
            const catSoldOut = newCatCount >= catStock.stock_count
            await supabase.from('category_stock')
              .update({ orders_count: newCatCount })
              .eq('truck_id', truck.id).eq('category', cat).eq('date', today)

            // If category is now sold out, mark ALL items in that category unavailable
            if (catSoldOut) {
              await supabase.from('item_overrides')
                .update({ available: false })
                .eq('truck_id', truck.id).eq('category', cat)
            }
          }
        }
      }
      return NextResponse.json({ success: true })
    }

    // ── adjust_slot ───────────────────────────────────────────────────────────
    if (action?.startsWith('adjust_slot_+')) {
      const mins = parseInt(action.replace('adjust_slot_+', ''))
      if (!orderId || isNaN(mins)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
      const { data: ord } = await supabase.from('orders').select('slot,event_date,customer_email,customer_name').eq('id', orderId).single()
      if (!ord?.slot) return NextResponse.json({ error: 'No slot' }, { status: 400 })
      const [h, m] = ord.slot.split(':').map(Number)
      const newTotal = h * 60 + m + mins
      const newSlot = `${String(Math.floor(newTotal / 60) % 24).padStart(2, '0')}:${String(newTotal % 60).padStart(2, '0')}`
      if (ord.event_date) {
        const full = await supabase.from('orders').select('items, deals').eq('id', orderId).single()
        if (full.data) {
          const itemCatMap = await buildItemCatMap(supabase, truck.id)
          await moveSlotBooking(
            supabase, truck.id, ord.event_date, ord.slot, newSlot,
            normaliseOrderLines(full.data.items || [], full.data.deals), itemCatMap
          )
        }
      }
      await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('id', orderId)
      // Notify customer of time change
      if (ord.customer_email) {
        await notifyCustomer(ord.customer_email,
          `Your collection time has changed`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Collection time updated</h2>
            <p>Hi ${ord.customer_name}, your order #${orderId} from <strong>${truck.name}</strong> has been confirmed with an adjusted collection time.</p>
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px;margin:12px 0">
              <p style="margin:0;color:#92400e;font-weight:700;font-size:16px">New collection time: ${newSlot}</p>
              <p style="margin:4px 0 0;color:#92400e;font-size:13px">Original time was ${ord.slot} — adjusted by ${mins} minutes</p>
            </div>
            <p style="color:#64748b;font-size:13px">Pay at the truck on collection · Powered by Village Foodie</p>
          </body>`, truck.name)
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
      const { paused_until } = body // ISO timestamp or null (null = resume)
      await supabase.from('trucks').update({ paused_until: paused_until ?? null }).eq('id', truck.id)
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