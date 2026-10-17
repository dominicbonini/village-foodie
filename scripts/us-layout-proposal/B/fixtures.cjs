// scripts/us-layout-proposal/B/fixtures.cjs — group B (dashboard + KDS) fixtures for the US layout proposal: the US layout
// audit's B-ops fixtures, unchanged (scripts/us-layout-audit/B-ops/fixtures.cjs).
// Pizza Kitchen (test-truck), the same truck and menu in GB and US, at Wednesday 30 September 2026 11:50 local
// (GB 10:50Z, US 15:50Z). Built on scripts/_lp1b-fixtures.cjs (truck, money, time settings) — only the zone
// (US → America/New_York, per the brief) and the worst-case orders / events / slots are added here.
const FIX = require('../../_lp1b-fixtures.cjs')

const DATE = '2026-09-30'
const NOW = { GB: '2026-09-30T10:50:00Z', US: '2026-09-30T15:50:00Z' }
const TZ = { GB: 'Europe/London', US: 'America/New_York' }
const LOCALE = { GB: 'en-GB', US: 'en-US' }

const PRICE = { 'Margherita': 12, 'Pepperoni': 14, 'Hot Honey Pepperoni': 15, 'Supreme': 16, 'BBQ Chicken': 15, 'Meat Lovers': 16,
  'Garlic bread': 5, 'Coke': 2.5, 'Lemonade': 3, 'Cannoli': 6 }
const CAT = n => (['Coke', 'Lemonade'].includes(n) ? 'Drinks' : ['Cannoli'].includes(n) ? 'Desserts' : n === 'Garlic bread' ? 'Sides' : 'Pizza')

// ── THE CATERING BASKET: 6 lines, one long modifier list, special instructions, a 4-digit total ──
const CATERING = [
  { name: 'Margherita', quantity: 24, unit_price: 16.25, base_price: 12, modifiers: [
    { name: 'Extra mozzarella', price: 1.5 }, { name: 'Gluten-free base', price: 2 }, { name: 'Garlic oil drizzle', price: 0.75 }] },
  { name: 'Pepperoni', quantity: 20, unit_price: 15.5, base_price: 14, modifiers: [{ name: 'Hot honey', price: 1 }, { name: 'Jalapeños', price: 0.5 }] },
  { name: 'Hot Honey Pepperoni', quantity: 12, unit_price: 15, modifiers: [], specialInstructions: 'Cut into squares for the kids’ table, please — no crusts' },
  { name: 'Garlic bread', quantity: 12, unit_price: 5, modifiers: [{ name: 'Add cheese', price: 1 }] },
  { name: 'Lemonade', quantity: 30, unit_price: 3, modifiers: [] },
  { name: 'Cannoli', quantity: 17, unit_price: 6.92, modifiers: [{ name: 'Chocolate chip', price: 0.5 }] },
]
const it = (name, quantity, modifiers = [], specialInstructions) => ({ name, quantity, unit_price: PRICE[name] + modifiers.reduce((s, m) => s + m.price, 0),
  base_price: PRICE[name], modifiers, ...(specialInstructions ? { specialInstructions } : {}) })

// [id, name, slot|null, status, items, foodMajor, notes, paid]
// Order numbers: the per-event counter (increment_event_order_counter), falling back to the never-resetting
// truck counter when an order has no event — so 4 digits is the realistic longest; offline ids are 'A13'.
const ROWS = [
  ['1231', 'Ava Martinez-Lopez', '12:45', 'pending', [it('Supreme', 2, [{ name: 'No olives', price: 0 }]), it('Coke', 2)], 37, null, false],
  ['1234', 'Ben Okafor', '11:35', 'confirmed', [it('BBQ Chicken', 1), it('Lemonade', 1)], 18, null, false],
  ['1235', 'Chloe Nguyen', '11:55', 'ready', [it('Margherita', 2, [{ name: 'Extra mozzarella', price: 1.5 }]), it('Coke', 2)], 32, null, true],
  ['1236', 'Daniel Fitzgerald', '12:15', 'cooking', [it('Meat Lovers', 1), it('Pepperoni', 1), it('Cannoli', 2)], 42, null, false],
  ['1233', 'Christopher Montgomery', '12:45', 'confirmed', CATERING, 1234.56, 'Ring the bell when ready — we’re at the blue gazebo by the bandstand', true],
  ['1237', 'Elizabeth Worthington', '12:45', 'confirmed', [it('Hot Honey Pepperoni', 2, [{ name: 'Extra hot honey', price: 1 }]), it('Garlic bread', 1)], 37, null, false],
  ['1238', 'Fatima Al-Hassan', '22:45', 'confirmed', [it('Pepperoni', 1)], 14, null, false],
]

function charges(cc, foodMinor, catering) {
  if (cc === 'GB') return { food_minor: foodMinor, tax_minor: 0, tax_rate_milli: null, tax_inclusive: true, tax_label: 'VAT', tip_minor: 0, tip_pct_bps: null, service_fee_minor: 0, card_surcharge_minor: 0, total_minor: foodMinor }
  const tax = Math.round(foodMinor * 0.08875)
  const fee = Math.round(foodMinor * 0.03) + 30
  const tip = Math.round(foodMinor * 0.2)
  const card = catering ? Math.round((foodMinor + tax + fee) * 0.03) : 0
  return { food_minor: foodMinor, tax_minor: tax, tax_rate_milli: 8875, tax_inclusive: false, tax_label: 'Sales tax', tip_minor: tip, tip_pct_bps: 2000,
    service_fee_minor: fee, service_fee_recipient: 'truck', card_surcharge_minor: card, total_minor: foodMinor + tax + fee + tip + card }
}

