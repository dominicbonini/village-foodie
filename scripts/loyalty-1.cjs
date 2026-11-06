#!/usr/bin/env node
// scripts/loyalty-1.cjs — loyalty-1 (5 November 2026, docs/loyalty-1-report.md): digital loyalty stamp cards, backend only, switched
// off. NO NETWORK, NO DATABASE, NEVER A LIVE TRUCK: the real lib/loyalty code, its Supabase store and its cron route run over an
// in-memory Supabase whose three RPCs MIRROR the migration's plpgsql functions statement for statement (the real functions were
// proved against the live schema by the migration's own rolled-back self-check, 5 November 2026).
//   1 · the migration           2 · switch off: nothing read, nothing written     3 · one stamp per collected order, and who earns none
//   4 · run twice / in parallel  5 · the reward at the threshold, carry-over      6 · reversal (cancel, refund, voiding, never below 0)
//   7 · redeem once only, expiry 8 · the card a customer sees                    9 · settings        10 · the backfill (never run)
//   11 · the cron route         12 · privacy: retention and account deletion     13 · nothing else touched
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'loyalty-1' })

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const J = JSON.stringify
const D = 86_400_000
const iso = ms => new Date(ms).toISOString()
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// ── an in-memory Supabase: tables, every call recorded, and the three loyalty RPCs as the migration defines them ─────────────
function fakeDb(seed) {
  const T = {}; for (const [k, v] of Object.entries(seed)) T[k] = v.map(r => ({ ...r }))
  for (const k of ['loyalty_cards', 'loyalty_stamps', 'loyalty_rewards', 'truck_loyalty_settings']) T[k] ??= []
  const calls = []
  let n = 1000
  const id = () => uuid(++n)
  function from(table) {
    const filters = []; let op = 'select', payload = null, single = null, orders = [], limitN = null, range = null, conflict = null, wantRows = false
    const self = {
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
      select() { if (op !== 'select') wantRows = true; return self },
      insert(rows) { op = 'insert'; payload = [].concat(rows); return self },
      upsert(rows, o = {}) { op = 'upsert'; payload = [].concat(rows); conflict = o.onConflict; return self },
      update(v) { op = 'update'; payload = v; return self }, delete() { op = 'delete'; return self },
      eq(k, v) { filters.push(r => String(r[k]) === String(v)); return self },
      in(k, vs) { const s = vs.map(String); filters.push(r => s.includes(String(r[k]))); return self },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return self },
      not(k, o, v) { if (o === 'is') filters.push(r => (r[k] ?? null) !== v); else throw new Error('fakeDb: not ' + o); return self },
      gte(k, v) { filters.push(r => r[k] != null && cmp(r[k], v) >= 0); return self }, gt(k, v) { filters.push(r => r[k] != null && cmp(r[k], v) > 0); return self },
      lt(k, v) { filters.push(r => r[k] != null && cmp(r[k], v) < 0); return self }, lte(k, v) { filters.push(r => r[k] != null && cmp(r[k], v) <= 0); return self },
      order(k, o = {}) { orders.push({ k, asc: o.ascending !== false }); return self }, limit(x) { limitN = x; return self }, range(a, b) { range = [a, b]; return self },
      maybeSingle() { single = 'maybe'; return self }, single() { single = 'one'; return self },
    }
    const cmp = (a, b) => (typeof a === 'number' ? a - Number(b) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
    const out = list => { const c = list.map(r => ({ ...r })); return single === 'maybe' ? { data: c[0] ?? null, error: null } : single === 'one' ? (c.length === 1 ? { data: c[0], error: null } : { data: null, error: { message: 'not one' } }) : { data: c, error: null } }
    function run() {
      calls.push({ table, op })
      const rows = (T[table] ??= [])
      if (op === 'insert') { rows.push(...payload.map(r => ({ ...r }))); return out(payload) }
      if (op === 'upsert') {
        for (const m of payload) { const i = rows.findIndex(r => r[conflict] === m[conflict]); if (i >= 0) rows[i] = { ...rows[i], ...m }; else rows.push({ ...m }) }
        return out(payload)
      }
      let hit = rows.filter(r => filters.every(f => f(r)))
      if (op === 'update') { hit.forEach(r => Object.assign(r, payload)); return out(hit) }
      if (op === 'delete') {
        T[table] = rows.filter(r => !hit.includes(r))
        // ON DELETE CASCADE from loyalty_cards; ON DELETE SET NULL for a reward's earning stamp
        if (table === 'loyalty_cards') { const gone = new Set(hit.map(r => r.id)); T.loyalty_stamps = T.loyalty_stamps.filter(s => !gone.has(s.card_id)); T.loyalty_rewards = T.loyalty_rewards.filter(r => !gone.has(r.card_id)) }
        if (table === 'loyalty_stamps') { const gone = new Set(hit.map(r => r.id)); T.loyalty_rewards.forEach(r => { if (gone.has(r.earned_from_stamp_id)) r.earned_from_stamp_id = null }) }
        return out(wantRows ? hit : [])
      }
      for (const o of [...orders].reverse()) hit = [...hit].sort((a, b) => cmp(a[o.k] ?? '', b[o.k] ?? '') * (o.asc ? 1 : -1))
      if (range) hit = hit.slice(range[0], range[1] + 1)
      if (limitN != null) hit = hit.slice(0, limitN)
      return out(hit)
    }
    return self
  }
  const addDays = (at, d) => iso(Date.parse(at) + d * D)
  // ── the migration's functions, statement for statement (supabase/migrations/20261073_loyalty_1.sql) ──
  const RPC = {
    loyalty_apply_stamp(a) {
      if (a.p_stamps_required == null || a.p_stamps_required < 2 || a.p_stamps_required > 20) throw new Error('stamps_required must be 2–20')
      if (!/^[0-9a-f]{64}$/.test(a.p_customer_key || '')) throw new Error('bad customer key')
      if (!T.orders.some(o => o.order_key === a.p_order_key && o.truck_id === a.p_truck_id)) return [{ out_result: 'wrong_truck', out_card_id: null, out_stamps: null, out_reward_id: null }]
      if (T.loyalty_stamps.some(s => s.order_key === a.p_order_key)) return [{ out_result: 'duplicate', out_card_id: null, out_stamps: null, out_reward_id: null }]
      let card = T.loyalty_cards.find(c => c.truck_id === a.p_truck_id && c.customer_key === a.p_customer_key)
      if (!card) { card = { id: id(), truck_id: a.p_truck_id, customer_key: a.p_customer_key, stamps: 0, lifetime_stamps: 0, created_at: a.p_now, last_stamp_at: null }; T.loyalty_cards.push(card) }
      const stamp = { id: id(), card_id: card.id, truck_id: a.p_truck_id, order_key: a.p_order_key, stamped_at: a.p_stamped_at, reversed_at: null, reversed_reason: null }
      T.loyalty_stamps.push(stamp)
      let stamps = card.stamps + 1, rewardId = null
      if (stamps >= a.p_stamps_required) {
        rewardId = id()
        T.loyalty_rewards.push({ id: rewardId, card_id: card.id, truck_id: a.p_truck_id, earned_at: a.p_now, earned_from_stamp_id: stamp.id, stamps_used: a.p_stamps_required,
          expires_at: a.p_expires_days == null ? null : addDays(a.p_now, a.p_expires_days), redeemed_at: null, redeemed_order_key: null, voided_at: null, voided_reason: null })
        stamps -= a.p_stamps_required
      }
      if (stamps < 0) throw new Error('check stamps >= 0')
      Object.assign(card, { stamps, lifetime_stamps: card.lifetime_stamps + 1, last_stamp_at: [card.last_stamp_at ?? a.p_stamped_at, a.p_stamped_at].sort().pop() })
      return [{ out_result: 'stamped', out_card_id: card.id, out_stamps: stamps, out_reward_id: rewardId }]
    },
    loyalty_reverse_stamp(a) {
      if (!['cancelled', 'refunded'].includes(a.p_reason)) throw new Error('reason must be cancelled or refunded')
      const stamp = T.loyalty_stamps.find(s => s.order_key === a.p_order_key)
      if (!stamp) return [{ out_result: 'no_stamp', out_card_id: null, out_stamps: null, out_voided_reward_id: null }]
      const card = T.loyalty_cards.find(c => c.id === stamp.card_id)
      if (stamp.reversed_at) return [{ out_result: 'already_reversed', out_card_id: card.id, out_stamps: card.stamps, out_voided_reward_id: null }]
      const reward = T.loyalty_rewards.find(r => r.earned_from_stamp_id === stamp.id)
      let stamps, voided = null
      if (reward && !reward.redeemed_at && !reward.voided_at) { Object.assign(reward, { voided_at: a.p_now, voided_reason: 'stamp_reversed' }); stamps = card.stamps + reward.stamps_used - 1; voided = reward.id }
      else stamps = Math.max(card.stamps - 1, 0)
      Object.assign(stamp, { reversed_at: a.p_now, reversed_reason: a.p_reason })
      Object.assign(card, { stamps, lifetime_stamps: Math.max(card.lifetime_stamps - 1, 0) })
      return [{ out_result: 'reversed', out_card_id: card.id, out_stamps: stamps, out_voided_reward_id: voided }]
    },
    loyalty_redeem_reward(a) {
      const r = T.loyalty_rewards.find(x => x.id === a.p_reward_id)
      const ans = x => [{ out_result: x, out_reward_id: a.p_reward_id }]
      if (!r) return ans('not_found')
      if (r.redeemed_at) return ans(r.redeemed_order_key === a.p_order_key ? 'already_redeemed_here' : 'already_redeemed')
      if (r.voided_at) return ans('voided')
      if (r.expires_at && Date.parse(r.expires_at) <= Date.parse(a.p_now)) return ans('expired')
      if (!T.orders.some(o => o.order_key === a.p_order_key && o.truck_id === r.truck_id)) return ans('wrong_order')
      if (T.loyalty_rewards.some(x => x.redeemed_order_key === a.p_order_key)) return ans('order_used')
      Object.assign(r, { redeemed_at: a.p_now, redeemed_order_key: a.p_order_key })
      return ans('redeemed')
    },
  }
  async function rpc(fn, args) {
    calls.push({ table: `rpc:${fn}`, op: 'rpc' })
    try { return { data: RPC[fn](args), error: null } } catch (e) { return { data: null, error: { message: e.message } } }
  }
  return { from, rpc, T, calls }
}

