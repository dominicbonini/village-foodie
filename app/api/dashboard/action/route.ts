// app/api/dashboard/action/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).eq('active', true).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}

async function notifyCustomer(email: string, subject: string, html: string) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey || !email) return
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: 'Village Foodie', email: 'orders@villagefoodie.co.uk' },
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
        await notifyCustomer(order.customer_email, `Order #${orderId} confirmed — ${truck.name}`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Your order is confirmed! ✓</h2>
            <p><strong>${truck.name}</strong> has accepted your order #${orderId}.</p>
            ${order.slot ? `<p><strong>Collection time:</strong> ${order.slot}</p>` : ''}
            <p><strong>Total: £${order.total}</strong> — pay at the truck on collection.</p>
            <p style="color:#64748b;font-size:13px">Powered by Village Foodie · villagefoodie.co.uk</p>
          </body>`)
      }
      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    // ── REJECT ────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'rejected' }).eq('id', orderId)
      if (order.customer_email) {
        await notifyCustomer(order.customer_email, `Order #${orderId} update — ${truck.name}`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Order update</h2>
            <p>Unfortunately <strong>${truck.name}</strong> is unable to fulfil order #${orderId}.</p>
            <p>Please order at the truck on arrival. Sorry for the inconvenience.</p>
            <p style="color:#64748b;font-size:13px">Powered by Village Foodie · villagefoodie.co.uk</p>
          </body>`)
      }
      return NextResponse.json({ success: true, status: 'rejected' })
    }

    // ── READY ─────────────────────────────────────────────────────────────────
    if (action === 'ready') {
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'ready' }).eq('id', orderId)
      if (order.customer_email) {
        await notifyCustomer(order.customer_email, `Your order is ready — ${truck.name}`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Your order is ready! 🎉</h2>
            <p>Order #${orderId} from <strong>${truck.name}</strong> is ready for collection.</p>
            <p>Come and collect now — pay at the truck.</p>
            <p style="color:#64748b;font-size:13px">Powered by Village Foodie · villagefoodie.co.uk</p>
          </body>`)
      }
      return NextResponse.json({ success: true, status: 'ready' })
    }

    // ── COLLECTED ─────────────────────────────────────────────────────────────
    if (action === 'collected') {
      await supabase.from('orders').update({ status: 'collected' }).eq('id', orderId).eq('truck_id', truck.id)
      return NextResponse.json({ success: true, status: 'collected' })
    }

    // ── UNDO COLLECTED ────────────────────────────────────────────────────────
    if (action === 'undo_collected') {
      await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId).eq('truck_id', truck.id)
      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    // ── EDIT ORDER ────────────────────────────────────────────────────────────
    if (action === 'edit') {
      const { items, slot, notes } = editedOrder || {}
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

      const newTotal = items
        ? items.reduce((s: number, i: any) => s + (parseFloat(i.unit_price) * parseInt(i.quantity)), 0)
        : order.total

      await supabase.from('orders').update({
        items:    items    || order.items,
        slot:     slot     !== undefined ? slot : order.slot,
        notes:    notes    !== undefined ? notes : order.notes,
        total:    newTotal,
        subtotal: newTotal,
        status:   'modified',
      }).eq('id', orderId)

      if (order.customer_email) {
        const updatedItemRows = (items || order.items).map((i: any) =>
          `<tr><td style="padding:4px 0;color:#475569">${i.quantity}× ${i.name}</td><td style="text-align:right;padding:4px 0">£${(parseFloat(i.unit_price)*parseInt(i.quantity)).toFixed(2)}</td></tr>`
        ).join('')
        const slotToShow = slot !== undefined ? slot : order.slot
        await notifyCustomer(order.customer_email, `Order #${orderId} updated — ${truck.name}`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Your order has been updated ✓</h2>
            <p><strong>${truck.name}</strong> has updated order #${orderId}.</p>
            ${slotToShow ? `<p><strong>Collection time:</strong> ${slotToShow}</p>` : ''}
            <p style="font-size:12px;color:#64748b;margin-bottom:4px">Updated order:</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">
              ${updatedItemRows}
              <tr style="border-top:1px solid #e2e8f0">
                <td style="padding-top:8px;font-weight:700">New total</td>
                <td style="text-align:right;padding-top:8px;font-weight:700">£${newTotal.toFixed(2)}</td>
              </tr>
            </table>
            <p style="color:#64748b;font-size:13px">Pay at the truck on collection · Powered by Village Foodie</p>
          </body>`)
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

    // ── MANUAL ORDER ──────────────────────────────────────────────────────────
    if (action === 'manual') {
      const { customerName, customerPhone, customerEmail, slot, items, notes, discountAmt, total: passedTotal, subtotal } = manualOrder
      if (!customerName || !items?.length) {
        return NextResponse.json({ error: 'Name and items required' }, { status: 400 })
      }
      const today = new Date().toISOString().split('T')[0]
      let autoConfirm = true
      if (slot) {
        const { data: capacity } = await supabase
          .from('slot_capacity').select('max_orders')
          .eq('truck_id', truck.id).eq('event_date', today).eq('slot', slot).single()
        if (capacity) {
          const { count } = await supabase.from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('truck_id', truck.id).eq('event_date', today).eq('slot', slot)
            .in('status', ['pending', 'confirmed', 'modified'])
          if ((count ?? 0) >= capacity.max_orders) autoConfirm = false
        }
      }
      const { data: counterData } = await supabase.rpc('increment_order_counter', { p_truck_id: truck.id })
      const newOrderId = String(counterData).padStart(4, '0')
      const total = items.reduce((s: number, i: any) => s + (parseFloat(i.unit_price) * parseInt(i.quantity)), 0)
      const { error: insertErr } = await supabase.from('orders').insert({
        id: newOrderId, truck_id: truck.id,
        customer_name: customerName, customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        slot: slot || null, order_type: 'collection', event_date: today,
        items, subtotal: subtotal || total, discount_amt: discountAmt || 0, total: passedTotal || total,
        notes: notes || null, status: autoConfirm ? 'confirmed' : 'pending',
      })
      if (insertErr) return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })

      // Send confirmation email if email provided
      if (customerEmail) {
        const subtotalAmt = items.reduce((s: number, i: any) => s + parseFloat(i.unit_price)*parseInt(i.quantity), 0)
        const itemRows = items.map((i: any) =>
          `<tr><td style="padding:4px 0;color:#475569">${i.quantity}× ${i.name}</td><td style="text-align:right;padding:4px 0">£${(parseFloat(i.unit_price)*parseInt(i.quantity)).toFixed(2)}</td></tr>`
        ).join('')
        const dealRows = (manualOrder.deals||[]).map((d: any) => {
          const orig = Object.values(d.slots||{}).reduce((s: number, n: any) => {
            const item = items.find((i: any) => i.name === n)
            return s + (item ? parseFloat(item.unit_price) : 0)
          }, 0)
          const saving = Math.max(0, orig - (manualOrder.total || 0))
          return `<tr><td style="padding:4px 0;color:#d97706">🎁 ${d.name}</td><td style="text-align:right;padding:4px 0;color:#16a34a">-£${saving.toFixed(2)}</td></tr>`
        }).join('')
        const discountAmt = manualOrder.discountAmt || 0
        await notifyCustomer(
          customerEmail,
          `Order #${newOrderId} confirmed — ${truck.name}`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Order confirmed ✓</h2>
            <p><strong>${truck.name}</strong> has your order #${newOrderId}.</p>
            ${slot ? `<p><strong>Collection time:</strong> ${slot}</p>` : ''}
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
              ${itemRows}
              <tr style="border-top:1px solid #e2e8f0">
                <td style="padding-top:8px;font-weight:700">Total</td>
                <td style="text-align:right;padding-top:8px;font-weight:700">£${total.toFixed(2)}</td>
              </tr>
            </table>
            ${notes ? `<p><em>Notes: ${notes}</em></p>` : ''}
            <p style="color:#64748b;font-size:13px">Pay at the truck on collection · Powered by Village Foodie</p>
          </body>`
        )
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (err: any) {
    console.error('Dashboard action error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}