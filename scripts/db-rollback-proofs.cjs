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

/* ── till-pack-1 (24 November 2026, docs/till-pack-1-report.md): THE TAMPER-EVIDENT CHAIN, OBSERVE MODE ─────────────────────────────────
 *   --preflight-till-1 <migration>  ONE transaction, ROLLED BACK: 20261129_till_pack_1's statements, then every proof below in ONE
 *                                   server-side DO block (one round trip, so the migration's DDL locks on orders / order_payments /
 *                                   action_audit_log last about a second), including the DDL-only proofs: the forced failure (till_chain
 *                                   renamed inside a savepoint), the TRUNCATE refusals and a tamper caught by till_verify.
 *   --till-1-check                  After it is applied: the same block WITHOUT the DDL-only proofs, then the two-connection proofs and
 *                                   the per-insert timings — every transaction ROLLED BACK.
 * The demo trucks are outside the till (Q7): the till is switched on for them only INSIDE these transactions (SET LOCAL
 * till.include_demo = 'on'). Each run writes the chain it built and the rows it sealed (demo data, no customer) to
 * docs/till-pack-1/, so scripts/till-pack-1.cjs can check the JavaScript mirror against what the database produced, byte for byte. */
const TILL_OUT = path.join(REPO, 'docs/till-pack-1')
const lit = s => `'${String(s).replace(/'/g, "''")}'`
/** The temporary helpers (pg_temp: gone with the session; created inside the rolled-back transaction anyway). */
function tillHelpers() {
  return `create temp table _till_proof (n serial primary key, label text not null, ok boolean, detail text);
create function pg_temp.rbp_ok(p_label text, p_ok boolean, p_detail text) returns void language sql as $f$
  insert into _till_proof (label, ok, detail) values (p_label, coalesce(p_ok, false), left(p_detail, 900)) $f$;
create function pg_temp.rbp_walkup(p_truck text, p_day date, p_items jsonb, p_status text, p_name text, p_email text, p_phone text, p_notes text, p_line_notes jsonb)
returns uuid language sql as $f$
  insert into public.orders (id, truck_id, customer_name, customer_phone, customer_email, slot, order_type, event_date, event_id, items, deals,
    discount_code, subtotal, discount_amt, total, total_minor, food_minor, tax_minor, tax_inclusive, tax_label, card_fee_payer, status,
    payment_status, source, notes, line_notes)
  values ('rbp-' || substr(md5(random()::text), 1, 8), p_truck, p_name, p_phone, p_email, null, 'collection', p_day, null, p_items, null, null,
    5.00, 0, 5.00, 500, 500, 45, true, 'TVA', 'truck', p_status, 'unpaid', 'manual', p_notes, p_line_notes)
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
  select coalesce(string_agg(g.event, ',' order by g.id), '') from public.till_guard_events g where g.truck_id = p_truck and g.ref = p_ref $f$;`
}
const OLD_STYLE_LIT = JSON.stringify({ ...OLD_STYLE_ORDER, items: [{ name: 'Crêpe', quantity: 1, unit_price: 5 }], subtotal: 5, total: 5, total_minor: 500, food_minor: 500 })
/** The proofs, as one DO block. `ddl` adds the DDL-only ones (pre-flight only: the tables there are this transaction's own). */
function tillProofBlock(ddl) {
  const A = lit(TRUCKS.A), B = lit(TRUCKS.B)
  return `do $proof$
declare
  k_fn uuid; k_walk uuid; k_rep uuid; k_pro uuid; k_late uuid; k_old uuid; k_old2 uuid; k_new uuid; k_b uuid; k_bl1 uuid; k_bl2 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; pf uuid; pb uuid; pbl uuid; p_old uuid; p_new uuid; p_old2 uuid;
  c1 integer; c2 integer; n_ord integer; n_pay integer; e0 integer; e1 integer; aud uuid;
  st text; st2 text; st3 text; st4 text; st5 text; st6 text; v jsonb; v2 jsonb; vb jsonb; vb2 jsonb; s1 text; s2 text;
begin
  perform set_config('till.include_demo', 'on', true);

  -- ── 1 · the deployed insert paths: nothing sealed or chained, the new columns NULL ──
  k_fn := ((public.place_order_atomic_v2(${lit(OLD_STYLE_LIT)}::jsonb, null, 'confirmed', null, ${A}, current_date, null)) ->> 'order_key')::uuid;
  k_walk := pg_temp.rbp_walkup(${A}, current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null);
  k_rep := gen_random_uuid();
  c1 := pg_temp.rbp_replay(${A}, k_rep); c2 := pg_temp.rbp_replay(${A}, k_rep);
  k_pro := pg_temp.rbp_promote(${A});
  perform pg_temp.rbp_ok('1 · the deployed place_order_atomic_v2 call, the walk-up insert, the offline replay upsert (twice: inserted, then skipped) and the card promotion insert all succeed — sealed_at / sealed_version NULL, nothing chained',
    (select count(*) from public.orders where order_key in (k_fn, k_walk, k_rep, k_pro) and sealed_at is null and sealed_version is null) = 4 and c1 = 1 and c2 = 0
      and not exists (select 1 from public.till_chain where truck_id = ${A}),
    json_build_object('rows', (select count(*) from public.orders where order_key in (k_fn, k_walk, k_rep, k_pro)), 'replay', array[c1, c2], 'chain', (select count(*) from public.till_chain where truck_id = ${A}))::text);

  -- ── 2 · each payment chains exactly one entry; the first one seals its order ──
  p1 := pg_temp.rbp_pay(k_fn, 'charge', 'in_person_other', 'card', 500, null);                       -- mark paid
  perform pg_temp.rbp_ok('2a · mark paid: one payment entry, and the order sealed as version 1 (first_payment, accepted)',
    pg_temp.rbp_entries(${A}, 'payment', p1::text) = 1 and pg_temp.rbp_reasons(${A}, k_fn::text) = '1:first_payment:accepted'
      and (select sealed_version from public.orders where order_key = k_fn) = 1 and (select sealed_at from public.orders where order_key = k_fn) is not null,
    pg_temp.rbp_reasons(${A}, k_fn::text));
  update public.orders set payment_status = 'paid', amount_paid = 5 where order_key = k_fn;           -- the ledger's cache write-back
  perform pg_temp.rbp_ok('2b · the payment cache write-back (payment_status, amount_paid) makes no version', pg_temp.rbp_reasons(${A}, k_fn::text) = '1:first_payment:accepted', pg_temp.rbp_reasons(${A}, k_fn::text));
  p2 := pg_temp.rbp_pay(k_walk, 'charge', 'in_person_other', 'cash', 500, null);                    -- collect: the route books the payment first …
  update public.orders set status = 'collected', paid_at = now(), collected_at = now(), status_before_collected = 'confirmed' where order_key = k_walk;   -- … then the status
  perform pg_temp.rbp_ok('2c · collect: one payment entry; the order sealed v1 at the payment, then v2 at the collected update (state_change, collected) — the route writes the payment before the status',
    pg_temp.rbp_entries(${A}, 'payment', p2::text) = 1 and pg_temp.rbp_reasons(${A}, k_walk::text) = '1:first_payment:accepted,2:state_change:collected'
      and (select sealed_version from public.orders where order_key = k_walk) = 2,
    pg_temp.rbp_reasons(${A}, k_walk::text));
  p3 := pg_temp.rbp_pay(k_pro, 'charge', 'online', 'card', 500, 'pi_rbp_till_1');                   -- the Stripe webhook's charge row
  perform pg_temp.rbp_ok('2d · online charge: one payment entry, and the order sealed v1 (first_payment)', pg_temp.rbp_entries(${A}, 'payment', p3::text) = 1 and pg_temp.rbp_reasons(${A}, k_pro::text) = '1:first_payment:pending', pg_temp.rbp_reasons(${A}, k_pro::text));
  p4 := pg_temp.rbp_pay(k_pro, 'refund', 'online', 'card', 500, 're_rbp_till_1');                   -- the refund row
  perform pg_temp.rbp_ok('2e · online refund: one payment entry, no new order version', pg_temp.rbp_entries(${A}, 'payment', p4::text) = 1 and pg_temp.rbp_reasons(${A}, k_pro::text) = '1:first_payment:pending', pg_temp.rbp_reasons(${A}, k_pro::text));
  update public.order_payments set application_fee_minor = 12 where id = p3 and application_fee_minor is null;
  perform pg_temp.rbp_ok('2f · the platform fee fill on a chained payment (not sealed) makes no entry and no guard event', pg_temp.rbp_entries(${A}, 'payment', p3::text) = 1 and pg_temp.rbp_events(${A}, p3::text) = '', pg_temp.rbp_events(${A}, p3::text));
${ddl ? `
  -- ── 3 · a forced failure (the chain table renamed, inside a savepoint): the payment still goes in, and the failure is logged ──
  begin
    alter table public.till_chain rename to till_chain_forced_failure;
    pf := pg_temp.rbp_pay(k_rep, 'charge', 'in_person_other', 'cash', 500, null);
    c1 := (select count(*) from public.order_payments where id = pf);
    st := (select sqlstate from public.till_failures where ref = pf::text order by id desc limit 1);
    raise exception using errcode = 'RBP01', message = 'undo the forced failure';
  exception when sqlstate 'RBP01' then null;
  end;
  perform pg_temp.rbp_ok('3 · forced failure (till_chain renamed in a savepoint): the payment row is still INSERTED, and till_failures says why (42P01)', c1 = 1 and st = '42P01' and to_regclass('public.till_chain') is not null, json_build_object('payment_rows', c1, 'sqlstate', st)::text);
` : ''}
  -- ── 4 · the deployed undo: DELETE the charge, then the status back — allowed, logged, and chained ──
  delete from public.order_payments where id = p2;
  update public.orders set status = 'confirmed', paid_at = null, collected_at = null where order_key = k_walk;
  perform pg_temp.rbp_ok('4 · the deployed undo (DELETE of the charge) still deletes; it is logged as a would-be refusal and chained as a deletion; the status back makes v3',
    not exists (select 1 from public.order_payments where id = p2) and pg_temp.rbp_events(${A}, p2::text) = 'would_refuse_delete' and pg_temp.rbp_entries(${A}, 'deletion', p2::text) = 1
      and pg_temp.rbp_reasons(${A}, k_walk::text) = '1:first_payment:accepted,2:state_change:collected,3:state_change:accepted',
    json_build_object('events', pg_temp.rbp_events(${A}, p2::text), 'versions', pg_temp.rbp_reasons(${A}, k_walk::text))::text);

  -- ── 5 · edits: before the close → a new version; after the close → a version AND a would-be refusal (observe never blocks) ──
  update public.orders set items = '[{"name":"Crêpe","quantity":2,"unit_price":5}]', subtotal = 10, total = 10, total_minor = 1000, food_minor = 1000 where order_key = k_fn;
  perform pg_temp.rbp_ok('5a · an edit before the day''s close makes version 2 (edit), with no guard event', pg_temp.rbp_reasons(${A}, k_fn::text) = '1:first_payment:accepted,2:edit:accepted' and pg_temp.rbp_events(${A}, k_fn::text) = '' and (select sealed_version from public.orders where order_key = k_fn) = 2, pg_temp.rbp_reasons(${A}, k_fn::text));
  k_late := pg_temp.rbp_walkup(${A}, current_date - 3, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null);
  p5 := pg_temp.rbp_pay(k_late, 'charge', 'in_person_other', 'card', 500, null);
  update public.orders set total = 6, total_minor = 600 where order_key = k_late;
  update public.orders set placed_at = clock_timestamp() where order_key = k_late and placed_at is null;   -- (now() would equal created_at in this one transaction)
  perform pg_temp.rbp_ok('5b · three days ago: the late payment is dated today (its order''s day is closed); an edit makes v2 edit_after_close AND logs would_refuse_after_close (allowed); the placed_at fill makes v3 with no guard event',
    pg_temp.rbp_reasons(${A}, k_late::text) = '1:first_payment:accepted,2:edit_after_close:accepted,3:state_change_after_close:accepted'
      and pg_temp.rbp_events(${A}, k_late::text) = 'would_refuse_after_close'
      and (select (c.payload::jsonb ->> 'trading_day')::date from public.till_chain c where c.truck_id = ${A} and c.kind = 'payment' and c.ref = p5::text) = (now() at time zone public.till_truck_tz(${A}))::date
      and (select total from public.orders where order_key = k_late) = 6,
    json_build_object('versions', pg_temp.rbp_reasons(${A}, k_late::text), 'events', pg_temp.rbp_events(${A}, k_late::text), 'fields', (select detail from public.till_guard_events where ref = k_late::text limit 1))::text);

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
    pg_temp.rbp_reasons(${A}, k_old::text) = '1:first_payment:accepted' and pg_temp.rbp_reasons(${A}, k_new::text) = '1:first_payment:accepted'
      and pg_temp.rbp_reasons(${A}, k_old2::text) = '1:first_payment:accepted' and pg_temp.rbp_reasons(${A}, k_fn::text) = '1:first_payment:accepted,2:edit:accepted'
      and (v ->> 'ok')::boolean,
    v::text);

  -- ── 7 · kitchen moves: cooking, ready, back to confirmed, a slot, a buzzer — no version ──
  update public.orders set status = 'cooking' where order_key = k_fn;
  update public.orders set status = 'ready' where order_key = k_fn;
  update public.orders set status = 'confirmed', slot = '18:30', buzzer_number = 7 where order_key = k_fn;
  perform pg_temp.rbp_ok('7 · kitchen status moves (cooking, ready, back), a slot change and a buzzer make no version', pg_temp.rbp_reasons(${A}, k_fn::text) = '1:first_payment:accepted,2:edit:accepted', pg_temp.rbp_reasons(${A}, k_fn::text));

  -- ── 8 · demo trucks outside the till (the default): nothing chained or logged; their deletes and cascades go through as today ──
  perform set_config('till.include_demo', '', true);
  e0 := (select count(*) from public.till_guard_events);
  k_b := pg_temp.rbp_walkup(${B}, current_date, '[{"name":"Burger","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null);
  pb := pg_temp.rbp_pay(k_b, 'charge', 'in_person_other', 'cash', 500, null);
  update public.orders set status = 'collected', collected_at = now() where order_key = k_b;
  delete from public.orders where order_key = k_b;                                                    -- deleteTruckCascade deletes orders first; payments cascade
  update public.orders set status = 'collected', collected_at = now() where order_key = k_rep;        -- truck A, now outside the till again
  perform pg_temp.rbp_ok('8 · demo trucks are skipped by default: a payment, a collect and an order delete (its payment cascading) on demo trucks chain nothing, log nothing, and succeed',
    not exists (select 1 from public.till_chain where truck_id = ${B}) and not exists (select 1 from public.orders where order_key = k_b)
      and not exists (select 1 from public.order_payments where id = pb) and (select count(*) from public.till_guard_events) = e0
      and pg_temp.rbp_reasons(${A}, k_rep::text) = '' and (select sealed_version from public.orders where order_key = k_rep) is null,
    json_build_object('b_chain', (select count(*) from public.till_chain where truck_id = ${B}), 'events', (select count(*) from public.till_guard_events) - e0)::text);
  perform set_config('till.include_demo', 'on', true);
  delete from public.orders where order_key = k_old;                                                  -- a sealed order and its payment (cascade), till on
  v := public.till_verify(${A});
  perform pg_temp.rbp_ok('8b · with the till on, deleting a sealed order (its payment cascading) is ALLOWED in observe mode, logged for both rows, chained as two deletions — and till_verify stays true',
    not exists (select 1 from public.orders where order_key = k_old) and pg_temp.rbp_events(${A}, k_old::text) = 'would_refuse_delete' and pg_temp.rbp_events(${A}, p_old::text) = 'would_refuse_delete'
      and pg_temp.rbp_entries(${A}, 'deletion', k_old::text) = 1 and pg_temp.rbp_entries(${A}, 'deletion', p_old::text) = 1 and (v ->> 'ok')::boolean,
    v::text);

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

  -- ── 10 · the baseline (built, not run on live data): seals what was there before, once ──
  perform set_config('till.include_demo', '', true);
  k_bl1 := pg_temp.rbp_walkup(${A}, current_date - 1, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'ready', 'rollback proof', null, null, null, null);
  k_bl2 := pg_temp.rbp_walkup(${A}, current_date - 1, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'collected', 'rollback proof', null, null, null, null);
  pbl := pg_temp.rbp_pay(k_bl2, 'charge', 'in_person_other', 'cash', 500, null);
  perform set_config('till.include_demo', 'on', true);
  n_ord := (select count(*) from public.orders where truck_id = ${A} and sealed_version is null and public.till_fiscal_state(status) <> 'pending');
  n_pay := (select count(*) from public.order_payments p where p.truck_id = ${A} and not exists (select 1 from public.till_chain c where c.truck_id = ${A} and c.kind = 'payment' and c.ref = p.id::text));
  vb := public.till_baseline(${A});
  vb2 := public.till_baseline(${A});
  v := public.till_verify(${A});
  perform pg_temp.rbp_ok('10 · till_baseline(truck) seals every unsealed accepted / final order and chains every unchained payment once (reason baseline); a second run does nothing; till_verify is true with nothing left unsealed',
    (vb ->> 'orders_sealed')::int = n_ord and (vb ->> 'payments_chained')::int = n_pay and n_ord >= 3 and n_pay >= 1
      and (vb2 ->> 'orders_sealed')::int = 0 and (vb2 ->> 'payments_chained')::int = 0 and pg_temp.rbp_reasons(${A}, k_bl2::text) = '1:baseline:collected'
      and (v ->> 'ok')::boolean and (v ->> 'unsealed_orders')::int = 0 and (v ->> 'unchained_payments')::int = 0,
    json_build_object('expected', array[n_ord, n_pay], 'first', vb, 'second', vb2, 'verify', v)::text);
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
    not (v2 ->> 'ok')::boolean and v2 -> 'mismatches' -> 0 ->> 'problem' = 'row differs from its sealed form' and (public.till_verify(${A}) ->> 'ok')::boolean,
    v2::text);
` : ''}
  -- ── 12 · no personal data, note or free text in any payload; canonical text independent of key order ──
  perform pg_temp.rbp_ok('12a · no payload holds a name, email, phone, order note, dish note, line note, staff note or staff id — values or keys',
    not exists (select 1 from public.till_chain c where c.truck_id = ${A} and (c.payload ~* '(Rollback Proof Customer|rbp-customer@|\\+3360000000|No onions|coeliac|gluten|staff note|rbp-staff-user|rbp:)'
      or c.payload ~ '"(customer_name|customer_email|customer_phone|notes|line_notes|table_ref|cancellation_reason|rejection_reason|note|created_by|idempotency_key|specialInstructions|slotNotes)"')),
    (select string_agg(left(c.payload, 120), ' | ') from public.till_chain c where c.truck_id = ${A} and c.payload ~* '(Rollback Proof Customer|No onions|gluten|staff note)'));
  s1 := public.till_sealed_lines('[{"quantity":1,"name":"x","unit_price":2.50,"colour":"red","specialInstructions":"no"}]', 'item')::text;
  s2 := public.till_sealed_lines('[{"specialInstructions":"no","colour":"red","unit_price":2.50,"name":"x","quantity":1}]', 'item')::text;
  perform pg_temp.rbp_ok('12b · the canonical text does not depend on the order keys were written in; an unknown key is named (not its value); the note key leaves no trace; 2.50 stays 2.50',
    s1 = s2 and s1 = '[{"name": "x", "quantity": 1, "unit_price": 2.50, "_other_keys": ["colour"]}]', s1 || ' / ' || s2);

  -- ── 13 · the chain at the end: verified, gap-free ──
  v := public.till_verify(${A});
  perform pg_temp.rbp_ok('13 · till_verify(truck A) at the end: ok, gap-free, every link and hash right, the head matches',
    (v ->> 'ok')::boolean and (v ->> 'gaps')::int = 0 and (v ->> 'bad_links')::int = 0 and (v ->> 'bad_hashes')::int = 0 and (v ->> 'bad_payload_hashes')::int = 0 and (v ->> 'head_ok')::boolean, v::text);