// ── fixtures: a made-up truck (never a live one), its customers and orders ───────────────────────────────────────────────────
const TRUCK = 'loyalty-fixture-truck', OTHER = 'loyalty-other-truck', DEMO = 'demo-loyalty1'
const NOW = Date.parse('2026-11-05T12:00:00Z')
const ON_AT = iso(NOW - 3 * D)                       // loyalty switched on three days ago
const settingsRow = (truck, more = {}) => ({ truck_id: truck, enabled: true, enabled_at: ON_AT, stamps_required: 3, reward_type: 'free_item', reward_menu_item_id: uuid(900),
  reward_amount_minor: null, reward_label: 'A free coffee', reward_expires_days: 30, updated_at: ON_AT, updated_by: 'fixture', ...more })
let seq = 0
const order = (email, minsAfterOn, more = {}) => ({ order_key: uuid(++seq), truck_id: TRUCK, status: 'collected', collected_at: iso(Date.parse(ON_AT) + minsAfterOn * 60_000),
  customer_email: email, total: 9.5, payment_status: 'paid', ...more })
function world(over = {}) {
  seq = 0
  const orders = {
    a1: order('Alice@Example.com', 10), a2: order('  alice@example.com ', 20), a3: order('ALICE@EXAMPLE.COM', 30), a4: order('alice@example.com\t', 40),
    walkup: order(null, 50), walkupBlank: order('', 55), before: order('alice@example.com', -60), zero: order('alice@example.com', 60, { total: 0 }),
    notYet: order('alice@example.com', 70, { status: 'ready', collected_at: null }), testMode: order('tess@example.com', 80), refundedFirst: order('rita@example.com', 85, { payment_status: 'refunded' }),
    b1: order('bob@example.com', 90), other1: order('alice@example.com', 95, { truck_id: OTHER }), demo1: order('alice@example.com', 96, { truck_id: DEMO }),
  }
  const payments = [
    { order_key: orders.testMode.order_key, kind: 'charge', amount_minor: 950, state: 'succeeded', livemode: false },
    ...['a1', 'a2', 'a3', 'a4', 'b1'].map(k => ({ order_key: orders[k].order_key, kind: 'charge', amount_minor: 950, state: 'succeeded', livemode: true })),
  ]
  const db = fakeDb({
    platform_switches: [{ id: true, review_requests_enabled: false, weather_enabled: false, loyalty_enabled: true }],
    trucks: [{ id: TRUCK, active: true }, { id: OTHER, active: true }, { id: DEMO, active: true }],
    truck_loyalty_settings: [settingsRow(TRUCK), settingsRow(OTHER, { enabled: false, enabled_at: null }), settingsRow(DEMO)],
    orders: Object.values(orders), order_payments: payments,
    menu_items_db: [{ id: uuid(900), truck_id: TRUCK }, { id: uuid(901), truck_id: OTHER }],
    ...over,
  })
  return { db, orders }
}

