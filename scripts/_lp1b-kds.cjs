// scripts/_lp1b-kds.cjs — Language Phase 1b, the KDS area (run by scripts/language-phase-1b.cjs; see its header).
// The kitchen screen, app/dashboard/[token]/kds/page.tsx, for a GB and a US truck, as FULL HTML:
//   • loading, PIN (each PIN sentence), the terminal error in every source (the two this page writes, a server's
//     own `data.error`, no truck), the board in every switch combination × list/grid × Full/Cook cards, every
//     order status and payment state on the cards and in the Done strip, empty board, the van name;
//   • every banner (degraded with and without a last refresh, scope mismatch with and without an event, manual
//     and offline pause, offline with 0/1/3 queued, extra wait, Start Event, recently finished, event bar in
//     every status), the phone header expanded, the device/sound sheet in each sound setting, the screen-off
//     warning (no van / one / two), the event menu (extra wait off / on, demo paused), the event picker, the
//     extra-wait picker, both finish confirms, the reject gate, the kitchen toast, the demo intro, the buzzer
//     grid, the event-cancel gate, the finish-time picker, the stacked toasts;
//   • ACTIONS: what the page's own handlers SAY — every toast, PIN line, kitchen toast and window.confirm they
//     produce — captured by invoking them (child components stubbed to hand over their callbacks, fetch stubbed,
//     every useState setter spied), for success, queued and failure.
// Codes in state (AFTER only): `error` set by fetchAll holds a code — fixtures hold BEFORE's sentence and
// `__after` the code, so the page is proven to render exactly the sentence it held.
const path = require('path')

const F = 'app/dashboard/[token]/kds/page.tsx'
const STATES = ['truck', 'orders', 'payments', 'heldAuthorisations', 'paymentFailures', 'loading', 'hasLoaded', 'error', 'requiresPin', 'pinError', 'pinInput',
  'events', 'selectedEventId', 'handoverPref', 'readyPref', 'prefsReconciled', 'layoutOverride', 'cardModePref', 'showKdsIntro', 'degradedSince', 'lastRefresh',
  'eventScopeMismatch', 'pausedUntil', 'onlinePausedUntil', 'deviceOnline', 'isOffline', 'pendingSyncCount', 'pendingSync', 'extraWaitMins', 'showScreenOffWarning',
  'vansWithAutoPause', 'phoneOpen', 'deviceOpen', 'showEventMenu', 'showEventPicker', 'showExtraWaitPicker', 'finishConfirm', 'rejectingOrder', 'kdsToast',
  'soundEnabled', 'wakeState', 'keepScreenOn', 'storedSoundCfg', 'activeVanCount', 'buzzerCount', 'buzzerTarget', 'eventCancelTarget', 'eventCancelCount',
  'finishTimeTarget', 'eventNoteInput', 'showCookingStep']

// The one useState spy: every setter call is logged (globalThis.__setLog) — so a handler's words are read from
// what it SETS, even though a server render never applies a set. Installed by renaming React's useState.
const SPY = `
function useState(init) {
  const r = __rawUseState(init)
  return [r[0], v => { if (globalThis.__setLog) globalThis.__setLog.push(v); return r[1](v) }]
}`

