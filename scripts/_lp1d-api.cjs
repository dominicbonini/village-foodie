// scripts/_lp1d-api.cjs — Language Phase 1d, area `api`: the routes behind Manage's Menu, Schedule and Settings tabs —
// app/api/manage (POST, the in-scope actions; GET's stock warning), app/api/manage/{commit-menu,geocode,process-allergens,
// process-menu,process-schedule,verify-schedule-url}, app/api/events (GET), app/api/events/{action,affected-orders,manage}
// and app/api/event-types — every refusal they write (the API agent's recipe, ported from its scratch proof), a few
// successes, and four OUT-OF-SCOPE refusals (`|oos|` views: charges, team, reports, WhatsApp — must not change at all),
// for a GB and a US truck, as status, body and every write to the fake database.
// 🔴 NAMED DIFFERENCE 1: a refusal whose `error` is OUR sentence gains "code" and "params", LAST; scripts/_lp1d-checks.cjs
// proves it per field (BEFORE body is the exact prefix, every field unchanged and in place, the message rendered with the
// params is `error`, en-GB and — under F's words — en-US). Every write must be byte-identical.
// ⚠️ NOTHING REAL: Supabase is scripts/_fake-pg.cjs, the session is a stand-in, fetch returns a canned Gemini answer,
// no email leaves (lib/email is a recorder).
const path = require('path')

