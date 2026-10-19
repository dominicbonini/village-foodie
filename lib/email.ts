// lib/email.ts
// Shared email formatting and sending for order confirmations
import { phoneLinkDigits } from '@/lib/phone'
import type { EmailPaymentState } from '@/lib/payments/email-payment-state'
// For notifyCustomer's demo guard, moved here from app/api/dashboard/action. lib/demo imports
// nothing, so this adds no cycle.
import { isDemoIdentifier } from '@/lib/demo'
// 🔴 EVERY AMOUNT IN EVERY EMAIL IS IN THE ORDER'S CURRENCY. `money` is a REQUIRED parameter on every
// function below that prints one, so the compiler names every caller; the caller gets it from
// lib/money-server.ts (moneyFormatForOrder) — never a default, never GBP by omission.
import { formatMajor, formatMinor, type MoneyFormat } from '@/lib/money-format'
// Phase 3 screens: the order's tax, fee and tip lines — the same list every surface draws.
import { chargeLinesFor, chargeLineText, type ChargeLineSource } from '@/lib/order-charge-lines'
import { formatSlot, formatYmd, type TimeSettings } from '@/lib/time-utils'
// 🔴 EVERY CUSTOMER SENTENCE BELOW IS IN messages/en-GB.json `emailCustomer` (Language Phase 1a), read in the
// order's language — `money.locale`, its country's — so a translated email is a translated file, not an edit
// here. The markup stays in this file; a bold word or a link inside a sentence is a tag in its message.
// 🔴 The operator's "🔔 New order" email (formatNewOrderEmail) reads `emailOperator` (Language Phase 1b), in the
// truck's language — its time settings' locale, else the order's money locale. Its glyphs (🔔 ⏰ 📍 📞 📝 ✓) stay here.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/emailCustomer'
import '@/lib/i18n/catalog/emailOperator'
import { eventAddressLine } from '@/lib/event-address'