module.exports.views = async function views(ctx) {
  const { kit, h, html, AFTER, FIX } = ctx
  const i18n = AFTER ? `export { I18nContext } from '@/lib/i18n/use-t'\n` : ''
  const R = await kit.bundle('kds-render', `export { default as Kds } from '@/${F}'\nexport { ToastStack } from '@/components/ToastStack'\n${i18n}`,
    { patches: [{ file: F, states: STATES }, { file: 'lib/useToasts.ts', states: ['toasts'] }] })
  const out = {}
  const wrap = (m, cc, el) => (m.I18nContext ? h(m.I18nContext.Provider, { value: { locale: cc === 'US' ? 'en-US' : 'en-GB', setLocale() {} } }, el) : el)

  for (const cc of ['GB', 'US']) {
    const C = ctx[cc]
    const T = C.TRUCK
    const EV = { ...C.EVENT, truck_id: T.id, status: 'open', auto_open: true, closed_at: null, customer_note: 'By the pond', town: 'Harnessville' }
    const EV2 = { ...EV, id: 'ev-2', event_date: '2026-10-10', date: '2026-10-10', venue_name: 'The Market', status: 'confirmed' }
    const ord = Object.values(C.ORDERS).filter(o => !['cancelled', 'rejected', 'refunded', 'part_refunded', 'walk_up'].includes(Object.keys(C.ORDERS).find(k => C.ORDERS[k] === o)))
    const doneKeys = ['card_held', 'pay_at_hatch', 'part_paid', 'big', 'card_paid']
    const done = doneKeys.map((k, i) => ({ ...C.ORDERS[k], id: String(70 + i), order_key: C.ORDERS[k].order_key.replace(/..$/, String(70 + i)), status: 'collected' }))
    const terminal = ['cancelled', 'rejected', 'refunded', 'part_refunded', 'walk_up'].map(k => C.ORDERS[k])
    const payments = { ...C.PAYMENTS, ...Object.fromEntries(done.map((o, i) => [o.order_key, C.ORDER_CASES[doneKeys[i]].ledger])) }
    const held = new Set([C.ORDERS.card_held.order_key, done[0].order_key])
    const base = { truck: T, orders: [...ord, ...terminal, ...done], payments, heldAuthorisations: held, paymentFailures: new Set(), loading: false, hasLoaded: true,
      error: null, requiresPin: false, events: [EV], selectedEventId: 'ev-1', handoverPref: true, readyPref: null, prefsReconciled: true, layoutOverride: 'list',
      cardModePref: null, showKdsIntro: false, isOffline: false, deviceOnline: true, wakeState: 'off', keepScreenOn: true, soundEnabled: true, storedSoundCfg: null }
    const at = (iso) => new Date(iso)
    const FUT = '2026-10-09T19:20:00.000Z'
    const S = {
      loading: { loading: true },
      pin: { loading: false, requiresPin: true },
      pinIncorrect: { loading: false, requiresPin: true, pinError: 'Incorrect PIN', pinInput: '12' },
      pin503: { loading: false, requiresPin: true, pinError: "Can't reach the server right now. Your PIN is fine — try again in a moment." },
      errLinkInvalid: { loading: false, error: 'This link is no longer valid.', truck: null, __after: { error: 'error.linkInvalid' } },
      errCouldNotLoad: { loading: false, error: 'Could not load orders', truck: null, __after: { error: 'error.couldNotLoad' } },
      errServer: { loading: false, error: 'Invalid token', truck: null },
      noTruck: { loading: false, truck: null },
      windowList: base,
      windowGrid: { ...base, layoutOverride: 'grid' },
      windowCookCards: { ...base, cardModePref: 'cook' },
      readyAndHandover: { ...base, readyPref: true },
      cookBoard: { ...base, handoverPref: false, readyPref: true },
      cookBoardFullCards: { ...base, handoverPref: false, readyPref: true, cardModePref: 'window', layoutOverride: 'grid' },
      paidStepOff: { ...base, truck: { ...T, show_paid_step: false }, handoverPref: null },
      empty: { ...base, orders: [] },
      vanName: { ...base, activeVanCount: 2 },
      oneVan: { ...base, activeVanCount: 1 },
      degraded: { ...base, degradedSince: at('2026-10-09T17:10:00Z'), lastRefresh: at('2026-10-09T17:05:00Z') },
      degradedNoRefresh: { ...base, degradedSince: at('2026-10-09T17:10:00Z'), lastRefresh: null },
      mismatch: { ...base, orders: [], eventScopeMismatch: { requested: 'ev-1', served: 'ev-9' } },
      mismatchNoEvent: { ...base, orders: [], selectedEventId: null, eventScopeMismatch: { requested: 'ev-1', served: 'ev-9' } },
      pausedManual: { ...base, pausedUntil: FUT },
      pausedOffline: { ...base, onlinePausedUntil: FUT, deviceOnline: false },
      offline0: { ...base, isOffline: true, pendingSyncCount: 0 },
      offline1: { ...base, isOffline: true, pendingSyncCount: 1, pendingSync: new Set([C.ORDERS.card_paid.order_key]) },
      offline3: { ...base, isOffline: true, pendingSyncCount: 3 },
      extraWait: { ...base, extraWaitMins: 10 },
      startEvent: { ...base, events: [{ ...EV, status: 'confirmed', auto_open: false }] },
      notStarted: { ...base, events: [{ ...EV, status: 'confirmed', auto_open: true }] },
      recentlyClosed: { ...base, events: [{ ...EV, status: 'closed', closed_at: '2026-10-09T17:15:00.000Z' }] },
      cancelledEvent: { ...base, events: [{ ...EV, status: 'cancelled' }] },
      noEvent: { ...base, events: [], selectedEventId: null },
      phoneOpen: { ...base, phoneOpen: true },
      phoneOpenAll: { ...base, phoneOpen: true, storedSoundCfg: { new_orders: 'all', order_due: true }, soundEnabled: false, wakeState: 'held', readyPref: true },
      deviceSheet: { ...base, deviceOpen: true },
      deviceSheetAll: { ...base, deviceOpen: true, storedSoundCfg: { new_orders: 'all', order_due: true } },
      screenOff0: { ...base, showScreenOffWarning: true, vansWithAutoPause: [] },
      screenOff1: { ...base, showScreenOffWarning: true, vansWithAutoPause: ['Van 1'] },
      screenOff2: { ...base, showScreenOffWarning: true, vansWithAutoPause: ['Van 1', 'Van 2'] },
      eventMenu: { ...base, showEventMenu: true, events: [EV, EV2], eventNoteInput: 'By the pond' },
      eventMenuWait: { ...base, showEventMenu: true, extraWaitMins: 15 },
      eventMenuPaused: { ...base, showEventMenu: true, pausedUntil: FUT },
      eventPicker: { ...base, showEventPicker: true, events: [EV, EV2] },
      eventPickerOffline: { ...base, showEventPicker: true, events: [EV, EV2], isOffline: true },
      extraWaitPicker: { ...base, showExtraWaitPicker: true },
      finishEarly: { ...base, finishConfirm: { eventId: 'ev-1', early: true, endTime: cc === 'US' ? '3:00 PM' : '21:00' } },
      finishLate: { ...base, finishConfirm: { eventId: 'ev-1', early: false, endTime: '' } },
      reject: { ...base, rejectingOrder: C.ORDERS.asap },
      kdsToast: { ...base, kdsToast: 'Event started' },
      buzzer: { ...base, buzzerCount: 12, buzzerTarget: C.ORDERS.card_paid },
      eventCancel: { ...base, eventCancelTarget: EV, eventCancelCount: 3 },
      finishTime: { ...base, finishTimeTarget: { id: 'ev-1', end_time: '21:00', event_date: '2026-10-09' } },
      toasts: { ...base, toasts: [{ id: 1, msg: 'Order #40 confirmed', type: 'success' }, { id: 2, msg: 'Failed to reject', type: 'error' }] },
      payFailure: { ...base, paymentFailures: new Set([C.ORDERS.part_paid.order_key]) },
      hidePaymentsDone: { ...base, handoverPref: false, readyPref: true, layoutOverride: 'list' },
    }
    for (const [k, st] of Object.entries(S)) out[`${cc}|${k}`] = html(st, wrap(R, cc, h(R.Kds, { token: 'harness' })), 'van_id=v1&van_name=Van 1')
    // Demo: the intro, the banner, and a paused demo's menu (resume only).
    out[`${cc}|demoIntro`] = html({ ...base, showKdsIntro: true }, wrap(R, cc, h(R.Kds, { token: 'demo-harness' })), '')
    out[`${cc}|demoPausedMenu`] = html({ ...base, showEventMenu: true, pausedUntil: FUT }, wrap(R, cc, h(R.Kds, { token: 'demo-harness' })), '')
    out[`${cc}|toastStack`] = html({}, wrap(R, cc, h(R.ToastStack, { toasts: [{ id: 1, msg: 'Buzzer 4 saved', type: 'success', action: { label: '↩ Undo', run() {} } }], dismissToast() {} })))
  }

  // ══ ACTIONS — what the page's handlers say ══════════════════════════════════════════════════════════════
  const cap = {}
  const capStub = name => `export function ${name}(p) { (globalThis.__kdsCap ||= {}).${name} = p; return null }`
  const A = await kit.bundle('kds-actions', `export { default as Kds } from '@/${F}'\n${i18n}`, {
    patches: [
      { file: F, states: STATES },
      { file: F, from: /import \{ useState,/, to: 'import { useState as __rawUseState,' },
      { file: F, append: SPY },
      { file: F, from: /const submitPin = async \(\) => \{/, to: 'const submitPin = (globalThis.__kdsCap ||= {}).submitPin = async () => {' },
      { file: F, from: /const switchEvent = \(event: TruckEvent\) => \{/, to: 'const switchEvent = (globalThis.__kdsCap ||= {}).switchEvent = (event: TruckEvent) => {' },
    ],
    stubs: {
      '@/components/dashboard/OrderCard': capStub('OrderCard'),
      '@/components/dashboard/BuzzerGrid': capStub('BuzzerGrid'),
      '@/components/shared/RejectOrderModal': capStub('RejectOrderModal'),
      '@/components/shared/EventActionsModal': capStub('EventActionsModal'),
      '@/components/shared/EventFinishTimeModal': capStub('EventFinishTimeModal'),
      '@/components/shared/EventCancelModal': capStub('EventCancelModal'),
      '@/components/shared/EventPickerPanel': capStub('EventPickerPanel'),
      '@/lib/useToasts': `export const MAX_TOASTS = 3
export function useToasts() { return { toasts: [], dismissToast() {}, showToast: (msg, type, opts) => { (globalThis.__toastLog ||= []).push({ msg, type: type ?? null, action: opts?.action?.label ?? null, duration: opts?.duration ?? null }); return 1 } } }`,
    },
  })
  void cap
  const realFetch = globalThis.fetch
  const realSetTimeout = globalThis.setTimeout
  const hadWindow = 'window' in globalThis
  for (const cc of ['GB', 'US']) {
    const C = ctx[cc]
    const EV = { ...C.EVENT, truck_id: C.TRUCK.id, status: 'open', auto_open: true, closed_at: null, customer_note: 'By the pond', town: 'Harnessville' }
    const EV2 = { ...EV, id: 'ev-2', venue_name: 'The Market' }
    const orders = [C.ORDERS.card_paid, C.ORDERS.asap, C.ORDERS.cooking, { ...C.ORDERS.pay_at_hatch, buzzer_number: 4 }]
    const st = { truck: C.TRUCK, orders, payments: C.PAYMENTS, heldAuthorisations: new Set(), paymentFailures: new Set(), loading: false, hasLoaded: true, requiresPin: false,
      events: [EV, EV2], selectedEventId: 'ev-1', handoverPref: true, layoutOverride: 'list', showKdsIntro: false, buzzerCount: 12, buzzerTarget: orders[3],
      rejectingOrder: orders[1], showEventMenu: true, finishTimeTarget: { id: 'ev-1', end_time: '21:00', event_date: '2026-10-09' }, eventCancelTarget: EV, showEventPicker: true }
    // fetch: a scripted response per call; `throw` throws.
    let script = []
    globalThis.fetch = async (url, init) => {
      const next = script.shift() || { status: 200, body: {} }
      if (next === 'throw') throw new Error('network down')
      return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body, text: async () => JSON.stringify(next.body) }
    }
    const run = async (name, setup, fn) => {
      globalThis.__kdsCap = {}; globalThis.__toastLog = []; globalThis.__setLog = []; script = setup.fetch || []
      const confirms = []
      try {
        const r = html({ ...st, ...(setup.state || {}) }, wrap(A, cc, h(A.Kds, { token: 'harness' })), '')
        if (r.startsWith('ERROR')) throw new Error('render: ' + r)
        // AFTER the render (the page reads `window` in its initialisers): the confirm dialog, no long timers.
        globalThis.window = { confirm: m => { confirms.push(m); return setup.confirm !== false }, location: { reload() {} } }
        globalThis.setTimeout = (f, ms) => (ms && ms >= 1000 ? 0 : realSetTimeout(f, ms))
        await kit.quietAsync(() => fn(globalThis.__kdsCap))
        out[`${cc}|action|${name}`] = { toasts: globalThis.__toastLog.map(x => ({ ...x, msg: typeof x.msg === 'string' ? x.msg : kit.renderStatic(x.msg) })), sets: globalThis.__setLog.filter(v => typeof v === 'string'), confirms }
      } catch (e) { out[`${cc}|action|${name}`] = 'ERROR ' + String(e && e.message || e).slice(0, 300) }
      finally { globalThis.setTimeout = realSetTimeout; if (!hadWindow) delete globalThis.window }
    }
    const K = orders[0].order_key, K4 = orders[3].order_key
    // OrderCard → handleAction → the shared post-gate handler (lib/native/useGatedActionResult)
    for (const a of ['confirm', 'ready', 'collected', 'collected_cash', 'mark_paid', 'mark_paid_card', 'undo_mark_paid', 'undo_collected', 'cancel', 'start_cooking'])
      await run(`gate|${a}`, { fetch: [{ status: 200, body: {} }] }, c => c.OrderCard.onAction(a, K))
    await run('gate|collected|booksPayment', { fetch: [{ status: 200, body: {} }] }, c => c.OrderCard.onAction('collected', K, { booksPayment: true }))
    await run('gate|paymentWarning|collected', { fetch: [{ status: 200, body: { paymentWarning: true } }] }, c => c.OrderCard.onAction('collected', K))
    await run('gate|paymentWarning|mark_paid', { fetch: [{ status: 200, body: { paymentWarning: true } }] }, c => c.OrderCard.onAction('mark_paid', K))
    await run('gate|ready|buzzer', { fetch: [{ status: 200, body: {} }] }, c => c.OrderCard.onAction('ready', K4))
    await run('gate|serverError', { fetch: [{ status: 409, body: { error: 'Order already collected' } }] }, c => c.OrderCard.onAction('confirm', K))
    await run('gate|serverErrorBlank', { fetch: [{ status: 500, body: {} }] }, c => c.OrderCard.onAction('confirm', K))
    // reject → the reason gate → confirmRejectOrder
    await run('reject|ok', { fetch: [{ status: 200, body: {} }] }, c => c.RejectOrderModal.onConfirm('Too busy'))
    await run('reject|fails', { fetch: [{ status: 500, body: { error: 'nope' } }] }, c => c.RejectOrderModal.onConfirm('Too busy'))
    // the buzzer write
    await run('buzzer|assign', { fetch: [{ status: 200, body: {} }] }, c => c.BuzzerGrid.onAssign(7, false))
    await run('buzzer|assignTaken', { fetch: [{ status: 200, body: { clearedFrom: { id: '41' } } }] }, c => c.BuzzerGrid.onAssign(7, false))
    await run('buzzer|remove', { fetch: [{ status: 200, body: {} }] }, c => c.BuzzerGrid.onAssign(null, false))
    await run('buzzer|removeNone', { state: { buzzerTarget: orders[0] }, fetch: [{ status: 200, body: {} }] }, c => c.BuzzerGrid.onAssign(null, false))
    await run('buzzer|assignFails', { fetch: [{ status: 500, body: { error: 'x' } }] }, c => c.BuzzerGrid.onAssign(7, false))
    await run('buzzer|assignFailsNone', { state: { buzzerTarget: orders[0] }, fetch: [{ status: 500, body: {} }] }, c => c.BuzzerGrid.onAssign(7, false))
    await run('buzzer|removeFails', { fetch: [{ status: 500, body: {} }] }, c => c.BuzzerGrid.onAssign(null, false))
    // the event menu's actions → the kitchen toast and window.confirm
    await run('event|start', { fetch: [{ status: 200, body: {} }] }, c => c.EventActionsModal.onStartEvent())
    await run('event|startFails', { fetch: [{ status: 500, body: { error: 'Event is cancelled' } }] }, c => c.EventActionsModal.onStartEvent())
    await run('event|startFailsBlank', { fetch: [{ status: 500, body: {} }] }, c => c.EventActionsModal.onStartEvent())
    await run('event|note', { fetch: [{ status: 200, body: {} }] }, c => c.EventActionsModal.onSaveNote())
    await run('event|finish', {}, c => c.EventActionsModal.onFinishEvent())
    await run('event|pause', { fetch: [{ status: 200, body: {} }] }, c => c.EventActionsModal.onPause())
    await run('event|pauseDeclined', { confirm: false }, c => c.EventActionsModal.onPause())
    await run('event|finishTime', { fetch: [{ status: 200, body: {} }] }, c => c.EventFinishTimeModal.onConfirm('21:30'))
    await run('event|cancel', { fetch: [{ status: 200, body: {} }] }, c => c.EventCancelModal.onConfirm('weather', ''))
    await run('event|cancelFails', { fetch: [{ status: 500, body: { error: 'Already cancelled' } }] }, c => c.EventCancelModal.onConfirm('weather', ''))
    await run('event|switch0', { state: { orders: [] } }, c => c.EventPickerPanel.onSelect(EV2))
    await run('event|switch1', { state: { orders: [orders[0]] } }, c => c.EventPickerPanel.onSelect(EV2))
    await run('event|switchN', {}, c => c.EventPickerPanel.onSelect(EV2))
    // the PIN form → its four lines
    for (const [name, resp] of [['503', { status: 503, body: {} }], ['wrong', { status: 401, body: { requiresPin: true } }], ['gone', { status: 401, body: {} }], ['other', { status: 500, body: {} }]])
      await run(`pin|${name}`, { state: { requiresPin: true, loading: false, pinInput: '1234' }, fetch: [resp] }, c => c.submitPin())
  }
  globalThis.fetch = realFetch
  void FIX; void path
  return out
}

// AFTER only: the words no render reaches — the document title the page writes in an effect.
module.exports.after = async function after(ctx) {
  const { kit, t, AFTER } = ctx
  if (!AFTER) return
  const m = await kit.bundle('kds-msgs', `import '@/lib/i18n/catalog/kds'\nexport { translatorFor } from '@/lib/i18n/translator'`)
  for (const loc of ['en-GB', 'en-US']) {
    const tr = m.translatorFor(loc, 'kds')
    t(`kds · document title (${loc})`, tr('docTitle', { truck: 'Pizza Kitchen' }) === 'Pizza Kitchen Kitchen', tr('docTitle', { truck: 'Pizza Kitchen' }))
  }
}
