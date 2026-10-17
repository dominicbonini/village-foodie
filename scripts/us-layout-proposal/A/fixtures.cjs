// US layout proposal, group A (customer) — copied from the audit (scripts/us-layout-audit/A-customer). The GB and US fixtures for Pizza Kitchen (test-truck / test-kitchen).
// Same truck, same menu, same basket, same moment: Wednesday 30 September 2026, 11:50 local in each zone.
// Nothing here reaches a database or the network.
const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const SEEDS = require(path.join(REPO, 'scripts/_country-settings-gb.cjs'))

const C = {
  GB: {
    code: 'GB', locale: 'en-GB', nowIso: '2026-09-30T10:50:00Z', tz: 'Europe/London',
    money: { currency: 'GBP', locale: 'en-GB' },
    time: { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' },
    phone: { phoneCountry: 'GB', short_name: 'UK', phone_example: '07700 900123', phoneCheck: 'length' },
    postcode: 'KT1 1LF', village: 'Kingston',
  },
  US: {
    code: 'US', locale: 'en-US', nowIso: '2026-09-30T15:50:00Z', tz: 'America/New_York',
    money: { currency: 'USD', locale: 'en-US' },
    time: { timeZone: 'America/New_York', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' },
    phone: { phoneCountry: 'US', short_name: 'US', phone_example: '(201) 555-0123', phoneCheck: 'length' },
    postcode: '07030', village: 'Hoboken',
  },
}

// The country rows from the seed. The US caps are null in the seed (no truck fee possible), so — as
// scripts/phase3-screens-shots.cjs does — they are set to 4 % + 50¢ so a 3 % + 30¢ fee sits within them.
const countryRow = code => code === 'GB' ? SEEDS.gbFromSeed() : { ...SEEDS.usFromSeed(), serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: 50 }
const truckChargeFields = code => code === 'GB'
  ? { country: 'GB', tax_rate_milli: null, tipping_enabled: null, service_fee_enabled: false }
  : { country: 'US', tax_rate_milli: 8875, tipping_enabled: true, service_fee_enabled: true, service_fee_bps: 300, service_fee_fixed_minor: 30 }

// ── the menu ──
const it = (id, name, description, price, category, sub) => ({ id, name, description, price, category, subcategory_id: sub, available: true, photo_url: null, dietary: [], allergens: [], modifierGroups: [] })
const items = [
  it('p1', 'Margherita', 'Tomato sauce, fresh mozzarella, fresh basil, extra virgin olive oil.', 12, 'Pizza', 's1'),
  it('p2', 'Pepperoni', 'Tomato sauce, mozzarella, pepperoni, hot honey.', 15, 'Pizza', 's1'),
  it('p3', 'Supreme', 'Pepperoni, sausage, black olives, mozzarella, red sauce.', 16, 'Pizza', 's1'),
  it('p4', 'Garlic Knots', 'Six knots, garlic butter, parmesan, marinara for dipping.', 8, 'Pizza', 's2'),
  { ...it('d1', 'Cannoli', 'Two crisp shells, sweet ricotta, chocolate chips.', 6, 'Desserts'), subcategory_id: undefined },
  { ...it('k1', 'Coke', '12 oz can.', 2.5, 'Drinks'), subcategory_id: undefined },
]
const menu = {
  categories: [{ id: 'c1', name: 'Pizza', subcategories: [{ id: 's1', name: 'Specials', sort_order: 1 }, { id: 's2', name: 'Sides', sort_order: 2 }] }, { id: 'c2', name: 'Desserts' }, { id: 'c3', name: 'Drinks' }],
  items, upsell_rules: [], bundles: [],
}
// ── a catering-sized basket: 6 lines, modifiers (one long list) and special instructions ──
const basket = [
  { menuItem: items[0], quantity: 12, modifiers: [{ name: 'Extra mozzarella', price: 1.5 }, { name: 'Gluten-free base', price: 2 }], specialInstructions: 'Cut into 8 slices, well done please', cartKey: 'b1' },
  { menuItem: items[1], quantity: 10, modifiers: [{ name: 'Hot honey drizzle', price: 1 }, { name: 'Extra pepperoni', price: 2 }, { name: 'Stuffed crust', price: 2.5 }, { name: 'Jalapeños', price: 0.75 }, { name: 'Vegan cheese instead of mozzarella', price: 1.5 }], specialInstructions: 'Half with no jalapeños — label the boxes please', cartKey: 'b2' },
  { menuItem: items[2], quantity: 16, modifiers: [], specialInstructions: '', cartKey: 'b3' },
  { menuItem: items[3], quantity: 15, modifiers: [{ name: 'Extra marinara dip', price: 0.75 }], specialInstructions: '', cartKey: 'b4' },
  { menuItem: items[4], quantity: 24, modifiers: [], specialInstructions: '', cartKey: 'b5' },
  { menuItem: items[5], quantity: 30, modifiers: [], specialInstructions: '', cartKey: 'b6' },
]
const foodMajor = basket.reduce((s, b) => s + (b.menuItem.price + b.modifiers.reduce((a, m) => a + m.price, 0)) * b.quantity, 0)

// ── events: the service window, a midnight-spanning one, and a third for the chooser ──
const ev = (c, id, iso, start, end, status, venue = 'Riverside Park') => {
  const [y, m, d] = iso.split('-')
  return { id, date: `${d}/${m}/${y}`, date_iso: iso, date_friendly: '', start_time: start, end_time: end, venue_name: venue, village: c.village, postcode: c.postcode, notes: '', status, collection_interval_mins: 15 }
}
const events = c => ({
  window: ev(c, 'ev-1', '2026-09-30', '11:30', '22:45', 'open'),
  midnight: ev(c, 'ev-2', '2026-10-07', '20:00', '00:30', 'confirmed'),
  typical: ev(c, 'ev-4', '2026-10-02', '17:00', '21:00', 'confirmed'),
  third: ev(c, 'ev-3', '2026-10-03', '11:30', '22:45', 'confirmed', 'Pier 13 Waterfront Market'),
})
// Slots every 15 min from 12:00 to 22:45 (11:50 now) — the API's shape.
const slots = (() => {
  const out = []
  for (let m = 12 * 60; m <= 22 * 60 + 45; m += 15) out.push({ collection_time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, available: true, remaining: 6, is_past: false, too_soon: false, is_grace: false })
  return out
})()

module.exports = { REPO, C, countryRow, truckChargeFields, items, menu, basket, foodMajor, events, slots }
