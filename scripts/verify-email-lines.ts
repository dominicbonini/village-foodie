// scripts/verify-email-lines.ts
// Verifies the shared order-line renderer (renderOrderLinesHtml) outputs deal bundle prices
// and per-modifier prices — the edit-email regression (£15 deal price + +£1.50 mods missing).
//
// Run:  npx tsx scripts/verify-email-lines.ts

import { renderOrderLinesHtml, formatConfirmationEmail, formatNewOrderEmail } from '@/lib/email'

let failures = 0
const ok = (label: string, cond: boolean, got = '') => {
  console.log(`   ${cond ? '✅' : '❌'} ${label}${got ? `  →  ${got}` : ''}`)
  if (!cond) failures++
}

// Screenshot case: Dinner 2-for-£15 (BBQ Chicken + Goats Cheese), +Extra Cheese / +Extra Bacon, + Fanta.
const items = [{ name: 'Fanta', quantity: 1, unit_price: 2 }]
const deals = [{
  name: 'Dinner 2 pizzas for £15',
  slots: { pizza_1: 'BBQ Chicken', pizza_2: 'Goats Cheese' },
  slotModifiers: { pizza_1: [{ name: 'Extra Cheese', price: 1.5 }], pizza_2: [{ name: 'Extra Bacon', price: 1.5 }] },
  slotNotes: {},
  price: 15,
}]

console.log('\nShared renderer (renderOrderLinesHtml):')
{
  const html = renderOrderLinesHtml(items as any, deals as any)
  ok('deal bundle price £15.00 rendered', html.includes('£15.00'), 'deal header price cell')
  ok('Extra Cheese +£1.50 rendered', html.includes('Extra Cheese') && (html.match(/\+£1\.50/g) || []).length >= 1)
  ok('both modifier +£1.50 rendered', (html.match(/\+£1\.50/g) || []).length === 2, `${(html.match(/\+£1\.50/g) || []).length} found`)
  ok('Fanta £2.00 rendered', html.includes('Fanta') && html.includes('£2.00'))
}

console.log('\nString-vs-number coercion (action route passes strings from orders table):')
{
  const html = renderOrderLinesHtml(
    [{ name: 'Fanta', quantity: '1', unit_price: '2' }] as any,
    [{ name: 'Deal', slots: { a: 'X' }, slotModifiers: { a: [{ name: 'Cheese', price: '1.5' }] }, slotNotes: {}, price: '15' }] as any,
  )
  ok('string unit_price → £2.00', html.includes('£2.00'))
  ok('string deal price → £15.00', html.includes('£15.00'))
  ok('string mod price → +£1.50', html.includes('+£1.50'))
}

console.log('\nConfirmation + new-order emails route through the shared renderer:')
{
  const conf = formatConfirmationEmail({
    orderId: '12', orderKey: 'k', truckName: 'T', customerName: 'C', slot: '18:00',
    items: items as any, deals: deals as any, discountAmt: 0, total: 20, notes: null,
  })
  ok('confirmation email shows deal £15.00 + mods +£1.50', conf.html.includes('£15.00') && (conf.html.match(/\+£1\.50/g) || []).length === 2)
  const truck = formatNewOrderEmail({
    orderId: '12', customerName: 'C', slot: '18:00', items: items as any, deals: deals as any, total: 20, notes: null,
  })
  ok('new-order (truck) email NOW shows deal £15.00 + mods +£1.50', truck.html.includes('£15.00') && (truck.html.match(/\+£1\.50/g) || []).length === 2)
}

console.log('\n' + '─'.repeat(60))
if (failures === 0) { console.log('✅ ALL EMAIL-LINE CHECKS PASS'); process.exit(0) }
else { console.log(`❌ ${failures} check(s) FAILED`); process.exit(1) }
