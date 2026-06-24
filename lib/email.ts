// lib/email.ts
// Shared email formatting and sending for order confirmations

export interface EmailOrderItem {
  name: string
  quantity: number
  unit_price: number
  modifiers?: { name: string; price: number; allergens?: string[]; dietary?: string[] }[]
  specialInstructions?: string
}

export interface EmailDeal {
  name: string
  slots: Record<string, string>
  slotModifiers?: Record<string, { name: string; price: number }[]>
  slotNotes?: Record<string, string>
  price?: number
}

/**
 * Canonical order line-item + deal rendering (HTML table rows). SINGLE SOURCE for the
 * confirmation, new-order (truck), and updated-order emails so deal bundle prices (£15) and
 * per-modifier prices (+£1.50) render consistently everywhere. Item rows carry per-modifier
 * prices; deal header rows carry the bundle price cell; deal-slot modifiers carry their +£;
 * notes render below. Numerics coerced defensively (callers may pass string unit_price/
 * quantity straight from the orders table). Returns the inner <tr> rows (no <table> wrapper).
 */
export function renderOrderLinesHtml(items: EmailOrderItem[], deals: EmailDeal[]): string {
  const itemRows = (items || []).map(item => {
    const modRows = (item.modifiers || []).map(m =>
      `<tr><td colspan="2" style="padding:1px 0 1px 16px;font-size:12px;color:#64748b">+ ${m.name}${Number(m.price) > 0 ? ` <span style="color:#ea580c">+£${Number(m.price).toFixed(2)}</span>` : ''}${(m.allergens && m.allergens.length) ? ` <span style="color:#b45309">— contains: ${m.allergens.join(', ')}</span>` : ''}</td></tr>`
    ).join('')
    const noteRow = item.specialInstructions
      ? `<tr><td colspan="2" style="padding:1px 0 4px 16px;font-size:12px;color:#64748b;font-style:italic">📝 ${item.specialInstructions}</td></tr>`
      : ''
    return `<tr>
      <td style="padding:4px 0 2px;color:#475569">${item.quantity}× ${item.name}</td>
      <td style="text-align:right;padding:4px 0 2px;color:#1e293b;font-weight:500">£${(Number(item.unit_price) * Number(item.quantity)).toFixed(2)}</td>
    </tr>${modRows}${noteRow}`
  }).join('')

  const dealRows = (deals || []).map(deal => {
    const slotMods = deal.slotModifiers || {}
    const slotNames = Object.entries(deal.slots)
      .filter(([, v]) => v)
      .map(([cat, itemName]) => {
        const mods = slotMods[cat] || []
        if (mods.length === 0) return itemName
        return `${itemName} (+ ${mods.map(m => m.name).join(', ')})`
      })
    const slotNotes = deal.slotNotes || {}
    const priceCell = deal.price != null
      ? `<td style="text-align:right;padding:4px 0 2px;color:#d97706;font-weight:500">£${Number(deal.price).toFixed(2)}</td>`
      : `<td></td>`
    const headerRow = `<tr><td style="padding:4px 0 2px;color:#d97706;font-size:13px">🎁 ${deal.name}: ${slotNames.join(', ')}</td>${priceCell}</tr>`
    const subRows = Object.entries(deal.slots).flatMap(([cat, itemName]) => {
      if (!itemName) return []
      const rows: string[] = []
      const mods = slotMods[cat] || []
      mods.forEach(m => {
        if (Number(m.price) > 0) {
          rows.push(`<tr><td style="padding:1px 0 1px 16px;font-size:12px;color:#64748b">↳ + ${m.name}</td><td style="text-align:right;padding:1px 0;font-size:12px;color:#64748b">+£${Number(m.price).toFixed(2)}</td></tr>`)
        } else {
          rows.push(`<tr><td colspan="2" style="padding:1px 0 1px 16px;font-size:12px;color:#64748b">↳ + ${m.name}</td></tr>`)
        }
      })
      const note = slotNotes[cat]
      if (note) {
        rows.push(`<tr><td colspan="2" style="padding:1px 0 4px 16px;font-size:12px;color:#64748b;font-style:italic">↳ 📝 ${note}</td></tr>`)
      }
      return rows
    }).join('')
    return headerRow + subRows
  }).join('')

  return itemRows + dealRows
}

