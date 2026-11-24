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
    const o = await rowOf(oldCall.order_key)
    ok('1 · the deployed place_order_atomic_v2 call: its notes stay inside items / deals, line_notes NULL', o.line_notes === null && JSON.stringify(o.items) === JSON.stringify(ITEMS_WITH) && JSON.stringify(o.deals) === JSON.stringify(DEALS_WITH), o)
    // 2 · the new customer path: the same call, then the follow-up update moves the notes (only while line_notes is still NULL)
    const newCall = (await q(c, tag, CALL, [JSON.stringify({ ...OLD_STYLE_ORDER, items: ITEMS_WITH, deals: DEALS_WITH }), A])).rows[0].r
    const n0 = await rowOf(newCall.order_key)
    const moved = (await q(c, tag, 'update public.orders set items = $2::jsonb, deals = $3::jsonb, line_notes = $4::jsonb where order_key = $1 and line_notes is null returning order_key', [newCall.order_key, JSON.stringify(ITEMS_OUT), JSON.stringify(DEALS_OUT), JSON.stringify(LN)])).rows
    const n1 = await rowOf(newCall.order_key)
    ok('2 · the customer path\'s follow-up update: items / deals without notes, the notes in line_notes, the receipt number unchanged', moved.length === 1 && JSON.stringify(n1.items) === JSON.stringify(ITEMS_OUT) && JSON.stringify(n1.deals) === JSON.stringify(DEALS_OUT) && JSON.stringify(n1.line_notes) === JSON.stringify(LN) && String(n1.receipt_no) === String(n0.receipt_no), { n0, n1 })
    const again = (await q(c, tag, 'update public.orders set items = $2::jsonb, deals = $3::jsonb, line_notes = $4::jsonb where order_key = $1 and line_notes is null returning order_key', [newCall.order_key, JSON.stringify(ITEMS_WITH), JSON.stringify(DEALS_WITH), JSON.stringify(LN)])).rows
    ok('3 · …and it never runs twice: a second one (line_notes already set) changes nothing', again.length === 0 && JSON.stringify((await rowOf(newCall.order_key)).items) === JSON.stringify(ITEMS_OUT))
    // 4 · a direct insert (the walk-up, the card promotion) naming line_notes
    const w = (await q(c, tag, WALKUP.replace('source)', 'source, line_notes)').replace("'manual') returning", "'manual', $3::jsonb) returning"), [rid(), A, JSON.stringify(LN)])).rows[0]
    const wr = await rowOf(w.order_key)
    ok('4 · a direct insert naming line_notes stores it exactly (jsonb round trip)', JSON.stringify(wr.line_notes) === JSON.stringify(LN), wr.line_notes)
    // 5 · a card draft naming line_notes
    const d = (await q(c, tag, 'insert into public.order_drafts (order_key, truck_id, subtotal, total, total_minor, items, line_notes) values (gen_random_uuid(), $1, 1, 1, 100, $2::jsonb, $3::jsonb) returning line_notes, items', [A, JSON.stringify(ITEMS_OUT), JSON.stringify(LN)])).rows[0]
    ok('5 · a card draft stores line_notes too', JSON.stringify(d.line_notes) === JSON.stringify(LN) && JSON.stringify(d.items) === JSON.stringify(ITEMS_OUT), d)
    // 6 · retention's write on a new-style order: line_notes and the customer fields only — items / deals byte-identical after
    const blanked = { v: 1, items: { '#0': { at: 3, note: '' } }, deals: { '#0': { at: 3, slotNotes: {} } } }
    await q(c, tag, "update public.orders set customer_name = '', line_notes = $2::jsonb where order_key = $1", [newCall.order_key, JSON.stringify(blanked)])
    const r = (await q(c, tag, 'select items = $2::jsonb as items_same, deals = $3::jsonb as deals_same, line_notes, customer_name from public.orders where order_key = $1', [newCall.order_key, JSON.stringify(ITEMS_OUT), JSON.stringify(DEALS_OUT)])).rows[0]
    ok('6 · retention on a new-style order: the notes and the name blanked, items and deals byte-identical (jsonb =)', r.items_same === true && r.deals_same === true && r.customer_name === '' && JSON.stringify(r.line_notes) === JSON.stringify(blanked), r)
  })
  const after = await counts('after')
  ok('the demo trucks\' counts are identical before and after (nothing was committed)', JSON.stringify(before) === JSON.stringify(after), { before, after })
}

async function main() {
  const args = process.argv.slice(2)
  URL_ = dbUrl()
  if (args[0] === '--preflight-notes' && args[1]) await notesProofs(args[1])
  else if (args[0] === '--notes-check') await notesProofs(null)
  else if (args[0] === '--preflight-regime' && args[1]) await regimeProofs(args[1])
  else if (args[0] === '--regime-check') await regimeProofs(null)
  else if (args[0] === '--preflight' && args[1]) await preflight(args[1])
  else if (args[0] === '--concurrency') await concurrency()
  else if (args[0] === '--old-style-call') await oldStyleCall()
  else die('usage: --preflight <migration.sql> | --concurrency | --old-style-call | --preflight-regime <migration.sql> | --regime-check | --preflight-notes <migration.sql> | --notes-check')
  say(failed ? `\n🔴 ${failed} proof(s) FAILED` : '\n✅ every proof passed')
  process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(`db-rollback-proofs: FAILED (every transaction was rolled back): ${URL_ ? scrub(e && e.message, URL_) : e && e.message}`); process.exit(1) })
