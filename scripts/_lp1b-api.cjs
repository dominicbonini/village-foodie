// scripts/_lp1b-api.cjs — Language Phase 1b, area `api`: every kitchen-facing API refusal this fixture set reaches —
// app/api/dashboard (GET), app/api/dashboard/action, app/api/printing, app/api/native/bind-device — for a GB and a US
// truck, as status, body, headers and any email the request sends.
//
// 🔴 NAMED DIFFERENCE 1 (this phase): a refusal whose `error` is OUR sentence gains "code" and "params", LAST; the
// `error` text and every other field are unchanged. `compare` below proves it per field, exactly as Phase 1a did for
// the customer routes: the BEFORE body is the exact text prefix of the AFTER body, the only fields added are `code`
// and `params`, the code is an `errorsKitchen` message, and that message with its params is today's `error`, in
// en-GB and en-US. A body that does not change (a success, or a pass-through of text that is not ours — a database
// or exception message) must be byte-identical.
const path = require('path')
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

const REFUND_REASON = 'item_unavailable'   // one of lib/payments/refund.ts's REFUND_REASONS
const STUBS = {
  '@/lib/apns': 'export async function sendOrderPendingPush() {}\nexport function normaliseApnsKey(k) { return k }',
  '@/lib/fcm': 'export async function sendOrderPendingPush() {}',
  '@/lib/payments/authorize': `export async function authorizeDraft() { return { ok: true, clientSecret: 'cs', stripeAccount: 'acct' } }
export async function cancelAuthorization() { return { ok: true } }
export async function stripeAccountForTruck() { return null }`,
  '@/lib/payments/capture': 'export async function captureOnConfirmation() { return { ok: true, outcome: "nothing_to_capture" } }',
}

function tables(C, over = {}) {
  const settings = [snake(SEEDS.gbFromSeed()), snake({ ...SEEDS.usFromSeed(), enabled: true })]
  return {
    trucks: [{ ...C.TRUCK, dashboard_token: 'tok-test', dashboard_pin: null, active: true, operator_id: 'op-test', timezone: C.time.timeZone, ...(over.truck || {}) },
      { ...C.TRUCK, id: 'pin-truck', slug: 'pin-kitchen', dashboard_token: 'tok-pin', dashboard_pin: '1234', active: true, operator_id: 'op-test', timezone: C.time.timeZone }],
    country_settings: settings,
    truck_events: [{ ...C.EVENT, truck_id: 'test-truck', ...(over.event || {}) }],
    orders: (over.orders || []).map(o => ({ ...o, truck_id: 'test-truck' })),
    menu_items_db: C.MENU_ITEMS.map(i => ({ id: i.id, truck_id: 'test-truck', name: i.name, price: i.price, category_id: i.category === 'Pizzas' ? 'c1' : i.category === 'Drinks' ? 'c3' : 'c2', available: true, is_active: true })),
    menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas' }, { id: 'c3', truck_id: 'test-truck', name: 'Drinks' }, { id: 'c2', truck_id: 'test-truck', name: 'Sides' }],
    modifier_groups: [], modifier_options: [], item_modifier_groups: [], bundles_db: [], discount_codes_db: [],
    order_drafts: (over.drafts || []).map(d => ({ ...d })), order_payments: [], booking_locks: [],
    truck_vans: [{ id: 'v1', truck_id: 'test-truck', name: 'Van 1', active: true }], van_devices: [{ device_id: 'd-bound', truck_id: 'test-truck', van_id: 'v1' }], truck_users: [], event_option_stock: [],
  }
}

