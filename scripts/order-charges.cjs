#!/usr/bin/env node
// scripts/order-charges.cjs — Phase 3 foundations: tax, tips and fees in the engine and the database
// (docs/phase-3-foundations-report.md).
//
//   node scripts/order-charges.cjs                    compare against the committed BEFORE snapshot
//   node scripts/order-charges.cjs --capture <file>   snapshot the current code's GB order paths
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// The REAL routes run end to end on fixtures (Pizza Kitchen ids, a GB truck), on an in-memory database that
// stores rows and records every write (scripts/_fake-pg.cjs):
//   • POST /api/orders/submit, pay at the truck and by card (the card authorise is a recorder);
//   • promoteDraft, on the draft the card submit just wrote;
//   • POST /api/dashboard/action: the walk-up (`manual`), `edit`, `collected` and `mark_paid_cash`.
// Captured: the response, every RPC call with its arguments, every write with its payload, every email
// (subject, html, text), every push and every authorise amount. BEFORE was captured on the checkpoint commit
// (3033a53) before any Phase 3 edit. AFTER, every one of them is byte-identical except the ONE named
// difference: the order rows (orders, order_drafts, and the RPC's p_order) carry the new snapshot columns,
// and on a GB order the ONLY non-null ones are food_minor (= total_minor), tax_inclusive (true),
// tax_label ('VAT') and card_fee_payer ('truck'). The pay-at-truck RPC is place_order_atomic_v2.
// The US checks (engine, resolver and the same routes on a US fixture) run on the AFTER code only.

