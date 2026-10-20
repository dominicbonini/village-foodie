#!/usr/bin/env node
// scripts/audit-fixes.cjs — the four fixes from docs/phases-3-6-audit-report.md (D31, D32, D34, D38 option 1),
// docs/audit-fixes-report.md.
//
//   node scripts/audit-fixes.cjs                    compare against the committed BEFORE snapshot
//   node scripts/audit-fixes.cjs --capture <file>   snapshot the current code
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// The REAL modules and routes are bundled (scripts/_render-kit.cjs) and run on fixtures: the public menu route
// (/api/menu, Pizza Kitchen), the order arithmetic (calculateOrderTotal), the server's re-pricer
// (repriceOrder), the Manage route's update_event_deal (scripts/_fake-pg.cjs, real keys and writes) and the
// ticket renderer's bytes. BEFORE was captured on the unchanged code; AFTER, everything matches it except the
// three named differences, each checked on its own:
//   1. /api/menu no longer carries `codes`;
//   2. a fixed discount larger than the subtotal stores the subtotal as discount_amt (the total is unchanged);
//   3. tickets with accents, curly quotes, dashes or emoji print plain letters, not "?", and a line holding an
//      emoji keeps its price in the right-hand column.

const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'audit-fixes' })
const { REPO } = kit
const { makeFakePg } = require('./_fake-pg.cjs')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/audit-fixes-before.json'
const NOW = '2026-10-09T14:20:00.000Z'
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const ACCESS_HARNESS = { file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: "const access = { ok: true as const, role: 'owner' as const, userId: null, operatorId: null, via: 'harness' } as any" }

let M
async function mods() {
  if (M) return M
  M = {
    menu: await kit.bundle('menu', `export { GET } from '@/app/api/menu/[truckId]/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'`),
    calc: await kit.bundle('calc', `export * as C from '@/lib/order-calculations'\nexport * as R from '@/lib/order-repricing'`),
    ticket: await kit.bundle('ticket', `export * as T from '@/lib/printing/ticket'`),
    manage: await kit.bundle('manage', `export { POST } from '@/app/api/manage/route'`, { patches: [ACCESS_HARNESS] }),
  }
  return M
}

/* ── Pizza Kitchen, as the public menu reads it ── */
const GB = snake(SEEDS.gbFromSeed())
function menuDb() {
  return kit.fakeDb({
    trucks: [{ id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', active: true, paused: false, plan: 'pro', country: 'GB', currency: 'GBP', timezone: 'Europe/London',
      operator_id: 'op-test', mode: 'village', time_selection_enabled: true, show_on_vf: true, show_on_hg: true, contact_phone: '07700 900123' }],
    country_settings: [GB],
    menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas', sort_order: 1, active: true }],
    menu_items_db: [{ id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 9.5, category_id: 'c1', category: 'Pizzas', available: true, sort_order: 1 }],
    bundles_db: [], upsell_rules: [],
    discount_codes_db: [
      { id: 'd1', truck_id: 'test-truck', code: 'TENOFF', type: 'pct', value: 10, is_active: true },
      { id: 'd2', truck_id: 'test-truck', code: 'FIVER', type: 'fixed', value: 5, is_active: true },
    ],
    modifier_groups: [], modifier_options: [], item_modifier_groups: [], truck_events: [], event_deals: [], truck_vans: [],
    operators: [{ id: 'op-test', stripe_account_id: null, charges_enabled: false }],
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): /api/menu now asks the plan catalogue whether the
    // truck's plan allows each gated feature (truckCan / payAtHatchOn), so the fake db carries public.plans /
    // plan_prices / plan_features AS THE MIGRATIONS SEED THEM (fixture input only; never part of the recorded view).
    ...require('./_lp1c-fixtures.cjs').planTables(),
  })
}
async function menuView(path_ = 'test-kitchen', query = '') {
  await mods()
  globalThis.__harnessDb = menuDb(); M.menu.clearCountrySettingsCache()
  try {
    const res = await kit.quietAsync(() => M.menu.GET(new NextRequest(`http://127.0.0.1:3999/api/menu/${path_}${query}`), { params: Promise.resolve({ truckId: path_ }) }))
    return { status: res.status, body: await res.json() }
  } finally { delete globalThis.__harnessDb }
}

