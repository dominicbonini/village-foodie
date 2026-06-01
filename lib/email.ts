// lib/email.ts
// Shared email formatting and sending for order confirmations

export interface EmailOrderItem {
  name: string
  quantity: number
  unit_price: number
  modifiers?: { name: string; price: number }[]
  specialInstructions?: string
}

export interface EmailDeal {
  name: string
  slots: Record<string, string>
  slotModifiers?: Record<string, { name: string; price: number }[]>
  slotNotes?: Record<string, string>
  price?: number
}

export function formatConfirmationEmail(params: {
  orderId: string
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
  // Truck contact & venue info
  venueName?: string | null
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
      ? `<td style="text-align:right;padding:4px 0 2px;color:#d97706;font-weight:500">£${deal.price.toFixed(2)}</td>`
      : `<td></td>`
    const headerRow = `<tr><td style="padding:4px 0 2px;color:#d97706;font-size:13px">🎁 ${deal.name}: ${slotNames.join(', ')}</td>${priceCell}</tr>`
    const subRows = Object.entries(deal.slots).flatMap(([cat, itemName]) => {
      if (!itemName) return []
      const rows: string[] = []
      const mods = slotMods[cat] || []
      mods.forEach(m => {
        if (m.price > 0) {
          rows.push(`<tr><td style="padding:1px 0 1px 16px;font-size:12px;color:#64748b">↳ + ${m.name}</td><td style="text-align:right;padding:1px 0;font-size:12px;color:#64748b">+£${m.price.toFixed(2)}</td></tr>`)
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

  const discountRow = ''

  const slotSection = params.slot ? `
    <div style="background:${params.autoAccepted ? '#f0fdf4' : '#fff7ed'};border:1px solid ${params.autoAccepted ? '#bbf7d0' : '#fed7aa'};border-radius:10px;padding:14px 16px;margin-bottom:12px;text-align:center">
      <p style="margin:0;color:${params.autoAccepted ? '#166534' : '#92400e'}">
        ${params.autoAccepted
          ? params.slotChanged && (params.requestedSlot ?? params.slot)
            ? `<strong style="font-size:16px">Sorry, your ${params.requestedSlot ?? params.slot} slot was taken.</strong><br><span style="font-size:13px">Your order will be ready at <strong>${params.slot}</strong>.</span>`
            : `<strong style="font-size:17px">Collection time: ${params.slot}</strong><br><span style="font-size:13px;opacity:0.85">See you at the hatch!</span>`
          : `<strong style="font-size:16px">Preferred collection time: ${params.slot}</strong><br><span style="font-size:13px;opacity:0.85">We'll confirm your collection time when we accept your order.</span>`
        }
      </p>
    </div>` : ''

  const notesSection = params.notes ? `
    <div style="margin-top:12px;padding:10px;background:#f8fafc;border-radius:8px;font-size:13px;color:#64748b">
      <strong>Special instructions:</strong> ${params.notes}
    </div>` : ''

  // Collection venue section
  const collectionSection = params.venueName ? `
    <div style="margin-top:12px;padding:12px 16px;background:#f8fafc;border-radius:8px">
      <p style="margin:0 0 2px;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;letter-spacing:0.06em">Collection</p>
      <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b">${params.venueName}</p>
      ${params.slot ? `<p style="margin:4px 0 0;font-size:14px;color:#475569">Ready at ${params.slot}</p>` : ''}
    </div>` : ''

  // Contact section
  const contactSection = (() => {
    const method = params.preferredContactMethod
    if (!method) return ''
    type ContactEntry = { label: string; value: string | null | undefined; isLink: boolean }
    const map: Record<string, ContactEntry> = {
      phone:     { label: 'Call us',                  value: params.contactPhone,     isLink: false },
      whatsapp:  { label: 'WhatsApp us',               value: params.whatsappSender ? `https://wa.me/${params.whatsappSender.replace(/\D/g, '')}` : null, isLink: true },
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
        <a href="${params.baseUrl || 'https://www.hatchgrab.com'}/order/${params.orderId}/manage${params.truckSlug ? `?truck=${params.truckSlug}` : ''}" style="color:#ea580c;margin-left:4px">Cancel your order</a>
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
    <p style="color:#64748b;margin:0;font-size:14px">Thanks! We've received your order and we're getting it ready.</p>
  </div>

  ${slotSection}

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
      if (i.modifiers?.length) lines.push(`  + ${i.modifiers.map(m => m.name + (m.price > 0 ? ` +£${m.price.toFixed(2)}` : '')).join(', ')}`)
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
    params.autoAccepted && params.slot
      ? params.slotChanged && params.requestedSlot
        ? `Sorry, your ${params.requestedSlot} slot was taken. Your order will be ready at ${params.slot}.`
        : `Collection time: ${params.slot}. See you at the hatch!`
      : params.slot ? `Preferred collection: ${params.slot} — we'll confirm when we accept your order.` : '',
    params.notes ? `Notes: ${params.notes}` : '',
    '',
    'Pay at the truck on collection.',
    '',
    'Powered by HatchGrab — hatchgrab.com',
  ].filter(Boolean).join('\n')

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
    const senderName = params.senderName || params.truckName || 'Village Foodie'
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender:      { name: senderName, email: 'donotreply@villagefoodie.co.uk' },
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
