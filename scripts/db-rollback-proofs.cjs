#!/usr/bin/env node
// scripts/db-rollback-proofs.cjs — 🔴 PROOFS AGAINST THE LIVE DATABASE THAT NEVER COMMIT (france-records-1, 24 November 2026; Dominic's
// decision A, docs/france-records-1-report.md). It is in harnesses.json's `operational_refused` group: no sweep ever runs it.
//
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --preflight supabase/migrations/20261125_france_records_1.sql
//        ONE transaction, ending in ROLLBACK: the migration's statements (begin / commit / notify / its own lock_timeout taken out),
//        then the single-connection proofs of the receipt-number trigger on demo trucks — sequential numbers, each insert path's SQL
//        shape (the function, the walk-up's and the card promotion's direct inserts), a rolled-back insert leaves no gap, a forced
//        trigger failure still inserts with receipt_no NULL, a second truck starts at 1, a number is kept on update.
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --concurrency
//        After the migration is applied: two (three) connections, every transaction ROLLED BACK — one truck's inserts queue on its
//        counter row and come out consecutive with no gap or duplicate; another truck's insert is not blocked meanwhile; a holder
//        past the 2 s lock_timeout makes the waiting insert go in with receipt_no NULL (never an error).
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --old-style-call
//        vat-live-check-1's step 2: the DEPLOYED code's call to place_order_atomic_v2 (no tax_breakdown key), on a demo truck, rolled back.
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --preflight-regime supabase/migrations/20261126_france_receipts_1.sql
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --regime-check
//        france-receipts-1: the VAT regime stamp on every insert path (see regimeProofs below), before and after applying, rolled back.
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --preflight-notes supabase/migrations/20261127_france_notes_1.sql
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --notes-check
//        france-notes-1: the line_notes column (see notesProofs below), before and after applying, rolled back.
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --preflight-till-1 supabase/migrations/20261129_till_pack_1.sql
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --till-1-check
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --preflight-till-2 supabase/migrations/20261133_till_pack_2.sql
//   npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --till-2-check
//        till-pack-1: the tamper-evident chain in observe mode (see tillProofs below), before and after applying, rolled back.
//
// 🔴 THE SAFEGUARDS (Dominic, 24 November 2026), each enforced below, not just promised:
//   • DEMO TRUCKS ONLY — every truck it touches is in TRUCKS, and it refuses to start unless each one exists, is NOT a customer, and
//     is a demo (id "demo-…" or plan 'demo').
//   • NEVER COMMITS — there is no COMMIT statement in this file's SQL (it checks the text it sends, and the migration's after stripping);
//     every transaction ends in ROLLBACK, in a finally, error or not; every connection is closed after its rollback.
//   • SHORT TIMEOUTS — statement_timeout 5 s and lock_timeout 3 s on every connection, so it can never hold a lock on a live table for
//     long. (The pre-flight's DDL locks trucks and orders for the length of its transaction — about a second.)
//   • BEFORE AND AFTER COUNTS for the demo trucks — orders, order_payments, action_audit_log, production_slot_usage, the counter
//     table (when it exists), receipt_no_failures, and the two display counters the function moves — printed, and they must be
//     identical, or it exits 1 and says so.
//   • EVERY SQL STATEMENT IT SENDS IS PRINTED (with its parameters).
// The connection string comes from scripts/db-migrate.cjs's own reader (never printed; scrubbed from every message).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS operational script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { dbUrl, scrub, loadPg, withoutSslmode } = require('./db-migrate.cjs')
const REPO = path.resolve(__dirname, '..')

/** The only trucks this script ever touches. A = the French demo kitchen; B = a GB test truck on the demo plan. */
const TRUCKS = { A: 'demo-mk65q66spjck0g9mxt50btfxtr', B: 'test-truck-2' }
const IDS = Object.values(TRUCKS)