end
$proof$`
}
/** Grants, RLS and the untouched function — read in the same transaction. */
const TILL_STATIC = `select
  (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_settings','till_chain','till_chain_heads','till_failures','till_guard_events')) as rls_on,
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_settings','till_chain','till_chain_heads','till_failures','till_guard_events'))::int as tables,
  has_table_privilege('anon', 'public.till_chain', 'SELECT') or has_table_privilege('authenticated', 'public.till_chain', 'SELECT') as api_reads_chain,
  has_table_privilege('service_role', 'public.till_chain', 'UPDATE') or has_table_privilege('service_role', 'public.till_chain', 'DELETE') or has_table_privilege('service_role', 'public.till_chain', 'INSERT') as service_writes_chain,
  has_table_privilege('service_role', 'public.action_audit_log', 'UPDATE') or has_table_privilege('service_role', 'public.action_audit_log', 'DELETE') as service_changes_audit,
  has_table_privilege('service_role', 'public.action_audit_log', 'INSERT') as service_inserts_audit,
  has_function_privilege('anon', 'public.till_append(text,text,text,integer,text,date,jsonb)', 'EXECUTE') or has_function_privilege('service_role', 'public.till_append(text,text,text,integer,text,date,jsonb)', 'EXECUTE') as api_appends,
  has_function_privilege('service_role', 'public.till_baseline(text)', 'EXECUTE') as service_baseline,
  has_function_privilege('service_role', 'public.till_verify(text)', 'EXECUTE') and not has_function_privilege('anon', 'public.till_verify(text)', 'EXECUTE') as verify_service_only,
  (select guard_mode from public.till_settings) as guard_mode, (select software_version from public.till_settings) as software_version,
  md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5,
  (select string_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default, 'none'), ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('sealed_at', 'sealed_version')) as seal_columns`
function checkStatic(s) {
  ok('S1 · the five till tables exist with RLS on', s.tables === 5 && s.rls_on === true, s)
  ok('S2 · anon / authenticated cannot read till_chain; the service role cannot INSERT, UPDATE or DELETE it', s.api_reads_chain === false && s.service_writes_chain === false, s)
  ok('S3 · the service role can no longer UPDATE or DELETE action_audit_log, and can still INSERT', s.service_changes_audit === false && s.service_inserts_audit === true, s)
  ok('S4 · nobody on the API can call till_append or till_baseline; till_verify is the service role\'s only', s.api_appends === false && s.service_baseline === false && s.verify_service_only === true, s)
  ok('S5 · guard_mode observe, software_version 0.x', s.guard_mode === 'observe' && /^0\.\d+\.\d+$/.test(s.software_version), s)
  ok('S6 · place_order_atomic_v2 untouched: md5 e4b273abcf8e7609c6ca54033ed59332', s.v2_md5 === 'e4b273abcf8e7609c6ca54033ed59332', s.v2_md5)
  ok('S7 · orders.sealed_at / sealed_version: nullable, no default', s.seal_columns === 'sealed_at:YES:none,sealed_version:YES:none', s.seal_columns)
}
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
        (select count(*) from public.till_failures where truck_id = any($1))::int as till_failures,
        (select count(*) from public.till_guard_events where truck_id = any($1))::int as till_guard_events,
        (select count(*) from public.orders where truck_id = any($1) and sealed_version is not null)::int as sealed_orders`, [IDS])).rows[0]
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
    if (body) await q(c, tag, body)
    await q(c, tag, tillHelpers())
    await q(c, tag, tillProofBlock(!!file))
    const held = Date.now() - t0
    for (const r of (await q(c, tag, 'select label, ok, detail from _till_proof order by n')).rows) ok(r.label, r.ok, r.ok ? undefined : r.detail)
    checkStatic((await q(c, tag, TILL_STATIC)).rows[0])
    await tillExport(c, tag, mode)
    say(`  the migration${body ? ' and' : ''} the proofs ran in ${held} ms${body ? ' (the DDL locks on orders, order_payments and action_audit_log are held until the rollback below)' : ''}`)
  })
  if (!file) {
    await tillConcurrency()
    await tillTimings()
  }
  const after = await tillCounts('after')
  ok('the demo trucks\' counts (orders, payments, audit rows, counters, the till tables) are identical before and after (nothing was committed)', JSON.stringify(before) === JSON.stringify(after), { before, after })
}
/** Two (three) connections, all rolled back: truck A's chain head is a per-truck lock; truck B is not blocked; a waiter past the
 *  trigger's 2 s lock_timeout still inserts its payment (and logs the failure). */