/* ── the arithmetic ── */
const ITEMS = [{ name: 'Margherita', quantity: 1, price: 9.5 }, { name: 'Garlic bread', quantity: 2, price: 3 }]
const SMALL = [{ name: 'Garlic bread', quantity: 1, price: 3 }]
const CODES = { none: null, pct10: { code: 'TENOFF', type: 'pct', value: 10 }, fixed2: { code: 'TWO', type: 'fixed', value: 2 },
  fixed5: { code: 'FIVER', type: 'fixed', value: 5 }, fixedExact: { code: 'THREE', type: 'fixed', value: 3 } }
function calcGrid() {
  const { C } = M.calc
  const out = {}
  for (const [basket, items] of [['normal', ITEMS], ['small', SMALL]]) for (const [k, code] of Object.entries(CODES)) {
    out[`${basket}|${k}`] = C.calculateOrderTotal(items, [], [], code)
  }
  return out
}
// The server's re-pricer — the code is resolved from the DATABASE row by the caller and handed in; the
// browser's figures are advisory and ignored.
const BOOK = { itemPrice: { Margherita: 9.5, 'Garlic bread': 3 }, optionPrice: {}, bundlePrice: {}, bundles: [] }
function repriceGrid() {
  const { R } = M.calc
  const out = {}
  const cheat = [{ name: 'Margherita', quantity: 1, unit_price: 0.01, modifiers: [] }, { name: 'Garlic bread', quantity: 2, unit_price: 0.01, modifiers: [] }]
  for (const [k, code] of Object.entries(CODES)) {
    try { out[k] = R.repriceOrder(cheat, [], BOOK, { items: [], deals: [] }, code).calculation } catch (e) { out[k] = 'ERROR ' + e.message }
  }
  return out
}

/* ── the ticket ── */
const UK_PLAIN = { id: '17', customer_name: 'Jamie', customer_phone: '07700 900123', collection_time: '18:45', buzzer_number: 12,
  items: [{ name: 'Sesame Prawn Toast', quantity: 1, unit_price: 6.5, modifiers: [{ name: 'extra chilli', price: 0.5 }] },
          { name: 'Chicken wings Thai style', quantity: 2, unit_price: 7, specialInstructions: 'no peanuts' },
          { name: 'Spring Rolls £ deal', quantity: 1, unit_price: 4.5, modifiers: [{ name: 'sweet chilli dip', price: 0 }] }],
  deals: [{ name: 'Two mains + drink', price: 18, slots: { main: 'Pad Thai', drink: 'Coke' }, slotModifiers: { main: [{ name: 'extra chilli', price: 0.5 }] }, slotNotes: { main: 'no peanuts - severe allergy' } }],
  notes: 'SEVERE PEANUT ALLERGY - please use a clean pan.\nAlso no coriander on anything. Thank you!',
  total: 42.5, truck_name: 'Pizza Kitchen', printedLabel: '18:37', showPaidStep: true, paymentStatus: 'unpaid', money: { currency: 'GBP', locale: 'en-GB' } }
const ACCENTS = { ...UK_PLAIN, customer_name: 'José Müller',
  items: [{ name: 'Jalapeños Poppers', quantity: 1, unit_price: 5, modifiers: [{ name: 'Extra jalapeños', price: 0.75 }] },
          { name: 'Crème brûlée', quantity: 2, unit_price: 4.25, specialInstructions: '“No sugar” — thanks…' },
          { name: 'Smørrebrød & Æble Œuf Straße', quantity: 1, unit_price: 6 }],
  deals: null, notes: 'Café olé – please!' }
const EMOJI = { ...UK_PLAIN, items: [{ name: '🌶 Hot wings', quantity: 1, unit_price: 7 }, { name: 'Pizza 🍕🍕', quantity: 1, unit_price: 9.5 }, { name: 'Plain chips', quantity: 1, unit_price: 3 }], deals: null, notes: null }
const EURO = { ...UK_PLAIN, money: { currency: 'EUR', locale: 'en-IE' }, items: UK_PLAIN.items.slice(0, 1), deals: null, notes: null, total: 7 }
const TICKETS = { ukPlain: UK_PLAIN, accents: ACCENTS, emoji: EMOJI, euro: EURO }
function ticketView() {
  const { T } = M.ticket
  const out = {}
  for (const [k, o] of Object.entries(TICKETS)) for (const w of [58, 80]) {
    const cfg = { paper_width: w, show_phone: true }
    out[`${k}|${w}`] = { bytes: Array.from(T.renderTicket(o, cfg)), lines: T.buildTicketLines(o, cfg).map(l => l.text ?? (l.divider ? '----' : '')) }
  }
  out.printable = ['Jalapeños', 'José', 'Crème brûlée', '£12.50', 'plain ASCII'].map(s => T.printableText(s))
  return out
}