let URL_ = null
let failed = 0
const say = (...a) => console.log(...a)
const ok = (label, cond, detail) => { if (cond) say(`  ✓ ${label}`); else { failed++; say(`  🔴 ${label}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 600)}` : ''}`) } }
function die(msg) { console.error(`db-rollback-proofs: ${URL_ ? scrub(msg, URL_) : msg}`); process.exit(2) }

/** Every statement goes through here: printed, then sent. A COMMIT is refused before it can be sent. */
async function q(c, tag, sql, params = []) {
  if (/\bcommit\b/i.test(sql.replace(/--[^\n]*/g, ''))) die(`refusing to send a COMMIT (${tag})`)
  say(`SQL [${tag}]> ${sql.replace(/\s+/g, ' ').trim()}${params.length ? `   -- params ${JSON.stringify(params)}` : ''}`)
  return c.query(sql, params)
}

async function connect(tag) {
  const { Client } = loadPg()
  const c = new Client({ connectionString: withoutSslmode(URL_), ssl: { rejectUnauthorized: false }, application_name: `db-rollback-proofs ${tag} (Claude Code)` })
  c.on('notice', n => say(`  notice [${tag}]: ${scrub(n.message, URL_)}`))
  await c.connect()
  await q(c, tag, "set statement_timeout = '5s'")
  await q(c, tag, "set lock_timeout = '3s'")
  return c
}
/** Run `fn` inside BEGIN … ROLLBACK, always rolled back, the connection always closed. */
async function inRollback(tag, fn) {
  const c = await connect(tag)
  try {
    await q(c, tag, 'begin')
    return await fn(c)
  } finally {
    try { await q(c, tag, 'rollback') } catch (e) { say(`  (rollback on ${tag}: ${scrub(e.message, URL_)})`) }
    try { await c.end() } catch { /* closed */ }
  }
}

/** The demo-truck guard. */
async function guard(c) {
  const r = await q(c, 'guard', 'select id, plan, is_customer from public.trucks where id = any($1) order by id', [IDS])
  const rows = r.rows
  const bad = IDS.filter(id => { const t = rows.find(x => x.id === id); return !t || t.is_customer !== false || !(t.id.startsWith('demo-') || t.plan === 'demo') })
  if (bad.length) die(`refusing: not a demo truck (or missing): ${bad.join(', ')}`)
  say(`  guard: ${rows.map(t => `${t.id} (plan ${t.plan}, is_customer ${t.is_customer})`).join(' · ')} — demo trucks only`)
}

/** The counts that must not move. Read in their own read-only transaction (also rolled back). */
async function counts(label) {
  return inRollback(`counts-${label}`, async c => {
    await q(c, `counts-${label}`, 'set transaction read only')
    const base = await q(c, `counts-${label}`, `select
        (select count(*) from public.orders where truck_id = any($1))::int as orders,
        (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments,
        (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log,
        (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage,
        (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter,
        (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter,
        to_regclass('public.receipt_counters') is not null as has_counters,
        (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts,
        (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes`, [IDS])
    const row = { ...base.rows[0] }
    if (row.has_counters) {
      const k = await q(c, `counts-${label}`, `select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows,
          (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum,
          (select count(*) from public.receipt_no_failures)::int as failures`, [IDS])
      Object.assign(row, k.rows[0])
    }
    delete row.has_counters
    say(`  counts ${label}: ${JSON.stringify(row)}`)
    return row
  })
}

const rid = () => `rbp-${crypto.randomBytes(4).toString('hex')}`
/** The walk-up's direct insert (app/api/dashboard/action/route.ts `manual`), its column set, no event. */
const WALKUP = `insert into public.orders (id, truck_id, customer_name, customer_phone, customer_email, slot, order_type, event_date, event_id,
  items, deals, discount_code, subtotal, discount_amt, total, total_minor, food_minor, tax_minor, tax_inclusive, tax_label, card_fee_payer,
  status, payment_status, source)
  values ($1, $2, 'rollback proof', null, null, null, 'collection', current_date, null, '[]'::jsonb, null, null, 0, 0, 0, 0, 0, 0, true, 'TVA', 'truck',
  'confirmed', 'unpaid', 'manual') returning order_key, receipt_no`
/** The card promotion's direct insert (lib/payments/promote-draft.ts), its column set. */
const PROMOTE = `insert into public.orders (order_key, id, truck_id, customer_name, customer_email, customer_phone, order_type, table_ref, slot,
  requested_slot, asap_estimate, event_date, event_id, van_id, items, deals, extras, bundle, discount_code, subtotal, discount_amt, total,
  total_minor, notes, status, payment_status, placed_at)
  values (gen_random_uuid(), $1, $2, 'rollback proof', null, null, 'collection', null, null, null, null, current_date, null, null, '[]'::jsonb,
  null, null, null, null, 0, 0, 0, 0, null, 'pending', 'unpaid', now()) returning order_key, receipt_no`
/** place_order_atomic_v2 as the DEPLOYED code calls it (no tax_breakdown key; no event, no capacity rows). */
const OLD_STYLE_ORDER = { customer_name: 'rollback proof', customer_email: null, customer_phone: null, order_type: 'collection', items: [], deals: null,
  discount_code: null, subtotal: 0, discount_amt: 0, total: 0, notes: null, van_id: null, payment_status: 'unpaid', total_minor: 0,
  food_minor: 0, tax_minor: 0, tax_rate_milli: 10000, tax_inclusive: true, tax_label: 'TVA', tip_minor: 0, tip_pct_bps: null, service_fee_minor: 0,
  service_fee_recipient: null, card_surcharge_minor: 0, card_funding: null, card_fee_payer: 'truck', application_fee_minor: null }
const CALL = `select public.place_order_atomic_v2($1::jsonb, null, 'confirmed', null, $2, current_date, null) as r`
const noOf = async (c, tag, key) => (await q(c, tag, 'select receipt_no, tax_breakdown from public.orders where order_key = $1', [key])).rows[0]

async function preflight(file) {
  const rel = path.relative(REPO, path.resolve(REPO, file)).split(path.sep).join('/')
  if (!/^supabase\/migrations\/[^/]+\.sql$/.test(rel)) die(`${rel} is not a migration file`)
  let sql = fs.readFileSync(path.join(REPO, rel), 'utf8')
  const body = sql.replace(/--[^\n]*/g, '').replace(/^\s*set lock_timeout[^;]*;/im, '').replace(/^\s*begin;\s*$/im, '').replace(/^\s*commit;\s*$/im, '').replace(/^\s*notify pgrst[^;]*;/im, '')
  if (/^\s*(begin|commit|rollback)\s*;/im.test(body) || /\bcommit\b/i.test(body)) die('the migration body still has a transaction statement after stripping')
  say(`\n══ PRE-FLIGHT — ${rel} inside ONE transaction that is ROLLED BACK ══`)
  const before = await counts('before')
  await inRollback('preflight', async c => {
    await guard(c)
    await q(c, 'preflight', body)
    const A = TRUCKS.A, B = TRUCKS.B
    const seq = []
    for (let i = 0; i < 3; i++) seq.push((await q(c, 'preflight', WALKUP, [rid(), A])).rows[0].receipt_no)
    ok('1 · sequential: three walk-up inserts on one truck get 1, 2, 3', JSON.stringify(seq.map(Number)) === '[1,2,3]', seq)
    const fn = (await q(c, 'preflight', CALL, [JSON.stringify(OLD_STYLE_ORDER), A])).rows[0].r
    const fnRow = await noOf(c, 'preflight', fn.order_key)
    ok('2 · the function (place_order_atomic_v2, the deployed call) gets the next: 4 — and stores tax_breakdown NULL', Number(fnRow.receipt_no) === 4 && fnRow.tax_breakdown === null, fnRow)
    const pr = (await q(c, 'preflight', PROMOTE, [rid(), A])).rows[0]
    ok('3 · the card promotion\'s direct insert gets 5', Number(pr.receipt_no) === 5, pr)
    await q(c, 'preflight', 'savepoint gap')
    const g1 = (await q(c, 'preflight', WALKUP, [rid(), A])).rows[0].receipt_no
    await q(c, 'preflight', 'rollback to savepoint gap')
    const g2 = (await q(c, 'preflight', WALKUP, [rid(), A])).rows[0].receipt_no
    ok('4 · a rolled-back insert leaves no gap: 6, rolled back, then 6 again', Number(g1) === 6 && Number(g2) === 6, { g1, g2 })
    await q(c, 'preflight', 'savepoint forced')
    await q(c, 'preflight', 'alter table public.receipt_counters rename to receipt_counters_forced_failure')
    const f = (await q(c, 'preflight', WALKUP, [rid(), A])).rows[0]
    const exists = (await q(c, 'preflight', 'select count(*)::int as n from public.orders where order_key = $1', [f.order_key])).rows[0].n
    const fl = (await q(c, 'preflight', "select sqlstate, message from public.receipt_no_failures where truck_id = $1 order by id desc limit 1", [A])).rows[0]
    ok('5 · a forced trigger failure (the counter table gone) still INSERTS the order, with receipt_no NULL, and logs why', f.receipt_no === null && exists === 1 && !!fl && fl.sqlstate === '42P01', { f, fl })
    await q(c, 'preflight', 'rollback to savepoint forced')
    const b1 = (await q(c, 'preflight', WALKUP, [rid(), B])).rows[0].receipt_no
    ok('6 · another truck starts at its own 1', Number(b1) === 1, b1)
    const keep = (await q(c, 'preflight', WALKUP, [rid(), A])).rows[0]
    await q(c, 'preflight', 'update public.orders set receipt_no = 999 where order_key = $1', [keep.order_key])
    const k1 = await noOf(c, 'preflight', keep.order_key)
    await q(c, 'preflight', 'update public.orders set receipt_no = null where order_key = $1', [keep.order_key])
    const k2 = await noOf(c, 'preflight', keep.order_key)
    ok('7 · a number once given is kept: an update to 999, or to NULL, leaves 7', Number(keep.receipt_no) === 7 && Number(k1.receipt_no) === 7 && Number(k2.receipt_no) === 7, { keep, k1, k2 })
    const cancel = (await q(c, 'preflight', "update public.orders set status = 'cancelled' where order_key = $1 returning receipt_no", [keep.order_key])).rows[0]
    ok('8 · a cancelled order keeps its number', Number(cancel.receipt_no) === 7, cancel)
    const ctr = (await q(c, 'preflight', 'select truck_id, last_no from public.receipt_counters where truck_id = any($1) order by truck_id', [IDS])).rows
    ok('9 · the counters read 7 (A) and 1 (B) — the rolled-back 6 and the failed insert took none', JSON.stringify(ctr.map(r => [r.truck_id, Number(r.last_no)]).sort()) === JSON.stringify([[A, 7], [B, 1]].sort()), ctr)
    // 10 · the walk-up's OFFLINE REPLAY: INSERT … ON CONFLICT (order_key) DO NOTHING of an order that already exists takes no number.
    const key = crypto.randomUUID()
    const REPLAY = WALKUP.replace('insert into public.orders (id,', 'insert into public.orders (order_key, id,').replace("values ($1, $2,", "values ($3::uuid, $1, $2,").replace('returning order_key, receipt_no', 'on conflict (order_key) do nothing returning order_key, receipt_no')
    const first = (await q(c, 'preflight', REPLAY, [rid(), A, key])).rows[0]
    const again = (await q(c, 'preflight', REPLAY, [rid(), A, key])).rows
    const next = (await q(c, 'preflight', WALKUP, [rid(), A])).rows[0]
    ok('10 · an offline replay (ON CONFLICT DO NOTHING) of an existing order takes no number: 8, the replay skipped, the next order 9', Number(first.receipt_no) === 8 && again.length === 0 && Number(next.receipt_no) === 9, { first, again, next })
  })
  const after = await counts('after')
  ok('the demo trucks\' counts are identical before and after (nothing was committed)', JSON.stringify(before) === JSON.stringify(after), { before, after })
}

async function concurrency() {
  say('\n══ TWO-CONNECTION PROOFS — every transaction ROLLED BACK ══')
  const before = await counts('before')
  const A = TRUCKS.A, B = TRUCKS.B
  const g = await connect('guard'); try { await guard(g) } finally { await g.end() }
  const c1 = await connect('c1'), c2 = await connect('c2'), c3 = await connect('c3')
  try {
    for (const [c, t] of [[c1, 'c1'], [c2, 'c2'], [c3, 'c3']]) await q(c, t, 'begin')
    const start = Number((await q(c1, 'c1', 'select coalesce((select last_no from public.receipt_counters where truck_id = $1), 0) as n', [A])).rows[0].n)
    const a1 = Number((await q(c1, 'c1', WALKUP, [rid(), A])).rows[0].receipt_no)
    ok(`c1 holds truck A's counter: its insert got ${start + 1}`, a1 === start + 1, { start, a1 })
    const t0 = Date.now()
    const waiting = q(c2, 'c2', WALKUP, [rid(), A]).then(r => ({ no: r.rows[0].receipt_no, at: Date.now() - t0 }))
    await new Promise(r => setTimeout(r, 400))
    const tb = Date.now()
    const bNo = Number((await q(c3, 'c3', WALKUP, [rid(), B])).rows[0].receipt_no)
    const bMs = Date.now() - tb
    ok(`truck B's insert is NOT blocked while truck A's counter is held (${bMs} ms)`, bMs < 1000 && bNo >= 1, { bNo, bMs })
    await q(c1, 'c1', 'rollback')
    const w = await waiting
    ok(`c2 waited on truck A's row, then — c1 rolled back — got ${start + 1}: no gap, no duplicate`, Number(w.no) === start + 1 && w.at >= 350, w)
    const more = [Number((await q(c2, 'c2', WALKUP, [rid(), A])).rows[0].receipt_no), Number((await q(c2, 'c2', WALKUP, [rid(), A])).rows[0].receipt_no)]
    ok(`…and its next two are ${start + 2}, ${start + 3} — consecutive`, JSON.stringify(more) === JSON.stringify([start + 2, start + 3]), more)
    // The lock_timeout fallback: c2 still holds A's row; a new connection's insert waits past 2 s and goes in with receipt_no NULL.
    const c4 = await connect('c4')
    try {
      await q(c4, 'c4', 'begin')
      const t4 = Date.now()
      const r4 = (await q(c4, 'c4', WALKUP, [rid(), A])).rows[0]
      const ms4 = Date.now() - t4
      ok(`a holder past the trigger's 2 s lock_timeout: the waiting insert goes IN, receipt_no NULL, after ~2 s (${ms4} ms) — never an error`, r4.receipt_no === null && ms4 >= 1900 && ms4 < 3500, { r4, ms4 })
    } finally { try { await q(c4, 'c4', 'rollback') } catch { /* closed */ } await c4.end() }
  } finally {
    for (const [c, t] of [[c1, 'c1'], [c2, 'c2'], [c3, 'c3']]) { try { await q(c, t, 'rollback') } catch { /* already */ } try { await c.end() } catch { /* closed */ } }
  }
  const after = await counts('after')
  ok('the demo trucks\' counts are identical before and after (nothing was committed)', JSON.stringify(before) === JSON.stringify(after), { before, after })
}

async function oldStyleCall() {
  say('\n══ vat-live-check-1 step 2 — the DEPLOYED code\'s call to place_order_atomic_v2, ROLLED BACK ══')
  const before = await counts('before')
  await inRollback('oldcall', async c => {
    await guard(c)
    const r = (await q(c, 'oldcall', CALL, [JSON.stringify(OLD_STYLE_ORDER), TRUCKS.A])).rows[0].r
    const row = (await q(c, 'oldcall', 'select receipt_no, tax_breakdown, tax_rate_milli, tax_inclusive, total_minor, currency, country from public.orders where order_key = $1', [r.order_key])).rows[0]
    ok('the old-style call succeeds: an order key and a display number come back', !!r.order_key && Number.isInteger(Number(r.order_number)), r)
    ok('…the row stores tax_breakdown NULL (no key sent), its snapshot as sent, and a receipt number', row.tax_breakdown === null && row.tax_rate_milli === 10000 && row.tax_inclusive === true && row.total_minor === 0 && row.receipt_no !== null, row)
  })
  const after = await counts('after')
  ok('the demo trucks\' counts are identical before and after (nothing was committed)', JSON.stringify(before) === JSON.stringify(after), { before, after })
}

/* ── france-receipts-1 (24 November 2026, docs/france-receipts-1-report.md): THE VAT REGIME STAMP ────────────────────────────────────
 *   --preflight-regime <migration>   ONE transaction, ROLLED BACK: 20261126_france_receipts_1's statements, then the proofs below.
 *   --regime-check                   After it is applied: the same proofs (no migration body), ROLLED BACK.
 * Truck A's regime is set INSIDE the transaction (an UPDATE of the demo truck's own row, rolled back with everything else — the
 * before/after counts carry both demo trucks' vat_regime, so a change that survived would show). Neither trucks trigger fires on it
 * (trucks_record_plan_history: plan / trial_expires_at only; trucks_referred_code_immutable: referred_partner_code_id only). */
const DRAFT = `insert into public.order_drafts (order_key, truck_id, subtotal, total, total_minor) values (gen_random_uuid(), $1, 1, 1, 100) returning order_key, vat_regime`
const regimeOf = async (c, tag, key) => (await q(c, tag, 'select vat_regime, receipt_no from public.orders where order_key = $1', [key])).rows[0]
async function regimeProofs(file) {
  let body = null
  if (file) {
    const rel = path.relative(REPO, path.resolve(REPO, file)).split(path.sep).join('/')
    if (!/^supabase\/migrations\/[^/]+\.sql$/.test(rel)) die(`${rel} is not a migration file`)
    body = fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/--[^\n]*/g, '').replace(/^\s*set lock_timeout[^;]*;/im, '').replace(/^\s*begin;\s*$/im, '').replace(/^\s*commit;\s*$/im, '').replace(/^\s*notify pgrst[^;]*;/im, '')
    if (/^\s*(begin|commit|rollback)\s*;/im.test(body) || /\bcommit\b/i.test(body)) die('the migration body still has a transaction statement after stripping')
    say(`\n══ PRE-FLIGHT — ${rel} inside ONE transaction that is ROLLED BACK ══`)
  } else say('\n══ THE VAT REGIME STAMP, LIVE — every transaction ROLLED BACK ══')
  const before = await counts('before')
  const tag = file ? 'preflight' : 'regime'
  await inRollback(tag, async c => {
    await guard(c)
    if (body) await q(c, tag, body)
    const A = TRUCKS.A, B = TRUCKS.B
    const n0 = (await q(c, tag, WALKUP, [rid(), A])).rows[0]
    const r0 = await regimeOf(c, tag, n0.order_key)
    ok('1 · truck A has no regime: a walk-up insert is stamped NULL (and still gets a receipt number)', r0.vat_regime === null && r0.receipt_no !== null, r0)
    await q(c, tag, "update public.trucks set vat_regime = 'franchise' where id = $1", [A])
    const w = await regimeOf(c, tag, (await q(c, tag, WALKUP, [rid(), A])).rows[0].order_key)
    const fn = (await q(c, tag, CALL, [JSON.stringify(OLD_STYLE_ORDER), A])).rows[0].r
    const f = await regimeOf(c, tag, fn.order_key)
    const p = await regimeOf(c, tag, (await q(c, tag, PROMOTE, [rid(), A])).rows[0].order_key)
    const d = (await q(c, tag, DRAFT, [A])).rows[0]
    ok('2 · truck A set to franchise: the walk-up insert, the DEPLOYED place_order_atomic_v2 call, the card promotion\'s insert and a card draft are each stamped franchise', [w, f, p, d].every(x => x.vat_regime === 'franchise'), { w, f, p, d })
    ok('3 · …and the receipt numbers still run on alongside: consecutive', Number(f.receipt_no) === Number(w.receipt_no) + 1 && Number(p.receipt_no) === Number(f.receipt_no) + 1, { w: w.receipt_no, f: f.receipt_no, p: p.receipt_no })
    const named = PROMOTE.replace('placed_at)', 'placed_at, vat_regime)').replace("now()) returning", "now(), 'reel_simplifie') returning")
    const nm = await regimeOf(c, tag, (await q(c, tag, named, [rid(), A])).rows[0].order_key)
    ok('4 · an insert that NAMES a regime keeps it (a promotion carries its draft\'s): reel_simplifie, though the truck says franchise', nm.vat_regime === 'reel_simplifie', nm)
    const b = await regimeOf(c, tag, (await q(c, tag, WALKUP, [rid(), B])).rows[0].order_key)
    ok('5 · truck B (GB, no regime): stamped NULL', b.vat_regime === null, b)
    await q(c, tag, "update public.trucks set vat_regime = 'reel_simplifie' where id = $1", [A])
    const after = await regimeOf(c, tag, (await q(c, tag, WALKUP, [rid(), A])).rows[0].order_key)
    const kept = await regimeOf(c, tag, fn.order_key)
    ok('6 · the truck changes regime: the next order is stamped reel_simplifie, and the franchise order keeps franchise', after.vat_regime === 'reel_simplifie' && kept.vat_regime === 'franchise', { after, kept })
  })
  const after = await counts('after')
  ok('the demo trucks\' counts and regimes are identical before and after (nothing was committed)', JSON.stringify(before) === JSON.stringify(after), { before, after })
}

/* ── france-notes-1 (24 November 2026, docs/france-notes-1-report.md): THE LINE NOTES' OWN COLUMN ──────────────────────────────────────
 *   --preflight-notes <migration>   ONE transaction, ROLLED BACK: 20261127_france_notes_1's statements, then the proofs below.
 *   --notes-check                   After it is applied: the same proofs (no migration body), ROLLED BACK. Demo trucks only. */
/** lib/line-notes.ts itself (bundled on the fly with the repo's esbuild), so proof 7 runs the real merge, not a copy. */
function mergeFor(items, deals, lineNotes) {
  if (!mergeFor.mod) {
    const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
    const out = esbuild.buildSync({ entryPoints: [path.join(REPO, 'lib/line-notes.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent' }).outputFiles[0].text
    const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, require); mergeFor.mod = m.exports
  }
  return mergeFor.mod.mergeLineNotes(items, deals, lineNotes)
}
const LN = { v: 1, items: { '#0': { at: 3, note: 'No onions' } }, deals: { '#0': { at: 3, slotNotes: { main: 'no peanuts' } } } }
const ITEMS_WITH = [{ name: 'Crêpe', quantity: 1, unit_price: 8.5, specialInstructions: 'No onions', modifiers: [] }]
const DEALS_WITH = [{ name: 'Formule', price: 10, slots: { main: 'Crêpe' }, slotNotes: { main: 'no peanuts' }, slotModifiers: {} }]
const ITEMS_OUT = [{ name: 'Crêpe', quantity: 1, unit_price: 8.5, modifiers: [] }]
const DEALS_OUT = [{ name: 'Formule', price: 10, slots: { main: 'Crêpe' }, slotModifiers: {} }]
async function notesProofs(file) {
  let body = null
  if (file) {
    const rel = path.relative(REPO, path.resolve(REPO, file)).split(path.sep).join('/')
    if (!/^supabase\/migrations\/[^/]+\.sql$/.test(rel)) die(`${rel} is not a migration file`)
    body = fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/--[^\n]*/g, '').replace(/^\s*set lock_timeout[^;]*;/im, '').replace(/^\s*begin;\s*$/im, '').replace(/^\s*commit;\s*$/im, '').replace(/^\s*notify pgrst[^;]*;/im, '')
    if (/^\s*(begin|commit|rollback)\s*;/im.test(body) || /\bcommit\b/i.test(body)) die('the migration body still has a transaction statement after stripping')
    say(`\n══ PRE-FLIGHT — ${rel} inside ONE transaction that is ROLLED BACK ══`)
  } else say('\n══ THE LINE NOTES COLUMN, LIVE — every transaction ROLLED BACK ══')
  const before = await counts('before')
  const tag = file ? 'preflight' : 'notes'
  await inRollback(tag, async c => {
    await guard(c)
    if (body) await q(c, tag, body)
    const A = TRUCKS.A
    const rowOf = async key => (await q(c, tag, 'select items, deals, line_notes, receipt_no, customer_name from public.orders where order_key = $1', [key])).rows[0]
    // 1 · the DEPLOYED call: notes inside items, line_notes NULL (old-style, read and retained exactly as today)
    const oldCall = (await q(c, tag, CALL, [JSON.stringify({ ...OLD_STYLE_ORDER, items: ITEMS_WITH, deals: DEALS_WITH }), A])).rows[0].r
    // (jsonb keeps no key order — it hands objects back shortest key first — so every comparison here is jsonb = jsonb, in SQL.)
    const same = async (key, items, deals, ln) => (await q(c, tag, 'select items = $2::jsonb as i, deals = $3::jsonb as d, (line_notes is not distinct from $4::jsonb) as n from public.orders where order_key = $1', [key, JSON.stringify(items), JSON.stringify(deals), ln === null ? null : JSON.stringify(ln)])).rows[0]
    const o = await same(oldCall.order_key, ITEMS_WITH, DEALS_WITH, null)
    ok('1 · the deployed place_order_atomic_v2 call: its notes stay inside items / deals, line_notes NULL', o.i && o.d && o.n, o)
    // 2 · the new customer path: the same call, then the follow-up update moves the notes (only while line_notes is still NULL)
    const newCall = (await q(c, tag, CALL, [JSON.stringify({ ...OLD_STYLE_ORDER, items: ITEMS_WITH, deals: DEALS_WITH }), A])).rows[0].r
    const n0 = await rowOf(newCall.order_key)
    const moved = (await q(c, tag, 'update public.orders set items = $2::jsonb, deals = $3::jsonb, line_notes = $4::jsonb where order_key = $1 and line_notes is null returning order_key', [newCall.order_key, JSON.stringify(ITEMS_OUT), JSON.stringify(DEALS_OUT), JSON.stringify(LN)])).rows
    const n1 = await rowOf(newCall.order_key), n1s = await same(newCall.order_key, ITEMS_OUT, DEALS_OUT, LN)
    ok('2 · the customer path\'s follow-up update: items / deals without notes, the notes in line_notes, the receipt number unchanged', moved.length === 1 && n1s.i && n1s.d && n1s.n && String(n1.receipt_no) === String(n0.receipt_no), { n0, n1, n1s })
    const again = (await q(c, tag, 'update public.orders set items = $2::jsonb, deals = $3::jsonb, line_notes = $4::jsonb where order_key = $1 and line_notes is null returning order_key', [newCall.order_key, JSON.stringify(ITEMS_WITH), JSON.stringify(DEALS_WITH), JSON.stringify(LN)])).rows
    const a3 = await same(newCall.order_key, ITEMS_OUT, DEALS_OUT, LN)
    ok('3 · …and it never runs twice: a second one (line_notes already set) changes nothing', again.length === 0 && a3.i && a3.d && a3.n, a3)
    // 3b · the read: what the database hands back, merged, is EXACTLY what it hands back for the old-style order (jsonb's key order)
    const oldRow = await rowOf(oldCall.order_key), newRow = await rowOf(newCall.order_key)
    const M = mergeFor(newRow.items, newRow.deals, newRow.line_notes)
    ok('3b · read back: the new-style order\'s lines, merged by lib/line-notes.ts, are byte-identical to the old-style order\'s as the database returns them', JSON.stringify(M.items) === JSON.stringify(oldRow.items) && JSON.stringify(M.deals) === JSON.stringify(oldRow.deals), { merged: M, old: { items: oldRow.items, deals: oldRow.deals } })
    // 4 · a direct insert (the walk-up, the card promotion) naming line_notes
    const w = (await q(c, tag, WALKUP.replace('source)', 'source, line_notes)').replace("'manual') returning", "'manual', $3::jsonb) returning"), [rid(), A, JSON.stringify(LN)])).rows[0]
    const wr = (await q(c, tag, 'select line_notes = $2::jsonb as n from public.orders where order_key = $1', [w.order_key, JSON.stringify(LN)])).rows[0]
    ok('4 · a direct insert naming line_notes stores it (jsonb =)', wr.n === true, wr)
    // 5 · a card draft naming line_notes
    const d = (await q(c, tag, 'insert into public.order_drafts (order_key, truck_id, subtotal, total, total_minor, items, line_notes) values (gen_random_uuid(), $1, 1, 1, 100, $2::jsonb, $3::jsonb) returning line_notes = $3::jsonb as n, items = $2::jsonb as i', [A, JSON.stringify(ITEMS_OUT), JSON.stringify(LN)])).rows[0]
    ok('5 · a card draft stores line_notes too', d.n === true && d.i === true, d)
    // 6 · retention's write on a new-style order: line_notes and the customer fields only — items / deals byte-identical after
    const blanked = { v: 1, items: { '#0': { at: 3, note: '' } }, deals: { '#0': { at: 3, slotNotes: {} } } }
    await q(c, tag, "update public.orders set customer_name = '', line_notes = $2::jsonb where order_key = $1", [newCall.order_key, JSON.stringify(blanked)])
    const r = (await q(c, tag, 'select items = $2::jsonb as items_same, deals = $3::jsonb as deals_same, line_notes = $4::jsonb as notes_blank, customer_name from public.orders where order_key = $1', [newCall.order_key, JSON.stringify(ITEMS_OUT), JSON.stringify(DEALS_OUT), JSON.stringify(blanked)])).rows[0]
    ok('6 · retention on a new-style order: the notes and the name blanked, items and deals byte-identical (jsonb =)', r.items_same === true && r.deals_same === true && r.customer_name === '' && r.notes_blank === true, r)
  })
  const after = await counts('after')
  ok('the demo trucks\' counts are identical before and after (nothing was committed)', JSON.stringify(before) === JSON.stringify(after), { before, after })
}

/* ── till-pack-1 / till-pack-1b (24–25 November 2026, docs/till-pack-1b-report.md): THE TAMPER-EVIDENT CHAIN, OBSERVE MODE ────────────────
 *   --preflight-till-1 <migration>  ONE transaction, ROLLED BACK: 20261129_till_pack_1's statements, then every proof below in ONE
 *                                   server-side DO block (one round trip, so the migration's DDL locks on orders / order_payments /
 *                                   action_audit_log / trucks last about a second), including the DDL-only proofs: the forced failure
 *                                   (till_chain renamed inside a savepoint), the TRUNCATE refusals, a tamper caught by till_verify, and a
 *                                   probe trigger that records any write to orders / order_payments made from INSIDE another trigger.
 *   --till-1-check                  After it is applied: the same block WITHOUT the DDL-only proofs, then the two-connection proofs and
 *                                   the per-insert timings — every transaction ROLLED BACK.
 * The demo trucks are outside the till (Q7): the till is switched on for them only INSIDE these transactions (SET LOCAL
 * till.include_demo = 'on'). Each run writes the chain it built and the rows it sealed (demo data, no customer) to docs/till-pack-1/, so
 * scripts/till-pack-1.cjs can check the JavaScript mirror against what the database produced, byte for byte.
 * 🔴 NO TILL TRIGGER WRITES AN ORDER OR A PAYMENT (till-pack-1b): every till trigger does its work inside an exception block — a
 * subtransaction — so a row it wrote would carry a sub-transaction's xmin. After every step, every orders / order_payments row of both
 * trucks must carry the proof transaction's own xid (rbp_clean); the baseline and the identity change leave every row's ctid / xmin /
 * updated_at exactly as they were; and (pre-flight) the probe trigger sees no nested INSERT or UPDATE at all. */
const TILL_OUT = path.join(REPO, 'docs/till-pack-1')
const lit = s => `'${String(s).replace(/'/g, "''")}'`
/** The temporary helpers (pg_temp: gone with the session; created inside the rolled-back transaction anyway). */
function tillHelpers() {
  return `create temp table _till_proof (n serial primary key, label text not null, ok boolean, detail text);
create temp table _till_clean (n serial primary key, label text not null, bad text);
create function pg_temp.rbp_ok(p_label text, p_ok boolean, p_detail text) returns void language sql as $f$
  insert into _till_proof (label, ok, detail) values (p_label, coalesce(p_ok, false), left(p_detail, 900)) $f$;
create function pg_temp.rbp_food(p_items jsonb) returns integer language sql as $f$
  select coalesce(sum(round((e ->> 'unit_price')::numeric * (e ->> 'quantity')::numeric * 100)), 0)::integer from jsonb_array_elements(p_items) e $f$;
create function pg_temp.rbp_bd(p_food integer) returns jsonb language sql as $f$
  select jsonb_build_array(jsonb_build_object('rate_milli', 10000, 'food_minor', p_food, 'gross_minor', p_food,
    'net_minor', p_food - round(p_food * 10000 / 110000.0)::integer, 'tax_minor', round(p_food * 10000 / 110000.0)::integer)) $f$;
create function pg_temp.rbp_walkup(p_truck text, p_day date, p_items jsonb, p_status text, p_name text, p_email text, p_phone text, p_notes text, p_line_notes jsonb)
returns uuid language sql as $f$
  insert into public.orders (id, truck_id, customer_name, customer_phone, customer_email, slot, order_type, event_date, event_id, items, deals,
    discount_code, subtotal, discount_amt, total, total_minor, food_minor, tax_minor, tax_rate_milli, tax_inclusive, tax_label, tax_breakdown, card_fee_payer,
    status, payment_status, source, notes, line_notes)
  select 'rbp-' || substr(md5(random()::text), 1, 8), p_truck, p_name, p_phone, p_email, null, 'collection', p_day, null, p_items, null, null,
    round(z.f / 100.0, 2), 0, round(z.f / 100.0, 2), z.f, z.f, 0, 10000, true, 'TVA', pg_temp.rbp_bd(z.f), 'truck', p_status, 'unpaid', 'manual', p_notes, p_line_notes
  from (select pg_temp.rbp_food(p_items) as f) z
  returning order_key $f$;
create function pg_temp.rbp_set_items(p_key uuid, p_items jsonb) returns void language sql as $f$
  update public.orders o set items = p_items, subtotal = round(z.f / 100.0, 2), total = round(z.f / 100.0, 2), total_minor = z.f, food_minor = z.f,
    tax_breakdown = case when o.tax_breakdown is null then null else pg_temp.rbp_bd(z.f) end
  from (select pg_temp.rbp_food(p_items) as f) z where o.order_key = p_key $f$;
create function pg_temp.rbp_full(p_truck text, p_status text, p_source text, p_van uuid, p_currency text, p_items jsonb, p_deals jsonb,
  p_subtotal numeric, p_discount numeric, p_total numeric, p_total_minor integer, p_food integer, p_tax integer, p_rate integer, p_incl boolean,
  p_bd jsonb, p_tip integer, p_fee integer) returns uuid language sql as $f$
  insert into public.orders (id, truck_id, customer_name, order_type, event_date, items, deals, subtotal, discount_amt, total, total_minor, food_minor,
    tax_minor, tax_rate_milli, tax_inclusive, tax_label, tax_breakdown, tip_minor, service_fee_minor, service_fee_recipient, card_fee_payer, status,
    payment_status, source, van_id, currency)
  values ('rbp-' || substr(md5(random()::text), 1, 8), p_truck, 'rollback proof', 'collection', current_date, p_items, p_deals, p_subtotal, p_discount,
    p_total, p_total_minor, p_food, p_tax, p_rate, p_incl, case when p_incl then 'TVA' else 'Sales tax' end, p_bd, p_tip, p_fee,
    case when p_fee > 0 then 'truck' end, 'truck', p_status, 'unpaid', p_source, p_van, p_currency)
  returning order_key $f$;
create function pg_temp.rbp_replay(p_truck text, p_key uuid) returns integer language sql as $f$
  with ins as (insert into public.orders (order_key, id, truck_id, customer_name, order_type, event_date, items, subtotal, discount_amt, total,
      total_minor, food_minor, tax_minor, tax_inclusive, tax_label, card_fee_payer, status, payment_status, source)
    values (p_key, 'rbp-' || substr(md5(random()::text), 1, 8), p_truck, 'rollback proof', 'collection', current_date, '[]'::jsonb, 0, 0, 0, 0, 0, 0,
      true, 'TVA', 'truck', 'confirmed', 'unpaid', 'manual')
    on conflict (order_key) do nothing returning 1)
  select count(*)::int from ins $f$;
create function pg_temp.rbp_promote(p_truck text) returns uuid language sql as $f$
  insert into public.orders (order_key, id, truck_id, customer_name, customer_email, customer_phone, order_type, table_ref, slot, requested_slot,
    asap_estimate, event_date, event_id, van_id, items, deals, extras, bundle, discount_code, subtotal, discount_amt, total, total_minor, notes,
    status, payment_status, placed_at)
  values (gen_random_uuid(), 'rbp-' || substr(md5(random()::text), 1, 8), p_truck, 'rollback proof', null, null, 'collection', null, null, null,
    null, current_date, null, null, '[{"name":"Crêpe","quantity":1,"unit_price":5}]'::jsonb, null, null, null, null, 5, 0, 5, 500, null,
    'pending', 'unpaid', now())
  returning order_key $f$;
create function pg_temp.rbp_pay(p_key uuid, p_kind text, p_channel text, p_method text, p_amount integer, p_ref text) returns uuid language sql as $f$
  insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, external_ref, note, idempotency_key,
    created_by, method, livemode)
  select o.order_key, o.truck_id, p_kind, p_channel, p_amount, o.currency, 'succeeded', p_ref, 'rollback proof — staff note',
    'rbp:' || gen_random_uuid(), 'rbp-staff-user', p_method, false
  from public.orders o where o.order_key = p_key
  returning id $f$;
create function pg_temp.rbp_entries(p_truck text, p_kind text, p_ref text) returns integer language sql as $f$
  select count(*)::int from public.till_chain c where c.truck_id = p_truck and c.kind = p_kind and c.ref = p_ref $f$;
create function pg_temp.rbp_reasons(p_truck text, p_ref text) returns text language sql as $f$
  select coalesce(string_agg(c.version || ':' || (c.payload::jsonb ->> 'reason') || ':' || coalesce(c.payload::jsonb -> 'data' ->> 'fiscal_state', ''), ',' order by c.seq), '')
  from public.till_chain c where c.truck_id = p_truck and c.kind = 'order' and c.ref = p_ref $f$;
create function pg_temp.rbp_events(p_truck text, p_ref text) returns text language sql as $f$
  select coalesce(string_agg(g.event, ',' order by g.id), '') from public.till_guard_events g where g.truck_id = p_truck and g.ref = p_ref $f$;
create function pg_temp.rbp_data(p_truck text, p_ref text) returns jsonb language sql as $f$
  select c.payload::jsonb from public.till_chain c where c.truck_id = p_truck and c.kind = 'order' and c.ref = p_ref order by c.seq desc limit 1 $f$;
create function pg_temp.rbp_snap(p_trucks text[]) returns text language sql as $f$
  select coalesce(string_agg(x, ';' order by x), '') from (
    select 'o:' || o.order_key || '@' || o.ctid::text || '/' || o.xmin::text || '/' || coalesce(o.updated_at::text, '') as x from public.orders o where o.truck_id = any (p_trucks)
    union all select 'p:' || p.id || '@' || p.ctid::text || '/' || p.xmin::text from public.order_payments p where p.truck_id = any (p_trucks)) z $f$;
create function pg_temp.rbp_clean(p_label text, p_trucks text[]) returns void language sql as $f$
  insert into _till_clean (label, bad)
  select p_label, string_agg(z.k, ',') from (
    select 'order ' || o.order_key as k from public.orders o where o.truck_id = any (p_trucks) and o.xmin::text <> (pg_current_xact_id()::xid)::text
    union all select 'payment ' || p.id from public.order_payments p where p.truck_id = any (p_trucks) and p.xmin::text <> (pg_current_xact_id()::xid)::text) z $f$;`
}
/** pre-flight only: a probe on orders / order_payments that records any INSERT / UPDATE / DELETE issued from inside another trigger
 *  (pg_trigger_depth() > 1). An FK cascade's DELETE of a payment is the only nested write allowed. */
function tillProbe() {
  return `create temp table _till_nested (n serial primary key, tbl text, op text, depth integer);
create function public.rbp_till_probe_nested() returns trigger language plpgsql as $f$
begin
  if pg_trigger_depth() > 1 then insert into pg_temp._till_nested (tbl, op, depth) values (tg_table_name, tg_op, pg_trigger_depth()); end if;
  return case when tg_op = 'DELETE' then old else new end;
end $f$;
create trigger zz_rbp_probe_nested before insert or update or delete on public.orders for each row execute function public.rbp_till_probe_nested();
create trigger zz_rbp_probe_nested before insert or update or delete on public.order_payments for each row execute function public.rbp_till_probe_nested();`
}
const OLD_STYLE_LIT = JSON.stringify({ ...OLD_STYLE_ORDER, items: [{ name: 'Crêpe', quantity: 1, unit_price: 5 }], subtotal: 5, total: 5, total_minor: 500, food_minor: 500 })
const MIX_ITEMS = '[{"name":"Galette","quantity":2,"unit_price":7.50,"tax_rate_milli":10000},{"name":"Cidre","quantity":1,"unit_price":4.00,"tax_rate_milli":20000},{"name":"Pain","quantity":3,"unit_price":1.10,"tax_rate_milli":5500}]'
const MIX_DEALS = '[{"name":"Formule","price":12,"slots":{"main":"Crêpe","drink":"Cidre"},"slotModifiers":{"main":[{"name":"Oeuf","price":1.00}]},"tax_parts":[{"tax_rate_milli":10000,"minor":850},{"tax_rate_milli":20000,"minor":450}]}]'
const MIX_BD = '[{"rate_milli":5500,"food_minor":297,"gross_minor":297,"net_minor":282,"tax_minor":15},{"rate_milli":10000,"food_minor":2115,"gross_minor":2115,"net_minor":1923,"tax_minor":192},{"rate_milli":20000,"food_minor":765,"gross_minor":765,"net_minor":637,"tax_minor":128}]'

/** The proofs, first half (1–9). `ddl` adds the DDL-only ones (pre-flight only: the tables there are this transaction's own). */
function tillProofPart1(ddl) {
  const A = lit(TRUCKS.A), B = lit(TRUCKS.B), AB = `array[${A}, ${B}]`
  const clean = l => `perform pg_temp.rbp_clean(${lit(l)}, ${AB});`
  return `do $proof$
declare
  k_fn uuid; k_walk uuid; k_rep uuid; k_pro uuid; k_pp uuid; k_late uuid; k_old uuid; k_old2 uuid; k_new uuid; k_b uuid; k_off uuid;
  k_bl1 uuid; k_bl2 uuid; k_bl3 uuid; k_ff uuid; k_mix uuid; k_us uuid; k_leg uuid; k_or uuid; k_jp uuid; k_rc uuid; k_van uuid; k_web uuid; k_src uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; pf uuid; pb uuid; pbl uuid; p_old uuid; p_new uuid; p_old2 uuid; p_pp uuid; v_van uuid;
  c1 integer; c2 integer; c3 integer; n_ord integer; n_pay integer; e0 integer; n_id integer; aud uuid;
  st text; st2 text; st3 text; st4 text; st5 text; st6 text; s1 text; s2 text; ff text;
  v jsonb; v2 jsonb; vb jsonb; vb2 jsonb; d jsonb; x jsonb; y jsonb;
begin
  perform set_config('till.include_demo', 'on', true);

  -- ── 1 · the deployed insert paths: all succeed; an ACCEPTED insert is sealed at once (change 1), a PENDING one is not ──
  k_fn := ((public.place_order_atomic_v2(${lit(OLD_STYLE_LIT)}::jsonb, null, 'confirmed', null, ${A}, current_date, null)) ->> 'order_key')::uuid;
  k_walk := pg_temp.rbp_walkup(${A}, current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null);
  k_rep := gen_random_uuid();
  c1 := pg_temp.rbp_replay(${A}, k_rep); c2 := pg_temp.rbp_replay(${A}, k_rep);
  k_pro := pg_temp.rbp_promote(${A});
  perform pg_temp.rbp_ok('1 · the deployed place_order_atomic_v2 call, the walk-up insert, the offline replay upsert (inserted, then skipped) and the card promotion insert all succeed; the three ACCEPTED inserts are sealed at once (v1 accepted), the PENDING promotion is not',
    (select count(*) from public.orders where order_key in (k_fn, k_walk, k_rep, k_pro)) = 4 and c1 = 1 and c2 = 0
      and pg_temp.rbp_reasons(${A}, k_fn::text) = '1:accepted:accepted' and pg_temp.rbp_reasons(${A}, k_walk::text) = '1:accepted:accepted'
      and pg_temp.rbp_reasons(${A}, k_rep::text) = '1:accepted:accepted' and pg_temp.rbp_reasons(${A}, k_pro::text) = ''
      and (select count(*) from public.till_order_seals where order_key in (k_fn, k_walk, k_rep)) = 3 and not exists (select 1 from public.till_order_seals where order_key = k_pro),
    json_build_object('replay', array[c1, c2], 'fn', pg_temp.rbp_reasons(${A}, k_fn::text), 'walk', pg_temp.rbp_reasons(${A}, k_walk::text), 'rep', pg_temp.rbp_reasons(${A}, k_rep::text), 'pro', pg_temp.rbp_reasons(${A}, k_pro::text))::text);
  perform pg_temp.rbp_ok('18a · the truck''s chain begins with the till_start event (seq 1), then its identity entry (seq 2), before its first order',
    (select kind || ':' || ref from public.till_chain where truck_id = ${A} and seq = 1) = 'event:till_start'
      and (select kind || ':' || version from public.till_chain where truck_id = ${A} and seq = 2) = 'identity:1'
      and (select min(seq) from public.till_chain where truck_id = ${A} and kind = 'order') = 3,
    (select string_agg(seq || ':' || kind || ':' || ref, ', ' order by seq) from public.till_chain where truck_id = ${A} and seq <= 4));
  ${clean('1')}

  -- ── 2 · payments: each chains exactly one entry; collect = one payment entry plus the order version ──
  p1 := pg_temp.rbp_pay(k_fn, 'charge', 'in_person_other', 'card', 500, null);                       -- mark paid
  perform pg_temp.rbp_ok('2a · mark paid on an accepted (already sealed) order: one payment entry, no new order version', pg_temp.rbp_entries(${A}, 'payment', p1::text) = 1 and pg_temp.rbp_reasons(${A}, k_fn::text) = '1:accepted:accepted', pg_temp.rbp_reasons(${A}, k_fn::text));
  update public.orders set payment_status = 'paid', amount_paid = 5 where order_key = k_fn;           -- the ledger's cache write-back
  perform pg_temp.rbp_ok('2b · the payment cache write-back (payment_status, amount_paid) makes no version', pg_temp.rbp_reasons(${A}, k_fn::text) = '1:accepted:accepted', pg_temp.rbp_reasons(${A}, k_fn::text));
  p2 := pg_temp.rbp_pay(k_walk, 'charge', 'in_person_other', 'cash', 500, null);                    -- collect: the route books the payment first …
  update public.orders set status = 'collected', paid_at = now(), collected_at = now(), status_before_collected = 'confirmed' where order_key = k_walk;   -- … then the status
  perform pg_temp.rbp_ok('2c · collect: exactly one payment entry plus one order version (v2 state_change, collected)',
    pg_temp.rbp_entries(${A}, 'payment', p2::text) = 1 and pg_temp.rbp_reasons(${A}, k_walk::text) = '1:accepted:accepted,2:state_change:collected', pg_temp.rbp_reasons(${A}, k_walk::text));
  update public.orders set slot = '19:00', notes = 'pending note' where order_key = k_pro;            -- changes while pending
  c3 := (select count(*) from public.till_chain where truck_id = ${A} and ref = k_pro::text);
  update public.orders set status = 'confirmed' where order_key = k_pro;                            -- the truck accepts it
  p3 := pg_temp.rbp_pay(k_pro, 'charge', 'online', 'card', 500, 'pi_rbp_till_1');                   -- … and the capture follows (every capture site confirms first)
  perform pg_temp.rbp_ok('2d · a pending order stays UNSEALED through changes; accepting it seals v1 (accepted); the online charge then chains one payment entry and no version',
    c3 = 0 and pg_temp.rbp_reasons(${A}, k_pro::text) = '1:accepted:accepted' and pg_temp.rbp_entries(${A}, 'payment', p3::text) = 1, json_build_object('while_pending', c3, 'versions', pg_temp.rbp_reasons(${A}, k_pro::text))::text);
  p4 := pg_temp.rbp_pay(k_pro, 'refund', 'online', 'card', 500, 're_rbp_till_1');
  perform pg_temp.rbp_ok('2e · online refund: one payment entry, no new order version', pg_temp.rbp_entries(${A}, 'payment', p4::text) = 1 and pg_temp.rbp_reasons(${A}, k_pro::text) = '1:accepted:accepted', pg_temp.rbp_reasons(${A}, k_pro::text));
  update public.order_payments set application_fee_minor = 12 where id = p3 and application_fee_minor is null;
  perform pg_temp.rbp_ok('2f · the platform fee fill on a chained payment (not sealed) makes no entry and no guard event', pg_temp.rbp_entries(${A}, 'payment', p3::text) = 1 and pg_temp.rbp_events(${A}, p3::text) = '', pg_temp.rbp_events(${A}, p3::text));
  k_pp := pg_temp.rbp_promote(${A});
  p_pp := pg_temp.rbp_pay(k_pp, 'charge', 'in_person_other', 'cash', 500, null);
  perform pg_temp.rbp_ok('2g · a payment on a still-PENDING order (no code path does this today) seals it at that first payment (Q1), as pending',
    pg_temp.rbp_reasons(${A}, k_pp::text) = '1:first_payment:pending', pg_temp.rbp_reasons(${A}, k_pp::text));
  ${clean('2')}
${ddl ? `
  -- ── 3 · a forced failure (the chain table renamed, inside a savepoint): the payment and the accepted order still go in, the failures logged ──
  begin
    alter table public.till_chain rename to till_chain_forced_failure;
    pf := pg_temp.rbp_pay(k_rep, 'charge', 'in_person_other', 'cash', 500, null);
    k_ff := pg_temp.rbp_walkup(${A}, current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null);
    c1 := (select count(*) from public.order_payments where id = pf) + (select count(*) from public.orders where order_key = k_ff);
    st := (select sqlstate from public.till_failures where ref = pf::text order by id desc limit 1);
    ff := (select op || ':' || sqlstate from public.till_failures where ref = k_ff::text order by id desc limit 1);
    raise exception using errcode = 'RBP01', message = 'undo the forced failure';
  exception when sqlstate 'RBP01' then null;
  end;
  perform pg_temp.rbp_ok('3 · forced failure (till_chain renamed in a savepoint): the payment row AND the accepted walk-up are still INSERTED, and till_failures says why (42P01)', c1 = 2 and st = '42P01' and ff = 'order_insert_seal:42P01' and to_regclass('public.till_chain') is not null, json_build_object('rows', c1, 'payment', st, 'order', ff)::text);
` : ''}
  -- ── 4 · the deployed undo: DELETE the charge, then the status back — allowed, logged, and chained ──
  delete from public.order_payments where id = p2;
  update public.orders set status = 'confirmed', paid_at = null, collected_at = null where order_key = k_walk;
  perform pg_temp.rbp_ok('4 · the deployed undo (DELETE of the charge) still deletes; it is logged as a would-be refusal and chained as a deletion; the status back makes v3',
    not exists (select 1 from public.order_payments where id = p2) and pg_temp.rbp_events(${A}, p2::text) = 'would_refuse_delete' and pg_temp.rbp_entries(${A}, 'deletion', p2::text) = 1
      and pg_temp.rbp_reasons(${A}, k_walk::text) = '1:accepted:accepted,2:state_change:collected,3:state_change:accepted',
    json_build_object('events', pg_temp.rbp_events(${A}, p2::text), 'versions', pg_temp.rbp_reasons(${A}, k_walk::text))::text);
  ${clean('4')}

  -- ── 5 · edits: before the close → a version with its delta; after the close → a version AND a would-be refusal (observe never blocks) ──
  update public.orders set items = '[{"name":"Crêpe","quantity":2,"unit_price":5}]', subtotal = 10, total = 10, total_minor = 1000, food_minor = 1000 where order_key = k_fn;
  d := pg_temp.rbp_data(${A}, k_fn::text) -> 'delta';
  perform pg_temp.rbp_ok('5a · an edit before the day''s close makes version 2 (edit), with no guard event', pg_temp.rbp_reasons(${A}, k_fn::text) = '1:accepted:accepted,2:edit:accepted' and pg_temp.rbp_events(${A}, k_fn::text) = '', pg_temp.rbp_reasons(${A}, k_fn::text));
  perform pg_temp.rbp_ok('17a · its delta (change 5): minus the old line, plus the new one (each with its VAT figures); total_minor +500; per rate excl. VAT +454 and VAT +46; the six changed field names',
    (d ->> 'from_version')::int = 1 and jsonb_array_length(d -> 'minus' -> 'items') = 1 and jsonb_array_length(d -> 'plus' -> 'items') = 1
      and d -> 'minus' -> 'items' -> 0 ->> 'line_total_excl_vat_minor' = '455' and d -> 'plus' -> 'items' -> 0 ->> 'line_total_excl_vat_minor' = '909'
      and d -> 'amounts' -> 'total_minor' ->> 'change' = '500' and d -> 'vat' = '[{"vat_rate_milli": 10000, "excl_vat_minor": 454, "vat_minor": 46}]'::jsonb
      and d -> 'fields' = '["food_minor", "items", "subtotal", "total", "total_minor", "vat_summary"]'::jsonb and d -> 'minus' -> 'deals' = '[]'::jsonb,
    d::text);
  k_late := pg_temp.rbp_walkup(${A}, current_date - 3, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null);
  p5 := pg_temp.rbp_pay(k_late, 'charge', 'in_person_other', 'card', 500, null);
  perform pg_temp.rbp_set_items(k_late, '[{"name":"Crêpe","quantity":1,"unit_price":6}]');
  update public.orders set placed_at = clock_timestamp() where order_key = k_late and placed_at is null;   -- (now() would equal created_at in this one transaction)
  perform pg_temp.rbp_ok('5b · three days ago: the late payment is dated today (its order''s day is closed); an edit makes v2 edit_after_close AND logs would_refuse_after_close (allowed); the placed_at fill makes v3 with no guard event',
    pg_temp.rbp_reasons(${A}, k_late::text) = '1:accepted:accepted,2:edit_after_close:accepted,3:state_change_after_close:accepted'
      and pg_temp.rbp_events(${A}, k_late::text) = 'would_refuse_after_close'
      and (select (c.payload::jsonb ->> 'trading_day')::date from public.till_chain c where c.truck_id = ${A} and c.kind = 'payment' and c.ref = p5::text) = public.till_today(${A})
      and (select total from public.orders where order_key = k_late) = 6,
    json_build_object('versions', pg_temp.rbp_reasons(${A}, k_late::text), 'events', pg_temp.rbp_events(${A}, k_late::text))::text);
  ${clean('5')}

  -- ── 6 · retention, the line-notes move and account deletion write only unsealed fields: no version; till_verify stays true ──
  k_old := pg_temp.rbp_walkup(${A}, current_date, '[{"name":"Galette","quantity":1,"unit_price":6,"specialInstructions":"No onions — coeliac"}]', 'confirmed',
    'Rollback Proof Customer', 'rbp-customer@example.test', '+33600000001', 'gluten free please', null);
  p_old := pg_temp.rbp_pay(k_old, 'charge', 'in_person_other', 'cash', 600, null);
  update public.orders set customer_name = '', customer_email = null, customer_phone = null, notes = null,
    items = '[{"name":"Galette","quantity":1,"unit_price":6,"specialInstructions":""}]' where order_key = k_old;
  k_new := pg_temp.rbp_walkup(${A}, current_date, '[{"name":"Galette","quantity":1,"unit_price":6}]', 'confirmed', 'Rollback Proof Customer', null, '+33600000002', null,
    '{"v":1,"items":{"#0":{"at":3,"note":"No onions — coeliac"}}}');
  p_new := pg_temp.rbp_pay(k_new, 'charge', 'in_person_other', 'card', 600, null);
  update public.orders set customer_name = '', customer_phone = null, line_notes = '{"v":1,"items":{"#0":{"at":3,"note":""}}}' where order_key = k_new;
  k_old2 := pg_temp.rbp_walkup(${A}, current_date, '[{"name":"Galette","quantity":1,"unit_price":6,"specialInstructions":"No onions"}]', 'confirmed', 'Rollback Proof Customer', null, null, null, null);
  p_old2 := pg_temp.rbp_pay(k_old2, 'charge', 'in_person_other', 'card', 600, null);
  update public.orders set items = '[{"name":"Galette","quantity":1,"unit_price":6}]', line_notes = '{"v":1,"items":{"#0":{"at":3,"note":"No onions"}}}' where order_key = k_old2 and line_notes is null;
  update public.orders set customer_name = '[deleted]', customer_email = null, customer_phone = null, notes = null where order_key in (k_fn, k_old2);
  v := public.till_verify(${A});
  perform pg_temp.rbp_ok('6 · the retention patch (old-style: name, email, phone, note, dish note blanked inside items; new-style: line_notes blanked), the line-notes move and account deletion''s anonymisation + notes patch make NO version — and till_verify stays true',
    pg_temp.rbp_reasons(${A}, k_old::text) = '1:accepted:accepted' and pg_temp.rbp_reasons(${A}, k_new::text) = '1:accepted:accepted'
      and pg_temp.rbp_reasons(${A}, k_old2::text) = '1:accepted:accepted' and pg_temp.rbp_reasons(${A}, k_fn::text) = '1:accepted:accepted,2:edit:accepted'
      and (v ->> 'ok')::boolean,
    v::text);
  ${clean('6')}

  -- ── 7 · kitchen moves: cooking, ready, back to confirmed, a slot, a buzzer — no version ──
  update public.orders set status = 'cooking' where order_key = k_fn;
  update public.orders set status = 'ready' where order_key = k_fn;
  update public.orders set status = 'confirmed', slot = '18:30', buzzer_number = 7 where order_key = k_fn;
  perform pg_temp.rbp_ok('7 · kitchen status moves (cooking, ready, back), a slot change and a buzzer make no version', pg_temp.rbp_reasons(${A}, k_fn::text) = '1:accepted:accepted,2:edit:accepted', pg_temp.rbp_reasons(${A}, k_fn::text));
  ${clean('7')}

  -- ── 8 · demo trucks outside the till (the default): nothing chained or logged; their deletes and cascades go through as today ──
  perform set_config('till.include_demo', '', true);
  e0 := (select count(*) from public.till_guard_events);
  k_b := pg_temp.rbp_walkup(${B}, current_date, '[{"name":"Burger","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null);
  pb := pg_temp.rbp_pay(k_b, 'charge', 'in_person_other', 'cash', 500, null);
  update public.orders set status = 'collected', collected_at = now() where order_key = k_b;
  delete from public.orders where order_key = k_b;                                                    -- deleteTruckCascade deletes orders first; payments cascade
  k_off := pg_temp.rbp_walkup(${A}, current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null);
  update public.orders set status = 'collected', collected_at = now() where order_key = k_off;        -- truck A, now outside the till again
  perform pg_temp.rbp_ok('8 · demo trucks are skipped by default: an insert, a payment, a collect and an order delete (its payment cascading) on demo trucks chain nothing, log nothing, and succeed',
    not exists (select 1 from public.till_chain where truck_id = ${B}) and not exists (select 1 from public.orders where order_key = k_b)
      and not exists (select 1 from public.order_payments where id = pb) and (select count(*) from public.till_guard_events) = e0
      and pg_temp.rbp_reasons(${A}, k_off::text) = '' and not exists (select 1 from public.till_order_seals where order_key = k_off),
    json_build_object('b_chain', (select count(*) from public.till_chain where truck_id = ${B}), 'events', (select count(*) from public.till_guard_events) - e0)::text);
  perform set_config('till.include_demo', 'on', true);
  delete from public.orders where order_key = k_old;                                                  -- a sealed order and its payment (cascade), till on
  v := public.till_verify(${A});
  perform pg_temp.rbp_ok('8b · with the till on, deleting a sealed order (its payment cascading) is ALLOWED in observe mode, logged for both rows, chained as two deletions, its seal state marked deleted — and till_verify stays true',
    not exists (select 1 from public.orders where order_key = k_old) and pg_temp.rbp_events(${A}, k_old::text) = 'would_refuse_delete' and pg_temp.rbp_events(${A}, p_old::text) = 'would_refuse_delete'
      and pg_temp.rbp_entries(${A}, 'deletion', k_old::text) = 1 and pg_temp.rbp_entries(${A}, 'deletion', p_old::text) = 1
      and (select deleted_at is not null from public.till_order_seals where order_key = k_old) and (v ->> 'ok')::boolean,
    v::text);
  ${clean('8')}

  -- ── 9 · append-only: till_chain and action_audit_log refuse UPDATE and DELETE${ddl ? ' (and TRUNCATE)' : ''}; an audit INSERT still works ──
  begin update public.till_chain set ref = ref where truck_id = ${A}; st := 'allowed'; exception when others then st := sqlstate; end;
  begin delete from public.till_chain where truck_id = ${A}; st2 := 'allowed'; exception when others then st2 := sqlstate; end;
  insert into public.action_audit_log (action, truck_id, order_key, actor_kind, source) values ('till_pack_1_proof', ${A}, k_fn, 'system', 'system') returning id into aud;
  begin update public.action_audit_log set action = 'changed' where id = aud; st3 := 'allowed'; exception when others then st3 := sqlstate; end;
  begin delete from public.action_audit_log where id = aud; st4 := 'allowed'; exception when others then st4 := sqlstate; end;
${ddl ? `  begin truncate public.till_chain; st5 := 'allowed'; exception when others then st5 := sqlstate; end;
  begin truncate public.action_audit_log; st6 := 'allowed'; exception when others then st6 := sqlstate; end;` : `  st5 := 'HGT01'; st6 := 'HGT01';`}
  perform pg_temp.rbp_ok('9 · UPDATE / DELETE${ddl ? ' / TRUNCATE' : ''} on till_chain and action_audit_log are refused (HGT01); an INSERT into action_audit_log works',
    st = 'HGT01' and st2 = 'HGT01' and st3 = 'HGT01' and st4 = 'HGT01' and st5 = 'HGT01' and st6 = 'HGT01' and exists (select 1 from public.action_audit_log where id = aud),
    json_build_object('chain_update', st, 'chain_delete', st2, 'audit_update', st3, 'audit_delete', st4, 'chain_truncate', st5, 'audit_truncate', st6)::text);
`
}

/** A sealed order's VAT, as one comparable value: basis, item triples [rate, price, excl], deal parts, summary [rate, food, excl, vat]. */
function tillHelpersVat() {
  return `create function pg_temp.rbp_vatsig(x jsonb) returns jsonb language sql as $f$
  select jsonb_build_object('b', x -> 'vat_basis',
    'i', coalesce((select jsonb_agg(jsonb_build_array(t.e -> 'vat_rate_milli', t.e -> 'line_price_minor', t.e -> 'line_total_excl_vat_minor') order by t.n)
                     from jsonb_array_elements(case when jsonb_typeof(x -> 'items') = 'array' then x -> 'items' else '[]'::jsonb end) with ordinality t(e, n)), '[]'::jsonb),
    'd', coalesce((select jsonb_agg((select coalesce(jsonb_agg(jsonb_build_array(u.e -> 'vat_rate_milli', u.e -> 'line_price_minor', u.e -> 'line_total_excl_vat_minor') order by u.n), '[]'::jsonb)
                                       from jsonb_array_elements(t.e -> 'vat_parts') with ordinality u(e, n)) order by t.n)
                     from jsonb_array_elements(case when jsonb_typeof(x -> 'deals') = 'array' then x -> 'deals' else '[]'::jsonb end) with ordinality t(e, n)), '[]'::jsonb),
    's', coalesce((select jsonb_agg(jsonb_build_array(t.e -> 'vat_rate_milli', t.e -> 'food_minor', t.e -> 'excl_vat_minor', t.e -> 'vat_minor') order by t.n)
                     from jsonb_array_elements(x -> 'vat_summary') with ordinality t(e, n)), '[]'::jsonb)) $f$;`
}
/** The proofs, second half (10–19, then 13 at the very end). */
function tillProofPart2(ddl) {
  const A = lit(TRUCKS.A), B = lit(TRUCKS.B), AB = `array[${A}, ${B}]`
  const clean = l => `perform pg_temp.rbp_clean(${lit(l)}, ${AB});`
  const crepe = `'[{"name":"Crêpe","quantity":1,"unit_price":5}]'`
  return `
  -- ── 10 · the baseline (built, not run on live data): seals what was there before, once — writing TILL TABLES ONLY ──
  perform set_config('till.include_demo', '', true);
  k_bl1 := pg_temp.rbp_walkup(${A}, current_date - 1, ${crepe}, 'ready', 'rollback proof', null, null, null, null);
  k_bl2 := pg_temp.rbp_walkup(${A}, current_date - 1, ${crepe}, 'collected', 'rollback proof', null, null, null, null);
  pbl := pg_temp.rbp_pay(k_bl2, 'charge', 'in_person_other', 'cash', 500, null);
  k_bl3 := pg_temp.rbp_promote(${A});
  perform set_config('till.include_demo', 'on', true);
  n_ord := (select count(*) from public.orders o where o.truck_id = ${A} and public.till_fiscal_state(o.status) <> 'pending' and not exists (select 1 from public.till_order_seals s where s.order_key = o.order_key));
  n_pay := (select count(*) from public.order_payments p where p.truck_id = ${A} and not exists (select 1 from public.till_chain c where c.truck_id = ${A} and c.kind = 'payment' and c.ref = p.id::text));
  s1 := pg_temp.rbp_snap(${AB});
  vb := public.till_baseline(${A});
  s2 := pg_temp.rbp_snap(${AB});
  vb2 := public.till_baseline(${A});
  v := public.till_verify(${A});
  perform pg_temp.rbp_ok('10 · till_baseline(truck) seals every unsealed non-pending order and chains every unchained payment once (reason baseline); a pending order stays unsealed; a second run does nothing; till_verify is true with nothing left unsealed',
    (vb ->> 'orders_sealed')::int = n_ord and (vb ->> 'payments_chained')::int = n_pay and n_ord >= 3 and n_pay >= 1
      and (vb2 ->> 'orders_sealed')::int = 0 and (vb2 ->> 'payments_chained')::int = 0 and pg_temp.rbp_reasons(${A}, k_bl2::text) = '1:baseline:collected'
      and pg_temp.rbp_reasons(${A}, k_bl3::text) = '' and (v ->> 'ok')::boolean and (v ->> 'unsealed_orders')::int = 0 and (v ->> 'unchained_payments')::int = 0,
    json_build_object('expected', array[n_ord, n_pay], 'first', vb, 'second', vb2, 'verify', v)::text);
  perform pg_temp.rbp_ok('19a · the baseline wrote NO order or payment row: every row of both trucks has the same ctid, xmin and updated_at before and after it (so no realtime event either)',
    s1 = s2 and length(s1) > 100, json_build_object('before', left(s1, 300), 'after', left(s2, 300))::text);
  ${clean('10')}
${ddl ? `
  -- ── 11 · tamper: a sealed field changed with the guard switched off (inside a savepoint) — till_verify catches it ──
  begin
    alter table public.orders disable trigger orders_till_guard;
    update public.orders set total = total + 1 where order_key = k_fn;
    alter table public.orders enable trigger orders_till_guard;
    v2 := public.till_verify(${A});
    raise exception using errcode = 'RBP02', message = 'undo the tamper';
  exception when sqlstate 'RBP02' then null;
  end;
  perform pg_temp.rbp_ok('11 · a sealed field changed behind the guard''s back is caught: till_verify false, "row differs from its sealed form"',
    not (v2 ->> 'ok')::boolean and exists (select 1 from jsonb_array_elements(v2 -> 'mismatches') m where m ->> 'problem' = 'row differs from its sealed form' and m ->> 'ref' = k_fn::text)
      and (public.till_verify(${A}) ->> 'ok')::boolean,
    v2::text);
` : ''}
  -- ── 14 · change 2: every line carries its VAT rate and its total excluding VAT, reconciling to the order to the minor unit ──
  k_mix := pg_temp.rbp_full(${A}, 'confirmed', 'web', null, 'EUR', ${lit(MIX_ITEMS)}, ${lit(MIX_DEALS)}, 35.30, 3.53, 31.77, 3177, 3177, 0, 10000, true, ${lit(MIX_BD)}, 0, 0);
  x := pg_temp.rbp_data(${A}, k_mix::text) -> 'data';
  perform pg_temp.rbp_ok('14a · a mixed-rate French order (5.5 %, 10 %, 20 %; a deal split 10 % / 20 % by the VAT engine; a 10 % discount): basis breakdown; Galette 1227, Cidre 300, Pain 282, the deal''s parts 696 + 337 excl. VAT; per rate 282 / 1923 / 637 + VAT 15 / 192 / 128 = the food 3177',
    pg_temp.rbp_vatsig(x) = '{"b": "breakdown", "i": [[10000, 1500, 1227], [20000, 400, 300], [5500, 330, 282]], "d": [[[10000, 850, 696], [20000, 450, 337]]], "s": [[5500, 297, 282, 15], [10000, 2115, 1923, 192], [20000, 765, 637, 128]]}'::jsonb
      and public.till_vat_reconciles(x), pg_temp.rbp_vatsig(x)::text);
  k_us := pg_temp.rbp_full(${A}, 'confirmed', 'web', null, 'USD', '[{"name":"Burger","quantity":2,"unit_price":8.00,"tax_rate_milli":6625}]', null, 16.00, 0, 20.06, 2006, 1600, 106, 6625, false,
    '[{"rate_milli":6625,"food_minor":1600,"gross_minor":1706,"net_minor":1600,"tax_minor":106}]', 200, 100);
  k_leg := pg_temp.rbp_full(${A}, 'confirmed', 'manual', null, 'GBP', '[{"name":"Fish","quantity":1,"unit_price":9.00}]',
    '[{"name":"Combo","price":6.50,"slots":{"main":"Fish"},"slotModifiers":{"main":[{"name":"Peas","price":0.50}]}}]', 16.00, 0, 16.00, 1600, null, 0, null, null, null, 0, 0);
  k_or := pg_temp.rbp_full(${A}, 'confirmed', 'web', null, 'GBP', '[{"name":"Pie","quantity":1,"unit_price":12.00}]', null, 12.00, 0, 12.00, 1200, 1200, 0, 20000, true, null, 0, 0);
  k_jp := pg_temp.rbp_full(${A}, 'confirmed', 'web', null, 'JPY', '[{"name":"Ramen","quantity":1,"unit_price":1500}]', null, 1500, 0, 1500, 1500, 1500, 0, 10000, true, null, 0, 0);
  k_rc := pg_temp.rbp_full(${A}, 'confirmed', 'web', null, 'EUR', '[{"name":"Crêpe","quantity":1,"unit_price":5,"tax_rate_milli":10000}]', null, 5, 0, 5, 500, 500, 0, 10000, true,
    '[{"rate_milli":5500,"food_minor":500,"gross_minor":500,"net_minor":474,"tax_minor":26}]', 0, 0);
  perform pg_temp.rbp_ok('14b · VAT added (US, 6.625 %, a tip and a service fee): excl = food 1600, VAT 106 = tax_minor, total 2006; a pre-charge-columns order (legacy, no rate) with an old deal (no split): Fish 900 + Combo 700 = (subtotal − discount); one older rate on the order (20 % included): 1000 + 200; JPY (no decimals): 1364 + 136; a breakdown that does not match the lines: recomputed, 455 + 45 — every one reconciling',
    pg_temp.rbp_vatsig(pg_temp.rbp_data(${A}, k_us::text) -> 'data') = '{"b": "breakdown", "i": [[6625, 1600, 1600]], "d": [], "s": [[6625, 1600, 1600, 106]]}'::jsonb
      and pg_temp.rbp_vatsig(pg_temp.rbp_data(${A}, k_leg::text) -> 'data') = '{"b": "legacy", "i": [[null, 900, 900]], "d": [[[null, 700, 700]]], "s": [[null, 1600, 1600, 0]]}'::jsonb
      and pg_temp.rbp_vatsig(pg_temp.rbp_data(${A}, k_or::text) -> 'data') = '{"b": "order_rate", "i": [[20000, 1200, 1000]], "d": [], "s": [[20000, 1200, 1000, 200]]}'::jsonb
      and pg_temp.rbp_vatsig(pg_temp.rbp_data(${A}, k_jp::text) -> 'data') = '{"b": "order_rate", "i": [[10000, 1500, 1364]], "d": [], "s": [[10000, 1500, 1364, 136]]}'::jsonb
      and pg_temp.rbp_vatsig(pg_temp.rbp_data(${A}, k_rc::text) -> 'data') = '{"b": "recomputed", "i": [[10000, 500, 455]], "d": [], "s": [[10000, 500, 455, 45]]}'::jsonb
      and (select bool_and(public.till_vat_reconciles(pg_temp.rbp_data(${A}, k::text) -> 'data')) from unnest(array[k_us, k_leg, k_or, k_jp, k_rc]) k),
    (select string_agg(pg_temp.rbp_vatsig(pg_temp.rbp_data(${A}, k::text) -> 'data')::text, ' | ') from unnest(array[k_us, k_leg, k_or, k_jp, k_rc]) k));
  perform pg_temp.rbp_ok('14c · the check is real: one line''s excl. VAT +1, or the order''s total +1, no longer reconciles',
    not public.till_vat_reconciles(jsonb_set(x, '{items,0,line_total_excl_vat_minor}', '1228'::jsonb)) and not public.till_vat_reconciles(jsonb_set(x, '{total_minor}', '3178'::jsonb))
      and not public.till_vat_reconciles(jsonb_set(x, '{deals,0,vat_parts,1,vat_rate_milli}', '5500'::jsonb)), null);
  ${clean('14')}

  -- ── 15 · change 3: a till number on every version — the van, else 'web' for an online order, else the recorded source ──
  v_van := (select v.id from public.truck_vans v where v.truck_id = ${A} order by v.created_at nulls last, v.id limit 1);
  k_van := pg_temp.rbp_full(${A}, 'confirmed', 'web', v_van, 'EUR', ${crepe}, null, 5, 0, 5, 500, 500, 0, 10000, true, null, 0, 0);
  k_web := pg_temp.rbp_full(${A}, 'confirmed', 'web', null, 'EUR', ${crepe}, null, 5, 0, 5, 500, 500, 0, 10000, true, null, 0, 0);
  k_src := pg_temp.rbp_full(${A}, 'confirmed', null, null, 'EUR', ${crepe}, null, 5, 0, 5, 500, 500, 0, 10000, true, null, 0, 0);
  perform pg_temp.rbp_ok('15 · till_id: the van''s id for an order with a van; ''web'' for an online order without one; ''manual'' for a walk-up; ''unrecorded'' when even the source is empty — and no order version anywhere without one',
    v_van is not null and pg_temp.rbp_data(${A}, k_van::text) -> 'data' ->> 'till_id' = v_van::text and pg_temp.rbp_data(${A}, k_web::text) -> 'data' ->> 'till_id' = 'web'
      and pg_temp.rbp_data(${A}, k_walk::text) -> 'data' ->> 'till_id' = 'manual' and pg_temp.rbp_data(${A}, k_src::text) -> 'data' ->> 'till_id' = 'unrecorded'
      and not exists (select 1 from public.till_chain c where c.truck_id = ${A} and c.kind = 'order' and coalesce(c.payload::jsonb -> 'data' ->> 'till_id', '') = ''),
    json_build_object('van', v_van, 'got', array[pg_temp.rbp_data(${A}, k_van::text) -> 'data' ->> 'till_id', pg_temp.rbp_data(${A}, k_web::text) -> 'data' ->> 'till_id',
      pg_temp.rbp_data(${A}, k_walk::text) -> 'data' ->> 'till_id', pg_temp.rbp_data(${A}, k_src::text) -> 'data' ->> 'till_id'])::text);
  ${clean('15')}

  -- ── 16 · change 4: identity entries — at the first sealed entry, and AT ONCE when the receipt details change; versions name the one in force ──
  n_id := (select count(*) from public.till_chain where truck_id = ${A} and kind = 'identity');
  s1 := pg_temp.rbp_snap(${AB});
  update public.trucks set legal_name = 'Rollback Proof SARL', registered_address = '{"address":"1 rue du Test","town":"Paris","postcode":"75001","floor":"2"}'::jsonb,
    registration_number = '73282932000074', vat_number = 'FR44732829320', vat_regime = 'reel_simplifie' where id = ${A};
  s2 := pg_temp.rbp_snap(${AB});
  y := (select c.payload::jsonb from public.till_chain c where c.truck_id = ${A} and c.kind = 'identity' order by c.seq desc limit 1);
  update public.trucks set legal_name = legal_name, timezone = timezone where id = ${A};               -- nothing really changed
  c1 := (select count(*) from public.till_chain where truck_id = ${A} and kind = 'identity');
  perform pg_temp.rbp_set_items(k_walk, '[{"name":"Crêpe","quantity":3,"unit_price":5}]');
  x := pg_temp.rbp_data(${A}, k_walk::text);
  perform pg_temp.rbp_ok('16 · the identity: one entry before the first order; a change of the receipt details writes identity v2 at once (whitelisted: legal name, address — its unknown key named only — SIRET, VAT number, regime); a non-change writes nothing; the next order version names identity v2 {seq, hash}; no order or payment row touched',
    n_id = 1 and c1 = 2 and s1 = s2 and (y ->> 'version')::int = 2 and y ->> 'reason' = 'changed'
      and y -> 'data' = '{"legal_name": "Rollback Proof SARL", "registered_address": {"address": "1 rue du Test", "town": "Paris", "postcode": "75001", "_other_keys": ["floor"]}, "registration_number": "73282932000074", "vat_number": "FR44732829320", "vat_regime": "reel_simplifie"}'::jsonb
      and x -> 'identity' = (select jsonb_build_object('seq', c.seq, 'hash', c.hash) from public.till_chain c where c.truck_id = ${A} and c.kind = 'identity' and c.version = 2)
      and pg_temp.rbp_reasons(${A}, k_walk::text) like '%,4:edit:accepted',
    json_build_object('before', n_id, 'after', c1, 'identity', y -> 'data', 'ref', x -> 'identity')::text);
  ${clean('16')}

  -- ── 17 · change 5: every version after the first carries its delta, the first none (and till_verify recomputes each one) ──
  perform pg_temp.rbp_ok('17b · every order version 2+ carries a plus/minus delta, every version 1 none',
    (select count(*) from public.till_chain c where c.truck_id = ${A} and c.kind = 'order' and ((c.version = 1) = ((c.payload::jsonb -> 'delta') <> 'null'::jsonb))) = 0
      and (select count(*) from public.till_chain c where c.truck_id = ${A} and c.kind = 'order' and c.version > 1) >= 6,
    (select count(*) from public.till_chain c where c.truck_id = ${A} and c.kind = 'order' and c.version > 1)::text);

  -- ── 18 · change 6: the 'event' kind — only its known types; till_start once, at seq 1 ──
  begin
    perform public.till_write(${A}, 'event', 'bogus', null, 'proof', current_date, '{}'::jsonb, null, null);
    st := 'allowed';
  exception when others then st := sqlstate;
  end;
  perform pg_temp.rbp_ok('18b · an event of an unknown type is refused by the chain''s check (23514); till_start is written once per truck, at seq 1',
    st = '23514' and (select count(*) from public.till_chain where truck_id = ${A} and kind = 'event' and ref = 'till_start') = 1
      and (select seq from public.till_chain where truck_id = ${A} and kind = 'event' and ref = 'till_start') = 1, st);

  -- ── 12 · no personal data, note or free text in any payload; canonical text independent of key order ──
  perform pg_temp.rbp_ok('12a · no payload holds a customer name, email, phone, order note, dish note, line note, staff note or staff id — values or keys',
    not exists (select 1 from public.till_chain c where c.truck_id = ${A} and (c.payload ~* '(Rollback Proof Customer|rbp-customer@|\\+3360000000|No onions|coeliac|gluten|pending note|staff note|rbp-staff-user|rbp:)'
      or c.payload ~ '"(customer_name|customer_email|customer_phone|notes|line_notes|table_ref|cancellation_reason|rejection_reason|note|created_by|idempotency_key|specialInstructions|slotNotes)"')),
    (select string_agg(left(c.payload, 120), ' | ') from public.till_chain c where c.truck_id = ${A} and c.payload ~* '(Rollback Proof Customer|No onions|gluten|staff note)'));
  s1 := public.till_sealed_lines('[{"quantity":1,"name":"x","unit_price":2.50,"colour":"red","specialInstructions":"no"}]', 'item')::text;
  s2 := public.till_sealed_lines('[{"specialInstructions":"no","colour":"red","unit_price":2.50,"name":"x","quantity":1}]', 'item')::text;
  perform pg_temp.rbp_ok('12b · the canonical text does not depend on the order keys were written in; an unknown key is named (not its value); the note key leaves no trace; 2.50 stays 2.50',
    s1 = s2 and s1 = '[{"name": "x", "quantity": 1, "unit_price": 2.50, "_other_keys": ["colour"]}]', s1 || ' / ' || s2);
  ${clean('12')}

  -- ── 19 · change 1: no till trigger wrote an order or payment row, at any step ──
  perform pg_temp.rbp_ok('19b · after every step, every order and payment row of both trucks carries this transaction''s own xid — none was written inside a till trigger''s subtransaction',
    (select count(*) from _till_clean) >= 12 and not exists (select 1 from _till_clean where bad is not null),
    (select string_agg(label || ': ' || coalesce(bad, '-'), ' | ') from _till_clean));
${ddl ? `  perform pg_temp.rbp_ok('19c · the probe trigger saw no INSERT or UPDATE of orders / order_payments issued from inside another trigger (only the FK cascade''s payment DELETEs)',
    not exists (select 1 from _till_nested where op <> 'DELETE' or tbl <> 'order_payments') and exists (select 1 from _till_nested),
    (select string_agg(tbl || ':' || op || ':' || depth, ', ') from _till_nested));
` : ''}
  -- ── 13 · the chain at the end: verified in every respect ──
  v := public.till_verify(${A});
  perform pg_temp.rbp_ok('13 · till_verify(truck A) at the end: ok — gap-free, every link and hash right, the head matches, seq 1 till_start, every identity reference, version, delta, till_id and VAT reconciliation right (one recomputed basis, the proof''s own)',
    (v ->> 'ok')::boolean and (v ->> 'gaps')::int = 0 and (v ->> 'bad_links')::int = 0 and (v ->> 'bad_hashes')::int = 0 and (v ->> 'bad_payload_hashes')::int = 0
      and (v ->> 'head_ok')::boolean and (v ->> 'structure')::int = 0 and (v ->> 'bad_identity_refs')::int = 0 and (v ->> 'bad_versions')::int = 0
      and (v ->> 'bad_deltas')::int = 0 and (v ->> 'no_till_id')::int = 0 and (v ->> 'unreconciled')::int = 0 and (v ->> 'vat_recomputed')::int = 1, v::text);
end
$proof$`
}
const tillProofBlock = ddl => tillProofPart1(ddl) + tillProofPart2(ddl)
const SIX = "'till_settings','till_chain','till_chain_heads','till_order_seals','till_failures','till_guard_events'"
/** Grants, RLS, the triggers' timing and the untouched function — read in the same transaction. */
const TILL_STATIC = `select
  (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in (${SIX})) as rls_on,
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in (${SIX}))::int as tables,
  has_table_privilege('anon', 'public.till_chain', 'SELECT') or has_table_privilege('authenticated', 'public.till_chain', 'SELECT')
    or has_table_privilege('anon', 'public.till_order_seals', 'SELECT') or has_table_privilege('authenticated', 'public.till_order_seals', 'SELECT') as api_reads,
  (select bool_or(has_table_privilege('service_role', t, p)) from unnest(array['public.till_chain', 'public.till_chain_heads', 'public.till_order_seals']) t, unnest(array['INSERT', 'UPDATE', 'DELETE']) p) as service_writes,
  has_table_privilege('service_role', 'public.action_audit_log', 'UPDATE') or has_table_privilege('service_role', 'public.action_audit_log', 'DELETE') as service_changes_audit,
  has_table_privilege('service_role', 'public.action_audit_log', 'INSERT') as service_inserts_audit,
  has_function_privilege('anon', 'public.till_append(text,text,text,integer,text,date,jsonb,jsonb)', 'EXECUTE') or has_function_privilege('service_role', 'public.till_append(text,text,text,integer,text,date,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.till_write(text,text,text,integer,text,date,jsonb,jsonb,jsonb)', 'EXECUTE') or has_function_privilege('service_role', 'public.till_seal(uuid,text)', 'EXECUTE') as api_appends,
  has_function_privilege('service_role', 'public.till_baseline(text)', 'EXECUTE') as service_baseline,
  has_function_privilege('service_role', 'public.till_verify(text)', 'EXECUTE') and not has_function_privilege('anon', 'public.till_verify(text)', 'EXECUTE') as verify_service_only,
  (select guard_mode from public.till_settings) as guard_mode, (select software_version from public.till_settings) as software_version,
  md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('orders', 'order_payments') and column_name like 'seal%')::int as seal_columns,
  (select string_agg(c.relname || '.' || t.tgname || ':' || case when (t.tgtype & 2) = 2 then 'before' else 'after' end, ',' order by c.relname, t.tgname)
     from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and t.tgname like '%till%' and c.relname in ('orders', 'order_payments', 'trucks')) as till_triggers`
const AFTER_TRIGGERS = 'order_payments.order_payments_till_chain:after,order_payments.order_payments_till_guard:after,order_payments.order_payments_till_guard_delete:after,orders.orders_till_guard:after,orders.orders_till_guard_delete:after,orders.orders_till_seal:after,trucks.trucks_till_identity:after'
function checkStatic(s) {
  ok('S1 · the six till tables exist with RLS on (till_order_seals among them)', s.tables === 6 && s.rls_on === true, s)
  ok('S2 · anon / authenticated cannot read till_chain or till_order_seals; the service role cannot INSERT, UPDATE or DELETE the chain, the heads or the seals', s.api_reads === false && s.service_writes === false, s)
  ok('S3 · the service role can no longer UPDATE or DELETE action_audit_log, and can still INSERT', s.service_changes_audit === false && s.service_inserts_audit === true, s)
  ok('S4 · nobody on the API can call till_append, till_write, till_seal or till_baseline; till_verify is the service role\'s only', s.api_appends === false && s.service_baseline === false && s.verify_service_only === true, s)
  ok('S5 · guard_mode observe, software_version 0.x', s.guard_mode === 'observe' && /^0\.\d+\.\d+$/.test(s.software_version), s)
  ok('S6 · place_order_atomic_v2 untouched: md5 e4b273abcf8e7609c6ca54033ed59332', s.v2_md5 === 'e4b273abcf8e7609c6ca54033ed59332', s.v2_md5)
  ok('S7 · no seal column on orders or order_payments (the seal state lives in till_order_seals)', s.seal_columns === 0, s.seal_columns)
  ok('S8 · every till trigger on orders, order_payments and trucks is an AFTER trigger (it cannot change the row) — the seven of them', s.till_triggers === AFTER_TRIGGERS, s.till_triggers)
}
/** Right after the migration body (pre-flight): rows of these tables written by this transaction so far — the migration's own writes. */
const TILL_WROTE = `select (select count(*) from public.orders where xmin::text = (pg_current_xact_id()::xid)::text)::int as orders,
  (select count(*) from public.order_payments where xmin::text = (pg_current_xact_id()::xid)::text)::int as order_payments,
  (select count(*) from public.action_audit_log where xmin::text = (pg_current_xact_id()::xid)::text)::int as action_audit_log,
  (select count(*) from public.trucks where xmin::text = (pg_current_xact_id()::xid)::text)::int as trucks`
async function tillExport(c, tag, mode) {
  await q(c, tag, "set local timezone = 'UTC'")
  const chain = (await q(c, tag, 'select truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version from public.till_chain where truck_id = $1 order by seq', [TRUCKS.A])).rows
  const orders = (await q(c, tag, 'select row_to_json(o)::text as row, public.till_sealed_order(o)::text as sealed from public.orders o where o.truck_id = $1 order by o.created_at, o.order_key', [TRUCKS.A])).rows
  const payments = (await q(c, tag, 'select row_to_json(p)::text as row, public.till_sealed_payment(p)::text as sealed from public.order_payments p where p.truck_id = $1 order by p.created_at, p.id', [TRUCKS.A])).rows
  fs.mkdirSync(TILL_OUT, { recursive: true })
  fs.writeFileSync(path.join(TILL_OUT, `chain-${mode}.jsonl`), chain.map(r => JSON.stringify({ ...r, seq: Number(r.seq) })).join('\n') + '\n')
  fs.writeFileSync(path.join(TILL_OUT, `rows-${mode}.json`), JSON.stringify({ truck_id: TRUCKS.A, note: 'demo truck rows inside a rolled-back transaction (row_to_json text, TimeZone UTC) and the sealed form the database computed for each', orders, payments }, null, 1) + '\n')
  say(`  exported ${chain.length} chain entries, ${orders.length} orders and ${payments.length} payments to docs/till-pack-1/chain-${mode}.jsonl / rows-${mode}.json`)
}
async function tillCounts(label) {
  const base = await counts(label)
  const extra = await inRollback(`till-counts-${label}`, async c => {
    await q(c, `till-counts-${label}`, 'set transaction read only')
    const has = (await q(c, `till-counts-${label}`, "select to_regclass('public.till_chain') is not null as has")).rows[0].has
    if (!has) return { till: 'not applied' }
    return (await q(c, `till-counts-${label}`, `select (select count(*) from public.till_chain where truck_id = any($1))::int as till_chain,
        (select count(*) from public.till_chain_heads where truck_id = any($1))::int as till_heads,
        (select count(*) from public.till_order_seals where truck_id = any($1))::int as till_seals,
        (select count(*) from public.till_failures where truck_id = any($1))::int as till_failures,
        (select count(*) from public.till_guard_events where truck_id = any($1))::int as till_guard_events`, [IDS])).rows[0]
  })
  const row = { ...base, ...extra }
  say(`  till counts ${label}: ${JSON.stringify(extra)}`)
  return row
}
async function tillProofs(file) {
  let body = null
  if (file) {
    const rel = path.relative(REPO, path.resolve(REPO, file)).split(path.sep).join('/')
    if (!/^supabase\/migrations\/[^/]+\.sql$/.test(rel)) die(`${rel} is not a migration file`)
    body = fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/--[^\n]*/g, '').replace(/^\s*set lock_timeout[^;]*;/im, '').replace(/^\s*begin;\s*$/im, '').replace(/^\s*commit;\s*$/im, '').replace(/^\s*notify pgrst[^;]*;/im, '')
    if (/^\s*(begin|commit|rollback)\s*;/im.test(body) || /\bcommit\b/i.test(body)) die('the migration body still has a transaction statement after stripping')
    say(`\n══ PRE-FLIGHT — ${rel} inside ONE transaction that is ROLLED BACK ══`)
  } else say('\n══ THE TILL CHAIN, LIVE — every transaction ROLLED BACK ══')
  const mode = file ? 'preflight' : 'check'
  const before = await tillCounts('before')
  const tag = file ? 'preflight' : 'till'
  await inRollback(tag, async c => {
    await guard(c)
    const t0 = Date.now()
    let wrote = null
    if (body) {
      await q(c, tag, body)
      wrote = (await q(c, tag, TILL_WROTE)).rows[0]
    }
    await q(c, tag, tillHelpers() + '\n' + tillHelpersVat() + (body ? '\n' + tillProbe() : ''))
    await q(c, tag, tillProofBlock(!!file))
    const held = Date.now() - t0
    for (const r of (await q(c, tag, 'select label, ok, detail from _till_proof order by n')).rows) ok(r.label, r.ok, r.ok ? undefined : r.detail)
    if (wrote) ok('S9 · the migration itself wrote NO row of orders, order_payments, action_audit_log or trucks (no row carries this transaction\'s xid after it)', Object.values(wrote).every(n => n === 0), wrote)
    checkStatic((await q(c, tag, TILL_STATIC)).rows[0])
    await tillExport(c, tag, mode)
    say(`  ${body ? 'the migration and ' : ''}the proofs ran in ${held} ms${body ? ' (the DDL locks on orders, order_payments, action_audit_log and trucks are held until the rollback below)' : ''}`)
  })
  if (!file) {
    await tillConcurrency()
    await tillTimings()
  }
  const after = await tillCounts('after')
  ok('the demo trucks\' counts (orders, payments, audit rows, counters, the till tables) are identical before and after (nothing was committed)', JSON.stringify(before) === JSON.stringify(after), { before, after })
}
/** Several connections, all rolled back: truck A's chain head is a per-truck lock; truck B is not blocked; a waiter past the trigger's
 *  2 s lock_timeout still inserts its payment (and logs the failure). Pending orders are inserted first: they take no till lock. */
async function tillConcurrency() {
  say('\n── two connections ──')
  const A = TRUCKS.A, B = TRUCKS.B
  const items = '[{"name":"Crêpe","quantity":1,"unit_price":5}]'
  const walk = truck => `select pg_temp.rbp_walkup('${truck}', current_date, '${items}', 'confirmed', 'rollback proof', null, null, null, null) as k`
  const pending = truck => `select pg_temp.rbp_promote('${truck}') as k`
  const pay = key => `select pg_temp.rbp_pay('${key}', 'charge', 'in_person_other', 'cash', 500, null) as id`
  const open = async tag => { const c = await connect(tag); await q(c, tag, 'begin'); await q(c, tag, "set local till.include_demo = 'on'"); await q(c, tag, tillHelpers()); return c }
  const c1 = await open('c1'), c2 = await open('c2'), c3 = await open('c3'), c4 = await open('c4')
  try {
    const k2 = (await q(c2, 'c2', pending(A))).rows[0].k                 // pending: no till lock
    const k4 = (await q(c4, 'c4', pending(A))).rows[0].k
    await q(c1, 'c1', walk(A))                                           // accepted → sealed: c1 now holds truck A's chain head
    const t0 = Date.now()
    const waiting = q(c2, 'c2', pay(k2)).then(r => ({ id: r.rows[0].id, ms: Date.now() - t0 }))
    await new Promise(r => setTimeout(r, 400))
    const tb = Date.now()
    const kb = (await q(c3, 'c3', walk(B))).rows[0].k
    await q(c3, 'c3', pay(kb))
    const bMs = Date.now() - tb
    const bChain = Number((await q(c3, 'c3', 'select count(*) as n from public.till_chain where truck_id = $1', [B])).rows[0].n)
    ok(`truck B's sale (an accepted insert and its payment) is NOT blocked while truck A's chain head is held (${bMs} ms), and chains normally`, bMs < 1000 && bChain >= 4, { bMs, bChain })
    await q(c1, 'c1', 'rollback')
    const w = await waiting
    const wChain = (await q(c2, 'c2', "select count(*)::int as n from public.till_chain where truck_id = $1 and kind = 'payment' and ref = $2", [A, w.id])).rows[0].n
    ok(`truck A's waiter goes in as soon as the holder rolls back (${w.ms} ms), with its chain entry`, w.ms >= 350 && w.ms < 2000 && wChain === 1, { w, wChain })
    // c2 now holds A's head; c4's payment waits the trigger's 2 s, then goes IN unchained.
    const t4 = Date.now()
    const id4 = (await q(c4, 'c4', pay(k4))).rows[0].id
    const ms4 = Date.now() - t4
    const f4 = (await q(c4, 'c4', 'select sqlstate from public.till_failures where ref = $1', [id4])).rows[0]
    const in4 = (await q(c4, 'c4', 'select count(*)::int as n from public.order_payments where id = $1', [id4])).rows[0].n
    ok(`a holder past the trigger's 2 s lock_timeout: truck A's waiter goes IN after ~2 s (${ms4} ms) — the payment inserted, the failure logged (55P03), never an error`, in4 === 1 && f4 && f4.sqlstate === '55P03' && ms4 >= 1900 && ms4 < 3000, { ms4, f4, in4 })
  } finally {
    for (const [c, t] of [[c1, 'c1'], [c2, 'c2'], [c3, 'c3'], [c4, 'c4']]) { try { await q(c, t, 'rollback') } catch { /* already */ } try { await c.end() } catch { /* closed */ } }
  }
}
/** The extra time per write, measured inside the database (clock_timestamp), till off vs on, on truck A, rolled back. */
const TIMED = ['insert_accepted', 'insert_pending', 'accept', 'payment', 'kitchen_move', 'edit_sealed']
async function tillTimings() {
  say('\n── the extra time per write ──')
  const N = 40
  await inRollback('timing', async c => {
    await guard(c)
    await q(c, 'timing', tillHelpers())
    const A = lit(TRUCKS.A), crepe = `'[{"name":"Crêpe","quantity":1,"unit_price":5}]'`
    const walk = `pg_temp.rbp_walkup(${A}, current_date, ${crepe}, 'confirmed', 'rollback proof', null, null, null, null)`
    const prep = { accept: `ks := ks || pg_temp.rbp_promote(${A});`, payment: `ks := ks || ${walk};`, kitchen_move: `ks := ks || ${walk};`, edit_sealed: `ks := ks || ${walk};` }
    const op = {
      insert_accepted: `k := ${walk};`,
      insert_pending: `k := pg_temp.rbp_promote(${A});`,
      accept: `update public.orders set status = 'confirmed' where order_key = ks[i];`,
      payment: `perform pg_temp.rbp_pay(ks[i], 'charge', 'in_person_other', 'cash', 500, null);`,
      kitchen_move: `update public.orders set status = 'cooking' where order_key = ks[i];`,
      edit_sealed: `perform pg_temp.rbp_set_items(ks[i], '[{"name":"Crêpe","quantity":2,"unit_price":5}]');`,
    }
    const block = (on, what) => `do $t$
declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int;
begin
  perform set_config('till.include_demo', ${on ? "'on'" : "''"}, true);
  ${prep[what] ? `for i in 1..${N} loop ${prep[what]} end loop;` : ''}
  t0 := clock_timestamp();
  for i in 1..${N} loop ${op[what]} end loop;
  insert into _till_proof (label, ok, detail) values (${lit(`timing ${what} ${on ? 'on' : 'off'}`)}, true, (extract(epoch from clock_timestamp() - t0) * 1000 / ${N})::numeric(10,3)::text);
end $t$`
    const out = {}
    for (const what of TIMED) {
      for (const on of [false, true]) {
        await q(c, 'timing', 'savepoint t')
        await q(c, 'timing', block(on, what))
        out[`${what}_${on ? 'on' : 'off'}`] = Number((await q(c, 'timing', 'select detail from _till_proof where label = $1', [`timing ${what} ${on ? 'on' : 'off'}`])).rows[0].detail)
        await q(c, 'timing', 'rollback to savepoint t')
      }
    }
    for (const what of TIMED) say(`  ${what.padEnd(16)} till off ${out[`${what}_off`].toFixed(3)} ms · till on ${out[`${what}_on`].toFixed(3)} ms · extra ${(out[`${what}_on`] - out[`${what}_off`]).toFixed(3)} ms per write (mean of ${N}, inside the database)`)
    fs.mkdirSync(TILL_OUT, { recursive: true })
    fs.writeFileSync(path.join(TILL_OUT, 'timings.json'), JSON.stringify({ n: N, measured: new Date().toISOString(), ms_per_write: out }, null, 1) + '\n')
    ok('timings measured (docs/till-pack-1/timings.json): with the till on, a sale\'s insert (accepted, sealed at once) and a payment each cost under 20 ms extra',
      out.insert_accepted_on - out.insert_accepted_off < 20 && out.payment_on - out.payment_off < 20, out)
  })
}


/* ── till-pack-2 (25 November 2026, docs/till-pack-2-report.md): REVERSALS, COUNTER REFUNDS, DEVICE FINGERPRINTS, THE ACTOR'S ROLE ────────
 *   --preflight-till-2 <migration>  ONE transaction, ROLLED BACK: 20261133_till_pack_2's statements, then every proof below in ONE DO block
 *                                   (the DDL locks on order_payments last about a second), including the DDL-only ones.
 *   --till-2-check                  After it is applied: the same block without the DDL-only proofs, ROLLED BACK.
 * Demo trucks only, the till switched on for them inside the transaction (till.include_demo). The rows are written the way the new code
 * writes them (a reversal row pointing at its payment, a counter refund with its method, the device row BEFORE the order), and every check
 * is in the database: the chain, till_verify, the netted figures, the constraints, the grants. Exports go to docs/till-pack-2/. */
const TILL2_OUT = path.join(REPO, 'docs/till-pack-2')
function till2Helpers() {
  return `create function pg_temp.rbp_reverse(p_pay uuid, p_reason text) returns uuid language sql as $f$
  insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, external_ref, note, idempotency_key, created_by, method, livemode, reverses_payment_id, reason)
  select p.order_key, p.truck_id, 'reversal', p.channel, p.amount_minor, p.currency, 'succeeded', null, 'rollback proof reversal', 'reversal:' || p.id, 'rbp-staff-user', p.method, p.livemode, p.id, p_reason
  from public.order_payments p where p.id = p_pay
  returning id $f$;
create function pg_temp.rbp_refund(p_key uuid, p_channel text, p_method text, p_amount integer, p_reason text, p_ikey text) returns uuid language sql as $f$
  insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, external_ref, note, idempotency_key, created_by, method, livemode, reason)
  select o.order_key, o.truck_id, 'refund', p_channel, p_amount, o.currency, 'succeeded', null, 'rollback proof refund', p_ikey, 'rbp-staff-user', p_method, true, p_reason
  from public.orders o where o.order_key = p_key
  returning id $f$;
-- getOrderBalance in SQL: the netted, live, succeeded rows; paid = charges − refunds; 'refunded' when paid 0 with a refund row.
create function pg_temp.rbp_status(p_key uuid) returns text language sql as $f$
  with r as (select * from public.order_payments p where p.order_key = p_key and p.state = 'succeeded' and p.livemode
               and p.kind <> 'reversal' and not exists (select 1 from public.order_payments v where v.kind = 'reversal' and v.reverses_payment_id = p.id)),
       s as (select coalesce(sum(case when kind = 'charge' then amount_minor else 0 end), 0) - coalesce(sum(case when kind = 'refund' then amount_minor else 0 end), 0) as paid,
                    bool_or(kind = 'refund') as has_refund from r)
  select case when s.paid = 0 and coalesce(s.has_refund, false) then 'refunded' when s.paid = 0 then 'unpaid' else 'paid:' || s.paid end from s $f$;
-- a LIVE payment (rbp_pay writes test-mode rows, which getOrderBalance — and rbp_status — rightly do not count)
create function pg_temp.rbp_pay_live(p_key uuid, p_kind text, p_channel text, p_method text, p_amount integer, p_ref text) returns uuid language sql as $f$
  insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, external_ref, note, idempotency_key, created_by, method, livemode)
  select o.order_key, o.truck_id, p_kind, p_channel, p_amount, o.currency, 'succeeded', p_ref, 'rollback proof — staff note', 'rbp:' || gen_random_uuid(), 'rbp-staff-user', p_method, true
  from public.orders o where o.order_key = p_key
  returning id $f$;
create function pg_temp.rbp_walkup_keyed(p_key uuid, p_truck text, p_items jsonb) returns uuid language sql as $f$
  insert into public.orders (order_key, id, truck_id, customer_name, order_type, event_date, items, subtotal, discount_amt, total, total_minor, food_minor, tax_minor,
    tax_rate_milli, tax_inclusive, tax_label, tax_breakdown, card_fee_payer, status, payment_status, source)
  select p_key, 'rbp-' || substr(md5(random()::text), 1, 8), p_truck, 'rollback proof', 'collection', current_date, p_items, round(z.f / 100.0, 2), 0, round(z.f / 100.0, 2), z.f, z.f, 0,
    10000, true, 'TVA', pg_temp.rbp_bd(z.f), 'truck', 'confirmed', 'unpaid', 'manual'
  from (select pg_temp.rbp_food(p_items) as f) z
  returning order_key $f$;`
}
function till2ProofBlock(ddl) {
  const A = lit(TRUCKS.A), B = lit(TRUCKS.B), AB = `array[${A}, ${B}]`
  const clean = l => `perform pg_temp.rbp_clean(${lit(l)}, ${AB});`
  const crepe = `'[{"name":"Crêpe","quantity":1,"unit_price":5}]'`
  const ok13 = `(v ->> 'ok')::boolean`
  return `do $proof$
declare
  k1 uuid; k2 uuid; k3 uuid; k4 uuid; k5 uuid; k6 uuid; k7 uuid; k8 uuid; k9 uuid; kd uuid; kd2 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid; p8 uuid; r1 uuid; r2 uuid; r3 uuid; r4 uuid; q1 uuid; q2 uuid;
  st text; st2 text; st3 text; st4 text; st5 text; st6 text; st7 text; v jsonb; x jsonb; y jsonb; n integer; n2 integer; hs bigint; b boolean; b2 boolean; b3 boolean;
begin
  perform set_config('till.include_demo', 'on', true);

  -- ── T1 · the constraints: a reversal must point, only a reversal points, one reversal per payment, the reason is a word ──
  k1 := pg_temp.rbp_walkup(${A}, current_date, ${crepe}, 'confirmed', 'rollback proof', null, null, null, null);
  p1 := pg_temp.rbp_pay_live(k1, 'charge', 'in_person_other', 'cash', 500, null);
  begin insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, livemode) select order_key, truck_id, 'reversal', 'in_person_other', 500, currency, 'succeeded', true from public.order_payments where id = p1; st := 'allowed'; exception when others then st := sqlstate; end;
  begin insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, livemode, reverses_payment_id) select order_key, truck_id, 'charge', 'in_person_other', 500, currency, 'succeeded', true, p1 from public.order_payments where id = p1; st2 := 'allowed'; exception when others then st2 := sqlstate; end;
  begin perform pg_temp.rbp_refund(k1, 'in_person_other', 'cash', 100, 'Free text, with spaces', null); st3 := 'allowed'; exception when others then st3 := sqlstate; end;
  begin insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, livemode) select order_key, truck_id, 'void', 'in_person_other', 500, currency, 'succeeded', true from public.order_payments where id = p1; st4 := 'allowed'; exception when others then st4 := sqlstate; end;
  r1 := pg_temp.rbp_reverse(p1, 'undo_mark_paid');
  begin insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, livemode, reverses_payment_id) select order_key, truck_id, 'reversal', channel, amount_minor, currency, 'succeeded', true, id from public.order_payments where id = p1; st5 := 'allowed'; exception when others then st5 := sqlstate; end;
  perform pg_temp.rbp_ok('T1 · a reversal without a pointer, a charge WITH one, a free-text reason and an unknown kind are refused (23514); a second reversal of the same payment is refused (23505); a proper reversal goes in',
    st = '23514' and st2 = '23514' and st3 = '23514' and st4 = '23514' and st5 = '23505' and r1 is not null,
    json_build_object('no_pointer', st, 'charge_pointer', st2, 'free_reason', st3, 'unknown_kind', st4, 'second_reversal', st5)::text);

  -- ── T2 · undo "Mark paid" (as the new code does it): one reversal row, NO delete — the charge stays; status 'unpaid' exactly as after the old delete ──
  perform pg_temp.rbp_ok('T2 · undo Mark paid: the charge row is KEPT, one reversal row points at it, nothing is deleted or logged as a would-be delete; the netted status is ''unpaid''; the chain holds both payment entries, the reversal with its pointer and reason',
    exists (select 1 from public.order_payments where id = p1) and (select count(*) from public.order_payments where reverses_payment_id = p1) = 1
      and pg_temp.rbp_status(k1) = 'unpaid' and pg_temp.rbp_entries(${A}, 'deletion', p1::text) = 0 and pg_temp.rbp_events(${A}, p1::text) = ''
      and pg_temp.rbp_entries(${A}, 'payment', p1::text) = 1 and pg_temp.rbp_entries(${A}, 'payment', r1::text) = 1
      and (select c.payload::jsonb -> 'data' ->> 'reverses_payment_id' from public.till_chain c where c.truck_id = ${A} and c.kind = 'payment' and c.ref = r1::text) = p1::text
      and (select c.payload::jsonb -> 'data' ->> 'reason' from public.till_chain c where c.truck_id = ${A} and c.kind = 'payment' and c.ref = r1::text) = 'undo_mark_paid'
      and (select c.payload::jsonb -> 'data' ->> 'kind' from public.till_chain c where c.truck_id = ${A} and c.kind = 'payment' and c.ref = r1::text) = 'reversal',
    json_build_object('status', pg_temp.rbp_status(k1), 'reversals', (select count(*) from public.order_payments where reverses_payment_id = p1))::text);
  ${clean('T2')}

  -- ── T3 · undo collected: the payment first, then the status (as the route), then the undo — the reversal and the status back ──
  k2 := pg_temp.rbp_walkup(${A}, current_date, ${crepe}, 'confirmed', 'rollback proof', null, null, null, null);
  p2 := pg_temp.rbp_pay_live(k2, 'charge', 'in_person_other', 'card', 500, null);
  update public.orders set status = 'collected', paid_at = now(), collected_at = now(), status_before_collected = 'confirmed' where order_key = k2;
  hs := public.till_head_seq(${A});
  r2 := pg_temp.rbp_reverse(p2, 'undo_collected');
  update public.orders set status = 'confirmed', status_before_collected = null, paid_at = null, collected_at = null where order_key = k2;
  n := public.till_record_actor(${A}, hs, k2, 'undo_collected', 'staff');
  n2 := public.till_record_actor(${A}, hs, k2, 'undo_collected', 'owner');
  perform pg_temp.rbp_ok('T3 · undo collected: one reversal (reason undo_collected), the charge kept, status ''unpaid'', the order back to accepted as v3 (state_change) — and no deletion entry',
    pg_temp.rbp_status(k2) = 'unpaid' and exists (select 1 from public.order_payments where id = p2) and pg_temp.rbp_entries(${A}, 'deletion', p2::text) = 0
      and pg_temp.rbp_reasons(${A}, k2::text) = '1:accepted:accepted,2:state_change:collected,3:state_change:accepted'
      and (select reason from public.order_payments where id = r2) = 'undo_collected', pg_temp.rbp_reasons(${A}, k2::text));
  perform pg_temp.rbp_ok('T9 · the actor''s ROLE: till_record_actor names exactly the two entries the undo made (the reversal and order v3) as ''staff''; a second call changes nothing (first role kept); no name or id is stored',
    n = 2 and n2 = 0 and (select string_agg(a.role || ':' || a.action, ',' order by a.seq) from public.till_entry_actors a where a.truck_id = ${A} and a.seq > hs) = 'staff:undo_collected,staff:undo_collected'
      and (select bool_and(c.ref in (r2::text, k2::text)) from public.till_entry_actors a join public.till_chain c on c.truck_id = a.truck_id and c.seq = a.seq where a.truck_id = ${A} and a.seq > hs),
    json_build_object('n', n, 'n2', n2)::text);
  begin perform public.till_record_actor(${A}, 0, k2, 'undo_collected', 'Alice Smith'); st := 'allowed'; exception when others then st := sqlstate; end;
  begin perform public.till_record_actor(${A}, 0, k2, 'Undo by Alice', 'staff'); st2 := 'allowed'; exception when others then st2 := sqlstate; end;
  perform pg_temp.rbp_ok('T9b · a role outside owner / staff / admin / system / unknown, or an action that is not a short word, is refused (23514) — a name cannot get in', st = '23514' and st2 = '23514', st || ' / ' || st2);
  ${clean('T3')}

  -- ── T4 · a refund that FAILED: the refund row is kept, a reversal points at it; the order reads paid again (it used to be deleted) ──
  k3 := pg_temp.rbp_walkup(${A}, current_date, ${crepe}, 'confirmed', 'rollback proof', null, null, null, null);
  p3 := pg_temp.rbp_pay_live(k3, 'charge', 'online', 'card', 500, 'pi_rbp_till_2');
  p4 := pg_temp.rbp_pay_live(k3, 'refund', 'online', 'card', 500, 're_rbp_till_2');
  st := pg_temp.rbp_status(k3);
  r3 := pg_temp.rbp_reverse(p4, 'refund_failed');
  perform pg_temp.rbp_ok('T4 · failed refund: ''refunded'' before, then the refund is reversed (reason refund_failed) — the refund row kept, the order ''paid:500'' again, nothing deleted',
    st = 'refunded' and pg_temp.rbp_status(k3) = 'paid:500' and exists (select 1 from public.order_payments where id = p4) and pg_temp.rbp_entries(${A}, 'deletion', p4::text) = 0,
    st || ' → ' || pg_temp.rbp_status(k3));

  -- ── T5 · a re-collect after an undo goes in under the suffixed key; the plain key would have been swallowed ──
  k4 := pg_temp.rbp_walkup(${A}, current_date, ${crepe}, 'confirmed', 'rollback proof', null, null, null, null);
  insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, idempotency_key, method, livemode)
    select order_key, truck_id, 'charge', 'in_person_other', 500, currency, 'succeeded', 'collect:' || order_key || ':0:500', 'cash', true from public.orders where order_key = k4 returning id into p5;
  r4 := pg_temp.rbp_reverse(p5, 'undo_collected');
  begin insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, idempotency_key, method, livemode)
    select order_key, truck_id, 'charge', 'in_person_other', 500, currency, 'succeeded', 'collect:' || order_key || ':0:500', 'cash', true from public.orders where order_key = k4; st := 'inserted'; exception when others then st := sqlstate; end;
  insert into public.order_payments (order_key, truck_id, kind, channel, amount_minor, currency, state, idempotency_key, method, livemode)
    select order_key, truck_id, 'charge', 'in_person_other', 500, currency, 'succeeded', 'collect:' || order_key || ':0:500:r1', 'cash', true from public.orders where order_key = k4 returning id into p6;
  perform pg_temp.rbp_ok('T5 · collect → undo → collect again: today''s key collides (23505 — why ledger.ts suffixes it after a reversal), the suffixed key goes in, and the order reads paid once',
    st = '23505' and p6 is not null and pg_temp.rbp_status(k4) = 'paid:500', st || ' / ' || pg_temp.rbp_status(k4));
  ${clean('T5')}

  -- ── T6 · a COUNTER refund: cash back at the truck, a refund row with its method and reason, chained ──
  k5 := pg_temp.rbp_walkup(${A}, current_date, '[{"name":"Crêpe","quantity":2,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null);
  p7 := pg_temp.rbp_pay_live(k5, 'charge', 'in_person_other', 'cash', 1000, null);
  q1 := pg_temp.rbp_refund(k5, 'in_person_other', 'cash', 400, 'item_unavailable', 'counter_refund:' || k5 || ':0:400');
  perform pg_temp.rbp_ok('T6 · counter refund (cash, 4.00 of 10.00): one refund row, channel in_person_other, method cash, reason item_unavailable — chained with them; the order ''paid:600''',
    pg_temp.rbp_status(k5) = 'paid:600' and pg_temp.rbp_entries(${A}, 'payment', q1::text) = 1
      and (select c.payload::jsonb -> 'data' ->> 'method' || '/' || (c.payload::jsonb -> 'data' ->> 'reason') from public.till_chain c where c.truck_id = ${A} and c.kind = 'payment' and c.ref = q1::text) = 'cash/item_unavailable',
    pg_temp.rbp_status(k5));

  -- ── T7 · Q5: cancelling an order paid at the counter records the counter refund for the money taken, with the original method ──
  k6 := pg_temp.rbp_walkup(${A}, current_date, ${crepe}, 'confirmed', 'rollback proof', null, null, null, null);
  p8 := pg_temp.rbp_pay_live(k6, 'charge', 'in_person_other', 'card', 500, null);
  update public.orders set status = 'cancelled', cancellation_reason = 'rollback proof' where order_key = k6;
  q2 := pg_temp.rbp_refund(k6, 'in_person_other', 'card', 500, 'order_cancelled', 'cancel_refund:' || k6 || ':card:500');
  perform pg_temp.rbp_ok('T7 · Q5: the cancelled counter-paid order gets one refund row (card, 5.00, reason order_cancelled); the order is ''refunded'' and its v2 is the cancellation (state_change)',
    pg_temp.rbp_status(k6) = 'refunded' and pg_temp.rbp_reasons(${A}, k6::text) = '1:accepted:accepted,2:state_change:cancelled' and (select method || '/' || reason from public.order_payments where id = q2) = 'card/order_cancelled',
    pg_temp.rbp_reasons(${A}, k6::text) || ' ' || pg_temp.rbp_status(k6));
  ${clean('T7')}

  -- ── T8 · law change 8: the device fingerprint, stored BEFORE the order, sealed into its v1, and the till number names the device ──
  kd := gen_random_uuid();
  b := public.till_record_device(kd, ${A}, 'rbp-device-1', repeat('ab', 32), now() - interval '2 hours');
  perform pg_temp.rbp_walkup_keyed(kd, ${A}, ${crepe});
  b2 := public.till_record_device(kd, ${A}, 'rbp-device-2', repeat('cd', 32), now());
  kd2 := pg_temp.rbp_walkup(${A}, current_date, ${crepe}, 'confirmed', 'rollback proof', null, null, null, null);
  b3 := public.till_record_device(kd2, ${A}, 'rbp-device-3', repeat('ef', 32), now());
  x := pg_temp.rbp_data(${A}, kd::text) -> 'data';
  y := pg_temp.rbp_data(${A}, kd2::text) -> 'data';
  perform pg_temp.rbp_ok('T8 · an offline walk-up''s device evidence is stored BEFORE its order, so v1 carries it ({device_id, fingerprint, created_at}) and till_id is the device id; a second call for the same order — or for an order that already exists (an older app''s sync) — stores nothing; an order without it seals as before (till_id manual, no device key)',
    b and not b2 and not b3 and x -> 'device' ->> 'device_id' = 'rbp-device-1' and x -> 'device' ->> 'fingerprint' = repeat('ab', 32) and x ->> 'till_id' = 'rbp-device-1'
      and y ->> 'till_id' = 'manual' and not (y ? 'device') and (select count(*) from public.till_device_fingerprints where order_key in (kd, kd2)) = 1,
    json_build_object('first', b, 'again', b2, 'existing', b3, 'till_id', x ->> 'till_id', 'device', x -> 'device')::text);
  perform set_config('till.include_demo', '', true);
  b := public.till_record_device(gen_random_uuid(), ${B}, 'rbp-device-9', repeat('aa', 32), now());
  perform set_config('till.include_demo', 'on', true);
  perform pg_temp.rbp_ok('T8b · a truck outside the till (a demo truck, the default) stores no device row', not b, b::text);
  ${clean('T8')}

  -- ── T10 · the DEPLOYED undo (a DELETE of the charge) on a payment that has a reversal: the pair goes together (ON DELETE CASCADE), chained ──
  k7 := pg_temp.rbp_walkup(${A}, current_date, ${crepe}, 'confirmed', 'rollback proof', null, null, null, null);
  p1 := pg_temp.rbp_pay_live(k7, 'charge', 'in_person_other', 'cash', 500, null);
  r1 := pg_temp.rbp_reverse(p1, 'undo_mark_paid');
  delete from public.order_payments where id = p1;
  v := public.till_verify(${A});
  perform pg_temp.rbp_ok('T10 · a code rollback''s old undo (DELETE of a reversed charge) is not blocked: its reversal goes with it (cascade), both deletions chained, till_verify true',
    not exists (select 1 from public.order_payments where id in (p1, r1)) and pg_temp.rbp_entries(${A}, 'deletion', p1::text) = 1 and pg_temp.rbp_entries(${A}, 'deletion', r1::text) = 1 and ${ok13},
    v::text);

  -- ── T11 · the two new till tables are append-only ──
  begin update public.till_device_fingerprints set device_id = 'x' where order_key = kd; st := 'allowed'; exception when others then st := sqlstate; end;
  begin delete from public.till_device_fingerprints where order_key = kd; st2 := 'allowed'; exception when others then st2 := sqlstate; end;
  begin update public.till_entry_actors set role = 'owner' where truck_id = ${A}; st3 := 'allowed'; exception when others then st3 := sqlstate; end;
  begin delete from public.till_entry_actors where truck_id = ${A}; st4 := 'allowed'; exception when others then st4 := sqlstate; end;
${ddl ? `  begin truncate public.till_device_fingerprints; st5 := 'allowed'; exception when others then st5 := sqlstate; end;
  begin truncate public.till_entry_actors; st6 := 'allowed'; exception when others then st6 := sqlstate; end;` : `  st5 := 'HGT01'; st6 := 'HGT01';`}
  perform pg_temp.rbp_ok('T11 · till_device_fingerprints and till_entry_actors refuse UPDATE / DELETE${ddl ? ' / TRUNCATE' : ''} (HGT01)',
    st = 'HGT01' and st2 = 'HGT01' and st3 = 'HGT01' and st4 = 'HGT01' and st5 = 'HGT01' and st6 = 'HGT01', concat_ws(' ', st, st2, st3, st4, st5, st6));

  -- ── T12 · backward compatible: every order without device evidence and every payment without a pointer or a reason seals exactly as before ──
  perform pg_temp.rbp_ok('T12 · an order with no device row seals exactly till-pack-1b''s 37 keys; a payment with no pointer and no reason exactly the 12 — so no entry written before this migration stops matching',
    not exists (select 1 from public.till_chain c where c.truck_id = ${A} and c.kind = 'order' and c.ref <> kd::text and (select count(*) from jsonb_object_keys(c.payload::jsonb -> 'data')) <> 37)
      and (select count(*) from jsonb_object_keys(pg_temp.rbp_data(${A}, kd::text) -> 'data')) = 38
      and not exists (select 1 from public.till_chain c join public.order_payments p on p.id::text = c.ref where c.truck_id = ${A} and c.kind = 'payment' and p.reverses_payment_id is null and p.reason is null
                        and (select count(*) from jsonb_object_keys(c.payload::jsonb -> 'data')) <> 12), null);

  -- ── T13 · till_verify at the end: ok in every respect ──
  v := public.till_verify(${A});
  perform pg_temp.rbp_ok('T13 · till_verify(truck A) at the end: ok — chain, identity references, versions, deltas, till_id, VAT reconciliation; every row matches its sealed form',
    ${ok13} and (v ->> 'mismatch_count')::int = 0, v::text);
  ${clean('T13')}
  perform pg_temp.rbp_ok('T14 · after every step, every order and payment row of both trucks carries this transaction''s own xid — no till trigger wrote one',
    (select count(*) from _till_clean) >= 6 and not exists (select 1 from _till_clean where bad is not null), (select string_agg(label || ': ' || coalesce(bad, '-'), ' | ') from _till_clean));
${ddl ? `  perform pg_temp.rbp_ok('T14b · the probe trigger saw no INSERT or UPDATE of orders / order_payments issued from inside another trigger (only the FK cascades'' DELETEs)',
    not exists (select 1 from _till_nested where op <> 'DELETE'), (select string_agg(tbl || ':' || op || ':' || depth, ', ') from _till_nested));
` : ''}end
$proof$`
}
const TILL2_STATIC = `select
  (select string_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default, 'none') || ':' || data_type, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'order_payments' and column_name in ('reverses_payment_id', 'reason')) as new_columns,
  (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.order_payments'::regclass and conname = 'order_payments_kind_chk') as kind_chk,
  (select confdeltype from pg_constraint where conrelid = 'public.order_payments'::regclass and contype = 'f' and confrelid = 'public.order_payments'::regclass) as self_fk_delete,
  (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_device_fingerprints', 'till_entry_actors')) as rls_on,
  has_table_privilege('anon', 'public.till_entry_actors', 'SELECT') or has_table_privilege('authenticated', 'public.till_device_fingerprints', 'SELECT') as api_reads,
  (select bool_or(has_table_privilege('service_role', t, p)) from unnest(array['public.till_device_fingerprints', 'public.till_entry_actors']) t, unnest(array['INSERT', 'UPDATE', 'DELETE']) p) as service_writes,
  has_function_privilege('service_role', 'public.till_record_device(uuid,text,text,text,timestamptz)', 'EXECUTE') and has_function_privilege('service_role', 'public.till_record_actor(text,bigint,uuid,text,text)', 'EXECUTE') and has_function_privilege('service_role', 'public.till_head_seq(text)', 'EXECUTE') as service_calls,
  has_function_privilege('anon', 'public.till_record_device(uuid,text,text,text,timestamptz)', 'EXECUTE') or has_function_privilege('authenticated', 'public.till_record_actor(text,bigint,uuid,text,text)', 'EXECUTE') or has_function_privilege('anon', 'public.till_head_seq(text)', 'EXECUTE') as api_calls,
  md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5`
function checkStatic2(s) {
  ok('U1 · order_payments.reverses_payment_id (uuid) and reason (text): nullable, no default', s.new_columns === 'reason:YES:none:text,reverses_payment_id:YES:none:uuid', s.new_columns)
  ok('U2 · the kind check is widened to charge | refund | reversal; the pointer cascades on delete', /'charge'::text, 'refund'::text, 'reversal'::text/.test(s.kind_chk || '') && s.self_fk_delete === 'c', s)
  ok('U3 · the two new till tables have RLS on; anon / authenticated cannot read them; the service role cannot write them', s.rls_on === true && s.api_reads === false && s.service_writes === false, s)
  ok('U4 · the service role may call till_record_device, till_record_actor and till_head_seq; anon / authenticated may not', s.service_calls === true && s.api_calls === false, s)
  ok('U5 · place_order_atomic_v2 untouched: md5 e4b273abcf8e7609c6ca54033ed59332', s.v2_md5 === 'e4b273abcf8e7609c6ca54033ed59332', s.v2_md5)
}
async function till2Export(c, tag, mode) {
  await q(c, tag, "set local timezone = 'UTC'")
  const chain = (await q(c, tag, 'select truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version from public.till_chain where truck_id = $1 order by seq', [TRUCKS.A])).rows
  const orders = (await q(c, tag, 'select row_to_json(o)::text as row, public.till_sealed_order(o)::text as sealed, (select row_to_json(d)::text from public.till_device_fingerprints d where d.order_key = o.order_key) as device from public.orders o where o.truck_id = $1 order by o.created_at, o.order_key', [TRUCKS.A])).rows
  const payments = (await q(c, tag, 'select row_to_json(p)::text as row, public.till_sealed_payment(p)::text as sealed from public.order_payments p where p.truck_id = $1 order by p.created_at, p.id', [TRUCKS.A])).rows
  fs.mkdirSync(TILL2_OUT, { recursive: true })
  fs.writeFileSync(path.join(TILL2_OUT, `chain-${mode}.jsonl`), chain.map(r => JSON.stringify({ ...r, seq: Number(r.seq) })).join('\n') + '\n')
  fs.writeFileSync(path.join(TILL2_OUT, `rows-${mode}.json`), JSON.stringify({ truck_id: TRUCKS.A, note: 'demo truck rows inside a rolled-back transaction (row_to_json text, TimeZone UTC), the sealed form the database computed for each, and each order\'s device row', orders, payments }, null, 1) + '\n')
  say(`  exported ${chain.length} chain entries, ${orders.length} orders and ${payments.length} payments to docs/till-pack-2/chain-${mode}.jsonl / rows-${mode}.json`)
}
async function till2Counts(label) {
  const base = await tillCounts(label)
  const extra = await inRollback(`till2-counts-${label}`, async c => {
    await q(c, `till2-counts-${label}`, 'set transaction read only')
    const has = (await q(c, `till2-counts-${label}`, "select to_regclass('public.till_entry_actors') is not null as has")).rows[0].has
    if (!has) return { till2: 'not applied' }
    return (await q(c, `till2-counts-${label}`, `select (select count(*) from public.till_device_fingerprints where truck_id = any($1))::int as device_rows,
        (select count(*) from public.till_entry_actors where truck_id = any($1))::int as actor_rows,
        (select count(*) from public.order_payments where kind = 'reversal')::int as reversals_anywhere`, [IDS])).rows[0]
  })
  say(`  till-pack-2 counts ${label}: ${JSON.stringify(extra)}`)
  return { ...base, ...extra }
}
async function till2Proofs(file) {
  let body = null
  if (file) {
    const rel = path.relative(REPO, path.resolve(REPO, file)).split(path.sep).join('/')
    if (!/^supabase\/migrations\/[^/]+\.sql$/.test(rel)) die(`${rel} is not a migration file`)
    body = fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/--[^\n]*/g, '').replace(/^\s*set lock_timeout[^;]*;/im, '').replace(/^\s*begin;\s*$/im, '').replace(/^\s*commit;\s*$/im, '').replace(/^\s*notify pgrst[^;]*;/im, '')
    if (/^\s*(begin|commit|rollback)\s*;/im.test(body) || /\bcommit\b/i.test(body)) die('the migration body still has a transaction statement after stripping')
    say(`\n══ PRE-FLIGHT — ${rel} inside ONE transaction that is ROLLED BACK ══`)
  } else say('\n══ TILL-PACK-2, LIVE — every transaction ROLLED BACK ══')
  const mode = file ? 'preflight' : 'check'
  const before = await till2Counts('before')
  const tag = file ? 'preflight2' : 'till2'
  await inRollback(tag, async c => {
    await guard(c)
    const t0 = Date.now()
    let wrote = null
    if (body) {
      await q(c, tag, body)
      wrote = (await q(c, tag, TILL_WROTE)).rows[0]
    }
    await q(c, tag, tillHelpers() + '\n' + till2Helpers() + (body ? '\n' + tillProbe() : ''))
    await q(c, tag, till2ProofBlock(!!file))
    const held = Date.now() - t0
    for (const r of (await q(c, tag, 'select label, ok, detail from _till_proof order by n')).rows) ok(r.label, r.ok, r.ok ? undefined : r.detail)
    if (wrote) ok('U0 · the migration itself wrote NO row of orders, order_payments, action_audit_log or trucks (no row carries this transaction\'s xid after it)', Object.values(wrote).every(n => n === 0), wrote)
    checkStatic2((await q(c, tag, TILL2_STATIC)).rows[0])
    await till2Export(c, tag, mode)
    say(`  ${body ? 'the migration and ' : ''}the proofs ran in ${held} ms${body ? ' (the DDL locks on order_payments, orders, trucks and action_audit_log are held until the rollback below)' : ''}`)
  })
  const after = await till2Counts('after')
  ok('the demo trucks\' counts (orders, payments, audit rows, counters, the till tables, the new till tables) are identical before and after (nothing was committed)', JSON.stringify(before) === JSON.stringify(after), { before, after })
}

async function main() {
  const args = process.argv.slice(2)
  URL_ = dbUrl()
  if (args[0] === '--preflight-till-2' && args[1]) await till2Proofs(args[1])
  else if (args[0] === '--till-2-check') await till2Proofs(null)
  else if (args[0] === '--preflight-till-1' && args[1]) await tillProofs(args[1])
  else if (args[0] === '--till-1-check') await tillProofs(null)
  else if (args[0] === '--preflight-notes' && args[1]) await notesProofs(args[1])
  else if (args[0] === '--notes-check') await notesProofs(null)
  else if (args[0] === '--preflight-regime' && args[1]) await regimeProofs(args[1])
  else if (args[0] === '--regime-check') await regimeProofs(null)
  else if (args[0] === '--preflight' && args[1]) await preflight(args[1])
  else if (args[0] === '--concurrency') await concurrency()
  else if (args[0] === '--old-style-call') await oldStyleCall()
  else die('usage: --preflight <migration.sql> | --concurrency | --old-style-call | --preflight-regime <migration.sql> | --regime-check | --preflight-notes <migration.sql> | --notes-check | --preflight-till-1 <migration.sql> | --till-1-check | --preflight-till-2 <migration.sql> | --till-2-check')
  say(failed ? `\n🔴 ${failed} proof(s) FAILED` : '\n✅ every proof passed')
  process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(`db-rollback-proofs: FAILED (every transaction was rolled back): ${URL_ ? scrub(e && e.message, URL_) : e && e.message}`); process.exit(1) })
