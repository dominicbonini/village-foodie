// scripts/_lp1b-dashboard.cjs — Language Phase 1b, area "dashboard": app/dashboard/[token]/page.tsx (the operator
// board). Run by scripts/language-phase-1b.cjs (`--only=dashboard`, `--recapture=dashboard`).
//
// ── WHAT IS CAPTURED, FOR A GB TRUCK AND A US TRUCK ─────────────────────────────────────────────────────────
// 1. THE PAGE, as full HTML, started in ~100 states (useState patched from fixtures): loading, the PIN screen and
//    its four errors, access denied, board unavailable, the orders tab with orders in every status and payment
//    state, the completed list, the prep list, every banner (degraded, menu snapshot, paused manual / indefinite /
//    offline, extra wait, card payments off, prep times, recently closed), the stock tab (stock, defaults, sold
//    out, closed category, price editing, the standing-option stock), the settings tab in its variants, the add tab,
//    every modal the page itself renders (cancel with each reason and each refund case, reject, edit order + item
//    sheet + reprice + slot list, pause, finish confirm, screen-off, KDS picker, profile, event type picker and its
//    confirm, demo event lock, offline-paused notice, QR fullscreen, private link) and the demo states.
// 2. THE HANDLERS' WORDS: the page's own event handlers, run against the closure of a rendered state with an
//    in-process fetch stub (nothing is sent anywhere), recording every toast, every confirm() sentence, every
//    error a handler writes into a state, and the refund sentences submitRefund returns.
// A state an EFFECT (or a useCallback) sets holds a CODE after this phase; its fixture holds the OLD SENTENCE and
// `__after` the code, so the AFTER render is proven to show the sentence byte for byte.
const F = 'app/dashboard/[token]/page.tsx'

// Every useState the fixtures start from. A name that stops matching fails the bundle (the kit checks).
const STATES = ['truck', 'orders', 'loading', 'error', 'authenticated', 'requiresPin', 'pinInput', 'pinError', 'boardUnavailable', 'degraded',
  'menuSnapshotAt', 'lastRefresh', 'truckMenu', 'todayEvents', 'upcomingEvents', 'selectedEventId', 'eventsLoaded', 'firstOpenChecked', 'payments',
  'heldAuthorisations', 'paymentFailures', 'showCompleted', 'activeTab', 'showCancelModal', 'cancellingOrder', 'cancelReason', 'cancelRefund',
  'cancelError', 'cancelBusy', 'cancelNote', 'showRejectModal', 'rejectingOrder', 'editingOrder', 'editItems', 'editDeals', 'editOrderBaseline',
  'editReprice', 'editItemModal', 'editModalMods', 'editSlots', 'editSlotsLoading', 'editSlot', 'fetchedStockKeys', 'itemStocksByEvent',
  'categoryStocksByEvent', 'eventCharged', 'eventOwnPrice', 'eventFallback', 'eventTypeName', 'priceReady', 'eventPriceLive', 'priceEditing',
  'pricePending', 'priceSaving', 'showEventMenu', 'finishTimeTarget', 'finishConfirm', 'showDemoEventLock', 'eventCancelTarget', 'showPauseModal',
  'showExtraWaitPicker', 'showScreenOffWarning', 'showKDSPicker', 'vans', 'showProfileModal', 'editProfileName', 'currentUserEmail',
  'savingProfile', 'showQRFullscreen', 'qrFullscreenDataUrl', 'showOfflinePausedNotice', 'pausedUntil', 'vanPausedUntil', 'vanOnlinePausedUntil',
  'deviceOnline', 'extraWaitMins', 'extraWaitStartedAt', 'showPrepList', 'showPrepTimeBanner', 'struckPrep', 'categoryConfigs', 'demoSession',
  'restarting', 'restartError', 'isAdmin', 'typePicker', 'typePending', 'typeClearOwn', 'typeBusy', 'eventTypeList', 'eventType',
  'privateLinkData', 'privateOrderUrl', 'isOffline', 'autoAccept', 'savingAutoAccept', 'savingAddOrderLayout', 'savingPaidStepOverride',
  'savingCompletionOverride', 'savingTakesCashOverride', 'savingBuzzerPrompt', 'savingOnlinePaymentsPause', 'vanBuzzerCount',
  'effectiveBuzzerPrompt', 'eventIntervals', 'eventIntervalsAvailable', 'vanIntervalPair', 'savingIntervals', 'kitchenCapacity',
  'capacityWindowMins', 'activeVanName', 'activeVanCount', 'eventOfflineOverride', 'eventOfflineModeOverride', 'eventAutoRejectOverride',
  'vanAutoPause', 'capacityBreaches', 'buzzerLosses', 'buzzerTarget', 'wakeState', 'soundEnabled', 'copiedOrderLink', 'offlinePauseAcked',
  'editingCatId', 'editCatForm', 'showEditDealModal', 'payModalOrder', 'actionLoading']

// The handlers whose words are captured, exposed on globalThis.__msH as the render defines them.
const HANDLERS = ['openOrderFromPush=useCallback(', 'handleCopyOrderLink=async(', 'startNewService=async(', 'handleShowQR=async(', 'submitPin=async(',
  'savePrintTriggerMode=async(', 'saveAddOrderLayout=async(', 'saveAutoAccept=async(', 'saveOnlinePaymentsPaused=async(', 'saveCollectionIntervals=async(',
  'savePaidStepOverride=async(', 'saveCompletionPressesOverride=async(', 'saveTakesCashOverride=async(', 'saveBuzzerPromptOverride=async(',
  'saveBuzzer=async(', 'saveSoundConfig=(', 'setOfflineMode=async(', 'setAutoRejectMins=async(', 'saveCatEdit=async(', 'submitRefund=async(',
  'submitEdit=async(', 'updateCategoryAvailable=async(', 'updateModifierOptionAvailable=async(', 'updateModifierOptionStock=async(', 'openEvent=async(',
  'applyFinishTime=async(', 'doFinishEvent=async(', 'confirmCancelOrder=async(', 'doCancelEvent=async(', 'saveEventNote=async(', 'switchEvent=(',
  'savePriceEdit=useCallback(']