type EmailT = ReturnType<typeof translatorFor<'emailCustomer'>>
const emailT = (locale: string | null | undefined): EmailT => translatorFor(locale, 'emailCustomer')
/** A bold word in an email sentence: the message's <b> tag, as the <strong> these emails always used. */
const strong = (chunks: string) => `<strong>${chunks}</strong>`
/** Two headlines spell their dash as an HTML entity, as they always have; their text twins use the character. */
const dashEntity = (s: string) => s.replace(' — ', ' &mdash; ')

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
  amounts: { paidMinor: number; balanceMinor: number; heldMinor?: number } | undefined,
  /** The ORDER's currency and its country's locale. */
  fmt: MoneyFormat,
): {
  html: string
  text: string
  short: string
  /** Appended to the "your order is ready" line — which hardcoded ". Pay at the truck." for everyone. */
  readySuffix: string
} {
  const t = emailT(fmt.locale)
  const tr = { truck: truckName }
  switch (state) {
    case 'captured':
      return {
        html: `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#166534">${t('payNote.capturedTitle')}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#15803d">${t('payNote.capturedBody')}</p>
  </div>`,
        text: t('payNote.capturedText'),
        short: t('payNote.capturedTitle'),
        readySuffix: ` ${t('payNote.capturedReady')}`,
      }

    case 'part_paid': {
      // PAID SOMETHING, STILL OWES SOMETHING. Order 59: paid 6.50 by card, edited up to 13.00, and the
      // update email said "New total 13.00" and "Paid by card" — two true sentences that together tell
      // a customer they are settled when they owe half.
      // THE FIGURES COME FROM getOrderBalance VIA THE CALLER, never from this function. It renders.
      // NO FIGURES SUPPLIED means the same sentence without them. Vaguer, never wrong.
      const money = (m: number) => formatMinor(m, fmt)
      const fig = amounts ? { paid: money(amounts.paidMinor), balance: money(amounts.balanceMinor) } : null
      return {
        html: `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#92400e">${fig ? dashEntity(t('payNote.partPaidTitleOwing', fig)) : t('payNote.partPaidTitle')}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#b45309">${fig ? t('payNote.partPaidBodyFigures', fig) : t('payNote.partPaidBody')}</p>
  </div>`,
        text: fig ? t('payNote.partPaidTextFigures', fig) : t('payNote.partPaidText'),
        short: fig ? t('payNote.partPaidShortFigures', fig) : t('payNote.partPaidTitle'),
        readySuffix: ` ${fig ? t('payNote.stillToPay', { amount: fig.balance }) : t('payNote.partStillToPay')}`,
      }
    }

    case 'held':
      // Character for character the block that shipped with the cardHeld branch. Indigo, matching the
      // CARD HELD chip the operator sees, and deliberately not green: no money has moved.
      return {
        html: `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#3730a3">${t('payNote.heldTitle')}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#4f46e5">${t('payNote.heldBody', tr)}</p>
  </div>`,
        text: t('payNote.heldText', tr),
        short: t('payNote.heldTitle'),
        readySuffix: ` ${t('payNote.heldReady')}`,
      }

    case 'held_short': {
      // THE HOLD IS TOO SMALL, WHICH IS NOT THE SAME FACT AS PART PAID. Nothing has been charged yet:
      // the card is standing by for the amount the customer agreed to, and an edit since has taken the
      // order past it. So this says what is held, what is still to pay, and does NOT use the word paid.
      // NO FIGURES SUPPLIED means the same sentence without them. Vaguer, never wrong.
      const money = (m: number) => formatMinor(m, fmt)
      const held = typeof amounts?.heldMinor === 'number' ? amounts.heldMinor : null
      const stillToPay = amounts && held !== null ? amounts.balanceMinor - held : null
      // `held` and `stillToPay` are both set or both null (stillToPay needs held), so each sentence has two forms.
      const fig = held !== null && stillToPay !== null ? { truck: truckName, held: money(held), owing: money(stillToPay) } : null
      return {
        html: `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#92400e">${fig ? dashEntity(t('payNote.heldShortTitleOwing', fig)) : t('payNote.heldShortTitle')}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#b45309">${fig ? t('payNote.heldShortBodyFigures', fig) : t('payNote.heldShortBody', tr)}</p>
  </div>`,
        text: fig ? t('payNote.heldShortTextFigures', fig) : t('payNote.heldShortText', tr),
        short: fig ? t('payNote.heldShortShortOwing', fig) : t('payNote.heldShortShort'),
        readySuffix: ` ${fig ? t('payNote.stillToPay', { amount: fig.owing }) : t('payNote.partStillToPay')}`,
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
    <p style="margin:0;font-size:16px;font-weight:800;color:#92400e">${t('payNote.unknownTitle')}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#b45309">${t('payNote.unknownBody', tr)}</p>
  </div>`,
        text: t('payNote.unknownText', tr),
        short: t('payNote.unknownTitle'),
        readySuffix: ` ${t('payNote.unknownReady')}`,
      }

    case 'hatch':
    default:
      // Character for character what every email said before any of this existed. A pay-at-hatch order,
      // a walk-up, and a card order whose hold was released without being taken all land here.
      return {
        html: `<div style="background:#f1f5f9;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
    <p style="margin:0;font-size:16px;font-weight:800;color:#1e293b">${t('payNote.hatchTitle')}</p>
  </div>`,
        text: t('payNote.hatchText'),
        short: t('payNote.hatchTitle'),
        readySuffix: ` ${t('payNote.hatchReady')}`,
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
export function renderOrderLinesHtml(items: EmailOrderItem[], deals: EmailDeal[], fmt: MoneyFormat): string {
  const itemRows = (items || []).map(item => {
    const modRows = (item.modifiers || []).map(m =>
      `<tr><td colspan="2" style="padding:1px 0 1px 16px;font-size:12px;color:#64748b">+ ${m.name}${Number(m.price) > 0 ? ` <span style="color:#ea580c">+${formatMajor(Number(m.price), fmt)}</span>` : ''}</td></tr>`
    ).join('')
    const noteRow = item.specialInstructions
      ? `<tr><td colspan="2" style="padding:1px 0 4px 16px;font-size:12px;color:#64748b;font-style:italic">📝 ${item.specialInstructions}</td></tr>`
      : ''
    return `<tr>
      <td style="padding:4px 0 2px;color:#475569">${item.quantity}× ${item.name}</td>
      <td style="text-align:right;padding:4px 0 2px;color:#1e293b;font-weight:500">${formatMajor(Number(item.unit_price) * Number(item.quantity), fmt)}</td>
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
      ? `<td style="text-align:right;padding:4px 0 2px;color:#d97706;font-weight:500">${formatMajor(Number(deal.price), fmt)}</td>`
      : `<td></td>`
    const headerRow = `<tr><td style="padding:4px 0 2px;color:#d97706;font-size:13px">🎁 ${deal.name}: ${slotNames.join(', ')}</td>${priceCell}</tr>`
    const subRows = Object.entries(deal.slots).flatMap(([cat, itemName]) => {
      if (!itemName) return []
      const rows: string[] = []
      const mods = slotMods[cat] || []
      mods.forEach(m => {
        if (Number(m.price) > 0) {
          rows.push(`<tr><td style="padding:1px 0 1px 16px;font-size:12px;color:#64748b">↳ + ${m.name}</td><td style="text-align:right;padding:1px 0;font-size:12px;color:#64748b">+${formatMajor(Number(m.price), fmt)}</td></tr>`)
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

/**
 * 🔴 THE TAX, FEE AND TIP ROWS (Phase 3 screens), drawn where the discount row sits, above Total. The
 * same lines as the order page's totals box. ⚠️ EMPTY FOR EVERY UK ORDER (lib/order-charge-lines.ts), so
 * the rows add nothing and the email is byte-identical.
 */
export function chargeRowsHtml(charges: ChargeLineSource | null | undefined, money: MoneyFormat): string {
  return chargeLinesFor(charges, 'customer', money.locale).map(l => `
      <tr>
        <td style="padding:4px 0;color:#64748b">${l.label}${l.rate ? ` <span style="font-size:12px;color:#94a3b8">${l.rate}</span>` : ''}</td>
        <td style="text-align:right;padding:4px 0;color:#64748b">${formatMinor(l.minor, money)}</td>
      </tr>`).join('')
}
/** The same rows as text lines, e.g. "Sales tax 8.25%: $1.98". Empty for every UK order. */
export function chargeTextLines(charges: ChargeLineSource | null | undefined, money: MoneyFormat): string[] {
  return chargeLinesFor(charges, 'customer', money.locale).map(l => chargeLineText(l, m => formatMinor(m, money), money.locale))
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
  /** Phase 3 screens: the order's snapshot (tax, fee, tip). Absent, or a UK order, adds no row. */
  charges?: ChargeLineSource | null
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
  /** The event's two-letter state (truck_events.region) — only a US event saved with one; lib/event-address.ts. */
  venueRegion?: string | null
  preferredContactMethod?: string | null
  contactPhone?: string | null
  whatsappSender?: string | null
  /** 🔴 The truck's country (`trucks.country`, Phase 2C) — a nationally written WhatsApp number is read in it. */
  phoneCountry: string
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
  /** The ORDER's currency and its country's locale (lib/money-server.ts). */
  money: MoneyFormat
  /** The truck's time settings (lib/truck-time.ts) — how its collection times read (GB: as given). */
  time: TimeSettings
}): { subject: string; html: string; text: string } {
  // Every time this email prints, in the truck's style (Phase 2B). GB: exactly the string passed in.
  params = {
    ...params,
    slot: formatSlot(params.slot, params.time),
    requestedSlot: formatSlot(params.requestedSlot, params.time),
    slotAdjustedFrom: formatSlot(params.slotAdjustedFrom, params.time),
  }
  const isReady = params.variant === 'ready'
  const t = emailT(params.money.locale)
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
    params.money,
  )
  const ids = { id: params.orderId, truck: params.truckName }
  const subject = isReady
    ? t('confirmation.subjectReady', ids)
    : params.autoAccepted
      ? t('confirmation.subjectConfirmed', ids)
      : t('confirmation.subjectReceived', ids)

  // Single-sourced line rendering (item + deal rows) — see renderOrderLinesHtml.
  const orderLinesHtml = renderOrderLinesHtml(params.items, params.deals, params.money)

  // The discount row this used to hold was emptied long ago; the tax, fee and tip rows take its place.
  const discountRow = chargeRowsHtml(params.charges, params.money)

  const slotSection = (params.slot && !isReady) ? `
    <div style="background:${params.slotAdjustedFrom || !params.autoAccepted ? '#fff7ed' : '#f0fdf4'};border:1px solid ${params.slotAdjustedFrom || !params.autoAccepted ? '#fed7aa' : '#bbf7d0'};border-radius:10px;padding:14px 16px;margin-bottom:12px;text-align:center">
      <p style="margin:0;color:${params.slotAdjustedFrom || !params.autoAccepted ? '#92400e' : '#166534'}">
        ${params.slotAdjustedFrom
          ? `<strong style="font-size:16px">${t('confirmation.slotUpdated')}</strong><br><span style="font-size:17px;font-weight:800">${params.slot}</span><br><span style="font-size:13px;opacity:0.85">${t('confirmation.previously', { time: params.slotAdjustedFrom })}</span>`
          : params.autoAccepted
            ? params.slotChanged && (params.requestedSlot ?? params.slot)
              ? `<strong style="font-size:17px;font-weight:800">${t('confirmation.readyAt', { time: params.slot })}</strong><br><span style="font-size:13px;opacity:0.85">${t('confirmation.slotTaken', { time: params.requestedSlot ?? params.slot })}</span>`
              : `<strong style="font-size:17px">${t('confirmation.collectionTime', { time: params.slot })}</strong><br><span style="font-size:13px;opacity:0.85">${t('confirmation.seeYou')}</span>`
            : `<strong style="font-size:16px">${t('confirmation.preferredTime', { time: params.slot })}</strong><br><span style="font-size:13px;opacity:0.85">${t('confirmation.weWillConfirm')}</span>`
        }
      </p>
    </div>` : ''

  const notesSection = params.notes ? `
    <div style="margin-top:12px;padding:10px;background:#f8fafc;border-radius:8px;font-size:13px;color:#64748b">
      ${t.markup('confirmation.specialInstructions', { notes: params.notes, b: strong })}
    </div>` : ''

  // Collection venue — single line (matches the truck "new order" email format)
  // "Pier A Park, Hoboken, NJ 07030" when the event has a state; otherwise the same join as before (lib/event-address).
  const venueOneLine = eventAddressLine({ venueName: params.venueName, town: params.venueTown, region: params.venueRegion, postcode: params.venuePostcode })
  const collectionSection = venueOneLine
    ? `<p style="margin:12px 0 0;font-size:14px;color:#475569">📍 ${venueOneLine}</p>`
    : ''

  // Contact section
  const contactSection = (() => {
    const method = params.preferredContactMethod
    if (!method) return ''
    type ContactEntry = { label: string; value: string | null | undefined; isLink: boolean }
    const map: Record<string, ContactEntry> = {
      phone:     { label: t('confirmation.contactCall'), value: params.contactPhone, isLink: false },
      whatsapp:  (() => {
        // Customer-facing WhatsApp number: prefer the WhatsApp sender, fall back to the contact phone
        // (Gusto's number lives in contact_phone, not whatsapp_sender). Show the number VISIBLY in the
        // label so the customer can read it even if the link doesn't open, and link to a wa.me URL in
        // international digits, read in the TRUCK's country (Phase 2C, lib/phone.ts — was a hand-written
        // "→ 44…"): "07380736226" (GB) → "https://wa.me/447380736226". A number that is not a plausible
        // length for its country gets no link (it had one that could not open).
        const raw = params.whatsappSender ?? params.contactPhone
        if (!raw) return { label: t('confirmation.contactWhatsApp'), value: null as string | null, isLink: true }
        const intl = phoneLinkDigits(raw, params.phoneCountry)
        return { label: t('confirmation.contactWhatsAppNumber', { number: raw }), value: intl ? `https://wa.me/${intl}` : null, isLink: true }
      })(),
      facebook:  { label: t('confirmation.contactFacebook'), value: params.socialFacebook, isLink: true },
      messenger: { label: t('confirmation.contactMessenger'), value: params.socialFacebook ? `https://m.me/${params.socialFacebook.split('/').pop()}` : null, isLink: true },
      instagram: { label: t('confirmation.contactInstagram'), value: params.socialInstagram ? `https://instagram.com/${params.socialInstagram.replace('@', '')}` : null, isLink: true },
      email:     { label: t('confirmation.contactEmail'), value: params.contactEmail, isLink: false },
    }
    const contact = map[method]
    if (!contact?.value) return ''
    return `
    <div style="margin-top:12px;padding:14px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      <p style="margin:0 0 6px;font-size:12px;color:#64748b;font-weight:600">${t('confirmation.questions')}</p>
      ${contact.isLink
        ? `<a href="${contact.value}" style="color:#ea580c;font-size:14px;text-decoration:none">${t('confirmation.contactLink', { label: contact.label })}</a>`
        : `<p style="margin:0;font-size:14px;color:#334155">${t('confirmation.contactValue', { label: contact.label, value: contact.value })}</p>`
      }
    </div>`
  })()

  // Cancellation link section (omitted on the ready notification — too late to cancel a ready order)
  const cancellationSection = (params.allowCancellation && !isReady) ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:12px;color:#94a3b8">
        ${t.markup('confirmation.cancelLine', {
          n: params.cancellationCutoffMins ?? 30,
          count: String(params.cancellationCutoffMins ?? 30),
          // The link sits on its own line in the markup, as it always has — the tag supplies those line breaks.
          link: chunks => `\n        <a href="${params.baseUrl || 'https://www.hatchgrab.com'}/order/${params.orderKey}/manage" style="color:#ea580c;margin-left:4px">${chunks}</a>\n        `,
        })}
      </p>
    </div>` : ''

  const heading = isReady ? t('confirmation.headingReady') : params.autoAccepted ? t('confirmation.headingConfirmed') : t('confirmation.headingReceived')

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1e293b;background:#ffffff">

  <div style="text-align:center;padding:20px 0 16px">
    <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:24px;line-height:56px">✓</div>
    <h1 style="font-size:22px;font-weight:800;margin:0 0 4px">${heading}</h1>
    <p style="color:#64748b;margin:0;font-size:14px">${isReady
      // THE READY LINE ALSO SAID "Pay at the truck." TO EVERYONE, AND IT IS NOT EVEN THE PAYMENT BOX.
      // A card customer collecting an order they have already been charged for read it twice.
      ? `${t('confirmation.leadReady', { truck: params.truckName })}${payNote.readySuffix}`
      : params.autoAccepted
        ? t('confirmation.leadConfirmed')
        : t('confirmation.leadReceived')}</p>
  </div>

  ${slotSection}

  <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:12px">
    <p style="margin:0 0 10px;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;letter-spacing:0.06em">${t('confirmation.orderNumber', { id: params.orderId })}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${orderLinesHtml}
      ${discountRow}
      <tr style="border-top:1px solid #e2e8f0">
        <td style="padding-top:10px;font-weight:800;font-size:15px">${t('confirmation.total')}</td>
        <td style="text-align:right;padding-top:10px;font-weight:800;font-size:15px">${formatMajor(params.total, params.money)}</td>
      </tr>
    </table>
  </div>

  ${notesSection}

  ${collectionSection}

  ${payNote.html}

  ${contactSection}

  ${cancellationSection}

  <p style="text-align:center;margin-top:20px;font-size:11px;color:#94a3b8">
    ${t.markup('confirmation.poweredBy', { brand: chunks => `<a href="https://hatchgrab.com" style="color:#ea580c;text-decoration:none;font-weight:700">${chunks}</a>` })}
  </p>

</body>
</html>`

  const text = [
    isReady
      ? t('confirmation.textTitleReady', ids)
      : params.autoAccepted ? t('confirmation.textTitleConfirmed', ids) : t('confirmation.textTitleReceived', ids),
    '',
    params.items.map(i => {
      const lines = [`${i.quantity}x ${i.name} — ${formatMajor(i.unit_price * i.quantity, params.money)}`]
      if (i.modifiers?.length) lines.push(`  + ${i.modifiers.map(m => m.name + (m.price > 0 ? ` +${formatMajor(m.price, params.money)}` : '')).join(', ')}`)
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
      const lines = [`🎁 ${d.name}: ${slotLabel}${d.price != null ? ` — ${formatMajor(d.price, params.money)}` : ''}`]
      Object.entries(d.slots || {}).forEach(([cat, itemName]) => {
        if (!itemName) return
        const mods = (d.slotModifiers || {})[cat] || []
        mods.forEach(m => lines.push(`  ↳ + ${m.name}${m.price > 0 ? ` +${formatMajor(m.price, params.money)}` : ''}`))
        const note = (d.slotNotes || {})[cat]
        if (note) lines.push(`  ↳ 📝 ${note}`)
      })
      return lines.join('\n')
    }).join('\n') : '',
    ...chargeTextLines(params.charges, params.money),
    t('confirmation.textTotal', { amount: formatMajor(params.total, params.money) }),
    isReady
      ? `${t('confirmation.textReady')}${payNote.readySuffix}`
      : params.slotAdjustedFrom && params.slot
      ? t('confirmation.textSlotUpdated', { time: params.slot, previous: params.slotAdjustedFrom })
      : params.autoAccepted && params.slot
        ? params.slotChanged && params.requestedSlot
          ? t('confirmation.textSlotTaken', { time: params.slot, requested: params.requestedSlot })
          : t('confirmation.textCollection', { time: params.slot })
        : params.slot ? t('confirmation.textPreferred', { time: params.slot }) : '',
    params.notes ? t('confirmation.textNotes', { notes: params.notes }) : '',
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
        return t('confirmation.textWhatsApp', { value: num })
      }
      if (method === 'email' && params.contactEmail) return t('confirmation.textEmail', { value: params.contactEmail })
      if (method === 'phone' && params.contactPhone) return t('confirmation.textCall', { value: params.contactPhone })
      if (method === 'facebook' && params.socialFacebook) return t('confirmation.textFacebook', { value: params.socialFacebook })
      if (method === 'messenger' && params.socialFacebook) return t('confirmation.textMessenger', { value: `https://m.me/${params.socialFacebook.split('/').pop()}` })
      if (method === 'instagram' && params.socialInstagram) return t('confirmation.textInstagram', { value: `https://instagram.com/${params.socialInstagram.replace('@', '')}` })
      return ''
    })(),
    '',
    t('common.poweredByText'),
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
  /** Phase 3 screens: the order's snapshot (tax, fee, tip). Absent, or a UK order, adds nothing. */
  charges?: ChargeLineSource | null
  notes: string | null
  venueName?: string | null
  venueTown?: string | null
  venuePostcode?: string | null
  /** The event's two-letter state (truck_events.region) — only a US event saved with one; lib/event-address.ts. */
  venueRegion?: string | null
  autoAccepted?: boolean
  /** The ORDER's currency and its country's locale (lib/money-server.ts). */
  money: MoneyFormat
  /** The truck's time settings (lib/truck-time.ts) — how its collection time reads (GB: as given). */
  time: TimeSettings
}): { subject: string; html: string; text: string } {
  const { orderId, customerName, customerPhone, items, deals, total, notes,
          venueName, venueTown, venuePostcode, venueRegion, autoAccepted, money } = params
  const slot = formatSlot(params.slot, params.time)

  // Single-sourced line rendering (now shows deal bundle price + slot-modifier prices too).
  const orderLinesHtml = renderOrderLinesHtml(items, deals, money)

  const t = translatorFor(params.time?.locale ?? money.locale, 'emailOperator.newOrder')
  const subject = `🔔 ${t('subject', { id: orderId, name: customerName, withSlot: slot ? 'yes' : 'no', slot: slot ?? '' })}`
  const html = `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2 style="color:#ea580c;margin:0 0 12px">🔔 ${t('heading')}</h2>
            <p>${t.markup('from', { id: orderId, name: customerName, b: strong })}</p>
            ${slot ? `<p style="font-size:16px"><strong>⏰ ${t('collection', { time: slot })}</strong></p>` : `<p>${t('asap')}</p>`}
            ${(venueName || venueTown) ? `<p>📍 ${eventAddressLine({ venueName, town: venueTown, region: venueRegion, postcode: venuePostcode })}</p>` : ''}
            ${customerPhone ? `<p>📞 <a href="tel:${customerPhone}">${customerPhone}</a></p>` : ''}
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
              ${orderLinesHtml}${chargeRowsHtml(params.charges, money)}
              <tr style="border-top:2px solid #e2e8f0">
                <td style="padding-top:8px;font-weight:800">${t('total')}</td>
                <td style="text-align:right;padding-top:8px;font-weight:800">${formatMajor(total, money)}</td>
              </tr>
            </table>
            ${notes ? `<p>${t.markup('notes', { notes, b: c => `<strong>📝 ${c}</strong>` })}</p>` : ''}
            ${autoAccepted
              ? `<p style="color:#16a34a;font-size:13px;font-weight:600;margin-top:16px">✓ ${t('autoConfirmed')}</p>`
              : `<p style="color:#64748b;font-size:12px;margin-top:16px">${t('confirmPrompt')}</p>`}
          </body>`
  const chargeText = chargeTextLines(params.charges, money)
  // ⚠️ Two hand-built lists stay here as they were: the venue ("The Green, Harnessville") and the charge lines
  // joined by ". " — a later phase can make them locale lists.
  const text = t('text', {
    id: orderId, name: customerName,
    withSlot: slot ? 'yes' : 'no', slot: slot ?? '',
    withVenue: (venueName || venueTown) ? 'yes' : 'no', venue: eventAddressLine({ venueName, town: venueTown, region: venueRegion }),
    withCharges: chargeText.length ? 'yes' : 'no', charges: chargeText.join('. '),
    total: formatMajor(total, money),
    withNotes: notes ? 'yes' : 'no', notes: notes ?? '',
  })

  return { subject, html, text }
}

/**
 * 🔴 RETURNS WHETHER BREVO ACCEPTED THE MESSAGE — IT STILL NEVER THROWS.
 * Every pre-existing caller writes `await sendConfirmationEmail(...)` and ignores the result, so
 * widening void → boolean changes nothing for them. It exists for the WhatsApp alert sender, which
 * claims a row in `whatsapp_alerts` BEFORE sending and must release that claim when the send fails —
 * it cannot tell the difference between sent and silently dropped without an answer here.
 * ⚠️ false means "not delivered to Brevo", which includes the no-API-key case: nothing was sent, so a
 * caller that retries on false is right to retry.
 */
export async function sendConfirmationEmail(params: {
  to: string
  subject: string
  html: string
  text: string
  truckName?: string
  senderName?: string  // override sender display name (e.g. 'HatchGrab' for operator copies)
}): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.warn('BREVO_API_KEY not set — skipping email')
    return false
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
      return false
    }
    return true
  } catch (err) {
    console.error('Email error:', err)
    // Never throw — email failure must not fail the order
    return false
  }
}

// ── MOVED HERE FROM app/api/dashboard/action/route.ts (V11.33 extraction). BODY UNCHANGED. ─────────
// It was route-local while both its callers were in that route. The reject path now lives in
// lib/orders/reject-order.ts and the cancel path is still in the route, so a shared home is the only
// way both reach ONE implementation — and a second copy of a sender that carries the demo guard is
// exactly what that guard's comment says must not happen.
// Raw Brevo sender for the reject/cancel notices. Takes the TRUCK (not just its name) so it shares the
// demo guard above — passing only truckName would have left these two sites unguarded.
export async function notifyCustomer(
  truck: { id?: string | null; name?: string | null } | null | undefined,
  email: string,
  subject: string,
  html: string,
  /** ⚠️ OPTIONAL, AND ABSENT MEANS EXACTLY TODAY'S BEHAVIOUR. Every email this helper has ever sent went
   *  out HTML-only; a client that renders text sees Brevo's own strip of the markup. The CANCELLATION
   *  passes one, because it now states what happened to a customer's money and that sentence must exist
   *  in both renderings — the rule lib/email already follows. */
  text?: string,
) {
  const truckName = truck?.name ?? undefined
  if (isDemoIdentifier(truck?.id)) {
    console.log(`[dashboard/action] demo truck ${truck?.id} — email to ${email} suppressed`)
    return
  }
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
        ...(text ? { textContent: text } : {}),
      }),
    })
  } catch (err) { console.error('Email failed:', err) }
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
  /** The ORDER's currency and its country's locale (lib/money-server.ts). */
  money: MoneyFormat
}): { html: string; text: string } {
  const money = (m: number) => formatMinor(m, args.money)
  const t = emailT(args.money.locale)
  const wrap = (sentence: string) => ({ html: `<p>${sentence}</p>`, text: ` ${sentence}` })
  if (typeof args.refundedMinor === 'number' && args.refundedMinor > 0) {
    return wrap(t('cancelSentence.refunded', { amount: money(args.refundedMinor) }))
  }
  if (args.refundDeclined) {
    return wrap(t('cancelSentence.refundDeclined', { truck: args.truckName }))
  }
  if (args.paymentState === 'held' || args.paymentState === 'held_short') {
    return wrap(t('cancelSentence.heldReleased'))
  }
  if (args.paymentState === 'captured' || args.paymentState === 'part_paid') {
    return wrap(t('cancelSentence.paidContactTruck', { truck: args.truckName }))
  }
  return { html: '', text: '' }
}