async function tillConcurrency() {
  say('\n── two connections ──')
  const A = TRUCKS.A, B = TRUCKS.B
  const items = '[{"name":"Crêpe","quantity":1,"unit_price":5}]'
  const walk = (truck) => `select pg_temp.rbp_walkup('${truck}', current_date, '${items}', 'confirmed', 'rollback proof', null, null, null, null) as k`
  const pay = key => `select pg_temp.rbp_pay('${key}', 'charge', 'in_person_other', 'cash', 500, null) as id`
  const open = async tag => { const c = await connect(tag); await q(c, tag, 'begin'); await q(c, tag, "set local till.include_demo = 'on'"); await q(c, tag, tillHelpers()); return c }
  const c1 = await open('c1'), c2 = await open('c2'), c3 = await open('c3')
  try {
    const k1 = (await q(c1, 'c1', walk(A))).rows[0].k
    await q(c1, 'c1', pay(k1))                                     // c1 now holds truck A's chain head
    const k2 = (await q(c2, 'c2', walk(A))).rows[0].k
    const kb = (await q(c3, 'c3', walk(B))).rows[0].k
    const t0 = Date.now()
    const waiting = q(c2, 'c2', pay(k2)).then(r => ({ id: r.rows[0].id, ms: Date.now() - t0 }))
    await new Promise(r => setTimeout(r, 400))
    const tb = Date.now()
    await q(c3, 'c3', pay(kb))
    const bMs = Date.now() - tb
    const bChain = Number((await q(c3, 'c3', 'select count(*) as n from public.till_chain where truck_id = $1', [B])).rows[0].n)
    ok(`truck B's payment is NOT blocked while truck A's chain head is held (${bMs} ms), and chains normally`, bMs < 1000 && bChain >= 2, { bMs, bChain })
    await q(c1, 'c1', 'rollback')
    const w = await waiting
    const wChain = (await q(c2, 'c2', "select count(*)::int as n from public.till_chain where truck_id = $1 and kind = 'payment' and ref = $2", [A, w.id])).rows[0].n
    ok(`truck A's waiter goes in as soon as the holder rolls back (${w.ms} ms), with its chain entry`, w.ms >= 350 && w.ms < 2000 && wChain === 1, { w, wChain })
    // A holder past the trigger's 2 s lock_timeout: c2 now holds A's head; a new connection's payment waits ~2 s, then goes IN unchained.
    const c4 = await open('c4')
    try {
      const k4 = (await q(c4, 'c4', walk(A))).rows[0].k
      const t4 = Date.now()
      const id4 = (await q(c4, 'c4', pay(k4))).rows[0].id
      const ms4 = Date.now() - t4
      const f4 = (await q(c4, 'c4', 'select sqlstate from public.till_failures where ref = $1', [id4])).rows[0]
      const in4 = (await q(c4, 'c4', 'select count(*)::int as n from public.order_payments where id = $1', [id4])).rows[0].n
      ok(`a holder past the trigger's 2 s lock_timeout: truck A's waiter goes IN after ~2 s (${ms4} ms) — the payment inserted, the failure logged (55P03), never an error`, in4 === 1 && f4 && f4.sqlstate === '55P03' && ms4 >= 1900 && ms4 < 3000, { ms4, f4, in4 })
    } finally { try { await q(c4, 'c4', 'rollback') } catch { /* closed */ } await c4.end() }
  } finally {
    for (const [c, t] of [[c1, 'c1'], [c2, 'c2'], [c3, 'c3']]) { try { await q(c, t, 'rollback') } catch { /* already */ } try { await c.end() } catch { /* closed */ } }
  }
}
/** The extra time per write, measured inside the database (clock_timestamp), till off vs on, on truck A, rolled back. */
async function tillTimings() {
  say('\n── the extra time per write ──')
  const N = 40
  await inRollback('timing', async c => {
    await guard(c)
    await q(c, 'timing', tillHelpers())
    const block = (on, what) => `do $t$
declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int;
begin
  perform set_config('till.include_demo', ${on ? "'on'" : "''"}, true);
  for i in 1..${N} loop ks := ks || pg_temp.rbp_walkup(${lit(TRUCKS.A)}, current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null); end loop;
  ${what === 'sealed_payment' || what === 'status_sealed' || what === 'edit_sealed' ? `for i in 1..${N} loop perform pg_temp.rbp_pay(ks[i], 'charge', 'in_person_other', 'cash', 500, null); end loop;` : ''}
  t0 := clock_timestamp();
  for i in 1..${N} loop
    ${{ insert: `k := pg_temp.rbp_walkup(${lit(TRUCKS.A)}, current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null);`,
        first_payment: `perform pg_temp.rbp_pay(ks[i], 'charge', 'in_person_other', 'cash', 500, null);`,
        sealed_payment: `perform pg_temp.rbp_pay(ks[i], 'charge', 'in_person_other', 'cash', 100, null);`,
        status_sealed: `update public.orders set status = 'cooking' where order_key = ks[i];`,
        edit_sealed: `update public.orders set total = 7, total_minor = 700 where order_key = ks[i];` }[what]}
  end loop;
  insert into _till_proof (label, ok, detail) values (${lit(`timing ${what} ${on ? 'on' : 'off'}`)}, true, (extract(epoch from clock_timestamp() - t0) * 1000 / ${N})::numeric(10,3)::text);
end $t$`
    const out = {}
    for (const what of ['insert', 'first_payment', 'sealed_payment', 'status_sealed', 'edit_sealed']) {
      for (const on of [false, true]) {
        await q(c, 'timing', 'savepoint t'); await q(c, 'timing', block(on, what));
        out[`${what}_${on ? 'on' : 'off'}`] = Number((await q(c, 'timing', `select detail from _till_proof where label = $1`, [`timing ${what} ${on ? 'on' : 'off'}`])).rows[0].detail)
      }
    }
    for (const what of ['insert', 'first_payment', 'sealed_payment', 'status_sealed', 'edit_sealed']) {
      say(`  ${what.padEnd(15)} till off ${out[`${what}_off`].toFixed(3)} ms · till on ${out[`${what}_on`].toFixed(3)} ms · extra ${(out[`${what}_on`] - out[`${what}_off`]).toFixed(3)} ms per write (mean of ${N}, inside the database)`)
    }
    fs.mkdirSync(TILL_OUT, { recursive: true })
    fs.writeFileSync(path.join(TILL_OUT, 'timings.json'), JSON.stringify({ n: N, measured: new Date().toISOString(), ms_per_write: out }, null, 1) + '\n')
    ok('timings measured (docs/till-pack-1/timings.json): the extra time for a payment with the till on stays under 20 ms per insert', out.first_payment_on - out.first_payment_off < 20 && out.sealed_payment_on - out.sealed_payment_off < 20, out)
  })
}

