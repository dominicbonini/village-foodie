// lib/email.ts
// Shared email formatting and sending for order confirmations
import type { EmailPaymentState } from '@/lib/payments/email-payment-state'

// THE PAYMENT SENTENCE, IN ONE PLACE, FOR EVERY EMAIL THAT NEEDS ONE.
//
// There used to be two possible sentences and only one caller that could choose between them, so the
// operator confirm, the ready notification, the quick-time-adjust and the edit email all printed
// "Pay at the truck on collection" — to customers whose card was held, and to customers who had
// already been charged. Two of those sites take the money in the same request.
//
// FOUR SENTENCES, BECAUSE THERE ARE FOUR THINGS THAT CAN BE TRUE.
// The word "paid" appears in exactly one of them, and only where money has actually moved. 'held' and
// 'hatch' render the two blocks that shipped before this function existed, character for character, so
// every email that was already correct is unchanged.
//
// `short` is the compact form for the edit email, which builds its own bespoke HTML and has room for a
// clause rather than a box.
export function paymentNote(
  state: EmailPaymentState,
  truckName: string,
  /** Minor units, for the states that need figures. Absent renders the same sentence without them,
   *  which is still true — a caller that cannot cheaply produce a balance is not forced to invent one.
   *  `heldMinor` is what the card is authorised for, and only 'held_short' reads it. */
  amounts?: { paidMinor: number; balanceMinor: number; heldMinor?: number },
): {
  html: string
  text: string
  short: string
  /** Appended to the "your order is ready" line — which hardcoded ". Pay at the truck." for everyone. */
  readySuffix: string
} {
  switch (state) {
    case 'captured':
      return {
        html: `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#166534">Paid by card</p>
    <p style="margin:6px 0 0;font-size:13px;color:#15803d">Your payment has gone through — nothing to pay at the truck.</p>
  </div>`,
        text: `Paid by card. Your payment has gone through — nothing to pay at the truck.`,
        short: 'Paid by card',
        readySuffix: ' Already paid by card.',
      }

    case 'part_paid': {
      // PAID SOMETHING, STILL OWES SOMETHING. Order 59: paid 6.50 by card, edited up to 13.00, and the
      // update email said "New total 13.00" and "Paid by card" — two true sentences that together tell
      // a customer they are settled when they owe half.
      // THE FIGURES COME FROM getOrderBalance VIA THE CALLER, never from this function. It renders.
      // NO FIGURES SUPPLIED means the same sentence without them. Vaguer, never wrong.
      const money = (m: number) => `£${(m / 100).toFixed(2)}`
      const paidPart = amounts ? `${money(amounts.paidMinor)} of this order is paid.` : ''
      return {
        html: `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#92400e">Part paid${amounts ? ` &mdash; ${money(amounts.balanceMinor)} still to pay` : ''}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#b45309">${paidPart}${amounts ? ` The remaining ${money(amounts.balanceMinor)} is due when you collect.` : 'The rest is due when you collect.'}</p>
  </div>`,
        text: amounts
          ? `Part paid: ${money(amounts.paidMinor)} received, ${money(amounts.balanceMinor)} still to pay when you collect.`
          : `Part paid. Some of this order is still to pay when you collect.`,
        short: amounts ? `${money(amounts.paidMinor)} paid, ${money(amounts.balanceMinor)} still to pay` : 'Part paid',
        readySuffix: amounts
          ? ` ${money(amounts.balanceMinor)} still to pay.`
          : ' Part of this order is still to pay.',
      }
    }

    case 'held':
      // Character for character the block that shipped with the cardHeld branch. Indigo, matching the
      // CARD HELD chip the operator sees, and deliberately not green: no money has moved.
      return {
        html: `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#3730a3">Your card is held, not charged</p>
    <p style="margin:6px 0 0;font-size:13px;color:#4f46e5">${truckName} takes the payment when they confirm your order. Nothing to pay at the truck.</p>
  </div>`,
        text: `Your card is held, not charged. ${truckName} takes the payment when they confirm your order — nothing to pay at the truck.`,
        short: 'Your card is held, not charged',
        readySuffix: ' Your card is held, not charged — nothing to pay at the truck.',
      }

    case 'held_short': {
      // THE HOLD IS TOO SMALL, WHICH IS NOT THE SAME FACT AS PART PAID. Nothing has been charged yet:
      // the card is standing by for the amount the customer agreed to, and an edit since has taken the
      // order past it. So this says what is held, what is still to pay, and does NOT use the word paid.
      // NO FIGURES SUPPLIED means the same sentence without them. Vaguer, never wrong.
      const money = (m: number) => `£${(m / 100).toFixed(2)}`
      const held = typeof amounts?.heldMinor === 'number' ? amounts.heldMinor : null
      const stillToPay = amounts && held !== null ? amounts.balanceMinor - held : null
      return {
        html: `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#92400e">Your card is held for part of this order${stillToPay !== null ? ` &mdash; ${money(stillToPay)} still to pay` : ''}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#b45309">${held !== null ? `${truckName} takes the ${money(held)} held when they confirm your order.` : `${truckName} takes the amount held when they confirm your order.`} ${stillToPay !== null ? `The remaining ${money(stillToPay)} is due when you collect.` : 'The rest is due when you collect.'}</p>
  </div>`,
        text: held !== null && stillToPay !== null
          ? `Your card is held for ${money(held)}, which ${truckName} takes when they confirm your order. ${money(stillToPay)} of this order is still to pay when you collect.`
          : `Your card is held for part of this order. ${truckName} takes the amount held when they confirm your order, and the rest is due when you collect.`,
        short: stillToPay !== null
          ? `Card held for part of this order, ${money(stillToPay)} still to pay`
          : 'Card held for part of this order',
        readySuffix: stillToPay !== null
          ? ` ${money(stillToPay)} still to pay.`
          : ' Part of this order is still to pay.',
      }
    }

    case 'unknown':
      // THE FOURTH SENTENCE, AND IT EXISTS BECAUSE THE HONEST ANSWER IS SOMETIMES "WE DO NOT KNOW".
      // A capture can fail in a way that leaves the money genuinely taken (captured, ledger write lost),
      // and a read can fail outright. Saying "paid" might bill nobody for real food; saying "pay at the
      // truck" charges a customer twice. This says neither, and the operative instruction — do not pay
      // again — is the one that cannot be wrong: at worst they owe money and are told at the hatch.
      return {
        html: `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#92400e">We're still confirming your payment</p>
    <p style="margin:6px 0 0;font-size:13px;color:#b45309">Your card was authorised, so please do not pay again — ${truckName} will confirm at the hatch.</p>
  </div>`,
        text: `We're still confirming your payment. Your card was authorised, so please do not pay again — ${truckName} will confirm at the hatch.`,
        short: "We're still confirming your payment",
        readySuffix: " We're still confirming your payment — please do not pay again.",
      }

    case 'hatch':
    default:
      // Character for character what every email said before any of this existed. A pay-at-hatch order,
      // a walk-up, and a card order whose hold was released without being taken all land here.
      return {
        html: `<div style="background:#f1f5f9;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#1e293b">Pay at the truck on collection</p>
  </div>`,
        text: 'Pay at the truck on collection.',
        short: 'Pay at the truck on collection',
        readySuffix: ' Pay at the truck.',
      }
  }
}

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
      `<tr><td colspan="2" style="padding:1px 0 1px 16px;font-size:12px;color:#64748b">+ ${m.name}${Number(m.price) > 0 ? ` <span style="color:#ea580c">+£${Number(m.price).toFixed(2)}</span>` : ''}</td></tr>`
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
  /** THE CUSTOMER'S CARD IS AUTHORISED AND NOT YET CHARGED. THE ONE PAYMENT FACT THIS EMAIL TAKES.
   *  Absent or false, and the email is byte-identical to every one sent before this existed, which is
   *  what keeps every pay-at-hatch order unchanged.
   *  NOT "paid" — no money has moved; the truck captures it when they confirm the order. Do not let
   *  the word "paid" into either branch below.
   *
   *  SUPERSEDED BY `paymentState`, AND KEPT BECAUSE ONE CALLER IS CORRECT AS IT STANDS.
   *  lib/payments/promote-draft passes this and nothing else, deliberately. Everything else should pass
   *  `paymentState`, which can say three things this boolean cannot: that the money has actually moved,
   *  and that we do not know. `cardHeld` is the fallback when `paymentState` is absent, so no existing
   *  caller changes by a byte. */
  cardHeld?: boolean
  /** WHAT THIS CUSTOMER OWES, IF ANYTHING — resolved once, by lib/payments/email-payment-state, and
   *  never worked out by a send site for itself.
   *    'captured'  money has moved. Nothing to pay.
   *    'held'      authorised, not captured. Nothing to pay yet and nothing to pay at the hatch.
   *    'held_short' authorised, not captured, and the hold no longer covers the order after an edit.
   *                Part of it IS owed at the hatch, and no money has moved.
   *    'hatch'     no authorisation, or one released without being taken. Money IS owed.
   *    'unknown'   we could not tell. Says neither, and asks them not to pay twice.
   *  Absent falls back to `cardHeld`, so 'hatch' and 'held' render exactly the two blocks that shipped
   *  before this parameter existed. */
  paymentState?: EmailPaymentState
  /** Minor units, ONLY read by the 'part_paid' and 'held_short' sentences. Absent renders them without
   *  figures. `heldMinor` is what the card is authorised for and is read by 'held_short' alone. */
  paidMinor?: number
  balanceMinor?: number
  heldMinor?: number
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
  /** 'ready' reuses the confirmation layout (order lines, venue, contact) reworded as an "order ready
   *  to collect" notification — drops the collection-time box + the cancel link. Default 'confirmation'. */
  variant?: 'confirmation' | 'ready'
}): { subject: string; html: string; text: string } {
  const isReady = params.variant === 'ready'
  // ONE RESOLUTION, USED BY ALL THREE PLACES THIS EMAIL MENTIONS MONEY. The fallback is what keeps
  // every existing caller byte-identical: promote-draft still passes only `cardHeld`, and the walk-up
  // and pay-at-hatch sites still pass neither.
  const payNote = paymentNote(
    params.paymentState ?? (params.cardHeld ? 'held' : 'hatch'),
    params.truckName,
    // Only the part-paid and hold-too-small sentences read these; every other branch ignores them.
    typeof params.paidMinor === 'number' && typeof params.balanceMinor === 'number'
      ? { paidMinor: params.paidMinor, balanceMinor: params.balanceMinor, heldMinor: params.heldMinor }
      : undefined,
  )
  const subject = isReady
    ? `Order #${params.orderId} is ready — ${params.truckName}`
    : params.autoAccepted
      ? `Order #${params.orderId} confirmed`
      : `Order #${params.orderId} received`

  // Single-sourced line rendering (item + deal rows) — see renderOrderLinesHtml.
  const orderLinesHtml = renderOrderLinesHtml(params.items, params.deals)

  const discountRow = ''

  const slotSection = (params.slot && !isReady) ? `
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

  // Cancellation link section (omitted on the ready notification — too late to cancel a ready order)
  const cancellationSection = (params.allowCancellation && !isReady) ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:12px;color:#94a3b8">
        Need to cancel?
        <a href="${params.baseUrl || 'https://www.hatchgrab.com'}/order/${params.orderKey}/manage" style="color:#ea580c;margin-left:4px">Cancel your order</a>
        (up to ${params.cancellationCutoffMins ?? 30} minutes before your pickup time)
      </p>
    </div>` : ''

  const heading = isReady ? 'Your order is ready! 🎉' : params.autoAccepted ? 'Order confirmed!' : 'Order received!'

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1e293b;background:#ffffff">

  <div style="text-align:center;padding:20px 0 16px">
    <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:24px;line-height:56px">✓</div>
    <h1 style="font-size:22px;font-weight:800;margin:0 0 4px">${heading}</h1>
    <p style="color:#64748b;margin:0;font-size:14px">${isReady
      // THE READY LINE ALSO SAID "Pay at the truck." TO EVERYONE, AND IT IS NOT EVEN THE PAYMENT BOX.
      // A card customer collecting an order they have already been charged for read it twice.
      ? `Your order is ready for collection — come and collect from ${params.truckName}.${payNote.readySuffix}`
      : params.autoAccepted
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

  ${payNote.html}

  ${contactSection}

  ${cancellationSection}

  <p style="text-align:center;margin-top:20px;font-size:11px;color:#94a3b8">
    Powered by <a href="https://hatchgrab.com" style="color:#ea580c;text-decoration:none;font-weight:700">HatchGrab</a>
  </p>

</body>
</html>`

  const text = [
    isReady
      ? `Order #${params.orderId} is ready to collect — ${params.truckName}`
      : `Order #${params.orderId} ${params.autoAccepted ? 'confirmed' : 'received'} — ${params.truckName}`,
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
    isReady
      ? `Your order is ready for collection — come and collect.${payNote.readySuffix}`
      : params.slotAdjustedFrom && params.slot
      ? `Collection time updated to ${params.slot} (was ${params.slotAdjustedFrom}).`
      : params.autoAccepted && params.slot
        ? params.slotChanged && params.requestedSlot
          ? `Ready at ${params.slot}. Your ${params.requestedSlot} slot was just taken — this is the next available time.`
          : `Collection time: ${params.slot}. See you at the hatch!`
        : params.slot ? `Preferred collection: ${params.slot} — we'll confirm when we accept your order.` : '',
    params.notes ? `Notes: ${params.notes}` : '',
    '',
    // THE SAME SENTENCE IN THE PLAIN TEXT. Both halves of the email had it hardcoded, so changing only
    // the HTML would have left the text part telling a paying customer to pay again — and the text part
    // is what a stripped-down or accessibility client renders.
    payNote.text,
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

/**
 * THE ONE SENTENCE A CANCELLATION EMAIL SAYS ABOUT MONEY, FOR BOTH CANCEL PATHS.
 *
 * The operator route builds its own HTML and the customer route uses sendCancellationEmail below, so
 * without this the same decision would be worded twice and drift. It returns BOTH renderings because the
 * plain-text twin must never disagree with the HTML about money.
 *
 * FOUR CASES, AND ONLY ONE OF THEM IS A REFUND:
 *   refundedMinor    money has gone back. Say the amount and how long a bank takes.
 *   refundDeclined   the operator cancelled and kept the money (a no-show). It must NOT promise a refund
 *                    and must NOT say one was refused: they may change their mind, and an email is the
 *                    wrong place to argue. It points at the truck and stops.
 *   held             nothing was ever taken and the hold has just been released.
 *   captured, undecided  the customer cancelled and nobody was present to decide. Points at the truck.
 * Anything else renders nothing, which is right for a pay-at-hatch order.
 *
 * THE TIMEFRAME IS STRIPE'S CURRENT ONE, NOT THE OLD "3-5 working days": "Your customer sees the refund
 * as a credit approximately 5-10 business days later, depending upon the bank." (docs.stripe.com/refunds,
 * "Trace a refund", read 13 August 2026.)
 */
export function cancellationPaymentSentence(args: {
  truckName: string
  paymentState?: EmailPaymentState
  /** Minor units actually refunded as part of this cancellation. Absent = no refund was issued. */
  refundedMinor?: number | null
  /** The operator was offered the refund and declined it. Distinct from "not asked". */
  refundDeclined?: boolean
}): { html: string; text: string } {
  const money = (m: number) => `£${(m / 100).toFixed(2)}`
  if (typeof args.refundedMinor === 'number' && args.refundedMinor > 0) {
    const sentence = `${money(args.refundedMinor)} has been refunded to your card. Refunds usually take 5 to 10 business days to appear on your statement, depending on your bank.`
    return { html: `<p>${sentence}</p>`, text: ` ${sentence}` }
  }
  if (args.refundDeclined) {
    const sentence = `If you have a question about payment for this order, please contact ${args.truckName}.`
    return { html: `<p>${sentence}</p>`, text: ` ${sentence}` }
  }
  if (args.paymentState === 'held' || args.paymentState === 'held_short') {
    const sentence = `Your card was held for this order, not charged. That hold has been released and no money has been taken.`
    return { html: `<p>${sentence}</p>`, text: ` ${sentence}` }
  }
  if (args.paymentState === 'captured' || args.paymentState === 'part_paid') {
    const sentence = `If you paid by card, any refund is handled by ${args.truckName} directly — please contact them about it.`
    return { html: `<p>${sentence}</p>`, text: ` ${sentence}` }
  }
  return { html: '', text: '' }
}

/**
 * A REFUND ISSUED ON ITS OWN, NOT AS PART OF A CANCELLATION.
 *
 * The order still stands; some or all of its money has gone back. A cancellation says its own thing
 * (cancellationPaymentSentence above) and must not also send this, or the customer gets two emails
 * about one event.
 *
 * FULL AND PARTIAL ARE DIFFERENT SENTENCES because they leave the customer in different positions: a
 * full refund closes the order's money, a partial one leaves the rest of it standing and the customer
 * needs to know that rather than wonder.
 * THE FIGURES COME FROM THE CALLER, never from this function, exactly as paymentNote takes its own.
 */
export async function sendRefundEmail(params: {
  to: string
  customerName: string
  orderId: string
  truckName: string
  /** Minor units refunded by THIS refund. */
  amountMinor: number
  /** What the order was charged in total, minor units. Equal to amountMinor on a full refund. */
  chargedMinor: number
}): Promise<void> {
  const money = (m: number) => `£${(m / 100).toFixed(2)}`
  const full = params.amountMinor >= params.chargedMinor
  const remaining = Math.max(0, params.chargedMinor - params.amountMinor)
  const timing = 'Refunds usually take 5 to 10 business days to appear on your statement, depending on your bank.'
  const lead = full
    ? `${params.truckName} has refunded your order. ${money(params.amountMinor)} has gone back to the card you paid with.`
    : `${params.truckName} has refunded ${money(params.amountMinor)} of your order to the card you paid with. The rest of the order, ${money(remaining)}, is unchanged.`
  const html = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <p>Hi ${params.customerName || 'there'},</p>
      <p>${lead}</p>
      <p style="color:#64748b;font-size:14px">${timing}</p>
      <p>If anything looks wrong, please contact ${params.truckName}.</p>
      <p>${params.truckName}</p>
    </div>
  `
  await sendConfirmationEmail({
    to: params.to,
    subject: full
      ? `Your order #${params.orderId} has been refunded — ${params.truckName}`
      : `A refund for your order #${params.orderId} — ${params.truckName}`,
    html,
    text: `Hi ${params.customerName || 'there'}, ${lead} ${timing} If anything looks wrong, please contact ${params.truckName}. Powered by HatchGrab — hatchgrab.com`,
    truckName: params.truckName,
  })
}