async function views(ctx) {
  const { kit } = ctx
  const { NextRequest } = require(path.join(ctx.REPO, 'node_modules/next/server'))
  const M = {
    action: await kit.bundle('lp1b-action', "export { POST } from '@/app/api/dashboard/action/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: STUBS }),
    dash: await kit.bundle('lp1b-dash-get', "export { GET } from '@/app/api/dashboard/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'",
      { stubs: { ...STUBS, 'next/headers': 'export async function cookies() { return { get() { return undefined }, getAll() { return [] }, set() {} } }\nexport async function headers() { return new Map() }',
        // Who is signed in is LOGGING, never authorisation, on this route — a token-only request has no user.
        '@/lib/audit/actor': 'export async function resolveActor() { return { foreignOperator: false, currentUserName: null, userRole: null, actorKind: "token", actorId: null } }\nexport async function resolveActorSafe() { return { actorKind: "token", actorId: null, actorLabel: null } }\nexport function resolveActorSource() { return "web" }' } }),
    printing: await kit.bundle('lp1b-printing-api', "export { GET, POST } from '@/app/api/printing/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: STUBS }),
    bind: await kit.bundle('lp1b-bind', "export { GET, POST } from '@/app/api/native/bind-device/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: STUBS }),
  }
  const out = {}
  const call = async (key, tbl, fn) => {
    const db = makeFakePg(tbl, { keys: { orders: [['order_key'], ['event_id', 'id']], order_drafts: [['order_key']] } })
    globalThis.__harnessDb = { ...db, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: null }, error: null }) } }
    const sends = []
    const realFetch = globalThis.fetch, realKey = process.env.BREVO_API_KEY
    process.env.BREVO_API_KEY = 'harness-not-a-key'
    globalThis.fetch = async (u, init) => {
      if (String(u).includes('brevo')) { const b = JSON.parse(init.body); sends.push({ to: b.to?.[0]?.email, subject: b.subject, html: b.htmlContent, text: b.textContent ?? null }) }
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) }
    }
    for (const k of Object.keys(M)) M[k].clearCountrySettingsCache?.()
    try {
      const res = await kit.quietAsync(fn)
      out[key] = { status: res.status, body: await res.text(), retryAfter: res.headers.get('retry-after'), sends }
    } catch (e) { out[key] = 'ERROR ' + String(e && e.message || e).slice(0, 200) }
    finally {
      globalThis.fetch = realFetch
      if (realKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = realKey
      delete globalThis.__harnessDb
    }
  }
  const post = (url, body) => new NextRequest(`http://127.0.0.1${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const get = url => new NextRequest(`http://127.0.0.1${url}`)
  for (const C of [ctx.GB, ctx.US]) {
    const cc = C.cc
    const T = (o) => tables(C, o)
    const order = (over = {}) => ({ ...C.ORDERS.pay_at_hatch, order_key: 'ok-1', ...over })
    const act = (k, body, o) => call(`${cc}|action|${k}`, T(o), () => M.action.POST(post('/api/dashboard/action', typeof body === 'string' ? body : { token: 'tok-test', ...body })))
    // dashboard GET
    await call(`${cc}|dashboard|noToken`, T(), () => M.dash.GET(get('/api/dashboard')))
    await call(`${cc}|dashboard|badToken`, T(), () => M.dash.GET(get('/api/dashboard?token=nope')))
    await call(`${cc}|dashboard|badPin`, T(), () => M.dash.GET(get('/api/dashboard?token=tok-pin&pin=0000')))
    // action: auth
    await act('badToken', { token: 'nope', action: 'confirm', order_key: 'ok-1' })
    await act('badPin', { token: 'tok-pin', pin: '0000', action: 'confirm', order_key: 'ok-1' })
    await act('badJson', '{not json')
    await act('unknownAction', { action: 'no_such_action' })
    // orders that do not exist
    for (const a of ['confirm', 'reject', 'cancel', 'ready', 'send_ready_email', 'edit']) await act(`notFound|${a}`, { action: a, order_key: 'nope', editedOrder: { items: [] } })
    await act('conflict', { action: 'ready', order_key: 'ok-1', expected_from: ['pending'] }, { orders: [order({ status: 'collected' })] })
    // refunds
    await act('refund|noReason', { action: 'refund', order_key: 'ok-1', amount_minor: 100 }, { orders: [order()] })
    await act('refund|otherNoNote', { action: 'refund', order_key: 'ok-1', amount_minor: 100, reason: 'other' }, { orders: [order()] })
    await act('refund|zero', { action: 'refund', order_key: 'ok-1', amount_minor: 0, reason: REFUND_REASON }, { orders: [order()] })
    // stock and availability
    await act('itemAvail|noItem', { action: 'set_item_availability', event_id: 'ev-1', available: false })
    await act('itemAvail|noEvent', { action: 'set_item_availability', itemName: 'Margherita', available: false })
    await act('optAvail|noOption', { action: 'set_modifier_option_available', event_id: 'ev-1', available: false })
    await act('optAvail|noEvent', { action: 'set_modifier_option_available', optionId: 'o1', available: false })
    await act('optAvail|missing', { action: 'set_modifier_option_available', optionId: 'o1', event_id: 'ev-1', available: false })
    await act('optStock|noOption', { action: 'set_modifier_option_stock', event_id: 'ev-1', stock: 3 })
    await act('optStock|noEvent', { action: 'set_modifier_option_stock', optionId: 'o1', stock: 3 })
    await act('stock|noItem', { action: 'set_stock', event_id: 'ev-1', stock: 3 })
    await act('stock|noEvent', { action: 'set_stock', itemName: 'Margherita', stock: 3 })
    await act('catStock|noCat', { action: 'set_category_stock', event_id: 'ev-1', stock: 3 })
    await act('catStock|noEvent', { action: 'set_category_stock', category: 'Pizzas', stock: 3 })
    await act('catAvail|noCat', { action: 'set_category_available', event_id: 'ev-1', available: false })
    await act('catAvail|noEvent', { action: 'set_category_available', category: 'Pizzas', available: false })
    // manual orders and events
    await act('manual|noItems', { action: 'manual', manualOrder: { items: [] } })
    await act('updateEvent|liveNoTimes', { action: 'update_event', event_id: 'ev-1', updates: { start_time: null, end_time: null } }, { event: { status: 'open' } })
    // slot adjust
    await act('adjust|invalid', { action: 'adjust_slot_+x', order_key: 'ok-1' })
    await act('adjust|noSlot', { action: 'adjust_slot_+10', order_key: 'ok-1' }, { orders: [order({ slot: null })] })
    // per-event overrides
    await act('paidStep|noEvent', { action: 'set_show_paid_step_override', value: true })
    await act('paidStep|badValue', { action: 'set_show_paid_step_override', eventId: 'ev-1', value: 'yes' })
    await act('presses|noEvent', { action: 'set_completion_presses_override', value: 'one' })
    await act('presses|badValue', { action: 'set_completion_presses_override', eventId: 'ev-1', value: 'three' })
    await act('buzzerPrompt|noEvent', { action: 'set_buzzer_prompt_override', value: true })
    await act('buzzer|noOrder', { action: 'set_buzzer', buzzer: 3 })
    await act('buzzer|badNumber', { action: 'set_buzzer', order_key: 'ok-1', buzzerNumber: -4 }, { orders: [order()] })
    await act('buzzer|notFound', { action: 'set_buzzer', order_key: 'nope', buzzerNumber: 3 })
    await act('takesCash|noEvent', { action: 'set_takes_cash_override', value: true })
    await act('takesCash|badValue', { action: 'set_takes_cash_override', eventId: 'ev-1', value: 'yes' })
    await act('onlinePaused|badValue', { action: 'set_online_payments_paused', value: 'yes' })
    await act('layout|bad', { action: 'set_add_order_layout', value: 'diagonal', layout: 'diagonal' })
    await act('offline|noEvent', { action: 'set_offline_protection', enabled: true })
    await act('offline|badValue', { action: 'set_offline_protection', eventId: 'ev-1', enabled: 'yes', value: 'yes' })
    await act('intervals|noEvent', { action: 'set_collection_intervals_override', customer: 10 })
    await act('intervals|bad', { action: 'set_collection_intervals_override', eventId: 'ev-1', customer: 7, operator: null })
    await act('intervals|badOp', { action: 'set_collection_intervals_override', eventId: 'ev-1', customer: 10, operator: 7 })
    await act('intervals|opFirst', { action: 'set_collection_intervals_override', eventId: 'ev-1', customer: null, operator: 10 })
    await act('orderReady|noEvent', { action: 'set_order_ready_override', value: true })
    await act('orderReady|badValue', { action: 'set_order_ready_override', eventId: 'ev-1', value: 'yes' })
    await act('extraWait|noEvent', { action: 'set_extra_wait', minutes: 5 })
    await act('category|noId', { action: 'update_category', updates: {} })
    await act('markPaid|held', { action: 'mark_paid_cash', order_key: 'ok-1' }, {
      orders: [order({ status: 'confirmed' })],
      drafts: [{ order_key: 'ok-1', payment_intent_id: 'pi_held', promoted_at: '2026-10-09T17:00:00.000Z', authorization_cancelled_at: null }],
    })
    // printing (wired printers)
    await call(`${cc}|printing|getNoToken`, T(), () => M.printing.GET(get('/api/printing?device_id=d1')))
    await call(`${cc}|printing|getNoDevice`, T(), () => M.printing.GET(get('/api/printing?token=tok-test')))
    await call(`${cc}|printing|badJson`, T(), () => M.printing.POST(post('/api/printing', '{not json')))
    await call(`${cc}|printing|postNoToken`, T(), () => M.printing.POST(post('/api/printing', { device_id: 'd1', action: 'claim' })))
    await call(`${cc}|printing|postNoDevice`, T(), () => M.printing.POST(post('/api/printing', { token: 'tok-test', action: 'claim' })))
    await call(`${cc}|printing|unknownAction`, T(), () => M.printing.POST(post('/api/printing', { token: 'tok-test', device_id: 'd1', action: 'explode' })))
    await call(`${cc}|printing|noVan`, T(), () => M.printing.POST(post('/api/printing', { token: 'tok-test', device_id: 'd1', action: 'claim' })))
    await call(`${cc}|printing|badAddress`, T(), () => M.printing.POST(post('/api/printing', { token: 'tok-test', device_id: 'd-bound', action: 'set_address', address: 'not an address' })))
    await call(`${cc}|printing|goodAddress`, T(), () => M.printing.POST(post('/api/printing', { token: 'tok-test', device_id: 'd-bound', action: 'set_address', address: '192.168.1.50' })))
    // native: binding a device
    await call(`${cc}|bind|getBadToken`, T(), () => M.bind.GET(get('/api/native/bind-device?token=nope')))
    await call(`${cc}|bind|postBadToken`, T(), () => M.bind.POST(post('/api/native/bind-device', { token: 'nope', device_id: 'd1' })))
    await call(`${cc}|bind|noDevice`, T(), () => M.bind.POST(post('/api/native/bind-device', { token: 'tok-test' })))
    await call(`${cc}|bind|vanNotForTruck`, T(), () => M.bind.POST(post('/api/native/bind-device', { token: 'tok-test', device_id: 'd1', van_id: 'v-other' })))
    await call(`${cc}|bind|badScreen`, T(), () => M.bind.POST(post('/api/native/bind-device', { token: 'tok-test', device_id: 'd1', default_screen: 'toaster' })))
  }
  return out
}