;(async () => {
  kit.setNow(iso(NOW))
  const L = await kit.bundle('loyalty1', [
    "export * as M from '@/lib/loyalty/model'",
    "export { runLoyaltyStamps, backfillTruckLoyalty } from '@/lib/loyalty/run'",
    "export { getLoyaltyCard, redeemReward, readSettings, writeSettings } from '@/lib/loyalty/service'",
    "export { supabaseLoyaltyStore } from '@/lib/loyalty/store'",
    "export { purgeOldLoyalty, deleteTruckLoyalty } from '@/lib/loyalty/retention'",
    "export { emailHash as reviewsEmailHash } from '@/lib/reviews/model'",
    "export { isDemoIdentifier } from '@/lib/demo'",
    "export { GET as loyaltyCron } from '@/app/api/cron/loyalty-stamps/route'",
  ].join('\n'), { stubs: { '@/lib/auth/admin': 'export async function verifyAdmin() { return false }' } })
  const { M } = L
  const deps = { now: () => new Date(NOW), isDemo: L.isDemoIdentifier }
  const job = db => L.runLoyaltyStamps(L.supabaseLoyaltyStore(db), deps)
  const cardOf = (db, email, truck = TRUCK) => db.T.loyalty_cards.find(c => c.truck_id === truck && c.customer_key === M.emailHash(truck, M.normaliseEmail(email)))

  // ══ 1 ══
  head('1 · the migration (20261073)')
  const SQL = read('supabase/migrations/20261073_loyalty_1.sql')
  const code = SQL.replace(/--.*$/gm, '')
  const NEW = ['truck_loyalty_settings', 'loyalty_cards', 'loyalty_stamps', 'loyalty_rewards']
  t('the global switch: platform_switches.loyalty_enabled boolean not null default false', /alter table public\.platform_switches add column if not exists loyalty_enabled boolean not null default false;/.test(code))
  t('four new tables, each with RLS on, no policy, and everything revoked from anon and authenticated', NEW.every(x => code.includes(`create table if not exists public.${x} (`) && code.includes(`alter table public.${x} enable row level security;`))
    && !/create policy/i.test(code) && /revoke all on public\.truck_loyalty_settings, public\.loyalty_cards, public\.loyalty_stamps, public\.loyalty_rewards from anon, authenticated;/.test(code))
  t('settings: enabled false, stamps_required 8 (2–20), reward type free_item | amount_off, and a CHECK that the reward fields match the type', /enabled\s+boolean not null default false/.test(code) && /stamps_required\s+integer not null default 8 check \(stamps_required between 2 and 20\)/.test(code)
    && /reward_type in \('free_item', 'amount_off'\)/.test(code) && /truck_loyalty_settings_reward_chk/.test(code) && /truck_loyalty_settings_enabled_chk check \(not enabled or \(reward_type is not null and enabled_at is not null\)\)/.test(code))
  t('one card per customer per truck; the customer only as a 64-hex key; stamps never below zero', /unique \(truck_id, customer_key\)/.test(code) && /customer_key ~ '\^\[0-9a-f\]\{64\}\$'/.test(code) && /stamps\s+integer not null default 0 check \(stamps >= 0\)/.test(code))
  t('one stamp per order (order_key unique → orders(order_key)); one reward per stamp; one reward per redeeming order', /order_key\s+uuid not null references public\.orders\(order_key\)/.test(code) && /loyalty_stamps_one_per_order_uq unique \(order_key\)/.test(code)
    && /loyalty_rewards_one_per_stamp_uq unique \(earned_from_stamp_id\)/.test(code) && /redeemed_order_key\s+uuid references public\.orders\(order_key\)/.test(code) && /loyalty_rewards_one_per_order_uq unique \(redeemed_order_key\)/.test(code))
  t('the three functions: security invoker, revoked from public / anon / authenticated, executable by the service role only', ['loyalty_apply_stamp', 'loyalty_reverse_stamp', 'loyalty_redeem_reward'].every(f => new RegExp(`create or replace function public\\.${f}\\(`).test(code)
    && new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated;`).test(code) && new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role;`).test(code)) && !/security definer/i.test(code))
  t('each function locks the card row (for update)', (code.match(/for update/g) || []).length >= 4)
  t('no protected table altered, inserted into or updated, and nothing about Pizzeria Gusto', !/\b(insert\s+into|update|delete\s+from|truncate|alter\s+table)\s+(only\s+)?(public\.)?"?(trucks|orders|plans|plan_prices|plan_features|country_settings)\b/i.test(code) && !/gusto/i.test(SQL))
  t('no plan_features row (loyalty stays a "coming soon" row) and no outreach_templates row', !/plan_features|outreach_templates/i.test(code))
  t('the self-check always rolls back (it raises LOYALTY_SELFCHECK_OK inside a sub-transaction and catches only that)', /raise exception 'LOYALTY_SELFCHECK_OK'/.test(code) && /when others then\s+if sqlerrm <> 'LOYALTY_SELFCHECK_OK' then raise; end if;/.test(code))

  // ══ 2 ══
  head('2 · 🔴 the global switch OFF: the job reads nothing but the switch, and writes nothing')
  {
    const { db } = world({ platform_switches: [{ id: true, loyalty_enabled: false }] })
    const before = J(db.T)
    const r = await job(db)
    t('🔴 switch off → { enabled: false }, and the ONLY call is the one read of platform_switches (no order, payment or loyalty row read)', r.enabled === false && J(db.calls) === J([{ table: 'platform_switches', op: 'select' }]), db.calls)
    t('🔴 …and nothing written: every table byte for byte as before', J(db.T) === before && r.stamped === 0 && r.reversed === 0)
    const { db: db2 } = world({ platform_switches: [] })
    const r2 = await job(db2)
    t('no switch row at all reads as OFF (the same single read)', r2.enabled === false && db2.calls.length === 1)
  }

  // ══ 3 ══
  head('3 · switched on: one stamp per collected order — and who earns none')
  const W = world()
  const r1 = await job(W.db)
  const alice = cardOf(W.db, 'alice@example.com'), bob = cardOf(W.db, 'bob@example.com')
  const stampedKeys = new Set(W.db.T.loyalty_stamps.map(s => s.order_key))
  const has = k => stampedKeys.has(W.orders[k].order_key)
  t('an enabled truck earns one stamp per collected order: Alice\'s four and Bob\'s one (5 stamps, 5 rows)', r1.enabled && r1.stamped === 5 && W.db.T.loyalty_stamps.length === 5 && ['a1', 'a2', 'a3', 'a4', 'b1'].every(has), r1)
  t('🔴 email case and whitespace give the SAME card: "Alice@Example.com", "  alice@example.com ", "ALICE@EXAMPLE.COM", "alice@example.com\\t" → one card, 4 lifetime stamps', W.db.T.loyalty_cards.filter(c => c.truck_id === TRUCK).length === 2 && alice?.lifetime_stamps === 4, W.db.T.loyalty_cards)
  t('the card key IS the reviews key (lib/reviews/model emailHash of the truck and the normalised email) — one customer, one key per truck', alice.customer_key === L.reviewsEmailHash(TRUCK, 'alice@example.com') && /^[0-9a-f]{64}$/.test(alice.customer_key))
  t('🔴 the email itself is stored nowhere in the loyalty tables', !J([W.db.T.loyalty_cards, W.db.T.loyalty_stamps, W.db.T.loyalty_rewards]).toLowerCase().includes('example.com'))
  t('🔴 a walk-up without an email earns nothing (no email, or a blank one)', !has('walkup') && !has('walkupBlank'))
  t('an order collected BEFORE the truck switched loyalty on earns nothing', !has('before'))
  t('a zero-total order, an order not yet collected, and a test-mode payment earn nothing', !has('zero') && !has('notYet') && !has('testMode') && r1.skipped.test_mode === 1, r1.skipped)
  t('a collected order already fully refunded earns nothing', !has('refundedFirst') && r1.skipped.refunded === 1)
  t('a truck with loyalty off earns nothing, and a demo truck earns nothing even with loyalty on', !has('other1') && !has('demo1') && r1.trucks === 1)
  t('🔴 the job only READS orders and order_payments (every write is one of the three atomic functions)', W.db.calls.filter(c => ['orders', 'order_payments', 'trucks', 'platform_switches'].includes(c.table)).every(c => c.op === 'select')
    && W.db.calls.filter(c => c.op !== 'select' && c.op !== 'rpc').length === 0, W.db.calls.filter(c => c.op !== 'select'))
  t('the stamp is dated when the order was collected', W.db.T.loyalty_stamps.find(s => s.order_key === W.orders.b1.order_key).stamped_at === W.orders.b1.collected_at)

  // ══ 4 ══
  head('4 · run twice, or in parallel: no duplicates')
  {
    const snap = J([W.db.T.loyalty_cards, W.db.T.loyalty_stamps, W.db.T.loyalty_rewards])
    const r2 = await job(W.db)
    t('🔴 a second run stamps nothing and changes nothing', r2.stamped === 0 && r2.rewards === 0 && J([W.db.T.loyalty_cards, W.db.T.loyalty_stamps, W.db.T.loyalty_rewards]) === snap, r2)
    const P = world()
    const [p1, p2] = await Promise.all([job(P.db), job(P.db)])
    const keys = P.db.T.loyalty_stamps.map(s => s.order_key)
    t('🔴 two runs at once: still one stamp per order (5), one reward, Alice on 1 — the second meets "duplicate"', keys.length === 5 && new Set(keys).size === 5 && P.db.T.loyalty_rewards.length === 1 && cardOf(P.db, 'alice@example.com').stamps === 1 && p1.stamped + p2.stamped === 5, [p1, p2])
    const store = L.supabaseLoyaltyStore(P.db)
    const again = await store.applyStamp({ truckId: TRUCK, customerKey: cardOf(P.db, 'alice@example.com').customer_key, orderKey: P.orders.a1.order_key, stampedAt: P.orders.a1.collected_at, stampsRequired: 3, expiresDays: 30, nowIso: iso(NOW) })
    t('the database function refuses a second stamp for the same order ("duplicate") — the unique order_key is the guarantee', again.result === 'duplicate' && P.db.T.loyalty_stamps.length === 5, again)
    const wrong = await store.applyStamp({ truckId: OTHER, customerKey: cardOf(P.db, 'alice@example.com').customer_key, orderKey: P.orders.b1.order_key, stampedAt: iso(NOW), stampsRequired: 3, expiresDays: null, nowIso: iso(NOW) })
    t('…and a stamp for another truck\'s order ("wrong_truck")', wrong.result === 'wrong_truck')
  }

  // ══ 5 ══
  head('5 · the reward at the threshold, extra stamps carried over')
  {
    const rw = W.db.T.loyalty_rewards
    t('🔴 Alice: 4 stamps with 3 required → ONE reward, and 1 stamp carried over', rw.length === 1 && rw[0].card_id === alice.id && alice.stamps === 1 && alice.lifetime_stamps === 4 && r1.rewards === 1, { rw, alice })
    t('the reward came from her third stamp, used 3 stamps, and expires 30 days after it was earned', rw[0].earned_from_stamp_id === W.db.T.loyalty_stamps.find(s => s.order_key === W.orders.a3.order_key).id && rw[0].stamps_used === 3
      && rw[0].earned_at === iso(NOW) && rw[0].expires_at === iso(NOW + 30 * D))
    t('Bob: 1 stamp, no reward', bob.stamps === 1 && !rw.some(r => r.card_id === bob.id))
    // seven stamps at once (3 required) → two rewards, one over
    const many = Array.from({ length: 7 }, (_, i) => order('maya@example.com', 100 + i))
    const X = fakeDb({ platform_switches: [{ loyalty_enabled: true }], trucks: [{ id: TRUCK, active: true }], truck_loyalty_settings: [settingsRow(TRUCK, { reward_expires_days: null })], orders: many, order_payments: [] })
    const rx = await job(X)
    const maya = cardOf(X, 'maya@example.com')
    t('seven orders, 3 required → two rewards and 1 carried over (never more than one reward per stamp); no expiry when none is set', rx.stamped === 7 && X.T.loyalty_rewards.length === 2 && maya.stamps === 1 && maya.lifetime_stamps === 7 && X.T.loyalty_rewards.every(r => r.expires_at === null), { rx, maya })
  }

  // ══ 6 ══
  head('6 · reversal: cancelled or fully refunded after the stamp')
  {
    const C = fakeDb({ platform_switches: [{ loyalty_enabled: true }], trucks: [{ id: TRUCK, active: true }], truck_loyalty_settings: [settingsRow(TRUCK)], orders: [], order_payments: [] })
    const add = o => { C.T.orders.push(o); return o }
    const card = e => cardOf(C, e)
    const c1 = add(order('carol@example.com', 10)), c2 = add(order('carol@example.com', 20))
    await job(C)
    const beforeThird = { stamps: card('carol@example.com').stamps, lifetime: card('carol@example.com').lifetime_stamps }
    const c3 = add(order('carol@example.com', 30))
    await job(C)
    const reward = C.T.loyalty_rewards.find(r => r.card_id === card('carol@example.com').id)
    t('Carol: two stamps, then the third earns a reward (card at 0)', beforeThird.stamps === 2 && !!reward && card('carol@example.com').stamps === 0)
    C.T.orders.find(o => o.order_key === c3.order_key).payment_status = 'refunded'
    const rr = await job(C)
    const carol = card('carol@example.com')
    t('🔴 the stamp that completed a still-unredeemed reward is fully refunded → the reward is VOIDED and the card is back exactly as it was (2 stamps, 2 lifetime)', rr.reversed === 1 && rr.voided === 1 && reward.voided_at === iso(NOW) && reward.voided_reason === 'stamp_reversed'
      && carol.stamps === beforeThird.stamps && carol.lifetime_stamps === beforeThird.lifetime, { rr, carol, reward })
    t('…the stamp row stays (append-only ledger), marked reversed "refunded"', C.T.loyalty_stamps.find(s => s.order_key === c3.order_key).reversed_reason === 'refunded')
    const again = await job(C)
    t('idempotent: the next run reverses nothing more', again.reversed === 0 && card('carol@example.com').stamps === 2)
    C.T.orders.find(o => o.order_key === c1.order_key).status = 'cancelled'
    const rc = await job(C)
    t('a plain stamp\'s order cancelled → the card loses that one stamp (2 → 1), reason "cancelled"', rc.reversed === 1 && rc.voided === 0 && card('carol@example.com').stamps === 1 && C.T.loyalty_stamps.find(s => s.order_key === c1.order_key).reversed_reason === 'cancelled')
    // refunds that add up to the charge count as a full refund; a part refund keeps the stamp
    C.T.order_payments.push({ order_key: c2.order_key, kind: 'charge', amount_minor: 950, state: 'succeeded', livemode: true }, { order_key: c2.order_key, kind: 'refund', amount_minor: 300, state: 'succeeded', livemode: true })
    C.T.orders.find(o => o.order_key === c2.order_key).payment_status = 'part_refunded'
    t('a PART refund keeps the stamp', (await job(C)).reversed === 0 && card('carol@example.com').stamps === 1)
    C.T.order_payments.push({ order_key: c2.order_key, kind: 'refund', amount_minor: 650, state: 'succeeded', livemode: true })
    t('refunds that reach the whole charge are a full refund → reversed', (await job(C)).reversed === 1 && card('carol@example.com').stamps === 0)
    // a redeemed reward is never taken back, and the card never goes below zero
    const d = [1, 2, 3].map(i => add(order('dave@example.com', 40 + i)))
    const spend = add(order('dave@example.com', 50, { status: 'accepted', collected_at: null }))
    await job(C)
    const dr = C.T.loyalty_rewards.find(r => r.card_id === card('dave@example.com').id)
    const red = await L.redeemReward(L.supabaseLoyaltyStore(C), dr.id, spend.order_key, new Date(NOW))
    C.T.orders.find(o => o.order_key === d[2].order_key).status = 'rejected'
    const rd = await job(C)
    t('🔴 the reward was already REDEEMED → it stands; the card loses the stamp but never goes below zero (0, not −1)', red === 'redeemed' && rd.reversed === 1 && rd.voided === 0 && !dr.voided_at && dr.redeemed_at && card('dave@example.com').stamps === 0 && card('dave@example.com').lifetime_stamps === 2, { red, rd, dave: card('dave@example.com') })
    const store = L.supabaseLoyaltyStore(C)
    t('the reversal function is safe to call twice ("already_reversed") or for an order with no stamp ("no_stamp")', (await store.reverseStamp({ orderKey: d[2].order_key, reason: 'cancelled', nowIso: iso(NOW) })).result === 'already_reversed'
      && (await store.reverseStamp({ orderKey: uuid(4242), reason: 'cancelled', nowIso: iso(NOW) })).result === 'no_stamp')
    t('reversal only re-checks stamps from the last 90 days (REVERSAL_LOOKBACK_DAYS); new stamps only from the last 7 (STAMP_LOOKBACK_DAYS)', M.REVERSAL_LOOKBACK_DAYS === 90 && M.STAMP_LOOKBACK_DAYS === 7)
  }

  // ══ 7 ══
  head('7 · redeem once only; expired, voided and other-truck orders refused')
  {
    const store = L.supabaseLoyaltyStore(W.db)
    const reward = W.db.T.loyalty_rewards[0]
    const spendA = W.orders.a4.order_key, spendB = W.orders.b1.order_key
    const first = await L.redeemReward(store, reward.id, spendA, new Date(NOW))
    const same = await L.redeemReward(store, reward.id, spendA, new Date(NOW))
    const other = await L.redeemReward(store, reward.id, spendB, new Date(NOW))
    t('🔴 redeem once: "redeemed"; the same reward and order again → "already_redeemed_here" (idempotent); another order → "already_redeemed"', first === 'redeemed' && same === 'already_redeemed_here' && other === 'already_redeemed' && reward.redeemed_order_key === spendA, [first, same, other])
    t('a reward that does not exist, and a malformed id, → "not_found"; a malformed order → "wrong_order"', (await L.redeemReward(store, uuid(7777), spendA)) === 'not_found' && (await L.redeemReward(store, 'nope', spendA)) === 'not_found' && (await L.redeemReward(store, reward.id, 'x')) === 'wrong_order')
    const E = world()
    await job(E.db)
    const er = E.db.T.loyalty_rewards[0], estore = L.supabaseLoyaltyStore(E.db)
    t('🔴 an EXPIRED reward is refused ("expired") — 31 days on, 30-day expiry — and stays unredeemed', (await L.redeemReward(estore, er.id, E.orders.a4.order_key, new Date(NOW + 31 * D))) === 'expired' && !er.redeemed_at)
    t('an order at another truck → "wrong_order"', (await L.redeemReward(estore, er.id, E.orders.other1.order_key, new Date(NOW))) === 'wrong_order')
    E.db.T.loyalty_rewards.push({ ...er, id: uuid(8888), earned_from_stamp_id: null, redeemed_at: iso(NOW), redeemed_order_key: E.orders.a1.order_key })
    t('an order that already redeemed a reward → "order_used" (one reward per order)', (await L.redeemReward(estore, er.id, E.orders.a1.order_key, new Date(NOW))) === 'order_used')
    er.voided_at = iso(NOW); er.voided_reason = 'stamp_reversed'
    t('a voided reward → "voided"', (await L.redeemReward(estore, er.id, E.orders.a4.order_key, new Date(NOW))) === 'voided')
    t('🔴 redemption never touches the order (its total and payment status are as they were)', J(E.db.T.orders.find(o => o.order_key === E.orders.a4.order_key)) === J(world().orders.a4))
  }

  // ══ 8 ══
  head('8 · getLoyaltyCard(truckId, email)')
  {
    const G = world()
    await job(G.db)
    const store = L.supabaseLoyaltyStore(G.db)
    const v = await L.getLoyaltyCard(store, TRUCK, '  ALICE@example.COM ', new Date(NOW))
    t('the card by email (any case or spacing): stamps 1, 3 required, 4 lifetime, one available reward', v && v.stamps === 1 && v.stampsRequired === 3 && v.lifetimeStamps === 4 && v.rewards.length === 1 && v.rewards[0].expiresAt === iso(NOW + 30 * D), v)
    t('an expired reward is not listed as available', (await L.getLoyaltyCard(store, TRUCK, 'alice@example.com', new Date(NOW + 31 * D))).rewards.length === 0)
    t('no card, a bad email, or a truck with no settings → null', (await L.getLoyaltyCard(store, TRUCK, 'nobody@example.com')) === null && (await L.getLoyaltyCard(store, TRUCK, 'not an email')) === null && (await L.getLoyaltyCard(store, 'no-such-truck', 'alice@example.com')) === null)
  }

  // ══ 9 ══
  head('9 · settings read and write, validated')
  {
    const S = fakeDb({ menu_items_db: [{ id: uuid(900), truck_id: TRUCK }, { id: uuid(901), truck_id: OTHER }] })
    const store = L.supabaseLoyaltyStore(S)
    const w = (input, at = NOW) => L.writeSettings(store, TRUCK, input, 'op-1', new Date(at))
    const bad = await w({ stampsRequired: 1 })
    t('stamps_required outside 2–20 is refused, and nothing is written', !bad.ok && bad.problems.includes('stamps_required') && S.T.truck_loyalty_settings.length === 0, bad)
    t('switching on without a reward is refused', (await w({ enabled: true })).problems?.includes('enabled_without_reward'))
    t('a free item that is another truck\'s dish is refused', (await w({ rewardType: 'free_item', rewardMenuItemId: uuid(901) })).problems?.includes('reward_menu_item'))
    t('an amount off of 0, and a 0-day expiry, are refused', (await w({ rewardType: 'amount_off', rewardAmountMinor: 0, rewardExpiresDays: 0 })).problems?.join() === 'reward_amount,reward_expires_days')
    const ok = await w({ enabled: true, stampsRequired: 10, rewardType: 'free_item', rewardMenuItemId: uuid(900), rewardLabel: '  A free coffee  ' })
    const row = S.T.truck_loyalty_settings[0]
    t('a valid change is saved: on, 10 stamps, the truck\'s own dish, the label trimmed, enabled_at = now, updated_by recorded', ok.ok && row.enabled === true && row.stamps_required === 10 && row.reward_menu_item_id === uuid(900) && row.reward_label === 'A free coffee' && row.enabled_at === iso(NOW) && row.updated_by === 'op-1', row)
    const sw = await w({ rewardType: 'amount_off', rewardAmountMinor: 250 }, NOW + D)
    t('switching the reward type clears the other type\'s field (the CHECK), and staying on keeps enabled_at', sw.ok && S.T.truck_loyalty_settings[0].reward_menu_item_id === null && S.T.truck_loyalty_settings[0].reward_amount_minor === 250 && S.T.truck_loyalty_settings[0].enabled_at === iso(NOW))
    await w({ enabled: false }, NOW + 2 * D); await w({ enabled: true }, NOW + 3 * D)
    t('switching off and on again moves enabled_at (orders collected while off never earn)', S.T.truck_loyalty_settings[0].enabled_at === iso(NOW + 3 * D))
    t('readSettings returns the saved settings', (await L.readSettings(store, TRUCK)).rewardAmountMinor === 250)
  }

  // ══ 10 ══
  head('10 · the backfill: written, NOT run')
  {
    const B = world()
    const store = L.supabaseLoyaltyStore(B.db)
    const before = J(B.db.T)
    const dry = await L.backfillTruckLoyalty(store, deps, TRUCK)
    t('a dry run (the default) reports the one past order it would stamp and writes nothing', dry.wouldStamp === 1 && dry.stamped === 0 && J(B.db.T) === before, dry)
    t('it refuses a truck with loyalty off or a demo truck', J(await L.backfillTruckLoyalty(store, deps, OTHER)) === J({ refused: 'loyalty_off' }) && J(await L.backfillTruckLoyalty(store, deps, DEMO)) === J({ refused: 'demo_truck' }))
    const live = await L.backfillTruckLoyalty(store, deps, TRUCK, { dryRun: false })
    t('run for real (here only, on the fixture) it stamps that past order, and only once', live.stamped === 1 && B.db.T.loyalty_stamps.some(s => s.order_key === B.orders.before.order_key) && (await L.backfillTruckLoyalty(store, deps, TRUCK, { dryRun: false })).stamped === 0)
    const callers = execFileSync('git', ['grep', '--untracked', '-l', 'backfillTruckLoyalty', '--', 'app', 'lib', 'components', 'scripts'], { cwd: REPO }).toString().trim().split('\n').sort()
    t('🔴 nothing calls it: it appears only where it is defined (and in this harness)', J(callers) === J(['lib/loyalty/run.ts', 'scripts/loyalty-1.cjs']), callers)
  }

  // ══ 11 ══
  head('11 · the cron route (every 10 minutes, the existing scheduler)')
  {
    const cronReq = h => new (require('next/server').NextRequest)('https://www.hatchgrab.com/api/cron/loyalty-stamps', { headers: h })
    process.env.CRON_SECRET = 'cron-secret'
    globalThis.__harnessDb = world().db
    t('a call without the cron secret is refused (401) and reads nothing', (await L.loyaltyCron(cronReq({}))).status === 401 && globalThis.__harnessDb.calls.length === 0)
    globalThis.__harnessDb = world({ platform_switches: [{ id: true, loyalty_enabled: false }] }).db
    const off = await (await L.loyaltyCron(cronReq({ authorization: 'Bearer cron-secret' }))).json()
    t('🔴 with the secret and the switch as it is live (off): { enabled: false }, and the one read is platform_switches', off.enabled === false && off.stamped === 0 && J(globalThis.__harnessDb.calls) === J([{ table: 'platform_switches', op: 'select' }]), off)
    globalThis.__harnessDb = world().db
    const on = await (await L.loyaltyCron(cronReq({ authorization: 'Bearer cron-secret' }))).json()
    t('with the switch on (fixture only) the route runs the job', on.enabled === true && on.stamped === 5, on)
    const crons = JSON.parse(read('vercel.json')).crons
    t('registered in vercel.json\'s crons (the scheduler every other job uses), every 10 minutes', crons.filter(c => c.path === '/api/cron/loyalty-stamps').length === 1 && crons.find(c => c.path === '/api/cron/loyalty-stamps').schedule === '*/10 * * * *')
    const route = read('app/api/cron/loyalty-stamps/route.ts')
    const clientLine = s => (s.match(/const db = .*persistSession: false \} \}\)/) || [null])[0]
    t('the route has the other crons\' gate (CRON_SECRET bearer or an admin) and the SAME service-role client line as the review-requests cron', /Bearer \$\{secret\}/.test(route) && /verifyAdmin\(req\)/.test(route) && !!clientLine(route) && clientLine(route) === clientLine(read('app/api/cron/review-requests/route.ts')))
  }

  // ══ 12 ══
  head('12 · privacy: the 12-month retention job and account deletion')
  {
    const old = iso(NOW - 400 * D), recent = iso(NOW - 10 * D), cutoff = iso(NOW - 365 * D)
    const P = fakeDb({
      loyalty_cards: [{ id: 'c-idle', truck_id: TRUCK, last_stamp_at: old, created_at: old }, { id: 'c-live', truck_id: TRUCK, last_stamp_at: recent, created_at: old }, { id: 'c-never', truck_id: TRUCK, last_stamp_at: null, created_at: old }],
      loyalty_stamps: [{ id: 's-idle', card_id: 'c-idle', stamped_at: old }, { id: 's-old', card_id: 'c-live', stamped_at: old }, { id: 's-new', card_id: 'c-live', stamped_at: recent }],
      loyalty_rewards: [{ id: 'r-red-old', card_id: 'c-live', earned_from_stamp_id: 's-old', redeemed_at: old, expires_at: null, voided_at: null }, { id: 'r-void-old', card_id: 'c-live', redeemed_at: null, voided_at: old, expires_at: null },
        { id: 'r-exp-old', card_id: 'c-live', redeemed_at: null, voided_at: null, expires_at: old }, { id: 'r-open', card_id: 'c-live', redeemed_at: null, voided_at: null, expires_at: null }, { id: 'r-red-new', card_id: 'c-live', redeemed_at: recent, voided_at: null, expires_at: null }],
    })
    const failures = []
    const pr = await L.purgeOldLoyalty(P, cutoff, 500, 5000, failures)
    t('deleted: cards with no stamp for 12 months (and their stamps), stamps older than 12 months, rewards redeemed / voided / expired unused over 12 months ago',
      J(P.T.loyalty_cards.map(c => c.id)) === J(['c-live']) && J(P.T.loyalty_stamps.map(s => s.id)) === J(['s-new']) && J(P.T.loyalty_rewards.map(r => r.id).sort()) === J(['r-open', 'r-red-new']) && !failures.length, { pr, T: P.T })
    t('…a reward still open (no expiry) and recent history are kept; a second run deletes nothing', (await L.purgeOldLoyalty(P, cutoff, 500, 5000, failures)).cardsDeleted === 0 && P.T.loyalty_rewards.length === 2)
    const ret = read('lib/order-retention.ts')
    t('the daily retention job (lib/order-retention.ts, /api/cron/order-retention) calls it with the same 12-month cutoff and batch limits', /await purgeOldLoyalty\(supabase, cutoff\.toISOString\(\), RETENTION_BATCH, RETENTION_MAX_PER_RUN, failures\)/.test(ret) && /loyalty, failures,/.test(ret))
    const A = fakeDb({ loyalty_cards: [{ id: 'k1', truck_id: TRUCK }, { id: 'k2', truck_id: OTHER }], loyalty_stamps: [{ id: 'z1', card_id: 'k1' }], loyalty_rewards: [{ id: 'y1', card_id: 'k1' }], truck_loyalty_settings: [settingsRow(TRUCK), settingsRow(OTHER)] })
    const ad = await L.deleteTruckLoyalty(A, [TRUCK])
    t('account deletion: the truck\'s cards (their stamps and rewards cascade) and settings deleted — another truck\'s kept', ad.cards === 1 && ad.settings === 1 && J(A.T.loyalty_cards.map(c => c.id)) === J(['k2']) && !A.T.loyalty_stamps.length && !A.T.loyalty_rewards.length && J(A.T.truck_loyalty_settings.map(s => s.truck_id)) === J([OTHER]), ad)
    t('…called by lib/account-deletion.ts as its own step (delete_loyalty), after paperwork, before the truck row is cleared', /loyalty = await deleteTruckLoyalty\(supabase, truckIds\)/.test(read('lib/account-deletion.ts')) && read('lib/account-deletion.ts').indexOf('deleteTruckLoyalty(supabase') > read('lib/account-deletion.ts').indexOf('deleteTruckPaperwork(supabase'))
    t('the hard delete needs nothing: every loyalty table cascades from trucks(id)', (code.match(/truck_id\s+text not null references public\.trucks\(id\) on delete cascade/g) || []).length === 3 && /truck_id\s+text primary key references public\.trucks\(id\) on delete cascade/.test(code))
  }

  // ══ 13 ══
  head('13 · nothing else touched')
  {
    const BASE = 'f2a04af6~1'     // before loyalty-1's first commit (the migration)
    const commits = execFileSync('git', ['log', '--format=%H', '--grep=^loyalty-1:', `${BASE}..HEAD`], { cwd: REPO }).toString().trim().split('\n').filter(Boolean)
    const committed = [...new Set(commits.flatMap(c => execFileSync('git', ['show', '--name-only', '--format=', c], { cwd: REPO }).toString().trim().split('\n').filter(Boolean)))]
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'lib/loyalty', 'app/api/cron/loyalty-stamps'], { cwd: REPO }).toString().trim().split('\n').filter(Boolean)
    const mine = /^(supabase\/migrations\/20261073_loyalty_1\.sql|lib\/loyalty\/[a-z]+\.ts|app\/api\/cron\/loyalty-stamps\/route\.ts|lib\/order-retention\.ts|lib\/account-deletion\.ts|vercel\.json|scripts\/loyalty-1\.cjs|scripts\/reviews-weather-1\.cjs|scripts\/perf-1\.cjs|scripts\/harnesses\.json|docs\/loyalty-1-[a-z-]+\.md)$/
    const stray = [...committed, ...untracked].filter(f => !mine.test(f))
    t('every file loyalty-1 committed or created is on its list (no page, message, i18n, landing, legal or manual file)', commits.length >= 1 && !stray.length, { commits: commits.length, stray })
    t('🔴 docs/reference-manual.md, messages/, lib/i18n/, app/(public)/(site)/landing/, components/landing/, components/legal/ are in none of loyalty-1\'s commits', !committed.some(f => /^(docs\/reference-manual\.md|messages\/|lib\/i18n\/|app\/landing\/|components\/landing\/|components\/legal\/|content\/legal\/)/.test(f)))
    const importers = execFileSync('git', ['grep', '--untracked', '-l', '-E', '@/lib/loyalty/', '--', 'app', 'lib', 'components'], { cwd: REPO }).toString().trim().split('\n').sort()
    t('🔴 only the new cron route, the retention job and account deletion import lib/loyalty — no order placement, dashboard action, status change, payment code, checkout or customer page', J(importers) === J(['app/api/cron/loyalty-stamps/route.ts', 'lib/account-deletion.ts', 'lib/order-retention.ts']), importers)
    // (a) of everything loyalty-1 committed, nothing under app/api or lib is outside its own files; (b) the order, dashboard-action,
    // payment and webhook code, the order pages and proxy.ts are byte-identical to before loyalty-1, committed or not
    const OWN = /^(app\/api\/cron\/loyalty-stamps\/|lib\/loyalty\/|lib\/order-retention\.ts$|lib\/account-deletion\.ts$)/
    const outside = committed.filter(f => /^(app\/|lib\/|components\/|proxy\.ts$)/.test(f) && !OWN.test(f))
    const CRITICAL = ['app/api/orders', 'app/api/dashboard', 'app/api/payments', 'app/api/webhooks', 'lib/payments', 'lib/orders', 'lib/order-charges.ts', 'lib/order-repricing.ts', 'lib/order-calculations.ts', 'app/(app)/order', 'app/(app)/o', 'proxy.ts']
    // ⚠️ RE-PINNED (cwv-2, 6 November 2026, docs/cwv-2-report.md §6): the routes moved into app/(app) and app/(public); `git diff` saw every moved file as deleted and added. scripts/_moved-paths.cjs changedSince compares each file with itself at that commit, under its name then — blind to the move and nothing else.
    const critical = require('./_moved-paths.cjs').changedSince(BASE, CRITICAL)
    t('🔴 order placement, the dashboard action route (status changes), the payment and webhook code, the customer order pages and proxy.ts: byte-identical to before loyalty-1; nothing else under app/ or lib/ committed', !outside.length && !critical.length, { outside, critical })
    const src = ['lib/loyalty/model.ts', 'lib/loyalty/run.ts', 'lib/loyalty/service.ts', 'lib/loyalty/store.ts', 'lib/loyalty/retention.ts', 'app/api/cron/loyalty-stamps/route.ts'].map(read).join('\n')
    const store = read('lib/loyalty/store.ts')
    t('the store writes only the loyalty tables: no insert / update / delete anywhere; the only upsert is the truck\'s settings', !/\.(insert|update|delete)\(/.test(store) && (store.match(/\.upsert\(/g) || []).length === 1 && /from\('truck_loyalty_settings'\)\.upsert/.test(store))
    t('no email is sent, no message file read, no .env file referenced', !/sendEmail|brevo|@\/messages|messages\/|\.env\b/i.test(src.replace(/process\.env\.[A-Z_]+/g, '')))
  }

  console.log(`\nloyalty-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
