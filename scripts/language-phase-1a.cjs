#!/usr/bin/env node
// scripts/language-phase-1a.cjs — Language Phase 1a (docs/language-phase-1a-report.md): every customer-facing word
// moves into messages/en-GB.json with NO visible change, for GB and for US (messages/en-US.json stays {}).
//
//   node scripts/language-phase-1a.cjs                    compare against the committed BEFORE snapshot
//   node scripts/language-phase-1a.cjs --capture <file>   snapshot the current code's answers (gzipped JSON)
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// BEFORE was captured on ed1d4c2 (HEAD = origin/main, clean tree) before any edit of this phase. It holds, for a
// GB and a US fixture of each:
//   1. the customer order page in ~40 states, as full HTML (menu, deals, basket, item and deal pickers, tip block,
//      card and pay-at-the-truck, every notice, sold-out and refusals, pre-order, set-up pending, paused, closed,
//      ended, errors, slots, the in-page confirmation and the ?confirm= receipt);
//   2. the status page in every order status, payment state and cancel state;
//   3. the private-link page in every outcome;
//   4. the shared pieces: charge lines, sold-out sentences, pre-order labels, phone sentences, modifier hints,
//      the stock badge, spice level, allergen chips, ChargeRows and the deals picker;
//   5. every customer email — the confirmation in every payment state, the refund and cancellation senders, the
//      event cancellation, the payment note boxes, and the three customer emails the operator routes send
//      (cancelled by the truck, edited, rejected) — subject, HTML and text;
//   6. the fixed WhatsApp replies to customers;
//   7. every customer-facing API error this fixture set reaches (orders/submit, orders/cancel, orders/[id], menu,
//      slots) and the payment-return redirects and JSON.
// AFTER: byte-identical, apart from two NAMED DIFFERENCES, each proven to be the only change where it applies:
//   1. the ?payment_failed= URL carries a CODE (and its values), not a sentence — the page shows the same words;
//   2. every customer-facing API error body gains "code" and "params"; "error" and every other field unchanged.

const fs = require('fs'); const path = require('path'); const zlib = require('zlib')
const kit = require('./_render-kit.cjs')({ cacheTag: 'language-phase-1a' })
const { makeFakePg } = require('./_fake-pg.cjs')
const { REPO } = kit
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/language-phase-1a-before.json.gz'
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const AFTER_CODE = fs.existsSync(path.join(REPO, 'lib/i18n/customer-errors.ts'))
const NOW = '2026-10-09T15:00:00.000Z'

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 700)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)
const h = kit.h