function country(cc) {
  const base = FIX.country(cc)
  const time = { ...base.time, timeZone: TZ[cc] }
  const truck = { ...base.TRUCK, time, name: 'Pizza Kitchen', plan: 'max', feature_overrides: {}, trial_expires_at: null, add_order_layout: 'tabs', takes_cash: false,
    completion_presses: 'one', kds_mode: false, keep_screen_on: true, auto_accept: false, venue_name: null, show_paid_step: false }
  const EV = { id: 'ev-1', event_date: DATE, date: DATE, start_time: '11:30', end_time: '22:45', venue_name: 'Riverside Park', town: 'Springfield', van_id: null,
    truck_id: truck.id, status: 'open', auto_open: true, closed_at: null, customer_note: null }
  // The midnight-spanning event: 20:00–00:30, not started yet at 11:50 (and not auto-opening, so the KDS shows Start Event).
  const EV_MID = { ...EV, id: 'ev-2', start_time: '20:00', end_time: '00:30', venue_name: 'Harbor Night Market', town: 'Springfield', status: 'confirmed', auto_open: false }
  const at = '2026-09-30T09:30:00.000Z'
  const ch = minor => ({ kind: 'charge', channel: 'online', amount_minor: minor, state: 'succeeded', method: 'card', external_ref: 'pi_harness', livemode: true })
  const payments = {}
  const orders = (eventId) => ROWS.map(([id, who, slot, status, items, food, notes, paid], i) => {
    const c = charges(cc, Math.round(food * 100), id === '1233')
    const order_key = `00000000-0000-4000-8000-0000000003${String(i).padStart(2, '0')}`
    if (paid) payments[order_key] = [ch(c.total_minor)]
    return { id, order_key, customer_name: who, customer_phone: base.phone.phone_example, customer_email: `${who.split(' ')[0].toLowerCase()}@example.test`, slot,
      requested_slot: null, asap_estimate: null, event_date: DATE, event_id: eventId, van_id: null, status, items, deals: [], total: c.total_minor / 100, notes,
      paid_at: null, collected_at: null, created_at: at, updated_at: at, placed_at: at, payment_status: paid ? 'paid' : 'unpaid', order_type: 'collection',
      buzzer_number: null, currency: base.fmt.currency, country: cc, ...c }
  })
  const itemCategoryMap = Object.fromEntries(Object.keys(PRICE).map(n => [n, CAT(n)]))
  // The day-load series: every 5 minutes across the window; a mix of tones and the engine's "{n} {Category}" labels.
  const series = (start, end) => {
    const out = []; const [sh, sm] = start.split(':').map(Number); let [eh, em] = end.split(':').map(Number)
    let s = sh * 60 + sm, e = eh * 60 + em; if (e <= s) e += 1440
    for (let m = s, k = 0; m <= e; m += 5, k++) {
      const mm = m % 1440; const t = `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
      const tone = k % 7 === 3 ? 'red' : k % 4 === 1 ? 'amber' : 'green'
      out.push({ collection_time: t, production_slot: t, current_orders: k % 5, max_orders: 6, available: tone !== 'red', is_past: false, is_grace: false, remaining: 6 - (k % 5),
        tone, label: tone === 'green' ? (k % 2 ? '1 Pizza' : '') : tone === 'amber' ? '4 Pizza, 2 Drinks' : 'Pizza 6/6' })
    }
    return out
  }
  return { cc, base, time, truck, EV, EV_MID, orders, payments, itemCategoryMap, series, locale: LOCALE[cc], now: NOW[cc], tz: TZ[cc] }
}

// The Add-order basket: 6 lines with modifiers and an instruction (the panel's own BasketItem shape).
const BASKET = [
  { name: 'Margherita', quantity: 2, unit_price: 16.25, base_price: 12, cartKey: 'Margherita|1', modifiers: [{ name: 'Extra mozzarella', price: 1.5 }, { name: 'Gluten-free base', price: 2 }, { name: 'Garlic oil drizzle', price: 0.75 }] },
  { name: 'Pepperoni', quantity: 1, unit_price: 15.5, base_price: 14, cartKey: 'Pepperoni|1', modifiers: [{ name: 'Hot honey', price: 1 }, { name: 'Jalapeños', price: 0.5 }] },
  { name: 'Hot Honey Pepperoni', quantity: 1, unit_price: 15, cartKey: 'HHP', modifiers: [], specialInstructions: 'Cut into squares, please' },
  { name: 'Garlic bread', quantity: 2, unit_price: 6, base_price: 5, cartKey: 'GB|1', modifiers: [{ name: 'Add cheese', price: 1 }] },
  { name: 'Lemonade', quantity: 3, unit_price: 3, cartKey: 'Lemonade', modifiers: [] },
  { name: 'Cannoli', quantity: 2, unit_price: 6.5, base_price: 6, cartKey: 'Cannoli|1', modifiers: [{ name: 'Chocolate chip', price: 0.5 }] },
]
const MENU = (() => {
  let n = 0
  const items = Object.entries(PRICE).map(([name, price]) => ({ id: `m${++n}`, name, price, category: CAT(name), available: true,
    modifierGroups: name === 'Margherita' ? [{ id: 'g1', name: 'Extras', min_choices: 0, max_choices: 3, options: [{ id: 'o1', name: 'Extra mozzarella', price_adjustment: 1.5 }] }] : [] }))
  return { categories: [{ id: 'c1', name: 'Pizza' }, { id: 'c2', name: 'Sides' }, { id: 'c3', name: 'Drinks' }, { id: 'c4', name: 'Desserts' }], items, bundles: [], upsell_rules: [] }
})()

module.exports = { country, DATE, NOW, TZ, LOCALE, BASKET, MENU, PRICE, CAT }
