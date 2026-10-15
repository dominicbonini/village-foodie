// scripts/_lp1b-fixtures.cjs — the shared GB and US fixtures for scripts/language-phase-1b.cjs (Language Phase 1b,
// docs/language-phase-1b-report.md). Built on scripts/money-sweep-parity.cjs's orders: every payment state, a refund,
// an edit up and down, a four-figure total — for a GB truck (GBP, en-GB, 24-hour, London) and a US truck (USD, en-US,
// 12-hour, Chicago, with Phase 3's tax / fee / tip snapshot on its orders).
const SEEDS = require('./_country-settings-gb.cjs')

const ITEMS = [
  { name: 'Margherita', quantity: 2, unit_price: 10.75, base_price: 9.5, modifiers: [{ name: 'Extra cheese', price: 1.25 }] },
  { name: 'Garlic bread', quantity: 1, unit_price: 4, modifiers: [] },
  { name: 'Coke', quantity: 3, unit_price: 1.8, modifiers: [], specialInstructions: 'No ice' },
]
const DEALS = [{ name: 'Lunch deal', price: 12, slots: { Pizza: 'Pepperoni', Drink: 'Fanta' }, slotModifiers: { Pizza: [{ name: 'Jalapeños', price: 0.75 }] }, slotNotes: {} }]
const ch = (minor, channel = 'online', kind = 'charge', method = 'card') => ({ kind, channel, amount_minor: minor, state: 'succeeded', method, external_ref: kind === 'charge' && channel === 'online' ? 'pi_harness' : null, livemode: true })
const ORDER_CASES = {
  card_paid:     { total: 43.9, ledger: [ch(4390)], held: false, state: 'captured', status: 'confirmed' },
  card_held:     { total: 43.9, ledger: [], held: true, state: 'held', status: 'pending' },
  pay_at_hatch:  { total: 43.9, ledger: [], held: false, state: 'hatch', status: 'confirmed' },
  part_paid:     { total: 43.9, ledger: [ch(2000, 'in_person_other', 'charge', 'cash')], held: false, state: 'part_paid', status: 'ready' },
  refunded:      { total: 43.9, ledger: [ch(4390), ch(4390, 'online', 'refund')], held: false, state: 'captured', status: 'cancelled' },
  part_refunded: { total: 43.9, ledger: [ch(4390), ch(1000, 'online', 'refund')], held: false, state: 'captured', status: 'collected' },
  cancelled:     { total: 43.9, ledger: [], held: false, state: 'hatch', status: 'cancelled' },
  cooking:       { total: 43.9, ledger: [], held: false, state: 'hatch', status: 'cooking' },
  modified:      { total: 52.4, ledger: [ch(4390, 'in_person_other', 'charge', 'card')], held: false, state: 'part_paid', status: 'modified' },
  edited_down:   { total: 39.9, ledger: [ch(4390, 'in_person_other', 'charge', 'card')], held: false, state: 'captured', status: 'confirmed' },
  rejected:      { total: 43.9, ledger: [], held: false, state: 'hatch', status: 'rejected' },
  walk_up:       { total: 21.5, ledger: [ch(2150, 'in_person_other', 'charge', 'cash')], held: false, state: 'captured', status: 'collected', walkUp: true },
  asap:          { total: 43.9, ledger: [], held: false, state: 'hatch', status: 'pending', asap: true },
  big:           { total: 1234.56, ledger: [ch(123456)], held: false, state: 'captured', status: 'confirmed' },
}
const US_SNAPSHOT = { food_minor: 4390, tax_minor: 362, tax_rate_milli: 8250, tax_inclusive: false, tax_label: 'Sales tax', tip_minor: 659, tip_pct_bps: 1500, service_fee_minor: 132, service_fee_recipient: 'truck', card_surcharge_minor: 0 }
const AT = '2026-10-09T17:30:00.000Z'