// ══ the two fixture countries ═══════════════════════════════════════════════════════════════════════════════
const C = {
  GB: { fmt: { currency: 'GBP', locale: 'en-GB' }, country: 'GB', settings: SEEDS.gbFromSeed(),
    phone: (() => { const c = SEEDS.phoneCopyFromMigration().GB; return { phoneCountry: 'GB', short_name: c.shortName, phone_example: c.phoneExample, phoneCheck: SEEDS.phoneCheckDefault() } })(),
    time: { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' } },
  US: { fmt: { currency: 'USD', locale: 'en-US' }, country: 'US', settings: { ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 0, proMonthlyMinor: 3900, maxMonthlyMinor: 6900, proAllowanceMinor: 200000, maxAllowanceMinor: 300000, platformFeePct: 0.99 },
    phone: { phoneCountry: 'US', short_name: 'US', phone_example: '(201) 555-0123', phoneCheck: 'length' },
    time: { timeZone: 'America/Chicago', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' } },
}
const US_CHECKOUT = { pricesIncludeTax: false, taxLabel: 'Sales tax', taxRateMilli: 8250, tipping: { presetsBps: [1000, 1500, 2000] }, serviceFee: { bps: 300, fixedMinor: 30, recipient: 'truck' }, feesTaxed: false }
const US_SNAPSHOT = { food_minor: 2400, tax_minor: 198, tax_rate_milli: 8250, tax_inclusive: false, tax_label: 'Sales tax', tip_minor: 360, tip_pct_bps: 1500, service_fee_minor: 102, service_fee_recipient: 'truck', card_surcharge_minor: 0 }

const ITEMS = [
  { name: 'Margherita', quantity: 2, unit_price: 10.75, base_price: 9.5, modifiers: [{ name: 'Extra cheese', price: 1.25 }] },
  { name: 'Garlic bread', quantity: 1, unit_price: 4, modifiers: [] },
  { name: 'Coke', quantity: 1, unit_price: 1.8, modifiers: [], specialInstructions: 'No ice' },
]
const DEALS = [{ name: 'Lunch deal', price: 12, slots: { Pizza: 'Pepperoni', Drink: 'Fanta' }, slotModifiers: { Pizza: [{ name: 'Jalapeños', price: 0.75 }] }, slotNotes: {} }]

// ══ 1 · the order page ═══════════════════════════════════════════════════════════════════════════════════════
const OP_STATES = ['truck', 'menu', 'events', 'event', 'eventLoading', 'noEvents', 'eventsError', 'loading', 'error', 'pauseNotice', 'stockNotice',
  'menuChangedNotice', 'soldOutNotice', 'paymentFailedNotice', 'payment', 'payStage', 'payError', 'stageOpen', 'eventEnded', 'submitting', 'submitted',
  'payByCard', 'tipSel', 'tipOther', 'submittedCharges', 'submittedTotal', 'cardFallbackNotice', 'submittedOrderId', 'submittedAutoAccepted',
  'submittedConfirmedSlot', 'submittedRequestedSlot', 'submittedSlotChanged', 'submittedAsapEstimate', 'formSheetOpen', 'basket', 'appliedDeals',
  'dealModalOpen', 'selectedBundleForModal', 'itemModal', 'modalMods', 'modalNotes', 'modalUpsells', 'appliedCode', 'name', 'email', 'phone', 'availableSlots',
  'loadingSlots', 'asapChosen', 'confirmOrder', 'confirmLoading', 'confirmError', 'privateHeader', 'showAllergenModal', 'summaryExpanded',
  'sheetSummaryExpanded', 'slotHour', 'slotMinute']
function opFixtures(cc) {
  const c = C[cc]
  const groupReq = { id: 'g1', name: 'Size', min_choices: 1, max_choices: 1, is_required: true, options: [{ id: 'o1', name: 'Large', price_adjustment: 2, stock_count: 2 }, { id: 'o2', name: 'Small', price_adjustment: 0, stock_count: 0 }, { id: 'o5', name: 'Medium', price_adjustment: 1, available: false }] }
  const groupOpt = { id: 'g2', name: 'Extras', min_choices: 0, max_choices: 3, options: [{ id: 'o3', name: 'Extra cheese', price_adjustment: 1.25 }, { id: 'o4', name: 'Jalapeños', price_adjustment: 0.75 }] }
  const items = [
    { id: 'i1', name: 'Margherita', price: 9.5, category: 'Pizzas', available: true, description: 'Tomato, mozzarella, basil', allergens: ['Gluten', 'Dairy'], dietary: ['Vegetarian'], spiciness: 1, modifierGroups: [groupReq, groupOpt], stock_remaining: 2, item_remaining: 5 },
    { id: 'i2', name: 'Pepperoni', price: 11, category: 'Pizzas', available: true, modifierGroups: [], preorderLabel: 'Pre-order by 16:30, Sat 10 Oct', preorderState: 'before' },
    { id: 'i3', name: 'Garlic bread', price: 4, category: 'Sides', available: false, modifierGroups: [] },
    { id: 'i4', name: 'Coke', price: 1.8, category: 'Drinks', available: true, modifierGroups: [], stock_remaining: 1, category_remaining: 9, stock_bound: 'category' },
    { id: 'i5', name: 'Fanta', price: 1.8, category: 'Drinks', available: true, modifierGroups: [] },
  ]
  const bundle = { id: 'b1', name: 'Lunch deal', description: 'Any pizza and a drink', bundle_price: 12, original_price: 14.3, available: true, start_time: null, end_time: null,
    slot_1_category: 'Pizzas', slot_2_category: 'Drinks', slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null }
  const menu = { categories: [{ id: 'c1', name: 'Pizzas', allowNotes: true }, { id: 'c2', name: 'Sides' }, { id: 'c3', name: 'Drinks' }], items, upsell_rules: [], bundles: [bundle], codes: [{ code: 'TENOFF', type: 'fixed', value: 2.5, active: true }],
    }
  const truck = (over = {}) => ({ id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
    ordering_available: true, card_payments_ready: true, allergen_info_text: 'Contains: Gluten, Dairy.', allergen_display_mode: 'both', allergensVerified: true, money: c.fmt, phone: c.phone, time: c.time, ...(cc === 'US' ? { checkout: US_CHECKOUT } : {}), ...over })
  const event = (over = {}) => ({ id: 'ev-1', date: '09/10/2026', date_iso: '2026-10-09', date_friendly: 'Friday 9 October', start_time: '17:00', end_time: '21:00', venue_name: 'The Green', village: 'Harnessville', notes: 'By the pond', status: 'open', collection_interval_mins: 10, ...over })
  const it = n => items.find(i => i.name === n)
  const basket = [
    { menuItem: it('Margherita'), quantity: 2, modifiers: [{ name: 'Large', price: 2 }, { name: 'Extra cheese', price: 1.25 }], specialInstructions: 'Well done', cartKey: 'k1' },
    { menuItem: it('Coke'), quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k2' },
    { menuItem: it('Pepperoni'), quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k3' },
    { menuItem: it('Fanta'), quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k4' },
  ]
  const deals = [{ bundle, slots: { Pizzas: 'Pepperoni', Drinks: 'Fanta' }, itemsTakenFromBasket: ['k3', 'k4'], modifierExtra: 0, slotModifiers: {}, slotNotes: {} }]
  const base = { truck: truck(), menu, events: [event()], event: event(), eventLoading: false, loading: false }
  const withBasket = { ...base, basket, appliedDeals: deals }
  const sheet = { ...withBasket, formSheetOpen: true, name: 'Sam', email: 'sam@example.test', phone: '', summaryExpanded: true, sheetSummaryExpanded: true }
  const payment = { clientSecret: 'harness', fingerprint: 'f', stripeAccount: 'acct_harness', orderKey: 'k', totalPence: 4140 }
  const charges = cc === 'US' ? US_SNAPSHOT : null
  const submitted = { ...withBasket, submitted: true, submittedOrderId: '40', email: 'sam@example.test', submittedCharges: charges, submittedTotal: 30.6 }
  const order = (over = {}) => ({ id: '41', status: 'confirmed', slot: '18:30', items: ITEMS, deals: DEALS, total: 43.9, payment_status: 'unpaid', truck_name: 'Pizza Kitchen', truck_logo: null,
    requested_slot: null, asap_estimate: null, money: c.fmt, ...(charges ? { charges } : {}), ...over })
  return {
    loading: { loading: true },
    loadError: { loading: false, error: 'Truck not found' },
    noEvents: { ...base, events: [], event: null, noEvents: true },
    eventsError: { ...base, events: [], event: null, eventsError: true },
    eventLoading: { ...base, eventLoading: true },
    menu: base,
    menuAllergens: { ...base, showAllergenModal: true },
    menuPaused: { ...base, truck: truck({ paused: true, pauseReason: 'manual' }) },
    menuOffline: { ...base, truck: truck({ paused: true, pauseReason: 'offline' }) },
    menuClosing: { ...base, truck: truck({ paused: true, pauseReason: 'account_closing' }) },
    menuUnavailable: { ...base, truck: truck({ ordering_available: false }) },
    menuNoTimes: { ...base, event: event({ start_time: null, end_time: null }), events: [event({ start_time: null, end_time: null })] },
    menuClosed: { ...base, event: event({ status: 'closed' }), events: [event({ status: 'closed' })] },
    menuUnconfirmed: { ...base, event: event({ status: 'confirmed' }), events: [event({ status: 'confirmed' })] },
    menuEnded: { ...base, eventEnded: true },
    menuPrivate: { ...base, privateHeader: { name: 'Sam & Tom’s wedding', named: true } },
    multiEvent: { ...base, event: null, events: [event(), event({ id: 'ev-2', date: '10/10/2026', date_iso: '2026-10-10', date_friendly: 'Saturday 10 October', venue_name: 'The Market' })] },
    basket: withBasket,
    basketExpanded: { ...withBasket, summaryExpanded: true },
    discounted: { ...withBasket, appliedCode: menu.codes[0], summaryExpanded: true },
    itemModal: { ...withBasket, itemModal: { item: it('Margherita'), modGroups: it('Margherita').modifierGroups, upsells: [it('Garlic bread')] }, modalMods: [{ name: 'Large', price: 2 }], modalNotes: 'Crispy' },
    itemModalEmpty: { ...withBasket, itemModal: { item: it('Margherita'), modGroups: it('Margherita').modifierGroups, upsells: [] }, modalMods: [] },
    dealModal: { ...withBasket, dealModalOpen: true, selectedBundleForModal: bundle },
    sheet,
    sheetCard: { ...sheet, payByCard: true },
    sheetHatch: { ...sheet, payByCard: false },
    sheetTip15: { ...sheet, payByCard: true, tipSel: 1500 },
    sheetTipOther: { ...sheet, payByCard: true, tipSel: 'other', tipOther: '999' },
    sheetNoCard: { ...sheet, truck: truck({ card_payments_ready: false }) },
    sheetSlots: { ...sheet, asapChosen: false, availableSlots: [{ collection_time: '17:00', available: true, remaining: 3, is_past: false, too_soon: false, is_grace: false }, { collection_time: '17:10', available: false, remaining: 0, is_past: false, too_soon: false, is_grace: false }, { collection_time: '17:20', available: true, remaining: 1, is_past: false, too_soon: false, is_grace: false }], slotHour: '18', slotMinute: '00' },
    sheetSlotsLoading: { ...sheet, asapChosen: false, loadingSlots: true },
    sheetPhone: { ...sheet, phone: '123' },
    notices: { ...sheet, pauseNotice: 'Orders are currently paused', stockNotice: 'only 1 Coke', menuChangedNotice: 'The menu has changed — please check your order before placing it.', soldOutNotice: 'Pepperoni and Fanta sold out while you were ordering. We’ve removed them — please check your order before placing it again.', cardFallbackNotice: true },
    paymentFailed: { ...sheet, paymentFailedNotice: 'Sorry — we could not place your order. No money has been taken.' },
    submitting: { ...sheet, submitting: true },
    payReady: { ...sheet, payByCard: true, stageOpen: true, payment, payStage: 'ready' },
    payFailed: { ...sheet, payByCard: true, stageOpen: true, payment, payStage: 'failed', payError: 'Your card was declined.' },
    payProcessing: { ...sheet, payByCard: true, stageOpen: true, payment, payStage: 'processing' },
    submitted,
    submittedAuto: { ...submitted, submittedAutoAccepted: true, submittedConfirmedSlot: '18:30' },
    submittedChanged: { ...submitted, submittedAutoAccepted: true, submittedConfirmedSlot: '18:40', submittedRequestedSlot: '18:30', submittedSlotChanged: true },
    submittedAsap: { ...submitted, submittedAsapEstimate: '18:25' },
    submittedPreferred: { ...submitted, submittedRequestedSlot: '18:30' },
    confirmLoading: { ...base, confirmLoading: true, __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    confirmError: { ...base, confirmLoading: false, confirmError: 'Order not found', __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    confirmPaid: { ...base, confirmLoading: false, confirmOrder: order({ payment_status: 'paid' }), __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    confirmPending: { ...base, confirmLoading: false, confirmOrder: order({ status: 'pending', slot: null, requested_slot: '18:30' }), __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    confirmAsap: { ...base, confirmLoading: false, confirmOrder: order({ status: 'pending', slot: null, asap_estimate: '18:25' }), __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    confirmCancelled: { ...base, confirmLoading: false, confirmOrder: order({ status: 'cancelled' }), __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    // ── states an EFFECT sets: AFTER they hold a CODE (order.state.*), BEFORE the sentence — `__after` is applied
    //    only when the AFTER code exists, so each pair proves code → today's words, byte for byte.
    confirmErrNotFound: { ...base, confirmLoading: false, confirmError: 'We couldn’t find that order.', __after: { confirmError: 'confirmNotFound' }, __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    confirmErrCancelled: { ...base, confirmLoading: false, confirmError: 'This order has been cancelled.', __after: { confirmError: 'confirmCancelled' }, __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    confirmErrRejected: { ...base, confirmLoading: false, confirmError: 'This order was not accepted by the truck.', __after: { confirmError: 'confirmRejected' }, __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    confirmErrLoad: { ...base, confirmLoading: false, confirmError: 'We couldn’t load that order.', __after: { confirmError: 'confirmLoadFailed' }, __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    confirmMissing: { ...base, confirmLoading: false, confirmError: null, confirmOrder: null, __search: 'confirm=00000000-0000-4000-8000-000000000000' },
    menuLoadError: { loading: false, error: 'This truck is not currently taking orders.', __after: { error: 'menuUnavailable' } },
    payFormFailed: { ...sheet, payByCard: true, stageOpen: true, payment, payStage: 'failed', __after: { payError: 'cardFormLoadFailed' },
      payError: 'We could not load the card form — check your connection and try again. Your basket is saved, and you have not been charged.' },
    payAuthorising: { ...sheet, payByCard: true, stageOpen: true, payment, payStage: 'authorising' },
    submittedFallback: { ...submitted, cardFallbackNotice: true },
    privateNamed: { ...base, event: event({ is_private: true }), events: [event({ is_private: true })], privateHeader: { name: 'Sam & Tom’s wedding', named: true } },
    privateUnnamed: { ...base, event: event({ is_private: true }), events: [event({ is_private: true }), event({ id: 'ev-2' })], privateHeader: { name: 'Private event', named: false } },
    closedAtTime: { ...base, event: event({ end_time: '15:00' }), events: [event({ end_time: '15:00' })] },
    demoClosed: { ...base, eventEnded: true, __slug: 'demo-harness' },
    itemModalEdit: { ...withBasket, itemModal: { item: it('Margherita'), modGroups: it('Margherita').modifierGroups, upsells: [it('Garlic bread')], editCartKey: 'k1' }, modalMods: [{ name: 'Large', price: 2 }], modalNotes: 'Crispy' },
    itemModalUpsell: { ...withBasket, itemModal: { item: it('Margherita'), modGroups: it('Margherita').modifierGroups, upsells: [it('Garlic bread'), it('Coke')] }, modalMods: [{ name: 'Large', price: 2 }], modalUpsells: ['Garlic bread'] },
    sheetEmailError: { ...sheet, email: 'not-an-email', phone: '07' },
    sheetNoTimeSelection: { ...sheet, truck: truck({ time_selection_enabled: false }) },
    sheetChosen: { ...sheet, asapChosen: false, slotHour: '18', slotMinute: '30', availableSlots: [{ collection_time: '18:30', available: true, remaining: 3, is_past: false, too_soon: false, is_grace: false }] },
    sheetDiscount: { ...sheet, appliedCode: menu.codes[0], sheetSummaryExpanded: true },
  }
}
let OP_RENDER = null
async function orderPage() {
  const F = 'app/trucks/[slug]/order/page.tsx'
  const m = await kit.bundle('lp1a-op', `export { default as OrderPage } from '@/${F}'\nexport { MoneyProvider } from '@/components/MoneyContext'`, {
    patches: [{ file: F, states: OP_STATES }, { file: F, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const out = {}
  for (const cc of ['GB', 'US']) {
    for (const [k, st0] of Object.entries(opFixtures(cc))) {
      const { __search, __after, __slug, ...st } = st0
      globalThis.__ms = AFTER_CODE && __after ? { ...st, ...__after } : st
      if (__search) globalThis.__msSearch = __search
      try { out[`${cc}|${k}`] = kit.quiet(() => kit.renderStatic(h(m.OrderPage, { params: { slug: __slug || 'test-kitchen' } }))) }
      catch (e) { out[`${cc}|${k}`] = 'ERROR ' + String(e.message || e).slice(0, 300) }
      finally { delete globalThis.__ms; delete globalThis.__msSearch }
    }
    if (cc === 'GB') OP_RENDER = search => {
      globalThis.__msSearch = search
      globalThis.__ms = { ...opFixtures('GB').sheet }; delete globalThis.__ms.paymentFailedNotice
      try { return kit.quiet(() => kit.renderStatic(h(m.OrderPage, { params: { slug: 'test-kitchen' } }))) } finally { delete globalThis.__ms; delete globalThis.__msSearch }
    }
    // A payment_failed sentence that ARRIVES IN THE URL (the page seeds its notice from it).
    globalThis.__msSearch = 'payment_failed=' + encodeURIComponent('Sorry — we could not place your order. No money has been taken.')
    globalThis.__ms = { ...opFixtures(cc).sheet }; delete globalThis.__ms.paymentFailedNotice
    try { out[`${cc}|paymentFailedUrl`] = kit.quiet(() => kit.renderStatic(h(m.OrderPage, { params: { slug: 'test-kitchen' } }))) } catch (e) { out[`${cc}|paymentFailedUrl`] = 'ERROR ' + String(e.message || e).slice(0, 300) }
    finally { delete globalThis.__ms; delete globalThis.__msSearch }
  }
  return out
}

// ══ 2 · the status page ═══════════════════════════════════════════════════════════════════════════════════════
async function statusPage() {
  const F = 'app/order/[id]/manage/page.tsx'
  const m = await kit.bundle('lp1a-status', `export { default as Receipt } from '@/${F}'`, { patches: [{ file: F, states: ['order', 'loading', 'error', 'cancelling', 'cancelled'] }] })
  const out = {}
  for (const cc of ['GB', 'US']) {
    const c = C[cc]
    const base = { id: '41', status: 'confirmed', customer_name: 'Sam', slot: '18:30', event_date: '2026-10-09', items: ITEMS, deals: DEALS, total: 43.9, payment_status: 'unpaid',
      truck_name: 'Pizza Kitchen', venue_name: 'The Green', allow_cancellation: true, cancellation_cutoff_mins: 30, money: c.fmt, time: c.time, ...(cc === 'US' ? { charges: US_SNAPSHOT } : {}) }
    const cases = {
      loading: { loading: true, order: null },
      error: { loading: false, order: null, error: 'Order not found' },
      // the load effect's own fallback is a CODE AFTER (orderStatus.loadFailed) — `__after` applies it, proving the words
      loadFailed: { loading: false, order: null, error: 'Could not load order', __after: { error: 'loadFailed' } },
      ...Object.fromEntries(['pending', 'confirmed', 'modified', 'ready', 'collected', 'cancelled', 'rejected'].map(s => [s, { loading: false, order: { ...base, status: s } }])),
      paid: { loading: false, order: { ...base, payment_status: 'paid' } },
      partPaid: { loading: false, order: { ...base, payment_status: 'part_paid' } },
      noCancel: { loading: false, order: { ...base, allow_cancellation: false } },
      cutoff0: { loading: false, order: { ...base, cancellation_cutoff_mins: 0 } },
      cancelling: { loading: false, order: base, cancelling: true },
      cancelledNow: { loading: false, order: base, cancelled: true },
      cancelError: { loading: false, order: base, error: 'This order can no longer be cancelled' },
      asap: { loading: false, order: { ...base, slot: null } },
    }
    for (const [k, st0] of Object.entries(cases)) {
      const { __after, ...st } = st0
      globalThis.__ms = AFTER_CODE && __after ? { ...st, ...__after } : st
      try { out[`${cc}|${k}`] = kit.quiet(() => kit.renderStatic(h(m.Receipt))) } catch (e) { out[`${cc}|${k}`] = 'ERROR ' + String(e.message || e).slice(0, 300) } finally { delete globalThis.__ms }
    }
  }
  return out
}

// ══ 3 · the private-link page ═══════════════════════════════════════════════════════════════════════════════════
async function privateLinkPage() {
  const m = await kit.bundle('lp1a-private', "export { default as Page } from '@/app/p/[token]/page'", {
    stubs: { '@/lib/private-events/read': 'export async function resolvePrivateLink() { return globalThis.__plOutcome }' },
  })
  const { prerenderToNodeStream } = require(path.join(REPO, 'node_modules/react-dom/static'))
  const out = {}
  const outcomes = {
    okNoSlug: { kind: 'ok', truck: { slug: null }, event: { id: 'e1' } },
    orderingOff: { kind: 'ordering_off', truck: { slug: 'test-kitchen' }, event: { id: 'e1' } },
    replaced: { kind: 'replaced', truckName: 'Pizza Kitchen', reason: 'replaced' },
    madePublic: { kind: 'replaced', truckName: 'Pizza Kitchen', reason: 'made_public' },
    unknown: { kind: 'unknown' }, unavailable: { kind: 'unavailable' },
  }
  for (const [k, o] of Object.entries(outcomes)) {
    globalThis.__plOutcome = o
    try {
      out[k] = await kit.quietAsync(async () => {
        const { prelude } = await prerenderToNodeStream(await m.Page({ params: Promise.resolve({ token: 'tok' }) }))
        let s = ''; for await (const ch of prelude) s += ch; return s
      })
    } catch (e) { out[k] = 'ERROR ' + String(e.message || e).slice(0, 200) }
  }
  delete globalThis.__plOutcome
  return out
}

// ══ 4 · the shared customer pieces ═══════════════════════════════════════════════════════════════════════════
async function sharedPieces() {
  const m = await kit.bundle('lp1a-shared', [
    "export * as L from '@/lib/order-charge-lines'", "export * as S from '@/lib/payments/sold-out-copy'", "export * as P from '@/lib/preorder'",
    "export * as PHB from '@/lib/phone'", fs.existsSync(path.join(REPO, 'lib/phone-message.ts')) ? "export * as PHM from '@/lib/phone-message'" : "", "export * as MR from '@/lib/modifier-rules'", "export { OptionStockBadge } from '@/components/OptionStockBadge'",
    "export { SpiceLevel } from '@/components/SpiceLevel'", "export { AllergenChip, DietaryChip } from '@/components/MenuAllergenChips'",
    "export { ChargeRows } from '@/components/ChargeRows'", "export { DealsModal } from '@/components/dashboard/DealsModal'",
    "export { MoneyProvider } from '@/components/MoneyContext'",
  ].join('\n'))
  // Phase 1b moved phoneErrorMessage to lib/phone-message.ts (lib/phone.ts is imported by pages that only check a number).
  const PH = { ...m.PHB, ...(m.PHM || {}) }
  const out = {}
  const snaps = { gb: { food_minor: 4390, tax_inclusive: true, tax_label: 'VAT' }, us: US_SNAPSHOT, usNoTip: { ...US_SNAPSHOT, tip_minor: 0, tip_pct_bps: null }, usFeeOnly: { ...US_SNAPSHOT, tip_minor: 0, tip_pct_bps: null, tax_minor: 0 }, usSurcharge: { ...US_SNAPSHOT, card_surcharge_minor: 75 }, usHg: { ...US_SNAPSHOT, service_fee_recipient: 'hatchgrab' } }
  for (const [k, s] of Object.entries(snaps)) for (const aud of ['customer', 'kitchen', 'operator']) {
    try { out[`lines|${k}|${aud}`] = m.L.chargeLinesFor(s, aud).map(l => [l.label, l.minor ?? null, m.L.chargeLineText(l, n => `$${(n / 100).toFixed(2)}`)]) } catch (e) { out[`lines|${k}|${aud}`] = 'ERROR ' + e.message }
  }
  for (const names of [['Fish Cake'], ['Fish Cake', 'Chicken Satay'], ['A', 'B', 'C'], [], ['  ']]) for (const stage of ['paying', 'ordering']) out[`soldOut|${names.join('+')}|${stage}`] = m.S.soldOutRefusalMessage(names, stage)
  for (const mins of [0, 75, 1439]) for (const st of ['before', 'closed_pending']) {
    out[`preorder|${mins}|${st}|same`] = m.P.formatPreorderLabel(st, mins, '2026-10-10', '2026-10-10')
    out[`preorder|${mins}|${st}|before`] = m.P.formatPreorderLabel(st, mins, '2026-10-09', '2026-10-10')
  }
  for (const r of ['on_confirm', 'day_of', '1d', '7d', 'bogus', null]) out[`preorderOpen|${r}`] = m.P.formatPreorderOpenLabel(r, '2026-10-10')
  const copies = { gb: C.GB.phone, us: C.US.phone, none: null, noName: { ...C.GB.phone, short_name: null }, noEx: { ...C.GB.phone, phone_example: null } }
  for (const [k, cp] of Object.entries(copies)) {
    for (const kind of ['mobile', 'phone', 'phone_number']) out[`phoneErr|${k}|${kind}`] = PH.phoneErrorMessage(kind, cp)
    out[`phonePh|${k}`] = PH.phonePlaceholder(cp); out[`phonePh+|${k}`] = PH.phonePlaceholder(cp, 'e.g. ')
  }
  for (const g of [{ min_choices: 1, max_choices: 1, is_required: true }, { min_choices: 0, max_choices: 3 }, { min_choices: 2, max_choices: 4 }, { min_choices: 0, max_choices: 1 }, { min_choices: 1, max_choices: 99 }, { min_choices: 0 }])
    for (const aud of ['customer', 'operator']) out[`rule|${JSON.stringify(g)}|${aud}`] = m.MR.groupRuleLabel({ id: 'g', name: 'Size', options: [], ...g }, aud)
  for (const n of [null, 0, 1, 2, 5]) out[`stock|${n}`] = kit.renderStatic(h(m.OptionStockBadge, { remaining: n }))
  for (const n of [null, 0, 1, 2, 3]) out[`spice|${n}`] = kit.renderStatic(h(m.SpiceLevel, { value: n }))
  out.chips = kit.renderStatic(h('div', null, h(m.AllergenChip, { label: 'Gluten' }), h(m.DietaryChip, { label: 'Vegan' })))
  for (const [k, s] of Object.entries(snaps)) out[`chargeRows|${k}`] = kit.renderStatic(h(m.ChargeRows, { charges: s, amount: n => `$${(n / 100).toFixed(2)}` }))
  const bundle = { id: 'b1', name: 'Lunch deal', description: 'Any pizza and a drink', bundle_price: 12, original_price: 14.3, slot_1_category: 'Pizzas', slot_2_category: 'Drinks', slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null }
  const menuItems = [
    { id: 'i1', name: 'Margherita', price: 9.5, category: 'Pizzas', available: true, modifierGroups: [{ id: 'g1', name: 'Extras', min_choices: 0, max_choices: 3, options: [{ id: 'o1', name: 'Extra cheese', price_adjustment: 1.25 }] }] },
    { id: 'i2', name: 'Pepperoni', price: 11, category: 'Pizzas', available: true, modifierGroups: [] },
    { id: 'i3', name: 'Coke', price: 1.8, category: 'Drinks', available: true, modifierGroups: [] },
  ]
  for (const cc of ['GB', 'US']) {
    for (const [k, props] of Object.entries({
      one: { bundles: [bundle], basketItems: [] }, two: { bundles: [bundle, { ...bundle, id: 'b2', name: 'Family deal', bundle_price: 30 }], basketItems: [] },
      fromBasket: { bundles: [bundle], basketItems: [{ name: 'Margherita', quantity: 1, unit_price: 10.75, cartKey: 'm1', modifiers: [{ name: 'Extra cheese', price: 1.25 }] }] },
    })) out[`deals|${cc}|${k}`] = kit.quiet(() => kit.renderStatic(h(m.MoneyProvider, { fmt: C[cc].fmt }, h(m.DealsModal, { ...props, menuItems, menuCategories: [{ name: 'Pizzas' }, { name: 'Drinks' }], onApply() {}, onClose() {} }))))
  }
  // the deal picker's slot states: chosen items, basket units (free, used by a deal, taken by another slot),
  // required and optional option groups met and unmet, the note field, the savings panel
  const D = await kit.bundle('lp1a-deals', "export { DealsModal } from '@/components/dashboard/DealsModal'\nexport { MoneyProvider } from '@/components/MoneyContext'",
    { patches: [{ file: 'components/dashboard/DealsModal.tsx', states: ['selectedDeal', 'slotSelections', 'slotMods', 'slotNotes'] }] })
  const twoPizza = { ...bundle, id: 'b3', name: 'Two pizzas', bundle_price: 18, original_price: 22, slot_2_category: 'Pizzas' }
  const dealItems = [
    { id: 'i1', name: 'Margherita', price: 9.5, category: 'Pizzas', available: true, modifierGroups: [
      { id: 'g0', name: 'Size', is_required: true, min_choices: 1, max_choices: 1, options: [{ id: 'o0', name: 'Large', price_adjustment: 2, stock_count: 2 }, { id: 'o9', name: 'Small', price_adjustment: 0 }] },
      { id: 'g1', name: 'Extras', min_choices: 0, max_choices: 3, options: [{ id: 'o1', name: 'Extra cheese', price_adjustment: 1.25, stock_count: 0 }] },
      { id: 'g2', name: 'Dip', min_choices: 0, max_choices: 1, options: [{ id: 'o2', name: 'Garlic', price_adjustment: 0.5 }] },
      { id: 'g3', name: 'Toppings', is_required: true, min_choices: 2, max_choices: 4, options: [{ id: 'o3', name: 'Olives', price_adjustment: 0 }, { id: 'o4', name: 'Basil', price_adjustment: 0 }] }] },
    ...menuItems.slice(1),
  ]
  const basketUnits = [{ name: 'Margherita', quantity: 2, unit_price: 10.75, cartKey: 'm1', modifiers: [{ name: 'Extra cheese', price: 1.25 }] }, { name: 'Pepperoni', quantity: 1, unit_price: 11, cartKey: 'm2', modifiers: [] }]
  const dealCases = {
    unmet: { selectedDeal: bundle, slotSelections: { 0: 'Margherita' }, slotMods: {}, slotNotes: {} },
    met: { selectedDeal: bundle, slotSelections: { 0: 'Margherita', 1: 'Coke' }, slotMods: { 0: [{ name: 'Large', price: 2 }, { name: 'Olives', price: 0 }, { name: 'Basil', price: 0 }] }, slotNotes: { 0: 'Crispy' } },
    allFilledUnmet: { selectedDeal: bundle, slotSelections: { 0: 'Margherita', 1: 'Coke' }, slotMods: {}, slotNotes: {} },
    units: { selectedDeal: twoPizza, slotSelections: { 0: 'USE_EXISTING:m1::unit0' }, slotMods: { 0: [{ name: 'Extra cheese', price: 1.25 }] }, slotNotes: {} },
    unitsSaving: { selectedDeal: twoPizza, slotSelections: { 0: 'USE_EXISTING:m1::unit0', 1: 'Pepperoni' }, slotMods: {}, slotNotes: {} },
  }
  for (const cc of ['GB', 'US']) for (const [k, st] of Object.entries(dealCases)) {
    globalThis.__ms = st
    try {
      out[`dealSlots|${cc}|${k}`] = kit.quiet(() => kit.renderStatic(h(D.MoneyProvider, { fmt: C[cc].fmt }, h(D.DealsModal, { bundles: [bundle, twoPizza], menuItems: dealItems,
        basketItems: basketUnits, menuCategories: [{ name: 'Pizzas', allowNotes: true }, { name: 'Drinks' }], existingDeals: [{ bundle, slots: {}, itemsTakenFromBasket: ['m2'] }], onApply() {}, onClose() {} }))))
    } catch (e) { out[`dealSlots|${cc}|${k}`] = 'ERROR ' + String(e.message || e).slice(0, 200) } finally { delete globalThis.__ms }
  }
  return out
}

// ══ 5 · customer emails ═══════════════════════════════════════════════════════════════════════════════════════
async function emails() {
  const E = await kit.bundle('lp1a-email', "export * from '@/lib/email'")
  const out = {}
  for (const cc of ['GB', 'US']) {
    const fmt = C[cc].fmt
    const base = { orderId: '41', orderKey: '00000000-0000-4000-8000-000000000041', truckName: 'Pizza Kitchen', customerName: 'Sam', slot: '18:30', items: ITEMS, deals: DEALS,
      discountAmt: 2.5, total: 43.9, notes: 'Ring the bell', money: fmt, phoneCountry: cc, venueName: 'The Green', venueTown: 'Harnessville', venuePostcode: cc === 'GB' ? 'AB1 2CD' : '78701',
      contactEmail: 'kitchen@example.test', allowCancellation: true, cancellationCutoffMins: 30, baseUrl: 'https://www.hatchgrab.com', truckSlug: 'test-kitchen', time: C[cc].time,
      ...(cc === 'US' ? { charges: US_SNAPSHOT } : {}) }
    const variants = {
      plain: {}, auto: { autoAccepted: true }, pendingSlot: { slot: null, requestedSlot: '18:30' }, asap: { slot: null }, changed: { autoAccepted: true, slot: '18:40', requestedSlot: '18:30', slotChanged: true },
      adjusted: { autoAccepted: true, slotAdjustedFrom: '18:20' }, held: { cardHeld: true }, captured: { paymentState: 'captured' }, heldState: { paymentState: 'held' },
      heldShort: { paymentState: 'held_short', heldMinor: 4000, balanceMinor: 390 }, hatch: { paymentState: 'hatch' }, unknown: { paymentState: 'unknown' },
      partPaid: { paymentState: 'part_paid', paidMinor: 2000, balanceMinor: 2390 }, partPaidNoFig: { paymentState: 'part_paid' },
      contactWa: { preferredContactMethod: 'whatsapp', contactPhone: cc === 'GB' ? '07700 900123' : '(201) 555-0123', whatsappSender: '447700900123' },
      contactPhone: { preferredContactMethod: 'phone', contactPhone: cc === 'GB' ? '07700 900123' : '(201) 555-0123' }, contactEmail: { preferredContactMethod: 'email' },
      social: { socialFacebook: 'https://facebook.com/pk', socialInstagram: 'https://instagram.com/pk' }, noNotes: { notes: null, discountAmt: 0 }, noVenue: { venueName: null, venueTown: null, venuePostcode: null },
      noCancel: { allowCancellation: false }, cutoff0: { cancellationCutoffMins: 0 }, noBase: { baseUrl: undefined, truckSlug: undefined },
      ready: { variant: 'ready' }, readyCaptured: { variant: 'ready', paymentState: 'captured' }, readyHeldShort: { variant: 'ready', paymentState: 'held_short', heldMinor: 4000, balanceMinor: 390 },
      readyPartPaid: { variant: 'ready', paymentState: 'part_paid', paidMinor: 2000, balanceMinor: 2390 }, readyUnknown: { variant: 'ready', paymentState: 'unknown' }, readyHatch: { variant: 'ready', paymentState: 'hatch' },
      noDeals: { deals: [] }, oneItem: { items: [ITEMS[1]], deals: [] },
    }
    for (const [k, v] of Object.entries(variants)) {
      try { out[`confirm|${cc}|${k}`] = E.formatConfirmationEmail({ ...base, ...v }) } catch (e) { out[`confirm|${cc}|${k}`] = 'ERROR ' + e.message }
    }
    for (const st of ['captured', 'held', 'held_short', 'hatch', 'unknown', 'part_paid']) for (const [kind, amounts] of Object.entries({ figures: { paidMinor: 2000, balanceMinor: 2390, heldMinor: 4000 }, noHeld: { paidMinor: 2000, balanceMinor: 2390 }, none: undefined })) {
      try { out[`note|${cc}|${st}|${kind}`] = E.paymentNote(st, 'Pizza Kitchen', amounts, fmt) } catch (e) { out[`note|${cc}|${st}|${kind}`] = 'ERROR ' + e.message }
    }
    for (const ps of ['captured', 'held', 'held_short', 'hatch', 'unknown', 'part_paid']) for (const extra of [{}, { refundedMinor: 4390 }, { refundDeclined: true }]) {
      try { out[`cancelSentence|${cc}|${ps}|${JSON.stringify(extra)}`] = E.cancellationPaymentSentence({ money: fmt, truckName: 'Pizza Kitchen', paymentState: ps, ...extra }) } catch (e) { out[`cancelSentence|${cc}|${ps}|${JSON.stringify(extra)}`] = 'ERROR ' + e.message }
      for (const hr of [true, false]) try { out[`rejectSentence|${cc}|${ps}|${hr}`] = E.rejectionPaymentSentence({ truckName: 'Pizza Kitchen', paymentState: ps, holdReleased: hr }) } catch (e) { out[`rejectSentence|${cc}|${ps}|${hr}`] = 'ERROR ' + e.message }
    }
  }
  // the senders, captured from a stubbed fetch
  const sent = []
  const realFetch = globalThis.fetch; const realKey = process.env.BREVO_API_KEY
  process.env.BREVO_API_KEY = 'harness-not-a-key'
  globalThis.fetch = async (_u, init) => { sent.push(JSON.parse(init.body)); return { ok: true, text: async () => '', json: async () => ({}) } }
  try {
    for (const cc of ['GB', 'US']) {
      const fmt = C[cc].fmt
      await kit.quietAsync(async () => {
        await E.sendRefundEmail({ to: 'sam@example.test', customerName: 'Sam', orderId: '41', truckName: 'Pizza Kitchen', amountMinor: 4390, chargedMinor: 4390, money: fmt })
        await E.sendRefundEmail({ to: 'sam@example.test', customerName: 'there', orderId: '41', truckName: 'Pizza Kitchen', amountMinor: 1000, chargedMinor: 4390, money: fmt })
        await E.sendCancellationEmail({ to: 'sam@example.test', customerName: 'Sam', orderId: '41', truckName: 'Pizza Kitchen', reason: 'Sold out', paymentStatus: 'paid', paymentState: 'captured', refundedMinor: 4390, money: fmt })
        await E.sendCancellationEmail({ to: 'sam@example.test', customerName: 'there', orderId: '41', truckName: 'Pizza Kitchen', reason: null, paymentStatus: 'unpaid', paymentState: 'hatch', money: fmt })
        await E.sendCancellationEmail({ to: 'sam@example.test', customerName: 'Sam', orderId: '41', truckName: 'Pizza Kitchen', reason: 'Oven broke', paymentStatus: 'paid', paymentState: 'held', refundDeclined: true, money: fmt })
        await E.sendCancellationEmail({ to: 'sam@example.test', customerName: 'Sam', orderId: '41', truckName: 'Pizza Kitchen', reason: null, paymentStatus: 'paid', money: fmt })
        await E.sendEventCancellationEmail({ to: 'sam@example.test', customerName: 'Sam', orderId: '41', truckName: 'Pizza Kitchen', venueName: 'The Green', village: 'Harnessville', eventDate: '2026-10-09', note: 'Rain', paymentStatus: 'paid', money: fmt, time: C[cc].time })
        await E.sendEventCancellationEmail({ to: 'sam@example.test', customerName: 'there', orderId: '41', truckName: 'Pizza Kitchen', venueName: null, village: null, eventDate: null, note: null, paymentStatus: 'unpaid', money: fmt, time: C[cc].time })
        await E.sendEventCancellationEmail({ to: 'sam@example.test', customerName: 'Sam', orderId: '41', truckName: 'Pizza Kitchen', venueName: 'The Green', village: null, eventDate: '2026-10-09', note: null, paymentStatus: null, money: fmt, time: C[cc].time })
      })
    }
  } finally { globalThis.fetch = realFetch; if (realKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = realKey }
  out.sent = sent.map(b => ({ subject: b.subject, html: b.htmlContent, text: b.textContent ?? null, sender: b.sender?.name }))
  return out
}

// ══ 6 · WhatsApp fixed replies ═══════════════════════════════════════════════════════════════════════════════
async function whatsapp() {
  const W = await kit.bundle('lp1a-wa', "export { generateWhatsAppReply } from '@/lib/whatsapp-classifier'")
  const out = {}
  const realFetch = globalThis.fetch
  const script = []
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('generateContent')) { const text = script.shift() ?? ''; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) } }
    return { ok: true, json: async () => ({ categories: [], items: [] }) }
  }
  globalThis.__harnessDb = makeFakePg({
    menu_items_db: [{ id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 9.5, is_active: true, available: true, allergens: ['Gluten'], menu_categories: { name: 'Pizzas' } },
      { id: 'i4', truck_id: 'test-truck', name: 'Mystery', price: 5, is_active: true, available: true, menu_categories: null },
      { id: 'i2', truck_id: 'test-truck', name: 'Coke', price: 1.8, is_active: true, available: true, menu_categories: { name: 'Drinks' } },
      { id: 'i3', truck_id: 'test-truck', name: 'Chips', price: 3, is_active: true, available: true, menu_categories: { name: 'Sides' } }],
  })
  try {
    for (const cc of ['GB', 'US']) {
      const params = (msg, isFollowUp = false) => ({ truckName: 'Pizza Kitchen', truckEmoji: '🍕', truckId: 'test-truck', customerMessage: msg, events: [], scheduleUrl: 'https://x.test/s', orderUrl: 'https://x.test/o', isFollowUp, money: C[cc].fmt, time: C[cc].time })
      const run = async (k, msg, replies, fu = false) => { script.length = 0; script.push(...replies); try { out[`${cc}|${k}`] = await kit.quietAsync(() => W.generateWhatsAppReply(params(msg, fu))) } catch (e) { out[`${cc}|${k}`] = 'ERROR ' + e.message } }
      await run('ignore', 'thanks', ['IGNORE'])
      await run('allergen', 'is it gluten free?', ['ALLERGEN_QUERY'])
      await run('allergenFollow', 'any allergy info', ['ALLERGEN_QUERY'], true)
      await run('menuDeterministic', 'what food do you have', ['MENU_QUERY', ''])
      await run('menuLlmCaveat', 'do you have pizza', ['MENU_QUERY', 'Yes! Margherita contains gluten.'])
      await run('menuLlmPlain', 'do you have pizza', ['MENU_QUERY', 'Yes, we have Margherita.'])
      await run('specificFallback', 'where are you tomorrow', ['SPECIFIC_QUERY', ''])
      await run('specificFallbackFollow', 'where are you tomorrow', ['SPECIFIC_QUERY', ''], true)
    }
  } finally { globalThis.fetch = realFetch; delete globalThis.__harnessDb }
  return out
}

// ══ 7 · customer-facing API responses ═════════════════════════════════════════════════════════════════════════
const RECORD_STUBS = {
  '@/lib/apns': 'export async function sendOrderPendingPush() {}\nexport function normaliseApnsKey(k) { return k }',
  '@/lib/fcm': 'export async function sendOrderPendingPush() {}',
  '@/lib/payments/authorize': `export async function authorizeDraft() { return globalThis.__authResult || { ok: true, clientSecret: 'cs', stripeAccount: 'acct' } }
export async function cancelAuthorization() { return { ok: true } }
export async function stripeAccountForTruck() { return 'acct_harness' }`,
  '@/lib/payments/capture': 'export async function captureOnConfirmation() { return { ok: true, outcome: "nothing_to_capture" } }',
}
const TRUCK_ROW = cc => ({ id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', active: true, plan: 'pro', country: cc, currency: C[cc].fmt.currency,
  timezone: C[cc].time.timeZone, auto_accept: true, operator_id: 'op-test', time_selection_enabled: true, contact_email: 'kitchen@example.test', dashboard_token: 'tok-test',
  takes_cash: true, allow_cancellation: true, cancellation_cutoff_mins: 30, ...(cc === 'US' ? { tax_rate_milli: 8250, tipping_enabled: true } : {}) })
const TABLES = (cc, over = {}) => ({
  trucks: [{ ...TRUCK_ROW(cc), ...(over.truck || {}) }],
  country_settings: [snake(C.GB.settings), snake(C.US.settings)],
  menu_items_db: [{ id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 9.5, category_id: 'c1', category: 'Pizzas', available: true, is_active: true, ...(over.item || {}) },
    { id: 'i2', truck_id: 'test-truck', name: 'Lemonade', price: 2.4, category_id: 'c2', category: 'Drinks', available: true, is_active: true }],
  menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas' }, { id: 'c2', truck_id: 'test-truck', name: 'Drinks' }],
  modifier_groups: [], modifier_options: [], item_modifier_groups: [], bundles_db: [], discount_codes_db: [],
  truck_events: [{ id: 'ev1', truck_id: 'test-truck', event_date: '2026-10-09', status: 'open', start_time: '11:00', end_time: '20:00', venue_name: 'The Green', van_id: null, ...(over.event || {}) }],
  orders: (over.orders || []).map(o => ({ ...o })), order_drafts: [], order_payments: [], booking_locks: [],
})
async function apiResponses() {
  const M = {
    submit: await kit.bundle('lp1a-submit', "export { POST } from '@/app/api/orders/submit/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: RECORD_STUBS }),
    cancel: await kit.bundle('lp1a-cancel', "export { POST } from '@/app/api/orders/cancel/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: RECORD_STUBS }),
    order: await kit.bundle('lp1a-order', "export { GET } from '@/app/api/orders/[id]/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"),
    menu: await kit.bundle('lp1a-menu', "export { GET } from '@/app/api/menu/[truckId]/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"),
    slots: await kit.bundle('lp1a-slots', "export { GET } from '@/app/api/slots/[truckId]/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"),
    action: await kit.bundle('lp1a-action', "export { POST } from '@/app/api/dashboard/action/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: RECORD_STUBS }),
  }
  const out = {}
  const call = async (key, tables, fn) => {
    const db = makeFakePg(tables, { keys: { orders: [['order_key'], ['event_id', 'id']], order_drafts: [['order_key']], production_slot_usage: [['truck_id', 'event_id', 'production_slot']] },
      defaults: { orders: { currency: tables.trucks[0].currency, country: tables.trucks[0].country } } })
    let counter = 40
    const rpc = async (name, args) => {
      if (/^place_order_atomic/.test(name)) {
        if (globalThis.__rpcFail) return { data: null, error: { message: 'boom' } }
        db.tables.orders.push({ order_key: 'ok-new-1', id: '41', truck_id: args.p_truck_id, ...args.p_order, slot: args.p_final_slot, status: args.p_status, event_id: args.p_event_id, event_date: args.p_event_date })
        return { data: { order_key: 'ok-new-1', order_number: 41, slot: args.p_final_slot }, error: null }
      }
      if (/increment_(event_)?order_counter/.test(name)) return { data: ++counter, error: null }
      return { data: null, error: null }
    }
    globalThis.__harnessDb = { ...db, rpc }
    globalThis.__rec = { emails: [] }
    const sends = []
    const realFetch = globalThis.fetch, realKey = process.env.BREVO_API_KEY, realUuid = crypto.randomUUID
    let n = 0
    crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
    process.env.BREVO_API_KEY = 'harness-not-a-key'
    globalThis.fetch = async (u, init) => {
      if (String(u).includes('brevo')) { const b = JSON.parse(init.body); sends.push({ to: b.to?.[0]?.email, sender: b.sender?.name, subject: b.subject, html: b.htmlContent, text: b.textContent ?? null }) }
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) }
    }
    for (const k of Object.keys(M)) M[k].clearCountrySettingsCache?.()
    try {
      const res = await kit.quietAsync(fn)
      out[key] = { status: res.status, body: await res.text(), location: res.headers.get('location'), sends }
    } catch (e) { out[key] = 'ERROR ' + String(e.message || e).slice(0, 200) }
    finally {
      globalThis.fetch = realFetch; crypto.randomUUID = realUuid
      if (realKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = realKey
      delete globalThis.__harnessDb; delete globalThis.__rec
    }
  }
  const post = (url, body) => new NextRequest(`http://127.0.0.1${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const get = url => new NextRequest(`http://127.0.0.1${url}`)
  kit.setNow(NOW)
  for (const cc of ['GB', 'US']) {
    const order = (over = {}) => ({ truckId: 'test-truck', eventId: 'ev1', customerName: 'Sam', customerEmail: 'sam@example.test', items: [{ name: 'Margherita', quantity: 1, price: 9.5, modifiers: [] }], deals: [], total: 9.5, ...over })
    await call(`${cc}|submit|missing`, TABLES(cc), () => M.submit.POST(post('/api/orders/submit', {})))
    await call(`${cc}|submit|noTruck`, TABLES(cc), () => M.submit.POST(post('/api/orders/submit', order({ truckId: 'nope' }))))
    await call(`${cc}|submit|closedEvent`, TABLES(cc, { event: { status: 'closed' } }), () => M.submit.POST(post('/api/orders/submit', order())))
    await call(`${cc}|submit|paused`, TABLES(cc, { event: { paused_until: '2026-10-09T23:00:00Z', pause_reason: 'Back soon' } }), () => M.submit.POST(post('/api/orders/submit', order())))
    await call(`${cc}|submit|menuChanged`, TABLES(cc), () => M.submit.POST(post('/api/orders/submit', order({ items: [{ name: 'Ghost dish', quantity: 1, price: 5, modifiers: [] }], total: 5 }))))
    await call(`${cc}|submit|private`, TABLES(cc, { event: { is_private: true } }), () => M.submit.POST(post('/api/orders/submit', order())))
    await call(`${cc}|submit|tipInvalid`, TABLES(cc), () => M.submit.POST(post('/api/orders/submit', order({ payByCard: true, tip: { kind: 'preset', bps: 1234 } }))))
    await call(`${cc}|submit|closing`, TABLES(cc, { truck: { deletion_requested_at: '2026-10-01T00:00:00Z', account_closing: true } }), () => M.submit.POST(post('/api/orders/submit', order())))
    await call(`${cc}|submit|soldOutItem`, TABLES(cc, { item: { available: false } }), () => M.submit.POST(post('/api/orders/submit', order())))
    await call(`${cc}|submit|placed`, TABLES(cc), () => M.submit.POST(post('/api/orders/submit', order({ slot: '18:30' }))))
    globalThis.__rpcFail = true
    await call(`${cc}|submit|saveFailed`, TABLES(cc), () => M.submit.POST(post('/api/orders/submit', order())))
    delete globalThis.__rpcFail
    const truckJoin = (over = {}) => ({ trucks: { name: 'Pizza Kitchen', allow_customer_cancellation: true, cancellation_cutoff_mins: 30, timezone: C[cc].time.timeZone, country: cc, ...over }, truck_events: { end_time: '20:00' } })
    const placed = (over = {}) => ({ order_key: 'ok-1', id: '41', truck_id: 'test-truck', event_id: 'ev1', status: 'confirmed', slot: '18:30', event_date: '2026-10-09', customer_email: 'sam@example.test', customer_name: 'Sam', total: 9.5, payment_status: 'unpaid', items: [], deals: [], currency: C[cc].fmt.currency, country: cc, ...truckJoin(), ...over })
    await call(`${cc}|cancel|noKey`, TABLES(cc), () => M.cancel.POST(post('/api/orders/cancel', {})))
    await call(`${cc}|cancel|notFound`, TABLES(cc), () => M.cancel.POST(post('/api/orders/cancel', { order_key: 'nope' })))
    await call(`${cc}|cancel|noCancels`, TABLES(cc, { orders: [placed(truckJoin({ allow_customer_cancellation: false }))] }), () => M.cancel.POST(post('/api/orders/cancel', { order_key: 'ok-1' })))
    await call(`${cc}|cancel|tooLateStatus`, TABLES(cc, { orders: [placed({ status: 'collected' })] }), () => M.cancel.POST(post('/api/orders/cancel', { order_key: 'ok-1' })))
    await call(`${cc}|cancel|cutoff`, TABLES(cc, { orders: [placed({ slot: cc === 'GB' ? '16:10' : '10:10' })] }), () => M.cancel.POST(post('/api/orders/cancel', { order_key: 'ok-1' })))
    await call(`${cc}|cancel|ok`, TABLES(cc, { orders: [placed()] }), () => M.cancel.POST(post('/api/orders/cancel', { order_key: 'ok-1' })))
    await call(`${cc}|order|notFound`, TABLES(cc), () => M.order.GET(get('/api/orders/nope'), { params: Promise.resolve({ id: 'nope' }) }))
    await call(`${cc}|menu|noTruck`, TABLES(cc), () => M.menu.GET(get('/api/menu/nope'), { params: Promise.resolve({ truckId: 'nope' }) }))
    await call(`${cc}|menu|unconfirmed`, TABLES(cc, { event: { status: 'unconfirmed' } }), () => M.menu.GET(get('/api/menu/test-truck?event_id=ev1'), { params: Promise.resolve({ truckId: 'test-truck' }) }))
    await call(`${cc}|slots|noTruck`, TABLES(cc), () => M.slots.GET(get('/api/slots/nope?date=2026-10-09'), { params: Promise.resolve({ truckId: 'nope' }) }))

    // ── the operator routes' CUSTOMER emails (the words reach the customer, so they are in scope) ──
    const old = (over = {}) => ({ order_key: 'ok-old-1', id: '12', truck_id: 'test-truck', customer_name: 'Bob Example', customer_email: 'bob@example.test', customer_phone: null,
      slot: '17:30', order_type: 'collection', event_date: '2026-10-09', event_id: 'ev1', van_id: null,
      items: [{ name: 'Margherita', quantity: 1, unit_price: 9.5, modifiers: [] }], deals: [], discount_code: null,
      subtotal: 9.5, discount_amt: 0, total: 9.5, total_minor: 950, currency: C[cc].fmt.currency, country: cc, notes: null, status: 'pending', payment_status: 'unpaid', amount_paid: 0, ...over })
    const act = (k, body, orders = [old()]) => call(`${cc}|action|${k}`, TABLES(cc, { orders }), () => M.action.POST(post('/api/dashboard/action', { token: 'tok-test', ...body })))
    await act('confirm', { action: 'confirm', order_key: 'ok-old-1' })
    await act('reject', { action: 'reject', order_key: 'ok-old-1', rejectionReason: 'Out of dough' })
    await act('rejectNoReason', { action: 'reject', order_key: 'ok-old-1' })
    await act('cancel', { action: 'cancel', order_key: 'ok-old-1', cancellationReason: 'Oven broke', refunded_minor: null }, [old({ status: 'confirmed' })])
    await act('cancelRefunded', { action: 'cancel', order_key: 'ok-old-1', cancellationReason: null, refunded_minor: 950 }, [old({ status: 'confirmed', payment_status: 'paid' })])
    await act('cancelDeclined', { action: 'cancel', order_key: 'ok-old-1', refund_declined: true }, [old({ status: 'confirmed', payment_status: 'paid', customer_name: null })])
    await act('ready', { action: 'ready', order_key: 'ok-old-1' }, [old({ status: 'confirmed' })])
    await act('edit', { action: 'edit', order_key: 'ok-old-1', editedOrder: { items: [{ name: 'Margherita', quantity: 2, unit_price: 9.5, modifiers: [] }, { name: 'Lemonade', quantity: 1, unit_price: 2.4, modifiers: [] }] } }, [old({ status: 'confirmed' })])
    await act('editSame', { action: 'edit', order_key: 'ok-old-1', editedOrder: { items: [{ name: 'Margherita', quantity: 1, unit_price: 9.5, modifiers: [] }] } }, [old({ status: 'confirmed' })])
    await act('adjustSlot', { action: 'adjust_slot_+10', order_key: 'ok-old-1' }, [old({ status: 'confirmed' })])
  }
  return out
}

// ══ 7b · the payment-return redirects and the refusal sentences ═════════════════════════════════════════════
async function paymentReturn() {
  const R = await kit.bundle('lp1a-return', "export { GET } from '@/app/api/payments/return/route'", {
    stubs: { '@/lib/payments/promote-draft': 'export async function promoteDraft() { return globalThis.__promote }', ...RECORD_STUBS },
  })
  const out = {}
  const cases = {
    promoted: { status: 'promoted', orderKey: 'd1' },
    // promoteDraft's own refusals, as it returns them (the code and values are what AFTER's promoteDraft adds).
    refusedSoldOut: { status: 'refused', orderKey: 'd1', reason: 'stock: Fish Cake, Chicken Satay', cancelled: true,
      customerMessage: "Fish Cake and Chicken Satay sold out while you were paying. We've removed them and have not taken any money — please check your order before placing it again.",
      customerCode: 'sold_out_paying', customerParams: { names: 'Fish Cake and Chicken Satay', count: 2 } },
    refusedGeneric: { status: 'refused', orderKey: 'd1', reason: 'insert_failed', cancelled: true,
      customerMessage: 'Sorry — we could not place your order. No money has been taken.', customerCode: 'order_not_placed', customerParams: {} },
    refusedClosed: { status: 'refused', orderKey: 'd1', reason: 'category_closed: Starters', cancelled: true,
      customerMessage: 'Sorry — Starters closed while you were paying, so we could not place your order. No money has been taken.', customerCode: 'category_closed_paying', customerParams: { category: 'Starters' } },
    refusedTruck: { status: 'refused', orderKey: 'd1', reason: 'truck_missing', cancelled: false,
      customerMessage: 'This truck is no longer taking orders. No money has been taken.', customerCode: 'truck_not_taking_orders', customerParams: {} },
    alreadyConfirmed: { status: 'already', orderKey: 'd1', __draft: { event_id: 'ev1', promotion_failed_at: null, promotion_failure_reason: null } },
    alreadyRefusedOption: { status: 'already', orderKey: 'd1', __draft: { event_id: 'ev1', promotion_failed_at: NOW, promotion_failure_reason: 'option_ceiling: Extra cheese' } },
    alreadyRefusedOther: { status: 'already', orderKey: 'd1', __draft: { event_id: 'ev1', promotion_failed_at: NOW, promotion_failure_reason: 'mystery: Thing' } },
    errored: { status: 'error', orderKey: 'd1', detail: 'boom' },
    alreadyRefusedClosed: { status: 'already', orderKey: 'd1', __draft: { event_id: 'ev1', promotion_failed_at: NOW, promotion_failure_reason: 'category_closed: Starters' } },
    alreadyRefusedStock: { status: 'already', orderKey: 'd1', __draft: { event_id: 'ev1', promotion_failed_at: NOW, promotion_failure_reason: 'stock: Fish Cake' } },
    alreadyRefusedTruck: { status: 'already', orderKey: 'd1', __draft: { event_id: null, promotion_failed_at: NOW, promotion_failure_reason: 'truck_missing' } },
    alreadyRefusedNone: { status: 'already', orderKey: 'd1', __draft: { event_id: null, promotion_failed_at: NOW, promotion_failure_reason: null } },
  }
  for (const [k, p] of Object.entries(cases)) for (const json of [false, true]) {
    const { __draft, ...promote } = p
    globalThis.__promote = promote
    globalThis.__harnessDb = makeFakePg({ order_drafts: __draft ? [{ order_key: 'd1', ...__draft }] : [], orders: [] })
    try {
      const res = await kit.quietAsync(() => R.GET(new NextRequest(`http://127.0.0.1/api/payments/return?draft=d1&truck=test-kitchen${json ? '&json=1' : ''}`)))
      out[`${k}|${json ? 'json' : 'redirect'}`] = { status: res.status, body: await res.text(), location: res.headers.get('location') }
    } catch (e) { out[`${k}|${json ? 'json' : 'redirect'}`] = 'ERROR ' + String(e.message || e).slice(0, 200) }
    finally { delete globalThis.__harnessDb; delete globalThis.__promote }
  }
  return out
}

function diffJson(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = diffJson(a[k], b[k], `${p}.${k}`); if (d) return d }
  }
  if (typeof a === 'string' && typeof b === 'string') {
    let i = 0; while (i < a.length && a[i] === b[i]) i++
    return `${p} @${i}: BEFORE …${JSON.stringify(a.slice(Math.max(0, i - 80), i + 100))} · AFTER …${JSON.stringify(b.slice(Math.max(0, i - 80), i + 100))}`
  }
  return `${p}: BEFORE ${JSON.stringify(a)?.slice(0, 300)} · AFTER ${JSON.stringify(b)?.slice(0, 300)}`
}

async function main() {
  kit.setNow(NOW); kit.setDeviceTz('Europe/London')
  const got = {
    orderPage: await orderPage(),
    statusPage: await statusPage(),
    privateLink: await privateLinkPage(),
    shared: await sharedPieces(),
    emails: await emails(),
    whatsapp: await whatsapp(),
    api: await apiResponses(),
    paymentReturn: await paymentReturn(),
  }
  if (CAPTURE) {
    fs.writeFileSync(path.resolve(REPO, CAPTURE), zlib.gzipSync(JSON.stringify({ captured_on: 'ed1d4c2 (HEAD = origin/main), before any edit of Language Phase 1a', views: got })))
    for (const [k, v] of Object.entries(got)) {
      const n = Object.keys(v).length, errs = Object.entries(v).filter(([, x]) => typeof x === 'string' && x.startsWith('ERROR')).map(([kk]) => kk)
      console.log(`  ${k}: ${n} answers${errs.length ? ` — ${errs.length} render errors: ${errs.slice(0, 6).join(', ')}` : ''}`)
    }
    console.log(`captured → ${CAPTURE}`)
    return
  }
  const before = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, BEFORE_FILE)))).views
  head('1 · byte-identical to BEFORE (GB and US), section by section')
  for (const sec of Object.keys(before)) {
    if (sec === 'api' || sec === 'paymentReturn') continue
    for (const k of Object.keys(before[sec])) { const d = diffJson(before[sec][k], got[sec][k]); t(`${sec} · ${k}`, d === null, d) }
  }
  if (AFTER_CODE) await require('./_language-phase-1a-after.cjs')({ kit, t, head, read, REPO, before, got, diffJson, renderOrderPage: OP_RENDER })
  else for (const sec of ['api', 'paymentReturn']) for (const k of Object.keys(before[sec])) { const d = diffJson(before[sec][k], got[sec][k]); t(`${sec} · ${k}`, d === null, d) }
  console.log(`\n${fail ? '✗' : '✓'} language-phase-1a: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
