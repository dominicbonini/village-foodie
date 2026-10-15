// scripts/_lp1b-components.cjs — Language Phase 1b, area `components`: the dashboard's and the KDS's shared pieces —
// OrderCard (dashboard and every KDS mode), PaymentActionsModal, AddOrderPanel, the buzzer grid and banner, the
// capacity banner and strip, the demo pieces, the keep-awake prompt, the user menu, and the shared kitchen modals
// (reject, event cancel / actions / finish time, extra wait, event picker) — for a GB and a US truck, as full HTML.
//
// 🔴 ENGLISH-AS-KEY. RejectOrderModal and EventCancelModal used to compare the displayed word ('Other'); they now map
// the select's value (still the label, so every <option value> is byte-identical) back to an id and decide on the id.
// The views `GB|stored|…` / `US|stored|…` press each modal's confirm button in each reason state and record exactly
// what its onConfirm receives — the text stored on the order and emailed — so the change is proven to store the same
// text, byte for byte.
//
// Nothing reaches a database or the network: every component is rendered statically from props and patched state.
const path = require('path')

const COMPONENTS = {
  card: 'components/dashboard/OrderCard.tsx',
  pay: 'components/dashboard/PaymentActionsModal.tsx',
  add: 'components/dashboard/AddOrderPanel.tsx',
  grid: 'components/dashboard/BuzzerGrid.tsx',
  welcome: 'components/dashboard/DemoWelcome.tsx',
  loop: 'components/dashboard/DemoLoopComplete.tsx',
  menu: 'components/dashboard/UserMenu.tsx',
  reject: 'components/shared/RejectOrderModal.tsx',
  cancel: 'components/shared/EventCancelModal.tsx',
  finish: 'components/shared/EventFinishTimeModal.tsx',
}
// PaymentActionsModal portals into document.body, which a static render has no document for: the overlay itself
// is returned instead (the same element the portal would mount).
const PORTAL = { file: COMPONENTS.pay, from: "return typeof document === 'undefined' ? null : createPortal(overlay, document.body)", to: 'return overlay' }
const PAY_STATES = { file: COMPONENTS.pay, states: ['mode', 'amountInput', 'reason', 'note', 'busy', 'error', 'done'] }

/** Records every <button>'s onClick and text while `fn` renders, so a view can press one afterwards. */
function withButtons(REPO, fn) {
  const rt = require(path.join(REPO, 'node_modules/react/jsx-runtime'))
  const orig = { jsx: rt.jsx, jsxs: rt.jsxs }
  const buttons = []
  const text = c => (c == null || c === false || c === true ? '' : Array.isArray(c) ? c.map(text).join('') : typeof c === 'object' ? text(c.props && c.props.children) : String(c))
  const wrap = f => (type, props, key) => { if (type === 'button' && props && props.onClick) buttons.push({ text: text(props.children), disabled: !!props.disabled, onClick: props.onClick }); return f(type, props, key) }
  rt.jsx = wrap(orig.jsx); rt.jsxs = wrap(orig.jsxs)
  try { const html = fn(); return { html, buttons } } finally { rt.jsx = orig.jsx; rt.jsxs = orig.jsxs }
}

