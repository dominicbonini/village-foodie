// scripts/_lp1b-operatorMail.cjs — Language Phase 1b, area "operatorMail" (run by scripts/language-phase-1b.cjs).
// THE EMAILS SENT TO THE TRUCK, byte for byte (subject, HTML, text), for a GB truck and a US truck:
//   • formatNewOrderEmail (lib/email.ts — the "🔔 New order" notice built for /api/orders/submit,
//     /api/dashboard/action and lib/payments/promote-draft.ts) for every order fixture, auto-accepted or not, with
//     and without a slot (ASAP), phone, venue (name/town/postcode), notes; US orders carry tax, fee and tip;
//   • its shared pieces — renderOrderLinesHtml, chargeRowsHtml, chargeTextLines — which the customer emails share;
//   • every WhatsApp alert email in lib/whatsapp/alert-copy.ts: the three OPERATOR ones (limit 80 %, limit 100 %,
//     payment blocked) and, unchanged, the three ADMIN ones.
// ⚠️ AFTER, the operator alerts take the truck's locale as an optional trailing argument; BEFORE ignores it.
async function views(ctx) {
  const { kit, GB, US } = ctx
  const E = await kit.bundle('lp1b-opmail', "export * from '@/lib/email'\nexport { chargeSourceOf } from '@/lib/order-charge-lines'")
  const A = await kit.bundle('lp1b-alerts', "export * from '@/lib/whatsapp/alert-copy'")
  const out = {}
  for (const C of [GB, US]) {
    const cc = C.cc
    const money = C.fmt
    const items = C.ITEMS.map(x => ({ ...x }))
    const deals = C.DEALS.map(d => ({ ...d }))
    out[`lines|${cc}`] = E.renderOrderLinesHtml(items, deals, money)
    const charges = E.chargeSourceOf(C.ORDERS.card_paid)
    out[`chargeRows|${cc}`] = E.chargeRowsHtml(charges, money)
    out[`chargeText|${cc}`] = E.chargeTextLines(charges, money)
    for (const [k, o] of Object.entries(C.ORDERS)) {
      const base = {
        orderId: o.id, customerName: o.customer_name, customerPhone: o.customer_phone, slot: o.slot, items, deals, total: o.total,
        charges: E.chargeSourceOf(o), notes: o.notes, venueName: 'The Green', venueTown: 'Harnessville', venuePostcode: null,
        autoAccepted: false, money, time: C.time,
      }
      out[`new|${cc}|${k}`] = E.formatNewOrderEmail(base)
      out[`new|${cc}|${k}|auto`] = E.formatNewOrderEmail({ ...base, autoAccepted: true })
      if (['card_paid', 'asap', 'walk_up', 'big'].includes(k)) {
        out[`new|${cc}|${k}|bare`] = E.formatNewOrderEmail({ ...base, customerPhone: null, notes: null, venueName: null, venueTown: null, charges: null })
        out[`new|${cc}|${k}|postcode`] = E.formatNewOrderEmail({ ...base, venuePostcode: 'AB1 2CD' })
        out[`new|${cc}|${k}|townOnly`] = E.formatNewOrderEmail({ ...base, venueName: null, venueTown: 'Harnessville', autoAccepted: true })
        out[`new|${cc}|${k}|nameOnly`] = E.formatNewOrderEmail({ ...base, venueName: 'The Green', venueTown: null, slot: null })
        out[`new|${cc}|${k}|noLines`] = E.formatNewOrderEmail({ ...base, items: [], deals: [], customerName: '' })
      }
    }
    // The alert emails — the locale is the truck's (BEFORE ignores the extra argument).
    const L = money.locale
    out[`alert|${cc}|limit80`] = A.limit80Email({ truckName: 'Pizza <Kitchen> & "Co"', used: 800, limit: 1000, resetLabel: '1 November', manageUrl: 'https://www.hatchgrab.com/manage/x' }, L)
    out[`alert|${cc}|limit80big`] = A.limit80Email({ truckName: 'Pizza Kitchen', used: 12000, limit: 15000, resetLabel: 'November 1', manageUrl: 'https://www.hatchgrab.com/manage/x' }, L)
    out[`alert|${cc}|limit100`] = A.limit100Email({ truckName: 'Pizza <Kitchen>', limit: 1000, resetLabel: '1 November', manageUrl: 'https://www.hatchgrab.com/manage/x' }, L)
    out[`alert|${cc}|limit100big`] = A.limit100Email({ truckName: 'Pizza Kitchen', limit: 25000, resetLabel: 'November 1', manageUrl: 'https://www.hatchgrab.com/manage/x' }, L)
    out[`alert|${cc}|paymentBlocked`] = A.paymentBlockedEmail({ truckName: 'Pizza & Co', manageUrl: 'https://www.hatchgrab.com/manage/x', whatsappManagerUrl: 'https://business.facebook.com/wa/manage/' }, L)
  }
  // Admin alerts — internal, unchanged, proven so.
  for (const [k, p] of [['a', { daysLeft: null, code: null, subcode: null }], ['b', { daysLeft: 0, code: 190, subcode: 463 }], ['c', { daysLeft: 1, code: 190, subcode: null }], ['d', { daysLeft: 9, code: 4, subcode: null }]]) {
    out[`admin|failing|${k}`] = A.tokenRefreshFailingEmail({ truckName: 'Pizza <K>', truckId: 'tid', ...p })
    out[`admin|urgent|${k}`] = A.tokenRefreshUrgentEmail({ truckName: 'Pizza <K>', truckId: 'tid', ...p })
    out[`admin|invalid|${k}`] = A.tokenInvalidEmail({ truckName: 'Pizza <K>', truckId: 'tid', code: p.code, subcode: p.subcode })
  }
  return out
}

module.exports = { views }