// An inline handler the page passes as a prop, exposed the same way.
const INLINE = [{ from: 'onEventChange={(id)=>{', to: 'onEventChange={(globalThis.__msH||={}).onEventChange=(id)=>{' }]

// The states whose SETTER calls a handler run records (the ones that hold words).
const RECORDED_SETS = new Set(['pinError', 'cancelError', 'restartError'])

const MS_USE_OLD = "const __msUse = (k, p) => (globalThis.__ms && Object.prototype.hasOwnProperty.call(globalThis.__ms, k) ? [globalThis.__ms[k], p[1]] : p);"
const MS_USE_NEW = "const __msUse = (k, p) => { const v = globalThis.__ms && Object.prototype.hasOwnProperty.call(globalThis.__ms, k) ? globalThis.__ms[k] : p[0]; " +
  "return [v, x => { if (globalThis.__msSets && globalThis.__msRec && globalThis.__msRec.has(k)) globalThis.__msSets.push([k, typeof x === 'function' ? '[fn]' : x]); return p[1](x) }] };"

// ── OTHER AREAS' COMPONENTS ARE STAND-INS HERE. Every component the page imports from components/** is owned by
// another area of this phase (and proved there); this area proves THIS FILE. A stand-in renders
// <x-stub data-c="Name" data-p="{every prop the page passed, as JSON}"> with the page's element props and children
// inside it — so every word the page hands a component (a label, an aria-label, a total) is still captured, and a
// change inside the component itself cannot show up as a change here. MoneyContext, the dashboard types and helpers
// are not components and stay real.
const REAL = new Set(['@/components/dashboard/types', '@/components/dashboard/helpers', '@/components/MoneyContext'])
function componentStubs(src) {
  const stubs = {}
  for (const mm of src.matchAll(/^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*'(@\/components\/[^']+)'/gm)) {
    const [, def, named, spec] = mm
    if (REAL.has(spec)) continue
    const names = (named || '').split(',').map(x => x.trim()).filter(x => x && !x.startsWith('type ')).map(x => x.split(/\s+as\s+/)[0])
    stubs[spec] = names.map(n => `export const ${n} = props => globalThis.__msStub(${JSON.stringify(n)}, props)`).join('\n') +
      (def ? `\nexport default props => globalThis.__msStub(${JSON.stringify(def)}, props)` : '')
  }
  return stubs
}
function installStub(kit) {
  const React = require(require('path').join(kit.REPO || require('path').resolve(__dirname, '..'), 'node_modules/react'))
  const replacer = (k, v) => (v instanceof Set ? { set: [...v] } : v instanceof Map ? { map: [...v] } : v)
  globalThis.__msStub = (name, props) => {
    const kids = []; const data = {}
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'children') { kids.push(React.createElement('x-children', { key: 'c' }, v)); continue }
      if (typeof v === 'function') { data[k] = '[fn]'; continue }
      if (React.isValidElement(v)) { data[k] = '[element]'; kids.push(React.createElement('x-prop', { key: k, 'data-k': k }, v)); continue }
      data[k] = v
    }
    return React.createElement('x-stub', { 'data-c': name, 'data-p': JSON.stringify(data, replacer) }, ...kids)
  }
}

