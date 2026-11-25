// scripts/till-pack-4.cjs — till-pack-4 (25 November 2026, docs/till-pack-4-report.md): THE TILL'S CLOSES (day, month, year), SIGNED, AND
// WHAT THE GUARD NEEDS BEFORE IT ENFORCES — the offline proofs. Never connects to a database or any outside service: it runs the REAL close
// run (lib/till/close-run.ts → lib/till/close.ts, lib/accounts/daily-inputs.ts, lib/accounts/daily-totals.ts, lib/till/signing.ts), bundled,
// against an in-memory database whose till functions mirror the migration's (scripts/db-rollback-proofs.cjs --till-4-check runs the same
// code against the real ones, rolled back).
//
//   A · THE MIGRATION — additive; writes no order, payment or audit row; raises no new guard refusal (HGT02–04 stay reserved); grants.
//   B · THE FIXTURE, CLOSED HOUR BY HOUR — a GB truck (Europe/London; fiscal year 6 April – 5 April, from its country), Feb–May 2027:
//       walk-ups on two vans and online; mixed rates (20 % / 5 % / 0 %) and a franchise order at 0 %; a pre-order placed and paid days
//       before; an order served after midnight; a reversal pair; a Q5 cancelled counter sale; a counter cash refund; an accepted order
//       with no payment (Q4); a LATE offline replay and a LATE refund; days with no activity; a month with no activity (March).
//   C · THE Z IS THE DAILY-TOTALS FILE — for every day, the close's lines = the file's (that day alone, and inside the whole period).
//   D · THE GRAND TOTALS — GT and absolute GT carry from close to close and never reset; gt_period restarts at the fiscal year (6 April).
//   E · MONTHS AND THE YEAR — every month closed (March at zero); the year close after the month holding its last day (April).
//   F · REFUSALS AND VERIFY — a second close is refused and a rerun closes nothing; the chain verifies after every close.
//   G · SIGNING — unsigned without the key, signed later once it is set; every signature verifies; another key is refused.
//   H · Q3 — the daily-totals file dates a sale by its trading day (event_date), and is otherwise unchanged from the starting commit.
//   I · PART B AND THE WIRING — the undo pre-check, the event / van deletion rule, the delete-truck refusal, the cron, no screen changed.
//
// Usage: node scripts/till-pack-4.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const START = '8f30c331'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const J = v => JSON.stringify(v)
const sqlCode = s => s.replace(/--[^\n]*/g, '')
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const MIG_FILE = 'supabase/migrations/20261140_till_pack_4.sql'