// ── RE-PINNED FOR LANGUAGE PHASE 2 (docs/language-phase-2-report.md) ─────────────────────────────────────────
// This harness's BEFORE snapshot was rendered with the words as they stood before Language Phase 2, and what it proves
// is the CODE's behaviour, not the wording. Phase 2 changes words on purpose (US English in messages/en-US.json, the
// wrong-English fixes in messages/en-GB.json) — proven by scripts/language-phase-2.cjs — so this run renders with the
// pre-Phase-2 words (HG_MESSAGES_FROZEN, scripts/_lp2-frozen.cjs: the current keys at their 460ba55 text) and keeps
// asserting exactly what it asserted. A capture reads the catalogue as it is.
if (!process.argv.includes('--capture') && !('HG_MESSAGES_FROZEN' in process.env)) process.env.HG_MESSAGES_FROZEN = 'scripts/fixtures/language-phase-2-messages-before.json'
const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'order-charges' })
const { REPO } = kit
const { makeFakePg } = require('./_fake-pg.cjs')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/order-charges-before.json'
const NOW = '2026-10-09T11:00:00.000Z'
const SEEDS = require('./_country-settings-gb.cjs')
const LFU = require('./_legal-followups-named.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const AFTER_CODE = fs.existsSync(path.join(REPO, 'lib/order-charges.ts'))

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

/* ── the recorders: email send, push, card authorise and capture ── */
const EMAIL_PATCH = { file: 'lib/email.ts', from: 'export async function sendConfirmationEmail(params: {', to: 'export async function sendConfirmationEmail(params: any) { ((globalThis as any).__rec.emails).push(params); return true }\nasync function __realSendConfirmationEmail(params: {' }
const STUBS = {
  '@/lib/apns': 'export async function sendOrderPendingPush(p) { globalThis.__rec.push.push(["apns", p]) }\nexport function normaliseApnsKey(k) { return k }',
  '@/lib/fcm': 'export async function sendOrderPendingPush(p) { globalThis.__rec.push.push(["fcm", p]) }',
  '@/lib/payments/authorize': `export async function authorizeDraft(s, a) { globalThis.__rec.auth.push(a); return { ok: true, clientSecret: 'cs_harness', stripeAccount: 'acct_harness' } }
export async function cancelAuthorization(a) { globalThis.__rec.auth.push({ cancel: a }); return { ok: true } }
export async function stripeAccountForTruck() { return 'acct_harness' }`,
  '@/lib/payments/capture': 'export async function captureOnConfirmation(s, a) { globalThis.__rec.capture.push(a); return { ok: true, outcome: "nothing_to_capture" } }',
}

let M
async function mods() {
  if (M) return M
  M = {
    submit: await kit.bundle('submit', "export { POST } from '@/app/api/orders/submit/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: STUBS, patches: [EMAIL_PATCH] }),
    promote: await kit.bundle('promote', "export { promoteDraft } from '@/lib/payments/promote-draft'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: STUBS, patches: [EMAIL_PATCH] }),
    action: await kit.bundle('action', "export { POST } from '@/app/api/dashboard/action/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: STUBS, patches: [EMAIL_PATCH] }),
  }
  if (AFTER_CODE) {
    M.engine = await kit.bundle('engine', "export * as E from '@/lib/order-charges'\nexport * as R from '@/lib/order-charge-rules'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'")
  }
  return M
}

/* ── Pizza Kitchen (GB) ── */
const GB = snake(SEEDS.gbFromSeed())
const TRUCK_GB = {
  id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', active: true, plan: 'pro', country: 'GB', currency: 'GBP',
  timezone: 'Europe/London', auto_accept: true, operator_id: 'op-test', time_selection_enabled: true,
  contact_email: 'kitchen@example.test', dashboard_token: 'tok-test', dashboard_pin: null, takes_cash: true,
}
function tables(over = {}) {
  return {
    trucks: [{ ...TRUCK_GB, ...(over.truck || {}) }],
    country_settings: over.country_settings || [GB],
    menu_items_db: [
      { id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 9.5, category_id: 'c1', category: 'Pizzas', available: true, is_active: true },
      { id: 'i2', truck_id: 'test-truck', name: 'Pepperoni', price: 10.75, category_id: 'c1', category: 'Pizzas', available: true, is_active: true },
      { id: 'i3', truck_id: 'test-truck', name: 'Lemonade', price: 2.4, category_id: 'c2', category: 'Drinks', available: true, is_active: true },
    ],
    menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas' }, { id: 'c2', truck_id: 'test-truck', name: 'Drinks' }],
    modifier_groups: [{ id: 'g1', truck_id: 'test-truck', name: 'Extras', is_required: false, min_choices: 0, max_choices: 99 }],
    // Embedded reads (`modifier_groups!inner(truck_id)` filtered on `modifier_groups.truck_id`) are answered
    // by putting the embedded object and its dotted filter key on the fixture row (scripts/_fake-pg.cjs).
    modifier_options: [{ id: 'o1', group_id: 'g1', name: 'Extra cheese', price_adjustment: 1.2, available: true,
      modifier_groups: { truck_id: 'test-truck' }, 'modifier_groups.truck_id': 'test-truck' }],
    item_modifier_groups: [{ menu_item_id: 'i1', group_id: 'g1', excluded_option_ids: [],
      menu_items_db: { name: 'Margherita', truck_id: 'test-truck' }, 'menu_items_db.truck_id': 'test-truck' }],
    bundles_db: [{ id: 'b1', truck_id: 'test-truck', name: 'Meal Deal', bundle_price: 11, original_price: 12.9, active: true }],
    truck_events: [{ id: 'ev1', truck_id: 'test-truck', event_date: '2026-10-09', status: 'confirmed', start_time: '11:00', end_time: '20:00',
      venue_name: 'The Green', town: 'Testville', postcode: 'AB1 2CD', van_id: null, ...(over.event || {}) }],
    discount_codes_db: [{ id: 'd1', truck_id: 'test-truck', code: 'TENOFF', type: 'pct', value: 10, is_active: true }],
    orders: (over.orders || []).map(o => ({ ...o })),
    order_drafts: [], order_payments: [], booking_locks: [],
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): submit asks the plan catalogue whether the truck's
    // plan allows Pay at Hatch / auto-accept (truckCan, decideAutoAccept's new `planAllows`), and promote-draft reads it
    // through the client it is given (readPlanCatalog(supabase)) — so the fake database carries public.plans /
    // plan_prices / plan_features AS THE MIGRATIONS SEED THEM. Fixture input only: no write, rpc or email touches them.
    ...require('./_lp1c-fixtures.cjs').planTables(),
  }
}

/* ── one run of a route on a fresh database, everything recorded ── */
async function run(fn, seed) {
  const db = makeFakePg(seed, { keys: {
    orders: [['order_key'], ['event_id', 'id']],
    order_drafts: [['order_key']],
    production_slot_usage: [['truck_id', 'event_id', 'production_slot']],
  }, defaults: {
    // orders_fill_currency_country (20261010_07) fills these from the truck on insert.
    orders: { currency: 'GBP', country: 'GB' },
  } })
  const rpcs = []
  let counter = 40
  const rpc = async (name, args) => {
    rpcs.push({ fn: name, args })
    if (/^place_order_atomic/.test(name)) {
      const key = 'ok-hatch-1'
      db.tables.orders.push({ order_key: key, id: '41', truck_id: args.p_truck_id, ...args.p_order, slot: args.p_final_slot, status: args.p_status, event_id: args.p_event_id, event_date: args.p_event_date })
      return { data: { order_key: key, order_number: 41, slot: args.p_final_slot }, error: null }
    }
    if (/increment_(event_)?order_counter/.test(name)) return { data: ++counter, error: null }
    return { data: null, error: null }
  }
  globalThis.__harnessDb = { ...db, rpc }
  globalThis.__rec = { emails: [], push: [], auth: [], capture: [] }
  let uuid = 0
  const realUUID = crypto.randomUUID
  crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`
  try {
    const m = await mods()
    for (const k of ['submit', 'promote', 'action', 'engine']) m[k]?.clearCountrySettingsCache?.()
    const out = await kit.quietAsync(() => fn(m, db))
    return {
      out,
      rpcs: JSON.parse(JSON.stringify(rpcs)),
      writes: JSON.parse(JSON.stringify(db.writes.filter(w => w.table !== 'booking_locks'))),
      emails: globalThis.__rec.emails.map(e => ({ to: e.to, subject: e.subject, html: e.html, text: e.text, senderName: e.senderName ?? null, truckName: e.truckName ?? null })),
      push: JSON.parse(JSON.stringify(globalThis.__rec.push)),
      auth: JSON.parse(JSON.stringify(globalThis.__rec.auth)),
      capture: JSON.parse(JSON.stringify(globalThis.__rec.capture)),
      db,
    }
  } finally { crypto.randomUUID = realUUID; delete globalThis.__harnessDb }
}
const post = (url, body) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
async function json(res) { return { status: res.status, body: await res.json() } }

const CUSTOMER = { customerName: 'Ann Example', customerEmail: 'ann@example.test', customerPhone: '07700900000' }
const BASKET = {
  items: [
    { name: 'Margherita', quantity: 2, unit_price: 9.5, modifiers: [{ name: 'Extra cheese', price: 1.2 }] },
    { name: 'Lemonade', quantity: 1, unit_price: 2.4, modifiers: [] },
  ],
  deals: [],
}
const SUBMIT = (extra = {}) => ({ truckId: 'test-kitchen', ...CUSTOMER, slot: '12:00', eventDate: '2026-10-09', eventId: 'ev1', ...BASKET, ...extra })
const OLD_ORDER = {
  order_key: 'ok-old-1', id: '12', truck_id: 'test-truck', customer_name: 'Bob Example', customer_email: 'bob@example.test', customer_phone: null,
  slot: '12:30', order_type: 'collection', event_date: '2026-10-09', event_id: 'ev1', van_id: null,
  items: [{ name: 'Pepperoni', quantity: 1, unit_price: 10.75, modifiers: [] }], deals: [], discount_code: null,
  subtotal: 10.75, discount_amt: 0, total: 10.75, total_minor: 1075, currency: 'GBP', country: 'GB',
  notes: null, status: 'confirmed', payment_status: 'unpaid', amount_paid: 0,
}

/* ── the GB scenarios: identical code paths BEFORE and AFTER ── */
const GB_SCENARIOS = {
  async submit_hatch() {
    return run(async m => json(await m.submit.POST(post('/api/orders/submit', SUBMIT()))), tables())
  },
  async submit_hatch_code() {
    return run(async m => json(await m.submit.POST(post('/api/orders/submit', SUBMIT({ discountCode: 'tenoff', notes: 'No basil please', deals: [{ name: 'Meal Deal', quantity: 1, price: 11, slots: { Pizza: 'Pepperoni', Drink: 'Lemonade' } }] })))), tables())
  },
  async submit_card_then_promote() {
    return run(async (m, db) => {
      const r1 = await json(await m.submit.POST(post('/api/orders/submit', SUBMIT({ payByCard: true }))))
      const draft = db.tables.order_drafts[0]
      if (draft) draft.payment_intent_id = 'pi_harness'
      const r2 = draft ? await m.promote.promoteDraft(globalThis.__harnessDb, draft.order_key, 'webhook') : null
      return { submit: r1, promote: r2 }
    }, tables())
  },
  async walkup() {
    return run(async m => json(await m.action.POST(post('/api/dashboard/action', {
      token: 'tok-test', action: 'manual',
      manualOrder: { customerName: 'Walk-up', slot: '13:00', event_date: '2026-10-09', event_id: 'ev1', order_key: 'ok-walk-1', provisional_id: '77',
        items: [{ name: 'Pepperoni', quantity: 2, unit_price: 10.75, modifiers: [] }, { name: 'Lemonade', quantity: 1, unit_price: 2.4, price_override: 2 }] },
    }))), tables())
  },
  async walkup_paid() {
    return run(async m => json(await m.action.POST(post('/api/dashboard/action', {
      token: 'tok-test', action: 'manual',
      manualOrder: { customerName: 'Walk-up', slot: '13:00', event_date: '2026-10-09', event_id: 'ev1', order_key: 'ok-walk-2', provisional_id: '78',
        paymentTaken: true, paymentMethod: 'cash', items: [{ name: 'Margherita', quantity: 1, unit_price: 9.5, modifiers: [] }] },
    }))), tables())
  },
  async edit() {
    return run(async m => json(await m.action.POST(post('/api/dashboard/action', {
      token: 'tok-test', action: 'edit', order_key: 'ok-old-1',
      editedOrder: { items: [{ name: 'Pepperoni', quantity: 1, unit_price: 10.75, modifiers: [] }, { name: 'Lemonade', quantity: 2, unit_price: 2.4, modifiers: [] }] },
    }))), tables({ orders: [OLD_ORDER] }))
  },
  async collected() {
    return run(async m => json(await m.action.POST(post('/api/dashboard/action', { token: 'tok-test', action: 'collected', order_key: 'ok-old-1' }))), tables({ orders: [OLD_ORDER] }))
  },
  async mark_paid_cash() {
    return run(async m => json(await m.action.POST(post('/api/dashboard/action', { token: 'tok-test', action: 'mark_paid_cash', order_key: 'ok-old-1' }))), tables({ orders: [OLD_ORDER] }))
  },
}

const keep = r => { const { db, ...rest } = r; return rest }

/* ── the named difference ── */
const NEW_ORDER_COLS = ['food_minor', 'tax_minor', 'tax_rate_milli', 'tax_inclusive', 'tax_label', 'tip_minor', 'tip_pct_bps',
  'service_fee_minor', 'service_fee_recipient', 'card_surcharge_minor', 'card_funding', 'card_fee_payer', 'application_fee_minor']
const GB_NON_NULL = { tax_inclusive: true, tax_label: 'VAT', card_fee_payer: 'truck' }   // + food_minor = total_minor
const GB_ZERO = ['tax_minor', 'tip_minor', 'service_fee_minor', 'card_surcharge_minor']
const GB_NULL = ['tax_rate_milli', 'tip_pct_bps', 'service_fee_recipient', 'card_funding', 'application_fee_minor']

/** Check one GB order row's snapshot, and return the row without it. */
function gbSnapshot(where, row, totalMinor) {
  const present = NEW_ORDER_COLS.filter(c => c in row)
  t(`${where}: carries all ${NEW_ORDER_COLS.length} snapshot columns`, present.length === NEW_ORDER_COLS.length, `has ${present.join(',')}`)
  t(`${where}: food_minor = total_minor (${totalMinor})`, row.food_minor === totalMinor, `food_minor=${row.food_minor}`)
  for (const [k, v] of Object.entries(GB_NON_NULL)) t(`${where}: ${k} = ${JSON.stringify(v)}`, row[k] === v, `got ${JSON.stringify(row[k])}`)
  for (const k of GB_ZERO) t(`${where}: ${k} = 0`, row[k] === 0, `got ${JSON.stringify(row[k])}`)
  for (const k of GB_NULL) t(`${where}: ${k} is null`, row[k] === null, `got ${JSON.stringify(row[k])}`)
  const nonNull = NEW_ORDER_COLS.filter(c => row[c] !== null && row[c] !== 0)
  t(`${where}: the ONLY non-null new values are the four named`, JSON.stringify(nonNull) === JSON.stringify(['food_minor', 'tax_inclusive', 'tax_label', 'card_fee_payer']), nonNull.join(','))
  const rest = { ...row }
  for (const c of NEW_ORDER_COLS) delete rest[c]
  return rest
}
const minorOf = row => (row.total_minor != null ? row.total_minor : Math.round(Number(row.total) * 100))

/** Strip the named difference from an AFTER capture, checking each instance on the way. */
function stripNamed(name, r) {
  const c = JSON.parse(JSON.stringify(r))
  for (const call of c.rpcs) {
    if (call.fn === 'place_order_atomic_v2') {
      call.fn = 'place_order_atomic'
      const p = call.args.p_order
      t(`${name}: v2 is passed total_minor = round(total × 100)`, p.total_minor === Math.round(p.total * 100), `${p.total_minor} vs ${p.total}`)
      call.args.p_order = gbSnapshot(`${name} p_order`, p, p.total_minor)
      delete call.args.p_order.total_minor
    } else t(`${name}: no call to the OLD place_order_atomic`, call.fn !== 'place_order_atomic')
  }
  for (const w of c.writes) {
    if (!['orders', 'order_drafts'].includes(w.table)) continue
    const payload = w.row || w.patch
    if (!payload || !NEW_ORDER_COLS.some(k => k in payload)) continue
    const stripped = gbSnapshot(`${name} ${w.table} ${w.op}`, payload, minorOf(payload))
    if (w.row) w.row = stripped; else w.patch = stripped
  }
  return c
}
/** The draft's snapshot is copied to the order on promotion: the order's own columns, never re-derived. */

function diffJson(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = diffJson(a[k], b[k], `${p}.${k}`); if (d) return d }
  }
  return `${p}: BEFORE ${JSON.stringify(a)?.slice(0, 160)} · AFTER ${JSON.stringify(b)?.slice(0, 160)}`
}

async function main() {
  kit.setNow(NOW)
  const got = {}
  for (const [name, fn] of Object.entries(GB_SCENARIOS)) got[name] = keep(await fn())

  if (CAPTURE) {
    fs.writeFileSync(path.resolve(REPO, CAPTURE), JSON.stringify({ captured_on: 'checkpoint 3033a53', now: NOW, scenarios: got }, null, 1) + '\n')
    console.log(`captured ${Object.keys(got).length} GB scenarios → ${CAPTURE}`)
    for (const [n, r] of Object.entries(got)) console.log(`  ${n}: ${JSON.stringify(r.out).slice(0, 140)} · rpcs ${r.rpcs.length} · writes ${r.writes.length} · emails ${r.emails.length}`)
    return
  }

  head('1 · GB: every order path writes what it wrote BEFORE, plus the snapshot (named difference 1)')
  const before = JSON.parse(read(BEFORE_FILE)).scenarios
  for (const [name, b] of Object.entries(before)) {
    const a = stripNamed(name, got[name])
    for (const part of ['out', 'rpcs', 'writes', 'emails', 'push', 'auth', 'capture']) {
      // ⚠️ RE-PINNED (legal follow-ups, 19 October 2026, docs/legal-follow-ups-report.md): the customer emails gain the
      // named change legal-followups-privacy-link (the " · Privacy" footer link) — scripts/_legal-followups-named.cjs.
      const bp = part === 'emails' && b[part] ? JSON.parse(JSON.stringify(b[part], (_, v) => LFU.emailPrivacy(v))) : b[part]
      const d = diffJson(bp, a[part])
      t(`${name}: ${part} byte-identical to BEFORE apart from the named difference`, d === null, d)
    }
  }
  await (AFTER_CODE ? require('./_order-charges-us.cjs')({ kit, mods, run, tables, post, json, t, head, GB, SUBMIT, CUSTOMER, OLD_ORDER, BASKET, read }) : null)

  console.log(`\n${fail ? '✗' : '✓'} order-charges: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