/* ── update_event_deal ── */
const EVENT_KEYS = { event_deals: [['event_id', 'bundle_id']] }
function dealDb() {
  return makeFakePg({
    trucks: [{ id: 'test-truck', dashboard_token: 'tok-test', operator_id: 'op-test', name: 'Pizza Kitchen', plan: 'pro', country: 'GB' },
             { id: 'other-truck', dashboard_token: 'tok-other', operator_id: 'op-other', name: 'Another Truck', plan: 'pro', country: 'GB' }],
    truck_events: [{ id: 'ev-own', truck_id: 'test-truck', event_date: '2026-10-12' }, { id: 'ev-other', truck_id: 'other-truck', event_date: '2026-10-12' }],
    bundles_db: [{ id: 'b-own', truck_id: 'test-truck', name: 'Meal deal' }],
    event_deals: [],
  }, { keys: EVENT_KEYS })
}
async function dealView(eventId) {
  await mods()
  const pg = dealDb(); globalThis.__harnessDb = pg
  try {
    const res = await kit.quietAsync(() => M.manage.POST(new NextRequest('http://127.0.0.1:3999/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'tok-test', action: 'update_event_deal', eventId, bundleId: 'b-own', active: false }) })))
    return { status: res.status, body: await res.json(), rows: pg.tables.event_deals, writes: pg.writes }
  } finally { delete globalThis.__harnessDb }
}

async function views() {
  await mods()
  kit.setNow(NOW); kit.setDeviceTz('UTC')
  return {
    menu: await menuView(),
    menuDashboard: await menuView('test-truck', '?dashboard=1'),
    calc: calcGrid(),
    reprice: repriceGrid(),
    ticket: ticketView(),
    dealOwn: await dealView('ev-own'),
  }
}

module.exports = { views, mods, menuView, dealView, calcGrid, repriceGrid, ticketView, TICKETS, CODES, BEFORE_FILE }

/* ─────────────────────────── COMPARE ─────────────────────────── */
let failures = 0, checks = 0
const ok = (cond, label, detail) => { checks++; if (cond) return; failures++; console.log(`  ✗ ${label}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500)}` : ''}`) }
const J = x => JSON.stringify(x)
const without = (o, key) => { const c = JSON.parse(J(o)); if (c?.body?.menu) delete c.body.menu[key]; return c }

async function compare() {
  const B = JSON.parse(read(BEFORE_FILE))
  const A = await views()

  console.log('1. D31 — the public menu carries no discount code')
  ok(B.menu.body.menu.codes?.length === 2, 'BEFORE: the public menu sent both active codes, values included (the leak)', B.menu.body.menu.codes)
  for (const [k, label] of [['menu', 'customer menu (/api/menu/test-kitchen)'], ['menuDashboard', 'dashboard read (/api/menu/test-truck?dashboard=1)']]) {
    ok(!('codes' in A[k].body.menu), `${label}: no "codes" field`)
    ok(!/TENOFF|FIVER/.test(J(A[k].body)), `${label}: no code string anywhere in the response`)
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the menu payload's truck gained `preordering_on`
    // (canAccess('advance_preordering', feature_overrides) — the order page now refuses on it instead of
    // hasFeature(plan)). Pizza Kitchen has no override, so it is `true`; checked here, then dropped (with its key
    // position) before the byte-compare. Everything else, `plan` included, is still byte-identical to BEFORE.
    ok(A[k].body.truck.preordering_on === true, `${label}: truck.preordering_on is true (no override → allowed; Stage A addition)`, A[k].body.truck.preordering_on)
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the truck also gained `pay_at_hatch_on`
    // (payAtHatchOn — the plan's pay_at_hatch_allowed folded into the online_ordering_pay_at_hatch switch, enforced now).
    // Pizza Kitchen is on pro (pay_at_hatch_allowed true, no plan_features row, no override) → `true`; checked, then
    // dropped with preordering_on. ordering_available is NOT dropped — it must still be byte-identical.
    ok(A[k].body.truck.pay_at_hatch_on === true, `${label}: truck.pay_at_hatch_on is true (pro allows Pay at Hatch; Stage A2 addition)`, A[k].body.truck.pay_at_hatch_on)
    const aNoPre = JSON.parse(J(A[k])); delete aNoPre.body.truck.preordering_on; delete aNoPre.body.truck.pay_at_hatch_on
    ok(J(aNoPre) === J(without(B[k], 'codes')), `${label}: otherwise byte-identical to BEFORE (named difference 1)`)
  }
  const page = read('app/trucks/[slug]/order/page.tsx'), menuSrc = read('app/api/menu/[truckId]/route.ts')
  ok(!/menu\.codes/.test(page) && !/applyCode/.test(page) && !/codes: DiscountCode\[\]/.test(page), 'the order page no longer reads menu.codes (its unused code check is gone)')
  ok(!/from\('discount_codes_db'\)/.test(menuSrc), '/api/menu no longer reads discount_codes_db at all')
  const sub = read('app/api/orders/submit/route.ts')
  ok(/\.from\('discount_codes_db'\)\s*\n\s*\.select\('\*'\)\s*\n\s*\.eq\('truck_id', resolvedTruckId\)\s*\n\s*\.eq\('code', discountCode\.toUpperCase\(\)\)\s*\n\s*\.eq\('is_active', true\)/.test(sub)
    && /repriceOrder\([\s\S]{0,400}discountCodeData/.test(sub), 'submit: the code is looked up by the SERVER in discount_codes_db (this truck, active only) and that row is what prices the order')
  ok(!/body\.(discountAmt|subtotal|total)\b[^=]*[^=]=[^=]/.test(sub.replace(/\/\/.*$/gm, '')), "submit: the browser's subtotal / discount / total are never used to price")
  const mg = read('app/api/manage/route.ts')
  // ⚠️ RE-PINNED (Language Phase 1d Part 2): the GET's refusal now carries a code (SHELL: "GET refusals gain
  // code/params") — `{ error: access.error }` became `manageErrorBody(<truck's locale>, access.code)`, still returned
  // with access.status. The pin follows the refusal to its new shape and is now also POSITIONAL: the refusal sits
  // between the access check and the code-list read (the first `resolveTruckAccess` in the file is the GET's).
  {
    const accessAt = mg.indexOf('const access = await resolveTruckAccess(req, truck)')
    const codesAt = mg.indexOf("supabase.from('discount_codes_db').select('*').eq('truck_id', truck.id)")
    const refusal = /if \(!access\.ok\) return NextResponse\.json\(manageErrorBody\(await localeForTruck\(truck\), access\.code\), \{ status: access\.status \}\)/.exec(mg.slice(accessAt))
    ok(accessAt > 0 && codesAt > accessAt && refusal && accessAt + refusal.index < codesAt && mg.indexOf('export async function GET(') < accessAt,
      "the operator's own code list (Manage GET) is read only after the signed-in access check")
  }

  console.log('2. D34 — a fixed discount is capped at the subtotal')
  for (const k of Object.keys(B.calc)) {
    if (k === 'small|fixed5') continue
    ok(J(A.calc[k]) === J(B.calc[k]), `calculateOrderTotal ${k}: identical`, { before: B.calc[k], after: A.calc[k] })
  }
  const f5b = B.calc['small|fixed5'], f5a = A.calc['small|fixed5']
  ok(f5b.discountAmt === 5 && f5b.total === 0, 'BEFORE: a £5 code on a £3 order stored discount_amt £5 against a total of £0', f5b)
  ok(f5a.discountAmt === 3 && f5a.total === 0 && f5a.subtotal === 3, 'AFTER: discount_amt £3, total £0 (named difference 2)', f5a)
  ok(J({ ...f5a, discountAmt: 5 }) === J(f5b), '…and nothing else on that order moved')
  ok(J(A.reprice) === J(B.reprice), "repriceOrder: identical for every code — the server prices from its own book, ignoring the browser's 1p lines", { before: B.reprice, after: A.reprice })
  const { R } = M.calc
  const small = R.repriceOrder([{ name: 'Garlic bread', quantity: 1, unit_price: 99 }], [], { itemPrice: { 'Garlic bread': 3 }, optionPrice: {}, bundlePrice: {}, bundles: [] }, { items: [], deals: [] }, CODES.fixed5).calculation
  ok(small.discountAmt === 3 && small.total === 0, 'repriceOrder: a £5 code on a £3 order also stores £3 (the cap lives in the one engine every path uses)', small)
  ok(R.repriceOrder([{ name: 'Garlic bread', quantity: 1, unit_price: 3 }], [], { itemPrice: { 'Garlic bread': 3 }, optionPrice: {}, bundlePrice: {}, bundles: [] }, { items: [], deals: [] }, null).calculation.discountAmt === 0,
    'an unknown or inactive code (the server finds no active row, so it passes null) takes nothing off')

  console.log('3. D32 — update_event_deal only touches this truck\'s events')
  ok(J(A.dealOwn) === J(B.dealOwn), "own event: the same answer and the same row as BEFORE", { before: B.dealOwn, after: A.dealOwn })
  const other = await dealView('ev-other')
  ok(other.status === 404 && other.body.error === 'Event not found' && other.rows.length === 0 && other.writes.length === 0, "another truck's event id: 404 \"Event not found\", nothing written", other)
  const missing = await dealView('no-such-event')
  ok(missing.status === 404 && missing.writes.length === 0, 'an unknown event id: the same refusal, nothing written')

  console.log('4. D38 — printed accents fold to plain letters; UK bytes unchanged')
  for (const w of [58, 80]) for (const k of ['ukPlain', 'euro']) {
    ok(J(A.ticket[`${k}|${w}`].bytes) === J(B.ticket[`${k}|${w}`].bytes), `${k} ticket at ${w}mm: BYTE-IDENTICAL to BEFORE`)
  }
  ok(J(A.ticket.printable) === J(['Jalapenos', 'Jose', 'Creme brulee', '£12.50', 'plain ASCII']), 'printableText: "Jalapeños"→"Jalapenos", "José"→"Jose", "Crème brûlée"→"Creme brulee"; "£" and ASCII untouched', A.ticket.printable)
  ok(J(B.ticket.printable).includes('Jalape?os'), 'BEFORE: "Jalape?os"')
  const acc = A.ticket['accents|80'].lines.join('\n')
  for (const want of ['Jose Muller', '1x Jalapenos Poppers', '+ Extra jalapenos', '2x Creme brulee', '"No sugar" - thanks...', 'Smorrebrod & AEble OEuf Strasse', 'Cafe ole - please!']) ok(acc.includes(want), `accented ticket prints "${want}" (named difference 3)`, acc)
  ok(!/\?/.test(acc), 'accented ticket: no "?" anywhere')
  const accBytes = A.ticket['accents|80'].bytes
  ok(accBytes.every(b => b < 0x80 || b === 0xA3), 'accented ticket bytes: plain ASCII plus 0xA3 (£) only')
  ok(J(accBytes.slice(0, 3)) === J([0x1B, 0x40, 0x1B]) && accBytes[3] === 0x74 && accBytes[4] === 0x10, 'ESC @ then ESC t 16 — the code page command is exactly as before')
  for (const w of [58, 80]) {
    const cols = w === 58 ? 32 : 48
    const lines = A.ticket[`emoji|${w}`].lines.filter(l => /^1x /.test(l))
    ok(lines.length === 3 && lines.every(l => l.length === cols && /£\d+\.\d\d$/.test(l)), `emoji ticket at ${w}mm: every item line is exactly ${cols} columns, its price in the right-hand column`, lines)
    ok(lines[0].startsWith('1x ? Hot wings') && lines[1].startsWith('1x Pizza ??'), `emoji ticket at ${w}mm: an emoji prints as one "?" each`, lines)
    const bLines = B.ticket[`emoji|${w}`].lines.filter(l => /^1x /.test(l))
    // BEFORE measured UTF-16 units (an emoji counts 2) but printed one "?" per code point — so on paper the line
    // was short and the price sat a column left of the edge. Counted as printed: code points.
    ok(bLines.filter(l => [...l].length !== cols).length === 2, `BEFORE at ${w}mm: the two emoji lines printed short on paper (the shifted price)`, bLines.map(l => [...l].length))
  }
  const enc = M.ticket.T.renderTicket(TICKETS.emoji, { paper_width: 58 })
  const text = Array.from(enc).map(b => (b === 0xA3 ? '£' : String.fromCharCode(b))).join('')
  ok(/1x \? Hot wings {13}£7\.00\n/.test(text), 'emoji ticket BYTES: the price sits at the end of the 32-column line on paper too')
  const prev = read('components/printing/TicketPreview.tsx')
  ok(/printableText\(l\.text \?\? ''\)/.test(prev) && /folded to plain letters/.test(prev), 'the on-screen preview still goes through printableText, and its comment says what it now does')

  console.log(`\n${failures ? '🔴' : '✅'} audit-fixes: ${checks - failures}/${checks} checks passed`)
  if (failures) process.exit(1)
}
if (require.main === module && !CAPTURE) {
  ;(async () => { await compare() })().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
}

if (require.main === module && CAPTURE) {
  ;(async () => {
    const v = await views()
    fs.writeFileSync(path.resolve(CAPTURE), JSON.stringify(v, null, 1))
    console.log(`captured ${Object.keys(v).join(', ')} → ${CAPTURE}`)
  })().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
}