export function formatConfirmationEmail(params: {
  orderId: string
  /** UUID row key — used for the cancel link (globally unique, not enumerable).
   *  Required: the cancel link 404s on a display number, so there is no safe
   *  fallback. Distinct from orderId, which is the human display number. */
  orderKey: string
  truckName: string
  customerName: string
  slot: string | null
  requestedSlot?: string | null
  slotChanged?: boolean
  items: EmailOrderItem[]
  deals: EmailDeal[]
  discountAmt: number
  total: number
  notes: string | null
  autoAccepted?: boolean
  slotAdjustedFrom?: string | null
  // Truck contact & venue info
  venueName?: string | null
  venueTown?: string | null
  venuePostcode?: string | null
  preferredContactMethod?: string | null
  contactPhone?: string | null
  whatsappSender?: string | null
  socialFacebook?: string | null
  socialInstagram?: string | null
  contactEmail?: string | null
  allowCancellation?: boolean
  cancellationCutoffMins?: number
  baseUrl?: string
  truckSlug?: string
}): { subject: string; html: string; text: string } {
  const subject = params.autoAccepted
    ? `Order #${params.orderId} confirmed`
    : `Order #${params.orderId} received`

  // Single-sourced line rendering (item + deal rows) — see renderOrderLinesHtml.
  const orderLinesHtml = renderOrderLinesHtml(params.items, params.deals)

  const discountRow = ''

  const slotSection = params.slot ? `
    <div style="background:${params.slotAdjustedFrom || !params.autoAccepted ? '#fff7ed' : '#f0fdf4'};border:1px solid ${params.slotAdjustedFrom || !params.autoAccepted ? '#fed7aa' : '#bbf7d0'};border-radius:10px;padding:14px 16px;margin-bottom:12px;text-align:center">
      <p style="margin:0;color:${params.slotAdjustedFrom || !params.autoAccepted ? '#92400e' : '#166534'}">
        ${params.slotAdjustedFrom
          ? `<strong style="font-size:16px">Your collection time has been updated</strong><br><span style="font-size:17px;font-weight:800">${params.slot}</span><br><span style="font-size:13px;opacity:0.85">Previously: ${params.slotAdjustedFrom}</span>`
          : params.autoAccepted
            ? params.slotChanged && (params.requestedSlot ?? params.slot)
              ? `<strong style="font-size:17px;font-weight:800">Ready at ${params.slot}</strong><br><span style="font-size:13px;opacity:0.85">Your ${params.requestedSlot ?? params.slot} slot was just taken — this is the next available time.</span>`
              : `<strong style="font-size:17px">Collection time: ${params.slot}</strong><br><span style="font-size:13px;opacity:0.85">See you at the hatch!</span>`
            : `<strong style="font-size:16px">Preferred collection time: ${params.slot}</strong><br><span style="font-size:13px;opacity:0.85">We'll confirm your collection time when we accept your order.</span>`
        }
      </p>
    </div>` : ''

  const notesSection = params.notes ? `
    <div style="margin-top:12px;padding:10px;background:#f8fafc;border-radius:8px;font-size:13px;color:#64748b">
      <strong>Special instructions:</strong> ${params.notes}
    </div>` : ''

  // Collection venue — single line (matches the truck "new order" email format)
  const venueOneLine = [params.venueName, params.venueTown, params.venuePostcode].filter(Boolean).join(', ')
  const collectionSection = venueOneLine
    ? `<p style="margin:12px 0 0;font-size:14px;color:#475569">📍 ${venueOneLine}</p>`
    : ''

  // Contact section
  const contactSection = (() => {
    const method = params.preferredContactMethod
    if (!method) return ''
    type ContactEntry = { label: string; value: string | null | undefined; isLink: boolean }
    const map: Record<string, ContactEntry> = {
      phone:     { label: 'Call us',                  value: params.contactPhone,     isLink: false },
      whatsapp:  (() => {
        // Customer-facing WhatsApp number: prefer the WhatsApp sender, fall back to the contact phone
        // (Gusto's number lives in contact_phone, not whatsapp_sender). Show the number VISIBLY in the
        // label so the customer can read it even if the link doesn't open, and link to a wa.me URL
        // normalised to UK international digits — strip a leading 0 / accept +44 or 44 → "44…":
        // "07380736226" → "https://wa.me/447380736226".
        const raw = params.whatsappSender ?? params.contactPhone
        if (!raw) return { label: 'WhatsApp us', value: null as string | null, isLink: true }
        const digits = raw.replace(/\D/g, '')
        const intl = digits.startsWith('44') ? digits : digits.startsWith('0') ? `44${digits.slice(1)}` : `44${digits}`
        return { label: `WhatsApp us: ${raw}`, value: `https://wa.me/${intl}`, isLink: true }
      })(),
      facebook:  { label: 'Message us on Facebook',    value: params.socialFacebook,   isLink: true },
      messenger: { label: 'Message us on Messenger',   value: params.socialFacebook ? `https://m.me/${params.socialFacebook.split('/').pop()}` : null, isLink: true },
      instagram: { label: 'DM us on Instagram',        value: params.socialInstagram ? `https://instagram.com/${params.socialInstagram.replace('@', '')}` : null, isLink: true },
      email:     { label: 'Email us',                  value: params.contactEmail,     isLink: false },
    }
    const contact = map[method]
    if (!contact?.value) return ''
    return `
    <div style="margin-top:12px;padding:14px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      <p style="margin:0 0 6px;font-size:12px;color:#64748b;font-weight:600">Questions about your order?</p>
      ${contact.isLink
        ? `<a href="${contact.value}" style="color:#ea580c;font-size:14px;text-decoration:none">${contact.label} →</a>`
        : `<p style="margin:0;font-size:14px;color:#334155">${contact.label}: ${contact.value}</p>`
      }
    </div>`
  })()

  // Cancellation link section
  const cancellationSection = params.allowCancellation ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:12px;color:#94a3b8">
        Need to cancel?
        <a href="${params.baseUrl || 'https://www.hatchgrab.com'}/order/${params.orderKey}/manage" style="color:#ea580c;margin-left:4px">Cancel your order</a>
        (up to ${params.cancellationCutoffMins ?? 30} minutes before your pickup time)
      </p>
    </div>` : ''

  const heading = params.autoAccepted ? 'Order confirmed!' : 'Order received!'

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1e293b;background:#ffffff">

  <div style="text-align:center;padding:20px 0 16px">
    <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:24px;line-height:56px">✓</div>
    <h1 style="font-size:22px;font-weight:800;margin:0 0 4px">${heading}</h1>
    <p style="color:#64748b;margin:0;font-size:14px">${params.autoAccepted
      ? `Thanks! We've received your order and we're getting it ready.`
      : `Thanks! We've received your order — we'll let you know once it's confirmed.`}</p>
  </div>

  ${slotSection}

  <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:12px">
    <p style="margin:0 0 10px;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;letter-spacing:0.06em">Order #${params.orderId}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${orderLinesHtml}
      ${discountRow}
      <tr style="border-top:1px solid #e2e8f0">
        <td style="padding-top:10px;font-weight:800;font-size:15px">Total</td>
        <td style="text-align:right;padding-top:10px;font-weight:800;font-size:15px">£${params.total.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  ${notesSection}

  ${collectionSection}

  <div style="background:#f1f5f9;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#1e293b">Pay at the truck on collection</p>
  </div>

  ${contactSection}

  ${cancellationSection}

  <p style="text-align:center;margin-top:20px;font-size:11px;color:#94a3b8">
    Powered by <a href="https://hatchgrab.com" style="color:#ea580c;text-decoration:none;font-weight:700">HatchGrab</a>
  </p>

</body>
</html>`

  const text = [
    `Order #${params.orderId} ${params.autoAccepted ? 'confirmed' : 'received'} — ${params.truckName}`,
    '',
    params.items.map(i => {
      const lines = [`${i.quantity}x ${i.name} — £${(i.unit_price * i.quantity).toFixed(2)}`]
      if (i.modifiers?.length) lines.push(`  + ${i.modifiers.map(m => m.name + (m.price > 0 ? ` +£${m.price.toFixed(2)}` : '') + (m.allergens && m.allergens.length ? ` (contains: ${m.allergens.join(', ')})` : '')).join(', ')}`)
      if (i.specialInstructions) lines.push(`  📝 ${i.specialInstructions}`)
      return lines.join('\n')
    }).join('\n'),
    params.deals.length ? params.deals.map(d => {
      const dSlotMods = d.slotModifiers || {}
      const slotLabel = Object.entries(d.slots)
        .filter(([, v]) => v)
        .map(([cat, itemName]) => {
          const mods = dSlotMods[cat] || []
          return mods.length ? `${itemName} (+ ${mods.map(m => m.name).join(', ')})` : itemName
        }).join(', ')
      const lines = [`🎁 ${d.name}: ${slotLabel}${d.price != null ? ` — £${d.price.toFixed(2)}` : ''}`]
      Object.entries(d.slots || {}).forEach(([cat, itemName]) => {
        if (!itemName) return
        const mods = (d.slotModifiers || {})[cat] || []
        mods.forEach(m => lines.push(`  ↳ + ${m.name}${m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}`))
        const note = (d.slotNotes || {})[cat]
        if (note) lines.push(`  ↳ 📝 ${note}`)
      })
      return lines.join('\n')
    }).join('\n') : '',
    `Total: £${params.total.toFixed(2)}`,
    params.slotAdjustedFrom && params.slot
      ? `Collection time updated to ${params.slot} (was ${params.slotAdjustedFrom}).`
      : params.autoAccepted && params.slot
        ? params.slotChanged && params.requestedSlot
          ? `Ready at ${params.slot}. Your ${params.requestedSlot} slot was just taken — this is the next available time.`
          : `Collection time: ${params.slot}. See you at the hatch!`
        : params.slot ? `Preferred collection: ${params.slot} — we'll confirm when we accept your order.` : '',
    params.notes ? `Notes: ${params.notes}` : '',
    '',
    'Pay at the truck on collection.',
    venueOneLine ? `📍 ${venueOneLine}` : '',
    (() => {
      const method = params.preferredContactMethod
      if (!method) return ''
      if (method === 'whatsapp' && params.whatsappSender) {
        const num = params.whatsappSender.replace(/[^\d+]/g, '')
        return `Questions? Message us on WhatsApp: ${num}`
      }
      if (method === 'email' && params.contactEmail) return `Questions? Email us: ${params.contactEmail}`
      if (method === 'phone' && params.contactPhone) return `Questions? Call us: ${params.contactPhone}`
      if (method === 'facebook' && params.socialFacebook) return `Questions? Message us on Facebook: ${params.socialFacebook}`
      if (method === 'messenger' && params.socialFacebook) return `Questions? Message us on Messenger: https://m.me/${params.socialFacebook.split('/').pop()}`
      if (method === 'instagram' && params.socialInstagram) return `Questions? DM us on Instagram: https://instagram.com/${params.socialInstagram.replace('@', '')}`
      return ''
    })(),
    '',
    'Powered by HatchGrab — hatchgrab.com',
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}