/** NAMED DIFFERENCE 1, per view. Returns true when it handled the view (the runner then skips its own diff). */
function compare(key, B, A, ctx) {
  const { t } = ctx
  if (!ctx.AFTER) return false
  if (typeof B === 'string' || typeof A === 'string') { t(`api · ${key}: ran`, B === A, `${B} · ${A}`); return true }
  t(`api · ${key}: status unchanged (${B.status})`, A.status === B.status, A.status)
  t(`api · ${key}: same Retry-After`, A.retryAfter === B.retryAfter)
  t(`api · ${key}: every email it sends is byte-identical`, JSON.stringify(A.sends) === JSON.stringify(B.sends), ctx.diffJson(B.sends, A.sends))
  let b, a
  try { b = JSON.parse(B.body); a = JSON.parse(A.body) } catch { t(`api · ${key}: body byte-identical`, A.body === B.body, `${B.body} · ${A.body}`); return true }
  const ours = b && typeof b.error === 'string' && !('code' in b) && a && 'code' in a
  if (!ours) { t(`api · ${key}: not one of our refusals — body byte-identical`, A.body === B.body, `BEFORE ${B.body}\n      AFTER  ${A.body}`); return true }
  const MESSAGES = require('./_lp2-frozen.cjs').enGBForNode()   // the frozen words under HG_MESSAGES_FROZEN (Language Phase 2 re-pin)
  const { createTranslator } = require(path.join(ctx.REPO, 'node_modules/next-intl'))
  const tr = l => createTranslator({ locale: l, messages: MESSAGES, namespace: 'errorsKitchen' })
  t(`api · ${key}: the BEFORE body is the exact prefix of the AFTER body`, A.body.startsWith(B.body.slice(0, -1) + ','), `BEFORE ${B.body}\n      AFTER  ${A.body}`)
  t(`api · ${key}: every BEFORE field unchanged, in its place`, JSON.stringify(Object.keys(a).slice(0, Object.keys(b).length)) === JSON.stringify(Object.keys(b))
    && Object.keys(b).every(k => JSON.stringify(a[k]) === JSON.stringify(b[k])), A.body)
  t(`api · ${key}: the only fields added are code and params, last`, JSON.stringify(Object.keys(a).slice(Object.keys(b).length)) === '["code","params"]', Object.keys(a).join(','))
  const known = typeof a.code === 'string' && MESSAGES.errorsKitchen && a.code in MESSAGES.errorsKitchen
  t(`api · ${key}: "${a.code}" is an errorsKitchen message`, known)
  t(`api · ${key}: params is an object of strings and numbers`, a.params && typeof a.params === 'object' && !Array.isArray(a.params) && Object.values(a.params).every(v => typeof v === 'string' || typeof v === 'number'))
  if (known) t(`api · ${key}: the words for the code are today's error, en-GB and en-US`, tr('en-GB')(a.code, a.params) === b.error && tr('en-US')(a.code, a.params) === b.error, `${tr('en-GB')(a.code, a.params)} · ${b.error}`)
  return true
}