function country(cc) {
  const US = cc === 'US'
  const fmt = US ? { currency: 'USD', locale: 'en-US' } : { currency: 'GBP', locale: 'en-GB' }
  const time = US ? { timeZone: 'America/Chicago', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }
    : { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
  const phone = US ? { phoneCountry: 'US', short_name: 'US', phone_example: '(201) 555-0123', phoneCheck: 'length' }
    : (() => { const c = SEEDS.phoneCopyFromMigration().GB; return { phoneCountry: 'GB', short_name: c.shortName, phone_example: c.phoneExample, phoneCheck: SEEDS.phoneCheckDefault() } })()
  const orderOf = (key, c, i) => ({
    id: String(40 + i), order_key: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
    customer_name: c.walkUp ? 'Walk-up' : 'Sam Harness', customer_phone: US ? '(201) 555-0123' : '07700 900123', customer_email: c.walkUp ? null : 'sam@example.test',
    slot: c.asap ? null : '18:30', requested_slot: null, asap_estimate: c.asap ? '18:25' : null, event_date: '2026-10-09', event_id: 'ev-1', van_id: null, status: c.status,
    items: ITEMS.map(x => ({ ...x })), deals: DEALS.map(d => ({ ...d })), total: c.total, total_minor: Math.round(c.total * 100),
    notes: 'Ring the bell', paid_at: null, collected_at: c.status === 'collected' ? AT : null, created_at: AT, updated_at: AT, placed_at: AT,
    payment_status: c.state === 'captured' ? 'paid' : c.state === 'part_paid' ? 'part_paid' : 'unpaid',
    order_type: c.walkUp ? 'walk_up' : 'collection', buzzer_number: null, currency: fmt.currency, country: cc,
    cancellation_reason: c.status === 'cancelled' ? 'Ran out of dough' : null, rejection_reason: c.status === 'rejected' ? 'Too busy' : null,
    ...(US ? { ...US_SNAPSHOT, food_minor: Math.round(c.total * 100) } : {}),
  })
  const ORDERS = Object.fromEntries(Object.entries(ORDER_CASES).map(([k, c], i) => [k, orderOf(k, c, i)]))
  const TRUCK = {
    id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', mode: 'village', venue_name: 'The Green', logo: null,
    dashboard_token: 'harness', currency: fmt.currency, country: cc, plan: 'pro', show_paid_step: true,
    completion_presses: 'two', takes_cash: true, auto_accept: false, kds_mode: false, contact_email: 'kitchen@example.test',
    money: { ...fmt, localeByCountry: { [cc]: fmt.locale } }, time, phone,
  }
  const EVENT = { id: 'ev-1', event_date: '2026-10-09', date: '2026-10-09', start_time: '17:00', end_time: '21:00', venue_name: 'The Green', town: 'Harnessville', van_id: null, status: 'open' }
  const MENU_ITEMS = [
    { id: 'i1', name: 'Margherita', price: 9.5, category: 'Pizzas', available: true, modifierGroups: [{ id: 'g1', name: 'Extras', min_choices: 0, max_choices: 3, options: [{ id: 'o1', name: 'Extra cheese', price_adjustment: 1.25 }, { id: 'o2', name: 'Jalapeños', price_adjustment: 0.75 }] }] },
    { id: 'i2', name: 'Pepperoni', price: 11, category: 'Pizzas', available: true, modifierGroups: [] },
    { id: 'i5', name: 'Garlic bread', price: 4, category: 'Sides', available: true, modifierGroups: [] },
    { id: 'i3', name: 'Coke', price: 1.8, category: 'Drinks', available: true, modifierGroups: [] },
    { id: 'i4', name: 'Fanta', price: 1.8, category: 'Drinks', available: true, modifierGroups: [] },
  ]
  const MENU = {
    categories: [{ id: 'c1', name: 'Pizzas' }, { id: 'c3', name: 'Drinks' }, { id: 'c2', name: 'Sides' }], items: MENU_ITEMS,
    bundles: [{ name: 'Lunch deal', description: 'Any pizza and a drink', bundle_price: 12, original_price: null, available: true, start_time: null, end_time: null,
      slot_1_category: 'Pizzas', slot_2_category: 'Drinks', slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null }],
    upsell_rules: [],
  }
  const PAYMENTS = Object.fromEntries(Object.entries(ORDER_CASES).map(([k, c]) => [ORDERS[k].order_key, c.ledger]))
  const HELD = new Set([ORDERS.card_held.order_key])
  return { cc, fmt, time, phone, ORDERS, ORDER_CASES, TRUCK, EVENT, MENU, MENU_ITEMS, PAYMENTS, HELD, ITEMS, DEALS, US_SNAPSHOT }
}

module.exports = { country, ORDER_CASES, ITEMS, DEALS, NOW: '2026-10-09T17:20:00.000Z', BEFORE_REF: '0914760' }