// ── bundling: every bare package is an INERT stub (none is reached); node built-ins are real ───────────────────────────────────────
const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
globalThis.__tp4inert = pkg => { const inert = new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : k === '__esModule' ? true : inert), apply: () => inert, construct: () => inert }); void pkg; return inert }
async function bundle(contents, ref = null) {
  const files = ref ? new Set(git('ls-tree', '-r', '--name-only', ref).split('\n')) : null
  const resolveAt = rel => { for (const x of ['', '.ts', '.tsx', '.js', '/index.ts', '.json']) if (files.has(rel + x)) return rel + x; return null }
  const plugins = [{ name: 'inert', setup(b) {
    b.onResolve({ filter: /^[^./]/ }, a => {
      if (a.path.startsWith('@/')) return undefined
      if (a.path.startsWith('node:')) return { path: a.path, external: true }
      return { path: a.path, namespace: 'inert' }
    })
    b.onLoad({ filter: /.*/, namespace: 'inert' }, a => ({ contents: `module.exports = globalThis.__tp4inert(${JSON.stringify(a.path)})`, loader: 'js' }))
    if (!ref) return
    b.onResolve({ filter: /^@\// }, a => { const p = resolveAt(a.path.slice(2)); if (!p) throw new Error(`${ref}: cannot resolve ${a.path}`); return { path: p, namespace: 'git' } })
    b.onResolve({ filter: /^\.\.?\//, namespace: 'git' }, a => { const p = resolveAt(path.posix.normalize(path.posix.join(path.posix.dirname(a.importer), a.path))); if (!p) throw new Error(`${ref}: cannot resolve ${a.path}`); return { path: p, namespace: 'git' } })
    b.onLoad({ filter: /.*/, namespace: 'git' }, a => ({ contents: git('show', `${ref}:${a.path}`), loader: a.path.endsWith('.json') ? 'json' : a.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: REPO }))
  } }]
  const out = (await esbuild.build({ stdin: { contents, resolveDir: REPO, loader: 'ts', sourcefile: 'entry.ts' }, bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent', alias: ref ? {} : { '@': REPO }, plugins })).outputFiles[0].text
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', out)(mod, mod.exports, require)
  return mod.exports
}

// ── the in-memory database: PostgREST's builder (the subset the code uses) and the migration's till functions ─────────────────────────
const sha = s => crypto.createHash('sha256').update(s).digest('hex')
function fakeDb(M, truck) {
  const T = { orders: [], order_payments: [], action_audit_log: [], till_chain_heads: [{ truck_id: truck.id, last_seq: 1 }] }
  const S = { now: 0, closes: [], signatures: [], chain: [{ seq: 1, kind: 'event', ref: 'till_start', payload: '{}', prev: '0'.repeat(64), hash: sha('0'.repeat(64) + '{}'), created_at: truck.tillStart }],
    scanned: null, key: null, sealed: new Set(), verifyAfter: [] }
  const cmp = (a, b) => (a == null ? -1 : b == null ? 1 : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
  function from(table) {
    const st = { f: [], order: [], range: null, single: null, head: false }
    const b = {
      select(_c, o) { st.head = !!(o && o.head); return b },
      eq(c, v) { st.f.push(r => r[c] === v); return b },
      gt(c, v) { st.f.push(r => r[c] != null && cmp(r[c], v) > 0); return b },
      gte(c, v) { st.f.push(r => r[c] != null && cmp(r[c], v) >= 0); return b },
      lt(c, v) { st.f.push(r => r[c] != null && cmp(r[c], v) < 0); return b },
      lte(c, v) { st.f.push(r => r[c] != null && cmp(r[c], v) <= 0); return b },
      in(c, arr) { const s = new Set(arr.map(String)); st.f.push(r => s.has(String(r[c]))); return b },
      order(c) { st.order.push(c); return b },
      range(a, z) { st.range = [a, z]; return b },
      single() { st.single = 'one'; return b },
      maybeSingle() { st.single = 'maybe'; return b },
      then(res, rej) {
        let rows = (T[table] || []).filter(r => st.f.every(f => f(r))).map(r => ({ ...r }))
        if (st.order.length) rows.sort((x, y) => { for (const c of st.order) { const d = cmp(x[c], y[c]); if (d) return d } return 0 })
        if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
        const out = st.head ? { data: null, count: rows.length, error: null } : st.single === 'one' ? { data: rows[0] ?? null, error: rows.length === 1 ? null : { message: 'not one row' } } : st.single === 'maybe' ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
        return Promise.resolve(out).then(res, rej)
      },
    }
    return b
  }
  const err = (code, message) => ({ data: null, error: { code, message } })
  const append = (kind, ref, payload) => {
    const prev = S.chain[S.chain.length - 1]
    const p = J(payload)
    const e = { seq: prev.seq + 1, kind, ref, payload: p, prev: prev.hash, hash: sha(prev.hash + p), created_at: new Date(S.now).toISOString() }
    S.chain.push(e); T.till_chain_heads[0].last_seq = e.seq
    return e
  }
  /** till_verify, offline: every link, every hash; every close is the chain entry it names. */
  const verify = () => S.chain.every((e, i) => i === 0 || (e.prev === S.chain[i - 1].hash && e.hash === sha(e.prev + e.payload) && e.seq === S.chain[i - 1].seq + 1))
    && S.closes.every(c => { const e = S.chain.find(x => x.seq === c.seq); return e && e.kind === 'close' && e.hash === c.hash })
  async function rpc(fn, a) {
    if (fn === 'till_close_context') return { data: { now: new Date(S.now).toISOString(), applies: true, till_started_at: truck.tillStart, time_zone: truck.tz, currency: 'GBP', fiscal_year_end: null,
      country_tax_year_start: { month: 4, day: 6 }, days_scanned_through: S.scanned, signing_key_id: S.key && S.key.id,
      closes: S.closes.map(c => ({ type: c.type, period_start: c.period_start, period_end: c.period_end, seq: c.seq, hash: c.hash, totals: c.totals, signed: S.signatures.some(g => g.seq === c.seq) })) }, error: null }
    if (fn === 'till_mark_scanned') { if (!S.scanned || a.p_day > S.scanned) S.scanned = a.p_day; return { data: null, error: null } }
    if (fn === 'till_close_commit') {
      if (S.now < M.instantOfLocal(M.addDaysYmd(a.p_end, 1), '06:00', truck.tz)) return err('HGT20', `till close: ${a.p_type} ${a.p_start} is not due yet`)
      if (S.closes.some(c => c.type === a.p_type && c.period_start === a.p_start)) return err('HGT20', `till close: ${a.p_type} ${a.p_start} is already closed`)
      const keys = new Set(a.p_input_keys)
      if (T.orders.some(o => keys.has(o.order_key) && o.updated_at > a.p_computed_at) || T.order_payments.some(p => keys.has(p.order_key) && p.created_at > a.p_computed_at)) return err('HGT21', 'rows changed')
      for (const k of a.p_seal_keys) S.sealed.add(k)
      const head = S.chain[S.chain.length - 1]
      const e = append('close', `${a.p_type}:${a.p_start}`, { ...a.p_totals, chain_head: { seq: head.seq, hash: head.hash }, signing: a.p_key_id ? { key_id: a.p_key_id } : 'unsigned' })
      S.closes.push({ type: a.p_type, period_start: a.p_start, period_end: a.p_end, totals: a.p_totals, seq: e.seq, hash: e.hash, signing_at_commit: a.p_key_id ? 'pending' : 'unsigned', committed_at: S.now })
      const ok = verify()
      S.verifyAfter.push({ close: `${a.p_type}:${a.p_start}`, ok })
      append('event', 'verify', { type: 'verify', after: `${a.p_type}:${a.p_start}`, ok })
      if (a.p_type === 'day' && (!S.scanned || a.p_end > S.scanned)) S.scanned = a.p_end
      return { data: { seq: e.seq, hash: e.hash, verify_ok: ok }, error: null }
    }
    if (fn === 'till_register_signing_key') {
      if (!S.key) { S.key = { pub: a.p_public_key, id: a.p_key_id }; return { data: true, error: null } }
      return S.key.id === a.p_key_id && S.key.pub === a.p_public_key ? { data: false, error: null } : err('HGT22', 'not the registered key')
    }
    if (fn === 'till_sign_close') {
      if (!S.key || S.key.id !== a.p_key_id) return err('HGT22', 'not the registered key')
      if (S.signatures.some(g => g.seq === a.p_seq)) return { data: false, error: null }
      S.signatures.push({ seq: a.p_seq, key_id: a.p_key_id, signature: a.p_signature, at: S.now }); return { data: true, error: null }
    }
    return err('42883', `no function ${fn}`)
  }
  return { db: { from, rpc }, T, S, verify }
}

;(async () => {
  const M = await bundle(`export { runTillCloses } from '@/lib/till/close-run'
export { loadDailyInputs } from '@/lib/accounts/daily-inputs'
export { dailyTotals } from '@/lib/accounts/daily-totals'
export { fiscalYearEnd, fiscalYearOf, dueCloses, lastClosableDay, computeDayClose } from '@/lib/till/close'
export { loadSigningKey, signHash, verifySignature, keyIdOf } from '@/lib/till/signing'
export { instantOfLocal, addDaysYmd } from '@/lib/time-utils'`)
  const MIG = read(MIG_FILE)
  const C = sqlCode(MIG)

  head('A · THE MIGRATION')
  t('A1 · it writes no row of orders, order_payments or action_audit_log (no insert / update / delete / truncate of them anywhere in the file)', !/\b(insert\s+into|update|delete\s+from|truncate(\s+table)?)\s+(only\s+)?(public\.)?(orders|order_payments|action_audit_log)\b/i.test(C))
  t('A2 · place_order_atomic_v2 is not touched; no drop of anything', !/place_order_atomic_v2/.test(C.replace(/md5\(pg_get_functiondef[^\n]*/g, '')) && !/\bdrop\s+(table|function|trigger|column|index)\b/i.test(C))
  t('A3 · nothing raises a new guard refusal: HGT02 / HGT03 / HGT04 are never raised (till_correction_check only RETURNS the text \'HGT02\'); the closes\' own refusals are HGT20–HGT22', !/errcode\s*=\s*'HGT0[234]'/.test(C) && /errcode = 'HGT20'/.test(C) && /errcode = 'HGT21'/.test(C) && /errcode = 'HGT22'/.test(C))
  const fns = [...C.matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1])
  t('A4 · every function it creates or replaces has its EXECUTE revoked from public / anon / authenticated / service_role, one statement each', fns.length >= 9 && fns.every(f => new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated, service_role;`).test(C)), fns)
  t('A5 · the new tables: RLS on, nothing for anon / authenticated, no writes for the service role; the two record tables append-only', ['till_truck_settings', 'till_closes', 'till_close_signatures'].every(x => C.includes(`alter table public.${x}`) && C.includes(`revoke insert, update, delete, truncate, references, trigger on public.${x} from service_role;`)) && /till_closes_append_only/.test(C) && /till_close_signatures_append_only/.test(C))
  t('A6 · the close is ONE function: lock the head, refuse a second close (HGT20), refuse stale inputs (HGT21), seal leftovers through till_seal, chain the close, till_verify, chain the verify', /for update;[\s\S]*already closed[\s\S]*HGT21[\s\S]*till_seal\(k, 'day_close'\)[\s\S]*till_append\(p_truck, 'close'[\s\S]*till_verify\(p_truck\)[\s\S]*till_append\(p_truck, 'event', 'verify'/.test(C))
  t('A7 · the guard skips an FK SET NULL only when the event / van it named is GONE and nothing else changed; till_verify compares such an order with its sealed event / van', /new\.event_id is null and not exists \(select 1 from public\.truck_events e where e\.id = old\.event_id\)/.test(C) && /till_order_source\(v_fk\) is not distinct from public\.till_order_source\(old\)/.test(C) && /till_sealed_order\(public\.till_row_as_sealed\(ro, \(r\.payload::jsonb\) -> 'data'\)\)/.test(C))
  t('A8 · the private key is never in the database: only signing_public_key / signing_key_id (and the signature) are stored', /signing_public_key text/.test(C) && !/private/i.test(C.replace(/'[^']*'/g, '')))

  head('B · THE FIXTURE, CLOSED HOUR BY HOUR')
  const truck = { id: 'tp4-truck', tz: 'Europe/London', tillStart: '2027-02-20T09:00:00.000Z' }
  const { db, T, S } = fakeDb(M, truck)
  const at = (day, hm) => new Date(M.instantOfLocal(day, hm, truck.tz)).toISOString()
  let rn = 0
  const bdOf = rates => rates.map(([rate, gross]) => { const tax = Math.round(gross * rate / (100000 + rate)); return { rate_milli: rate, food_minor: gross, gross_minor: gross, net_minor: gross - tax, tax_minor: tax } })
  const order = (k, o) => { const minor = o.rates.reduce((s, r) => s + r[1], 0); const row = { order_key: k, truck_id: truck.id, status: o.status ?? 'collected', created_at: o.at, placed_at: o.at, updated_at: o.at, event_date: o.day, total: minor / 100, total_minor: minor, currency: 'GBP', food_minor: minor, tax_minor: 0, tax_inclusive: true, tax_rate_milli: o.rates[0][0], tax_breakdown: bdOf(o.rates), receipt_no: ++rn, source: o.source ?? 'manual', van_id: o.van ?? null }; T.orders.push(row); return row }
  let pn = 0
  const pay = (k, kind, channel, method, amount, atIso, extra = {}) => { const row = { id: `p${++pn}`, order_key: k, truck_id: truck.id, kind, channel, method, amount_minor: amount, state: 'succeeded', created_at: atIso, livemode: true, reverses_payment_id: null, ...extra }; T.order_payments.push(row); return row }
  const key = M.loadSigningKey(crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'))
  const other = M.loadSigningKey(crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'))
  const runs = []
  const run = async (day, hm, k) => { S.now = M.instantOfLocal(day, hm, truck.tz); const r = await M.runTillCloses(db, { taxOf: async () => ({ inclusive: true, rateMilli: 20000 }), signingKey: k, trucks: [truck.id], log: () => {} }); runs.push({ at: `${day} ${hm}`, ...r.trucks[0] }); return r.trucks[0] }
  const V1 = 'van-1', V2 = 'van-2'
  // 22 Feb: an online pre-order for 26 Feb, placed and paid today.
  order('P1', { day: '2027-02-26', at: at('2027-02-22', '18:00'), status: 'confirmed', source: 'web', rates: [[20000, 1800]] }); pay('P1', 'charge', 'online', null, 1800, at('2027-02-22', '18:01'))
  // 25 Feb (D1)
  order('W1', { day: '2027-02-25', at: at('2027-02-25', '12:00'), van: V1, rates: [[20000, 1200], [5000, 300], [0, 450]] }); pay('W1', 'charge', 'in_person_other', 'cash', 1950, at('2027-02-25', '12:01'))
  pay('W1', 'refund', 'in_person_other', 'cash', 200, at('2027-02-25', '12:30'))                                 // a counter cash refund
  order('W2', { day: '2027-02-25', at: at('2027-02-25', '12:10'), van: V2, rates: [[20000, 900]] }); pay('W2', 'charge', 'in_person_other', 'card', 900, at('2027-02-25', '12:11'))
  order('W3', { day: '2027-02-25', at: at('2027-02-25', '13:00'), van: V2, rates: [[20000, 700]] })
  const p3 = pay('W3', 'charge', 'in_person_other', 'cash', 700, at('2027-02-25', '13:01'))
  pay('W3', 'reversal', 'in_person_other', 'cash', 700, at('2027-02-25', '13:02'), { reverses_payment_id: p3.id, reason: 'undo_mark_paid' })   // the reversal pair
  pay('W3', 'charge', 'in_person_other', 'card', 700, at('2027-02-25', '13:03'))
  order('Q5', { day: '2027-02-25', at: at('2027-02-25', '14:00'), status: 'cancelled', rates: [[20000, 600]] }); pay('Q5', 'charge', 'in_person_other', 'cash', 600, at('2027-02-25', '14:01')); pay('Q5', 'refund', 'in_person_other', 'cash', 600, at('2027-02-25', '14:05'))
  order('F0', { day: '2027-02-25', at: at('2027-02-25', '15:00'), rates: [[0, 500]] }); pay('F0', 'charge', 'in_person_other', 'cash', 500, at('2027-02-25', '15:01'))   // a franchise order at 0 %
  order('A1', { day: '2027-02-25', at: at('2027-02-25', '16:00'), status: 'confirmed', van: V1, rates: [[20000, 400]] })                                                 // accepted, nothing paid (Q4)
  order('N1', { day: '2027-02-25', at: at('2027-02-26', '00:40'), van: V1, rates: [[20000, 350]] }); pay('N1', 'charge', 'in_person_other', 'cash', 350, at('2027-02-26', '00:41'))   // served after midnight

  const r1 = await run('2027-02-26', '08:00', null)
  const dayClose = d => S.closes.find(c => c.type === 'day' && c.period_start === d)
  t('B1 · 26 Feb 08:00, no key: day closes for 22 Feb (a deposit received) and 25 Feb only — 20, 21, 23, 24 Feb had no activity (scanned, no close, Q12)', r1.days === 2 && r1.scanned === 4 && dayClose('2027-02-22') && dayClose('2027-02-25') && S.scanned === '2027-02-25', r1)
  const z22 = dayClose('2027-02-22').totals, z25 = dayClose('2027-02-25').totals
  t('B2 · 22 Feb: no sales; "received for later days" 1800 online (P1, served 26 Feb)', z22.rates.length === 0 && z22.received_for_later_days.total === 1800 && z22.received_for_later_days.by_method.card_online === 1800, z22.received_for_later_days)
  t('B3 · 25 Feb payments: cash 1950 + 600 (Q5 in) + 500 + 350 = 3400; card in person 900 + 700 (the re-payment) = 1600; the reversed 700 counts nothing', z25.payments.cash === 3400 && z25.payments.card_in_person === 1600 && z25.reversals_netted.count === 1 && z25.reversals_netted.minor === 700, { p: z25.payments, r: z25.reversals_netted })
  t('B4 · 25 Feb refunds: cash 200 (counter) + 600 (Q5) = 800; accepted with no payment: A1, 400 (Q4)', z25.refunds.cash === 800 && z25.accepted_no_payment.count === 1 && z25.accepted_no_payment.minor === 400, { r: z25.refunds, q4: z25.accepted_no_payment })
  t('B5 · 25 Feb rates 0 % / 5 % / 20 %; per van (accepted sales): van 1 = W1 + A1 + N1 (the after-midnight sale is 25 Feb\'s), van 2 = W2 + W3, no van = F0 (the cancelled Q5 sale is no sale)', J(z25.rates.map(r => r.rate)) === '[0,5000,20000]' && z25.by_van[V1] === 1950 + 400 + 350 && z25.by_van[V2] === 1600 && z25.by_van.none === 500, { rates: z25.rates.map(r => r.rate), by_van: z25.by_van })
  t('B6 · 25 Feb\'s leftover orders are sealed at the close (every order whose trading day is 25 Feb)', ['W1', 'W2', 'W3', 'Q5', 'F0', 'A1', 'N1'].every(k => S.sealed.has(k)) && !S.sealed.has('P1'))
  // 26 Feb: the late replay of a 25 Feb sale, a late refund of W1, the pre-order served.
  order('L1', { day: '2027-02-25', at: at('2027-02-26', '10:00'), rates: [[20000, 800]] }); pay('L1', 'charge', 'in_person_other', 'cash', 800, at('2027-02-26', '10:01'))
  pay('W1', 'refund', 'in_person_other', 'cash', 500, at('2027-02-26', '11:00'))
  order('W4', { day: '2027-02-26', at: at('2027-02-26', '12:00'), van: V1, rates: [[20000, 1000]] }); pay('W4', 'charge', 'in_person_other', 'card', 1000, at('2027-02-26', '12:01'))
  const before25 = J(z25)
  const r2 = await run('2027-02-27', '07:00', null)
  const z26 = dayClose('2027-02-26').totals
  t('B7 · 27 Feb 07:00: the 26 Feb close holds the LATE replay (own day 25 Feb) and the LATE refund of W1 (own day 25 Feb), totalled; 25 Feb is not reopened', r2.days === 1 && z26.late_records.orders.length === 1 && z26.late_records.orders[0].order_key === 'L1' && z26.late_records.orders[0].own_day === '2027-02-25' && z26.late_records.refunds.length === 1 && z26.late_records.refunds[0].minor === 500 && z26.late_records.total_minor === 300 && J(dayClose('2027-02-25').totals) === before25, z26.late_records)
  t('B8 · 26 Feb payments: online 1800 (P1 — paid 22 Feb, its trading day 26 Feb), cash 800, card 1000; refunds cash 500', z26.payments.card_online === 1800 && z26.payments.cash === 800 && z26.payments.card_in_person === 1000 && z26.refunds.cash === 500, { p: z26.payments, r: z26.refunds })
  const r3 = await run('2027-03-01', '07:00', key)
  t('B9 · 1 Mar 07:00, key set: the February month close; 27–28 Feb scanned; the four closes written unsigned are signed now, the month too', r3.months === 1 && r3.days === 0 && r3.scanned === 2 && r3.signed === 4, r3)
  await run('2027-04-01', '07:00', key)
  // April: an event past midnight on 3 Apr, the fiscal year's last day (5 Apr), the new year's first (6 Apr).
  order('E1', { day: '2027-04-03', at: at('2027-04-03', '19:00'), source: 'web', rates: [[20000, 1500]] }); pay('E1', 'charge', 'online', null, 1500, at('2027-04-03', '19:00'))
  order('E2', { day: '2027-04-03', at: at('2027-04-04', '00:30'), van: V2, rates: [[20000, 600]] }); pay('E2', 'charge', 'in_person_other', 'cash', 600, at('2027-04-04', '00:31'))
  const r5 = await run('2027-04-04', '05:59', key)
  t('B10 · 4 Apr 05:59: 3 April is not closed yet (its close is at 06:00 on 4 Apr, truck time)', !dayClose('2027-04-03') && r5.days === 0)
  await run('2027-04-04', '07:00', key)
  t('B11 · 4 Apr 07:00: the 3 April close includes the sale at 00:30 on 4 April (same trading day)', dayClose('2027-04-03') && dayClose('2027-04-03').totals.totals.salesMinor === 2100)
  order('Y5', { day: '2027-04-05', at: at('2027-04-05', '12:00'), rates: [[20000, 1100]] }); pay('Y5', 'charge', 'in_person_other', 'cash', 1100, at('2027-04-05', '12:01'))
  order('Y6', { day: '2027-04-06', at: at('2027-04-06', '12:00'), rates: [[20000, 1300]] }); pay('Y6', 'charge', 'in_person_other', 'card', 1300, at('2027-04-06', '12:01'))
  pay('Y5', 'refund', 'in_person_other', 'cash', 100, at('2027-04-06', '12:30'))
  await run('2027-04-07', '07:00', key)
  const rMay = await run('2027-05-01', '07:00', key)
  t('B12 · 1 May 07:00: the April month close, THEN the fiscal-year close (6 Apr 2026 – 5 Apr 2027) — the year ends mid-April, so it waits for April', rMay.months === 1 && rMay.years === 1 && S.closes.findIndex(c => c.type === 'year') > S.closes.findIndex(c => c.type === 'month' && c.period_start === '2027-04-01'), rMay)

  head('C · THE Z IS THE DAILY-TOTALS FILE')
  const csv = async (from, to) => {
    const startIso = new Date(M.instantOfLocal(from, '00:00', truck.tz)).toISOString(), endIso = new Date(M.instantOfLocal(M.addDaysYmd(to, 1), '00:00', truck.tz)).toISOString()
    const inp = await M.loadDailyInputs(db, { truckId: truck.id, startIso, endIso, from, to })
    return M.dailyTotals({ orders: inp.orders, payments: inp.payments, cancelledAt: inp.cancelledAt, tax: { inclusive: true, rateMilli: 20000 }, timeZone: truck.tz, from, to }).rows
  }
  const rowsJ = rows => J(rows.map(r => [r.date, r.rate, r.salesMinor, r.refundsMinor, r.netMinor, r.vatMinor]))
  const days = S.closes.filter(c => c.type === 'day')
  const whole = await csv('2027-02-20', '2027-04-30')
  const perDay = []
  for (const d of days) perDay.push({ d: d.period_start, alone: rowsJ(await csv(d.period_start, d.period_start)), inWhole: rowsJ(whole.filter(r => r.date === d.period_start)), z: rowsJ(d.totals.rates) })
  t(`C1 · every day close (${days.length}) has exactly the daily-totals file's lines for that day — the file for the day alone`, perDay.every(x => x.z === x.alone), perDay.filter(x => x.z !== x.alone))
  t('C2 · …and the day\'s lines inside the file for the whole period (20 Feb – 30 Apr, read after every late record)', perDay.every(x => x.z === x.inWhole), perDay.filter(x => x.z !== x.inWhole))
  const closedDays = new Set(days.map(d => d.period_start))
  t('C3 · the file has no line on a day without a close (a day with no activity has no sales)', whole.every(r => closedDays.has(r.date)), whole.filter(r => !closedDays.has(r.date)).map(r => r.date))

  head('D · THE GRAND TOTALS')
  const sorted = days.slice().sort((a, b) => a.period_start.localeCompare(b.period_start))
  const fyEnd = M.fiscalYearEnd(null, { month: 4, day: 6 })
  t('D0 · the GB truck\'s fiscal year ends 5 April (the day before its country\'s tax year start) — not December', fyEnd.month === 4 && fyEnd.day === 5)
  const carry = sorted.map((z, i) => {
    const p = i ? sorted[i - 1].totals.gt : { gtIncl: 0, gtExcl: 0, gtAbs: 0, gtPeriod: 0 }
    const x = z.totals, n = x.totals.salesMinor + x.totals.refundsMinor
    const same = i > 0 && M.fiscalYearOf(sorted[i - 1].period_start, fyEnd).start === M.fiscalYearOf(z.period_start, fyEnd).start
    return { d: z.period_start, gi: x.gt.gtIncl === p.gtIncl + n, ge: x.gt.gtExcl === p.gtExcl + x.totals.netMinor, ga: x.gt.gtAbs === p.gtAbs + Math.abs(x.totals.salesMinor) + Math.abs(x.totals.refundsMinor) + x.reversals_netted.minor, gp: x.gt.gtPeriod === (same ? p.gtPeriod : 0) + n }
  })
  t('D1 · GT (incl. VAT) and GT excl. VAT carry from every day close to the next: previous + the day\'s sales + refunds — never reset', carry.every(x => x.gi && x.ge), carry)
  t('D2 · the absolute GT carries: previous + |sales| + |refunds| + the reversed amounts (25 Feb counts the reversed 700)', carry.every(x => x.ga), carry)
  t('D3 · gt_period restarts on 6 April (the new fiscal year) and carries within a year', carry.every(x => x.gp) && dayClose('2027-04-06').totals.gt.gtPeriod === dayClose('2027-04-06').totals.totals.salesMinor + dayClose('2027-04-06').totals.totals.refundsMinor)
  t('D4 · the GT never goes back: it only grows by what each day adds, and the absolute GT is never below the GT', sorted.every(z => z.totals.gt.gtAbs >= z.totals.gt.gtIncl))

  head('E · MONTHS AND THE YEAR')
  const month = s => S.closes.find(c => c.type === 'month' && c.period_start === s)
  t('E1 · a month close for February, March, April — all written (Q12)', month('2027-02-01') && month('2027-03-01') && month('2027-04-01'))
  const mar = month('2027-03-01').totals
  t('E2 · March had NO activity: its close is at zero, with the GT carried from 26 Feb (and gt_period carried: same fiscal year)', mar.totals.salesMinor === 0 && mar.totals.refundsMinor === 0 && mar.days_closed === 0 && J(mar.gt) === J(dayClose('2027-02-26').totals.gt), mar.gt)
  const feb = month('2027-02-01').totals
  t('E3 · February sums its day closes (22, 25, 26 Feb) and carries GT(26 Feb)', feb.days_closed === 3 && feb.totals.salesMinor === z22.totals.salesMinor + z25.totals.salesMinor + z26.totals.salesMinor && J(feb.gt) === J(dayClose('2027-02-26').totals.gt))
  const yr = S.closes.find(c => c.type === 'year')
  t('E4 · the year close covers 6 Apr 2026 – 5 Apr 2027: the sum of its day closes, GT(5 Apr), gt_period = the year\'s total', yr.period_start === '2026-04-06' && yr.period_end === '2027-04-05' && yr.totals.days_closed === 5 && J(yr.totals.gt) === J(dayClose('2027-04-05').totals.gt) && yr.totals.gt.gtPeriod === yr.totals.totals.salesMinor + yr.totals.totals.refundsMinor, { s: yr.period_start, e: yr.period_end, n: yr.totals.days_closed })
  const due = M.dueCloses({ nowMs: M.instantOfLocal('2027-12-31', '07:00', 'Europe/Paris'), timeZone: 'Europe/Paris', tillStartDay: '2027-01-15', scannedThrough: '2027-12-30', existing: [], fyEnd: { month: 12, day: 31 } })
  t('E5 · (pure) a December fiscal year: on 31 Dec 07:00 the year 2027 is not due (December not over); the months to November are', due.years.length === 0 && due.months.length === 11 && due.days.length === 0, due)

  head('F · REFUSALS AND VERIFY')
  const again = await run('2027-05-01', '08:00', key)
  t('F1 · running again closes nothing (no due period is left) and signs nothing new', again.days === 0 && again.months === 0 && again.years === 0 && again.signed === 0, again)
  const dup = await db.rpc('till_close_commit', { p_truck: truck.id, p_type: 'day', p_start: '2027-02-25', p_end: '2027-02-25', p_currency: 'GBP', p_computed_at: new Date(S.now).toISOString(), p_input_keys: [], p_seal_keys: [], p_totals: z25, p_key_id: null })
  t('F2 · a second close of 25 Feb is refused (HGT20 — the database refuses it too: db-rollback-proofs R2)', dup.error && dup.error.code === 'HGT20')
  t(`F3 · the chain verified after EVERY close (${S.verifyAfter.length}), each followed by its verify entry; it verifies now`, S.verifyAfter.length === S.closes.length && S.verifyAfter.every(v => v.ok) && S.chain.filter(e => e.kind === 'event' && e.ref === 'verify').length === S.closes.length)
  t('F4 · the closes went in order: every day close after the day before it was scanned; one close per period', new Set(S.closes.map(c => c.type + c.period_start)).size === S.closes.length && sorted.every((z, i) => !i || z.committed_at >= sorted[i - 1].committed_at))

  head('G · SIGNING')
  const pre = S.closes.filter(c => c.committed_at < M.instantOfLocal('2027-03-01', '07:00', truck.tz))
  t('G1 · the closes written before the key was set were committed UNSIGNED, the later ones PENDING (the key named in their chain entry)', pre.length === 3 && pre.every(c => c.signing_at_commit === 'unsigned') && S.closes.filter(c => !pre.includes(c)).every(c => c.signing_at_commit === 'pending'))
  t('G2 · every close is signed (the unsigned ones by the first run with the key) and every signature verifies with the PUBLIC key alone', S.signatures.length === S.closes.length && S.closes.every(c => { const g = S.signatures.find(x => x.seq === c.seq); return g && M.verifySignature(S.key.pub, c.hash, g.signature) }))
  t('G3 · the registered key id = sha256(public key)[0..16]; a signature fails for another hash or another key', S.key.id === M.keyIdOf(S.key.pub) && S.key.id === key.keyId && !M.verifySignature(S.key.pub, '0'.repeat(64), S.signatures[0].signature) && !M.verifySignature(other.publicKeyB64, S.closes[0].hash, S.signatures[0].signature))
  const otherRun = await run('2027-05-01', '09:00', other)
  t('G4 · a DIFFERENT key is refused (HGT22): nothing is signed with it', otherRun.signed === 0 && S.signatures.every(g => g.key_id === key.keyId))
  t('G5 · TILL_SIGNING_KEY unset → no key (closes unsigned); set but not an Ed25519 key → it THROWS (never a silent unsigned run)', M.loadSigningKey('') === null && M.loadSigningKey(undefined) === null && (() => { try { M.loadSigningKey(crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')); return false } catch { return true } })())
  const kg = read('scripts/till-signing-keygen.cjs')
  t('G6 · the keygen prints the private key ONLY to the terminal: the one file it writes is the public-key doc, which never contains the private key', /process\.stdout\.write\(`[\s\S]*TILL_SIGNING_KEY=\$\{priv\}/.test(kg) && (kg.match(/fs\.writeFileSync\(/g) || []).length === 1 && !/writeFileSync\(doc, `[\s^`]*\$\{priv\}/.test(kg) && !kg.slice(kg.indexOf('fs.writeFileSync('), kg.indexOf('process.stdout.write(')).includes('${priv}'))
  const runOut = J(runs)
  t('G7 · the run\'s result carries counts only — no hash, no key, no signature (the cron returns these)', !S.closes.some(c => runOut.includes(c.hash)) && !runOut.includes(key.publicKeyB64))

  head('H · Q3 — THE DAILY-TOTALS FILE DATES A SALE BY ITS TRADING DAY')
  const OLD = await bundle(`export { dailyTotals } from '@/lib/accounts/daily-totals'`, START)
  const inAll = await (async () => { const startIso = new Date(M.instantOfLocal('2027-02-20', '00:00', truck.tz)).toISOString(), endIso = new Date(M.instantOfLocal('2027-05-01', '00:00', truck.tz)).toISOString(); return M.loadDailyInputs(db, { truckId: truck.id, startIso, endIso, from: '2027-02-20', to: '2027-04-30' }) })()
  const args = { orders: inAll.orders, payments: inAll.payments, cancelledAt: inAll.cancelledAt, tax: { inclusive: true, rateMilli: 20000 }, timeZone: truck.tz, from: '2027-02-20', to: '2027-04-30' }
  const now = M.dailyTotals(args).rows, then = OLD.dailyTotals(args).rows
  t('H1 · the pre-order placed 22 Feb for 26 Feb: at the starting commit it was a 22 Feb sale; now it is 26 Feb\'s (Q3)', then.some(r => r.date === '2027-02-22' && r.salesMinor === 1800) && !now.some(r => r.date === '2027-02-22') && now.some(r => r.date === '2027-02-26'))
  const moved = new Set(['2027-02-22', '2027-02-25', '2027-02-26', '2027-04-03', '2027-04-04'])
  t('H2 · every other day is byte-identical to the starting commit\'s file (only the pre-order, the after-midnight sales and the late replay move)', rowsJ(now.filter(r => !moved.has(r.date))) === rowsJ(then.filter(r => !moved.has(r.date))), { now: now.filter(r => !moved.has(r.date)), then: then.filter(r => !moved.has(r.date)) })
  t('H3 · the totals over the whole period are the same (a sale moves day; it is never lost or counted twice)', J(M.dailyTotals(args).totals) === J(OLD.dailyTotals(args).totals))
  const mr = read('app/api/manage/route.ts')
  t('H4 · /api/manage get_daily_totals reads its rows through lib/accounts/daily-inputs.ts — the loader the day close uses — and answers the same shape', /loadDailyInputs\(supabase, \{ truckId: truck\.id, startIso, endIso, from, to \}\)/.test(mr) && /NextResponse\.json\(\{ ok: true, orders, payments, cancelledAt, tax: \{ inclusive: rules\.taxInclusive, rateMilli: rules\.taxRateMilli \?\? null \}, timeZone: tz, from, to \}\)/.test(mr))

  head('I · PART B AND THE WIRING')
  const ar = read('app/api/dashboard/action/route.ts')
  const branch = name => { const a = ar.indexOf(`if (action === '${name}') {`); return ar.slice(a, ar.indexOf('\n    }\n', a)) }
  const uc = branch('undo_collected'), um = branch('undo_mark_paid')
  t('I1 · undo collected asks till_correction_check FIRST — before the order read, the audit row, the reversal and the status revert', uc.indexOf('await tillPrecheck()') > 0 && uc.indexOf('await tillPrecheck()') < uc.indexOf("from('orders')") && uc.indexOf('await tillPrecheck()') < uc.indexOf('reverseCollectionPayment'))
  t('I2 · undo mark paid the same — before the reversal', um.indexOf('await tillPrecheck()') > 0 && um.indexOf('await tillPrecheck()') < um.indexOf('reverseCollectionPayment'))
  t('I3 · the pre-check answers the existing 409 sale_closed (no new message); an error in the check changes nothing', /const tillPrecheck = async \(\) => \{\n\s+const \{ data, error \} = await supabase\.rpc\('till_correction_check', \{ p_order_key: orderKey \}\)\n\s+return !error && typeof data === 'string' \? tillClosed\(\{ code: data \}\) : null/.test(ar))
  const dt = read('app/api/admin/delete-truck/route.ts')
  t('I4 · admin delete-truck refuses a truck with till records (chain entries or sealed orders) with a clear 409 BEFORE the payment check and before anything is deleted; a failed check refuses', dt.indexOf("code: 'till_records_present'") > 0 && dt.indexOf("code: 'till_records_present'") < dt.indexOf("from('order_payments')") && dt.indexOf("code: 'till_records_present'") < dt.indexOf('await deleteTruckCascade(') && /till_check_failed/.test(dt))
  const vj = JSON.parse(read('vercel.json'))
  t('I5 · the cron /api/cron/till-close runs hourly (vercel.json)', vj.crons.some(c => c.path === '/api/cron/till-close' && /^\d+ \* \* \* \*$/.test(c.schedule)))
  const cr = read('app/api/cron/till-close/route.ts')
  t('I6 · the cron route: the cron secret or an admin; demo trucks skipped; the signing key from TILL_SIGNING_KEY only (lib/till/signing.ts); counts only in its answer', /authz === `Bearer \$\{secret\}`/.test(cr) && /isDemo: isDemoIdentifier/.test(cr) && /loadSigningKey\(\)/.test(cr) && read('lib/till/signing.ts').includes('process.env.TILL_SIGNING_KEY') && !/hash|signature/.test(cr.slice(cr.indexOf('return NextResponse.json({\n      ok:'))))
  // THIS pack's files only (other sessions commit to the same branch): its own commits since START, and what is not committed yet.
  const changed = git('log', '--format=', '--name-only', '--grep=^till-pack-4', `${START}..HEAD`).split('\n').concat(git('diff', '--name-only', 'HEAD').split('\n'), git('ls-files', '--others', '--exclude-standard').split('\n')).filter(Boolean)
  const screens = changed.filter(f => /^(components|app\/(?!api\/))/.test(f) || /^messages\//.test(f) || /^lib\/(email|emails|receipt|ticket)/.test(f))
  t('I7 · no screen, component, message file, email or ticket is changed by this pack (only API routes, lib, scripts, the migration, docs, vercel.json)', screens.length === 0, screens)
  const ds = read('lib/delete-truck.ts')
  t('I8 · the demo-cleanup cron is untouched (it calls deleteTruckCascade directly; demo trucks have no till records)', !changed.includes('lib/delete-truck.ts') && ds.length > 0)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