/** AFTER only: no refusal of OURS is left without a code in the kitchen routes. What remains with a bare `error` is
 *  text that is not ours (a database or exception message, passed on as it came) or the one body that already carries
 *  the database's own `code`. */
async function after(ctx) {
  const { t, head, read } = ctx
  head('api · every literal refusal in the kitchen routes carries a code')
  const FILES = ['app/api/dashboard/route.ts', 'app/api/dashboard/action/route.ts', 'app/api/printing/route.ts',
    'app/api/native/bind-device/route.ts', 'app/api/native/switch-truck/route.ts', 'app/api/native/my-trucks/route.ts']
  const ALLOWED = [
    "{ error: 'Could not save that extra. The stock table needs attention.', code: err.code }",   // carries the database's own code
  ]
  for (const f of FILES) {
    const src = read(f).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
    const bare = [...src.matchAll(/\{\s*error:\s*(['"`])((?:(?!\1).)*)\1[^}]*\}/g)].map(m => m[0]).filter(m => !ALLOWED.includes(m))
    t(`${f}: no literal refusal without a code`, bare.length === 0, bare.join(' · '))
  }
  t('lib/payments/refund.ts: every refusal of ours is a code (Stripe\'s own words pass through)', !/detail: '|detail: `/.test(read('lib/payments/refund.ts')))
}

module.exports = { views, compare, after }