/**
 * Canonical TRUCK-facing "🔔 New order" notification. Used by BOTH the customer
 * self-order path (/api/orders/submit) and the walk-up / manual path
 * (/api/dashboard/action) for the truck recipient, so the operator always gets the
 * same notification regardless of how the order was placed. (The CUSTOMER still gets
 * formatConfirmationEmail on each path — that is unchanged.)
 * Markup/wording moved verbatim from the former inline block in /api/orders/submit.
 */
export function formatNewOrderEmail(params: {
  orderId: string
  customerName: string
  customerPhone?: string | null
  slot: string | null
  items: EmailOrderItem[]
  deals: EmailDeal[]
  total: number
  notes: string | null
  venueName?: string | null
  venueTown?: string | null
  venuePostcode?: string | null
  autoAccepted?: boolean
}): { subject: string; html: string; text: string } {
  const { orderId, customerName, customerPhone, slot, items, deals, total, notes,
          venueName, venueTown, venuePostcode, autoAccepted } = params

  // Single-sourced line rendering (now shows deal bundle price + slot-modifier prices too).
  const orderLinesHtml = renderOrderLinesHtml(items, deals)

  const subject = `🔔 New order #${orderId} — ${customerName}${slot ? ' · ' + slot : ''}`
  const html = `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2 style="color:#ea580c;margin:0 0 12px">🔔 New order received</h2>
            <p><strong>Order #${orderId}</strong> from <strong>${customerName}</strong></p>
            ${slot ? `<p style="font-size:16px"><strong>⏰ Collection: ${slot}</strong></p>` : '<p>No specific time — ASAP</p>'}
            ${(venueName || venueTown) ? `<p>📍 ${[venueName, venueTown, venuePostcode].filter(Boolean).join(', ')}</p>` : ''}
            ${customerPhone ? `<p>📞 <a href="tel:${customerPhone}">${customerPhone}</a></p>` : ''}
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
              ${orderLinesHtml}
              <tr style="border-top:2px solid #e2e8f0">
                <td style="padding-top:8px;font-weight:800">Total</td>
                <td style="text-align:right;padding-top:8px;font-weight:800">£${total.toFixed(2)}</td>
              </tr>
            </table>
            ${notes ? `<p><strong>📝 Notes:</strong> ${notes}</p>` : ''}
            ${autoAccepted
              ? `<p style="color:#16a34a;font-size:13px;font-weight:600;margin-top:16px">✓ Auto-confirmed — no action needed.</p>`
              : `<p style="color:#64748b;font-size:12px;margin-top:16px">Log in to your HatchGrab dashboard to confirm or reject this order.</p>`}
          </body>`
  const text = `New order #${orderId} from ${customerName}${slot ? ' for ' + slot : ''}${(venueName || venueTown) ? ' at ' + [venueName, venueTown].filter(Boolean).join(', ') : ''}. Total £${total.toFixed(2)}.${notes ? ' Notes: ' + notes : ''}`

  return { subject, html, text }
}

