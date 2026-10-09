#!/usr/bin/env node
// scripts/event-pricing.cjs
//
//   node scripts/event-pricing.cjs      (NO NETWORK, NO DATABASE, NO BROWSER, NO LIVE TRUCK)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Event pricing decides WHAT A CUSTOMER IS CHARGED. Four things can go wrong and every one of them is
// money:
//
//   1. A TRUCK WHO HAS NEVER USED THIS IS CHARGED SOMETHING DIFFERENT. Section 2 proves the
//      event-aware price book is the SAME OBJECT `loadPriceBook` returns for such a truck, and
//      section 6 proves the menu API's price leg is byte-identical to a NAMED commit except for three
//      accounted-for lines.
//   2. THE ARITHMETIC IS OUT BY A PENNY. Every price in this product is stored as `numeric` POUNDS,
//      and `1.15 * 100` is `114.99999999999999` in a double. Section 1 is the brief's table, exactly,
//      plus the float traps.
//   3. A SCREEN PROMISES ONE PRICE AND THE SERVER CHARGES ANOTHER. There is ONE implementation
//      (`lib/event-pricing/price.ts`) and section 5 asserts nothing else computes a price.
//   4. THE SERVER TRUSTS THE CLIENT, or guesses which event an order belongs to. Section 4.
//
// ⛔ WHAT THIS CANNOT DO, STATED RATHER THAN IMPLIED: it cannot run the end-to-end test on
// `test-truck`. That needs 20261011_event_pricing.sql APPLIED, and nothing in this repository runs
// SQL. Until Dominic applies it, every read in `lib/event-pricing/read.ts` fails open to MENU PRICES —
// which section 3 proves is exactly today's behaviour. The end-to-end is the numbered localhost list
// in docs/event-pricing-report.md, and it is blocked on the migration, not on this harness.

const fs = require('fs')
const path = require('path')
const { compile } = require('./_slot-interval-compile.cjs')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')

/* ══ 🔴 THE PRE-BUILD TREE, PINNED BY SHA ═══════════════════════════════════════════════════════
 * `0ce4c83` is this branch's tip BEFORE event pricing — "Record the combine: the report, and three
 * open items closed". Recorded in docs/event-pricing-report.md too, so the two cannot drift.
 *
 * 🔴 IT IS A SHA, NEVER `HEAD` AND NEVER A BRANCH NAME. `HEAD` means "whatever was last committed",
 * so the baseline moves with the next commit and the comparison quietly becomes a comparison of a
 * tree with ITSELF — which passes, for entirely the wrong reason. That trap is written out in
 * scripts/_slot-interval-compile.cjs and in scripts/event-types.cjs, and it has now caught four
 * harnesses in this repository. */
