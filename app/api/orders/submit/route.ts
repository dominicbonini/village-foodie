// app/api/orders/submit/route.ts
// Receives order from the frontend, saves to Supabase,
// fires WhatsApp to truck and email confirmation to customer

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendWhatsApp, logMessage } from '@/lib/twilio'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  name: string
  quantity: number
  unit_price: number
}

interface AppliedDeal {
  name: string
  slots: Record<string, string>
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

function formatConfirmationEmail(params: {
  orderId: string
  truckName: string
  customerName: string
  slot: string | null
  items: OrderItem[]
  deals: AppliedDeal[]
  discountAmt: number
  total: number
  notes: string | null
}): { subject: string; html: string; text: string } {
  const subject = `Order #${params.orderId} received — ${params.truckName}`

  const itemRows = params.items.map(item =>
    `<tr>
      <td style="padding:4px 0;color:#475569">${item.quantity}× ${item.name}</td>
      <td style="text-align:right;padding:4px 0;color:#1e293b;font-weight:500">£${(item.unit_price * item.quantity).toFixed(2)}</td>
    </tr>`
  ).join('')

  const dealRows = params.deals.map(deal =>
    `<tr><td colspan="2" style="padding:4px 0;color:#d97706;font-size:13px">🎁 ${deal.name}: ${Object.values(deal.slots).filter(Boolean).join(', ')}</td></tr>`
  ).join('')

  const discountRow = params.discountAmt > 0
    ? `<tr><td style="color:#16a34a;padding:4px 0">Discount</td><td style="text-align:right;color:#16a34a">-£${params.discountAmt.toFixed(2)}</td></tr>`
    : ''

  const slotSection = params.slot ? `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px;margin-top:12px">
      <p style="margin:0;font-size:14px;color:#92400e">
        <strong>Preferred collection time: ${params.slot}</strong><br>
        <span style="font-size:12px">${params.truckName} will confirm your collection time when they accept your order.</span>
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
    params.items.map(i => `${i.quantity}x ${i.name} — £${(i.unit_price * i.quantity).toFixed(2)}`).join('\n'),
    params.deals.length ? params.deals.map(d => `🎁 ${d.name}: ${Object.values(d.slots).filter(Boolean).join(', ')}`).join('\n') : '',
    params.discountAmt > 0 ? `Discount: -£${params.discountAmt.toFixed(2)}` : '',
    `Total: £${params.total.toFixed(2)}`,
    params.slot ? `Preferred collection: ${params.slot} — ${params.truckName} will confirm.` : '',
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
        sender:    { name: 'Village Foodie', email: 'orders@villagefoodie.co.uk' },
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

    // ── Fetch truck ───────────────────────────────────────────────────────────
    const { data: truck, error: truckErr } = await supabase
      .from('trucks')
      .select('*')
      .eq('id', truckId)
      .eq('active', true)
      .single()

    if (truckErr || !truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // ── Slot capacity check ───────────────────────────────────────────────────
    if (truck.mode === 'village' && slot && eventDate) {
      const { data: capacity } = await supabase
        .from('slot_capacity')
        .select('max_orders')
        .eq('truck_id', truckId)
        .eq('event_date', eventDate)
        .eq('slot', slot)
        .single()

      if (capacity) {
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('truck_id', truckId)
          .eq('event_date', eventDate)
          .eq('slot', slot)
          .in('status', ['pending', 'confirmed', 'modified'])

        if ((count ?? 0) >= capacity.max_orders) {
          return NextResponse.json(
            { error: 'This time slot is full — please choose another' },
            { status: 409 }
          )
        }
      }
    }

    // ── Generate order ID ─────────────────────────────────────────────────────
    const orderId = await nextOrderId(truckId)

    // ── Save to Supabase ──────────────────────────────────────────────────────
    const { data: order, error: insertErr } = await supabase
      .from('orders')
      .insert({
        id:             orderId,
        truck_id:       truckId,
        customer_name:  customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        slot:           slot ?? null,
        order_type:     'collection',
        event_date:     eventDate ?? new Date().toISOString().split('T')[0],
        items,
        deals:          deals ?? null,
        discount_code:  discountCode ?? null,
        subtotal:       subtotal ?? total,
        discount_amt:   discountAmt ?? 0,
        total,
        notes:          notes ?? null,
        status:         'pending',
      })
      .select()
      .single()

    if (insertErr || !order) {
      console.error('Order insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
    }

    // ── WhatsApp to truck ─────────────────────────────────────────────────────
    const waMessage = formatWhatsAppOrder({
      orderId,
      truckName:    truck.name,
      customerName,
      customerPhone,
      customerEmail,
      slot:         slot ?? null,
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

    // ── Email to customer ─────────────────────────────────────────────────────
    const { subject, html, text } = formatConfirmationEmail({
      orderId,
      truckName:   truck.name,
      customerName,
      slot:        slot ?? null,
      items,
      deals:       deals ?? [],
      discountAmt: discountAmt ?? 0,
      total,
      notes:       notes ?? null,
    })

    await sendConfirmationEmail({ to: customerEmail, subject, html, text })

    // ── Done ──────────────────────────────────────────────────────────────────
    return NextResponse.json({
      success:   true,
      orderId,
      truckName: truck.name,
      slot:      slot ?? null,
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