async function views(ctx) {
  const { kit, h, html } = ctx
  installStub(kit)
  const m = await kit.bundle('lp1b-dash', `export { default as Dash } from '@/${F}'\nexport { MoneyProvider } from '@/components/MoneyContext'`, {
    patches: [
      { file: F, states: STATES },
      { file: F, from: MS_USE_OLD, to: MS_USE_NEW },
      { file: F, from: 'const{token}=use(params)', to: 'const{token}=params' },
      { file: F, from: 'const{toasts,showToast,dismissToast}=useToasts()',
        to: 'const{toasts,showToast:__msShowToast,dismissToast}=useToasts();const showToast=(msg,type)=>{if(globalThis.__msToasts)globalThis.__msToasts.push(type===undefined?[msg]:[msg,type]);return __msShowToast(msg,type)}' },
      ...INLINE.map(p => ({ file: F, ...p })),
      ...HANDLERS.map(hd => { const name = hd.split('=')[0]; return { file: F, from: `const ${hd}`, to: `const ${name}=(globalThis.__msH||={}).${name}=${hd.slice(name.length + 1)}` } }),
    ],
    // the QR builder records what it was asked to draw (the page's demo placeholder words among it)
    stubs: { ...componentStubs(ctx.read(F)), '@/lib/generateQRCode': 'export async function generateQRWithLogo(...a) { if (globalThis.__msQr) globalThis.__msQr.push(a); return "data:image/png;base64,QR" }' },
  })
  const out = {}
  const unhandled = []
  const onUnhandled = e => { unhandled.push(String(e && e.message || e)) }
  process.on('unhandledRejection', onUnhandled)
  try {
    for (const cc of ['GB', 'US']) {
      const C = ctx[cc]
      const NOW = Date.parse(ctx.FIX.NOW)
      const iso = mins => new Date(NOW + mins * 60000).toISOString()
      const O = C.ORDERS
      const EVENT = { ...C.EVENT, truck_id: 'test-truck', venue_address: null, address: null, postcode: null, auto_open: false, auto_close: false,
        opened_at: iso(-80), closed_at: null, confirmed_at: null, customer_note: 'Parking round the back', notes: null, source: null, van_id: 'van-1' }
      const truck = { ...C.TRUCK, stripe_charges_enabled: true, online_payments_paused_at: null, add_order_layout: 'tabs', print_trigger_mode: 'lead_time', sound_config: null, truck_emoji: null, qr_code_style: 'standard', feature_overrides: {}, trial_expires_at: null }
      const menuCats = C.MENU.categories.map((c, i) => ({ ...c, prep_secs: c.name === 'Pizzas' ? 300 : 0, batch_size: c.name === 'Pizzas' ? 2 : 1, default_stock: c.name === 'Drinks' ? 24 : null, counts_toward_capacity: c.name === 'Sides', subcategories: [], sort_order: i,
        modifierGroups: c.name === 'Pizzas' ? C.MENU_ITEMS[0].modifierGroups : [], allowNotes: c.name === 'Pizzas' }))
      const menuItems = C.MENU.items.map(i => ({ ...i, default_stock: i.name === 'Pepperoni' ? 12 : null }))
      const MENU = { ...C.MENU, categories: menuCats, items: menuItems }
      const orders = Object.values(O)
      const payments = C.PAYMENTS
      const base = { truck, orders, loading: false, authenticated: true, truckMenu: MENU, todayEvents: [EVENT], upcomingEvents: [EVENT], selectedEventId: 'ev-1',
        eventsLoaded: true, firstOpenChecked: true, fetchedStockKeys: new Set(['ev-1']), payments, heldAuthorisations: C.HELD, deviceOnline: true,
        categoryConfigs: { pizzas: { secs: 300, batch: 2 }, drinks: { secs: 0, batch: 1 }, sides: { secs: 0, batch: 1 } } }
      const dash = token => h(m.Dash, { params: { token } })
      const S = {}   // scenario → [state, token]
      const add = (k, st, token = 'harness') => { S[k] = [st, token] }

      // ── the gates ──
      add('loading', { loading: true })
      add('pin', { loading: false, requiresPin: true, authenticated: false })
      add('pinInput', { loading: false, requiresPin: true, authenticated: false, pinInput: '12' })
      for (const [k, e] of Object.entries({ unreachable: 'Can\'t reach the server right now. Your PIN is fine — try again in a moment.', incorrect: 'Incorrect PIN',
        invalid: 'This link is no longer valid.', other: 'Something went wrong. Try again.' })) add(`pinError|${k}`, { loading: false, requiresPin: true, authenticated: false, pinError: e })
      // fetchAll (a useCallback) sets `error`: AFTER it holds a code
      add('accessDenied', { loading: false, authenticated: false, error: 'Invalid access link', __after: { error: 'invalidAccessLink' } })
      add('accessDeniedServer', { loading: false, authenticated: false, error: 'Some server sentence' })
      add('boardUnavailableNoTruck', { loading: false, authenticated: false, boardUnavailable: true })

      // ── the orders tab ──
      add('orders', { ...base, showCompleted: true })
      add('ordersCollapsed', { ...base, showCompleted: false })
      add('ordersUnrecorded', { ...base, showCompleted: true, paymentFailures: new Set([O.walk_up.order_key, O.part_refunded.order_key]) })
      add('ordersEmpty', { ...base, orders: [] })
      add('ordersAllDone', { ...base, orders: [O.walk_up, O.part_refunded] })
      add('ordersNoCancelled', { ...base, orders: [O.card_paid, O.walk_up], showCompleted: true })
      add('boardUnavailable', { ...base, orders: [], boardUnavailable: true })
      add('noEvent', { ...base, selectedEventId: null, upcomingEvents: [], todayEvents: [] })
      add('degradedUnreachable', { ...base, degraded: { since: new Date(NOW - 120000), kind: 'unreachable' } })
      add('degradedServer', { ...base, degraded: { since: new Date(NOW - 120000), kind: 'server-error', status: 503 } })
      add('menuSnapshot', { ...base, menuSnapshotAt: new Date(NOW - 3600000) })
      add('pausedManual', { ...base, vanPausedUntil: iso(20) })
      add('pausedIndefinite', { ...base, vanPausedUntil: new Date('2099-01-01').toISOString() })
      add('pausedOffline', { ...base, vanOnlinePausedUntil: iso(30), deviceOnline: false })
      add('extraWait', { ...base, extraWaitMins: 10, extraWaitStartedAt: iso(0) })
      add('prepBanner', { ...base, showPrepTimeBanner: true })
      add('recentlyClosed', { ...base, todayEvents: [{ ...EVENT, status: 'closed', closed_at: iso(-5) }], upcomingEvents: [{ ...EVENT, status: 'closed', closed_at: iso(-5) }] })
      add('cardsOff', { ...base, truck: { ...truck, online_payments_paused_at: '2026-10-08T12:00:00.000Z' } })
      add('breach', { ...base, capacityBreaches: [{ collection_time: '18:30', reason: 'Pizza 5/4', over_total: 1, over_cats: [{ cat: 'Pizzas', over: 1 }], order_keys: [O.card_paid.order_key], order_ids: [40] }] })
      add('buzzerLoss', { ...base, buzzerLosses: [{ order_key: O.card_paid.order_key, id: '40', customer_name: 'Sam Harness', lost_at: iso(-3) }] })
      add('header|soundOff', { ...base, soundEnabled: false, wakeState: 'held', copiedOrderLink: true })
      add('header|private', { ...base, upcomingEvents: [{ ...EVENT, is_private: true, private_name: 'Sam & Tom’s wedding' }], todayEvents: [{ ...EVENT, is_private: true, private_name: 'Sam & Tom’s wedding' }] })
      add('header|privateUnnamed', { ...base, upcomingEvents: [{ ...EVENT, is_private: true, private_name: null }] })
      add('header|eventType', { ...base, eventType: { id: 't1', name: 'Festival', buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null, offline_protection: null, offline_protection_mode: null, offline_auto_reject_mins: null },
        eventTypeList: [{ id: 't1', name: 'Festival', kind: 'custom' }] })
      add('header|eventPaused', { ...base, pausedUntil: iso(10) })

      // ── the prep list ──
      const slotted = (o, slot, extra = {}) => ({ ...o, slot, ...extra })
      const prepOrders = [slotted(O.card_paid, '18:30'), slotted(O.pay_at_hatch, '21:00', { notes: 'Extra napkins' }), slotted(O.edited_down, '18:22'), O.asap, slotted(O.modified, '18:40')]
      add('prep', { ...base, orders: prepOrders, showPrepList: true, struckPrep: new Set([`${O.edited_down.order_key}:Margherita:0`, `${O.asap.order_key}:Coke:1`]) })
      add('prepEmpty', { ...base, orders: [O.walk_up], showPrepList: true })
      add('prepAsapLater', { ...base, orders: [O.asap], showPrepList: true, upcomingEvents: [{ ...EVENT, start_time: '23:00', end_time: '23:59' }] })

      // ── the add tab ──
      add('addTab', { ...base, activeTab: 'add' })
      add('addTabNoMenu', { ...base, activeTab: 'add', truckMenu: null, boardUnavailable: true })

      // ── the settings tab ──
      const settings = { ...base, activeTab: 'settings' }
      add('settings', settings)
      add('settings|offline', { ...settings, isOffline: true })
      add('settings|saving', { ...settings, savingAutoAccept: true, savingAddOrderLayout: true, savingPaidStepOverride: true, savingCompletionOverride: true, savingTakesCashOverride: true,
        savingBuzzerPrompt: true, savingOnlinePaymentsPause: true, savingIntervals: true, vanBuzzerCount: 20, truck: { ...truck, online_payments_paused_at: '2026-10-08T12:00:00.000Z' } })
      add('settings|buzzer', { ...settings, vanBuzzerCount: 20, effectiveBuzzerPrompt: true, autoAccept: true })
      add('settings|scroll', { ...settings, truck: { ...truck, add_order_layout: 'scroll', completion_presses: 'one', stripe_charges_enabled: false } })
      add('settings|offlineProtection', { ...settings, eventOfflineOverride: true })
      add('settings|offlineNoAuto', { ...settings, eventOfflineOverride: true, eventOfflineModeOverride: 'no_auto_accept', eventAutoRejectOverride: 10 })
      add('settings|intervalsOverride', { ...settings, eventIntervals: { 'ev-1': { collection_interval_mins_override: 10, operator_collection_interval_mins_override: 5 } } })
      add('settings|intervalsEventOnly', { ...settings, eventIntervals: { 'ev-1': { collection_interval_mins_override: 15, operator_collection_interval_mins_override: null } } })
      add('settings|intervalsVanSplit', { ...settings, vanIntervalPair: { customer: 10, truck: 5 } })
      add('settings|intervalsUnavailable', { ...settings, eventIntervalsAvailable: false })
      add('settings|capacity', { ...settings, kitchenCapacity: 6, capacityWindowMins: 25, activeVanName: 'Big van', activeVanCount: 2 })
      add('settings|capacity1', { ...settings, kitchenCapacity: 1, capacityWindowMins: 1 })
      add('settings|noVan', { ...settings, upcomingEvents: [{ ...EVENT, van_id: null }] })
      add('settings|noEvent', { ...settings, selectedEventId: null, upcomingEvents: [] })
      add('settings|privateLink', { ...settings, privateLinkData: { ok: true, url: 'https://example.test/p/tok', token: 'tok', event: { id: 'ev-1' } } })

      // ── the stock tab ──
      const stockEv = { ...base, activeTab: 'stock',
        itemStocksByEvent: { 'ev-1': [{ name: 'Margherita', available: true, stock_count: 10, orders_count: 4, category: 'Pizzas' }, { name: 'Pepperoni', available: false, stock_count: null, orders_count: 2, category: 'Pizzas' },
          { name: 'Coke', available: true, stock_count: 3, orders_count: 1, category: 'Drinks', no_item_cap: false }, { name: 'Fanta', available: true, stock_count: null, orders_count: 0, category: 'Drinks', no_item_cap: true }] },
        categoryStocksByEvent: { 'ev-1': [{ category: 'Pizzas', stock_count: 30, default_stock: null, orders_count: 6, available: true }, { category: 'Sides', stock_count: null, default_stock: null, orders_count: 0, available: false }] },
        eventCharged: { i1: 10.5, i2: 11, i3: 1.8, i4: 2, i5: 4 }, eventOwnPrice: { i4: 2 }, eventFallback: { i1: 10.5, i2: 11, i3: 1.8, i4: 1.8, i5: 4 }, eventTypeName: 'Festival', priceReady: true, eventPriceLive: true }
      const optMenu = { ...MENU, items: MENU.items.map((i, n) => n === 0 ? { ...i, modifierGroups: [{ ...i.modifierGroups[0], options: [{ ...i.modifierGroups[0].options[0], stock_count: 2 }, { ...i.modifierGroups[0].options[1], available: false }, { id: 'o3', name: 'Discount crust', price_adjustment: -0.5, stock_count: 15 }] }, { id: 'g2', name: 'Dips', min_choices: 0, max_choices: 1, options: [{ id: 'o4', name: 'Garlic', price_adjustment: 0.5 }] }] } : i) }
      add('stock', stockEv)
      add('stock|options', { ...stockEv, truckMenu: optMenu })
      add('stock|priceEditing', { ...stockEv, priceEditing: true, pricePending: { i1: 12 } })
      add('stock|priceSaving', { ...stockEv, priceEditing: true, priceSaving: true })
      add('stock|loading', { ...stockEv, fetchedStockKeys: new Set() })
      add('stock|noMenu', { ...stockEv, truckMenu: null })

      // ── the page's own modals ──
      add('modal|offlinePausedNotice', { ...base, showOfflinePausedNotice: true })
      add('modal|finishEarly', { ...base, finishConfirm: { eventId: 'ev-1', early: true, endTime: cc === 'US' ? '9:00pm' : '21:00' } })
      add('modal|finish', { ...base, finishConfirm: { eventId: 'ev-1', early: false, endTime: '' } })
      add('modal|pause', { ...base, showPauseModal: true })
      add('modal|screenOff', { ...base, showScreenOffWarning: true })
      add('modal|kds', { ...base, showKDSPicker: true, vans: [{ id: 'van-1', name: 'Big van', auto_pause_on_offline: false }, { id: 'van-2', name: 'Little van', auto_pause_on_offline: true }] })
      add('modal|profile', { ...base, showProfileModal: true, editProfileName: 'Sam', currentUserEmail: 'sam@example.test' })
      add('modal|profileSaving', { ...base, showProfileModal: true, editProfileName: 'Sam', savingProfile: true })
      add('modal|qr', { ...base, showQRFullscreen: true, qrFullscreenDataUrl: 'data:image/png;base64,AAAA' })
      add('modal|qrLoading', { ...base, showQRFullscreen: true })
      add('modal|eventMenu', { ...base, showEventMenu: true })
      add('modal|eventMenuWait', { ...base, showEventMenu: true, extraWaitMins: 20, extraWaitStartedAt: iso(0) })
      add('modal|finishTime', { ...base, finishTimeTarget: { id: 'ev-1', end_time: '21:00', event_date: '2026-10-09' } })
      add('modal|eventCancel', { ...base, eventCancelTarget: EVENT })
      add('modal|extraWait', { ...base, showExtraWaitPicker: true })
      add('modal|typePicker', { ...base, typePicker: true, eventType: { id: 't1', name: 'Festival' }, eventTypeList: [{ id: 't1', name: 'Festival', kind: 'custom' }, { id: 't2', name: 'Wedding', kind: 'private' }] })
      add('modal|typeConfirm', { ...base, typePicker: true, typePending: 't1', eventTypeList: [{ id: 't1', name: 'Festival', kind: 'custom' }] })
      add('modal|typeToPrivate', { ...base, typePicker: true, typePending: 't2', typeClearOwn: true, eventTypeList: [{ id: 't1', name: 'Festival', kind: 'custom' }, { id: 't2', name: 'Wedding', kind: 'private' }] })
      add('modal|typeFromPrivate', { ...base, typePicker: true, typePending: null, typeBusy: true, upcomingEvents: [{ ...EVENT, is_private: true, private_name: 'Wedding' }], eventTypeList: [{ id: 't2', name: 'Wedding', kind: 'private' }] })
      add('modal|privateLink', { ...base, privateLinkData: { ok: true, url: 'https://example.test/p/tok', token: 'tok', event: { id: 'ev-1' } } })
      add('modal|buzzer', { ...base, vanBuzzerCount: 12, buzzerTarget: O.card_paid })
      add('modal|payment', { ...base, showCompleted: true, payModalOrder: O.part_refunded.order_key })
      // the cancel modal: each reason, each refund case
      const cancel = o => ({ ...base, showCancelModal: true, cancellingOrder: o })
      add('cancel|card_paid', cancel(O.card_paid))
      add('cancel|card_paid|noRefund', { ...cancel(O.card_paid), cancelRefund: false })
      add('cancel|card_paid|busy', { ...cancel(O.card_paid), cancelBusy: true, cancelReason: 'other', cancelNote: 'Burnt' })
      add('cancel|card_paid|error', { ...cancel(O.card_paid), cancelError: 'Choose a reason for the refund.' })
      add('cancel|part_refunded', cancel(O.part_refunded))
      add('cancel|part_paid', cancel(O.part_paid))
      add('cancel|card_held', cancel(O.card_held))
      add('cancel|pay_at_hatch', cancel(O.pay_at_hatch))
      for (const r of ['customer_cancelled', 'item_unavailable', 'not_collected', 'wrong_or_missing_item', 'quality_issue', 'duplicate_payment', 'other']) add(`cancel|reason|${r}`, { ...cancel(O.pay_at_hatch), cancelReason: r })
      add('reject|card_held', { ...base, showRejectModal: true, rejectingOrder: O.card_held })
      add('reject|big', { ...base, showRejectModal: true, rejectingOrder: O.big })
      // the edit modal
      const editItems = C.ITEMS.map(i => ({ ...i, cartKey: i.name, quantity: i.name === 'Coke' ? 4 : i.quantity }))
      const editDeals = [{ name: 'Lunch deal', slots: { Pizzas: 'Pepperoni', Drinks: 'Fanta' }, slotModifiers: { Pizzas: [{ name: 'Jalapeños', price: 0.75 }] }, slotNotes: { Drinks: 'No ice' } }]
      const edit = { ...base, editingOrder: O.card_paid, editItems, editDeals, editOrderBaseline: { total: 43.9, itemsSubtotal: 30.9, deals: [{ name: 'Lunch deal', lockedValue: 12.75 }] }, editSlot: '18:30',
        editSlots: [{ collection_time: '18:00', is_past: true }, { collection_time: '18:30' }, { collection_time: '18:40' }, { collection_time: '21:10', is_grace: true }] }
      add('edit', edit)
      add('edit|down', { ...edit, editItems: editItems.filter(i => i.name !== 'Garlic bread') })
      add('edit|same', { ...edit, editItems: C.ITEMS.map(i => ({ ...i, cartKey: i.name })), editOrderBaseline: { total: 43.9, itemsSubtotal: 32.3, deals: [{ name: 'Lunch deal', lockedValue: 12.75 }] } })
      add('edit|graceCurrent', { ...edit, editingOrder: { ...O.card_paid, slot: '21:10' } })
      add('edit|slotsLoading', { ...edit, editSlotsLoading: true })
      add('edit|noSlots', { ...edit, editSlots: [] })
      add('edit|saving', { ...edit, actionLoading: 'edit-40' })
      add('ordersRecording', { ...base, showCompleted: true, paymentFailures: new Set([O.walk_up.order_key]), actionLoading: `mark_paid-${O.walk_up.order_key}` })
      add('edit|itemModal', { ...edit, editItemModal: { item: MENU.items[0], modGroups: MENU.items[0].modifierGroups, allowNotes: true }, editModalMods: [{ name: 'Extra cheese', price: 1.25 }] })
      add('edit|itemModalPlain', { ...edit, editItemModal: { item: MENU.items[0], modGroups: MENU.items[0].modifierGroups, allowNotes: false }, editModalMods: [] })
      add('edit|dealModal', { ...edit, showEditDealModal: true })
      // the server's "not on the menu" verdict: its signature is the page's own editBasketSignature of the basket
      const sig = (items, deals) => `${items.map(x => `${x.name}|${(x.modifiers || []).map(mm => mm.name).sort().join(',')}|${x.quantity}`).sort().join(';')}#${deals.map(x => x.name).sort().join(',')}`
      const unresolved = [{ kind: 'item', name: 'Coke', advisoryPrice: 1.8 }, { kind: 'deal', name: 'Lunch deal', on: 'Pizzas', advisoryPrice: 12 }]
      add('edit|reprice', { ...edit, editReprice: { total: 47.5, unresolved, signature: sig(editItems, editDeals) } })
      add('edit|repriceStale', { ...edit, editReprice: { total: 47.5, unresolved, signature: 'stale' } })
      // the demo
      const demoBase = { ...base, demoSession: { extraction_source: 'template', email: null, expires_at: null, discovery_truck_id: null, first_opened_at: '2026-10-09T10:00:00.000Z' } }
      add('demo', demoBase, 'demo-harness')
      add('demo|settingUp', { ...demoBase, restarting: true }, 'demo-harness')
      add('demo|ended', { ...demoBase, upcomingEvents: [{ ...EVENT, end_time: '17:30' }], todayEvents: [{ ...EVENT, end_time: '17:30' }] }, 'demo-harness')
      add('demo|endedRestarting', { ...demoBase, upcomingEvents: [{ ...EVENT, end_time: '17:30' }], restarting: false, restartError: 'Could not start a new service — try again.' }, 'demo-harness')
      add('demo|endedNoEvent', { ...demoBase, upcomingEvents: [{ ...EVENT, end_time: '17:30' }], restartError: 'Server said no' }, 'demo-harness')
      add('demo|eventLock', { ...demoBase, showDemoEventLock: true }, 'demo-harness')
      add('demo|settings', { ...demoBase, activeTab: 'settings', eventOfflineOverride: true }, 'demo-harness')
      add('demo|qr', { ...demoBase, showQRFullscreen: true, truck: { ...truck, name: 'Pizza Kitchen (sample)' } }, 'demo-harness')
      add('demo|extraWait', { ...demoBase, extraWaitMins: 10, extraWaitStartedAt: iso(0) }, 'demo-harness')
      add('demo|branded', { ...demoBase, demoSession: { ...demoBase.demoSession, discovery_truck_id: 'd1' }, showQRFullscreen: true }, 'demo-harness')

      for (const [k, [st, token]] of Object.entries(S)) out[`${cc}|${k}`] = html(st, dash(token))

      // ══ the handlers ══════════════════════════════════════════════════════════════════════════════════════════
      const realFetch = globalThis.fetch
      const R = (status, body) => new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
      const tick = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)) }
      // `reply(url, body)` → Response | 'throw'. The board's own reads always answer "PIN needed", so a handler's
      // follow-up refetch ends quietly.
      async function run(name, st, reply, call, { token = 'harness', window = false, dashReply = false } = {}) {
        globalThis.__msH = {}
        const rendered = html(st, dash(token))
        const H = globalThis.__msH
        const rec = { toasts: [], sets: [], confirms: [], qr: [], returned: undefined }
        globalThis.__msQr = rec.qr; globalThis.__msToasts = rec.toasts; globalThis.__msSets = rec.sets; globalThis.__msRec = RECORDED_SETS
        globalThis.fetch = async (url, init) => {
          const u = String(url)
          if (!dashReply && /^\/api\/dashboard\?/.test(u)) return R(401, { requiresPin: true })
          const r = reply(u, init && typeof init.body === 'string' ? JSON.parse(init.body) : null)
          if (r === 'throw') throw new TypeError('fetch failed')
          return r || R(200, {})
        }
        const savedRaf = globalThis.requestAnimationFrame
        globalThis.requestAnimationFrame = f => { f(0); return 0 }
        if (window) globalThis.window = { confirm: msg => { rec.confirms.push(msg); return false } }
        try {
          if (typeof rendered === 'string' && rendered.startsWith('ERROR')) rec.returned = rendered
          else rec.returned = await kit.quietAsync(async () => { const v = await call(H); await tick(); return v })
        } catch (e) { rec.returned = 'THREW ' + String(e && e.message || e).slice(0, 200) }
        finally {
          globalThis.fetch = realFetch; globalThis.requestAnimationFrame = savedRaf
          if (window) delete globalThis.window
          delete globalThis.__msToasts; delete globalThis.__msSets; delete globalThis.__msRec; delete globalThis.__msH; delete globalThis.__msQr
        }
        out[`${cc}|handler|${name}`] = rec
      }
      const ok = (body = {}) => () => R(200, body)
      const err = (status, body) => () => R(status, body)
      const thr = () => 'throw'
      const settingsSt = { ...base, activeTab: 'settings' }
      await run('openOrderFromPush', base, ok(), H => H.openOrderFromPush('no-such-order'))
      await run('copyLinkNoSlug', { ...base, truck: { ...truck, slug: null } }, ok(), H => H.handleCopyOrderLink())
      await run('showQrNoSlug', { ...base, truck: { ...truck, slug: null } }, ok(), H => H.handleShowQR())
      // submitPin reads /api/dashboard itself — that read answers with the case's reply
      for (const [k, r] of Object.entries({ s503: err(503, {}), s401pin: err(401, { requiresPin: true }), s401: err(401, {}), s500: err(500, {}) }))
        await run(`submitPin|${k}`, { loading: false, requiresPin: true, authenticated: false, pinInput: '1234' }, r, H => H.submitPin(), { dashReply: true })
      for (const mode of ['on_confirmed', 'lead_time']) await run(`printMode|${mode}`, settingsSt, ok(), H => H.savePrintTriggerMode(mode))
      await run('printMode|fail', settingsSt, thr, H => H.savePrintTriggerMode('lead_time'))
      await run('layout|scroll', settingsSt, ok(), H => H.saveAddOrderLayout('scroll'))
      await run('layout|tabs', { ...settingsSt, truck: { ...truck, add_order_layout: 'scroll' } }, ok(), H => H.saveAddOrderLayout('tabs'))
      await run('layout|fail', settingsSt, err(500, {}), H => H.saveAddOrderLayout('scroll'))
      for (const v of [true, false]) await run(`autoAccept|${v}`, settingsSt, ok(), H => H.saveAutoAccept(v))
      await run('autoAccept|fail', settingsSt, thr, H => H.saveAutoAccept(true))
      for (const v of [true, false]) await run(`cardsPaused|${v}`, settingsSt, ok({ online_payments_paused_at: null }), H => H.saveOnlinePaymentsPaused(v))
      await run('cardsPaused|fail', settingsSt, err(500, {}), H => H.saveOnlinePaymentsPaused(true))
      const evReply = ok({ event: { id: 'ev-1' } })
      await run('intervals|set', settingsSt, evReply, H => H.saveCollectionIntervals(10, null))
      await run('intervals|usual', settingsSt, evReply, H => H.saveCollectionIntervals(null, null))
      await run('intervals|refused', settingsSt, err(400, { error: 'That interval is not allowed' }), H => H.saveCollectionIntervals(10, 5))
      await run('intervals|refusedBare', settingsSt, err(500, {}), H => H.saveCollectionIntervals(10, 5))
      await run('intervals|refusedNoJson', settingsSt, () => new Response('nope', { status: 502 }), H => H.saveCollectionIntervals(10, 5))
      await run('intervals|throw', settingsSt, thr, H => H.saveCollectionIntervals(10, 5))
      for (const v of [true, false, null]) await run(`paidStep|${v}`, settingsSt, evReply, H => H.savePaidStepOverride(v))
      await run('paidStep|fail', settingsSt, thr, H => H.savePaidStepOverride(true))
      for (const v of ['one', 'two', null]) await run(`presses|${v}`, settingsSt, evReply, H => H.saveCompletionPressesOverride(v))
      await run('presses|fail', settingsSt, thr, H => H.saveCompletionPressesOverride('one'))
      for (const v of [true, false, null]) await run(`takesCash|${v}`, settingsSt, evReply, H => H.saveTakesCashOverride(v))
      await run('takesCash|fail', settingsSt, thr, H => H.saveTakesCashOverride(true))
      for (const v of [true, false]) await run(`buzzerPrompt|${v}`, settingsSt, evReply, H => H.saveBuzzerPromptOverride(v))
      await run('buzzerPrompt|fail', settingsSt, err(500, {}), H => H.saveBuzzerPromptOverride(true))
      const buzOrders = [{ ...O.card_paid, buzzer_number: 4 }, O.pay_at_hatch]
      const buz = { ...base, orders: buzOrders, vanBuzzerCount: 12, buzzerTarget: buzOrders[0] }
      await run('buzzer|assignTaken', buz, ok({ clearedFrom: { id: '41' } }), H => H.saveBuzzer(O.card_paid.order_key, 7))
      await run('buzzer|assign', buz, ok({}), H => H.saveBuzzer(O.card_paid.order_key, 7))
      await run('buzzer|remove', buz, ok({}), H => H.saveBuzzer(O.card_paid.order_key, null))
      await run('buzzer|removeNone', { ...base, vanBuzzerCount: 12 }, ok({}), H => H.saveBuzzer(O.pay_at_hatch.order_key, null))
      await run('buzzer|assignFail', buz, err(409, { error: 'taken' }), H => H.saveBuzzer(O.card_paid.order_key, 7))
      await run('buzzer|assignFailNone', { ...base, vanBuzzerCount: 12, buzzerTarget: O.pay_at_hatch }, err(409, {}), H => H.saveBuzzer(O.pay_at_hatch.order_key, 7))
      await run('buzzer|removeFail', buz, err(500, {}), H => H.saveBuzzer(O.card_paid.order_key, null))
      await run('buzzer|removeFailNoTarget', { ...base, orders: buzOrders, vanBuzzerCount: 12 }, err(500, {}), H => H.saveBuzzer(O.card_paid.order_key, null))
      await run('buzzer|failNoTarget', { ...base, orders: buzOrders, vanBuzzerCount: 12 }, err(500, {}), H => H.saveBuzzer(O.card_paid.order_key, 7))
      await run('sound', settingsSt, ok(), H => H.saveSoundConfig({ new_orders: 'all', order_due: true }))
      await run('offlineMode|fail', settingsSt, err(500, {}), H => H.setOfflineMode('no_auto_accept'))
      await run('autoReject|fail', settingsSt, thr, H => H.setAutoRejectMins(10))
      const catEdit = { ...base, editingCatId: 'c1', editCatForm: { name: 'Pizzas', prepMins: 5, prepSecs30: 0, batch: 2, allowNotes: true } }
      await run('catEdit|ok', catEdit, ok(), H => H.saveCatEdit())
      await run('catEdit|fail', catEdit, thr, H => H.saveCatEdit())
      for (const [k, r] of Object.entries({ pending: ok({ pending: true }), settled: ok({}), refused: err(400, { error: 'Refused' }), refusedBare: err(400, {}), unreachable: thr }))
        await run(`refund|${k}`, base, r, H => H.submitRefund({ orderKey: O.big.order_key, amountMinor: 123456, reason: 'other', note: '' }))
      const editSt = { ...base, editingOrder: O.card_paid, editItems: C.ITEMS.map(i => ({ ...i, cartKey: i.name })), editDeals: [] }
      await run('edit|ok', editSt, ok({}), H => H.submitEdit())
      await run('edit|slotWarning', editSt, ok({ slotWarning: 'Moved to 18:40 — 18:30 was full' }), H => H.submitEdit())
      await run('edit|retry', editSt, err(409, { retry: true }), H => H.submitEdit())
      await run('edit|retryMsg', editSt, err(409, { retry: true, error: 'Busy' }), H => H.submitEdit())
      await run('edit|refused', editSt, err(400, { error: 'Nope' }), H => H.submitEdit())
      await run('edit|refusedBare', editSt, err(400, {}), H => H.submitEdit())
      await run('edit|reprice', editSt, err(409, { needsPriceConfirm: true, total: 47.5, unresolved: [] }), H => H.submitEdit())
      await run('catAvail|fail', base, err(500, {}), H => H.updateCategoryAvailable('Pizzas', false))
      await run('optAvail|fail', base, err(500, {}), H => H.updateModifierOptionAvailable('o1', false))
      await run('optStock|fail', base, err(500, {}), H => H.updateModifierOptionStock('o1', 3))
      await run('openEvent|start', { ...base, upcomingEvents: [{ ...EVENT, status: 'confirmed' }] }, ok({}), H => H.openEvent('ev-1'))
      await run('openEvent|restart', { ...base, upcomingEvents: [{ ...EVENT, status: 'closed' }] }, ok({}), H => H.openEvent('ev-1'))
      await run('openEvent|fail', base, err(400, {}), H => H.openEvent('ev-1'))
      await run('openEvent|failMsg', base, err(400, { error: 'Event is cancelled' }), H => H.openEvent('ev-1'))
      await run('finishTime|ok', base, ok({}), H => H.applyFinishTime('ev-1', '21:30'))
      await run('finishTime|fail', base, err(400, {}), H => H.applyFinishTime('ev-1', '21:30'))
      await run('finishEvent|ok', base, ok({}), H => H.doFinishEvent('ev-1'))
      await run('finishEvent|fail', base, thr, H => H.doFinishEvent('ev-1'))
      await run('cancelOrder|noReason', { ...base, showCancelModal: true, cancellingOrder: O.card_paid }, ok({}), H => H.confirmCancelOrder())
      await run('cancelOrder|refundFails', { ...base, showCancelModal: true, cancellingOrder: O.card_paid, cancelReason: 'quality_issue', cancelNote: 'Cold' }, err(400, {}), H => H.confirmCancelOrder())
      await run('cancelEvent|ok', base, ok({}), H => H.doCancelEvent('ev-1', 'weather', ''))
      await run('cancelEvent|fail', base, err(400, {}), H => H.doCancelEvent('ev-1', 'weather', ''))
      await run('eventNote|ok', base, ok({}), H => H.saveEventNote('ev-1'))
      await run('eventNote|fail', base, err(400, {}), H => H.saveEventNote('ev-1'))
      const two = [EVENT, { ...EVENT, id: 'ev-2', venue_name: 'The Market', status: 'confirmed' }]
      await run('switchEvent', { ...base, todayEvents: two, upcomingEvents: two }, ok(), H => H.switchEvent(two[1]), { window: true })
      const priceSt = { ...base, activeTab: 'stock', priceEditing: true, pricePending: { i1: 12 }, eventCharged: { i1: 10.5 }, priceReady: true }
      await run('prices|ok', priceSt, ok({}), H => H.savePriceEdit())
      await run('prices|fail', priceSt, thr, H => H.savePriceEdit())
      const demoEnded = { ...demoBase, upcomingEvents: [{ ...EVENT, end_time: '17:30' }] }
      await run('showQr|demo', { ...demoBase }, ok(), H => H.handleShowQR(), { token: 'demo-harness' })
      await run('showQr', base, ok(), H => H.handleShowQR())
      await run('eventChange|offline', { ...base, isOffline: true }, ok(), H => H.onEventChange('ev-2'))
      await run('restart|refused', demoEnded, err(500, {}), H => H.startNewService(), { token: 'demo-harness' })
      await run('restart|refusedMsg', demoEnded, err(429, { error: 'Too many restarts' }), H => H.startNewService(), { token: 'demo-harness' })
      await run('restart|throw', demoEnded, thr, H => H.startNewService(), { token: 'demo-harness' })
    }
  } finally { process.removeListener('unhandledRejection', onUnhandled) }
  out.unhandled = unhandled
  return out
}

module.exports = { views }