async function views(ctx) {
  const { kit, h, html, AFTER, REPO } = ctx
  const ctxExport = AFTER ? "export { I18nContext } from '@/lib/i18n/use-t'\n" : ''
  const money = "export { MoneyProvider } from '@/components/MoneyContext'\n"
  const B = {
    cards: await kit.bundle('lp1b-cmp-cards', `export { OrderCard } from '@/${COMPONENTS.card}'\nexport { PaymentActionsModal } from '@/${COMPONENTS.pay}'\n${money}${ctxExport}`, {
      patches: [{ file: COMPONENTS.card, states: ['showContact', 'confirmRemovePayment'] }, PAY_STATES, PORTAL],
    }),
    add: await kit.bundle('lp1b-cmp-add', `export { AddOrderPanel } from '@/${COMPONENTS.add}'\n${money}${ctxExport}`, {
      patches: [
        { file: COMPONENTS.add, states: ['manualName', 'manualSlot', 'activeMenuCat', 'manualItems', 'appliedDeals', 'loading', 'manualEvent', 'apiSlots', 'apiCapacityInputs', 'apiCatConfigs',
          'showEventPicker', 'upcomingEvents', 'eventsLoading', 'eventsLoaded', 'itemModal', 'modalMods', 'modalNotes', 'manualBuzzer', 'showBuzzerPicker', 'buzzerPrompt', 'showOrderSheet',
          'capacityConfirm', 'submitting', 'apiQueueByCat'] },
        { file: COMPONENTS.grid, states: ['pending'] },
      ],
    }),
    misc: await kit.bundle('lp1b-cmp-misc', [
      "export { RejectOrderModal } from '@/components/shared/RejectOrderModal'",
      "export { EventCancelModal } from '@/components/shared/EventCancelModal'",
      "export { EventActionsModal } from '@/components/shared/EventActionsModal'",
      "export { EventFinishTimeModal } from '@/components/shared/EventFinishTimeModal'",
      "export { ExtraWaitModal } from '@/components/shared/ExtraWaitModal'",
      "export { EventPickerPanel } from '@/components/shared/EventPickerPanel'",
      "export { BuzzerGrid } from '@/components/dashboard/BuzzerGrid'",
      "export { BuzzerLostBanner } from '@/components/dashboard/BuzzerLostBanner'",
      "export { CapacityBreachBanner } from '@/components/dashboard/CapacityBreachBanner'",
      "export { DayLoadStrip } from '@/components/dashboard/DayLoadStrip'",
      "export { DemoLockChip } from '@/components/dashboard/DemoLockChip'",
      "export { DemoLoopComplete } from '@/components/dashboard/DemoLoopComplete'",
      "export { DemoWelcome } from '@/components/dashboard/DemoWelcome'",
      "export { KeepAwakePrompt } from '@/components/dashboard/KeepAwakePrompt'",
      "export { default as UserMenu } from '@/components/dashboard/UserMenu'",
      "export { DemoModeBanner } from '@/components/DemoModeBanner'",
    ].join('\n') + '\n' + money + ctxExport, {
      patches: [
        { file: COMPONENTS.reject, states: ['reason', 'note'] },
        { file: COMPONENTS.cancel, states: ['reason', 'note'] },
        { file: COMPONENTS.finish, states: ['selected', 'step'] },
        { file: COMPONENTS.grid, states: ['pending'] },
        { file: COMPONENTS.welcome, states: ['qrDataUrl', 'qrFailed'] },
        // a static render reads the server snapshot ("seen"), so the welcome would never open: read a flag instead
        { file: COMPONENTS.welcome, from: '() => true,', to: '() => !globalThis.__lpWelcomeOpen,' },
        { file: COMPONENTS.loop, states: ['visible', 'freshKeys'] },
        { file: COMPONENTS.menu, states: ['open', 'deviceOpen'] },
        // "This device" is native-only (Capacitor): a flag stands in for the native shell
        { file: COMPONENTS.menu, from: '{isNativeApp() && (', to: '{(globalThis.__lpNative || isNativeApp()) && (' },
      ],
    }),
  }

  const out = {}
  for (const C of [ctx.GB, ctx.US]) {
    const cc = C.cc
    /** Wrap in the truck's money format and, on AFTER code for a US truck, the en-US locale (its file is empty). */
    const wrap = (m, el) => {
      let e = h(m.MoneyProvider, { fmt: C.fmt }, el)
      if (m.I18nContext && cc === 'US') e = h(m.I18nContext.Provider, { value: { locale: 'en-US', setLocale() {} } }, e)
      return e
    }
    const put = (key, m, el, state) => { out[`${cc}|${key}`] = html(state || null, wrap(m, el)) }

    // ══ OrderCard ════════════════════════════════════════════════════════════════════════════════════
    const M = B.cards
    const T = C.TRUCK
    const trucks = {
      two: T,
      oneCash: { ...T, completion_presses: 'one', takes_cash: true },
      oneNoCash: { ...T, completion_presses: 'one', takes_cash: false },
      twoNoCash: { ...T, completion_presses: 'two', takes_cash: false },
    }
    const MODES = {
      dash: { kdsMode: false, viewMode: 'solo' },
      dashReady: { kdsMode: false, viewMode: 'solo', effectiveOrderReady: true },
      dashCook: { kdsMode: false, viewMode: 'cook' },
      kdsWindow: { kdsMode: true, viewMode: 'window' },
      kdsWindowReady: { kdsMode: true, viewMode: 'window', readyStepOn: true },
      kdsCook: { kdsMode: true, viewMode: 'cook', cardStyle: 'cook', hideAmounts: true, showCookingStep: true },
      kdsWindowCookStyle: { kdsMode: true, viewMode: 'window', cardStyle: 'cook', hideAmounts: true },
      kdsNoPay: { kdsMode: true, viewMode: 'window', hidePayments: true },
    }
    const cardProps = (k, over = {}) => ({
      order: C.ORDERS[k], truck: T, event: C.EVENT, slots: [], actionLoading: null, onAction() {}, onRefund: async () => ({ ok: true, message: '' }), onEdit() {},
      ledgerRows: C.ORDER_CASES[k].ledger, heldAuthorisation: C.ORDER_CASES[k].held, ...over,
    })
    const card = (key, k, over, state) => put(`card|${key}`, M, h(M.OrderCard, cardProps(k, over)), state)
    for (const k of Object.keys(C.ORDERS)) {
      for (const [mk, mode] of Object.entries(MODES)) card(`${k}|${mk}`, k, mode)
      for (const [tk, truck] of Object.entries(trucks)) {
        if (tk === 'two') continue
        for (const mk of ['dash', 'kdsWindowReady', 'kdsWindow']) card(`${k}|${mk}|${tk}`, k, { ...MODES[mk], truck })
      }
      // the paid chip's / part-paid row's modal, from the card (every ledger case)
      card(`${k}|removePayment`, k, MODES.dash, { confirmRemovePayment: true })
      card(`${k}|removePayment|offline`, k, { ...MODES.dash, offline: true }, { confirmRemovePayment: true })
      card(`${k}|contact`, k, MODES.dash, { showContact: true })
    }
    const base = 'pay_at_hatch'
    const ord = (k, o) => ({ ...C.ORDERS[k], ...o })
    card('pendingSync', base, { ...MODES.dash, pendingSync: true })
    card('pendingSync|kds', base, { ...MODES.kdsWindow, pendingSync: true })
    card('conflict|payment', base, { ...MODES.kdsWindow, conflict: 'payment' })
    card('conflict|status', base, { ...MODES.kdsWindow, conflict: 'status' })
    card('pendingPaid', base, { ...MODES.kdsWindowReady, pendingPayment: 'pending_paid' })
    card('pendingUnpaid', 'card_paid', { ...MODES.kdsWindowReady, pendingPayment: 'pending_unpaid' })
    for (const [mk, mode] of Object.entries({ dash: MODES.dash, kdsWindow: MODES.kdsWindow, kdsCook: MODES.kdsCook })) {
      card(`buzzer|none|${mk}`, base, { ...mode, onBuzzer() {} })
      card(`buzzer|7|${mk}`, base, { ...mode, onBuzzer() {}, order: ord(base, { buzzer_number: 7 }) })
      for (const [sk, slot] of Object.entries({ late: '18:00', now: '18:20', in2h: '20:30', inMins: '18:45', asap: null, farPast: '09:00' })) {
        card(`slot|${sk}|${mk}`, base, { ...mode, order: ord(base, { slot, asap_estimate: null }) })
      }
      card(`noContact|${mk}`, base, { ...mode, order: ord(base, { customer_email: null, customer_phone: null, notes: null }) })
      card(`grouped|${mk}`, base, { ...mode, categoryOrder: ['Pizzas', 'Drinks'], itemCategoryMap: { Margherita: 'Pizzas', Coke: 'Drinks', Pepperoni: 'Pizzas', Fanta: 'Drinks' }, catConfigs: { pizzas: { prep_secs: 600, batch_size: 4 } } })
      card(`noDeals|${mk}`, base, { ...mode, order: ord(base, { deals: [] }) })
    }
    card('pub', 'cooking', { ...MODES.dash, truck: { ...T, mode: 'pub' }, order: ord('cooking', { status: 'confirmed' }) })
    card('emoji', base, { ...MODES.dashReady, truck: { ...T, truck_emoji: '🌮' } })
    card('loading|confirm', 'asap', { ...MODES.dash, actionLoading: `confirm-${C.ORDERS.asap.order_key}` })
    card('loading|cancel', base, { ...MODES.dash, actionLoading: `cancel-${C.ORDERS[base].order_key}` })
    card('vanNoCash', base, { ...MODES.dash, vanTakesCash: false })
    card('vanCash', base, { ...MODES.dash, truck: trucks.twoNoCash, vanTakesCash: true })

    // ══ PaymentActionsModal (standalone, inside the truck's money format) ══════════════════════════════
    const payBase = { open: true, onClose() {}, orderId: '41', orderKey: 'k', paidMinor: 4390, cardChargeMinor: 4390, refundedMinor: 0,
      charges: [{ channel: 'online', method: 'card', amountMinor: 4390 }], hasReversibleInPersonPayment: false, onUndoPayment() {}, onRefund: async () => ({ ok: true, message: '' }) }
    const pay = (key, over, state) => put(`pay|${key}`, M, h(M.PaymentActionsModal, { ...payBase, ...over }), state)
    pay('refund', {})
    pay('refund|partRefunded', { refundedMinor: 1000 })
    pay('refund|partial', {}, { mode: 'partial', amountInput: '12.5' })
    pay('refund|partialOver', {}, { mode: 'partial', amountInput: '99' })
    pay('refund|partialEmpty', {}, { mode: 'partial' })
    pay('refund|reasonOther', {}, { reason: 'other' })
    pay('refund|reasonOtherNote', {}, { reason: 'other', note: 'Burnt' })
    pay('refund|reason', {}, { reason: 'quality_issue', note: 'Cold' })
    pay('refund|busy', {}, { reason: 'quality_issue', busy: true })
    pay('refund|error', {}, { reason: 'quality_issue', error: 'The refund failed' })
    pay('done', {}, { done: 'Refunded in full.' })
    pay('offline', { offline: true })
    pay('offline|mixed', { offline: true, charges: [{ channel: 'online', method: 'card', amountMinor: 2000 }, { channel: 'in_person_other', method: 'cash', amountMinor: 2390 }] })
    pay('remove|cash', { hasReversibleInPersonPayment: true, cardChargeMinor: 0, charges: [{ channel: 'in_person_other', method: 'cash', amountMinor: 4390 }] })
    pay('remove|card', { hasReversibleInPersonPayment: true, cardChargeMinor: 0, charges: [{ channel: 'in_person_other', method: 'card', amountMinor: 4390 }] })
    pay('remove|unknown', { hasReversibleInPersonPayment: true, cardChargeMinor: 0, charges: [{ channel: 'in_person_other', method: null, amountMinor: 4390 }] })
    pay('remove|loading', { hasReversibleInPersonPayment: true, undoLoading: true, cardChargeMinor: 0, charges: [{ channel: 'in_person_other', method: 'cash', amountMinor: 4390 }] })
    pay('remove|mixedMethods', { hasReversibleInPersonPayment: true, charges: [{ channel: 'online', method: 'card', amountMinor: 2000 }, { channel: 'in_person_other', method: 'cash', amountMinor: 1000 }, { channel: 'in_person_other', method: 'card', amountMinor: 1390 }] })
    pay('paidByCard|noRefund', { onRefund: undefined })
    pay('paidByCard|fullyRefunded', { refundedMinor: 4390 })
    pay('paidByCard|noCharges', { onRefund: undefined, charges: [], cardChargeMinor: 0 })
    pay('closed', { open: false })

    // ══ AddOrderPanel ════════════════════════════════════════════════════════════════════════════════
    const A = B.add
    const menuGroups = {}
    for (const it of C.MENU.items) (menuGroups[it.category] ||= []).push(it)
    const EV = { ...C.EVENT, status: 'open' }
    const BASKET = [
      { name: 'Margherita', quantity: 2, unit_price: 10.75, modifiers: [{ name: 'Extra cheese', price: 1.25 }], cartKey: 'k1' },
      { name: 'Garlic bread', quantity: 1, unit_price: 4, modifiers: [], cartKey: 'k2' },
      { name: 'Coke', quantity: 3, unit_price: 1.8, modifiers: [], specialInstructions: 'No ice', cartKey: 'k3' },
    ]
    const DEALS = [{ bundle: { ...C.MENU.bundles[0], available: true }, slots: { Pizzas: 'Pepperoni', Drinks: 'Fanta' }, itemsTakenFromBasket: [], modifierExtra: 0.75, slotModifiers: { Pizzas: [{ name: 'Jalapeños', price: 0.75 }] }, slotNotes: { Drinks: 'Cold' } }]
    const SLOTS = ['18:30', '18:45', '19:00', '19:15'].map((t, i) => ({ collection_time: t, production_slot: t, current_orders: i, max_orders: 10, available: true, tone: i === 2 ? 'red' : i === 1 ? 'amber' : 'green', label: i ? `${i} Pizzas` : '' }))
      .concat([{ collection_time: '21:15', production_slot: '21:15', current_orders: 0, max_orders: 10, available: true, is_grace: true }])
    const addProps = (over = {}) => ({
      truck: T, truckMenu: C.MENU, menuGroups, itemStocks: [], categoryStocks: [], categoryConfigs: {}, categoryAllowNotes: {}, orders: [], waitMinutes: 0,
      token: 'harness', pin: '', todayEvent: EV, categoryOrder: ['Pizzas', 'Drinks', 'Sides'], itemCategoryMap: {}, showToast() {}, onOrderPlaced() {},
      controlledEvent: EV, isActive: true, vanTakesCash: null, ...over,
    })
    const aBase = { manualEvent: EV, eventsLoaded: true, upcomingEvents: [EV] }
    const aBasket = { ...aBase, manualItems: BASKET, appliedDeals: DEALS }
    const add = (key, over, state) => put(`add|${key}`, A, h(A.AddOrderPanel, addProps(over)), state)
    const scroll = { ...T, add_order_layout: 'scroll' }
    for (const [lk, tr] of Object.entries({ tabs: T, scroll })) {
      add(`${lk}|empty`, { truck: tr }, aBase)
      add(`${lk}|basket|paidStep`, { truck: tr }, aBasket)
      add(`${lk}|basket|noCash`, { truck: { ...tr, takes_cash: false } }, aBasket)
      add(`${lk}|basket|noPaidStep`, { truck: { ...tr, show_paid_step: false } }, aBasket)
      add(`${lk}|basket|noPaidStepNoCash`, { truck: { ...tr, show_paid_step: false, takes_cash: false } }, aBasket)
      add(`${lk}|closedCat`, { truck: tr, categoryStocks: [{ category: 'Pizzas', stock_count: null, default_stock: null, orders_count: 0, available: false }] }, aBasket)
      add(`${lk}|stock`, { truck: tr, itemStocks: [{ name: 'Margherita', stock_count: 4, orders_count: 0 }, { name: 'Pepperoni', stock_count: 0, orders_count: 0, available: false }, { name: 'Coke', stock_count: 3, orders_count: 0 }] }, aBasket)
      add(`${lk}|stockUnknown`, { truck: tr, stockStatus: 'unknown' }, aBase)
      add(`${lk}|stockStale`, { truck: tr, stockStatus: 'stale', stockCheckedAt: new Date('2026-10-09T17:05:00Z') }, aBase)
      add(`${lk}|stockStaleNoTime`, { truck: tr, stockStatus: 'stale' }, aBase)
      add(`${lk}|noMenu`, { truck: tr, truckMenu: null }, aBase)
    }
    for (const [sk, s] of Object.entries({ plain: 'plain', take: 'take', cash: 'take-cash', card: 'take-card' })) {
      add(`submitting|${sk}`, {}, { ...aBasket, submitting: s, loading: true })
      add(`submitting|${sk}|noPaidStep`, { truck: { ...T, show_paid_step: false } }, { ...aBasket, submitting: s, loading: true })
      add(`submitting|${sk}|noPaidStepNoCash`, { truck: { ...T, show_paid_step: false, takes_cash: false } }, { ...aBasket, submitting: s, loading: true })
    }
    // no event selected: every pay button reads "Select an event…", the banner says so
    add('noEvent', { todayEvent: null, controlledEvent: null }, { ...aBasket, manualEvent: null, upcomingEvents: [] })
    add('noEvent|noPaidStep', { todayEvent: null, controlledEvent: null, truck: { ...T, show_paid_step: false } }, { ...aBasket, manualEvent: null, upcomingEvents: [] })
    add('noEvent|noPaidStepNoCash', { todayEvent: null, controlledEvent: null, truck: { ...T, show_paid_step: false, takes_cash: false } }, { ...aBasket, manualEvent: null, upcomingEvents: [] })
    add('noEvent|noPaidStepEmpty', { todayEvent: null, controlledEvent: null, truck: { ...T, show_paid_step: false, takes_cash: false } }, { ...aBase, manualEvent: null, upcomingEvents: [] })
    // the event banner's states
    const tomorrow = { ...EV, id: 'ev-2', event_date: '2026-10-10', status: 'confirmed' }
    const later = { ...EV, id: 'ev-3', event_date: '2026-10-14', status: 'confirmed' }
    const todayConfirmed = { ...EV, status: 'confirmed' }
    const ended = { ...EV, status: 'confirmed', end_time: '18:00' }
    for (const [ek, ev] of Object.entries({ tomorrow, later, todayConfirmed, ended, closed: { ...EV, status: 'closed' } })) {
      add(`event|${ek}`, { todayEvent: ev, controlledEvent: ev, onOpenEvent() {} }, { ...aBasket, manualEvent: ev, upcomingEvents: [ev] })
      add(`event|${ek}|demo`, { todayEvent: ev, controlledEvent: ev, onOpenEvent() {}, isDemo: true }, { ...aBasket, manualEvent: ev, upcomingEvents: [ev] })
    }
    // slots, the ASAP readout and the buzzer button
    const capIn = { productionSlotUnits: { '18:30': { pizzas: 6 } }, kitchenCapacity: 2, capacityWindowMins: 15, intervalMins: 15, eventStartMins: 17 * 60, eventEndMins: 21 * 60, earliestCollectionMins: 0, date: '2026-10-09', nowMins: 0, windowSecs: 900, reservations: [], batchReservations: false }
    add('slots|empty', {}, { ...aBase, apiSlots: SLOTS })
    add('slots|basket', {}, { ...aBasket, apiSlots: SLOTS })
    add('slots|capacity', {}, { ...aBasket, apiSlots: SLOTS, apiCapacityInputs: capIn, apiCatConfigs: { pizzas: { secs: 600, batch: 2 } } })
    add('slots|capacityEmpty', {}, { ...aBase, apiSlots: SLOTS, apiCapacityInputs: capIn, apiCatConfigs: { pizzas: { secs: 600, batch: 2 } } })
    add('slots|chosen', {}, { ...aBasket, apiSlots: SLOTS, manualSlot: '18:45' })
    add('ready|mins', { categoryConfigs: { pizzas: { secs: 600, batch: 4 } } }, aBasket)
    add('ready|oneMin', { waitMinutes: 1 }, aBasket)
    const slowCfg = { pizzas: { secs: 14400, batch: 1 }, drinks: { secs: 14400, batch: 1 }, sides: { secs: 14400, batch: 1 } }
    add('slots|noFit', {}, { ...aBasket, apiSlots: SLOTS, apiCapacityInputs: { ...capIn, kitchenCapacity: 1 }, apiCatConfigs: slowCfg })
    add('ready|wait', { waitMinutes: 25 }, aBasket)
    add('ready|hours', { waitMinutes: 90 }, aBasket)
    add('ready|hour', { waitMinutes: 60 }, aBasket)
    add('ready|future', { waitMinutes: 25, todayEvent: tomorrow, controlledEvent: tomorrow }, { ...aBasket, manualEvent: tomorrow, upcomingEvents: [tomorrow] })
    add('buzzer|none', { buzzerCount: 8 }, aBasket)
    add('buzzer|3', { buzzerCount: 8 }, { ...aBasket, manualBuzzer: 3 })
    add('buzzer|picker', { buzzerCount: 8 }, { ...aBasket, manualBuzzer: 3, showBuzzerPicker: true })
    add('buzzer|prompt', { buzzerCount: 8, buzzerPromptEnabled: true }, { ...aBase, buzzerPrompt: { orderKey: 'k', orderId: '12', resolve() {} } })
    // sheets and modals
    add('sheet', {}, { ...aBasket, showOrderSheet: true })
    add('sheet|one', {}, { ...aBase, manualItems: [BASKET[1]], showOrderSheet: true })
    const it0 = C.MENU_ITEMS[0]
    add('itemModal', {}, { ...aBasket, itemModal: { item: it0, modGroups: it0.modifierGroups }, modalMods: [{ name: 'Extra cheese', price: 1.25 }] })
    add('itemModal|edit', {}, { ...aBasket, itemModal: { item: it0, modGroups: it0.modifierGroups, editCartKey: 'k1' }, modalMods: [{ name: 'Extra cheese', price: 1.25 }], modalNotes: 'Well done' })
    const reqGroup = { id: 'g2', name: 'Base', min_choices: 1, max_choices: 1, is_required: true, options: [{ id: 'o3', name: 'Thin', price_adjustment: 0 }, { id: 'o4', name: 'Deep', price_adjustment: 1.5, stock_count: 0 }] }
    add('itemModal|required', {}, { ...aBasket, itemModal: { item: it0, modGroups: [reqGroup, ...it0.modifierGroups] }, modalMods: [] })
    const fit = { title: 'Over capacity at 18:30', lines: ['The kitchen can cook 2 pizzas in that window.', 'Pizzas · 6 of 2'] }
    add('capacity|over', {}, { ...aBasket, capacityConfirm: { slot: '18:30', variant: 'over', message: fit, override: false } })
    add('capacity|filled', {}, { ...aBasket, capacityConfirm: { slot: '18:30', variant: 'filled', message: fit, override: false } })
    add('capacity|stale', {}, { ...aBasket, capacityConfirm: { slot: '18:30', variant: 'toosoon', message: fit, override: true, stale: true } })
    add('picker', {}, { ...aBasket, showEventPicker: true, upcomingEvents: [EV, tomorrow] })
    add('picker|loading', {}, { ...aBasket, showEventPicker: true, upcomingEvents: [], eventsLoaded: false })
    add('picker|empty', {}, { ...aBasket, showEventPicker: true, upcomingEvents: [] })
    add('picker|offline', { isOffline: true, isEventLoaded: id => id === EV.id }, { ...aBasket, showEventPicker: true, upcomingEvents: [EV, tomorrow] })
    add('offline', { isOffline: true, offlineCapacity: { eventId: EV.id, slots: SLOTS, productionSlotUnits: {}, kitchenCapacity: null, capacityWindowMins: 15, eventStartMins: 17 * 60, catConfigs: {} } }, aBasket)
    add('optionStock', { truckMenu: { ...C.MENU, items: C.MENU.items.map(i => i.id === 'i1' ? { ...i, modifierGroups: [{ ...i.modifierGroups[0], options: [{ id: 'o1', name: 'Extra cheese', price_adjustment: 1.25, stock_count: 2 }] }] } : i) } }, aBasket)

    // ══ the shared kitchen modals ════════════════════════════════════════════════════════════════════
    const X = B.misc
    const REJECT = [['', null], ['Sold out of an item', 'sold_out'], ["Too busy — can't make it in time", 'too_busy'], ['Closing soon', 'closing_soon'], ['Other', 'other']]
    const rejectProps = { orderId: 12, customerName: 'Sam Harness', totalLabel: ' · £43.90', onConfirm() {}, onDismiss() {} }
    for (const [label, id] of REJECT) {
      for (const note of ['', 'Sorry about this']) {
        const state = { reason: label, note }
        put(`reject|${id || 'none'}|${note ? 'note' : 'noNote'}`, X, h(X.RejectOrderModal, rejectProps), state)
      }
    }
    // 🔴 THE STORED TEXT: press "Reject order" in every reason × note state and record what onConfirm receives
    const stored = (key, el, state, label) => {
      const got = []
      const { buttons } = withButtons(REPO, () => html(state, wrap(X, el(got))))
      const b = buttons.find(x => x.text === label)
      if (!b) { out[`${cc}|stored|${key}`] = 'ERROR no button ' + label; return }
      try { b.onClick({}) } catch (e) { got.push('THREW ' + e.message) }
      out[`${cc}|stored|${key}`] = JSON.stringify({ disabled: b.disabled, calls: got })
    }
    for (const [label, id] of REJECT) {
      for (const note of ['', '  Sorry about this  ']) {
        const state = { reason: label, note }
        stored(`reject|${id || 'none'}|${note ? 'note' : 'noNote'}`, got => h(X.RejectOrderModal, { ...rejectProps, onConfirm: r => got.push([r]) }), state, 'Reject order')
      }
    }
    const CANCEL = [['', null], ['Vehicle breakdown', 'vehicle_breakdown'], ['Weather', 'weather'], ['Venue issue', 'venue_issue'], ['Personal emergency', 'personal_emergency'], ['Other', 'other']]
    const evFull = { ...C.EVENT, venue_name: 'The Green', town: 'Harnessville' }
    const cancelProps = { time: T.time, event: evFull, affectedOrderCount: 3, onKeep() {}, onConfirm() {} }
    for (const [label, id] of CANCEL) {
      for (const note of ['', 'Sorry, the van broke down']) {
        const state = { reason: label, note }
        put(`cancel|${id || 'none'}|${note ? 'note' : 'noNote'}`, X, h(X.EventCancelModal, cancelProps), state)
        stored(`cancel|${id || 'none'}|${note ? 'note' : 'noNote'}`, got => h(X.EventCancelModal, { ...cancelProps, onConfirm: (r, n) => got.push([r, n]) }), state, 'Cancel event')
      }
    }
    put('cancel|count1', X, h(X.EventCancelModal, { ...cancelProps, affectedOrderCount: 1 }))
    put('cancel|count0', X, h(X.EventCancelModal, { ...cancelProps, affectedOrderCount: 0 }))
    put('cancel|busy', X, h(X.EventCancelModal, { ...cancelProps, busy: true }))
    put('cancel|noTown', X, h(X.EventCancelModal, { ...cancelProps, event: { ...evFull, town: null, end_time: null } }))

    const actProps = { time: T.time, event: { id: 'ev-1', venue_name: 'The Green', status: 'open', town: 'Harnessville', event_date: '2026-10-09', start_time: '17:00', end_time: '21:00' },
      noteValue: '', onNoteChange() {}, onSaveNote() {}, onChangeFinishTime() {}, onFinishEvent() {}, onCancelEvent() {}, onClose() {} }
    const all = { onStartEvent() {}, onChangeEvent() {}, onChangeEventType() {}, onPrivateLink() {}, onPause() {}, onResume() {} }
    for (const status of ['open', 'confirmed', 'closed']) {
      put(`actions|${status}|all`, X, h(X.EventActionsModal, { ...actProps, ...all, event: { ...actProps.event, status } }))
      put(`actions|${status}|paused`, X, h(X.EventActionsModal, { ...actProps, ...all, paused: true, event: { ...actProps.event, status } }))
      put(`actions|${status}|none`, X, h(X.EventActionsModal, { ...actProps, event: { ...actProps.event, status } }))
    }
    put('actions|bare', X, h(X.EventActionsModal, { ...actProps, noteValue: 'Park at the back', event: { id: 'ev-1', venue_name: 'The Green', status: 'open' }, extraWaitControl: h('div', null, 'extra') }))
    put('actions|dateOnly', X, h(X.EventActionsModal, { ...actProps, event: { ...actProps.event, start_time: null, end_time: null } }))

    const finOrders = [{ slot: '20:30', status: 'confirmed' }, { slot: '20:45:00', status: 'ready' }, { slot: '20:50', status: 'collected' }, { slot: null, status: 'pending' }]
    const finEv = { id: 'ev-1', end_time: '21:00:00', event_date: '2026-10-09' }
    const fin = (key, over, state) => put(`finish|${key}`, X, h(X.EventFinishTimeModal, { event: finEv, orders: finOrders, onClose() {}, onConfirm() {}, ...over }), state)
    fin('pick', {})
    fin('pick|earlier', {}, { selected: '20:00' })
    fin('pick|later', {}, { selected: '22:00' })
    fin('pick|noEnd', { event: { ...finEv, end_time: null } })
    fin('pick|past', { event: { ...finEv, event_date: '2026-10-01' } })
    fin('pick|pastCurrent', { event: { ...finEv, end_time: '18:00' } })
    fin('confirm|two', {}, { step: 'confirm', selected: '20:00' })
    fin('confirm|one', {}, { step: 'confirm', selected: '20:40' })
    fin('confirm|none', {}, { step: 'confirm', selected: '22:00' })
    fin('confirm|noEnd', { event: { ...finEv, end_time: null } }, { step: 'confirm', selected: '20:00' })
    fin('confirm|busy', { busy: true }, { step: 'confirm', selected: '20:00' })

    put('extraWait', X, h(X.ExtraWaitModal, { onPick() {}, onClose() {} }))

    const pickEvents = [{ ...C.EVENT, status: 'open' }, { ...C.EVENT, id: 'ev-2', event_date: '2026-10-10', status: 'confirmed', town: null }, { ...C.EVENT, id: 'ev-3', event_date: '2026-10-12', status: 'closed', venue_name: null, town: null }]
    const picker = (key, over) => put(`picker|${key}`, X, h(X.EventPickerPanel, { open: true, events: pickEvents, isSelected: e => e.id === 'ev-1', onSelect() {}, onClose() {}, title: 'Switch event', closeLabel: 'Close', time: T.time, ...over }))
    picker('list', {})
    picker('blocked', { isEventBlocked: e => e.id === 'ev-2' })
    picker('empty', { events: [], emptyState: h('p', null, 'none') })
    picker('demo', { isDemo: true })

    // ══ buzzers ══════════════════════════════════════════════════════════════════════════════════════
    const gridOrders = [{ order_key: 'a', id: '12', customer_name: 'Sam', status: 'confirmed', event_id: 'ev-1', buzzer_number: 2 }, { order_key: 'b', id: '15', customer_name: '', status: 'ready', event_id: 'ev-1', buzzer_number: 4 }]
    const grid = (key, over, state) => put(`grid|${key}`, X, h(X.BuzzerGrid, { open: true, buzzerCount: 6, orders: gridOrders, eventId: 'ev-1', targetOrderKey: 'c', targetOrderId: '20', currentNumber: null, onAssign() {}, onClose() {}, ...over }), state)
    grid('free', {})
    grid('current', { currentNumber: 5 })
    grid('noTarget', { targetOrderId: '', targetOrderKey: '' })
    grid('noTarget|current', { targetOrderId: '', targetOrderKey: '', currentNumber: 1 })
    grid('blocking', { blocking: true })
    grid('blocking|noId', { blocking: true, targetOrderId: '' })
    grid('allTaken', { buzzerCount: 3, currentNumber: 1, orders: [...gridOrders, { order_key: 'd', id: '16', customer_name: 'Al', status: 'confirmed', event_id: 'ev-1', buzzer_number: 3 }] })
    grid('saving', { saving: true })
    grid('take|named', {}, { pending: { kind: 'take', number: 2, holder: { order_key: 'a', id: '12', customer_name: 'Sam' } } })
    grid('take|unnamed', { targetOrderId: '' }, { pending: { kind: 'take', number: 4, holder: { order_key: 'b', id: '15', customer_name: '' } } })
    grid('closed', { open: false })
    const losses = [{ order_key: 'a', id: '12', customer_name: 'Sam Harness', lost_at: '2026-10-09T17:00:00Z' }, { order_key: 'b', id: '15', customer_name: '', lost_at: '2026-10-09T17:01:00Z' }]
    put('buzzerLost', X, h(X.BuzzerLostBanner, { losses, dismissedKeys: new Set(), onDismiss() {}, onAssign() {} }))
    put('buzzerLost|dismissed', X, h(X.BuzzerLostBanner, { losses, dismissedKeys: new Set(['a', 'b']), onDismiss() {}, onAssign() {} }))

    // ══ capacity ═════════════════════════════════════════════════════════════════════════════════════
    const brOrders = [{ order_key: 'a', id: 12, slot: '18:30', items: [{ quantity: 2 }, { quantity: 1 }] }, { order_key: 'b', id: 15, slot: '18:30', items: [{ quantity: 1 }] },
      { order_key: 'c', id: 16, slot: '18:45', items: [{ quantity: 1 }] }, { order_key: 'd', id: 17, slot: '19:00', items: [] }]
    const breach = (t, reason, keys, ids, over = {}) => ({ collection_time: t, reason, over_total: 0, over_cats: [], order_keys: keys, order_ids: ids, ...over })
    const banner = (key, breaches, orders = brOrders) => put(`breach|${key}`, X, h(X.CapacityBreachBanner, { breaches, dismissedSig: null, onDismiss() {}, orders }))
    banner('batch', [breach('18:30', 'Pizzas 5/4', ['a', 'b'], [12, 15], { over_cats: [{ cat: 'Pizzas', over: 1 }] })])
    banner('kitchen', [breach('18:30', 'global ceiling', ['a', 'b'], [12, 15], { over_total: 2 }), breach('18:45', 'global ceiling', ['c'], [16], { over_total: 1 })])
    banner('kitchenOne', [breach('18:45', 'global ceiling', ['c'], [16], { over_total: 1 })])
    banner('eventStart', [breach('19:00', 'over capacity at event-start', ['d'], [17], { over_total: 1 })])
    banner('eventStartOne', [breach('18:45', 'over capacity at event-start', ['c'], [16], { over_total: 1 })])
    banner('override', [breach('18:30', 'Pizzas 5/4', ['a'], [12], { override_orders: [{ order_key: 'a', id: 12, slot: '18:30' }, { order_key: 'b', id: 15, slot: '18:45' }] })])
    banner('orphans', [breach('18:30', 'global ceiling', [], [], { over_total: 1 }), breach('19:30', 'global ceiling', [], [], { over_total: 1 })])
    banner('noOrders', [breach('18:30', 'global ceiling', ['a'], [12], { over_total: 1 })], undefined)
    banner('none', [])

    const daySlots = [{ collection_time: '18:30', production_slot: '18:30', current_orders: 1, max_orders: 4, available: true, tone: 'green', label: '2 Pizzas' },
      { collection_time: '18:45', production_slot: '18:45', current_orders: 3, max_orders: 4, available: true, tone: 'red', label: '' },
      { collection_time: '19:00', production_slot: '19:00', current_orders: 2, max_orders: 4, available: true, tone: 'amber', label: '1 Pizza, 1 Other' }]
    for (const variant of ['strip', 'sidebar']) {
      put(`dayLoad|${variant}`, X, h(X.DayLoadStrip, { slots: daySlots, eventDate: '2026-10-10', variant, time: T.time }))
      put(`dayLoad|${variant}|breached`, X, h(X.DayLoadStrip, { slots: daySlots, eventDate: '2026-10-10', variant, time: T.time, breachedSlots: new Set(['18:45']) }))
    }

    // ══ demo ═════════════════════════════════════════════════════════════════════════════════════════
    put('demoLock', X, h(X.DemoLockChip, {}))
    put('demoLock|class', X, h(X.DemoLockChip, { className: 'ml-1' }))
    put('demoBanner', X, h(X.DemoModeBanner, {}))
    put('demoBanner|action', X, h(X.DemoModeBanner, { action: h('button', null, 'Set up my truck') }))
    const loopOrders = [C.ORDERS.pay_at_hatch, C.ORDERS.card_paid]
    const loop = (key, state, over = {}) => put(`demoLoop|${key}`, X, h(X.DemoLoopComplete, { token: 'harness', orderKeys: loopOrders.map(o => o.order_key), orders: loopOrders, loaded: true, phone: C.phone, ...over }), state)
    loop('hidden', null)
    loop('one', { visible: true, freshKeys: [loopOrders[0].order_key] })
    loop('ambiguous', { visible: true, freshKeys: loopOrders.map(o => o.order_key) })
    loop('unknown', { visible: true, freshKeys: ['missing'] })
    loop('sample', { visible: true, freshKeys: [loopOrders[0].order_key] }, { extractionSource: 'template' })
    const welcome = (key, over = {}, state = null) => {
      globalThis.__lpWelcomeOpen = true
      try { put(`demoWelcome|${key}`, X, h(X.DemoWelcome, { token: 'harness', orderUrl: 'https://example.test/trucks/test-kitchen/order', ...over }), state) } finally { delete globalThis.__lpWelcomeOpen }
    }
    welcome('own')
    welcome('sample', { isSample: true })
    welcome('noUrl', { orderUrl: null })
    welcome('qr', {}, { qrDataUrl: 'data:image/png;base64,AAAA' })
    welcome('qrFailed', {}, { qrFailed: true })
    welcome('oneCash', { completionPresses: 'one', takesCash: true })
    welcome('oneNoCash', { completionPresses: 'one', takesCash: false })
    welcome('two', { completionPresses: 'two', takesCash: true })
    put('demoWelcome|seen', X, h(X.DemoWelcome, { token: 'harness', orderUrl: null }))
    for (const ws of ['held', 'denied', 'unsupported', 'insecure', 'native', 'off', 'unknown']) {
      put(`keepAwake|${ws}`, X, h(X.KeepAwakePrompt, { keepScreenOn: true, wakeState: ws, onAcquire() {} }))
    }
    put('keepAwake|notWanted', X, h(X.KeepAwakePrompt, { keepScreenOn: false, wakeState: 'denied', onAcquire() {} }))

    // ══ the user menu ════════════════════════════════════════════════════════════════════════════════
    const menuBase = { truckName: 'Pizza Kitchen', operatorName: 'Dom Harness', userEmail: 'dom@example.test', token: 'harness' }
    const um = (key, over, state = { open: true }) => put(`userMenu|${key}`, X, h(X.UserMenu, { ...menuBase, ...over }), state)
    um('closed', {}, null)
    um('dashboard', { showScreenToggle: true, showOrderUtilities: true, showManageLink: true, isAdmin: true, onToggleSound() {}, keepScreenOn: true, soundEnabled: true })
    um('dashboardOff', { showScreenToggle: true, showOrderUtilities: true, showManageLink: true, onToggleSound() {}, keepScreenOn: false, soundEnabled: false, copiedOrderLink: true })
    um('manage', { showDashboardLink: true, operatorName: null })
    um('demo', { showSignOut: false, showIdentity: false, showScreenToggle: true, showOrderUtilities: true })
    um('anon', { operatorName: '  ', userEmail: null })
    globalThis.__lpNative = true
    try { um('native', { showManageLink: true }) } finally { delete globalThis.__lpNative }
    um('deviceSheet', {}, { open: false, deviceOpen: true })
  }
  return out
}

module.exports = { views }