export async function sendConfirmationEmail(params: {
  to: string
  subject: string
  html: string
  text: string
  truckName?: string
  senderName?: string  // override sender display name (e.g. 'HatchGrab' for operator copies)
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.warn('BREVO_API_KEY not set — skipping email')
    return
  }
  try {
    const senderName = params.senderName || params.truckName || 'HatchGrab'
    const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'donotreply@villagefoodie.co.uk'
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender:      { name: senderName, email: fromAddress },
        to:          [{ email: params.to }],
        subject:     params.subject,
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

export async function sendCancellationEmail({
  to, customerName, orderId, truckName, reason, paymentStatus,
}: {
  to: string
  customerName: string
  orderId: string
  truckName: string
  reason: string | null
  paymentStatus: string | null
}): Promise<void> {
  const reasonLine = reason ? `<p style="color:#475569">${reason}</p>` : ''
  const refundLine = paymentStatus === 'paid'
    ? `<p>Your refund will be processed automatically within 3–5 working days.</p>`
    : ''
  const html = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <p>Hi ${customerName || 'there'},</p>
      <p>Your order <strong>#${orderId}</strong> from <strong>${truckName}</strong> has been cancelled.</p>
      ${reasonLine}
      ${refundLine}
      <p>We're sorry for any inconvenience.</p>
      <p>${truckName}</p>
      <p style="color:#94a3b8;font-size:12px">Powered by HatchGrab · hatchgrab.com</p>
    </div>
  `
  await sendConfirmationEmail({
    to,
    subject: `Your order has been cancelled — ${truckName}`,
    html,
    text: `Hi ${customerName || 'there'}, your order #${orderId} from ${truckName} has been cancelled.${reason ? ' ' + reason : ''}${paymentStatus === 'paid' ? ' Your refund will be processed within 3–5 working days.' : ''} We're sorry for any inconvenience. Powered by HatchGrab — hatchgrab.com`,
    truckName,
  })
}