/**
 * THE ONE SENTENCE A REJECTION EMAIL SAYS ABOUT MONEY.
 *
 * A REJECTION IS NOT A CANCELLATION AND CANNOT BORROW ITS SENTENCE. A cancelled order may have been
 * captured and may be owed a refund; a rejected order was refused before it was ever served, so the only
 * two states it can honestly be in are "a hold was taken and has gone back" and "nothing was ever taken".
 * It has no refund case to state, and it must not imply one.
 *
 * 🔴 IT REPORTS THE RELEASE THAT HAPPENED, NOT THE ONE THAT WAS ATTEMPTED. `holdReleased` comes from the
 * release call's own return value, because that call can fail without throwing — Stripe unreachable, a
 * ledger read that would not answer. Saying "that hold has been released" to somebody whose hold is
 * still live is the one sentence here that cannot be walked back, so a failed release gets the sentence
 * that is true either way: nothing was taken, and the hold ends by itself.
 *
 * THE FALL-THROUGH IS SILENCE, exactly as cancellationPaymentSentence's is. An unknown state says
 * nothing rather than guessing, and a caller with no state renders no line at all.
 */
export function rejectionPaymentSentence(args: {
  truckName: string
  paymentState?: EmailPaymentState
  /** Did the release actually succeed? From the release call's return value, never assumed. */
  holdReleased?: boolean
  /** The order's language (its country's locale); en-GB when absent. */
  locale?: string | null
}): { html: string; text: string } {
  const t = emailT(args.locale)
  const wrap = (sentence: string) => ({ html: `<p>${sentence}</p>`, text: ` ${sentence}` })
  if (args.paymentState === 'held' || args.paymentState === 'held_short') {
    return wrap(args.holdReleased
      ? t('rejectSentence.heldReleased')
      : t('rejectSentence.heldWillClear', { truck: args.truckName }))
  }
  // Pay at the hatch, or a card order whose hold had already gone. Nothing was ever taken, and this is
  // the case the overwhelming majority of rejections are in.
  if (args.paymentState === 'hatch') {
    return wrap(t('rejectSentence.notCharged'))
  }
  // ⚠️ SHOULD NOT HAPPEN AND IS HANDLED ANYWAY. Reject is offered on pending orders, and no capture site
  // fires before an order is confirmed — but if money HAS moved, the one thing this must not do is print
  // "you have not been charged" over a real charge.
  if (args.paymentState === 'captured' || args.paymentState === 'part_paid') {
    return wrap(t('rejectSentence.paidContactTruck', { truck: args.truckName }))
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
  /** The ORDER's currency and its country's locale (lib/money-server.ts). */
  money: MoneyFormat
}): Promise<void> {
  const money = (m: number) => formatMinor(m, params.money)
  const full = params.amountMinor >= params.chargedMinor
  const remaining = Math.max(0, params.chargedMinor - params.amountMinor)
  const t = emailT(params.money.locale)
  const hi = t('common.hi', { withName: params.customerName ? 'yes' : 'no', name: params.customerName || '' })
  const timing = t('refund.timing')
  const lead = full
    ? t('refund.leadFull', { truck: params.truckName, amount: money(params.amountMinor) })
    : t('refund.leadPartial', { truck: params.truckName, amount: money(params.amountMinor), remaining: money(remaining) })
  const contact = t('refund.contact', { truck: params.truckName })
  const html = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <p>${hi}</p>
      <p>${lead}</p>
      <p style="color:#64748b;font-size:14px">${timing}</p>
      <p>${contact}</p>
      <p>${params.truckName}</p>
    </div>
  `
  await sendConfirmationEmail({
    to: params.to,
    subject: full
      ? t('refund.subjectFull', { id: params.orderId, truck: params.truckName })
      : t('refund.subjectPartial', { id: params.orderId, truck: params.truckName }),
    html,
    text: `${hi} ${lead} ${timing} ${contact} ${t('common.poweredByText')}`,
    truckName: params.truckName,
  })
}

export async function sendCancellationEmail({
  to, customerName, orderId, truckName, reason, paymentStatus, paymentState, refundedMinor, refundDeclined, money: fmt,
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
  /** The ORDER's currency and its country's locale (lib/money-server.ts). */
  money: MoneyFormat
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
    money: fmt,
  })
  const refundLine = money.html
  const refundText = money.text
  const t = emailT(fmt.locale)
  const named = { withName: customerName ? 'yes' : 'no', name: customerName || '' }
  const html = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <p>${t('common.hi', named)}</p>
      <p>${t.markup('cancellation.body', { id: orderId, truck: truckName, b: strong })}</p>
      ${reasonLine}
      ${refundLine}
      <p>${t('common.sorry')}</p>
      <p>${truckName}</p>
      <p style="color:#94a3b8;font-size:12px">${t('common.poweredByDot')}</p>
    </div>
  `
  await sendConfirmationEmail({
    to,
    subject: t('cancellation.subject', { truck: truckName }),
    html,
    text: `${t('cancellation.textLead', { ...named, id: orderId, truck: truckName })}${reason ? ' ' + reason : ''}${refundText} ${t('common.sorry')} ${t('common.poweredByText')}`,
    truckName,
  })
}