async function main() {
  const args = process.argv.slice(2)
  URL_ = dbUrl()
  if (args[0] === '--preflight-till-1' && args[1]) await tillProofs(args[1])
  else if (args[0] === '--till-1-check') await tillProofs(null)
  else if (args[0] === '--preflight-notes' && args[1]) await notesProofs(args[1])
  else if (args[0] === '--notes-check') await notesProofs(null)
  else if (args[0] === '--preflight-regime' && args[1]) await regimeProofs(args[1])
  else if (args[0] === '--regime-check') await regimeProofs(null)
  else if (args[0] === '--preflight' && args[1]) await preflight(args[1])
  else if (args[0] === '--concurrency') await concurrency()
  else if (args[0] === '--old-style-call') await oldStyleCall()
  else die('usage: --preflight <migration.sql> | --concurrency | --old-style-call | --preflight-regime <migration.sql> | --regime-check | --preflight-notes <migration.sql> | --notes-check | --preflight-till-1 <migration.sql> | --till-1-check')
  say(failed ? `\n🔴 ${failed} proof(s) FAILED` : '\n✅ every proof passed')
  process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(`db-rollback-proofs: FAILED (every transaction was rolled back): ${URL_ ? scrub(e && e.message, URL_) : e && e.message}`); process.exit(1) })