export async function sendEventCancellationEmail({
  to, customerName, orderId, truckName, venueName, village, eventDate, note, paymentStatus,
}: {
  to: string
  customerName: string
  orderId: string
  truckName: string
  venueName: string | null
  village: string | null
  eventDate: string | null
  note: string | null
  paymentStatus: string | null
}): Promise<void> {
  const location = [venueName, village].filter(Boolean).join(', ')
  const dateFormatted = eventDate
    ? new Date(eventDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    : null
  const noteLine = note ? `<p>${note}</p>` : ''
  const refundLine = paymentStatus === 'paid'
    ? ' Your refund will be processed automatically within 3–5 working days.'
    : ''
  const html = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <p>Hi ${customerName || 'there'},</p>
      <p>Unfortunately <strong>${truckName}</strong>'s event${location ? ` at ${location}` : ''}${dateFormatted ? ` on ${dateFormatted}` : ''} has been cancelled.</p>
      ${noteLine}
      <p>Your order <strong>#${orderId}</strong> has been cancelled.${refundLine}</p>
      <p>We're sorry for any inconvenience.</p>
      <p>${truckName}</p>
      <p style="color:#94a3b8;font-size:12px">Powered by HatchGrab · hatchgrab.com</p>
    </div>
  `
  await sendConfirmationEmail({
    to,
    subject: `${truckName} at ${location || 'your event'} — cancelled`,
    html,
    text: `Hi ${customerName || 'there'}, unfortunately ${truckName}'s event${location ? ` at ${location}` : ''}${dateFormatted ? ` on ${dateFormatted}` : ''} has been cancelled. Your order #${orderId} has been cancelled.${refundLine}${note ? ' ' + note : ''} We're sorry for any inconvenience. Powered by HatchGrab — hatchgrab.com`,
    truckName,
  })
}
