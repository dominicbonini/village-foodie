// scripts/till-pack-2.cjs — till-pack-2 (25 November 2026, docs/till-pack-2-report.md): REVERSALS INSTEAD OF DELETES, COUNTER REFUNDS, DEVICE
// FINGERPRINTS, THE ACTOR'S ROLE, THE 409 — the offline proofs. Never connects to a database or any outside service: it runs the REAL ledger / refund / online code
// against an in-memory order_payments table, and the SAME code as it stood at this prompt's starting commit (2ae128bc, loaded with
// `git show`) against another, and compares what every reader sees.
//
//   A · THE MIGRATION — additive: two nullable columns on order_payments, the widened kind, nothing written to orders / payments / the audit log.
//   B · THE MIRROR = THE DATABASE — docs/till-pack-2 exports (the device key, the pointer / reason keys); the chain verifies offline.
//   C · THE NETTING LEMMA — for any rows and any reversals, what a reader sees after netting is exactly what it saw when the row was deleted.
//   D · THE MONEY PATHS, REAL CODE — undo collected / undo mark paid / a failed refund each INSERT one reversal and DELETE nothing; the
//       status is 'unpaid' (or 'paid') exactly as at START; a re-collect after an undo goes in; the external-reference undo is unchanged.
//   E · EVERY READER, START vs HEAD — balances, the dashboard rows, the ticket, the email payment state, the accountant rows and the daily
//       totals: byte-identical for every case.
//   F · COUNTER REFUNDS AND Q5 — cash and card refund rows with their method; nothing sent to the card processor; Q5's refund per original method.
//   G · THE DEVICE FINGERPRINT — the device side (canonical, sha256, the queued body only), the server side (stored before the order,
//       only when sent); an old-style replay is untouched.
//   H · THE 409 AND THE ACTOR'S ROLE — the sqlstates, the message in every enabled language, the route wiring; the role mapping.
//   I · NO SCREEN OR CUSTOMER OUTPUT CHANGED — no app screen, component, ticket or email file touched; the messages change by one key.
//   J · WHAT THE DEPLOYED CODE WOULD SHOW — origin/main's own getOrderBalance and accountant rows given a reversal row.
//
// Usage: node scripts/till-pack-2.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const M = require('./_till-sealed-mirror.cjs')
const V = require('./till-verify.cjs')
const REPO = path.resolve(__dirname, '..')
const START = '2ae128bc'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const exists = f => fs.existsSync(path.join(REPO, f))
const J = v => JSON.stringify(v)
const code = s => s.replace(/--[^\n]*/g, '')
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const MIG = read('supabase/migrations/20261133_till_pack_2.sql')