export async function sendCancellationEmail({
  to, customerName, orderId, truckName, reason, paymentStatus, paymentState, refundedMinor, refundDeclined,
}: {
  to: string
  customerName: string
  orderId: string
  truckName: string
  reason: string | null
  paymentStatus: string | null
  /** WHAT WAS TRUE OF THE MONEY WHEN THE ORDER WAS CANCELLED, from lib/payments/email-payment-state —
   *  the same resolver every other order email asks. Absent falls back to `paymentStatus`, so an older
   *  caller renders exactly what it rendered before this parameter existed.
   *  'held' IS THE ONE THIS EXISTS FOR: a cancelled held order has had its authorisation released, and
   *  the customer needs to hear that no money was taken rather than nothing at all. */
  paymentState?: EmailPaymentState
  /** Minor units refunded AS PART OF THIS CANCELLATION. Absent on the customer path, which issues none. */
  refundedMinor?: number | null
  /** The operator was offered the refund and declined it. See cancellationPaymentSentence. */
  refundDeclined?: boolean
}): Promise<void> {
  const reasonLine = reason ? `<p style="color:#475569">${reason}</p>` : ''
  // "AUTOMATICALLY" WAS ALWAYS WRONG AND IS MORE WRONG NOW THAT A BUTTON EXISTS.
  // Refunds are operator-authorised: a human opens the order, chooses an amount and a reason, and
  // presses it. CANCELLING AN ORDER ISSUES NO REFUND — this email fires on a cancellation, so the old
  // sentence promised, on the truck's behalf, an action that no code performs and that the operator may
  // decide differently. And the timeframe was never ours: "3-5 working days" is the card networks'
  // settlement window quoted as a commitment.
  // IT STILL ANSWERS THE QUESTION THE CUSTOMER HAS — who to ask — which is the one thing they need.
  // Character for character the sentence app/order/[id]/manage already settled on in August.
  // ONE DECISION, SHARED WITH THE OPERATOR CANCEL PATH, WHICH BUILDS ITS OWN HTML.
  // The `paymentStatus === 'paid'` fallback keeps a caller that passes no state rendering what it always
  // did; every current caller passes one.
  const money = cancellationPaymentSentence({
    truckName,
    paymentState: paymentState ?? (paymentStatus === 'paid' ? 'captured' : undefined),
    refundedMinor,
    refundDeclined,
  })
  const refundLine = money.html
  const refundText = money.text
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
    text: `Hi ${customerName || 'there'}, your order #${orderId} from ${truckName} has been cancelled.${reason ? ' ' + reason : ''}${refundText} We're sorry for any inconvenience. Powered by HatchGrab — hatchgrab.com`,
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
  // Same correction as the cancellation email above, for the same reasons.
  const refundLine = paymentStatus === 'paid'
    ? ` If you paid by card, any refund is handled by ${truckName} directly — please contact them about it.`
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