async function views(ctx) {
  const { kit } = ctx
  const REPO = ctx.REPO
  const SCRIPTS = path.join(REPO, 'scripts')
  const { makeFakePg } = require(path.join(SCRIPTS, '_fake-pg.cjs'))
  const SEEDS = require(path.join(SCRIPTS, '_country-settings-gb.cjs'))
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
  const STUBS = {
    '@/lib/supabase/server': `export async function createSupabaseServerClient() {
  return { auth: { getUser: async () => ({ data: { user: globalThis.__harnessUser ?? null }, error: null }) } }
}`,
    '@/lib/schedule-extract': `export async function extractScheduleEvents() { if (globalThis.__extract === 'throw') throw new Error('model down'); return [] }
export function normaliseExclusionTerm(t) { return String(t ?? '').trim().toLowerCase() }
export function isExcluded(name, terms) { return (terms || []).some(x => String(name || '').toLowerCase().includes(String(x).toLowerCase())) }`,
    '@/lib/menu-commit': `export async function commitMenu() { return { ok: true } }
export async function clearMenu() { throw new Error('clear broke') }`,
    '@/lib/email': `export const sendEventCancellationEmail = async (...a) => { (globalThis.__calls ||= []).push(['sendEventCancellationEmail', a.length]) }
export const sendConfirmationEmail = async (...a) => { (globalThis.__calls ||= []).push(['sendConfirmationEmail', a.length]) }`,
  }
  const cache = "\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"
  const M = await kit.bundle('lp1d-api', `
export { POST as managePOST, GET as manageGET } from '@/app/api/manage/route'
export { POST as etPOST } from '@/app/api/event-types/route'
export { POST as actionPOST } from '@/app/api/events/action/route'
export { GET as eventsGET } from '@/app/api/events/route'
export { GET as eventsManageGET } from '@/app/api/events/manage/route'
export { GET as affectedGET } from '@/app/api/events/affected-orders/route'
export { POST as commitPOST } from '@/app/api/manage/commit-menu/route'
export { POST as geocodePOST } from '@/app/api/manage/geocode/route'
export { POST as allergensPOST } from '@/app/api/manage/process-allergens/route'
export { POST as menuPOST } from '@/app/api/manage/process-menu/route'
export { POST as schedulePOST } from '@/app/api/manage/process-schedule/route'
export { POST as verifyPOST } from '@/app/api/manage/verify-schedule-url/route'` + cache, { stubs: STUBS })

  const out = {}
  const call = async (key, o, fn) => {
    const base = makeFakePg(o.tables, { keys: o.keys || {} })
    const fail = o.fail || {}
    const errChain = () => { const e = { data: null, error: { message: 'harness: the database refused', code: o.failCode || 'XX000' }, count: null }; const p = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? res => res(e) : () => p) }); return p }
    const from = t => { const c = base.from(t); const ops = fail[t]; if (!ops) return c; return new Proxy(c, { get: (x, k) => (ops.includes(k) ? () => errChain() : x[k]) }) }
    globalThis.__harnessDb = {
      ...base, from,
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      storage: { from: () => ({ createSignedUploadUrl: async () => ({ data: null, error: { message: 'storage says no' } }) }) },
    }
    globalThis.__harnessUser = o.user === undefined ? { id: 'u-1' } : o.user
    globalThis.__extract = o.extract
    globalThis.__calls = []
    const fetches = []
    const realFetch = globalThis.fetch
    globalThis.fetch = async u => { fetches.push(String(u).replace(/key=[^&]+/, 'key=…')); return { ok: true, status: 200, json: async () => (o.gemini || { error: { code: 400, message: 'bad' } }), text: async () => '{}' } }
    M.clearCountrySettingsCache?.()
    try {
      const res = await kit.quietAsync(fn)
      out[key] = { status: res.status, body: await res.text(), writes: base.writes, calls: globalThis.__calls, fetches }
    } catch (e) { out[key] = 'ERROR ' + String(e && e.message || e).slice(0, 300) }
    finally { globalThis.fetch = realFetch; delete globalThis.__harnessDb; delete globalThis.__harnessUser; delete globalThis.__extract; delete globalThis.__calls }
  }
  const req = (url, { method = 'GET', body } = {}) => new NextRequest(`http://127.0.0.1${url}`, {
    method, headers: body instanceof FormData ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: body instanceof FormData || typeof body === 'string' ? body : JSON.stringify(body) }),
  })
  const form = o => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f }

  for (const C of [ctx.GB, ctx.US]) {
    const cc = C.cc
    const zone = cc === 'US' ? 'America/Chicago' : 'Europe/London'
    const today = '2026-10-09'   // the harness clock's day (scripts/_lp1b-fixtures.cjs NOW)
    const T = (over = {}) => ({
      country_settings: [snake(SEEDS.gbFromSeed()), snake(ctx.US.settings)],
      trucks: [{ id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', dashboard_token: 'tok', operator_id: 'op-1', country: cc, timezone: zone,
        plan: 'max', feature_overrides: {}, trial_expires_at: null, setup_step: null, takes_cash: true, currency: cc === 'US' ? 'USD' : 'GBP', ...(over.truck || {}) }],
      operators: [{ id: 'op-1', auth_user_id: 'u-1', is_admin: false }, { id: 'op-2', auth_user_id: 'u-2', is_admin: false }],
      truck_users: [{ auth_user_id: 'u-staff', truck_id: 'test-truck', role: 'staff' }, { auth_user_id: 'u-mgr', truck_id: 'test-truck', role: 'manager' }],
      menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas', slug: 'pizzas', sort_order: 1, is_active: true }],
      menu_items_db: [{ id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 9.5, category_id: 'c1', is_active: true, is_available: false, stock_count: 0, allergens: [], dietary_info: [] },
        ...(over.orphan ? [{ id: 'i2', truck_id: 'test-truck', name: 'Mystery', price: 3, category_id: null, is_active: true, is_available: true }] : [])],
      menu_subcategories: [], modifier_groups: [{ id: 'g1', truck_id: 'test-truck', name: 'Size' }], modifier_options: [], item_modifier_groups: [], category_modifier_groups: [],
      bundles_db: [{ id: 'b1', truck_id: 'test-truck', name: 'Meal deal', slot_1_category: 'pizzas', is_available: true }], discount_codes_db: [], upsell_rules: [],
      truck_events: [
        { id: 'ev-live', truck_id: 'test-truck', venue_name: 'The Crown', event_date: today, start_time: null, end_time: null, status: 'confirmed', is_private: false },
        { id: 'ev-ok', truck_id: 'test-truck', venue_name: 'Market', event_date: today, start_time: '17:00', end_time: '20:00', status: 'confirmed', is_private: false, van_id: null },
        ...(over.events || [])],
      event_deals: [], slot_capacity: [], production_slot_usage: [], orders: [], rejected_event_signatures: [],
      truck_vans: over.vans || [{ id: 'v1', truck_id: 'test-truck', name: 'Van 1', active: true, created_at: '2026-01-01T00:00:00Z', same_as_first_van: false, capacity_same_as_first_van: false, buzzer_count: 10, order_ready_enabled: true, kitchen_capacity: 12, capacity_window_mins: 15 },
        { id: 'v2', truck_id: 'test-truck', name: over.vanNoName ? null : 'Van 2', active: true, created_at: '2026-02-01T00:00:00Z', same_as_first_van: false, capacity_same_as_first_van: false }],
      van_category_settings: over.vcs || [], excluded_terms: [], truck_places: [], event_types: over.types || [], event_item_prices: [],
      whatsapp_connections: [], whatsapp_logs: [], operator_email_changes: [],
    })
    const tok = (b) => ({ token: 'tok', ...b })
    const mg = (k, body, o = {}) => call(`${cc}|manage|${k}`, { tables: T(o), ...o }, () => M.managePOST(req('/api/manage', { method: 'POST', body })))
    // OUT OF SCOPE actions (charges, team, reports, WhatsApp): `|oos|` views, which must not change at all.
    const mgOos = (k, body, o = {}) => call(`${cc}|oos|manage|${k}`, { tables: T(o), ...o }, () => M.managePOST(req('/api/manage', { method: 'POST', body })))

    // ── the shared checks
    await mg('noToken', { action: 'upsert_item' })
    await mg('badToken', { token: 'nope', action: 'upsert_item' })
    await mg('noUser', tok({ action: 'upsert_item' }), { user: null })
    await mg('notThisTruck', tok({ action: 'upsert_item' }), { user: { id: 'u-2' } })
    await mg('staff', tok({ action: 'upsert_item', name: 'X' }), { user: { id: 'u-staff' } })
    await mgOos('noToken.update_charges', { action: 'update_charges' })
    await mgOos('staff.invite_team_member', tok({ action: 'invite_team_member' }), { user: { id: 'u-staff' } })
    await mgOos('noUser.get_report', tok({ action: 'get_report' }), { user: null })
    await mg('allergenOwnerOnly', tok({ action: 'upsert_item', name: 'X', category_id: 'c1', allergens: ['Milk'] }), { user: { id: 'u-mgr' } })
    await mg('allergenOwnerOnly.settings', tok({ action: 'update_settings', allergen_info_text: 'Nuts' }), { user: { id: 'u-mgr' } })
    // ── Menu
    await mg('subcatNoName', tok({ action: 'upsert_subcategory', name: ' ' }))
    await mg('subcatNoCategory', tok({ action: 'upsert_subcategory', name: 'Reds' }))
    await mg('upsellMissing', tok({ action: 'upsert_upsell_rule', trigger_category: 'c1' }))
    await mg('optionNotMine', tok({ action: 'upsert_modifier_option', id: 'o-x', name: 'L' }))
    await mg('optionGroupNotMine', tok({ action: 'upsert_modifier_option', group_id: 'g-x', name: 'L' }))
    await mg('deleteOptionNotMine', tok({ action: 'delete_modifier_option', id: 'o-x' }))
    await mg('itemGroupNotMine', tok({ action: 'set_item_modifier_group', group_id: 'g-x', menu_item_id: 'i1', attached: true }))
    await mg('itemGroupItemNotMine', tok({ action: 'set_item_modifier_group', group_id: 'g1', menu_item_id: 'i-x', attached: true }))
    await mg('bulkGroupNotMine', tok({ action: 'set_item_modifier_groups_bulk', group_id: 'g-x', menu_item_ids: ['i1'], attached: true }))
    await mg('excludedItemNotMine', tok({ action: 'set_item_group_excluded_options', group_id: 'g1', menu_item_id: 'i-x', excluded_option_ids: [] }))
    await mg('preorderNotPro', tok({ action: 'set_item_preorder_bulk', menu_item_ids: ['i1'] }), { truck: { plan: 'starter' } })
    await mg('categoryDbError', tok({ action: 'upsert_category', name: 'Sides' }), { fail: { menu_categories: ['insert'] } })
    // ── Schedule
    await mg('privateLinkNotPro', tok({ action: 'private_link', id: 'ev-ok' }), { truck: { plan: 'starter' } })
    await mg('privateLinkNoEvent', tok({ action: 'private_link', id: 'ev-x' }))
    await mg('privateLinkNotPrivate', tok({ action: 'private_link', id: 'ev-ok' }))
    await mg('newLinkNotPro', tok({ action: 'private_new_link', id: 'ev-ok' }), { truck: { plan: 'starter' } })
    await mg('newLinkPassThrough', tok({ action: 'private_new_link', id: 'ev-x' }))
    await mg('editLiveNoTimes', tok({ action: 'upsert_event', id: 'ev-live', venue_name: 'The Crown', event_date: today }))
    await mg('editPrivateNotPro', tok({ action: 'upsert_event', id: 'ev-ok', venue_name: 'Market', event_date: today, start_time: '17:00', end_time: '20:00', is_private: true }), { truck: { plan: 'starter' } })
    await mg('createNoTimes', tok({ action: 'upsert_event', venue_name: 'New', event_date: today }))
    await mg('createPrivateNotPro', tok({ action: 'upsert_event', venue_name: 'New', event_date: today, start_time: '17:00', end_time: '20:00', is_private: true, van_id: 'v1' }), { truck: { plan: 'starter' } })
    await mg('dealNoEvent', tok({ action: 'update_event_deal', eventId: 'ev-x', bundleId: 'b1', active: true }))
    await mg('dealNoBundle', tok({ action: 'update_event_deal', eventId: 'ev-ok', bundleId: 'b-x', active: true }))
    await mg('emptyTerm', tok({ action: 'add_exclusion_term', term: '  ' }))
    await mg('placesScheduleFail', tok({ action: 'sg_places' }), { fail: { truck_events: ['select'] } })
    await mg('placesLoadFail', tok({ action: 'sg_places' }), { fail: { truck_places: ['select'] } })
    await mg('placeNoName', tok({ action: 'sg_upsert_place', name: ' ' }))
    await mg('placeNoLetters', tok({ action: 'sg_upsert_place', name: '!!!' }))
    await mg('placeAddFail', tok({ action: 'sg_upsert_place', name: 'The Crown' }), { fail: { truck_places: ['upsert'] } })
    await mg('placeEditNoName', tok({ action: 'sg_upsert_place', id: 'p1', name: '' }))
    await mg('placeSaveFail', tok({ action: 'sg_upsert_place', id: 'p1', short_name: 'Crown' }), { fail: { truck_places: ['update'] } })
    // ── Settings
    await mg('tradeZone', tok({ action: 'update_trade_area', timezone: 'Mars/Base', base_place_name: 'Sudbury' }))
    await mg('tradeNoTown', tok({ action: 'update_trade_area', base_place_name: ' ' }))
    await mg('tradeTownLong', tok({ action: 'update_trade_area', base_place_name: 'x'.repeat(121) }))
    await mg('tradeDbFail', tok({ action: 'update_trade_area', base_place_name: 'Sudbury' }), { fail: { trucks: ['update'] } })
    await mg('settingsDbFail', tok({ action: 'update_settings', name: 'Pizza Palace' }), { fail: { trucks: ['update'] } })
    await mg('uploadPassThrough', tok({ action: 'get_upload_url', filename: 'a.png' }))
    await mg('intervalBad', tok({ action: 'update_van_settings', vanId: 'v1', collection_interval_mins: 7 }))
    await mg('operatorIntervalBad', tok({ action: 'update_van_settings', vanId: 'v1', operator_collection_interval_mins: 7 }))
    await mg('intervalSaveFail', tok({ action: 'update_van_settings', vanId: 'v1', collection_interval_mins: 10 }), { fail: { truck_vans: ['update'] } })
    await mg('vanCatIds', tok({ action: 'upsert_van_category', vanId: 'v1' }))
    await mg('vanCatNoVan', tok({ action: 'upsert_van_category', vanId: 'v-x', categoryId: 'c1' }))
    await mg('vanCatNoCat', tok({ action: 'upsert_van_category', vanId: 'v1', categoryId: 'c-x' }))
    await mg('vanCatSaveFail', tok({ action: 'upsert_van_category', vanId: 'v1', categoryId: 'c1', prep_secs: 60 }), { fail: { van_category_settings: ['upsert'] } })
    for (const a of ['set_van_same_as_first', 'set_van_capacity_same_as_first']) {
      await mg(`${a}.noVanId`, tok({ action: a, on: true }))
      await mg(`${a}.noVan`, tok({ action: a, vanId: 'v-x', on: true }))
      await mg(`${a}.self`, tok({ action: a, vanId: 'v1', on: true }))
      await mg(`${a}.noFirst`, tok({ action: a, vanId: 'v9', on: true }), { vans: [{ id: 'v9', truck_id: 'test-truck', name: 'Old van', active: false, created_at: '2026-01-01T00:00:00Z' }] })
      await mg(`${a}.copyFail`, tok({ action: a, vanId: 'v2', on: true }), { fail: { truck_vans: ['update'] } })
      await mg(`${a}.switchFail`, tok({ action: a, vanId: 'v2', on: false }), { fail: { truck_vans: ['update'] } })
    }
    await mg('capacityCategoryCopyFail', tok({ action: 'set_van_capacity_same_as_first', vanId: 'v2', on: true }),
      { vcs: [{ truck_id: 'test-truck', van_id: 'v1', category_id: 'c1', prep_secs: 60, batch_size: 4, counts_toward_capacity: true }], fail: { van_category_settings: ['insert'] } })
    await mg('addVanNoName', tok({ action: 'add_van', name: ' ' }))
    await mg('renameVanNoName', tok({ action: 'rename_van', vanId: 'v1', name: '' }))
    await mg('deleteLastVan', tok({ action: 'delete_van', vanId: 'v1' }), { vans: [{ id: 'v1', truck_id: 'test-truck', name: 'Van 1', active: true }] })
    await mg('updateTruckPassThrough', tok({ action: 'update_truck', data: { crew_mode: 'x' } }), { fail: { trucks: ['update'] } })
    await mgOos('replyLimit', tok({ action: 'update_truck', data: { whatsapp_monthly_reply_limit: 7 } }))
    await mg('unknownAction', tok({ action: 'explode' }))
    // ── the GET's stock warning (a word on the Deals screen; named typography fix)
    await call(`${cc}|manageGET|stockWarning`, { tables: T() }, () => M.manageGET(req('/api/manage?token=tok')))

    // ── /api/event-types
    const et = (k, body, o = {}) => call(`${cc}|eventTypes|${k}`, { tables: T(o), keys: { event_types: [{ name: 'event_types_truck_name_uidx', expr: r => [r.truck_id, String(r.name).toLowerCase()] }] }, ...o }, () => M.etPOST(req('/api/event-types', { method: 'POST', body })))
    await et('badJson', '{nope')
    await et('noToken', { action: 'load' })
    await et('badToken', { token: 'nope', action: 'load' })
    await et('notMax', tok({ action: 'create', name: 'Festival' }), { truck: { plan: 'starter' } })
    await et('loadNotEntitled', tok({ action: 'load' }), { truck: { plan: 'starter' } })
    await et('privateNotPro', tok({ action: 'set_private_link_ordering', on: true }), { truck: { plan: 'starter' } })
    await et('createNoName', tok({ action: 'create', name: ' ' }))
    await et('createTaken', tok({ action: 'create', name: 'Festival' }), { types: [{ id: 't1', truck_id: 'test-truck', name: 'festival', sort_order: 0 }] })
    await et('updateNoId', tok({ action: 'update' }))
    await et('updateNoName', tok({ action: 'update', id: 't1', name: '' }))
    await et('updateTaken', tok({ action: 'update', id: 't2', name: 'Festival' }), { types: [{ id: 't1', truck_id: 'test-truck', name: 'festival', sort_order: 0 }, { id: 't2', truck_id: 'test-truck', name: 'Market', sort_order: 1 }] })
    await et('matchNoId', tok({ action: 'match_standard' }))
    await et('reorderNoIds', tok({ action: 'reorder', ids: [] }))
    await et('deleteNoId', tok({ action: 'delete' }))
    await et('assignNoEvent', tok({ action: 'assign' }))
    await et('assignUnknownEvent', tok({ action: 'assign', eventId: 'ev-x' }))
    await et('assignUnknownType', tok({ action: 'assign', eventId: 'ev-ok', typeId: 't-x' }))
    await et('itemPricesNoEvent', tok({ action: 'event_item_prices' }), { truck: { plan: 'starter' } })
    await et('itemPricesUnknownEvent', tok({ action: 'event_item_prices', eventId: 'ev-x' }))
    await et('saveItemPricesNoEvent', tok({ action: 'save_event_item_prices' }))
    await et('saveItemPricesUnknownEvent', tok({ action: 'save_event_item_prices', eventId: 'ev-x' }))
    await et('typePricingNoId', tok({ action: 'set_type_pricing' }))
    await et('typePricingNoRow', tok({ action: 'set_type_pricing', id: 't-x', price_change_on: true }))
    await et('typeItemPriceMissing', tok({ action: 'set_type_item_price', id: 't1' }))
    await et('typeItemPriceNoType', tok({ action: 'set_type_item_price', id: 't-x', itemId: 'i1', price: 3 }))
    await et('typeItemPriceNoItem', tok({ action: 'set_type_item_price', id: 't1', itemId: 'i-x', price: 3 }), { types: [{ id: 't1', truck_id: 'test-truck', name: 'Festival', sort_order: 0 }] })
    await et('privateNotReady', tok({ action: 'set_private_link_ordering', on: true }), { fail: { event_types: ['insert', 'upsert', 'select'] } })
    await et('unknownAction', tok({ action: 'explode' }))
    await et('loadWithPricesVanNoName', tok({ action: 'load', withPrices: true }), { orphan: true, vanNoName: true })

    // ── /api/events/action
    const ac = (k, body, o = {}) => call(`${cc}|eventsAction|${k}`, { tables: T(o), ...o }, () => M.actionPOST(req('/api/events/action', { method: 'POST', body })))
    await ac('noToken', { action: 'confirm' })
    await ac('badToken', { token: 'nope', action: 'confirm' })
    await ac('confirmFlags', tok({ action: 'confirm', eventId: 'ev-ok', payload: {} }))
    await ac('confirmNoTimes', tok({ action: 'confirm', eventId: 'ev-live', payload: { auto_open: true, auto_close: true } }))
    await ac('confirmPrivateNoTimes', tok({ action: 'confirm', eventId: 'ev-live', payload: { auto_open: true, auto_close: true, is_private: true } }))
    await ac('confirmChooseVan', tok({ action: 'confirm', eventId: 'ev-ok', payload: { auto_open: true, auto_close: true } }))
    await ac('confirmPrivateNotPro', tok({ action: 'confirm', eventId: 'ev-ok', payload: { auto_open: true, auto_close: true, is_private: true } }), { truck: { plan: 'starter' }, vans: [{ id: 'v1', truck_id: 'test-truck', name: 'Van 1', active: true }] })
    await ac('openNoTimes', tok({ action: 'open', eventId: 'ev-live' }))
    await ac('cancelNotMine', tok({ action: 'cancel', eventId: 'ev-x', payload: {} }))
    await ac('restoreNotMine', tok({ action: 'restore_rejected', eventId: 'ev-x' }))
    await ac('unknownAction', tok({ action: 'explode', eventId: 'ev-ok' }))
    // ── /api/events (public feed), /api/events/manage, /api/events/affected-orders
    await call(`${cc}|events|noTruck`, { tables: T() }, () => M.eventsGET(req('/api/events')))
    await call(`${cc}|events|ok`, { tables: T() }, () => M.eventsGET(req('/api/events?truck=test-kitchen')))
    await call(`${cc}|eventsManage|noToken`, { tables: T() }, () => M.eventsManageGET(req('/api/events/manage')))
    await call(`${cc}|eventsManage|badToken`, { tables: T() }, () => M.eventsManageGET(req('/api/events/manage?token=nope')))
    await call(`${cc}|affected|missing`, { tables: T() }, () => M.affectedGET(req('/api/events/affected-orders?token=tok')))
    await call(`${cc}|affected|badToken`, { tables: T() }, () => M.affectedGET(req('/api/events/affected-orders?token=nope&eventId=ev-ok')))
    // ── commit-menu
    const cm = (k, body, o = {}) => call(`${cc}|commitMenu|${k}`, { tables: T(o), ...o }, () => M.commitPOST(req('/api/manage/commit-menu', { method: 'POST', body })))
    await cm('badToken', { token: 'nope' })
    await cm('clearFirstLive', tok({ clearFirst: true }), { truck: { setup_step: 'done' } })
    await cm('clearFails', tok({ clearFirst: true }), { truck: { setup_step: 'menu' } })
    // ── process-allergens / process-menu / process-schedule / verify-schedule-url
    const fp = (k, fn, fields, o = {}) => call(`${cc}|${k}`, { tables: T(o), ...o }, () => fn(req('/x', { method: 'POST', body: form(fields) })))
    await fp('allergens|noToken', M.allergensPOST, { text: 'nuts' })
    await fp('allergens|badToken', M.allergensPOST, { token: 'nope', text: 'nuts' })
    await fp('allergens|aiFailed', M.allergensPOST, { token: 'tok', text: 'nuts' })
    await fp('allergens|parseFailed', M.allergensPOST, { token: 'tok', text: 'nuts' }, { gemini: { candidates: [{ content: { parts: [{ text: 'not json' }] } }] } })
    await fp('menu|noToken', M.menuPOST, { text: 'pizza' })
    await fp('menu|badToken', M.menuPOST, { token: 'nope', text: 'pizza' })
    await fp('menu|aiFailed', M.menuPOST, { token: 'tok', text: 'pizza' })
    await fp('menu|parseFailed', M.menuPOST, { token: 'tok', text: 'pizza' }, { gemini: { candidates: [{ content: { parts: [{ text: 'not json' }] } }] } })
    await fp('schedule|noToken', M.schedulePOST, { text: 'fri' })
    await fp('schedule|badToken', M.schedulePOST, { token: 'nope', text: 'fri' })
    await fp('schedule|extractFailed', M.schedulePOST, { token: 'tok', text: 'fri' }, { extract: 'throw' })
    const vf = (k, body) => call(`${cc}|verify|${k}`, { tables: T() }, () => M.verifyPOST(req('/api/manage/verify-schedule-url', { method: 'POST', body })))
    await vf('noToken', { url: 'https://x.test' })
    await vf('badUrl', { token: 'tok', url: 'ftp://x' })
    await vf('badToken', { token: 'nope', url: 'https://x.test' })
  
    // ── successes and their writes (this harness's own additions) ──
    await mg('ok.upsertCategory', tok({ action: 'upsert_category', name: 'Sides', prep_secs: 120, batch_size: 0 }))
    await mg('ok.upsertItem', tok({ action: 'upsert_item', name: 'Calzone', price: 11, category_id: 'c1', allergens: [], dietary_info: [] }))
    await mg('ok.upsertEvent', tok({ action: 'upsert_event', venue_name: 'Market Square', town: 'Harnessville', postcode: '', address: '', event_date: '2026-10-24', start_time: '11:00', end_time: '14:00', notes: '', is_private: false, private_name: '', van_id: 'v1' }))
    await mg('ok.tradeArea', tok({ action: 'update_trade_area', base_place_name: cc === 'US' ? 'Springfield' : 'Harnessville', timezone: zone }))
    await mg('ok.settings', tok({ action: 'update_settings', auto_accept: true }))
    await mg('ok.exclusion', tok({ action: 'add_exclusion_term', term: 'Private party' }))
    await mg('ok.getVans', tok({ action: 'get_vans' }))
    await mg('ok.addVan', tok({ action: 'add_van', name: 'Little van' }))
    await ac('ok.cancel', tok({ action: 'cancel', eventId: 'ev-ok', payload: { reason: 'Rained off' } }))
    await call(`${cc}|geocode|empty`, { tables: T() }, () => M.geocodePOST(req('/api/manage/geocode', { method: 'POST', body: {} })))
    await call(`${cc}|geocode|failed`, { tables: T() }, () => M.geocodePOST(req('/api/manage/geocode', { method: 'POST', body: { query: 'The Green, Harnessville' } })))
  }
  return out
}

module.exports = { views }