// ── bundling: HEAD from the tree; START (and origin/main) from git, file by file ─────────────────────────────────────────────────────
const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
// 🔴 NO EXTERNAL SDK CAN RUN HERE: every bare package the bundled code imports is replaced by an INERT, RECORDING stub — except the pure
// libraries on this allow-list. So the card processor's SDK, the database client and the framework's server helpers can never be reached;
// any call to a stub is recorded (F asserts that a counter refund and Q5 call none but the database client's, which the fake replaces).
const PURE = new Set(['next-intl', 'react'])
const stubCalls = []
globalThis.__tp2inert = pkg => {
  const inert = new Proxy(function () {}, {
    get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : k === '__esModule' ? true : inert),
    apply: () => { stubCalls.push(pkg); return inert },
    construct: () => { stubCalls.push(pkg); return inert },
  })
  return inert
}
async function bundle(contents, ref = null) {
  const files = ref ? new Set(git('ls-tree', '-r', '--name-only', ref).split('\n')) : null
  const resolveAt = rel => { for (const x of ['', '.ts', '.tsx', '.js', '/index.ts', '.json']) if (files.has(rel + x)) return rel + x; return null }
  const plugins = [{ name: 'inert', setup(b) {
    b.onResolve({ filter: /^[^./]/ }, a => {
      if (a.path.startsWith('@/')) return undefined
      const pkg = a.path.startsWith('@') ? a.path.split('/').slice(0, 2).join('/') : a.path.split('/')[0]
      return PURE.has(pkg) ? { path: a.path, external: true } : { path: a.path, namespace: 'inert' }
    })
    b.onLoad({ filter: /.*/, namespace: 'inert' }, a => ({ contents: `module.exports = globalThis.__tp2inert(${JSON.stringify(a.path)})`, loader: 'js' }))
    if (!ref) return
    b.onResolve({ filter: /^@\// }, a => { const p = resolveAt(a.path.slice(2)); if (!p) throw new Error(`${ref}: cannot resolve ${a.path}`); return { path: p, namespace: 'git' } })
    b.onResolve({ filter: /^\.\.?\//, namespace: 'git' }, a => { const p = resolveAt(path.posix.normalize(path.posix.join(path.posix.dirname(a.importer), a.path))); if (!p) throw new Error(`${ref}: cannot resolve ${a.path} from ${a.importer}`); return { path: p, namespace: 'git' } })
    b.onLoad({ filter: /.*/, namespace: 'git' }, a => ({ contents: git('show', `${ref}:${a.path}`), loader: a.path.endsWith('.json') ? 'json' : a.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: REPO }))
  } }]
  const out = (await esbuild.build({ stdin: { contents, resolveDir: REPO, loader: 'ts', sourcefile: 'entry.ts' }, bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
    alias: ref ? {} : { '@': REPO }, plugins })).outputFiles[0].text
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', out)(mod, mod.exports, require)
  return mod.exports
}

// ── an in-memory database for the money code (PostgREST's builder, the subset these modules use) ────────────────────────────────────
function fakeDb(seed = {}) {
  const T = { orders: [], order_payments: [], action_audit_log: [], order_drafts: [], trucks: [], operators: [], ...JSON.parse(JSON.stringify(seed)) }
  const calls = []
  let clock = Date.parse('2026-11-25T12:00:00Z')
  const now = () => new Date(clock += 1000).toISOString()
  const pick = (r, cols) => { if (!cols || cols.trim() === '*') return { ...r }; const o = {}; for (const c of cols.split(',').map(x => x.trim()).filter(Boolean)) o[c] = r[c] === undefined ? null : r[c]; return o }
  function checkPayment(r, all) {
    if (!['charge', 'refund', 'reversal'].includes(r.kind)) return { code: '23514', message: 'order_payments_kind_chk' }
    if ((r.kind === 'reversal') !== (r.reverses_payment_id != null)) return { code: '23514', message: 'order_payments_reversal_points_chk' }
    if (r.reason != null && !/^[a-z_]{1,40}$/.test(r.reason)) return { code: '23514', message: 'order_payments_reason_word_chk' }
    if (!(r.amount_minor > 0)) return { code: '23514', message: 'amount' }
    if (r.idempotency_key != null && all.some(x => x.idempotency_key === r.idempotency_key)) return { code: '23505', message: 'idempotency_key' }
    if (r.reverses_payment_id != null && all.some(x => x.reverses_payment_id === r.reverses_payment_id)) return { code: '23505', message: 'one reversal' }
    return null
  }
  function from(table) {
    const st = { table, filters: [], op: 'select', cols: '*', head: false }
    const run = async () => {
      const rows = T[table] ?? (T[table] = [])
      const match = rows.filter(r => st.filters.every(f => f(r)))
      if (st.op === 'insert') {
        for (const raw of st.rows) {
          const r = { id: crypto.randomUUID(), created_at: now(), ...raw }
          if (table === 'order_payments') { r.livemode = r.livemode ?? true; r.state = r.state ?? 'succeeded'; const e = checkPayment(r, rows); if (e) { calls.push({ op: 'insert_refused', table, row: r, code: e.code }); return { data: null, error: e } } }
          rows.push(r); calls.push({ op: 'insert', table, row: r })
        }
        return { data: st.single ? pick(rows[rows.length - 1], st.cols) : null, error: null }
      }
      if (st.op === 'update') { for (const r of match) Object.assign(r, st.patch); calls.push({ op: 'update', table, n: match.length, patch: st.patch }); return { data: null, error: null } }
      if (st.op === 'delete') { T[table] = rows.filter(r => !match.includes(r)); calls.push({ op: 'delete', table, n: match.length, ids: match.map(r => r.id) }); return { data: null, error: null } }
      let out = match.slice()
      if (st.order) out.sort((a, b) => (a[st.order.c] < b[st.order.c] ? -1 : a[st.order.c] > b[st.order.c] ? 1 : 0) * (st.order.asc ? 1 : -1))
      out = out.map(r => pick(r, st.cols))
      if (st.head) return { data: null, count: out.length, error: null }
      if (st.single === 'one') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: `${out.length} rows` } }
      if (st.single === 'maybe') return { data: out[0] ?? null, error: null }
      return { data: out, error: null }
    }
    const api = {
      select(cols, opts) { if (st.op === 'select') st.cols = cols ?? '*'; if (opts?.head) st.head = true; return api },
      eq(c, v) { st.filters.push(r => r[c] === v); return api }, neq(c, v) { st.filters.push(r => r[c] !== v); return api },
      in(c, vs) { st.filters.push(r => vs.includes(r[c])); return api }, is(c, v) { st.filters.push(r => (v === null ? r[c] == null : r[c] === v)); return api },
      gte(c, v) { st.filters.push(r => r[c] >= v); return api }, lt(c, v) { st.filters.push(r => r[c] < v); return api },
      or(expr) { if (expr !== 'livemode.eq.true,and(livemode.eq.false,channel.eq.online)') throw new Error(`fakeDb .or(${expr})`); st.filters.push(r => r.livemode === true || (r.livemode === false && r.channel === 'online')); return api },
      order(c, o) { st.order = { c, asc: o?.ascending !== false }; return api }, range() { return api }, limit() { return api },
      insert(rows) { st.op = 'insert'; st.rows = Array.isArray(rows) ? rows : [rows]; return api },
      update(p) { st.op = 'update'; st.patch = p; return api }, delete() { st.op = 'delete'; return api },
      single() { st.single = 'one'; return run() }, maybeSingle() { st.single = 'maybe'; return run() },
      then(res, rej) { return run().then(res, rej) },
    }
    return api
  }
  return { T, calls, from, rpc: async (name, args) => { calls.push({ op: 'rpc', name, args }); return { data: name === 'till_head_seq' ? 0 : 0, error: null } } }
}
const ORDER = { order_key: 'o-1', truck_id: 'truck-1', id: '7', total: 5, total_minor: 500, currency: 'GBP', country: 'GB', status: 'confirmed', payment_status: 'unpaid', amount_paid: 0,
  food_minor: 500, tax_minor: 0, tax_inclusive: true, tax_label: 'VAT', tax_rate_milli: null, tip_minor: 0, tip_pct_bps: null, service_fee_minor: 0, service_fee_recipient: null,
  card_surcharge_minor: 0, card_funding: null, card_fee_payer: 'truck', application_fee_minor: null, tax_breakdown: null, items: [{ name: 'Pie', quantity: 1, unit_price: 5 }], deals: null,
  created_at: '2026-11-25T11:00:00.000Z', placed_at: '2026-11-25T11:00:00.000Z', event_date: '2026-11-25', event_id: null, van_id: null, source: 'manual', receipt_no: null }
const LEDGER_COLS = 'order_key, truck_id, kind, channel, amount_minor, state, external_ref, livemode, method'
const quiet = async f => { const e = console.error, w = console.warn, l = console.log; console.error = () => {}; console.warn = () => {}; console.log = () => {}; try { return await f() } finally { console.error = e; console.warn = w; console.log = l } }

;(async () => {
  // ══ A ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('A · THE MIGRATION (20261133_till_pack_2.sql) — additive, writes nothing')
  {
    const c = code(MIG)
    t('order_payments gains exactly two nullable columns, no default: reverses_payment_id (→ order_payments(id) ON DELETE CASCADE) and reason',
      J([...c.matchAll(/alter table public\.order_payments add column if not exists (\w+) ([^;]+);/g)].map(m => [m[1], m[2].trim()])) === J([['reverses_payment_id', 'uuid references public.order_payments (id) on delete cascade'], ['reason', 'text']]))
    t('the kind check is widened to charge | refund | reversal (the old one dropped and re-added — no other constraint dropped); a reversal must point, only a reversal points; the reason is a short word; one reversal per payment',
      (c.match(/drop constraint/g) || []).length === 1 && /drop constraint if exists order_payments_kind_chk;/.test(c) && /check \(kind = any \(array\['charge'::text, 'refund'::text, 'reversal'::text\]\)\)/.test(c)
      && /check \(\(kind = 'reversal'\) = \(reverses_payment_id is not null\)\)/.test(c) && /reason ~ '\^\[a-z_\]\{1,40\}\$'/.test(c) && /create unique index if not exists order_payments_one_reversal_uidx on public\.order_payments \(reverses_payment_id\) where reverses_payment_id is not null/.test(c))
    t('🔴 nothing is written to orders, order_payments, action_audit_log or trucks — no INSERT INTO / UPDATE / DELETE FROM them anywhere (functions included); place_order_atomic_v2 not touched; no DROP of a table, function or column',
      !/\b(insert\s+into|update|delete\s+from)\s+(only\s+)?(public\.)?"?(orders|order_payments|action_audit_log|trucks)"?\b/i.test(c) && !/place_order_atomic/.test(c) && !/\bdrop\s+(table|function|column|trigger|index)\b/i.test(c))
    t('the two new till tables are RLS-on, nothing for anon / authenticated, no writes for the service role, append-only by trigger (UPDATE, DELETE, TRUNCATE)',
      /alter table public\.till_device_fingerprints enable row level security/.test(c) && /alter table public\.till_entry_actors\s+enable row level security/.test(c)
      && /revoke insert, update, delete, truncate, references, trigger on public\.till_device_fingerprints from service_role/.test(c) && /revoke insert, update, delete, truncate, references, trigger on public\.till_entry_actors from service_role/.test(c)
      && (c.match(/execute function public\.till_refuse_change\(\)/g) || []).length === 4)
    const fns = [...c.matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1])
    const revoked = [...c.matchAll(/^revoke all on function public\.(\w+)\(/gm)].map(m => m[1])
    t(`every function it creates or replaces (${fns.length}) is revoked from public / anon / authenticated / service_role, one statement each; only till_record_device, till_head_seq and till_record_actor are granted back (to the service role)`,
      J([...new Set(fns)].sort()) === J([...new Set(revoked)].sort()) && J([...c.matchAll(/^grant execute on function public\.(\w+)\([^)]*\) to (\w+);/gm)].map(m => `${m[1]}:${m[2]}`).sort()) === J(['till_head_seq:service_role', 'till_record_actor:service_role', 'till_record_device:service_role']))
    t('the sealed forms gain keys ONLY where the new data exists (device; reverses_payment_id / reason), so an entry written before stays matching',
      /\|\| case when dv is null then '\{\}'::jsonb else jsonb_build_object\('device', dv\) end/.test(c) && /\|\| case when p\.reverses_payment_id is null then '\{\}'::jsonb else jsonb_build_object\('reverses_payment_id', p\.reverses_payment_id\) end/.test(c)
      && /\|\| case when p\.reason is null then '\{\}'::jsonb else jsonb_build_object\('reason', p\.reason\) end/.test(c))
    t('till_record_device stores nothing for a truck outside the till or for an order that already exists (its sealed form must not change)', /if p_order_key is null or not public\.till_applies\(p_truck\) then return false; end if;\s+if exists \(select 1 from public\.orders o where o\.order_key = p_order_key\) then return false; end if;/.test(c))
  }

  // ══ B ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const EXPORTS = ['preflight', 'check'].filter(m => exists(`docs/till-pack-2/rows-${m}.json`))
  head(`B · THE MIRROR = THE DATABASE (${EXPORTS.join(', ') || 'no export'} — demo rows sealed by the real functions, rolled back)`)
  {
    t('a database export exists (docs/till-pack-2/rows-*.json, written by db-rollback-proofs.cjs --preflight-till-2 / --till-2-check)', EXPORTS.length > 0)
    for (const m of EXPORTS) {
      const d = JSON.parse(read(`docs/till-pack-2/rows-${m}.json`))
      const badO = d.orders.filter(r => M.jsonbText(M.sealedOrder(M.parseRaw(r.row), r.device ? M.parseRaw(r.device) : null)) !== r.sealed)
      const badP = d.payments.filter(r => M.jsonbText(M.sealedPayment(M.parseRaw(r.row))) !== r.sealed)
      const withDevice = d.orders.filter(r => r.device).length, withPointer = d.payments.filter(r => M.parseRaw(r.row).reverses_payment_id).length, withReason = d.payments.filter(r => M.parseRaw(r.row).reason).length
      t(`${m}: the mirror gives the database's sealed text byte for byte — ${d.orders.length} orders (${withDevice} with a device), ${d.payments.length} payments (${withPointer} reversals, ${withReason} with a reason)`,
        !badO.length && !badP.length && withDevice >= 1 && withPointer >= 3 && withReason >= 5, { badO: badO.slice(0, 1).map(r => [r.sealed.slice(0, 300)]), badP: badP.length })
      const r = V.verifyText(read(`docs/till-pack-2/chain-${m}.jsonl`))
      t(`${m}: scripts/till-verify.cjs verifies the exported chain (${Object.values(r.trucks).map(x => `${x.entries} entries`).join(', ')}) — identity references, versions, deltas, till_id, VAT`, r.ok, r.problems.slice(0, 3))
    }
  }

  // ══ C ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('C · THE NETTING LEMMA (lib/payments/reversals.ts) — netted = what a reader saw when the row was deleted')
  const R = await bundle("export * from '@/lib/payments/reversals'")
  {
    let seed = 7, bad = 0, cases = 0
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    for (let i = 0; i < 2000; i++) {
      const rows = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, j) => ({ id: `p${i}-${j}`, order_key: `o${i % 3}`, kind: rnd() < 0.7 ? 'charge' : 'refund', channel: rnd() < 0.5 ? 'in_person_other' : 'online',
        amount_minor: 1 + Math.floor(rnd() * 900), state: 'succeeded', livemode: true, method: rnd() < 0.5 ? 'cash' : null, external_ref: null, truck_id: 't', reverses_payment_id: null }))
      const targets = rows.filter(() => rnd() < 0.4)
      const reversals = targets.map((p, j) => ({ ...p, id: `r${i}-${j}`, kind: 'reversal', reverses_payment_id: p.id }))
      const mixed = [...rows, ...reversals].sort(() => rnd() - 0.5)
      const head2 = R.netted(mixed)
      const start = mixed.filter(r => r.kind !== 'reversal' && !targets.includes(r)).map(r => { const { id: _a, reverses_payment_id: _b, ...rest } = r; void _a; void _b; return rest })
      cases++; if (J(head2) !== J(start)) bad++
    }
    t(`2000 random ledgers with random reversals (in any order): netted() returns exactly the rows that remained when each reversed row was DELETED, in the same order, with exactly today's columns`, bad === 0 && cases === 2000, { bad })
    const plain = [{ id: 'a', kind: 'charge', amount_minor: 5 }, { id: 'b', kind: 'refund', amount_minor: 2 }]
    t('with no reversal in the set, withoutReversals is the set itself (row for row) and netted only drops the two netting keys', J(R.withoutReversals(plain)) === J(plain) && J(R.netted(plain)) === J([{ kind: 'charge', amount_minor: 5 }, { kind: 'refund', amount_minor: 2 }]))
    t('a reversal whose target is not in the slice is still dropped (never money in its own right); a pending reversal cancels nothing', J(R.withoutReversals([{ id: 'r', kind: 'reversal', reverses_payment_id: 'x' }])) === '[]'
      && R.withoutReversals([{ id: 'a', kind: 'charge' }, { id: 'r', kind: 'reversal', reverses_payment_id: 'a', state: 'pending' }]).length === 1 && R.reversalCount([{ id: 'r', kind: 'reversal', reverses_payment_id: 'a' }]) === 1)
  }

  // ══ D / E ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('D · THE MONEY PATHS — the REAL ledger / online code, HEAD vs START (2ae128bc), each on its own in-memory table')
  const ENTRY = "export { recordCollectionPayment, reverseCollectionPayment, readOrderBalance, readLedger, getOrderBalance, recalcOrderPayment } from '@/lib/payments/ledger'\nexport { recordOnlineCardPayment, recordOnlineCardRefund, removeFailedOnlineRefund } from '@/lib/payments/online'\nexport { resolveEmailPayment } from '@/lib/payments/email-payment-state'\nexport { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'\nexport { accountRows } from '@/lib/accounts/ledger'"
  const H = await bundle(ENTRY + "\nexport { refundOrder, refundCounterOnCancel } from '@/lib/payments/refund'\nexport * from '@/lib/payments/reversals'")
  const S = await bundle(ENTRY, START)
  const startDaily = await bundle("export { dailyTotals } from '@/lib/accounts/daily-totals'", START)
  const headDaily = await bundle("export { dailyTotals } from '@/lib/accounts/daily-totals'")
  /** One scenario on one code version: returns the db, and what every reader sees afterwards. */
  async function scenario(Code, isHead, steps) {
    const db = fakeDb({ orders: [{ ...ORDER }] })
    await quiet(() => steps(Code, db, isHead))
    const raw = db.T.order_payments
    const shown = isHead ? H.netted(raw.map(r => ({ ...Object.fromEntries(LEDGER_COLS.split(', ').map(c => [c, r[c] ?? null])), id: r.id, reverses_payment_id: r.reverses_payment_id ?? null })))
      : raw.map(r => Object.fromEntries(LEDGER_COLS.split(', ').map(c => [c, r[c] ?? null])))
    const order = db.T.orders[0]
    const balance = await quiet(() => Code.readOrderBalance(db, order.order_key))
    const ledger = await quiet(() => Code.readLedger(db, order.order_key))
    const email = await quiet(() => Code.resolveEmailPayment(db, order.order_key))
    const ticket = await quiet(() => Code.mapOrderToTicket({ order: { ...order }, truck: { id: 'truck-1', name: 'Rollback Proof', country: 'GB' }, event: null, ledgerRows: shown, printedLabel: '12:00' }))
    const acctPays = isHead ? H.netted(raw.map(r => ({ order_key: r.order_key, kind: r.kind, channel: r.channel, amount_minor: r.amount_minor, state: r.state, id: r.id, reverses_payment_id: r.reverses_payment_id ?? null })))
      : raw.map(r => ({ order_key: r.order_key, kind: r.kind, channel: r.channel, amount_minor: r.amount_minor, state: r.state }))
    const acct = Code.accountRows({ orders: [{ ...order, customer_email: null }], payments: acctPays, costs: [], itemIdByName: {}, timeZone: 'Europe/London', currency: 'GBP', tax: { inclusive: true, rateMilli: 20000 } })
    const dailyPays = isHead ? H.netted(raw.map(r => ({ order_key: r.order_key, kind: r.kind, amount_minor: r.amount_minor, state: r.state, created_at: r.created_at, id: r.id, reverses_payment_id: r.reverses_payment_id ?? null })))
      : raw.map(r => ({ order_key: r.order_key, kind: r.kind, amount_minor: r.amount_minor, state: r.state, created_at: r.created_at }))
    const daily = (isHead ? headDaily : startDaily).dailyTotals({ orders: [{ ...order }], payments: dailyPays, from: '2026-11-01', to: '2026-11-30', timeZone: 'Europe/London', tax: { inclusive: true, rateMilli: 20000 }, cancelledAt: {} })
    const view = { status: order.payment_status, amount_paid: order.amount_paid, balance, ledger, dashboardRows: shown, email, ticket, acct, daily }
    return { db, view }
  }
  const pays = db => db.calls.filter(c => c.table === 'order_payments')
  const CASES = [
    ['undo "Mark paid" (cash)', async (C, db, h) => { await C.recordCollectionPayment(db, { orderKey: 'o-1', truckId: 'truck-1', method: 'cash' }); await C.reverseCollectionPayment(db, h ? { orderKey: 'o-1', truckId: 'truck-1', reason: 'undo_mark_paid', beforeReverse: async () => {} } : { orderKey: 'o-1', truckId: 'truck-1', beforeDelete: async () => {} }) }, 'unpaid'],
    ['undo collected (card machine)', async (C, db, h) => { await C.recordCollectionPayment(db, { orderKey: 'o-1', truckId: 'truck-1', method: 'card' }); db.T.orders[0].status = 'collected'; await C.reverseCollectionPayment(db, h ? { orderKey: 'o-1', truckId: 'truck-1', reason: 'undo_collected', beforeReverse: async () => {} } : { orderKey: 'o-1', truckId: 'truck-1', beforeDelete: async () => {} }); db.T.orders[0].status = 'confirmed' }, 'unpaid'],
    ['collect → undo → collect again', async (C, db, h) => { await C.recordCollectionPayment(db, { orderKey: 'o-1', truckId: 'truck-1', method: 'cash' }); await C.reverseCollectionPayment(db, h ? { orderKey: 'o-1', truckId: 'truck-1', reason: 'undo_mark_paid' } : { orderKey: 'o-1', truckId: 'truck-1' }); await C.recordCollectionPayment(db, { orderKey: 'o-1', truckId: 'truck-1', method: 'cash' }) }, 'paid'],
    ['two undos in a row (the second finds nothing)', async (C, db, h) => { await C.recordCollectionPayment(db, { orderKey: 'o-1', truckId: 'truck-1' }); for (let i = 0; i < 2; i++) await C.reverseCollectionPayment(db, h ? { orderKey: 'o-1', truckId: 'truck-1', reason: 'undo_mark_paid' } : { orderKey: 'o-1', truckId: 'truck-1' }) }, 'unpaid'],
    ['a refund that FAILED (online)', async (C, db) => { await C.recordOnlineCardPayment(db, { orderKey: 'o-1', truckId: 'truck-1', amountMinor: 500, paymentIntentId: 'pi_1', livemode: true, currency: 'GBP' }); await C.recordOnlineCardRefund(db, { orderKey: 'o-1', truckId: 'truck-1', amountMinor: 500, refundId: 're_1', paymentIntentId: 'pi_1', livemode: true, currency: 'GBP' }); await C.removeFailedOnlineRefund(db, { orderKey: 'o-1', truckId: 'truck-1', refundId: 're_1', failureReason: 'expired_or_canceled_card', eventType: 'refund.failed' }) }, 'paid'],
    ['a failed refund delivered twice', async (C, db) => { await C.recordOnlineCardPayment(db, { orderKey: 'o-1', truckId: 'truck-1', amountMinor: 500, paymentIntentId: 'pi_2', livemode: true, currency: 'GBP' }); await C.recordOnlineCardRefund(db, { orderKey: 'o-1', truckId: 'truck-1', amountMinor: 200, refundId: 're_2', paymentIntentId: 'pi_2', livemode: true, currency: 'GBP' }); for (let i = 0; i < 2; i++) await C.removeFailedOnlineRefund(db, { orderKey: 'o-1', truckId: 'truck-1', refundId: 're_2', failureReason: null, eventType: 'refund.failed' }) }, 'paid'],
    ['no reversal at all (a plain collect)', async (C, db) => { await C.recordCollectionPayment(db, { orderKey: 'o-1', truckId: 'truck-1', method: 'cash' }) }, 'paid'],
  ]
  const results = []
  for (const [name, steps, want] of CASES) {
    const h = await scenario(H, true, steps), s = await scenario(S, false, steps)
    results.push({ name, h, s, want })
    const hp = pays(h.db), sp = pays(s.db)
    const hDel = hp.filter(c => c.op === 'delete').length, sDel = sp.filter(c => c.op === 'delete').length
    const hRev = hp.filter(c => c.op === 'insert' && c.row.kind === 'reversal')
    const reversing = /undo|FAILED|failed refund/.test(name) && !/no reversal/.test(name)
    if (reversing) {
      t(`${name}: HEAD inserts ${hRev.length} reversal row(s) — pointing at the row it cancels, with its reason — and DELETES NOTHING (START deleted ${sDel})`,
        hDel === 0 && hRev.length === (name.startsWith('collect → undo') || name.startsWith('two undos') || name.startsWith('undo') || name.startsWith('a refund') || name.startsWith('a failed') ? 1 : 0) && sDel >= 1
          && hRev.every(c => h.db.T.order_payments.some(p => p.id === c.row.reverses_payment_id) && /^(undo_collected|undo_mark_paid|refund_failed)$/.test(c.row.reason)), { hDel, hRev: hRev.length, sDel })
    }
    t(`${name}: the payment status is '${want}' at HEAD, exactly as at START (and amount_paid, readOrderBalance)`, h.view.status === want && s.view.status === want && h.view.amount_paid === s.view.amount_paid && J(h.view.balance) === J(s.view.balance), { head: [h.view.status, h.view.balance], start: [s.view.status, s.view.balance] })
  }
  head('E · EVERY READER, START vs HEAD — the same figures, byte for byte, for every case')
  for (const { name, h, s } of results) {
    const keys = ['ledger', 'dashboardRows', 'email', 'ticket', 'acct', 'daily']
    const diff = keys.filter(k => J(h.view[k]) !== J(s.view[k]))
    t(`${name}: the server's ledger read, the dashboard / KDS rows, the email payment state, the printed ticket, the accountant rows and the daily totals are identical to START`, diff.length === 0, diff.map(k => [k, J(h.view[k]).slice(0, 300), J(s.view[k]).slice(0, 300)]))
  }
  {
    const r = results.find(x => x.name === 'collect → undo → collect again')
    const keys = pays(r.h.db).filter(c => c.op === 'insert' && c.row.kind === 'charge').map(c => c.row.idempotency_key)
    t('collect → undo → collect: the second charge goes in under the suffixed key (…:0:500:r1) — the first key is today\'s byte for byte', keys.length === 2 && keys[0] === 'collect:o-1:0:500' && keys[1] === 'collect:o-1:0:500:r1', keys)
  }

  // ══ F ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('F · COUNTER REFUNDS AND Q5 — the real refund code; nothing reaches the card processor')
  {
    const actor = { actorKind: 'staff', actorId: 'u-1', actorLabel: null }
    const db = fakeDb({ orders: [{ ...ORDER, total: 10, total_minor: 1000, food_minor: 1000 }] })
    await quiet(() => H.recordCollectionPayment(db, { orderKey: 'o-1', truckId: 'truck-1', method: 'cash' }))
    const callsBefore = stubCalls.length
    const a = await quiet(() => H.refundOrder(db, { orderKey: 'o-1', truckId: 'truck-1', amountMinor: 400, reason: 'item_unavailable', note: null, actor, source: 'web', inPerson: { method: 'cash' } }))
    const b = await quiet(() => H.refundOrder(db, { orderKey: 'o-1', truckId: 'truck-1', amountMinor: 200, reason: 'quality_issue', note: null, actor, source: 'web', inPerson: { method: 'card' } }))
    const c = await quiet(() => H.refundOrder(db, { orderKey: 'o-1', truckId: 'truck-1', amountMinor: 500, reason: 'other', note: 'x', actor, source: 'web', inPerson: { method: 'cash' } }))
    const refunds = db.T.order_payments.filter(p => p.kind === 'refund')
    t('counter refunds: cash 4.00 and card 2.00 each write ONE refund row (channel in_person_other, the method, the reason); 5.00 more than the 4.00 left is refused (exceeds_remaining); the order reads part_refunded',
      a.status === 'refunded' && b.status === 'refunded' && c.status === 'refused' && c.reason === 'exceeds_remaining' && c.remainingMinor === 400
        && J(refunds.map(r => [r.channel, r.method, r.amount_minor, r.reason])) === J([['in_person_other', 'cash', 400, 'item_unavailable'], ['in_person_other', 'card', 200, 'quality_issue']]) && db.T.orders[0].payment_status === 'part_refunded',
      { a: a.status, b: b.status, c, refunds: refunds.map(r => [r.method, r.amount_minor]) })
    const outside = [...new Set(stubCalls.slice(callsBefore))].filter(p => p !== '@supabase/supabase-js')
    t('…and an audit row for each (refund_issued, channel and method); no outside SDK was called — not the card processor\'s, not any other (only the database client\'s inert stub, behind the refusal message\'s money format)', db.T.action_audit_log.filter(x => x.action === 'refund_issued').length === 2 && outside.length === 0, outside)
    const online = fakeDb({ orders: [{ ...ORDER }] }), onlineStart = fakeDb({ orders: [{ ...ORDER }] })
    const o1 = await quiet(() => H.refundOrder(online, { orderKey: 'o-1', truckId: 'truck-1', amountMinor: 100, reason: 'other', note: 'x', actor, source: 'web' }))
    const S2 = await bundle("export { refundOrder } from '@/lib/payments/refund'", START)
    const o2 = await quiet(() => S2.refundOrder(onlineStart, { orderKey: 'o-1', truckId: 'truck-1', amountMinor: 100, reason: 'other', note: 'x', actor, source: 'web' }))
    t('without `inPerson`, refundOrder takes the online card path exactly as at START (same outcome on the same order)', J(o1) === J(o2), { head: o1, start: o2 })
    // Q5
    const q = fakeDb({ orders: [{ ...ORDER, status: 'cancelled', total: 10, total_minor: 1000, food_minor: 1000 }], order_payments: [
      { id: 'c1', order_key: 'o-1', truck_id: 'truck-1', kind: 'charge', channel: 'in_person_other', method: 'cash', amount_minor: 300, state: 'succeeded', livemode: true, currency: 'GBP', created_at: '2026-11-25T11:01:00Z', idempotency_key: 'k1' },
      { id: 'c2', order_key: 'o-1', truck_id: 'truck-1', kind: 'charge', channel: 'in_person_other', method: 'card', amount_minor: 200, state: 'succeeded', livemode: true, currency: 'GBP', created_at: '2026-11-25T11:02:00Z', idempotency_key: 'k2' },
      { id: 'c3', order_key: 'o-1', truck_id: 'truck-1', kind: 'charge', channel: 'online', method: 'card', amount_minor: 500, state: 'succeeded', livemode: true, currency: 'GBP', external_ref: 'pi_9', created_at: '2026-11-25T11:03:00Z', idempotency_key: 'k3' },
    ] })
    const q1 = await quiet(() => H.refundCounterOnCancel(q, { orderKey: 'o-1', truckId: 'truck-1' }))
    const q2 = await quiet(() => H.refundCounterOnCancel(q, { orderKey: 'o-1', truckId: 'truck-1' }))
    const qr = q.T.order_payments.filter(p => p.kind === 'refund')
    t('Q5: cancelling records ONE counter refund per original method (cash 3.00, card 2.00, reason order_cancelled); the online card charge is NOT touched; a second run writes nothing',
      J(qr.map(r => [r.channel, r.method, r.amount_minor, r.reason])) === J([['in_person_other', 'cash', 300, 'order_cancelled'], ['in_person_other', 'card', 200, 'order_cancelled']]) && q1.refunded.length === 2 && q2.refunded.length === 0,
      qr.map(r => [r.method, r.amount_minor]))
    const none = fakeDb({ orders: [{ ...ORDER, status: 'cancelled' }] })
    const q3 = await quiet(() => H.refundCounterOnCancel(none, { orderKey: 'o-1', truckId: 'truck-1' }))
    t('Q5: an unpaid order, or one paid only online, gets no counter refund (nothing written)', q3.refunded.length === 0 && none.T.order_payments.length === 0)
    t('…and no outside SDK was called by any counter refund or Q5 run', [...new Set(stubCalls.slice(callsBefore))].every(p => p === '@supabase/supabase-js'), [...new Set(stubCalls.slice(callsBefore))])
    const undone = fakeDb({ orders: [{ ...ORDER, status: 'cancelled' }] })
    await quiet(async () => { await H.recordCollectionPayment(undone, { orderKey: 'o-1', truckId: 'truck-1', method: 'cash' }); await H.reverseCollectionPayment(undone, { orderKey: 'o-1', truckId: 'truck-1', reason: 'undo_mark_paid' }) })
    const q4 = await quiet(() => H.refundCounterOnCancel(undone, { orderKey: 'o-1', truckId: 'truck-1' }))
    t('Q5: a collection that was UNDONE (reversed) is not counter money — no refund for it', q4.refunded.length === 0 && !undone.T.order_payments.some(p => p.kind === 'refund'))
    const route = read('app/api/dashboard/action/route.ts'), cust = read('app/api/orders/cancel/route.ts'), ev = read('app/api/events/action/route.ts')
    const cancelBlock = route.slice(route.indexOf("if (action === 'cancel') {"), route.indexOf("if (action === 'ready') {"))
    t('Q5 runs AFTER each cancellation\'s email and before its response — the operator cancel, the customer cancel and the event cancellation — so every email and response is as before',
      cancelBlock.indexOf('refundCounterOnCancel(') > cancelBlock.indexOf('await notifyCustomer(') && cancelBlock.indexOf('refundCounterOnCancel(') < cancelBlock.indexOf("return NextResponse.json({ success: true, status: 'cancelled' })")
        && cust.indexOf('refundCounterOnCancel(') > cust.indexOf('await sendCancellationEmail(') && cust.indexOf('refundCounterOnCancel(') < cust.indexOf('return NextResponse.json({ ok: true, paymentState })')
        && ev.indexOf('refundCounterOnCancel(') > ev.indexOf('await sendEventCancellationEmail('))
    const refundBlock = route.slice(route.indexOf("if (action === 'refund') {"), route.indexOf("switch (outcome.status)", route.indexOf("if (action === 'refund') {")))
    t('a counter refund is API only (`refund_channel: \'in_person\'` + method) and sends NO customer email; without it the refund route is the online one, as before',
      /body\.refund_channel === 'in_person' && \(body\.method === 'cash' \|\| body\.method === 'card'\)/.test(refundBlock) && /body\.refund_context !== 'cancellation' && !inPerson\)/.test(refundBlock))
  }

  // ══ G ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('G · THE DEVICE FINGERPRINT (law change 8)')
  const F = await bundle("export * from '@/lib/till/device-fingerprint'")
  {
    const order = { items: [{ name: 'Crêpe', quantity: 1, unit_price: 5 }], total: 5, placedAt: '2026-11-25T10:00:00.000Z', provisional_id: 'A3' }
    const shuffled = { provisional_id: 'A3', placedAt: '2026-11-25T10:00:00.000Z', total: 5, items: [{ unit_price: 5, quantity: 1, name: 'Crêpe' }] }
    const sha = async s => crypto.createHash('sha256').update(s, 'utf8').digest('hex')
    const at = new Date('2026-11-25T10:00:01.234Z')
    const d1 = await F.tillDeviceFor('k-1', order, 'dev-1', sha, at), d2 = await F.tillDeviceFor('k-1', shuffled, 'dev-1', sha, at)
    t('the device hashes the canonical text of {order_key, order, created_at} — independent of the order keys were written in — with sha256, and sends its stable id and that time',
      d1 && J(d1) === J(d2) && d1.fingerprint === crypto.createHash('sha256').update(F.fingerprintInput('k-1', order, at.toISOString())).digest('hex') && d1.device_id === 'dev-1' && d1.created_at === at.toISOString()
        && F.fingerprintInput('k-1', order, at.toISOString()) === '{"created_at":"2026-11-25T10:00:01.234Z","order":{"items":[{"name":"Crêpe","quantity":1,"unit_price":5}],"placedAt":"2026-11-25T10:00:00.000Z","provisional_id":"A3","total":5},"order_key":"k-1"}', d1)
    t('…and a different order, time or key gives a different fingerprint', (await F.tillDeviceFor('k-1', { ...order, total: 6 }, 'dev-1', sha, at)).fingerprint !== d1.fingerprint && (await F.tillDeviceFor('k-2', order, 'dev-1', sha, at)).fingerprint !== d1.fingerprint)
    t('no digest (no Web Crypto) or no device id → nothing is sent (never a weaker hash)', (await F.tillDeviceFor('k-1', order, 'dev-1', async () => null, at)) === null && (await F.tillDeviceFor('k-1', order, '', sha, at)) === null)
    t('the server takes only a well-formed value (an id of safe characters, 64 hex, a real time) — anything else is ignored, as from an older app',
      F.parseTillDevice(d1) !== null && F.parseTillDevice(null) === null && F.parseTillDevice({ ...d1, fingerprint: 'zz' }) === null && F.parseTillDevice({ ...d1, device_id: 'a b' }) === null && F.parseTillDevice({ ...d1, created_at: 'soon' }) === null)
    const gate = read('lib/native/orderGate.ts')
    const queue = gate.slice(gate.indexOf('const queue = async (): Promise<GateResult> => {'), gate.indexOf('// Native + known-offline'))
    t('the native gate adds `till_device` ONLY inside queue() (the queued body), only for a create, in a try that can never stop the queue; the live POST still sends `body` untouched',
      /if \(kind === 'create' && queuedBody\.manualOrder && typeof queuedBody\.manualOrder === 'object'\) \{\s+try \{\s+const tillDevice = await tillDeviceFor\(order_key, queuedBody\.manualOrder, getDeviceId\(\), webSha256Hex\)\s+if \(tillDevice\) queuedBody\.till_device = tillDevice\s+\} catch/.test(queue)
        && (gate.match(/till_device/g) || []).length === 1 && /const res = await post\(url, body, LIVE_TIMEOUT_MS\)/.test(gate))
    const route = read('app/api/dashboard/action/route.ts')
    const manual = route.slice(route.indexOf("if (action === 'manual') {"), route.indexOf('// ── 🔴 A DUPLICATE DISPLAY NUMBER FAILS LOUDLY.'))
    t('the walk-up route stores the device row through till_record_device BEFORE the order upsert, only when a valid `till_device` came (an old-style replay sends none: nothing runs), and an RPC failure never fails the sale',
      manual.indexOf("supabase.rpc('till_record_device'") > 0 && manual.indexOf("supabase.rpc('till_record_device'") < manual.indexOf(".upsert(storedPayload, { onConflict: 'order_key', ignoreDuplicates: true })")
        && /const tillDevice = parseTillDevice\(body\?\.till_device\)\s+if \(tillDevice\) \{\s+try \{/.test(manual) && (route.match(/till_device/g) || []).length === 1)
    t('till_till_id prefers the device id over \'manual\' (and the van, then \'web\', over the device) — the mirror agrees', M.tillId({ van_id: null, source: 'manual' }, { device_id: 'dev-1' }) === 'dev-1' && M.tillId({ van_id: 'v-1', source: 'manual' }, { device_id: 'dev-1' }) === 'v-1'
      && M.tillId({ van_id: null, source: 'web' }, { device_id: 'dev-1' }) === 'web' && M.tillId({ van_id: null, source: 'manual' }) === 'manual'
      && /when o\.source = 'web' then 'web'\s+else coalesce\(\(select d\.device_id from public\.till_device_fingerprints d where d\.order_key = o\.order_key\),\s+nullif\(btrim\(o\.source\), ''\), 'unrecorded'\) end/.test(code(MIG)))
  }

  // ══ H ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('H · THE 409 AND THE ACTOR\'S ROLE')
  const G = await bundle("export * from '@/lib/till/guard-errors'\nexport { tillRoleOf } from '@/lib/till/actor-role'")
  {
    t('isTillGuardError: HGT01 (raised today) and HGT02–HGT04 (reserved for till-pack-3\'s enforce mode) yes; 23505, 23514, a plain Error, null no',
      ['HGT01', 'HGT02', 'HGT03', 'HGT04'].every(c => G.isTillGuardError({ code: c })) && G.isTillGuardError(Object.assign(new Error('x'), { code: 'HGT02' }))
        && !G.isTillGuardError({ code: '23505' }) && !G.isTillGuardError({ code: '23514' }) && !G.isTillGuardError(new Error('x')) && !G.isTillGuardError(null))
    const route = read('app/api/dashboard/action/route.ts')
    const block = (a, b) => route.slice(route.indexOf(a), route.indexOf(b, route.indexOf(a)))
    const wired = {
      cancel: /const \{ error: cancelErr \}[^\n]+\n\s+\{ const refusal = await tillClosed\(cancelErr\); if \(refusal\) return refusal \}/.test(block("if (action === 'cancel') {", "if (action === 'ready') {")),
      undo_collected: /tillClosed\(undoErr\)/.test(block("if (action === 'undo_collected') {", "if (action === 'edit') {")) && /tillClosed\(err\)/.test(block("if (action === 'undo_collected') {", "if (action === 'edit') {")),
      undo_mark_paid: /tillClosed\(err\)/.test(block("if (action === 'undo_mark_paid') {", "if (action === 'set_auto_accept') {")),
      edit: /tillClosed\(updateErr\)/.test(block("if (action === 'edit') {", "if (action === 'refund') {")),
      collected: /tillClosed\(collectErr\)/.test(block("if (action === 'collected' || action === 'collected_cash' || action === 'collected_card') {", "if (action === 'undo_collected') {")),
      catchAll: /if \(isTillGuardError\(err\)\) return NextResponse\.json\(kitchenErrorBody\(DEFAULT_LOCALE, 'sale_closed'\), \{ status: 409 \}\)/.test(route),
      helper: /const tillClosed = async \(e: unknown\) => \(isTillGuardError\(e\) \? NextResponse\.json\(await kErr\('sale_closed'\), \{ status: 409 \}\) : null\)/.test(route),
    }
    t(`the action route answers the guard's refusal with 409 + errorsKitchen.sale_closed at every correction write (cancel, undo collected, undo Mark paid, edit, collected) and in its catch-all — any other error is handled exactly as before`, Object.values(wired).every(Boolean), wired)
    const full = fs.readdirSync(path.join(REPO, 'messages')).filter(f => f.endsWith('.json')).map(f => [f.replace('.json', ''), JSON.parse(read(`messages/${f}`))]).filter(([, j]) => j.errorsKitchen && j.errorsKitchen.payment_not_reversed)
    const en = full.find(([l]) => l === 'en-GB')[1].errorsKitchen.sale_closed
    const missing = full.filter(([, j]) => typeof j.errorsKitchen.sale_closed !== 'string' || !j.errorsKitchen.sale_closed.trim() || j.errorsKitchen.sale_closed.length > 110)
    const englishCopies = full.filter(([l, j]) => !l.startsWith('en-') && j.errorsKitchen.sale_closed === en)
    t(`the message — "${en}" — is in every one of the ${full.length} enabled full languages, short (≤ 110 characters), and translated (no non-English file carries the English)`, en === 'This sale is closed. Record a refund instead.' && full.length >= 60 && !missing.length && !englishCopies.length, { missing: missing.map(([l]) => l), englishCopies: englishCopies.map(([l]) => l) })
    let split = ''; try { split = execFileSync('node', ['scripts/split-messages.cjs', '--check'], { cwd: REPO, encoding: 'utf8' }) } catch (e) { split = String(e.stdout || e) }
    t('…and the generated per-namespace catalogue is in step (scripts/split-messages.cjs --check)', /matches messages/.test(split), split.slice(0, 200))
    t('tillRoleOf: owner → owner, staff → staff, system → system, an admin on another\'s truck → admin, a shared token / unknown → unknown; never a name',
      G.tillRoleOf({ actorKind: 'owner' }) === 'owner' && G.tillRoleOf({ actorKind: 'staff' }) === 'staff' && G.tillRoleOf({ actorKind: 'system' }) === 'system' && G.tillRoleOf({ actorKind: 'owner', adminAccess: true }) === 'admin'
        && G.tillRoleOf({ actorKind: 'token' }) === 'unknown' && G.tillRoleOf({ actorKind: 'unknown' }) === 'unknown' && G.tillRoleOf(null) === 'unknown')
    const actions = [...route.matchAll(/noteTillActor\(supabase, \{ truckId: truck\.id, fromSeq: tillFromSeq, orderKey, action: ([^,]+), role: tillRole \}\)/g)].map(m => m[1])
    t('the action route records the actor\'s role after every correction — edit, undo collected, undo Mark paid, refund / counter refund, cancel (with or without its Q5 refund) — reading the head first for exactly those actions',
      J(actions.sort()) === J(["'edit'", "'undo_collected'", "'undo_mark_paid'", "inPerson ? 'counter_refund' : 'refund'", "q5.refunded.length ? 'cancel_counter_refund' : 'cancel'"].sort())
        && /const tillFromSeq = \['cancel', 'undo_collected', 'undo_mark_paid', 'edit', 'refund'\]\.includes\(String\(action\)\) \? await tillHeadSeq\(supabase, truck\.id\) : 0/.test(route), actions)
    t('the customer cancellation and the event cancellation record their Q5 refunds as \'system\'; the adminAccess flag never reaches the audit log (it copies actorKind / actorId / actorLabel only)',
      /role: 'system'/.test(read('app/api/orders/cancel/route.ts')) && /role: 'system'/.test(read('app/api/events/action/route.ts')) && /actor_kind: entry\.actor\.actorKind/.test(read('lib/audit/actionAudit.ts')) && !/adminAccess/.test(read('lib/audit/actionAudit.ts')))
  }

  // ══ I ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`I · NO SCREEN OR CUSTOMER OUTPUT CHANGED — the diff against ${START}`)
  {
    const changed = git('diff', '--name-only', START, '--').split('\n').filter(Boolean)
    const mine = changed.filter(f => !/^docs\/(compare|plans-everywhere|manual-v|deploy-prep|till-law|till-pack-0)/.test(f))
    const screens = mine.filter(f => /^(app\/\(app\)|components\/|lib\/printing\/|lib\/email|app\/\(marketing\)|app\/page)/.test(f) || /\.tsx$/.test(f))
    t('no screen, component, page, ticket or email file changed (every .tsx untouched; app/(app), components, lib/printing, lib/email* untouched)', screens.length === 0, screens)
    const msgs = mine.filter(f => /^messages\/[^/]+\.json$/.test(f))
    const otherThanKey = msgs.filter(f => {
      const before = JSON.parse(git('show', `${START}:${f}`)), after = JSON.parse(read(f))
      if (after.errorsKitchen) delete after.errorsKitchen.sale_closed
      return J(before) !== J(after)
    })
    t(`the ${msgs.length} message files change by exactly one key — errorsKitchen.sale_closed — and nothing else`, msgs.length === 60 && otherThanKey.length === 0, otherThanKey)
    const untouched = ['lib/accounts/ledger.ts', 'lib/accounts/daily-totals.ts', 'lib/printing/mapOrderToTicket.ts', 'lib/payments/email-payment-state.ts', 'components/dashboard/OrderCard.tsx', 'app/(app)/dashboard/[token]/page.tsx', 'app/(app)/dashboard/[token]/kds/page.tsx']
    t('the accountant ledger, the daily totals, the ticket, the email payment state, the order card and the dashboard / KDS pages are byte-identical to START — they see netted rows from their readers', untouched.every(f => !changed.includes(f)), untouched.filter(f => changed.includes(f)))
    const readers = { dashboard: read('app/api/dashboard/route.ts'), manage: read('app/api/manage/route.ts'), loyalty: read('lib/loyalty/store.ts'), billing: read('lib/billing/store.ts'), reviews: read('lib/reviews/store.ts'), ledger: read('lib/payments/ledger.ts') }
    const wiredReaders = {
      dashboard: /\.select\(`\$\{LEDGER_ROW_COLUMNS\}, \$\{NETTING_COLUMNS\}`\)/.test(readers.dashboard) && /const visibleRows = netted\(payRows \?\? \[\]\)/.test(readers.dashboard),
      manage_daily: /select\(`order_key, kind, amount_minor, state, created_at, \$\{NETTING_COLUMNS\}`\)[^\n]+\n[^\n]+\n\s+payments\.push\(\.\.\.netted\(data \?\? \[\]\)\)/.test(readers.manage),
      manage_accounts: /select\(`order_key, kind, channel, amount_minor, state, \$\{NETTING_COLUMNS\}`\)[^\n]+\n[^\n]+\n\s+payments\.push\(\.\.\.\(netted\(pays \?\? \[\]\)/.test(readers.manage),
      manage_refunds_in_period: /reversedRefunds\.has\(r\.id\)/.test(readers.manage),
      loyalty: /netted\(\(data \?\? \[\]\) as Row\[\]\)/.test(readers.loyalty), billing: /netted\(\(p \?\? \[\]\) as Row\[\]\)/.test(readers.billing),
      reviews: /\.in\('kind', \['refund', 'reversal'\]\)/.test(readers.reviews) && /netted\(\(refunds \?\? \[\]\) as Row\[\]\)\.filter\(r => \(r as Row\)\.kind === 'refund'\)/.test(readers.reviews),
      readLedger: /const rows = netted\(raw\) as LedgerRow\[\]/.test(readers.ledger), getOrderBalance: /const succeeded = withoutReversals\(ledgerRows \?\? \[\]\)\.filter/.test(readers.ledger),
    }
    t('every reader of order_payments that sums money nets the pairs (C\'s lemma then makes it see exactly START\'s rows): the dashboard / KDS / ticket feed, the daily-totals and accountant reads, the refunds-in-period list, loyalty, billing, reviews, readLedger and getOrderBalance',
      Object.values(wiredReaders).every(Boolean), wiredReaders)
    // Every file that reads order_payments, found afresh: one that SUMS money by kind must net the reversal pairs (or read through readLedger,
    // which does). A new reader that sums without netting fails here.
    const allReaders = git('grep', '-l', "from('order_payments')", '--', 'app', 'lib').split('\n').filter(Boolean).sort()
    const sums = src => /kind ?=== ?'(charge|refund)'|\.eq\('kind', ?'(charge|refund)'\)/.test(src)
    const nets = src => /\bnetted\(|\bwithoutReversals\(|reversedRefunds|readLedger\(|reverses_payment_id/.test(src)
    const unnetted = allReaders.filter(f => { const src = read(f); return sums(src) && !nets(src) })
    t(`every file that reads order_payments (${allReaders.length}) and sums money by kind nets the reversal pairs; the others only look rows up by id or idempotency key, or count them`, allReaders.length >= 12 && unnetted.length === 0, { unnetted })
  }

  // ══ J ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('J · WHAT THE DEPLOYED CODE (origin/main) WOULD SHOW IF A REVERSAL ROW EXISTED (none can until the new code is deployed)')
  {
    let ref = 'origin/main'
    try { git('rev-parse', '--verify', 'origin/main') } catch { ref = START }
    const D = await bundle("export { getOrderBalance } from '@/lib/payments/ledger'\nexport { accountRows } from '@/lib/accounts/ledger'", ref)
    const charge = { id: 'c', order_key: 'o-1', kind: 'charge', channel: 'in_person_other', amount_minor: 500, state: 'succeeded', livemode: true, method: 'cash', reverses_payment_id: null }
    const rev = { ...charge, id: 'r', kind: 'reversal', reverses_payment_id: 'c' }
    const deployed = D.getOrderBalance({ total_minor: 500, currency: 'GBP' }, [charge, rev])
    const ours = H.getOrderBalance({ total_minor: 500, currency: 'GBP' }, [charge, rev])
    const acctD = D.accountRows({ orders: [{ ...ORDER, customer_email: null }], payments: [charge, rev], costs: [], itemIdByName: {}, timeZone: 'Europe/London', currency: 'GBP', tax: { inclusive: true, rateMilli: 20000 } })
    t(`${ref}'s getOrderBalance IGNORES a reversal row (it sums 'charge' and 'refund' by name): an undone collection would read 'paid' (paid 500), NOT 'refunded' — the new code reads it 'unpaid'`, deployed.status === 'paid' && deployed.paidMinor === 500 && ours.status === 'unpaid', { deployed, ours })
    t(`${ref}'s accountant rows likewise count the reversed charge as kept money (refunded 0) — the deployed code never reads a reversal as a refund`, acctD.length === 1 && acctD[0].refundedMinor === 0 && acctD[0].grossMinor === 500, acctD)
    const dashMain = git('show', `${ref}:app/(app)/dashboard/[token]/page.tsx`)
    t(`${ref}'s dashboard sums only kind === 'charge' / kind === 'refund' (a reversal falls in neither), and its reverseCollectionPayment only selects kind 'charge' — a reversal is invisible to it, never misread`, /r\.kind==='charge'/.test(dashMain) && /r\.kind==='refund'/.test(dashMain) && !/reversal/.test(dashMain) && /\.eq\('kind', 'charge'\)/.test(git('show', `${ref}:lib/payments/ledger.ts`)))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