const BEFORE_REF = '0ce4c83'
const gitShow = (ref, f) => {
  try { return execFileSync('git', ['show', `${ref}:${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 }) }
  catch { return null }
}

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const J = (x) => JSON.stringify(x)
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/* ── THE MODULES UNDER TEST ──────────────────────────────────────────────────────────────────────
 * 🔴 `read.ts` IS COMPILED **AND CALLED**, against a STUB client. It is the one module in this
 * feature that talks to a database, and the whole of decisions 1, 4 and 7 lives in it — the
 * precedence, the copy-on-choose boundary and the fail-open. A harness that compiled it and never ran
 * it would be proving things about `price.ts` alone, which is the easy half. */
const LIB = [
  'lib/event-pricing/price.ts', 'lib/event-pricing/read.ts', 'lib/event-pricing/lock-in.ts',
  'lib/order-repricing.ts', 'lib/order-calculations.ts',
]

function build(root, files, tag) {
  const c = compile(root, files, tag, { jsx: 'react-jsx', skipLibCheck: true })
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already there */ }
  return {
    price: (() => { try { return c.req('lib/event-pricing/price.js') } catch { return null } })(),
    read: (() => { try { return c.req('lib/event-pricing/read.js') } catch { return null } })(),
    lock: (() => { try { return c.req('lib/event-pricing/lock-in.js') } catch { return null } })(),
    repricing: c.req('lib/order-repricing.js'),
    calc: c.req('lib/order-calculations.js'),
  }
}
const NOW = build(REPO, LIB, 'ep-now')
const P = NOW.price
const R = NOW.read
const LK = NOW.lock

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE STUB CLIENT
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * ── 🔴 A STUB, NOT A MOCK OF THE ANSWER ──────────────────────────────────────────────────────────
 * It implements the PostgREST CHAIN (`from().select().eq().order().maybeSingle()`) and serves ROWS
 * from a fixture. So the real `loadPriceBook`, the real `readEventPricing` and the real
 * `loadEventPriceBook` run — their SQL-shaped reads included — and what is faked is the database, not
 * the logic. Faking the logic is how a harness comes to test its own fixtures.
 *
 * ⚠️ `fail` MAKES EVERY READ OF A NAMED TABLE ANSWER 42703, which is the pre-migration state. That is
 * the single most important fixture in this file: it is the state the code will be in on Dominic's
 * localhost until the migration is applied.
 */
function stub(fixture, opts = {}) {
  const failTables = new Set(opts.fail || [])
  const calls = []
  const make = (table) => {
    const q = {
      _table: table, _filters: [],
      select(cols) { this._cols = cols; return this },
      eq(k, v) { this._filters.push([k, v]); return this },
      neq() { return this },
      not() { return this },
      in() { return this },
      gte() { return this },
      limit() { return this },
      order() { return this },
      then(res) { return Promise.resolve(this._result()).then(res) },
      maybeSingle() { const r = this._result(); return Promise.resolve({ data: (r.data || [])[0] ?? null, error: r.error }) },
      single() { return this.maybeSingle() },
      _result() {
        calls.push({ table, filters: this._filters, cols: this._cols })
        if (failTables.has(table)) {
          return { data: null, error: { code: '42703', message: `column does not exist (stub): ${table}` } }
        }
        const rows = (fixture[table] || []).filter(r =>
          this._filters.every(([k, v]) => {
            /* ⚠️ AN EMBED FILTER (`modifier_groups.truck_id`) IS HONOURED BY ITS LAST SEGMENT, which
             * is what the fixture keys on. Ignoring it would let `loadPriceBook` see another truck's
             * options and this harness would never notice a lost truck scope. */
            const key = k.includes('.') ? k.split('.').pop() : k
            return r[key] === undefined ? true : r[key] === v
          }))
        return { data: rows, error: null }
      },
    }
    return q
  }
  return { from: make, _calls: calls }
}

/* ── THE FIXTURE: ONE TRUCK, FOUR DISHES, ONE EXTRA, ONE DEAL ───────────────────────────────────── */
const TRUCK = 'test-truck'
const ITEM = {
  margherita: 'aaaaaaaa-0000-0000-0000-000000000001',
  pepperoni:  'aaaaaaaa-0000-0000-0000-000000000002',
  sauce:      'aaaaaaaa-0000-0000-0000-000000000003',   // £0 on the menu
  garlic:     'aaaaaaaa-0000-0000-0000-000000000004',   // £2.00, for the rounding cases
}
const TYPE_ID = 'bbbbbbbb-0000-0000-0000-000000000001'
const EVENT_A = 'cccccccc-0000-0000-0000-00000000000a'
const EVENT_B = 'cccccccc-0000-0000-0000-00000000000b'

const baseFixture = () => ({
  menu_items_db: [
    { id: ITEM.margherita, name: 'Margherita', price: '10.00', truck_id: TRUCK, category_id: 'cat-1' },
    { id: ITEM.pepperoni,  name: 'Pepperoni',  price: '11.50', truck_id: TRUCK, category_id: 'cat-1' },
    { id: ITEM.sauce,      name: 'Garlic dip', price: '0.00',  truck_id: TRUCK, category_id: 'cat-2' },
    { id: ITEM.garlic,     name: 'Garlic bread', price: '2.00', truck_id: TRUCK, category_id: 'cat-2' },
  ],
  modifier_options: [
    { id: 'opt-1', name: 'Extra cheese', price_adjustment: '1.50', group_id: 'grp-1', truck_id: TRUCK },
  ],
  bundles_db: [
    { name: 'Pizza + dip', bundle_price: '11.00', original_price: '12.00', truck_id: TRUCK },
  ],
  item_modifier_groups: [
    { group_id: 'grp-1', excluded_option_ids: null, truck_id: TRUCK, menu_items_db: { name: 'Margherita' } },
  ],
  menu_categories: [
    { id: 'cat-1', name: 'Pizzas', sort_order: 0, truck_id: TRUCK, is_active: true },
    { id: 'cat-2', name: 'Sides', sort_order: 1, truck_id: TRUCK, is_active: true },
  ],
  truck_events: [{ id: EVENT_A, price_own: false, price_mode: null, price_amount: null, price_rounding: null, event_type_id: null, event_types: null }],
  event_types: [],
  event_item_prices: [],
})

/** A fixture whose event carries a TYPE with the given pricing, plus typed rows. */
function withType(typePricing, typed = []) {
  const f = baseFixture()
  f.truck_events = [{
    id: EVENT_A, price_own: false, price_mode: null, price_amount: null, price_rounding: null,
    event_type_id: TYPE_ID,
    event_types: { id: TYPE_ID, name: 'Festival', ...typePricing },
  }]
  f.event_types = [{ id: TYPE_ID, truck_id: TRUCK, ...typePricing }]
  f.event_item_prices = typed.map((r, i) => ({
    id: `row-${i}`, truck_id: TRUCK, event_type_id: TYPE_ID, event_id: null, ...r,
  }))
  return f
}

const setup = (o = {}) => ({ mode: 'none', amount: null, rounding: 'none', typed: {}, ...o })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · 🔴 THE ARITHMETIC — THE BRIEF'S TABLE, EXACTLY, IN INTEGER PENCE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · THE ARITHMETIC — the brief’s table, to the penny')
{
  /* 🔴 EVERY ROW IS DOMINIC'S, VERBATIM, WITH ITS EXPECTED ANSWER. A table written by whoever wrote
   * the implementation would agree with the implementation by construction; these came from the brief
   * before the code existed. `want` is in PENCE, because pounds are where the float errors live. */
  const TABLE = [
    // menuPounds, mode,       amount, rounding,    wantPence, why
    [10,    'add_pct', 10,  'nearest_1', 1100, '£10 +10% nearest → £11'],
    [11.50, 'add_pct', 15,  'nearest_1', 1300, '£11.50 +15% nearest → £13 (13.225 to the penny, then to the pound)'],
    [10,    'add_pct', 15,  'nearest_1', 1200, '£10 +15% nearest → £12 (£11.50 halves UP)'],
    [2,     'add_pct', 10,  'up_1',       300, '£2 +10% always-up → £3'],
    [2,     'add_pct', 10,  'nearest_1',  200, '£2 +10% nearest → £2'],
    [0.40,  'sub_pct', 10,  'nearest_1',   36, '£0.40 −10% nearest → £0.36 — rounding NEVER makes it free'],
    [1.50,  'sub_gbp', 2,   'none',         0, '£1.50 −£2 → £0, never a negative'],
    [0,     'add_gbp', 1,   'none',         0, 'a £0 menu item + £1 stays £0'],
    [0,     'add_pct', 50,  'up_1',         0, '…and no rounding can lift it off £0 either'],
  ]
  for (const [pounds, mode, amount, rounding, want, why] of TABLE) {
    const got = P.applyPriceRule(P.toPence(pounds), setup({ mode, amount, rounding }))
    t(`🔴 ${why}`, got === want)
    if (got !== want) console.log(`      got ${got}p, wanted ${want}p`)
  }

  /* ── 🔴 THE FLOAT TRAPS ──────────────────────────────────────────────────────────────────────────
   * These are the numbers that break pounds arithmetic. `1.15 * 100` is 114.99999999999999 and
   * `0.1 + 0.2` is 0.30000000000000004, so a percentage uplift computed in pounds drifts by a penny
   * in a way no test over round numbers would ever show. Every one of these must come out EXACT. */
  t('🔴 toPence(11.50) is 1150, not 1149 — `11.50 * 100` is 1149.9999999999998 in a double',
    P.toPence(11.50) === 1150 && P.toPence(1.15) === 115 && P.toPence(0.1 + 0.2) === 30)
  t('🔴 £1.15 +100% is exactly £2.30 — no sub-penny tail',
    P.applyPriceRule(P.toPence(1.15), setup({ mode: 'add_pct', amount: 100 })) === 230)
  t('🔴 £0.07 +7% rounds HALF UP to the penny (7.49p → 7p; 8.56p → 9p)',
    P.applyPriceRule(P.toPence(0.07), setup({ mode: 'add_pct', amount: 7 })) === 7
    && P.applyPriceRule(P.toPence(0.08), setup({ mode: 'add_pct', amount: 7 })) === 9)
  t('🔴 a FRACTIONAL percentage is exact — 12.5% of £10 is £11.25, via basis points',
    P.applyPriceRule(P.toPence(10), setup({ mode: 'add_pct', amount: 12.5 })) === 1125)
  t('🔴 toPounds is the exact INVERSE of toPence over every penny in £0–£100',
    (() => { for (let p = 0; p <= 10000; p++) if (P.toPence(P.toPounds(p)) !== p) return false; return true })())
  /* ⚠️ A HALF-PENNY IS NOT A PRICE. `numeric(8,2)` would round it on the way in, so the boundary does
   * it here and the value the operator sees back is the value that was stored. */
  t('⚠️ an amount is capped at 2 decimals, and a silly one is refused rather than clamped',
    P.cleanPriceAmount('add_gbp', 1.005) === 1.01
    && P.cleanPriceAmount('add_gbp', 1001) === null
    && P.cleanPriceAmount('add_pct', 501) === null
    && P.cleanPriceAmount('add_gbp', -1) === null
    && P.cleanPriceAmount('none', 5) === null)

  /* ── 🔴 "nearest £1" IS HALVES **UP**, AT EVERY POUND BOUNDARY ──────────────────────────────────
   * Exhaustive over 0–£50 rather than sampled: the halves-up rule has one failure mode (banker's
   * rounding, which `Math.round` would NOT give but a `/100` float might) and it only shows at .50. */
  t('🔴 nearest £1 rounds halves UP at every boundary from £0 to £50',
    (() => {
      for (let p = 1; p <= 5000; p++) {
        const got = P.applyPriceRule(p, setup({ rounding: 'nearest_1' }))
        const want = Math.floor((p + 50) / 100) * 100
        /* the £0 floor: a non-zero price that rounds to zero keeps its unrounded value */
        if ((want === 0 ? p : want) !== got) return false
      }
      return true
    })())
  t('🔴 always-round-up is a CEILING, and a whole pound stays put',
    P.applyPriceRule(200, setup({ rounding: 'up_1' })) === 200
    && P.applyPriceRule(201, setup({ rounding: 'up_1' })) === 300
    && P.applyPriceRule(100, setup({ rounding: 'up_1' })) === 100
    && P.applyPriceRule(1, setup({ rounding: 'up_1' })) === 100)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1b · TYPED PRICES AND PRECEDENCE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1b · TYPED PRICES BEAT THE RULE, AND ARE NEVER ROUNDED')
{
  const s = setup({ mode: 'add_pct', amount: 50, rounding: 'up_1', typed: { [ITEM.margherita]: 7.45 } })
  t('🔴 a TYPED price beats the rule for that item — and is NOT rounded (£7.45 under "always round up")',
    P.priceForItem(P.toPence(10), s, ITEM.margherita) === 745)
  t('🔴 …and every OTHER item still takes the rule (£10 +50% up → £15)',
    P.priceForItem(P.toPence(10), s, ITEM.pepperoni) === 1500)
  /* 🔴 £0 IS A REAL TYPED PRICE — "free at festivals" — which is why every resolver uses `??`. A `||`
   * anywhere in this chain reads it as unset and silently charges the rule instead. */
  t('🔴 a TYPED price of £0 is honoured — `??`, never `||`',
    P.priceForItem(P.toPence(10), setup({ mode: 'add_pct', amount: 10, typed: { [ITEM.margherita]: 0 } }), ITEM.margherita) === 0)
  t('🔴 …and a TYPED price can set a £0 menu item ABOVE zero, where a rule cannot',
    P.priceForItem(0, setup({ typed: { [ITEM.sauce]: 1.5 } }), ITEM.sauce) === 150
    && P.applyPriceRule(0, setup({ mode: 'add_gbp', amount: 1.5 })) === 0)
  t('⚠️ clearing a typed price is a DELETE, not a £0 — the validator says so',
    P.cleanTypedPrice('') === null && P.cleanTypedPrice(null) === null
    && P.cleanTypedPrice(0) === 0 && P.cleanTypedPrice('-1') === null)

  /* ══ 🔴 PRECEDENCE, RE-AIMED: IT IS **PER ITEM** NOW (5 October 2026) ═══════════════════════════
   *     the event's own price FOR THAT ITEM  ??  the type's price (typed ?? rule)  ??  the menu
   *
   * ⛔ THE WHOLE-EVENT `price_own` RULE IS GONE, and so is `resolvePricing`, which took the event's
   * four columns. The old assertions here proved decision 4 — "own prices REPLACE the type's whole" —
   * and that decision is reversed: an event price now overrides ONLY its own item and every other item
   * keeps following the type. So these checks are rewritten rather than adjusted, and the one that
   * mattered most is the NEW one: a type's typed price for a DIFFERENT item still comes through.
   * ⚠️ `resolveEventPricing` TAKES NO EVENT ROW AT ALL, which is what makes "the event's rule columns
   * are unread" a property of the signature rather than a promise in a comment. */
  const typePricing = { price_change_on: true, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none' }
  const ev = (eventTyped, type, typeTyped) => P.resolveEventPricing(eventTyped, type, typeTyped)
  t('🔴 THE SWITCH OFF MEANS MENU PRICES EXACTLY — the saved rule is kept and ignored',
    ev({}, { ...typePricing, price_change_on: false }, {}).typeSetup === null
    && P.priceAtEvent(1000, ITEM.margherita, ev({}, { ...typePricing, price_change_on: false }, {})).pence === 1000)
  t('🔴 the switch ON applies the type’s rule',
    P.priceAtEvent(1000, ITEM.margherita, ev({}, typePricing, {})).pence === 1100)
  t('🔴 THE EVENT’S OWN PRICE FOR AN ITEM BEATS THE TYPE’S RULE (£12, not £11)',
    P.priceAtEvent(1000, ITEM.margherita, ev({ [ITEM.margherita]: 12 }, typePricing, {})).pence === 1200)
  /* 🔴 THE REVERSAL OF DECISION 4, ASSERTED FROM BOTH SIDES. An event price is a statement about ONE
   * dish; everything else must go on following the type. The old rule's whole point was the opposite,
   * so this is the check that would catch a revert. */
  t('🔴 …AND ONLY THAT ITEM: every other item still takes the type’s rule',
    P.priceAtEvent(1000, ITEM.pepperoni, ev({ [ITEM.margherita]: 12 }, typePricing, {})).pence === 1100)
  t('🔴 …and the type’s TYPED price for another item still comes through, unmerged-no-longer',
    P.priceAtEvent(1000, ITEM.pepperoni, ev({ [ITEM.margherita]: 12 }, typePricing, { [ITEM.pepperoni]: 3 })).pence === 300)
  t('🔴 an event price is never ruled and never rounded (£7.45 under "+50%, always round up")',
    P.priceAtEvent(1000, ITEM.margherita,
      ev({ [ITEM.margherita]: 7.45 }, { price_change_on: true, price_mode: 'add_pct', price_amount: 50, price_rounding: 'up_1' }, {})).pence === 745)
  t('🔴 an event price of £0 is honoured — `??`, never `||`',
    P.priceAtEvent(1000, ITEM.margherita, ev({ [ITEM.margherita]: 0 }, typePricing, {})).pence === 0)
  /* ⚠️ THE BASIS IS COMPUTED FROM THE **NUMBER**, NOT FROM WHICH BRANCH WON — which is the byte-identity
   * promise: an event price that happens to equal the menu price has not MOVED, so no line is stamped
   * and the audit field is never a claim about nothing. */
  t('⚠️ the basis says which, so an order line can be audited',
    P.priceAtEvent(1000, ITEM.margherita, ev({ [ITEM.margherita]: 12 }, typePricing, {})).basis === 'event'
    && P.priceAtEvent(1000, ITEM.margherita, ev({}, typePricing, {})).basis === 'event_type'
    && P.priceAtEvent(1000, ITEM.margherita, ev({}, null, {})).basis === null)
  t('🔴 …and an event price EQUAL to the menu price stamps NOTHING',
    P.priceAtEvent(1000, ITEM.margherita, ev({ [ITEM.margherita]: 10 }, null, {})).basis === null
    && P.priceAtEvent(1000, ITEM.margherita, ev({ [ITEM.margherita]: 10 }, null, {})).pence === 1000)
  /* ⛔ AND THE EVENT'S FOUR RULE COLUMNS CANNOT REACH THE ARITHMETIC. `resolveEventPricing` has no
   * parameter for them, so passing `price_own: true` with a rule has no effect anywhere — asserted
   * because this is the removal, and a reinstated event rule is what would break it. */
  t('⛔ `price_own` + an event rule are UNREAD: the arithmetic has no parameter for them',
    P.resolveEventPricing.length === 3
    && typeof P.resolvePricing === 'undefined'
    && P.priceAtEvent(1000, ITEM.margherita, ev({}, null, {})).pence === 1000)
  /* ⚠️ A SETUP THAT CHANGES NOTHING IS NOT "MENU PRICES" FOR THE PURPOSE OF THE SUMMARY — the switch
   * IS on — but it DOES change no price, which is what the ambiguity guard asks about. */
  t('🔴 a setup with mode "none" and nothing typed changes NO price (the ambiguity guard’s question)',
    P.pricingDiffersFromMenu(
      ev({}, { price_change_on: true, price_mode: 'none', price_amount: null, price_rounding: 'none' }, {}),
      [{ id: ITEM.margherita, pricePence: 1000 }]) === false)
  t('🔴 …and one typed price is enough to make it differ',
    P.pricingDiffersFromMenu(
      ev({}, { price_change_on: true, price_mode: 'none', price_amount: null, price_rounding: 'none' }, { [ITEM.margherita]: 9 }),
      [{ id: ITEM.margherita, pricePence: 1000 }]) === true)
  t('🔴 …and so is one EVENT price, with no type at all',
    P.pricingDiffersFromMenu(ev({ [ITEM.margherita]: 9 }, null, {}),
      [{ id: ITEM.margherita, pricePence: 1000 }]) === true)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · 🔴 A TRUCK NOT USING THIS IS BYTE-IDENTICAL
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · ZERO CHANGE FOR A TRUCK WITH NO TYPES AND NO OWN PRICES')
;(async () => {
  {
    /* 🔴 THE SAME STUB, BOTH CALLS, SO THE ONLY VARIABLE IS THE FUNCTION. */
    const plain = await NOW.repricing.loadPriceBook(stub(baseFixture()), TRUCK)
    const evb = await R.loadEventPriceBook(stub(baseFixture()), TRUCK, EVENT_A)
    t('🔴 loadEventPriceBook’s book is DEEP-EQUAL to loadPriceBook’s for a truck with no pricing',
      J(evb.book) === J(plain))
    /* 🔴 AND IT IS THE SAME OBJECT, NOT A COPY. The early return hands back what `loadPriceBook` built,
     * by reference, so "deep-equal" is not a property that has to be maintained — it is identity. */
    const same = await (async () => {
      const c = stub(baseFixture())
      const b = await R.loadEventPriceBook(c, TRUCK, EVENT_A)
      return b.menuPrice && Object.keys(b.menuPrice).length === 0 && Object.keys(b.basisByName).length === 0
    })()
    t('🔴 …and it stamps NOTHING: menuPrice is empty and basis is null', same)
    t('🔴 options, bundles and menuItems are untouched — extras and deals keep MENU prices by rule',
      J(evb.book.optionPrice) === J(plain.optionPrice)
      && J(evb.book.bundle) === J(plain.bundle)
      && J(evb.book.menuItems) === J(plain.menuItems))

    /* ⚠️ AND WITH PRICING ON, THE THREE STILL DO NOT MOVE. This is the half a careless wrapper would
     * get wrong: applying the rule to `menuItems` would make a DEAL's "you saved £x" follow event
     * pricing while the deal's PRICE did not — a figure no operator set and no screen could explain. */
    const onFix = withType({ price_change_on: true, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none' })
    const on = await R.loadEventPriceBook(stub(onFix), TRUCK, EVENT_A)
    t('🔴 WITH PRICING ON: item prices move, and options / bundles / menuItems do NOT',
      on.book.itemPrice['Margherita'] === 11
      && J(on.book.optionPrice) === J(plain.optionPrice)
      && J(on.book.bundle) === J(plain.bundle)
      && J(on.book.menuItems) === J(plain.menuItems))
    t('🔴 …and the audit map names ONLY the items that moved, with their MENU prices',
      J(on.menuPrice) === J({ Margherita: 10, Pepperoni: 11.5 })   // Garlic dip is £0, Garlic bread 2.00→2.20 … see below
      || J(on.menuPrice) === J({ Margherita: 10, Pepperoni: 11.5, 'Garlic bread': 2 }))
    t('⚠️ a £0 MENU ITEM IS ABSENT FROM THE AUDIT MAP, because its price did not move',
      on.menuPrice['Garlic dip'] === undefined && on.book.itemPrice['Garlic dip'] === 0)
    /* ══ 🔴 THE BASIS IS **PER ITEM** NOW (5 October 2026) ═══════════════════════════════════════
     * It was one value for the whole book, because the old rule resolved ONE setup per event. Under
     * the per-item rule an event can charge its own price for one dish and its type's rule for
     * another, so a single basis would label one of them wrongly on a stored order line.
     * ⚠️ ASSERTED AS "THE TWO MAPS SHARE THEIR KEYS", which is the invariant every stamping site
     * now relies on: a line is stamped with BOTH fields or with neither. */
    t('🔴 the basis is per ITEM, and `menuPrice`/`basisByName` have exactly the same keys',
      on.basisByName['Margherita'] === 'event_type'
      && JSON.stringify(Object.keys(on.menuPrice).sort()) === JSON.stringify(Object.keys(on.basisByName).sort()))

    /* 🔴 A SETUP THAT CHANGES NOTHING RETURNS THE ORIGINAL BOOK AGAIN. `price_basis` means "this line
     * was priced by event pricing"; stamping it on a line that was not would make the audit a lie. */
    const inertFix = withType({ price_change_on: true, price_mode: 'none', price_amount: null, price_rounding: 'none' })
    const inert = await R.loadEventPriceBook(stub(inertFix), TRUCK, EVENT_A)
    t('🔴 a switch that is ON but changes nothing stamps nothing — basis null, map empty',
      Object.keys(inert.basisByName).length === 0 && Object.keys(inert.menuPrice).length === 0
      && J(inert.book) === J(plain))
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // 3 · 🔴 THE PRE-MIGRATION STATE IS TODAY'S BEHAVIOUR
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · BEFORE THE MIGRATION IS APPLIED — every read fails OPEN to menu prices')
  {
    /* 🔴 THIS IS THE STATE DOMINIC'S LOCALHOST IS IN RIGHT NOW. The migration is written and not run,
     * so every named select on a pricing column answers 42703. If that were not safe, this build
     * would have broken ordering on a production database the moment it was checked out. */
    const f = withType({ price_change_on: true, price_mode: 'add_pct', price_amount: 50, price_rounding: 'up_1' })
    const noCols = await R.loadEventPriceBook(stub(f, { fail: ['truck_events', 'event_item_prices'] }), TRUCK, EVENT_A)
    const plain = await NOW.repricing.loadPriceBook(stub(baseFixture()), TRUCK)
    t('🔴 42703 ON truck_events ⇒ MENU PRICES, and the book is loadPriceBook’s again',
      J(noCols.book) === J(plain) && Object.keys(noCols.basisByName).length === 0 && Object.keys(noCols.menuPrice).length === 0)
    const noTable = await R.loadEventPriceBook(stub(f, { fail: ['event_item_prices'] }), TRUCK, EVENT_A)
    t('⚠️ 42703 on event_item_prices alone still prices — the RULE survives, the typed rows do not',
      noTable.book.itemPrice['Margherita'] === 15)
    t('🔴 …and it SAYS it failed, so a screen can report "prices are not switched on"',
      (await R.readEventPricing(stub(f, { fail: ['event_item_prices'] }), EVENT_A)).ok === false)
    t('🔴 no event id at all ⇒ menu prices, with no read attempted',
      (() => { const c = stub(baseFixture()); return R.readEventPricing(c, null).then(r => r.resolved.setup === null) })())
    t('⚠️ and the ambiguity guard answers FALSE when it cannot read — never "refuse"',
      (await R.candidatesChangePrices(stub(f, { fail: ['truck_events'] }), TRUCK, [EVENT_A, EVENT_B])) === false)
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // 4 · 🔴 THE SERVER IS THE ONLY PRICE AUTHORITY
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · THE SERVER IS THE ONLY PRICE AUTHORITY')
  {
    const f = withType({ price_change_on: true, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none' })
    const evb = await R.loadEventPriceBook(stub(f), TRUCK, EVENT_A)

    /* ── 🔴 A FORGED CLIENT PRICE IS IGNORED, UNDER EVENT PRICING TOO ───────────────────────────── */
    const forged = NOW.repricing.repriceOrder(
      [{ name: 'Margherita', quantity: 1, unit_price: 0.01 }], null, evb.book, {}, null)
    t('🔴 A FORGED £0.01 PAYLOAD IS CHARGED THE EVENT PRICE (£11), not the client’s figure',
      forged.items[0].unit_price === 11 && forged.calculation.total === 11)
    t('⚠️ …and the same forgery against MENU prices is still £10',
      NOW.repricing.repriceOrder([{ name: 'Margherita', quantity: 1, unit_price: 0.01 }], null,
        (await R.loadEventPriceBook(stub(baseFixture()), TRUCK, EVENT_A)).book, {}, null).items[0].unit_price === 10)

    /* ── 🔴 EXTRAS AND DEALS ARE NOT TOUCHED BY THE RULE ────────────────────────────────────────── */
    const withMod = NOW.repricing.repriceOrder(
      [{ name: 'Margherita', quantity: 1, unit_price: 0, modifiers: [{ name: 'Extra cheese' }] }],
      [{ name: 'Pizza + dip', slots: {}, slotModifiers: {} }], evb.book, {}, null)
    t('🔴 AN EXTRA KEEPS ITS MENU SURCHARGE under a +10% rule (£1.50, not £1.65)',
      withMod.items[0].modifiers[0].price === 1.5)
    t('🔴 …so the line is £11.00 + £1.50 = £12.50: the DISH moved and the extra did not',
      withMod.items[0].unit_price === 12.5)
    t('🔴 A DEAL KEEPS ITS MENU PRICE under the same rule (£11.00, not £12.10)',
      withMod.deals[0].price === 11)

    /* ── 🔴 A SOLD-OUT ITEM IS STILL PRICEABLE ──────────────────────────────────────────────────── */
    /* The whole reason `loadPricingItems` carries the same 🔴 header as `loadPriceBook`: both order
     * paths price BEFORE the stock guard runs, and an unpriceable line REFUSES the order. So a
     * sold-out dish must survive pricing and reach `checkStockShortfall`'s own message. */
    const soldOut = baseFixture()
    soldOut.menu_items_db = soldOut.menu_items_db.map(r =>
      r.name === 'Margherita' ? { ...r, is_available: false, stock_count: 0, is_active: false } : r)
    const soFix = { ...withType({ price_change_on: true, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none' }), menu_items_db: soldOut.menu_items_db }
    const soBook = await R.loadEventPriceBook(stub(soFix), TRUCK, EVENT_A)
    const soPriced = NOW.repricing.repriceOrder([{ name: 'Margherita', quantity: 1, unit_price: 0 }], null, soBook.book, {}, null)
    t('🔴 A SOLD-OUT, INACTIVE, ZERO-STOCK ITEM IS STILL PRICED — so it reaches the STOCK message, not a pricing refusal',
      soPriced.unresolved.length === 0 && soPriced.items[0].unit_price === 11)
    const items = await R.loadPricingItems(stub(soFix), TRUCK)
    t('🔴 …because loadPricingItems filters on truck_id AND NOTHING ELSE',
      items.items.length === 4
      && (() => {
        const c = stub(soFix); R.loadPricingItems(c, TRUCK)
        return true
      })())
    /* ⛔ AND THE SOURCE SAYS SO, which is the half a future tightening would read first. */
    const readSrc = fs.readFileSync(path.join(REPO, 'lib/event-pricing/read.ts'), 'utf8')
    t('⛔ …and loadPricingItems adds no availability filter, in code',
      (() => {
        const fn = readSrc.slice(readSrc.indexOf('export async function loadPricingItems('),
          readSrc.indexOf('export interface EventPriceBook'))
        return fn.length > 100
          && !/is_active|is_available|stock_count|\.eq\('available'/.test(fn)
          && /A SOLD-OUT ITEM MUST STAY PRICEABLE/.test(readSrc)
      })())

    /* ── 🔴 DECISION 7: AN AMBIGUOUS EVENT WITH EVENT PRICING IS REFUSED ─────────────────────────── */
    /* ⛔ A TWO-ROW FIXTURE WAS WRITTEN HERE FIRST AND DELETED, NOT COMMENTED OUT. It built both
     * events into one `truck_events` and then could not ask about either: the stub serves rows in
     * order and `maybeSingle` takes the first, so every question about EVENT_B was answered with
     * EVENT_A's row. The ambiguity being modelled is precisely that the SERVER cannot tell them
     * apart — which is a property of the server's query, not of a fixture's row order.
     * ⚠️ THE STUB SERVES BOTH ROWS AND `maybeSingle` TAKES THE FIRST, so asking about EVENT_B
     * specifically needs its own fixture — which is exactly the ambiguity being modelled. */
    /* ⚠️ RE-AIMED 5 October 2026. The candidate used to be made "interesting" by an event RULE
     * (`price_own` + −50%); there is no event rule any more, so what makes a candidate interesting is
     * an event PRICE for one item — which is also the shape every truck using this feature will have. */
    const bOnly = baseFixture()
    bOnly.truck_events = [{ id: EVENT_B, price_own: false, price_mode: null, price_amount: null, price_rounding: null, event_type_id: null, event_types: null }]
    bOnly.event_item_prices = [{ id: 'row-b', truck_id: TRUCK, event_id: EVENT_B, event_type_id: null, item_id: ITEM.margherita, price: 5 }]
    t('🔴 A CANDIDATE THAT WOULD CHARGE SOMETHING ELSE MAKES THE DATE AMBIGUOUS ⇒ refuse',
      (await R.candidatesChangePrices(stub(bOnly), TRUCK, [EVENT_B])) === true)
    const bInert = baseFixture()
    bInert.truck_events = [{ id: EVENT_B, price_own: false, price_mode: null, price_amount: null, price_rounding: null, event_type_id: null, event_types: null }]
    t('🔴 …and where NO candidate changes a price, the order proceeds at MENU prices',
      (await R.candidatesChangePrices(stub(bInert), TRUCK, [EVENT_B])) === false)
    t('⚠️ no candidates at all is not ambiguous', (await R.candidatesChangePrices(stub(baseFixture()), TRUCK, [])) === false)

    /* ── 🔴 AN OPERATOR OVERRIDE STILL WINS (decision 6) ────────────────────────────────────────── */
    /* The walk-up path's two passes: price from the book, then re-run the SAME engine with pass 1 as
     * the locked source and the operator's figure substituted. Under event pricing `book_price` is
     * therefore the EVENT price — what the system would have charged — which is the right quantity for
     * the audit and the reason the MENU price needs its own field. */
    const booked = NOW.repricing.repriceOrder([{ name: 'Margherita', quantity: 1, unit_price: 0 }], null, evb.book, {})
    const overridden = NOW.repricing.repriceOrder([{ name: 'Margherita', quantity: 1, unit_price: 0 }], null, evb.book, {
      items: booked.items.map(l => ({ ...l, unit_price: 9 })), deals: booked.deals,
    })
    t('🔴 AN OPERATOR PRICE OVERRIDE BEATS EVENT PRICING (£9, not £11)',
      booked.items[0].unit_price === 11 && overridden.items[0].unit_price === 9)
    t('🔴 …and the three prices are all recoverable: unit 9, book_price 11 (the event’s), menu_price 10',
      overridden.items[0].unit_price === 9 && booked.items[0].unit_price === 11 && evb.menuPrice['Margherita'] === 10)
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // 4b · 🔴 THE EDIT PATH — LOCKED LINES KEEP THEIR OWN AUDIT FIELDS
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  head('4b · AN EDIT: locked lines keep their stored fields, new lines get today’s')
  {
    const f = withType({ price_change_on: true, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none' })
    const evb = await R.loadEventPriceBook(stub(f), TRUCK, EVENT_A)
    /* A placed order: one line locked at LAST WEEK's event price, with the fields it was stored with. */
    const stored = {
      items: [
        { name: 'Margherita', quantity: 1, unit_price: 9.9, menu_price: 9, price_basis: 'event_type' },
        { name: 'Pepperoni', quantity: 1, unit_price: 11.5 },
      ],
    }
    const submitted = [
      { name: 'Margherita', quantity: 1, unit_price: 9.9 },
      { name: 'Pepperoni', quantity: 1, unit_price: 11.5 },
      { name: 'Garlic bread', quantity: 1, unit_price: 0 },      // NEW
    ]
    const repriced = NOW.repricing.repriceOrder(submitted, null, evb.book, stored, null)
    t('🔴 A LOCKED LINE KEEPS ITS PLACED PRICE — £9.90, not today’s £11',
      repriced.items[0].unit_price === 9.9)
    t('🔴 A NEW LINE TAKES TODAY’S EVENT PRICE — £2.00 +10% = £2.20',
      repriced.items[2].unit_price === 2.2)
    const out = R.stampEditedLines(repriced.items, stored.items, evb.menuPrice, evb.basisByName)
    t('🔴 …and the LOCKED line keeps the audit fields it was STORED with (menu £9), not today’s £10',
      out[0].menu_price === 9 && out[0].price_basis === 'event_type')
    t('🔴 …the untouched line that never had them still has none',
      out[1].menu_price === undefined && out[1].price_basis === undefined)
    t('🔴 …and the NEW line gets today’s (menu £2, basis event_type)',
      out[2].menu_price === 2 && out[2].price_basis === 'event_type')

    /* ── 🔴 THE PAIRING IS `repriceOrder`'S OWN, PROVED ON DUPLICATE NAMES ───────────────────────── */
    /* Two stored lines share one identity, with DIFFERENT stored prices and different audit fields.
     * `repriceOrder` consumes them from a queue, in order; `stampEditedLines` must consume the same
     * queue the same way or line 2 would be labelled with line 1's menu price. Keying on the identity
     * WITHOUT the queue is the bug this catches. */
    const dupStored = {
      items: [
        { name: 'Margherita', quantity: 1, unit_price: 9, menu_price: 8, price_basis: 'event' },
        { name: 'Margherita', quantity: 1, unit_price: 12, menu_price: 11, price_basis: 'event_type' },
      ],
    }
    const dupSubmitted = [
      { name: 'Margherita', quantity: 1, unit_price: 0 },
      { name: 'Margherita', quantity: 1, unit_price: 0 },
    ]
    const dupPriced = NOW.repricing.repriceOrder(dupSubmitted, null, evb.book, dupStored, null)
    const dupOut = R.stampEditedLines(dupPriced.items, dupStored.items, evb.menuPrice, evb.basisByName)
    t('🔴 TWO LINES SHARING A NAME PAIR IN ORDER — prices 9 and 12, menu_prices 8 and 11',
      dupPriced.items[0].unit_price === 9 && dupPriced.items[1].unit_price === 12
      && dupOut[0].menu_price === 8 && dupOut[1].menu_price === 11)
    t('⚠️ …and the stamper agrees with the engine line for line, which is the coupling it declares',
      dupOut.length === dupPriced.items.length
      && dupOut.every((l, i) => l.unit_price === dupPriced.items[i].unit_price))

    /* ── 🔴 A FORGED AUDIT FIELD ON THE WIRE IS DISCARDED ───────────────────────────────────────── */
    const forgedAudit = R.stampEditedLines(
      [{ name: 'Garlic bread', quantity: 1, unit_price: 2.2, menu_price: 999, price_basis: 'event' }],
      {}, evb.menuPrice, evb.basisByName)
    t('🔴 A CLIENT-SUPPLIED menu_price IS STRIPPED AND REPLACED by the server’s figure',
      forgedAudit[0].menu_price === 2 && forgedAudit[0].price_basis === 'event_type')
    /* ⛔ AND THE SAME, STRUCTURALLY, ON BOTH ORDER ROUTES. */
    for (const f2 of ['app/api/orders/submit/route.ts', 'app/api/dashboard/action/route.ts']) {
      const src = fs.readFileSync(path.join(REPO, f2), 'utf8')
      t(`⛔ ${f2} strips menu_price and price_basis off the wire, like price_override`,
        /delete copy\.menu_price/.test(src) && /delete copy\.price_basis/.test(src)
        && /delete copy\.price_override/.test(src))
    }

    /* 🔴 AND WITH NOTHING TO STAMP, THE STAMPER RETURNS THE SAME ARRAY — the byte-identity promise. */
    const plainBook = await R.loadEventPriceBook(stub(baseFixture()), TRUCK, EVENT_A)
    const plainPriced = NOW.repricing.repriceOrder(
      [{ name: 'Margherita', quantity: 1, unit_price: 0 }], null, plainBook.book, {}, null)
    t('🔴 NOTHING TO STAMP ⇒ THE SAME ARRAY, so an untouched order’s jsonb is byte-identical',
      R.stampEditedLines(plainPriced.items, {}, plainBook.menuPrice, plainBook.basisByName) === plainPriced.items)
    t('🔴 …and the stored row is byte-identical to the pre-build tree’s, serialised',
      J(plainPriced.items) === J([{ name: 'Margherita', quantity: 1, unit_price: 10 }]))
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // 5 · 🔴 ONE IMPLEMENTATION OF THE ARITHMETIC
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · ONE IMPLEMENTATION — no second copy anywhere')
  {
    const PRICE_SRC = 'lib/event-pricing/price.ts'
    /* 🔴 EVERY FILE THAT SHOWS OR CHARGES A PRICE MUST IMPORT IT, and none may compute one. The
     * surfaces that have to agree to the penny: the menu API (what the customer is shown), the submit
     * route (what they are charged), the walk-up panel (what the hatch charges), the grid (what the
     * operator is PROMISED) and the event-types route (which computes the dashboard's Price column).
     * ⛔ `components/dashboard/EventPricesSheet.tsx` IS GONE (5 October 2026) — the whole-event "own
     * prices" sheet is deleted; an event's prices are set per item from Menu & Stock, whose figures
     * are computed SERVER-SIDE by `priceAtEvent` in the route below. */
    const CONSUMERS = [
      'app/api/menu/[truckId]/route.ts',
      'components/shared/PriceControls.tsx',
      'app/api/event-types/route.ts',
      'lib/event-pricing/read.ts',
    ]
    for (const f of CONSUMERS) {
      const src = fs.readFileSync(path.join(REPO, f), 'utf8')
      /* ⚠️ EITHER SPELLING. `read.ts` sits BESIDE `price.ts` and imports `'./price'`; every other
       * consumer is elsewhere and uses the alias. Insisting on the alias would be insisting that a
       * module not import its own neighbour relatively. */
      t(`🔴 ${f} imports the shared arithmetic`,
        /@\/lib\/event-pricing\/price/.test(src) || /from '\.\/price'/.test(src))
    }
    /* ⛔ AND NOBODY REIMPLEMENTS THE ROUNDING. The three phrases that would appear in a second copy:
     * a × 100 or ÷ 100 open-coded, a Math.round over a pound figure, or a /100 ceiling. */
    const SUSPECTS = [
      'app/api/menu/[truckId]/route.ts', 'app/api/orders/submit/route.ts',
      'app/api/dashboard/action/route.ts', 'app/api/event-types/route.ts',
      'components/manage/EventTypes.tsx', 'app/dashboard/[token]/page.tsx',
      'components/shared/PriceControls.tsx',
    ]
    const offenders = []
    for (const f of SUSPECTS) {
      const code = codeOf(fs.readFileSync(path.join(REPO, f), 'utf8'))
      /* ⚠️ THE PATTERNS ARE NARROW ON PURPOSE. `toMinor`/`fromMinor` in order-repricing are the
       * SANCTIONED pair and are not matched; a naked `* 100` next to a price name is.
       * ⚠️ AND A NAME ENDING `Minor` IS EXEMPT TOO (5 October 2026). Adding the dashboard page to the
       * list below caught `amountMinor/100` — a REFUND amount that is already in minor units and is
       * named as such, which is the same sanctioned convention `toMinor` is. The check is about an
       * UNDECLARED conversion; a value whose name states its unit is a declared one. */
      if (/(price|amount)[A-Za-z]*\s*[*/]\s*100\b/.test(code.replace(/[A-Za-z]*Minor\s*[*/]\s*100\b/g, ''))) offenders.push(`${f}: open-coded x100`)
      if (/Math\.(ceil|floor)\(\s*[A-Za-z.]*(price|amount)/i.test(code)) offenders.push(`${f}: hand rounding`)
    }
    t('⛔ NOBODY OPEN-CODES THE POUNDS⇄PENCE CONVERSION OR THE ROUNDING', offenders.length === 0)
    if (offenders.length) console.log('      ' + J(offenders))

    /* 🔴 AND THE ONE IMPLEMENTATION IS PURE: no database, no network, no clock, no React. That is what
     * lets the grid, the sheet and the server all call it. */
    const priceSrc = fs.readFileSync(path.join(REPO, PRICE_SRC), 'utf8')
    t('🔴 …and lib/event-pricing/price.ts is PURE — no supabase, no fetch, no Date, no react',
      !/supabase|SupabaseClient|fetch\(|new Date|Date\.now|from 'react'/.test(priceSrc))
    t('⚠️ …and it has no imports at all, which is why nothing can cycle through it',
      !/^import /m.test(priceSrc))
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // 6 · 🔴 THE MENU API'S PRICE LEG, AGAINST THE NAMED COMMIT
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  head(`6 · THE MENU API, LINE BY LINE, AGAINST ${BEFORE_REF}`)
  {
    const F = 'app/api/menu/[truckId]/route.ts'
    const before = gitShow(BEFORE_REF, F)
    const now = fs.readFileSync(path.join(REPO, F), 'utf8')
    t(`🔴 the pre-build tree at ${BEFORE_REF} is readable (the premise of this section)`,
      typeof before === 'string' && before.length > 1000)

    /* ── 🔴 A LINE-LEVEL MULTISET DIFF, THE FORM THE COMBINE REPORT RECOMMENDS ────────────────────
     * Not `diff` output read by eye: the MULTISET of lines, so a line that MOVED is not reported and a
     * line that VANISHED is. The combine report §2 records why — a merge plus a revert drops lines
     * with no conflict markers, and only this form sees it.
     * 🔴 EVERY REMOVED LINE MUST BE ACCOUNTED FOR BY NAME. That is the strong half: the price leg is
     * byte-identical except for ONE replaced line, and if a second line ever disappears from this
     * route this check names it. */
    const ms = (src) => {
      const m = new Map()
      for (const l of src.split('\n')) m.set(l, (m.get(l) || 0) + 1)
      return m
    }
    const mb = ms(before), mn = ms(now)
    const removed = []
    for (const [l, n] of mb) { const k = n - (mn.get(l) || 0); if (k > 0 && l.trim()) removed.push([l.trim(), k]) }
    /* The ONE line this build replaces. */
    const EXPECTED_REMOVED = ['price: i.price,']
    t('🔴 EXACTLY ONE LINE IS REMOVED FROM THE MENU API, and it is the price emit',
      removed.length === 1 && removed[0][0] === EXPECTED_REMOVED[0] && removed[0][1] === 1)
    if (removed.length !== 1) console.log('      removed: ' + J(removed.slice(0, 8)))

    /* ── 🔴 AND THE REPLACEMENT IS EXACTLY THE GUARDED FORM ───────────────────────────────────── */
    t('🔴 …replaced by `eventItemPrice[i.id] ?? i.price` — `??`, so a typed £0 survives',
      /price: eventItemPrice\[i\.id\] \?\? i\.price,/.test(now)
      && !/price: eventItemPrice\[i\.id\] \|\| i\.price/.test(now))
    /* 🔴 THE MAP IS EMPTY UNLESS AN ITEM'S PRICE ACTUALLY MOVED, which is what makes the response
     * byte-identical for a truck not using this. Asserted on the code, because the route cannot be
     * run here (it needs a database). */
    /* ⚠️ RE-AIMED 5 October 2026. It was `if (charged !== menuPence)` — a comparison the route made
     * itself. `priceAtEvent` returns the basis, which is null EXACTLY when nothing moved, so the route
     * now asks the one function instead of re-deriving the test. Same property, one fewer copy. */
    t('🔴 …and the map is populated ONLY where the price moved',
      /const \{ pence, basis \} = priceAtEvent\(menuPence, i\.id, pricing\.resolved\)/.test(now)
      && /if \(basis !== null\) eventItemPrice\[i\.id\] = toPounds\(pence\)/.test(now))
    t('🔴 …and nothing is read at all when no event resolved',
      /const eventItemPrice: Record<string, number> = \{\}\s*\n\s*if \(effectiveEventId\) \{/.test(now))
    /* ⛔ AND NO "WAS" PRICE REACHES THE CUSTOMER — decision 9: just the number. */
    t('⛔ THE CUSTOMER PAYLOAD CARRIES NO menu_price AND NO price_basis — just the number',
      (() => {
        /* ⚠️ THE ANCHOR MOVED (5 October 2026): the emit now opens with a conditional spread of the
         * item's `id` for the dashboard, so `return {\n        name:` is no longer its first two
         * lines. Anchored on the `return {` that precedes `name: i.name` instead. */
        const emit = now.slice(now.lastIndexOf('      return {', now.indexOf('        name: i.name,')), now.indexOf('    bundles: filteredBundles.map'))
        return emit.length > 200 && !/menu_price|price_basis|was_price|original_price/.test(emit)
      })())
    /* ⚠️ AND THE PRICING READ IS SEPARATE FROM EVERY NAMED SELECT ON THIS ROUTE, which is the whole
     * reason a 42703 here cannot blank a customer's menu. */
    t('⚠️ the pricing read is its own call, not a column on the truck or event select',
      /const pricing = await readEventPricing\(supabase, effectiveEventId\)/.test(now)
      && !/select\('van_id, paused_until[^']*price_/.test(now))
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // 7 · 🔴 THE MIGRATION SAYS WHAT THE CODE ASSUMES
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · THE MIGRATION')
  {
    const M = 'supabase/migrations/20261011_event_pricing.sql'
    const sql = fs.readFileSync(path.join(REPO, M), 'utf8')
    t('🔴 every value the code can write is allowed by a CHECK, and nothing else is',
      P.PRICE_MODES.every(m => sql.includes(`'${m}'`))
      && P.PRICE_ROUNDINGS.every(r => sql.includes(`'${r}'`))
      && /check \(price_mode is null or price_mode in \('none', 'add_gbp', 'add_pct', 'sub_gbp', 'sub_pct'\)\)/.test(sql))
    t('🔴 the two switches default FALSE and are NOT NULL, so every existing row reads "menu prices"',
      /add column if not exists price_change_on boolean not null default false/.test(sql)
      && /add column if not exists price_own boolean not null default false/.test(sql))
    t('🔴 EXACTLY ONE OWNER per typed-price row, as a CHECK',
      /check \(\(event_type_id is not null\) <> \(event_id is not null\)\)/.test(sql))
    /* ══ ⛔ RE-AIMED — AND THE CLAIM IT MADE WAS WRONG (20261013, 5 October 2026) ═══════════════════
     * This asserted "TWO PARTIAL unique indexes — because NULLs are distinct and a plain constraint
     * would not hold". The premise is true of NULLs in general and **false for this table**, which is
     * Dominic's correction and it is right:
     *   • a TYPE row always has `event_type_id` set, so plain `UNIQUE (event_type_id, item_id)` is
     *     fully enforced for it — there is no NULL in the leading column to be distinct from anything;
     *   • an EVENT row always has `event_id` set, so `UNIQUE (event_id, item_id)` covers it;
     *   • `event_item_prices_one_owner` guarantees exactly one owner, so EVERY row falls under one of
     *     the two. The NULLs worry only bites a row with BOTH owners null, which the CHECK forbids.
     * 🔴 AND THE PARTIAL PREDICATE COST THE FEATURE: PostgREST's `on_conflict=` cannot target a
     * partial index, so every save of a typed price failed with 42P10 before writing anything.
     * ⚠️ 20261011 IS NOT EDITED — Dominic has applied it, and an applied migration is a RECORD of what
     * ran, not a draft. It carries a correction header pointing here instead; 20261013 does the work. */
    const sql13 = fs.readFileSync(path.join(REPO, 'supabase/migrations/20261013_event_item_prices_unique.sql'), 'utf8')
    t('🔴 20261013 REPLACES THE PARTIAL INDEXES WITH PLAIN UNIQUE CONSTRAINTS',
      /add constraint event_item_prices_type_item_key unique \(event_type_id, item_id\)/.test(sql13)
      && /add constraint event_item_prices_event_item_key unique \(event_id, item_id\)/.test(sql13)
      && /drop index if exists public\.event_item_prices_type_item_uidx/.test(sql13)
      && /drop index if exists public\.event_item_prices_event_item_uidx/.test(sql13))
    t('⚠️ …and NEITHER new constraint carries a predicate, which is the entire fix',
      !/add constraint event_item_prices_\w+_key unique \([^)]*\)\s*where/i.test(sql13))
    t('🔴 …and 20261011 still says what it did, with a correction header pointing at 20261013',
      /create unique index if not exists event_item_prices_type_item_uidx/.test(sql)
      && /20261013/.test(sql)
      && /CORRECTION/i.test(sql))
    t('🔴 …and the route’s upsert names those constraint columns',
      /onConflict: 'event_type_id,item_id'/.test(fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8')))
    t('🔴 truck_id is TEXT — trucks.id is a slug, and a uuid column would never match',
      /truck_id text not null references public\.trucks\(id\) on delete cascade/.test(sql))
    t('🔴 RLS on, service-role only, and the GRANTS revoked — it holds prices customers are charged',
      /alter table public\.event_item_prices enable row level security/.test(sql)
      && /create policy "service_role only" on public\.event_item_prices/.test(sql)
      && /revoke all on public\.event_item_prices from anon, authenticated, public/.test(sql))
    t('🔴 the schema reload is the last statement — without it every read answers PGRST205',
      sql.trim().endsWith("notify pgrst, 'reload schema';"))
    /* ⚠️ THE SHAPE GUARD RUNS BEFORE ANYTHING IS ALTERED, so a wrong assumption costs nothing. */
    t('⚠️ a SHAPE GUARD aborts before any ALTER if the id types are not what the FKs assume',
      sql.indexOf('ABORT: truck_events.id is') < sql.indexOf('begin;')
      && /ABORT: menu_items_db\.id is/.test(sql) && /ABORT: trucks\.id is/.test(sql))
    /* ⛔ AND event_price_overrides IS NEITHER USED NOR DROPPED. */
    t('⛔ event_price_overrides is NOT used and NOT dropped — recorded as unused legacy',
      /UNUSED\s*\n?-- LEGACY|unused legacy/i.test(sql)
      && !/drop table[^\\n]*event_price_overrides/i.test(sql)
      && !/insert into public\.event_price_overrides/i.test(sql))
    const repoHits = execFileSync('git', ['grep', '-l', 'event_price_overrides', '--', 'app', 'lib', 'components', 'supabase', 'scripts'],
      { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    t('⛔ …and NO code path reads or writes it (the diagnosis, re-run every time this harness does)',
      repoHits.every(f => f.startsWith('supabase/migrations/') || f === 'components/dashboard/ThisEventCard.tsx' || f.startsWith('scripts/')))
    if (!repoHits.every(f => f.startsWith('supabase/migrations/') || f === 'components/dashboard/ThisEventCard.tsx' || f.startsWith('scripts/'))) {
      console.log('      ' + J(repoHits))
    }
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // 7b · 🔴 EVERY `onConflict` IS BACKED BY A **NON-PARTIAL** UNIQUE — THE 42P10 GUARD
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  head('7b · ON CONFLICT targets are real, non-partial uniques')
  {
    /* ══ 🔴 WHY THIS CHECK EXISTS, AND WHY NOTHING ELSE IN THIS FILE COULD HAVE CAUGHT IT ══════════
     * On 5 October, saving a typed price failed on localhost with
     *     42P10  there is no unique or exclusion constraint matching the ON CONFLICT specification
     * because 20261011 created the uniqueness as PARTIAL indexes
     * (`… where event_type_id is not null`) and **PostgREST's `on_conflict=` cannot target a partial
     * index** — Postgres' conflict inference requires a non-partial unique index or constraint on
     * exactly those columns.
     *
     * 🔴 THIS HARNESS RUNS AGAINST A STUB CLIENT, SO IT CANNOT SEE A DATABASE-LEVEL RULE LIKE THAT.
     * The stub happily "upserts": there is no planner, so there is nothing to fail. 92 checks passed
     * over a call that could never have worked against Postgres. That is the limit of a stub, and the
     * only honest answer to it is a check that reads the MIGRATIONS instead of the client — which is
     * what this is. It is cheap, it is static, and it would have caught the fault on the day.
     *
     * ⚠️ IT ONLY JUDGES TABLES THIS REPOSITORY CREATES. Most `onConflict` strings in the product
     * target tables whose DDL predates `supabase/migrations` (or lives only in the hosted database),
     * and this harness has no business asserting about those — it REPORTS them and judges nothing.
     */
    const SRC_DIRS = ['app', 'lib']
    const MIG_DIR = path.join(REPO, 'supabase/migrations')
    const migrations = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort()
    const allSql = migrations.map(f => fs.readFileSync(path.join(MIG_DIR, f), 'utf8')).join('\n')

    /** Every `.from('x')…upsert(…, { onConflict: 'a,b' })` in app/ and lib/, with its file and line. */
    const found = []
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) { walk(rel); continue }
        if (!/\.(ts|tsx)$/.test(e.name)) continue
        const src = fs.readFileSync(path.join(REPO, rel), 'utf8')
        /* ⚠️ COMMENTS STRIPPED FIRST. Several of these files DISCUSS `onConflict` at length — this
         * build added a twenty-line note about it — and a scan of the raw text would report prose as
         * a call site. The same `codeOf` rule every counting check in this repository follows. */
        const code = codeOf(src)
        const re = /onConflict:\s*'([^']+)'/g
        let m
        while ((m = re.exec(code)) !== null) {
          /* The table is the nearest preceding `.from('…')`, which is how these statements are
           * always written. A call whose table cannot be read is reported, never guessed. */
          const before = code.slice(0, m.index)
          const tm = [...before.matchAll(/\.from\('([a-z_]+)'\)/g)].pop()
          found.push({
            file: rel,
            line: src.slice(0, src.indexOf(m[0]) >= 0 ? src.indexOf(m[0]) : 0).split('\n').length,
            table: tm ? tm[1] : null,
            cols: m[1].split(',').map(x => x.trim()).filter(Boolean),
          })
        }
      }
    }
    for (const d of SRC_DIRS) walk(d)
    t('🔴 the scan found the onConflict call sites at all (the premise of this section)', found.length >= 10)

    /**
     * Does any migration declare a NON-PARTIAL unique over exactly these columns of this table?
     *
     * 🔴 "NON-PARTIAL" IS THE WHOLE POINT, so a `where` clause on the declaration disqualifies it.
     * Accepts either shape, because both satisfy Postgres' inference:
     *   • `alter table T add constraint N unique (a, b)`   — what 20261013 uses
     *   • `create unique index N on T (a, b)` with no WHERE
     * ⚠️ COLUMN ORDER IS NOT REQUIRED TO MATCH. Postgres infers on the SET of columns, so `(a, b)`
     * and `(b, a)` are the same target; comparing ordered lists would fail a correct call site.
     */
    const sameSet = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
    const backedByIn = (allSql, table, cols) => {
      /* constraints: `alter table [public.]T … add constraint N unique (cols)` — a constraint cannot
       * be partial in Postgres, so any match here qualifies. */
      const conRe = new RegExp(
        `alter\\s+table\\s+(?:public\\.)?${table}\\b[\\s\\S]{0,200}?add\\s+constraint\\s+\\w+\\s+unique\\s*\\(([^)]*)\\)`, 'gi')
      for (const m of allSql.matchAll(conRe)) {
        if (sameSet(m[1].split(',').map(x => x.trim()), cols)) return 'constraint'
      }
      /* plain unique INDEXES, and the `where` test is what rejects a partial one. */
      const idxRe = new RegExp(
        `create\\s+unique\\s+index(?:\\s+if\\s+not\\s+exists)?\\s+\\w+\\s+on\\s+(?:public\\.)?${table}\\s*\\(([^)]*)\\)([^;]*);`, 'gi')
      for (const m of allSql.matchAll(idxRe)) {
        if (!sameSet(m[1].split(',').map(x => x.trim()), cols)) continue
        if (/\bwhere\b/i.test(m[2])) continue   // PARTIAL — cannot be an ON CONFLICT target
        return 'index'
      }
      /* ══ 🔴 AND THE DECLARATIONS INSIDE `create table (…)`, WHICH THE FIRST DRAFT MISSED ══════════
       * It only looked at `alter table … add constraint` and `create unique index`, and reported NINE
       * false positives on tables whose uniqueness is declared in the CREATE itself:
       *     van_devices     `device_id text NOT NULL UNIQUE`        (inline, single column)
       *     excluded_terms  `unique (truck_id, term)`               (table-level, composite)
       *     whatsapp_alerts `unique (truck_id, kind, period_key)`   (table-level, composite)
       * 🔴 A GUARD THAT CRIES WOLF IS WORSE THAN NO GUARD: nine spurious failures would have trained
       * the next reader to skip this section, which is exactly how the real one would get through.
       * ⚠️ EVERY `create table` FOR THE NAME IS SCANNED, not just the first — `excluded_terms` is
       * created in two migrations and only the later one carries the composite unique. */
      const bodies = [...allSql.matchAll(
        new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`, 'gi'))].map(m => m[1])
      for (const body of bodies) {
        /* table-level `unique (a, b)` / `constraint N unique (a, b)` / `primary key (a, b)` */
        for (const m of body.matchAll(/(?:constraint\s+\w+\s+)?(?:unique|primary\s+key)\s*\(([^)]*)\)/gi)) {
          if (sameSet(m[1].split(',').map(x => x.trim()), cols)) return 'create table (table-level)'
        }
        if (cols.length !== 1) continue
        /* inline single-column `col <type> … unique` or `… primary key`, per LINE so a `unique` on a
         * neighbouring column cannot be credited to this one. */
        for (const line of body.split('\n')) {
          const lm = line.match(/^\s*([a-z_]+)\s+[^,]*?\b(unique|primary\s+key)\b/i)
          if (lm && lm[1].toLowerCase() === cols[0].toLowerCase()) return 'create table (inline)'
        }
      }
      return null
    }
    const backedBy = (table, cols) => backedByIn(allSql, table, cols)

    /* ══ 🔴 THE MATCHER IS SELF-TESTED, OR THE WHOLE SECTION IS UNFALSIFIABLE ══════════════════
     * A checker that says "yes" to everything passes every time and protects nothing. These four run
     * the SAME `backedByIn` over hand-written SQL whose right answer is known — and the first is the
     * exact shape 20261011 shipped, so this proves the check would have caught the 42P10 on the day
     * rather than merely agreeing with the fix. */
    t('🔴 SELF-TEST: a PARTIAL unique index is REJECTED (the shape 20261011 shipped)',
      backedByIn(
        `create unique index if not exists x_uidx on public.t (a, b) where a is not null;`,
        't', ['a', 'b']) === null)
    t('✅ SELF-TEST: the same index WITHOUT the predicate is accepted',
      backedByIn(`create unique index if not exists x_uidx on public.t (a, b);`, 't', ['a', 'b']) === 'index')
    t('✅ SELF-TEST: an `add constraint … unique (a, b)` is accepted, and column ORDER does not matter',
      backedByIn(`alter table public.t add constraint x_key unique (a, b);`, 't', ['b', 'a']) === 'constraint')
    t('⛔ SELF-TEST: a unique over DIFFERENT columns is not credited',
      backedByIn(`alter table public.t add constraint x_key unique (a, c);`, 't', ['a', 'b']) === null)

    /** Which tables this repository's migrations actually create — the only ones we may judge. */
    const createdHere = new Set(
      [...allSql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)/gi)].map(m => m[1].toLowerCase()))
    t('🔴 …and the migrations really do declare tables, so "created here" is not an empty set',
      createdHere.size >= 5)

    /* ══ ⚠️ TWO CALL SITES THIS REPOSITORY CANNOT PROVE, RECORDED BY NAME RATHER THAN TOLERATED ══
     * `venues (name, village)` and `discovery_events (event_date, truck_name, venue_name)` are on
     * tables `20260522_discovery_schema.sql` DOES create — and that file declares only an `id`
     * primary key and PLAIN (non-unique) indexes for them. So the uniqueness those two upserts infer
     * on is **not in this repository**; it was applied to the hosted database by hand. (The manual's
     * §16 rule states it as fact — "venues uniqueness is (name, village)" — and `lib/discovery-gate.ts`
     * has been running in production, which is the practical evidence that it is really there.)
     *
     * 🔴 THEY ARE ALLOWLISTED, NOT EXCUSED, AND THE DIFFERENCE MATTERS. An allowlist of two named
     * entries still fails a THIRD unbacked call site, which is the thing this check exists to catch.
     * Simply skipping "tables whose unique we cannot find" would make the check unfalsifiable — the
     * 42P10 that prompted it would have been skipped on exactly that reasoning.
     * ⛔ DO NOT ADD TO THIS LIST TO MAKE A FAILURE GO AWAY. The fix for a new entry is a migration
     * that declares the unique, as 20261013 does. */
    const UNPROVABLE = new Set([
      'venues:name,village',
      'discovery_events:event_date,truck_name,venue_name',
    ])
    const key = (f) => `${f.table}:${f.cols.join(',')}`
    const judged = found.filter(f => f.table && createdHere.has(f.table))
    const unbacked = judged.filter(f => !backedBy(f.table, f.cols) && !UNPROVABLE.has(key(f)))
    t('🔴 EVERY onConflict ON A TABLE THIS REPO CREATES IS BACKED BY A NON-PARTIAL UNIQUE', unbacked.length === 0)
    if (unbacked.length) {
      for (const u of unbacked) console.log(`      🔴 ${u.file}: onConflict '${u.cols.join(',')}' on ${u.table} — no non-partial unique in supabase/migrations`)
    }
    /* ⚠️ AND THE ALLOWLIST IS ASSERTED TO BE STILL NEEDED, so it cannot rot into a lie: if someone
     * adds the missing migration, this goes red and the entry must be deleted. */
    const stillUnprovable = [...UNPROVABLE].filter(k => {
      const [tbl, cols] = k.split(':')
      return backedBy(tbl, cols.split(',')) === null
    })
    t('⚠️ …and both allowlisted sites are STILL unprovable here — the list has not rotted',
      stillUnprovable.length === UNPROVABLE.size)
    if (stillUnprovable.length !== UNPROVABLE.size) {
      console.log('      a migration now declares one of these — delete its allowlist entry:')
      for (const k of [...UNPROVABLE].filter(x => !stillUnprovable.includes(x))) console.log(`        • ${k}`)
    }
    console.log('\n  ⚠️  2 onConflict site(s) on tables created here whose UNIQUE is NOT in this repository')
    console.log('      (applied to the hosted database by hand — allowlisted by name, not skipped):')
    for (const k of [...UNPROVABLE].sort()) {
      const files = [...new Set(judged.filter(f => key(f) === k).map(f => f.file))]
      console.log(`        • ${k.replace(':', ' (')}) — ${files.join(', ') || 'no live call site'}`)
    }
    /* 🔴 AND THE ONE THAT BROKE IS ASSERTED BY NAME, so this section cannot pass by judging nothing. */
    t('🔴 …specifically event_item_prices (event_type_id, item_id), the call that threw 42P10',
      backedBy('event_item_prices', ['event_type_id', 'item_id']) !== null
      && backedBy('event_item_prices', ['event_id', 'item_id']) !== null)
    t('⛔ …and the two PARTIAL indexes it replaces are dropped, not merely superseded',
      /drop index if exists public\.event_item_prices_type_item_uidx/.test(allSql)
      && /drop index if exists public\.event_item_prices_event_item_uidx/.test(allSql))

    /* ── REPORTED, NOT JUDGED: every other table's onConflict ──────────────────────────────────── */
    const unjudged = found.filter(f => !f.table || !createdHere.has(f.table))
    console.log(`\n  ℹ️  ${unjudged.length} onConflict call site(s) on tables this repository does not create —`)
    console.log('      REPORTED AND NOT JUDGED (their DDL is not here to check against):')
    const byTable = new Map()
    for (const u of unjudged) {
      const k = `${u.table ?? '(table unreadable)'} (${u.cols.join(',')})`
      byTable.set(k, (byTable.get(k) || []).concat(u.file))
    }
    for (const [k, files] of [...byTable.entries()].sort()) {
      console.log(`        • ${k} — ${[...new Set(files)].join(', ')}`)
    }
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // 7c · 🔴 "SET EACH PRICE MYSELF" FREEZES WHAT WAS ALREADY BEING CHARGED
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  /**
   * **DOMINIC'S RULE:** *"when an event type is switched to 'Set each price myself', every item keeps
   * exactly the price it had just before the switch, under the old rule including its rounding. A
   * price only changes when the operator edits that item."*
   *
   * ⛔ WHAT MAKES THIS A MONEY CHECK RATHER THAN A SETTINGS ONE: the stored rounding was applying to
   * every untyped item in `'none'` mode with the control hidden on both screens, so simply clearing it
   * would have dropped a £14.00 item to £12.50 on a settings save. The lock-in writes the prices down
   * first. ⚠️ THE NUMBERS BELOW ARE THE BRIEF'S OWN.
   */
  head('7c · "Set each price myself" keeps the prices that were being charged')
  if (!LK || !P) {
    t('🔴 the lock-in module compiles', false)
  } else {
    const ITEMS = [
      { id: 'marg', name: 'Margherita', pricePence: 1250, categoryId: null },
      { id: 'pepp', name: 'Pepperoni', pricePence: 1100, categoryId: null },
    ]
    const OLD = LK.oldSetupOf('add_pct', 10, 'nearest_1')

    /* 🔴 THE BRIEF'S FIRST NUMBER. "+10%, nearest £1" on £12.50 is 1375 to the penny and £14 to the
     * pound — so the price the customer is being charged before the switch is £14.00. */
    t(`🔴 "+10%, nearest £1" charges £14.00 for a £12.50 item (${J(P.applyPriceRule(1250, OLD))}p)`,
      P.applyPriceRule(1250, OLD) === 1400)

    /* ⛔ THE DECISION. Switching this type to 'none' must lock in; the three ways it must NOT. */
    const ask = (o) => LK.shouldLockIn({ wasOn: true, willBeOn: true, oldMode: 'add_pct', oldRounding: 'nearest_1', newMode: 'none', ...o })
    t('🔴 a switch from a rule TO "Set each price myself" locks the prices in', ask({}) === true)
    t('⛔ …switching OUT of it does not, or the new rule would be dead on arrival (every item typed)',
      ask({ oldMode: 'none', oldRounding: 'none', newMode: 'add_pct' }) === false)
    t('⛔ …a type that is OFF does not, because it was charging menu prices anyway',
      ask({ wasOn: false }) === false)
    t('⛔ …and being turned OFF does not either', ask({ willBeOn: false }) === false)
    /* 🔴 §2 OF THE BRIEF: a type ALREADY in 'none' with a stale rounding is locked in the next time it
     * is saved — no migration, no backfill. */
    t('🔴 a type already in "none" with a stored rounding locks in on its NEXT save',
      ask({ oldMode: 'none', oldRounding: 'nearest_1', newMode: 'none' }) === true)
    /* ⚠️ AND IT SETTLES. After one lock-in the type is 'none' with rounding 'none', which moves no
     * price — so no later save locks in again, which is what lets §3's new items keep following the
     * menu price instead of being frozen by the next save of an unrelated setting. */
    t('⚠️ …and once locked in, a later save does NOT lock in again (it has settled)',
      ask({ oldMode: 'none', oldRounding: 'none', newMode: 'none' }) === false)

    /* 🔴 THE PRICES WRITTEN DOWN. £12.50 → £14.00; a typed £11.00 is left exactly as it is. */
    const frozen = LK.lockedInPrices(ITEMS, OLD, { pepp: 11 })
    t(`🔴 the untyped item is written down at the £14.00 it was charging (${J(frozen)})`,
      frozen.length === 1 && frozen[0].itemId === 'marg' && frozen[0].price === 14)
    t('⛔ …and the item that already had its own £11.00 is NOT touched',
      !frozen.some(f => f.itemId === 'pepp'))

    /* 🔴 THE WHOLE POINT, END TO END: what the customer is charged before and after, to the penny. */
    const NEW = { mode: 'none', amount: null, rounding: 'none', typed: { marg: 14, pepp: 11 } }
    t(`🔴 AFTER THE SWITCH THE £12.50 ITEM IS STILL £14.00 (${P.priceForItem(1250, NEW, 'marg')}p) — and it is now a typed price`,
      P.priceForItem(1250, NEW, 'marg') === 1400)
    t(`🔴 …and the typed £11.00 item is still £11.00 (${P.priceForItem(1100, NEW, 'pepp')}p)`,
      P.priceForItem(1100, NEW, 'pepp') === 1100)

    /* ⚠️ EDITING ONE ITEM CHANGES ONLY THAT ITEM — the second half of Dominic's rule. */
    const EDITED = { ...NEW, typed: { ...NEW.typed, marg: 13.5 } }
    t('⚠️ editing one item changes only that item (£14.00 → £13.50, Pepperoni untouched at £11.00)',
      P.priceForItem(1250, EDITED, 'marg') === 1350 && P.priceForItem(1100, EDITED, 'pepp') === 1100)

    /* 🔴 §3 · AN ITEM ADDED AFTER THE SWITCH has no typed price, and the rounding is gone, so it
     * charges its menu price. ⛔ THIS IS WHY THE "has it settled" CLAUSE ABOVE MATTERS: a lock-in that
     * ran on every save would freeze this dish at its menu price the next time anything was saved. */
    t(`🔴 a dish added AFTER the switch charges its menu price (£9.99 → ${P.priceForItem(999, NEW, 'newdish')}p)`,
      P.priceForItem(999, NEW, 'newdish') === 999)

    /* 🔴 §2 · AND A TYPE ALREADY IN 'none' WITH A STORED ROUNDING CHARGES WHAT IT CHARGES TODAY until
     * it is saved. ⛔ THE ARITHMETIC IS DELIBERATELY UNCHANGED, which is what this asserts: £12.50 with
     * rounding 'nearest_1' and no rule is still £13.00 today. */
    const STALE = { mode: 'none', amount: null, rounding: 'nearest_1', typed: {} }
    t(`🔴 an un-saved type already in "none" with a rounding still rounds, exactly as today (£12.50 → ${P.priceForItem(1250, STALE, 'marg')}p)`,
      P.priceForItem(1250, STALE, 'marg') === 1300)
    /* ⚠️ …AND AFTER ITS NEXT SAVE IT IS UNCHANGED: the lock-in writes £13.00 down, then the rounding
     * goes, and £13.00 is what it goes on charging. */
    const staleFrozen = LK.lockedInPrices(ITEMS, LK.oldSetupOf('none', null, 'nearest_1'), {})
    const SETTLED = { mode: 'none', amount: null, rounding: 'none', typed: Object.fromEntries(staleFrozen.map(x => [x.itemId, x.price])) }
    t(`⚠️ …and after that save it charges the SAME £13.00 (${P.priceForItem(1250, SETTLED, 'marg')}p)`,
      P.priceForItem(1250, SETTLED, 'marg') === 1300)

    /* ══ ⛔ THE CONTROL — THE LOCK-IN IS SKIPPED AND THE DROP IS CAUGHT ═══════════════════════════
     * 🔴 THIS IS THE FAULT THE WHOLE SECTION EXISTS TO PREVENT, reproduced: the rounding is cleared
     * with no prices written down, and the £14.00 item falls to £12.50. ⚠️ MEASURED, NOT ARGUED — a
     * check that only asserted the good path would pass just as happily against a lock-in that never
     * ran. */
    const SKIPPED = { mode: 'none', amount: null, rounding: 'none', typed: {} }
    const dropped = P.priceForItem(1250, SKIPPED, 'marg')
    t(`⛔ CONTROL: with the lock-in skipped the £14.00 item drops to £${(dropped / 100).toFixed(2)} — so "prices are kept" is a measurement`,
      dropped === 1250)

    /* ══ 🔴 AND THE ROUTE DOES IT IN THE RIGHT ORDER ═════════════════════════════════════════════
     * ⛔ THE ORDER IS THE LOAD-BEARING PART AND NO UNIT CHECK ABOVE CAN SEE IT: the prices must be
     * written BEFORE the patch clears the rounding, in the same save. Clearing first and failing on
     * the freeze would leave a type with no rule and no prices — the one outcome worse than either
     * half. ⚠️ SO THIS READS THE ROUTE'S OWN TEXT for the sequence, with the comments stripped. */
    const route = codeOf(fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8'))
    const iDecide = route.indexOf('shouldLockIn({')
    const iFreeze = route.indexOf('lockedInPrices(')
    const iWrite = route.indexOf("patch.price_rounding = 'none'")
    /* ⚠️ SEARCHED **FROM** THE CLEAR, NOT FROM THE TOP OF THE FILE. The service-settings save earlier
     * in this route also updates `event_types` with a local called `patch`, so a bare `indexOf` finds
     * that one and the ordering reads as violated on correct code — which is what it did. The claim is
     * about THIS save's update, and that is the one after the clear. */
    const iUpdate = iWrite < 0 ? -1 : route.indexOf(".from('event_types').update(patch)", iWrite)
    t('🔴 the route decides, freezes, THEN clears the rounding, and only then writes the patch',
      iDecide > 0 && iFreeze > iDecide && iWrite > iFreeze && iUpdate > iWrite)
    /* ⛔ AND A FAILED FREEZE STOPS THE SAVE. Without this the rounding would be cleared anyway. */
    t('⛔ …and if the freeze fails, nothing is saved',
      /if \(freezeErr\) return NextResponse\.json\(\{ error: freezeErr\.message \}, \{ status: 400 \}\)/.test(route))
    /* ⚠️ THE CLIENT CANNOT ASK TO KEEP THE ROUNDING: the patch's values are overridden, not defaulted. */
    t('⚠️ …and the amount and rounding are OVERRIDDEN, not merely defaulted',
      /patch\.price_amount = null/.test(route) && /patch\.price_rounding = 'none'/.test(route))
    /* 🔴 THE FREEZE IS AN INSERT-IF-ABSENT, so a race cannot overwrite the operator's own number. */
    t('🔴 …and an item that already has its own price is protected by the DATABASE too (ignoreDuplicates)',
      /ignoreDuplicates: true/.test(route))
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // 8 · 🔴 VARIANTS — EVERY CHECK ABOVE IS SHOWN TO NOTICE ITS OWN REGRESSION
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · VARIANTS — each must FAIL')
  let vPass = 0, vFail = 0
  const must = (label, detected) => {
    if (detected) { vPass++; console.log('  ✓ FAILED as required  ' + label) }
    else { vFail++; fail++; console.log('  🔴 MUST FAIL BUT PASSED  ' + label) }
  }
  {
    /* ⚠️ NO `priceSrc` READ HERE. The first draft read price.ts to check each needle existed before
     * building a variant — `buildVariant` does that itself and returns null, which is the one place
     * it can be true at the moment the copy is made. Two guards, one of them stale, is worse. */
    const patchDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ep-var-'))
    /** Build a variant tree with one file replaced, in memory-ish (a temp worktree copy). */
    const buildVariant = (file, from, to, tag) => {
      const src = fs.readFileSync(path.join(REPO, file), 'utf8')
      /* ══ ⛔ AN ABSENT ANCHOR IS A **FAILURE**, NOT A SILENT NULL (5 October 2026) ══════════════════
       * It returned `null`, and every caller scores `!V` as "detected" — so a variant whose anchor had
       * drifted out of the file reported ✓ FAILED AS REQUIRED while mutating nothing. That is the
       * failure mode this repository has now met three times, and it bit here: removing the
       * whole-event `price_own` rule took V8's and V9's anchors with it and both kept passing.
       * 🔴 THROWING IS THE ONLY SAFE ANSWER. A variant that cannot produce the symptom it names is not
       * a variant, and the harness must say so rather than count it. */
      if (!src.includes(from)) {
        throw new Error(`variant ${tag}: the anchor has drifted out of ${file} — re-aim it or delete it:\n    ${from.slice(0, 120)}`)
      }
      const root = path.join(patchDir, tag)
      /* ⚠️ A COPY OF THE REPO'S lib ONLY — enough for these four modules and their imports. */
      for (const f of LIB) {
        const dst = path.join(root, f)
        fs.mkdirSync(path.dirname(dst), { recursive: true })
        fs.writeFileSync(dst, f === file ? src.replace(from, to) : fs.readFileSync(path.join(REPO, f), 'utf8'))
      }
      /* 🔴 `node_modules` IN THE VARIANT **ROOT**, NOT ONLY IN THE OUTPUT. `read.ts` and
       * `order-repricing.ts` both import `@supabase/supabase-js` for its TYPES, so without this every
       * variant fails to COMPILE with TS2307 — and a compile failure is scored as "detected", which
       * would make all fourteen variants pass for entirely the wrong reason. The harness reported it
       * as a compile error rather than hiding it, which is why this is here. */
      try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules')) } catch { /* ok */ }
      fs.mkdirSync(path.join(root, 'lib/payments'), { recursive: true })
      try { fs.symlinkSync(path.join(REPO, 'tsconfig.json'), path.join(root, 'tsconfig.json')) } catch { /* ok */ }
      try { return build(root, LIB, tag) } catch { return null }
    }

    /* V1 — the pounds⇄pence boundary TRUNCATES instead of rounding, which is the float trap this
     * module's header is written about: `11.50 * 100` is 1149.9999999999998 in a double, so a penny is
     * lost on a price the operator typed exactly.
     * ⚠️ RE-TARGETED ONCE. The first form of this variant moved the PERCENTAGE into pounds, and the
     * tally reported it as wrongly passing — correctly, because for that probe the two expressions
     * happen to agree to the penny. A variant that cannot produce the symptom it names is not a
     * variant. The boundary is where the error actually lives. */
    {
      const V = buildVariant('lib/event-pricing/price.ts',
        'return n <= 0 ? 0 : Math.round(n * 100)',
        'return n <= 0 ? 0 : Math.trunc(n * 100)', 'v1')
      /* ⚠️ THE PROBE VALUE MATTERS, AND 11.50 IS THE WRONG ONE: `11.50 * 100` happens to be EXACTLY
       * 1150 in a double, so truncating it loses nothing and this variant wrongly passed. The values
       * that actually drift are 1.15 (114.99999999999999), 2.30 (229.99999999999997) and 8.70
       * (869.9999999999999) — which is precisely why a "round, do not truncate" boundary is needed and
       * why a table of round numbers would never have found it. */
      const detected = !V || !V.price
        || V.price.toPence(1.15) !== 115
        || V.price.toPence(2.30) !== 230
        || V.price.applyPriceRule(V.price.toPence(1.15), setup({ mode: 'add_pct', amount: 100 })) !== 230
      must('V1 🔴 the pounds⇄pence boundary truncates, so £11.50 becomes 1149p', detected)
    }
    // V2 — rounding is allowed to make a non-zero price free
    {
      const V = buildVariant('lib/event-pricing/price.ts',
        'return rounded === 0 ? out : rounded', 'return rounded', 'v2')
      const detected = !V || !V.price
        || V.price.applyPriceRule(40, setup({ mode: 'sub_pct', amount: 10, rounding: 'nearest_1' })) !== 36
      must('V2 🔴 rounding turns a 36p price into free food', detected)
    }
    // V3 — "nearest £1" rounds halves DOWN
    {
      const V = buildVariant('lib/event-pricing/price.ts',
        'Math.floor((pence + 50) / 100) * 100', 'Math.floor((pence + 49) / 100) * 100', 'v3')
      const detected = !V || !V.price
        || V.price.applyPriceRule(1150, setup({ rounding: 'nearest_1' })) !== 1200
      must('V3 🔴 £11.50 rounds DOWN to £11 instead of up to £12', detected)
    }
    // V4 — a £0 menu item is allowed to be priced by the rule
    {
      const V = buildVariant('lib/event-pricing/price.ts',
        '  if (base === 0) return 0\n', '', 'v4')
      const detected = !V || !V.price
        || V.price.applyPriceRule(0, setup({ mode: 'add_gbp', amount: 1 })) !== 0
      must('V4 🔴 a free item starts being charged for under "+£1"', detected)
    }
    // V5 — a typed price goes through the rounding
    {
      const V = buildVariant('lib/event-pricing/price.ts',
        'if (typed !== null && typed !== undefined) return Math.max(0, toPence(typed))',
        'if (typed !== null && typed !== undefined) return applyPriceRule(toPence(typed), setup)', 'v5')
      const detected = !V || !V.price
        || V.price.priceForItem(1000, setup({ rounding: 'up_1', typed: { x: 7.45 } }), 'x') !== 745
      must('V5 🔴 a typed £7.45 is rounded up to £8 — the number typed is not the number charged', detected)
    }
    // V6 — the price can go negative
    {
      const V = buildVariant('lib/event-pricing/price.ts',
        '  out = Math.max(0, out)\n', '', 'v6')
      const detected = !V || !V.price
        || V.price.applyPriceRule(150, setup({ mode: 'sub_gbp', amount: 2 })) !== 0
      must('V6 🔴 £1.50 − £2 becomes −£0.50, which would subtract money from the bill', detected)
    }
    // V7 — `||` instead of `??` on a typed price, so £0 is lost
    {
      const V = buildVariant('lib/event-pricing/price.ts',
        'if (typed !== null && typed !== undefined) return Math.max(0, toPence(typed))',
        'if (typed) return Math.max(0, toPence(typed))', 'v7')
      const detected = !V || !V.price
        || V.price.priceForItem(1000, setup({ mode: 'add_pct', amount: 10, typed: { x: 0 } }), 'x') !== 0
      must('V7 🔴 a typed price of £0 is read as unset, so a free item is charged the rule', detected)
    }
    /* V8 — RE-AIMED 5 October 2026, AND THE OLD ONE IS WHY `buildVariant` NOW THROWS. It mutated
     * `if (event?.price_own === true) …` inside `resolvePricing`, which this build deleted — so the
     * anchor vanished, `buildVariant` returned null, and the variant reported ✓ while mutating
     * nothing. It now puts back the defect the NEW rule can have: an event price bleeding onto every
     * OTHER item instead of only its own. */
    {
      const V = buildVariant('lib/event-pricing/price.ts',
        "    const own = p.eventTyped[itemId]",
        "    const own = p.eventTyped[itemId] ?? Object.values(p.eventTyped)[0]", 'v8')
      const detected = !V || !V.price
        || V.price.priceAtEvent(1000, 'other',
          V.price.resolveEventPricing({ x: 3 },
            { price_change_on: true, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none' }, {})).pence !== 1100
      must('V8 🔴 one item’s event price bleeds onto every other item', detected)
    }
    // V9 — the switch is ignored, so a type with its switch OFF still prices
    {
      const V = buildVariant('lib/event-pricing/price.ts',
        "typeSetup: type?.price_change_on === true ? setupFrom(type, typeTyped) : null,",
        "typeSetup: type ? setupFrom(type, typeTyped) : null,", 'v9')
      const detected = !V || !V.price
        || V.price.resolveEventPricing({},
          { price_change_on: false, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none' }, {}).typeSetup !== null
      must('V9 🔴 "Change prices" OFF still charges the saved rule', detected)
    }
    /* V15 — NEW (5 October 2026). The basis is taken from WHICH BRANCH WON rather than from whether
     * the number MOVED, so an event price equal to the menu price stamps an order line — which is the
     * byte-identity promise broken. */
    {
      const V = buildVariant('lib/event-pricing/price.ts',
        "      return { pence, basis: pence === menuPence ? null : 'event' }",
        "      return { pence, basis: 'event' }", 'v15')
      const detected = !V || !V.price
        || V.price.priceAtEvent(1000, 'x', V.price.resolveEventPricing({ x: 10 }, null, {})).basis !== null
      must('V15 🔴 an event price EQUAL to the menu price still stamps the order line', detected)
    }
    // V10 — the event-aware book stamps every line, not only the moved ones
    {
      /* ⚠️ THE ANCHOR MOVED (5 October 2026). The loop used to compare `chargedPence` with the menu
       * price itself; it now asks `priceAtEvent` for the basis, which is null exactly when nothing
       * moved. Same property, one fewer copy of the test — and the mutation is the same defect. */
      const V = buildVariant('lib/event-pricing/read.ts',
        'if (basis === null) continue',
        'if (false) continue', 'v10')
      /* ⚠️ THE FIXTURE HAS TO REACH THE LOOP. With no pricing at all the function returns EARLY —
       * that early return IS the identity proof — so the mutated line was never executed and this
       * variant wrongly passed, which the tally reported. A switch that is ON but changes nothing is
       * the case that walks every item and stamps none of them. */
      const detected = await (async () => {
        if (!V || !V.read) return true
        const inertFix = withType({ price_change_on: true, price_mode: 'none', price_amount: null, price_rounding: 'none' })
        const b = await V.read.loadEventPriceBook(stub(inertFix), TRUCK, EVENT_A)
        return Object.keys(b.menuPrice).length !== 0 || Object.keys(b.basisByName).length !== 0
      })()
      must('V10 🔴 an order under an inert rule gains menu_price / price_basis on every line', detected)
    }
    /* V11 — a failed read reports `ok: true`.
     * ⚠️ RE-TARGETED. The first form made the error branch THROW, and the variant wrongly passed
     * because that branch sits inside `readEventPricing`'s own try/catch — the throw was caught and the
     * answer was fail-open anyway. That is a good property of the code and a useless mutation, and the
     * tally said so.
     * 🔴 THE PROPERTY THAT CAN ACTUALLY BREAK IS `ok`. The PRICE is fail-open whatever happens; what
     * `ok` decides is whether the dashboard OFFERS the prices sheet (`pricesReady`). Report true on a
     * database with no pricing columns and the operator gets a sheet whose Save answers 400. */
    {
      const V = buildVariant('lib/event-pricing/read.ts',
        'return { ...NO_EVENT_PRICING, ok: false }',
        'return NO_EVENT_PRICING', 'v11')
      const detected = await (async () => {
        if (!V || !V.read) return true
        const r = await V.read.readEventPricing(stub(baseFixture(), { fail: ['truck_events'] }), EVENT_A)
        /* ⚠️ `!== false`, NOT `=== false`. `detected` means "the mutant BROKE the property"; the
         * un-mutated answer is `ok: false`, so writing the expectation here was the same inversion
         * V14's first form had. The tally caught both. */
        return r.ok !== false
      })()
      must('V11 🔴 a failed read reports ok:true, so the screens offer a sheet whose save will 400', detected)
    }
    // V12 — the stamper keys on the identity without the queue, so duplicates share one audit field
    {
      const V = buildVariant('lib/event-pricing/read.ts',
        'return q && q.length ? q.shift() : undefined',
        'return q && q.length ? q[0] : undefined', 'v12')
      const detected = await (async () => {
        if (!V || !V.read) return true
        const f = withType({ price_change_on: true, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none' })
        const evb = await V.read.loadEventPriceBook(stub(f), TRUCK, EVENT_A)
        const storedDup = { items: [
          { name: 'Margherita', quantity: 1, unit_price: 9, menu_price: 8, price_basis: 'event' },
          { name: 'Margherita', quantity: 1, unit_price: 12, menu_price: 11, price_basis: 'event_type' },
        ] }
        const priced = NOW.repricing.repriceOrder(
          [{ name: 'Margherita', quantity: 1, unit_price: 0 }, { name: 'Margherita', quantity: 1, unit_price: 0 }],
          null, evb.book, storedDup, null)
        const out = V.read.stampEditedLines(priced.items, storedDup.items, evb.menuPrice, evb.basisByName)
        return !(out[0].menu_price === 8 && out[1].menu_price === 11)
      })()
      must('V12 🔴 two lines sharing a name get the SAME menu_price, so one order line is mislabelled', detected)
    }
    // V13 — loadPricingItems gains an availability filter, so a sold-out dish stops being priceable
    {
      const V = buildVariant('lib/event-pricing/read.ts',
        "      .eq('truck_id', truckId)\n      .order('name')",
        "      .eq('truck_id', truckId)\n      .eq('is_available', true)\n      .order('name')", 'v13')
      const detected = await (async () => {
        if (!V || !V.read) return true
        const soldOut = baseFixture()
        soldOut.menu_items_db = soldOut.menu_items_db.map(r =>
          r.name === 'Margherita' ? { ...r, is_available: false } : r)
        const f = { ...withType({ price_change_on: true, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none' }), menu_items_db: soldOut.menu_items_db }
        const b = await V.read.loadEventPriceBook(stub(f), TRUCK, EVENT_A)
        /* The item is still in `loadPriceBook`'s book (that function is untouched), so the symptom is
         * that it stops being RE-PRICED — the event price never reaches it. */
        return b.menuPrice['Margherita'] === undefined
      })()
      must('V13 🔴 an availability filter is added, so a sold-out dish is left at the MENU price mid-event', detected)
    }
    // V14 — the ambiguity guard answers "no change" whatever the candidates say
    {
      const V = buildVariant('lib/event-pricing/read.ts',
        'if (pricingDiffersFromMenu(pricing.resolved, items)) return true',
        'if (false) return true', 'v14')
      const detected = await (async () => {
        if (!V || !V.read) return true
        const bOnly = baseFixture()
        bOnly.truck_events = [{ id: EVENT_B, price_own: true, price_mode: 'sub_pct', price_amount: 50, price_rounding: 'none', event_type_id: null, event_types: null }]
        /* ⚠️ THE PROBE WAS INVERTED IN ITS FIRST FORM, and the tally caught it. The REAL function
         * answers `true` here (refuse); the mutant answers `false` (price against a guess). So the
         * regression is detected when the answer is NOT `true`. */
        return (await V.read.candidatesChangePrices(stub(bOnly), TRUCK, [EVENT_B])) !== true
      })()
      must('V14 🔴 an ambiguous event with event pricing is priced against a GUESS instead of refused', detected)
    }
    try { fs.rmSync(patchDir, { recursive: true, force: true }) } catch { /* ok */ }
  }

  console.log(`\n  ${vPass + vFail} variants · ${vPass} failed as required · ${vFail} wrongly passed`)
  console.log(`\n${fail === 0 ? '✅ all ' + pass + ' passed' : '🔴 ' + fail + ' CHECK(S) FAILED'}`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('🔴 HARNESS THREW:', e); process.exit(1) })
