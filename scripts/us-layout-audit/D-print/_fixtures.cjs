// scripts/us-layout-audit/D-print/_fixtures.cjs — the D-print group's GB / US fixtures (Pizza Kitchen, test-truck).
// One truck, one menu, one moment (Wednesday 30 September 2026, 11:50 local). GB: GBP, en-GB, Europe/London, 24h,
// VAT-inclusive (no tax line), no tip, no service fee (country seed: serviceFeeAllowed=false). US: USD, en-US,
// America/New_York, 12h, mdy, Sunday; sales tax 8.875% exclusive, 20% tip, online service fee 3% + $0.30, card fee 3%.
const { gbFromSeed, usFromSeed } = require('../../_country-settings-gb.cjs')
const GB_SEED = gbFromSeed(); const US_SEED = usFromSeed()

const TIME = {
  GB: { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' },
  US: { timeZone: 'America/New_York', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' },
}
const MONEY = { GB: { currency: 'GBP', locale: 'en-GB' }, US: { currency: 'USD', locale: 'en-US' } }
const NOW = { GB: '2026-09-30T10:50:00Z', US: '2026-09-30T15:50:00Z' }
const EVENT_DATE = '2026-09-30'

// A catering-sized basket: 6 items, modifiers (one long list), item instructions, a long order note.
const ITEMS = [
  { name: 'Margherita Pizza 12in', quantity: 24, unit_price: 12.5, modifiers: [{ name: 'Extra mozzarella', price: 1.5 }, { name: 'Gluten-free base', price: 2 }] },
  { name: 'Pepperoni & Hot Honey Pizza', quantity: 20, unit_price: 14.95, modifiers: [
    { name: 'Extra pepperoni', price: 2 }, { name: 'Hot honey drizzle', price: 0.75 }, { name: 'Fresh basil', price: 0 },
    { name: 'Chilli flakes', price: 0 }, { name: 'Garlic & rosemary oil crust', price: 1 },
    { name: 'Vegan mozzarella instead of fior di latte', price: 1.5 }] },
  { name: 'Garlic Bread with Mozzarella', quantity: 18, unit_price: 6.5, specialInstructions: "Cut into strips please - half of them without garlic for the kids' table" },
  { name: 'Nduja, Mascarpone & Rocket Pizza', quantity: 15, unit_price: 15.5, modifiers: [{ name: 'No rocket', price: 0 }], specialInstructions: 'Well done, extra crispy base please' },
  { name: 'San Pellegrino Limonata 330ml', quantity: 30, unit_price: 2.8 },
  { name: 'Tiramisu Pot', quantity: 12, unit_price: 5.95, modifiers: [{ name: 'Extra cocoa', price: 0 }] },
]
const FOOD = Math.round(ITEMS.reduce((s, it) => s + it.quantity * (it.unit_price + (it.modifiers || []).reduce((a, m) => a + (m.price || 0), 0)), 0) * 100)

// US charges, in minor units, worked the way the seed allows (3% card-fee cap; fee within the US caps).
const US_CH = (() => {
  const tax = Math.round(FOOD * 0.08875)
  const fee = Math.round(FOOD * 0.03) + 30
  const tip = Math.round(FOOD * 0.20)
  const card = Math.round((FOOD + tax + fee) * 0.03)
  return { food_minor: FOOD, tax_minor: tax, tax_rate_milli: 8875, tax_label: US_SEED.taxLabel, tip_minor: tip, tip_pct_bps: 2000,
    service_fee_minor: fee, card_surcharge_minor: card, total_minor: FOOD + tax + fee + tip + card }
})()

const ORDER_ID = 'A123'   // per-event integer counter (3 digits on a busy day) or an offline device-prefixed provisional ("A13")
const NOTES = 'NUT ALLERGY on two of the Margheritas (labelled box please) - clean board and cutter. Delivery to the school hall side door, ask for Mrs Okafor.'

function order(c) {
  const base = {
    id: ORDER_ID, order_key: 'k-a123', customer_name: 'Alexandra Montgomery-Smith',
    customer_phone: c === 'GB' ? '07700 900123' : '(212) 555-0147', customer_email: null,
    slot: '12:45', event_date: EVENT_DATE, event_id: 'ev-1', van_id: null, status: 'confirmed',
    items: ITEMS, deals: [], notes: NOTES, paid_at: null, collected_at: null, created_at: '2026-09-30T09:00:00Z', buzzer_number: 12,
    currency: MONEY[c].currency, country: c,
  }
  if (c === 'GB') return { ...base, total: FOOD / 100, total_minor: FOOD }
  return { ...base, ...US_CH, total: US_CH.total_minor / 100 }
}
function truck(c) {
  return { id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', mode: 'event', show_paid_step: true, takes_cash: true,
    plan: 'max', country: c, time: TIME[c], money: { ...MONEY[c], localeByCountry: { [c]: MONEY[c].locale } } }
}
const EVENT = { id: 'ev-1', truck_id: 'test-truck', event_date: EVENT_DATE, venue_name: 'St Mary\'s Primary School Summer Fair',
  town: 'Little Harnessville', postcode: 'HV1 2AB', start_time: '11:30', end_time: '22:45', status: 'open' }

module.exports = { TIME, MONEY, NOW, EVENT_DATE, ITEMS, FOOD, US_CH, ORDER_ID, NOTES, order, truck, EVENT, GB_SEED, US_SEED }
