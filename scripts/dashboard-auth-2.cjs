#!/usr/bin/env node
// scripts/dashboard-auth-2.cjs — dashboard-auth-2 (docs/dashboard-auth-2-report.md): every staff client carries its
// sign-in, and the member gate (lib/auth/require-member.ts) runs in LOG MODE on every staff route.
// Everything runs IN MEMORY (scripts/_fake-pg.cjs, scripts/_render-kit.cjs): no database, no network.
//
//   A · static — every route in the brief calls requireMember (heartbeat does not); every staff call site in the
//       dashboard, Add order and the KDS goes through staffFetch; the queue's post() reads the session at send time
//   B · the wrapper — adds the header with a session, sends without one, survives a throwing or hanging session read
//   C · the offline queue — a replayed op carries the session current at REPLAY time
//   D · the routes — log mode never changes a response; rows only for callers the rule would refuse; none for members,
//       demos or the heartbeat; no token / PIN / customer data in a row; board reads throttled with a suppressed count
//   E · enforce mode (not switched on anywhere) — refuses exactly the planned callers; a failed check is a retryable 503
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
require('./_harness-tmp.cjs')
const REPO = require('path').resolve(__dirname, '..')
process.chdir(REPO)
const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'dashboard-auth-2' })
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 700)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// ══ A · STATIC ═══════════════════════════════════════════════════════════════════════════════════════════════════════
const GATED = {
  'app/api/dashboard/action/route.ts': 1, 'app/api/dashboard/route.ts': 1, 'app/api/events/action/route.ts': 1,
  'app/api/events/manage/route.ts': 1, 'app/api/events/affected-orders/route.ts': 1, 'app/api/event-types/route.ts': 1,
  'app/api/weekly-post/route.ts': 2, 'app/api/printing/route.ts': 2, 'app/api/native/bind-device/route.ts': 2,
  'app/api/manage/whatsapp-signup/route.ts': 1, 'app/api/manage/process-menu/route.ts': 1, 'app/api/manage/process-schedule/route.ts': 1,
  'app/api/manage/process-allergens/route.ts': 1, 'app/api/manage/verify-schedule-url/route.ts': 1, 'app/api/manage/whatsapp-preview/route.ts': 1,
}
const STAFF_ROUTE = /(?<![A-Za-z_.])fetch\((['`])\/api\/(dashboard|events\/action|events\/manage|events\/affected-orders|event-types|printing|manage|native\/bind-device)\b/
function staticChecks() {
  head('A · static: the gate on every route, the wrapper on every call')
  for (const [f, n] of Object.entries(GATED)) {
    const c = code(read(f))
    const calls = (c.match(/await requireMember\(req, /g) || []).length
    const refuses = (c.match(/if \(gate\.refuse\) return gate\.refuse/g) || []).length
    t(`${f}: requireMember called ${n}× (once per handler), each followed by "if (gate.refuse) return gate.refuse"`, calls === n && refuses === n, `${calls} calls, ${refuses} refusal returns`)
  }
  t('/api/heartbeat does NOT call it (a refused heartbeat would pause online ordering)', !/requireMember/.test(read('app/api/heartbeat/route.ts')))
  const da = code(read('app/api/dashboard/action/route.ts'))
  const gateAt = da.indexOf('await requireMember(req, supabase, truck, action')
  const firstAction = da.indexOf("if (action === '")
  t('dashboard/action: the gate runs before EVERY action branch (and after the token/PIN check and the actor)', gateAt > 0 && gateAt < firstAction && gateAt > da.indexOf('const actor = await resolveActorSafe('), `${gateAt} vs ${firstAction}`)
  t('dashboard/action: reads / group 1 / group 2 are named (refund, update_event, create_event_now in group 1)', /DASHBOARD_GROUP1_ACTIONS = new Set\(\['refund', 'update_event', 'create_event_now'\]\)/.test(da) && /DASHBOARD_READ_ACTIONS = new Set\(\['get_item_overrides', 'get_stock', 'get_events', 'create_event_places'\]\)/.test(da))
  const db = code(read('app/api/dashboard/route.ts'))
  t('board read: gated AFTER the PIN check, with the route\'s own actor (no second lookup)', db.indexOf("requireMember(req, supabase, truck, 'board', { route: '/api/dashboard', group: 'read', actor })") > db.indexOf("'invalid_pin'"))
  const rm = read('lib/auth/require-member.ts')
  t("AUTH_MODE is 'log' for every group (no enforcement in this build)", /export const AUTH_MODE: Record<AuthGroup, AuthMode> = \{ group1: 'log', group2: 'log', read: 'log' \}/.test(rm))
  for (const f of ['app/(app)/dashboard/[token]/page.tsx', 'app/(app)/dashboard/[token]/kds/page.tsx', 'components/dashboard/AddOrderPanel.tsx', 'lib/useReadyEmailUndo.ts', 'lib/printing/networkGuard.ts']) {
    const c = code(read(f))
    const bare = c.split('\n').filter(l => STAFF_ROUTE.test(l))
    const wrapped = (c.match(/staffFetch\((['`])\/api\//g) || []).length
    t(`${f}: every staff call goes through staffFetch (${wrapped}), none bare`, bare.length === 0 && wrapped > 0, bare.slice(0, 3).join('\n      '))
  }
  t('lib/native/device.ts: both bind-device calls go through staffFetch', (code(read('lib/native/device.ts')).match(/\.staffFetch\((['`])\/api\/native\/bind-device/g) || []).length === 2)
  const og = code(read('lib/native/orderGate.ts'))
  const post = og.slice(og.indexOf('async function post('), og.indexOf('async function post(') + 600)
  t('orderGate post(): reads staffAuthHeaders() INSIDE post — at send time, for live sends and replays', /const auth = await staffAuthHeaders\(\)/.test(post) && /headers: \{ 'Content-Type': 'application\/json', \.\.\.auth \}/.test(post))
  t('outbox ops still store no header and no session (only url + body)', !/authorization|bearer/i.test(code(read('lib/native/outbox.ts'))))
  const kds = code(read('app/(app)/dashboard/[token]/kds/page.tsx'))
  t('KDS: the kitchen-screen marker is set only for /kds/<kds_token> (the token PROP)', /setStaffClientMarker\(tokenProp \? 'kds-link' : null\)/.test(kds))
  t('private_link calls to /api/manage now carry the sign-in (staffFetch)', (code(read('app/(app)/dashboard/[token]/page.tsx')).match(/staffFetch\('\/api\/manage',\{[\s\S]{0,200}?private_link/g) || []).length >= 1)
  t('SessionAlertBanner and the "Access denied" link go to /login?next=<this page>', /href=\{loginHrefBackHere\(\)\}/.test(read('components/auth/SessionAlertBanner.tsx')) && /<Link href=\{loginHrefBackHere\(\)\} data-gate-next="login"/.test(read('app/(app)/dashboard/[token]/page.tsx')))
}

// ══ B · THE WRAPPER ══════════════════════════════════════════════════════════════════════════════════════════════════
async function wrapperChecks() {
  head('B · staffFetch / staffAuthHeaders')
  const SESSION = `export async function nativeAuthHeader() { const s = globalThis.__session; if (s === 'throw') throw new Error('storage fault'); if (s === 'hang') return new Promise(() => {}); return s ? { Authorization: 'Bearer ' + s } : {} }`
  const W = await kit.bundle('da2-wrapper', "export * from '@/lib/native/staffFetch'", { stubs: { '@/lib/native/session': SESSION } })
  const sent = []
  globalThis.fetch = async (url, init) => { sent.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), init }); return new Response('{}', { status: 200 }) }
  globalThis.__session = 'JWT-A'
  await W.staffFetch('/api/dashboard/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  t('a session → Authorization: Bearer <current token>, Content-Type kept', sent[0].headers.authorization === 'Bearer JWT-A' && sent[0].headers['content-type'] === 'application/json', JSON.stringify(sent[0].headers))
  await W.staffFetch('/api/manage', { headers: { Authorization: 'Bearer CALLER' } })
  t('a header the caller set is never overridden', sent[1].headers.authorization === 'Bearer CALLER')
  globalThis.__session = null
  await W.staffFetch('/api/dashboard/action', { method: 'POST', body: '{}' })
  t('no session → sent exactly as before, with no Authorization header', sent.length === 3 && !('authorization' in sent[2].headers), JSON.stringify(sent[2].headers))
  globalThis.__session = 'throw'
  let threw = false; try { await W.staffFetch('/api/events/action', { method: 'POST' }) } catch { threw = true }
  t('a session read that THROWS → the call still goes, without the header', !threw && sent.length === 4 && !('authorization' in sent[3].headers))
  globalThis.__session = 'hang'
  const t0 = performance.now(); await W.staffFetch('/api/events/action', { method: 'POST' }); const waited = Math.round(performance.now() - t0)
  t(`a session read that HANGS → sent after the ${W.AUTH_HEADER_BUDGET_MS} ms budget, without the header (waited ${waited} ms)`, sent.length === 5 && !('authorization' in sent[4].headers) && waited >= W.AUTH_HEADER_BUDGET_MS - 50 && waited < W.AUTH_HEADER_BUDGET_MS + 1000)
  globalThis.__session = 'JWT-K'; W.setStaffClientMarker('kds-link')
  await W.staffFetch('/api/dashboard', {})
  t('the kitchen-screen marker rides along (X-HG-Client: kds-link) with the session', sent[5].headers['x-hg-client'] === 'kds-link' && sent[5].headers.authorization === 'Bearer JWT-K')
  W.setStaffClientMarker(null)
  await W.staffFetch('/api/dashboard', {})
  t('…and is gone when cleared', !('x-hg-client' in sent[6].headers))
  t('method, body and other init fields pass through unchanged', sent[0].init.method === 'POST' && sent[0].init.body === '{}')
}

// ══ C · THE OFFLINE QUEUE ════════════════════════════════════════════════════════════════════════════════════════════
async function queueChecks() {
  head('C · the offline queue: live sends and replays carry the session current at SEND time')
  const PREFS = `const m = new Map(); export const Preferences = { async get({ key }) { return { value: m.has(key) ? m.get(key) : null } }, async set({ key, value }) { m.set(key, value) }, async remove({ key }) { m.delete(key) }, async keys() { return { keys: [...m.keys()] } } }`
  const SESSION = `export async function nativeAuthHeader() { const s = globalThis.__session; return s ? { Authorization: 'Bearer ' + s } : {} }`
  const G = await kit.bundle('da2-queue', "export { gatedAction, drainOutbox } from '@/lib/native/orderGate'\nexport { listOps } from '@/lib/native/outbox'", {
    stubs: { '@capacitor/preferences': PREFS, '@/lib/native/device': "export const isNativeApp = () => true; export const getDeviceId = () => 'dev-test'", '@/lib/native/session': SESSION },
  })
  const sent = []
  let online = false
  globalThis.fetch = async (url, init) => {
    if (!online) throw new TypeError('Failed to fetch')
    sent.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  globalThis.__session = 'JWT-QUEUED'
  const r = await G.gatedAction({ url: '/api/dashboard/action', body: { token: 'tok', pin: '', action: 'collected', order_key: 'ok-1' }, kind: 'status', order_key: 'ok-1', online: false, expectedFrom: ['confirmed', 'collected'] })
  const ops = await G.listOps()
  t('offline: the write is queued (not failed)', r.queued === true && ops.length === 1, JSON.stringify(r))
  t('the queued op stores no header, no session token', !JSON.stringify(ops[0]).includes('JWT-QUEUED') && !/authorization/i.test(JSON.stringify(ops[0])))
  globalThis.__session = 'JWT-AT-REPLAY'; online = true
  const d = await G.drainOutbox()
  t('replay: sent once, and synced', d.synced === 1 && sent.length === 1, JSON.stringify(d))
  t('🔴 the replay carries the session CURRENT AT REPLAY (Bearer JWT-AT-REPLAY), not the one from when it queued', sent[0]?.headers.authorization === 'Bearer JWT-AT-REPLAY', JSON.stringify(sent[0]?.headers))
  t('…and still its expected_from (the replay guard is unchanged)', Array.isArray(sent[0]?.body.expected_from))
  globalThis.__session = null
  const live = await G.gatedAction({ url: '/api/dashboard/action', body: { token: 'tok', action: 'cooking', order_key: 'ok-2' }, kind: 'status', order_key: 'ok-2', online: true })
  t('signed out: a live send goes exactly as before — no header, not failed', live.ok === true && sent.length === 2 && !('authorization' in sent[1].headers), JSON.stringify(live))
}

// ══ D · THE ROUTES (in memory) ═══════════════════════════════════════════════════════════════════════════════════════
const ACTOR = `
const TOKEN = { actorKind: 'token', actorId: null, actorLabel: null, userRole: null, currentUserName: null, foreignOperator: false }
function who() {
  const r = globalThis.__role
  if (r === 'throw') throw new Error('auth service down')
  if (r === 'foreign') return { actorKind: 'token', actorId: 'u-other-op', actorLabel: 'Other Operator <other@example.test>', userRole: null, currentUserName: null, foreignOperator: true }
  if (r === 'owner' || r === 'manager' || r === 'staff') return { actorKind: r === 'owner' ? 'owner' : 'staff', actorId: 'u-' + r, actorLabel: 'Test ' + r, userRole: r, currentUserName: 'Test ' + r, foreignOperator: false }
  return TOKEN
}
export async function resolveActor() { return who() }
export async function resolveActorSafe() { try { return who() } catch { return { ...TOKEN, actorKind: 'unknown' } } }
export function resolveActorSource(req, body) {
  if (Array.isArray(body?.expected_from)) return 'offline_replay'
  if ((req.headers.get('user-agent') || '').includes('HatchGrabNativeApp')) return 'native'
  return 'web'
}`
const STUBS = {
  '@/lib/apns': 'export async function sendOrderPendingPush() {}\nexport function normaliseApnsKey(k) { return k }',
  '@/lib/fcm': 'export async function sendOrderPendingPush() {}',
  '@/lib/payments/authorize': 'export async function authorizeDraft() { return { ok: true } }\nexport async function cancelAuthorization() { return { ok: true } }\nexport async function stripeAccountForTruck() { return null }',
  '@/lib/payments/capture': 'export async function captureOnConfirmation() { return { ok: true, outcome: "nothing_to_capture" } }',
  '@/lib/audit/actor': ACTOR,
}
const NOOP_GATE = "export const AUTH_MODE = { group1: 'log', group2: 'log', read: 'log' }\nexport async function requireMember() { return { refuse: null } }\nexport async function flushAuthShadow() {}\nexport function __resetAuthShadowThrottle() {}"
const EMAIL_PATCH = { file: 'lib/email.ts', from: 'export async function sendConfirmationEmail(params: {', to: 'export async function sendConfirmationEmail(params: any) { return true }\nasync function __realSendConfirmationEmail(params: {' }
const D = '2026-11-18'
const TRUCK = { id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', active: true, plan: 'pro', country: 'GB', currency: 'GBP', timezone: 'Europe/London',
  auto_accept: true, operator_id: 'op-test', time_selection_enabled: true, contact_email: 'kitchen@example.test', dashboard_token: 'tok-test-SECRET-1234', dashboard_pin: '4321',
  takes_cash: true, default_auto_open: false, default_auto_close: true }
const DEMO = { ...TRUCK, id: 'demo-abc123', slug: 'demo-abc123', dashboard_token: 'demo-tok-xyz', dashboard_pin: null, operator_id: null }
const EV = { id: 'ev-1', truck_id: 'test-truck', event_date: D, start_time: '17:00:00', end_time: '21:00:00', venue_name: 'Harnessville Green', town: 'Harnessville', status: 'confirmed', van_id: 'v1', opened_at: null, closed_at: null, auto_open: false, auto_close: true }
const ORDER = { order_key: 'ok-secret-order', id: '7', truck_id: 'test-truck', event_id: 'ev-1', event_date: D, status: 'confirmed', source: 'manual', customer_name: 'Customer Sentinel', customer_email: 'sentinel@customer.test', customer_phone: '+447700900999', slot: '17:30', items: [], total: 10, total_minor: 1000 }
function tables() {
  return {
    trucks: [{ ...TRUCK }, { ...DEMO }], country_settings: [snake(SEEDS.gbFromSeed())],
    menu_items_db: [], menu_categories: [], modifier_groups: [], modifier_options: [], item_modifier_groups: [], bundles_db: [], discount_codes_db: [],
    truck_events: [{ ...EV }, { ...EV, id: 'ev-demo', truck_id: 'demo-abc123' }], orders: [{ ...ORDER }, { ...ORDER, order_key: 'ok-demo', truck_id: 'demo-abc123', event_id: 'ev-demo' }],
    order_drafts: [], order_payments: [], booking_locks: [], production_slot_usage: [], slot_capacity: [], event_deals: [], event_item_stock: [], event_option_stock: [],
    truck_vans: [{ id: 'v1', truck_id: 'test-truck', name: 'Van 1', active: true, kitchen_capacity: 6 }], truck_places: [], truck_users: [], operators: [],
    action_audit_log: [], rejected_event_signatures: [],
    ...require('./_lp1c-fixtures.cjs').planTables(),
  }
}
let M
async function mods() {
  if (M) return M
  const entry = (route, method = 'POST') => `export { ${method} } from '@/app/api/${route}/route'\nexport { flushAuthShadow, __resetAuthShadowThrottle } from '@/lib/auth/require-member'`
  const b = (tag, route, method, noop) => kit.bundle(tag, entry(route, method), { stubs: noop ? { ...STUBS, '@/lib/auth/require-member': NOOP_GATE } : STUBS, patches: [{ ...EMAIL_PATCH, optional: true }] })
  M = {
    action: await b('da2-action', 'dashboard/action', 'POST'), actionNoop: await b('da2-action-noop', 'dashboard/action', 'POST', true),
    events: await b('da2-events', 'events/action', 'POST'), eventsNoop: await b('da2-events-noop', 'events/action', 'POST', true),
    list: await b('da2-list', 'events/manage', 'GET'), listNoop: await b('da2-list-noop', 'events/manage', 'GET', true),
    heartbeat: await kit.bundle('da2-heartbeat', "export { POST } from '@/app/api/heartbeat/route'", { stubs: STUBS }),
    gate: await kit.bundle('da2-gate', "export * from '@/lib/auth/require-member'", { stubs: STUBS }),
  }
  return M
}
async function run(fn) {
  const db = makeFakePg(tables(), { keys: { orders: [['order_key']] }, defaults: { orders: { currency: 'GBP', country: 'GB' } } })
  globalThis.__harnessDb = { ...db, rpc: async () => ({ data: null, error: null }) }
  try { const m = await mods(); return { out: await kit.quietAsync(() => fn(m, db)), db } }
  finally { delete globalThis.__harnessDb }
}
const req = (url, { method = 'POST', body, ua, kds } = {}) => new NextRequest(`http://localhost${url}`, {
  method, body: body ? JSON.stringify(body) : undefined,
  headers: { 'content-type': 'application/json', ...(ua ? { 'user-agent': ua } : {}), ...(kds ? { 'x-hg-client': 'kds-link' } : {}) },
})
const J = async res => ({ status: res.status, body: await res.json().catch(() => null) })
const shadow = db => db.tables.action_audit_log.filter(r => String(r.action).startsWith('auth_shadow:'))
const nonShadowWrites = db => JSON.stringify(db.writes.filter(w => !(w.table === 'action_audit_log' && String(w.row?.action).startsWith('auth_shadow:'))).map(w => ({ ...w, id: undefined, row: w.row && Object.fromEntries(Object.entries(w.row).filter(([k]) => !/(_at|^id)$/.test(k))) })))
const stripVolatile = o => JSON.parse(JSON.stringify(o, (k, v) => (/(_at|At|timestamp|serverTime|now)$/.test(k) ? undefined : v)))

async function routeChecks() {
  head('D · the routes, in log mode')
  const CASES = [
    ['dashboard/action set_extra_wait', 'action', '/api/dashboard/action', { token: TRUCK.dashboard_token, pin: '4321', action: 'set_extra_wait', minutes: 10, eventId: 'ev-1' }],
    ['dashboard/action cooking (a status)', 'action', '/api/dashboard/action', { token: TRUCK.dashboard_token, pin: '4321', action: 'cooking', order_key: 'ok-secret-order' }],
    ['dashboard/action get_stock (a read)', 'action', '/api/dashboard/action', { token: TRUCK.dashboard_token, pin: '4321', action: 'get_stock', event_id: 'ev-1' }],
    ['dashboard/action wrong PIN', 'action', '/api/dashboard/action', { token: TRUCK.dashboard_token, pin: '0000', action: 'cooking', order_key: 'ok-secret-order' }],
    ['events/action confirm', 'events', '/api/events/action', { token: TRUCK.dashboard_token, action: 'update', eventId: 'ev-1', payload: { customer_note: 'x' } }],
  ]
  // 1 · log mode never changes a response: the same requests through the real gate and through a no-op gate
  for (const role of [null, 'owner', 'foreign']) {
    for (const [label, mod, url, body] of CASES) {
      const real = await run(async m => { globalThis.__role = role; const r = await J(await m[mod].POST(req(url, { body }))); await m[mod].flushAuthShadow(); return r })
      const noop = await run(async m => { globalThis.__role = role; return J(await m[mod + 'Noop'].POST(req(url, { body }))) })
      t(`log mode changes nothing — ${label}, caller ${role ?? 'token-only'}: same status, same body, same writes`,
        real.out.status === noop.out.status && JSON.stringify(stripVolatile(real.out.body)) === JSON.stringify(stripVolatile(noop.out.body)) && nonShadowWrites(real.db) === nonShadowWrites(noop.db),
        `real ${real.out.status} ${JSON.stringify(real.out.body).slice(0, 160)}\n      noop ${noop.out.status} ${JSON.stringify(noop.out.body).slice(0, 160)}`)
    }
  }
  {
    const real = await run(async m => { globalThis.__role = null; const r = await J(await m.list.GET(req(`/api/events/manage?token=${TRUCK.dashboard_token}&upcoming=true`, { method: 'GET' }))); await m.list.flushAuthShadow(); return r })
    const noop = await run(async m => { globalThis.__role = null; return J(await m.listNoop.GET(req(`/api/events/manage?token=${TRUCK.dashboard_token}&upcoming=true`, { method: 'GET' }))) })
    t('log mode changes nothing — events/manage (a board read), token-only', real.out.status === noop.out.status && JSON.stringify(stripVolatile(real.out.body)) === JSON.stringify(stripVolatile(noop.out.body)))
  }

  // 2 · who gets a row
  const one = async (role, body, opts = {}) => run(async m => { globalThis.__role = role; m.action.__resetAuthShadowThrottle(); const r = await J(await m.action.POST(req('/api/dashboard/action', { body, ...opts }))); await m.action.flushAuthShadow(); return r })
  const B = { token: TRUCK.dashboard_token, pin: '4321', action: 'cooking', order_key: 'ok-secret-order' }
  for (const role of ['owner', 'manager', 'staff']) {
    const { db } = await one(role, B)
    t(`a signed-in ${role}: no shadow row`, shadow(db).length === 0)
  }
  {
    const { db } = await one(null, B)
    const rows = shadow(db)
    const r = rows[0] || {}
    t('token-only: one row, action auth_shadow:cooking, truck test-truck', rows.length === 1 && r.action === 'auth_shadow:cooking' && r.truck_id === 'test-truck', JSON.stringify(rows))
    t('…caller token_only, client web, group group2, mode log, route named, source web', r.after_state?.caller_kind === 'token_only' && r.after_state?.client === 'web' && r.after_state?.group === 'group2' && r.after_state?.mode === 'log' && r.after_state?.route === '/api/dashboard/action' && r.source === 'web', JSON.stringify(r))
    const s = JSON.stringify(rows)
    t('🔴 the row holds no token, no PIN, no order key, no customer name / email / phone', !s.includes(TRUCK.dashboard_token) && !s.includes('4321') && !s.includes('ok-secret-order') && !/Sentinel|sentinel@|7700900999/.test(s) && r.order_key === null && r.amount_minor === null && r.before_state === null, s)
    t('…and no operator label either (actor_label NULL)', r.actor_label === null)
  }
  {
    const { db } = await one('foreign', B)
    const r = shadow(db)[0] || {}
    t('a signed-in operator of ANOTHER truck writing: row, caller foreign_operator, actor_id kept, label NULL', r.after_state?.caller_kind === 'foreign_operator' && r.actor_id === 'u-other-op' && r.actor_label === null, JSON.stringify(r))
  }
  {
    const { db } = await one(null, B, { kds: true })
    const r = shadow(db)[0] || {}
    t('a /kds/<kds_token> screen with nobody signed in: caller kds, client kds', r.after_state?.caller_kind === 'kds' && r.after_state?.client === 'kds', JSON.stringify(r))
    const m2 = await one('staff', B, { kds: true })
    t('…a signed-in member on that screen: no row', shadow(m2.db).length === 0)
  }
  {
    const { db } = await one(null, B, { ua: 'Mozilla/5.0 HatchGrabNativeApp' })
    const r = shadow(db)[0] || {}
    t('the app, signed out: client app, source native', r.after_state?.client === 'app' && r.source === 'native', JSON.stringify(r))
    const rp = await one(null, { ...B, expected_from: ['confirmed', 'cooking'] }, { ua: 'Mozilla/5.0 HatchGrabNativeApp' })
    t('an offline replay: source offline_replay', shadow(rp.db)[0]?.source === 'offline_replay', JSON.stringify(shadow(rp.db)))
  }
  {
    const { db } = await one(null, { ...B, action: 'refund', amount_minor: 100 })
    t('refund token-only: group group1', shadow(db)[0]?.after_state?.group === 'group1')
    const odd = await one(null, { ...B, action: "x'; drop table--" })
    t('an unrecognised action name is logged as auth_shadow:unknown (nothing from the body is copied)', shadow(odd.db)[0]?.action === 'auth_shadow:unknown', JSON.stringify(shadow(odd.db)))
  }
  {
    const { db } = await one(null, { ...B, pin: '0000' })
    t('a wrong PIN is refused BEFORE the gate (401) and writes no row', shadow(db).length === 0)
  }
  {
    const { db } = await one('throw', B)
    const r = shadow(db)[0] || {}
    t('the sign-in check failing: logged as caller unresolved (under enforcement: a retryable 503, never a refusal)', r.after_state?.caller_kind === 'unresolved', JSON.stringify(r))
  }
  {
    const { db } = await run(async m => { globalThis.__role = null; const r = await J(await m.action.POST(req('/api/dashboard/action', { body: { token: DEMO.dashboard_token, action: 'cooking', order_key: 'ok-demo' } }))); await m.action.flushAuthShadow(); return r })
    t('a demo truck: exempt — no row', shadow(db).length === 0)
  }
  {
    const { db } = await run(async m => { globalThis.__role = null; const r = await J(await m.events.POST(req('/api/events/action', { body: { token: TRUCK.dashboard_token, action: 'confirm', eventId: 'ev-1', payload: {} } }))); await m.events.flushAuthShadow(); return r })
    const r = shadow(db)[0] || {}
    t('events/action confirm token-only: row auth_shadow:confirm, group1', r.action === 'auth_shadow:confirm' && r.after_state?.group === 'group1' && r.after_state?.route === '/api/events/action', JSON.stringify(shadow(db)))
  }
  {
    const { out, db } = await run(async m => { globalThis.__role = null; return J(await m.heartbeat.POST(req('/api/heartbeat', { body: { token: TRUCK.dashboard_token } }))) })
    t('/api/heartbeat token-only: answered as before and writes NO audit row (exempt)', out.status === 200 && db.tables.action_audit_log.length === 0, JSON.stringify(out))
  }

  // 3 · board reads: one row per truck × caller × client per hour, with the suppressed count
  {
    const { db } = await run(async m => {
      globalThis.__role = null; m.list.__resetAuthShadowThrottle()
      const get = () => m.list.GET(req(`/api/events/manage?token=${TRUCK.dashboard_token}&upcoming=true`, { method: 'GET' }))
      kit.setNow('2026-11-18T12:00:00.000Z'); await get(); await m.list.flushAuthShadow()
      for (let i = 0; i < 4; i++) { kit.setNow(`2026-11-18T12:${String(10 + i * 10).padStart(2, '0')}:00.000Z`); await get(); await m.list.flushAuthShadow() }
      kit.setNow('2026-11-18T13:05:00.000Z'); await get(); await m.list.flushAuthShadow()
      kit.setNow('2026-11-18T13:06:00.000Z'); await get(); await m.list.flushAuthShadow()
      // a different client (the app) gets its own window
      await m.list.GET(req(`/api/events/manage?token=${TRUCK.dashboard_token}&upcoming=true`, { method: 'GET', ua: 'HatchGrabNativeApp' })); await m.list.flushAuthShadow()
    })
    const rows = shadow(db)
    const web = rows.filter(r => r.after_state?.client === 'web')
    t('7 token-only board reads in 66 minutes from one screen → 2 rows', web.length === 2, JSON.stringify(rows.map(r => r.after_state)))
    t('…the first says 0 suppressed; the next says 4 suppressed since 12:00', web[0]?.after_state?.reads_suppressed_before === 0 && web[1]?.after_state?.reads_suppressed_before === 4 && web[1]?.after_state?.suppressed_since === '2026-11-18T12:00:00.000Z', JSON.stringify(web.map(r => r.after_state)))
    t('…group read, action auth_shadow:events_list', web.every(r => r.after_state?.group === 'read' && r.action === 'auth_shadow:events_list'))
    t('the app reading at the same time gets its own row (key = truck × caller × client)', rows.filter(r => r.after_state?.client === 'app').length === 1)
    kit.setNow('2026-11-18T12:00:00.000Z')
  }
  {
    const { db } = await run(async m => { globalThis.__role = 'staff'; m.list.__resetAuthShadowThrottle(); for (let i = 0; i < 3; i++) await m.list.GET(req(`/api/events/manage?token=${TRUCK.dashboard_token}&upcoming=true`, { method: 'GET' })); await m.list.flushAuthShadow() })
    t('a signed-in member reading the board: no rows', shadow(db).length === 0)
  }

  // 4 · logging can never break or slow a write
  {
    const G = (await mods()).gate
    const broken = { from() { throw new Error('database gone') } }
    const t0 = performance.now()
    globalThis.__role = null
    const r = await G.requireMember(new NextRequest('http://localhost/api/x', { method: 'POST' }), broken, { id: 'test-truck', operator_id: 'op-test' }, 'cooking', { route: '/api/x', group: 'group2' })
    const ms = Math.round(performance.now() - t0)
    await kit.quietAsync(() => G.flushAuthShadow())
    t(`a database that throws on the log insert: requireMember still returns { refuse: null }, in ${ms} ms`, r.refuse === null && ms < 50)
    let slowResolved = false
    const slow = { from() { return { insert: () => new Promise(res => setTimeout(() => { slowResolved = true; res({ error: null }) }, 400)) } } }
    const t1 = performance.now()
    const r2 = await G.requireMember(new NextRequest('http://localhost/api/x', { method: 'POST' }), slow, { id: 'test-truck', operator_id: 'op-test' }, 'cooking', { route: '/api/x', group: 'group2' })
    const ms2 = Math.round(performance.now() - t1)
    t(`a 400 ms log insert is not waited for: returned in ${ms2} ms, before the insert finished`, r2.refuse === null && ms2 < 50 && !slowResolved)
    await kit.quietAsync(() => G.flushAuthShadow())
  }
}

// ══ E · ENFORCE MODE (not switched on anywhere) ═══════════════════════════════════════════════════════════════════════
async function enforceChecks() {
  head('E · enforce mode, for when a group is switched on (unit only)')
  const G = (await mods()).gate
  const db = makeFakePg(tables(), {})
  const call = async (role, extra = {}) => { globalThis.__role = role; return G.requireMember(new NextRequest('http://localhost/api/x', { method: 'POST', headers: extra }), db, { id: 'test-truck', operator_id: 'op-test' }, 'confirm', { route: '/api/x', group: 'group1', mode: 'enforce' }) }
  for (const role of ['owner', 'manager', 'staff']) t(`enforce: a signed-in ${role} passes`, (await call(role)).refuse === null)
  const tok = await call(null)
  t('enforce: token-only → 403 sign_in_required', tok.refuse?.status === 403 && (await tok.refuse.json()).code === 'sign_in_required')
  t('enforce: a foreign operator → 403', (await call('foreign')).refuse?.status === 403)
  t('enforce: a kitchen screen with nobody signed in → 403', (await call(null, { 'x-hg-client': 'kds-link' })).refuse?.status === 403)
  const un = await call('throw')
  t('enforce: the sign-in check failing → 503 retryable (never a refusal that would dead-letter a queued walk-up)', un.refuse?.status === 503 && (await un.refuse.json()).retryable === true)
  t('enforce: a demo truck passes', (await (async () => { globalThis.__role = null; return G.requireMember(new NextRequest('http://localhost/api/x', { method: 'POST' }), db, { id: 'demo-abc123', operator_id: null }, 'confirm', { route: '/api/x', group: 'group1', mode: 'enforce' }) })()).refuse === null)
  await kit.quietAsync(() => G.flushAuthShadow())
}

;(async () => {
  kit.setNow('2026-11-18T12:00:00.000Z'); kit.setDeviceTz('Europe/London')
  staticChecks()
  const realFetch = globalThis.fetch
  await wrapperChecks()
  await queueChecks()
  globalThis.fetch = realFetch
  await routeChecks()
  await enforceChecks()
  console.log(`\n${fail ? '🔴' : '✅'} dashboard-auth-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