export async function sendEventCancellationEmail({
  to, customerName, orderId, truckName, venueName, village, region, eventDate, note, paymentStatus, time,
}: {
  to: string
  customerName: string
  orderId: string
  truckName: string
  venueName: string | null
  village: string | null
  /** The event's two-letter state, when it has one (lib/event-address.ts). */
  region?: string | null
  eventDate: string | null
  note: string | null
  paymentStatus: string | null
  /** The truck's time settings (lib/truck-time.ts) — the date in its country's words and order. */
  time: TimeSettings
}): Promise<void> {
  const location = eventAddressLine({ venueName, town: village, region })
  const dateFormatted = eventDate
    ? formatYmd(eventDate, time, { weekday: 'long', day: 'numeric', month: 'long' })
    : null
  const noteLine = note ? `<p>${note}</p>` : ''
  const t = emailT(time.locale)
  // Same correction as the cancellation email above, for the same reasons — and the same sentence.
  const refundLine = paymentStatus === 'paid'
    ? ` ${t('cancelSentence.paidContactTruck', { truck: truckName })}`
    : ''
  const named = { withName: customerName ? 'yes' : 'no', name: customerName || '' }
  const where = {
    truck: truckName, withLocation: location ? 'yes' : 'no', location,
    withDate: dateFormatted ? 'yes' : 'no', date: dateFormatted ?? '',
  }
  const html = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <p>${t('common.hi', named)}</p>
      <p>${t.markup('eventCancellation.body', { ...where, b: strong })}</p>
      ${noteLine}
      <p>${t.markup('eventCancellation.orderCancelled', { id: orderId, b: strong })}${refundLine}</p>
      <p>${t('common.sorry')}</p>
      <p>${truckName}</p>
      <p style="color:#94a3b8;font-size:12px">${t('common.poweredByDot')}</p>
    </div>
  `
  await sendConfirmationEmail({
    to,
    subject: t('eventCancellation.subject', where),
    html,
    text: `${t('eventCancellation.textLead', { ...named, ...where, id: orderId })}${refundLine}${note ? ' ' + note : ''} ${t('common.sorry')} ${t('common.poweredByText')}`,
    truckName,
  })
}
