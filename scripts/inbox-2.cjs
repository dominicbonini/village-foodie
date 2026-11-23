#!/usr/bin/env node
// scripts/inbox-2.cjs — inbox-2 (23 November 2026, docs/inbox-2-report.md): three follow-ups to inbox-1. Swept.
//   node scripts/inbox-2.cjs      (NO NETWORK, NO DATABASE, NO MAILBOX, NO MODEL, NO .env FILE: fixtures and fakes only)
//
//   1 · the numbers check reads numbers as values: "1.5" is one and a half (never 15); decimal point and comma; thousands with a comma,
//       a point, a space, a no-break or narrow no-break space or an apostrophe; currency before or after; percentages; units agree
//   2 · 🔴 CUSTOMERS WRITING TO dominic@: the REAL reply poll, compiled from BASE (before inbox-2) and from this tree, both accounts
//       configured, on per-account fake read-only mailboxes and a fake database —
//         switch OFF → summary, every write and every IMAP call identical to BASE;
//         switch ON  → the outreach part identical to BASE; a linked HatchGrab truck's mail in dominic@'s INBOX becomes a Customer
//                      enquiry linked to the truck (by its address, or by a reply in the linked prospect's thread); a prospect's reply
//                      stays outreach's; anything else in dominic@'s INBOX is left alone and not stored; read-only throughout
//   3 · the reply to that customer goes FROM dominic@, logged in as dominic@, the copy in dominic@'s Sent (fake transport)
//   4 · the sweep's safety screen passes every listed harness (run-harnesses.cjs --dry-run, the screen untouched)
//   5 · 🔴 byte-identical: the outreach walk, the directory and outreach's claim rule; the protected paths; only this work's files
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
require('./_disk-guard.cjs').guard(__filename)
require('./_harness-tmp.cjs') // tmp-cleanup-1: temp goes under $TMPDIR/hatchgrab-harness/ and is removed on exit ("Disk space")
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const { execFileSync, spawnSync } = require('child_process')
const { compile, headWorktree, REPO } = require('./_slot-interval-compile.cjs')

/** The commit before inbox-2 (vat-live-check-1's report, on france-vat-1). */
const BASE = '8956bb90'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

// 🔴 No model, no mail login, no database login in this process — whatever the shell has.
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC_|OUTREACH_|SUPABASE_|BREVO_)/.test(k)) delete process.env[k]

const OUTS = []
{
  const stub = path.join(os.tmpdir(), `inbox2-server-only-${process.pid}.js`)
  fs.writeFileSync(stub, 'module.exports = {}\n')
  const real = Module._resolveFilename
  Module._resolveFilename = function (r, parent, ...rest) {
    if (r === 'server-only') return stub
    if (r.startsWith('@/messages/')) return real.call(this, path.join(REPO, r.slice(2)), parent, ...rest)
    const tree = r.startsWith('@/') && parent && parent.filename ? OUTS.find(o => parent.filename.startsWith(o + path.sep)) : null
    if (tree) return real.call(this, path.join(tree, r.slice(2)), parent, ...rest)
    return real.call(this, r, parent, ...rest)
  }
}

// ── the fake mailboxes: imapflow, READ-ONLY by construction, one set of folders PER LOGIN ─────────────────────────────
const IMAP = { calls: [], writes: [], locks: [], logins: [] }
let BOXES = {}
const READ_METHODS = new Set(['connect', 'logout', 'status', 'getMailboxLock', 'fetch', 'fetchOne', 'search', 'on', 'once', 'off', 'close', 'mailbox', 'usable', 'authenticated'])
class FakeImapBase {
  constructor(opts) { this.user = opts.auth.user; IMAP.logins.push(this.user); this.mailbox = false }
  box(p) { return ((BOXES[this.user] || {})[p]) || [] }
  async connect() { IMAP.calls.push(`${this.user} connect`) }
  async logout() { IMAP.calls.push(`${this.user} logout`) }
  async status(p) { IMAP.calls.push(`${this.user} status ${p}`); return { messages: this.box(p).length, uidValidity: 7 } }
  async getMailboxLock(p, o) {
    IMAP.locks.push({ user: this.user, path: p, readOnly: !!(o && o.readOnly) })
    const box = this.box(p)
    this.mailbox = { path: p, uidValidity: 7, uidNext: box.reduce((m, x) => Math.max(m, x.uid), 0) + 1, readOnly: !!(o && o.readOnly) }
    return { release: () => { this.mailbox = false } }
  }
  /* imapflow's read-only `fetch` (the method name), attached below as FakeImapBase.prototype.fetch = …fakeImapFetch */
  async *fakeImapFetch(query, opts) {
    IMAP.calls.push(`${this.user} fetch ${typeof query === 'string' ? query : 'since'}${opts && opts.bodyParts ? ' bodyParts' : ''}`)
    let list = this.box(this.mailbox.path)
    if (typeof query === 'string') { const from = Number(query.split(':')[0]); list = list.filter(m => m.uid >= from) }
    else if (query && query.since) list = list.filter(m => new Date(m.internalDate) >= new Date(new Date(query.since).toISOString().slice(0, 10)))
    for (const m of list) yield { uid: m.uid, envelope: m.envelope, headers: Buffer.from(m.headers), internalDate: new Date(m.internalDate) }
  }
  async fetchOne(uid, opts) {
    IMAP.calls.push(`${this.user} fetchOne ${uid} ${Object.keys(opts).filter(k => k !== 'uid').join(',')}`)
    const m = this.box(this.mailbox.path).find(x => String(x.uid) === String(uid))
    if (!m) return false
    if (opts.bodyStructure) return { uid: m.uid, bodyStructure: { type: 'text/plain', encoding: '8bit', parameters: { charset: 'utf-8' }, size: m.text.length } }
    if (opts.bodyParts) return { uid: m.uid, bodyParts: new Map([['1', Buffer.from(m.text)]]) }
    return { uid: m.uid }
  }
}
FakeImapBase.prototype.fetch = FakeImapBase.prototype.fakeImapFetch
function FakeImapFlow(opts) {
  const inner = new FakeImapBase(opts)
  return new Proxy(inner, {
    get(target, k) {
      if (typeof k === 'string' && !(k in target) && !READ_METHODS.has(k) && !k.startsWith('_') && k !== 'then') return () => { IMAP.writes.push(k); throw new Error(`mailbox write refused: ${k}`) }
      const v = target[k]
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}
{
  const id = require.resolve('imapflow', { paths: [REPO] })
  const m = new Module(id); m.filename = id; m.loaded = true; m.exports = { ImapFlow: FakeImapFlow }
  require.cache[id] = m
}

// ── the fake database (supabase-js's query surface: filters incl. not, one embed, unique keys, every read and write recorded) ──
function fakeDb(seed) {
  const T = new Map(Object.entries(JSON.parse(JSON.stringify(seed))))
  const writes = [], reads = []
  let seq = 0, refSeq = 0
  const UNIQUE = { outreach_settings: [['key']], outreach_messages: [['message_id']], enquiries: [['contact_message_id'], ['ref']], enquiry_messages: [['mailbox', 'mail_message_id'], ['idempotency_key']], enquiry_spend: [['month']] }
  const rowsOf = tb => { if (!T.has(tb)) T.set(tb, []); return T.get(tb) }
  const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/
  const norm = v => JSON.parse(JSON.stringify(v ?? null, (k, x) => (typeof x === 'string' && iso.test(x) ? '<ts>' : x)))
  const ok = (op, x, v) => {
    switch (op) {
      case 'eq': return x === v || (x != null && v != null && String(x) === String(v))
      case 'neq': return String(x) !== String(v)
      case 'lt': return x != null && String(x) < String(v)
      case 'lte': return x != null && String(x) <= String(v)
      case 'gt': return x != null && String(x) > String(v)
      case 'gte': return x != null && String(x) >= String(v)
      case 'in': return v.map(String).includes(String(x))
      case 'is': return v === null ? x == null : x === v
      case 'ilike': return x != null && String(x).toLowerCase() === String(v).replace(/\\([\\%_])/g, '$1').toLowerCase()
      default: return true
    }
  }
  const matches = (r, filters) => filters.every(([op, c, v, w]) => (op === 'not' ? !ok(v, r[c], w) : ok(op, r[c], v)))
  const conflict = (table, row, rows) => (UNIQUE[table] || []).some(key => !key.some(c => row[c] == null) && rows.some(r => r !== row && key.every(c => String(r[c]) === String(row[c]))))
  const withDefaults = (table, r) => {
    const out = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, ...r }   // uuid-shaped: the Inbox's keys are checked
    if (table === 'enquiries') { out.ref = out.ref || `ENQ-${String(++refSeq).padStart(4, '0')}`; out.status = out.status || 'new'; out.created_at = out.created_at || new Date().toISOString(); out.updated_at = out.updated_at || out.created_at }
    if (['enquiry_messages', 'enquiry_drafts', 'inbox_sent', 'inbox_comments', 'reply_knowledge'].includes(table)) out.created_at = new Date().toISOString()
    if (table === 'enquiry_messages') out.received_at = out.received_at || new Date().toISOString()
    return out
  }
  async function exec(q) {
    const rows = rowsOf(q.table)
    const finish = (list, error = null) => {
      if (error) return { data: null, error }
      if (q.single === 'single') return list.length ? { data: list[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      if (q.single === 'maybe') return { data: list[0] ?? null, error: null }
      return { data: list, error: null }
    }
    if (q.op === 'select') {
      reads.push({ table: q.table, filters: norm(q.filters) })
      let list = rows.filter(r => matches(r, q.filters))
      if (q.order) list = [...list].sort((a, b) => (String(a[q.order[0]] ?? '') < String(b[q.order[0]] ?? '') ? -1 : String(a[q.order[0]] ?? '') > String(b[q.order[0]] ?? '') ? 1 : 0) * (q.order[1] ? 1 : -1))
      if (q.limit != null) list = list.slice(0, q.limit)
      return finish(list.map(r => ({ ...r })))
    }
    if (q.op === 'insert') {
      const items = (Array.isArray(q.payload) ? q.payload : [q.payload]).map(r => withDefaults(q.table, r))
      for (const r of items) if (conflict(q.table, r, [...rows, ...items.filter(x => x !== r)])) { writes.push({ op: 'insert-refused', table: q.table, payload: norm(q.payload) }); return finish(null, { code: '23505', message: 'duplicate key value violates unique constraint' }) }
      rows.push(...items); writes.push({ op: 'insert', table: q.table, payload: norm(q.payload) })
      return finish(q.returning ? items : [])
    }
    if (q.op === 'upsert') {
      const on = (q.opts.onConflict || (q.table === 'outreach_settings' ? 'key' : 'id')).split(',').map(x => x.trim())
      const back = []
      for (const r of (Array.isArray(q.payload) ? q.payload : [q.payload])) {
        const ex = rows.find(x => on.every(c => String(x[c]) === String(r[c])))
        if (ex) { if (!q.opts.ignoreDuplicates) { Object.assign(ex, r); back.push(ex) } } else { const n = withDefaults(q.table, r); rows.push(n); back.push(n) }
      }
      writes.push({ op: 'upsert', table: q.table, payload: norm(q.payload), opts: q.opts })
      return finish(q.returning ? back : [])
    }
    if (q.op === 'update') {
      const list = rows.filter(r => matches(r, q.filters))
      for (const r of list) Object.assign(r, q.payload)
      writes.push({ op: 'update', table: q.table, payload: norm(q.payload), filters: norm(q.filters), n: list.length })
      return finish(q.returning ? list : [])
    }
    if (q.op === 'delete') {
      const list = rows.filter(r => matches(r, q.filters))
      T.set(q.table, rows.filter(r => !list.includes(r)))
      writes.push({ op: 'delete', table: q.table, filters: norm(q.filters), n: list.length })
      return finish(q.returning ? list : [])
    }
    return finish([])
  }
  const FILTERS = new Set(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'is', 'ilike'])
  function from(table) {
    const q = { table, op: 'select', filters: [], cols: '*', payload: null, opts: {}, order: null, limit: null, single: null, returning: false }
    const b = new Proxy({}, {
      get(_, k) {
        if (k === 'then') return (res, rej) => exec(q).then(res, rej)
        return (...a) => {
          if (k === 'select') { if (q.op === 'select') q.cols = a[0] || '*'; else { q.returning = true; q.cols = a[0] || '*' } }
          else if (k === 'insert' || k === 'upsert' || k === 'update') { q.op = k; q.payload = a[0]; q.opts = a[1] || {} }
          else if (k === 'delete') q.op = 'delete'
          else if (k === 'not') q.filters.push(['not', a[0], a[1], a[2]])
          else if (FILTERS.has(k)) q.filters.push([k, a[0], a[1]])
          else if (k === 'order') q.order = [a[0], !(a[1] && a[1].ascending === false)]
          else if (k === 'limit') q.limit = a[0]
          else if (k === 'single') q.single = 'single'
          else if (k === 'maybeSingle') q.single = 'maybe'
          return b
        }
      },
    })
    return b
  }
  return { from, T, writes, reads, rpc: async () => ({ data: null, error: null }) }
}

// ══ compile ══════════════════════════════════════════════════════════════════════════════════════════════════════════
const TSC = { resolveJsonModule: true, strict: true, target: 'es2022', lib: ['es2022', 'dom', 'dom.iterable'] }
const now = compile(REPO, ['lib/outreach-mail-poll.ts', 'lib/enquiries/rules.ts', 'lib/inbox/read-model.ts', 'lib/inbox/send.ts', 'lib/inbox/aliases.ts', 'lib/outreach-mail-accounts.ts'], 'inbox2-now', TSC)
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(now.out, 'node_modules')) } catch { /* already */ }
OUTS.push(now.out, fs.realpathSync(now.out))
const R = now.req('lib/enquiries/rules.js')

// ══ fixtures ═════════════════════════════════════════════════════════════════════════════════════════════════════════
function mail(uid, o) {
  const to = o.to || ['hello@hatchgrab.com']
  const hdr = [`From: ${o.name ? `"${o.name}" ` : ''}<${o.from}>`, `To: ${to.join(', ')}`, `Subject: ${o.subject}`, `Message-ID: ${o.id}`, `Date: Mon, 23 Nov 2026 10:${String(uid).padStart(2, '0')}:00 +0000`]
  for (const [k, v] of Object.entries(o.headers || {})) hdr.push(`${k}: ${v}`)
  return {
    uid, internalDate: `2026-11-23T10:${String(uid).padStart(2, '0')}:00.000Z`, text: o.text, headers: hdr.join('\r\n') + '\r\n\r\n',
    envelope: { messageId: o.id, subject: o.subject, from: [{ address: o.from, name: o.name || '' }], to: to.map(a => ({ address: a })), cc: [], date: new Date(`2026-11-23T10:${String(uid).padStart(2, '0')}:00.000Z`) },
  }
}
const DOM = ['dominic@hatchgrab.com']
function boxes() {
  return {
    'hello-fixture': { INBOX: [mail(1, { from: 'ana@madrid.example', name: 'Ana', to: ['hola@hatchgrab.com'], subject: '¿Precio?', id: '<a1@madrid.example>', text: '¿Cuánto cuesta el plan Pro?' })], Spam: [], Archive: [], Sent: [] },
    'dominic-fixture': {
      INBOX: [
        // a linked HatchGrab truck writing to Dominic, by its address → a Customer
        mail(1, { from: 'owner@tacos.example', name: 'Tacos Owner', to: DOM, subject: 'Printer', id: '<t1@tacos.example>', text: 'Our receipt printer stopped printing last night. Can you help?' }),
        // a prospect's reply in its thread → outreach's, as today
        mail(2, { from: 'alice@bakery.example', name: 'Alice', to: DOM, subject: 'Re: A quick idea', id: '<r2@bakery.example>', text: 'Yes please, tell me more.', headers: { 'In-Reply-To': '<out-1@hatchgrab.com>' } }),
        // someone nobody knows writing to Dominic → left alone (not intake: only linked trucks are taken from dominic@)
        mail(3, { from: 'stranger@nowhere.example', to: DOM, subject: 'Hello', id: '<s3@nowhere.example>', text: 'SECRET-STRANGER-TEXT' }),
        // the linked truck again, from another address, replying in the thread Dominic once had with it as a prospect → a Customer
        mail(4, { from: 'chef@tacos.example', name: 'Tacos Chef', to: DOM, subject: 'Re: Hello from HatchGrab', id: '<t4@tacos.example>', text: 'Also: can we change our opening hours?', headers: { 'In-Reply-To': '<out-t@hatchgrab.com>' } }),
        // our own address → left alone
        mail(5, { from: 'dominic@hatchgrab.com', to: DOM, subject: 'note to self', id: '<d5@hatchgrab.com>', text: 'SECRET-SELF-TEXT' }),
      ],
      Spam: [], Archive: [], Sent: [],
    },
  }
}
function seed(switchRow) {
  return {
    outreach_settings: switchRow === undefined ? [] : [switchRow],
    outreach_prospects: [
      { id: 'p-alice', discovery_trucks: { contact_email: 'alice@bakery.example', hatchgrab_truck_id: null } },
      { id: 'p-tacos', discovery_trucks: { contact_email: 'owner@tacos.example', hatchgrab_truck_id: 'linked-tacos' } },
    ],
    discovery_trucks: [
      { id: 'd-alice', contact_email: 'alice@bakery.example', hatchgrab_truck_id: null },
      { id: 'd-tacos', contact_email: 'owner@tacos.example', hatchgrab_truck_id: 'linked-tacos' },
    ],
    outreach_messages: [
      { id: 'om-1', message_id: '<out-1@hatchgrab.com>', prospect_id: 'p-alice', partner_id: null, direction: 'outbound', status: 'sent', is_test: false, account: 'dominic' },
      { id: 'om-t', message_id: '<out-t@hatchgrab.com>', prospect_id: 'p-tacos', partner_id: null, direction: 'outbound', status: 'sent', is_test: false, account: 'dominic' },
    ],
    partners: [], partner_orgs: [], outreach_contacts: [], contact_messages: [],
    // the truck's own contact address differs: the link comes from discovery (the address Dominic emailed as a prospect)
    trucks: [{ id: 'linked-tacos', name: 'Linked Tacos', contact_email: 'orders@tacos.example', country: 'GB' }],
    reply_knowledge: [], enquiries: [], enquiry_messages: [], enquiry_drafts: [], enquiry_spend: [],
  }
}
const ENQ_TABLES = new Set(['enquiries', 'enquiry_messages', 'enquiry_drafts', 'enquiry_spend', 'reply_knowledge'])
const isEnquiryState = w => w.table === 'outreach_settings' && JSON.stringify(w.payload || {}).includes('enquiries_intake_state')

;(async () => {
  try { await main() } catch (e) { fail++; console.log('🔴 harness crashed: ' + (e && e.stack || e)) }
  console.log(`\n${fail ? '🔴' : '✅'} inbox-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()

async function main() {
  // ── 1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('1 · the numbers check: values, not strings')
  const vals = s => R.numbersIn(s).map(n => [n.values, n.unit])
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  t('"1.5" is one and a half — never 15 (both "1.5%" and "1,5 %")', same(vals('1.5%'), [[[1.5], '%']]) && same(vals('1,5 %'), [[[1.5], '%']]))
  t('decimal comma: "0,99 %" → 0.99 %; "0,25 €" → 0.25 €; decimal point "€0.25" → 0.25 €', same(vals('0,99 %'), [[[0.99], '%']]) && same(vals('0,25 €'), [[[0.25], '€']]) && same(vals('€0.25'), [[[0.25], '€']]))
  t('currency before or after: "£29" and "29 €" → 29 with its symbol', same(vals('£29'), [[[29], '£']]) && same(vals('29 €'), [[[29], '€']]) && same(vals('29\u00A0€'), [[[29], '€']]))
  t('thousands with a space, a no-break space, a narrow no-break space or an apostrophe → one value', ['4 000', '4\u00A0000', '4\u202F000', "4'000"].every(x => same(vals(x), [[[4000], '']])))
  t('"4,000" and "4.000" are honestly two readings (4000 in one language, 4 in another)', same(vals('4,000'), [[[4000, 4], '']]) && same(vals('4.000'), [[[4000, 4], '']]))
  t('both marks: "1,234.56" and "1.234,56" → 1234.56; "12.50" → 12.5', same(vals('1,234.56'), [[[1234.56], '']]) && same(vals('1.234,56'), [[[1234.56], '']]) && same(vals('12.50'), [[[12.5], '']]))
  t('two numbers a space apart stay two ("5 7"); digits in any script are read (٧ = 7)', same(vals('5 7'), [[[5], ''], [[7], '']]) && same(vals('٧ أيام'), [[[7], '']]))
  const ck = (d, p) => R.numbersCheck([d], p)
  t('🔴 a French draft "1,5 % + 0,25 €" PASSES against a pack of "1.5% + €0.25"', ck('Frais de carte : 1,5 % + 0,25 € par commande.', 'Card fees: currently 1.5% + €0.25 per online card order.').result === 'pass')
  { const r = ck('The fee is €15.', 'Card fees: currently 1.5% per order.'); t('🔴 an invented "€15" FAILS against a pack holding only 1.5%', r.result === 'fail' && r.unknown.includes('15'), r) }
  t('units must agree: "€1.5" is not "1.5%", "£19" is not "€19"; "19 €" is "€19"', ck('€1.5', 'fee 1.5%').result === 'fail' && ck('£19', 'Pro: €19').result === 'fail' && ck('19 € par mois', 'Pro: €19 a month').result === 'pass')
  t('a bare number may stand for either side ("3 months" vs "3 months"; "€19" vs a plain 19)', ck('3 months', 'trial: 3 months').result === 'pass' && ck('€19', 'Pro 19 a month').result === 'pass')
  t('"4 000 orders" (narrow space) matches "4,000 orders"; "€1,000" matches "1 000 €"', ck('4\u202F000 orders', 'up to 4,000 orders').result === 'pass' && ck('€1,000', 'inclus : 1 000 €').result === 'pass')
  t('the customer\'s own numbers stay allowed (the caller adds their message to the pack text)', ck('With 200 bao a day, Pro at €19 suits you.', 'Pro: €19\nWe do about 200 bao a day.').result === 'pass')

  // ── 2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('2 · 🔴 customers writing to dominic@: the real reply poll, BASE vs now, both accounts')
  const wt = headWorktree('inbox2-base', BASE)
  let base
  try {
    base = compile(wt.wt, ['lib/outreach-mail-poll.ts'], 'inbox2-base', TSC)
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(base.out, 'node_modules')) } catch { /* already */ }
    OUTS.push(base.out, fs.realpathSync(base.out))
  } finally { wt.remove() }
  const POLL_BASE = base.req('lib/outreach-mail-poll.js')
  const POLL_NOW = now.req('lib/outreach-mail-poll.js')
  process.env.OUTREACH_MAIL_USER = 'hello-fixture'; process.env.OUTREACH_MAIL_PASSWORD = 'not-a-password'
  process.env.OUTREACH_PRIMARY_USER = 'dominic-fixture'; process.env.OUTREACH_PRIMARY_PASSWORD = 'not-a-password'
  const strip = s => JSON.parse(JSON.stringify(s))
  async function run(POLL, switchRow, db) {
    BOXES = boxes()
    IMAP.calls = []; IMAP.writes = []; IMAP.locks = []; IMAP.logins = []
    db = db || fakeDb(seed(switchRow))
    const summary = strip(await POLL.runReplyPoll(db))
    return { summary, db, imap: { calls: [...IMAP.calls], writes: [...IMAP.writes], locks: [...IMAP.locks], logins: [...IMAP.logins] } }
  }
  const OFF = { key: 'enquiries_intake_enabled', value: false, updated_at: '2026-11-23T08:00:00.000Z' }
  const ON = { ...OFF, value: true }
  const A = await run(POLL_BASE, OFF), B = await run(POLL_NOW, OFF)
  t(`BASE sanity: both accounts walked, the prospect's reply logged (${A.summary.repliesLogged}), no error`, A.imap.logins.includes('hello-fixture') && A.imap.logins.includes('dominic-fixture') && A.summary.repliesLogged === 1 && A.summary.errors.length === 0, A.summary)
  t('🔴 switch OFF: summary IDENTICAL to BASE', JSON.stringify(B.summary) === JSON.stringify(A.summary), { base: A.summary, now: B.summary })
  t('🔴 switch OFF: every database write IDENTICAL to BASE, in order', JSON.stringify(B.db.writes) === JSON.stringify(A.db.writes))
  t('🔴 switch OFF: every IMAP call IDENTICAL to BASE (no dominic@ enquiry walk, no extra login)', JSON.stringify(B.imap) === JSON.stringify(A.imap), { base: A.imap.calls, now: B.imap.calls })
  t('switch OFF: not one extra database read (BASE already reads the switch)', JSON.stringify(B.db.reads) === JSON.stringify(A.db.reads), B.db.reads.length - A.db.reads.length)
  const C = await run(POLL_BASE, ON), D = await run(POLL_NOW, ON)
  const { enquiries: EC, ...restC } = C.summary
  t('BASE with the switch on: its enquiry step ran too (hello@ only), no error', !!EC && EC.errors.length === 0)
  const { enquiries: ED, ...restD } = D.summary
  t('switch ON: no error anywhere', D.summary.errors.length === 0 && ED && ED.errors.length === 0, { errors: D.summary.errors, e: ED && ED.errors })
  t('🔴 switch ON: the OUTREACH part of the summary identical to BASE (the prospect reply still outreach\'s)', JSON.stringify(restD) === JSON.stringify(restC), { base: restC, now: restD })
  {
    const outreach = w => w.filter(x => !ENQ_TABLES.has(x.table) && !isEnquiryState(x))
    t('🔴 switch ON: every outreach database write identical to BASE (enquiry tables and the enquiry watermark aside)', JSON.stringify(outreach(D.db.writes)) === JSON.stringify(outreach(C.db.writes)),
      { base: outreach(C.db.writes).map(w => w.table + ':' + w.op), now: outreach(D.db.writes).map(w => w.table + ':' + w.op) })
  }
  const en = D.db.T.get('enquiries'), em = D.db.T.get('enquiry_messages')
  const helloBase = C.db.T.get('enquiry_messages').filter(m => m.mailbox === 'hello/INBOX'), helloNow = em.filter(m => m.mailbox === 'hello/INBOX')
  t('hello@\'s intake unchanged: the same message stored, the same way, as BASE', helloBase.length === 1 && JSON.stringify(helloNow.map(m => [m.uid, m.to_address, m.original_text])) === JSON.stringify(helloBase.map(m => [m.uid, m.to_address, m.original_text])))
  const cust = em.filter(m => m.mailbox === 'dominic/INBOX')
  t('🔴 dominic@\'s INBOX: exactly the linked truck\'s two emails taken — by its address (uid 1) and by a reply in its old prospect thread (uid 4)', JSON.stringify(cust.map(m => m.uid).sort()) === '[1,4]', cust.map(m => [m.uid, m.to_address]))
  const custEnq = en.filter(e => cust.some(m => m.enquiry_id === e.id))
  t('🔴 …each a CUSTOMER enquiry linked to that truck (linked-tacos, GB), written to dominic@', custEnq.length >= 1 && custEnq.every(e => e.truck_id === 'linked-tacos' && e.country === 'GB') && cust.every(m => m.to_address === 'dominic@hatchgrab.com'), custEnq)
  t('…left alone and NOT stored: the prospect\'s reply (outreach\'s), the stranger, our own note', ED.customerMailExamined === 2 && ED.customerMailLeft === 3 && !JSON.stringify([...D.db.T.values()]).match(/SECRET-STRANGER-TEXT|SECRET-SELF-TEXT/) && !em.some(m => m.mailbox === 'dominic/INBOX' && [2, 3, 5].includes(m.uid)), ED)
  t('nothing about the linked truck became a prospect: no outreach row or contact for p-tacos, its stage untouched', !D.db.writes.some(w => !ENQ_TABLES.has(w.table) && JSON.stringify(w.payload || {}).includes('p-tacos')))
  t('🔴 READ-ONLY throughout: every lock EXAMINE, no mailbox write in any run', [A, B, C, D].every(r => r.imap.writes.length === 0 && r.imap.locks.every(l => l.readOnly)))
  t('switch ON: one extra session per account for the enquiry step (hello@ as BASE, plus dominic@), bodies read only for the two taken',
    D.imap.logins.length === C.imap.logins.length + 1 && D.imap.logins.filter(u => u === 'dominic-fixture').length === C.imap.logins.filter(u => u === 'dominic-fixture').length + 1
    && D.imap.calls.slice(C.imap.calls.length).filter(c => /^dominic-fixture fetchOne \d+ bodyParts/.test(c)).map(c => c.split(' ')[2]).sort().join() === '1,4', D.imap.calls.slice(C.imap.calls.length))
  t('dominic@\'s walk has its own watermark (enquiries_intake_state → "dominic/INBOX"), hello@\'s stays under "INBOX"',
    (() => { const st = D.db.T.get('outreach_settings').find(r => r.key === 'enquiries_intake_state'); return st && st.value.INBOX && st.value.INBOX.lastUid === 1 && st.value['dominic/INBOX'] && st.value['dominic/INBOX'].lastUid === 5 })())
  const D2 = await run(POLL_NOW, ON, D.db)
  t('a second run: nothing duplicated', D2.db.T.get('enquiry_messages').length === em.length && D2.db.T.get('enquiries').length === en.length)
  {
    // the same email copied to hello@ AND dominic@: held once
    const db = fakeDb(seed(ON))
    BOXES = boxes(); BOXES['hello-fixture'].INBOX.push(mail(2, { from: 'owner@tacos.example', to: ['dominic@hatchgrab.com', 'hello@hatchgrab.com'], subject: 'Printer', id: '<t1@tacos.example>', text: 'Our receipt printer stopped printing last night. Can you help?' }))
    IMAP.calls = []; IMAP.writes = []; IMAP.locks = []; IMAP.logins = []
    const s = strip(await POLL_NOW.runReplyPoll(db))
    t('an email copied to both hello@ and dominic@ is stored once (hello@\'s walk keeps it)', db.T.get('enquiry_messages').filter(m => m.mail_message_id === '<t1@tacos.example>').length === 1 && s.enquiries.skipped.duplicate === 1, s.enquiries)
  }
  // only dominic@ unconfigured (hello@ alone): the dominic@ walk does not exist, as before
  {
    delete process.env.OUTREACH_PRIMARY_USER; delete process.env.OUTREACH_PRIMARY_PASSWORD
    const E1 = await run(POLL_NOW, ON)
    t('with dominic@ not configured: no dominic@ walk, nothing customer-side, no error', !E1.imap.logins.includes('dominic-fixture') && E1.summary.enquiries.customerMailExamined === 0 && E1.summary.errors.length === 0)
    process.env.OUTREACH_PRIMARY_USER = 'dominic-fixture'; process.env.OUTREACH_PRIMARY_PASSWORD = 'not-a-password'
  }

  // ── 3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('3 · the reply to that customer: FROM dominic@, as dominic@, the copy in dominic@\'s Sent')
  {
    const RM = now.req('lib/inbox/read-model.js'), SD = now.req('lib/inbox/send.js')
    const db = D.db
    db.T.set('outreach_settings', [...db.T.get('outreach_settings').filter(r => r.key !== 'enquiries_reply_from_alias'), { key: 'enquiries_reply_from_alias', value: true }, { key: 'mail_aliases', value: ['hola@hatchgrab.com'] }])
    const enqId = cust.find(m => m.uid === 1).enquiry_id
    const inbox = await RM.loadInbox(db, new Date(), async () => [])
    const conv = inbox.conversations.find(c => c.key === `enquiry:${enqId}`)
    t('the Inbox lists it as a Customer, written to dominic@, with the truck\'s name', conv && conv.type === 'customer' && conv.wroteTo === 'dominic@hatchgrab.com' && conv.organisation === 'Linked Tacos', conv)
    const ctx = await RM.loadThread(db, new Date(), `enquiry:${enqId}`, async () => [])
    t('🔴 its reply comes FROM dominic@ (even with the alias setting on); hola@\'s enquiry still gets hola@', ctx.thread.from === 'dominic@hatchgrab.com'
      && (await RM.loadThread(db, new Date(), `enquiry:${helloNow[0].enquiry_id}`, async () => [])).thread.from === 'hola@hatchgrab.com')
    const smtp = [], copies = []
    const deps = {
      db, model: null, packInputs: async () => ({}), now: () => new Date(), sendProspect: async () => ({ ok: false }), sendPartner: async () => ({ ok: false }),
      hello: { user: 'hello-login', pass: 'x' }, dominic: { user: 'dominic-login', pass: 'x' }, fromName: async () => null,
      transport: async (raw, m, login) => { smtp.push({ raw: raw.toString('utf8'), env: m.envelope, login }) },
      fileCopy: async (row, raw, date, login) => { copies.push(login); return { sentCopy: 'appended', mailbox: 'Sent', uid: 9, uidvalidity: null, reason: '' } },
    }
    const r = await SD.sendReply(deps, ctx, { english: 'Hi,\nTry switching the printer off and on again.\nDominic', attachments: [], idempotencyKey: 'k-cust' })
    const from = (/^From: (.*)$/mi.exec((smtp[0] || {}).raw || '') || [])[1] || ''
    t('🔴 sent: From dominic@, envelope dominic@, logged in as dominic@, the Sent copy filed with dominic@\'s login', r.ok === true && /dominic@hatchgrab\.com/.test(from) && smtp[0].env.from === 'dominic@hatchgrab.com' && smtp[0].login.user === 'dominic-login' && copies.length === 1 && copies[0].user === 'dominic-login', { r, from, env: smtp[0] && smtp[0].env })
    t('…"Sent from dominic@hatchgrab.com. It\'s in the conversation history."', r.message === "Sent from dominic@hatchgrab.com. It's in the conversation history.", r.message)
    const ctx2 = await RM.loadThread(db, new Date(), `enquiry:${cust.find(m => m.uid === 4).enquiry_id}`, async () => [])
    const refused = await SD.sendReply({ ...deps, dominic: null }, ctx2, { english: 'Hi', attachments: [], idempotencyKey: 'k-cust2' })
    t('no dominic@ login here → refused before anything is written or sent', refused.ok === false && /dominic@ mailbox credentials/.test(refused.refusal) && smtp.length === 1)
  }

  // ── 4 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('4 · the sweep\'s safety screen')
  {
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/run-harnesses.cjs'), '--dry-run'], { cwd: REPO, encoding: 'utf8' })
    const outText = `${r.stdout}${r.stderr}`
    t('🔴 run-harnesses.cjs --dry-run: every listed harness passes the screen — enquiries-backend-1, inbox-1 and this one included', /✓ all \d+ listed files pass the screen/.test(outText) && !/REFUS/.test(outText), outText.split('\n').filter(l => /REFUS|✓ all/.test(l)))
    t('…and the screen itself is unchanged since BASE', git('diff', '--name-only', BASE, '--', 'scripts/run-harnesses.cjs').trim() === '' && git('ls-files', '--others', '--exclude-standard', '--', 'scripts/run-harnesses.cjs').trim() === '')
  }

  // ── 5 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('5 · 🔴 byte-identical where it must be')
  {
    const poll = read('lib/outreach-mail-poll.ts'), was = git('show', `${BASE}:lib/outreach-mail-poll.ts`)
    const fn = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b))
    t('the outreach walk (pollOneAccount) is byte-identical to BASE', fn(poll, 'async function pollOneAccount(', '// ── THE THREE INCOMING OUTCOMES') === fn(was, 'async function pollOneAccount(', '// ── THE THREE INCOMING OUTCOMES') && fn(was, 'async function pollOneAccount(', '// ── THE THREE INCOMING OUTCOMES').length > 2000)
    t('the directory (loadDirectory) and outreach\'s claim rule (outreachClaims) are byte-identical to BASE',
      fn(poll, 'async function loadDirectory(', '// ── READING ONE MESSAGE') === fn(was, 'async function loadDirectory(', '// ── READING ONE MESSAGE')
      && fn(poll, 'function outreachClaims(', '/**\n * inbox-2') === fn(was, 'function outreachClaims(', '/**\n * hello@ INBOX, READ-ONLY'))
    const removed = git('diff', '--unified=0', BASE, '--', 'lib/outreach-mail-poll.ts').split('\n').filter(l => /^-[^-]/.test(l))
    const section = was.slice(was.indexOf('// ── ENQUIRIES (enquiries-backend-1'))
    t('lib/outreach-mail-poll.ts: every line removed or changed is inside the enquiry section (enquiries-backend-1\'s own code)', removed.length > 0 && removed.every(l => section.includes(l.slice(1))), removed.filter(l => !section.includes(l.slice(1))))
    const PROTECTED = [
      ...fs.readdirSync(path.join(REPO, 'app/(app)')).map(d => `app/(app)/${d}`),
      ...fs.readdirSync(path.join(REPO, 'app/api')).filter(d => d !== 'admin').map(d => `app/api/${d}`),
      ...fs.readdirSync(path.join(REPO, 'components')).map(d => `components/${d}`),
      'app/contact', 'app/(public)', 'app/page.tsx', 'app/layout.tsx', 'messages', 'content', 'public', 'proxy.ts', 'next.config.ts', 'vercel.json',
      ...fs.readdirSync(path.join(REPO, 'lib')).map(f => `lib/${f}`).filter(p => !['lib/inbox', 'lib/enquiries', 'lib/outreach-mail-poll.ts', 'lib/outreach-mail-accounts.ts'].includes(p)),
    ].filter(p => fs.existsSync(path.join(REPO, p)))
    const MINE = new Set(['lib/enquiries/rules.ts', 'lib/enquiries/run.ts', 'lib/enquiries/store.ts', 'lib/outreach-mail-poll.ts', 'lib/outreach-mail-accounts.ts', 'lib/inbox/aliases.ts', 'lib/inbox/send.ts',
      'app/api/admin/inbox/route.ts', 'scripts/inbox-1.cjs', 'scripts/inbox-2.cjs', 'scripts/enquiries-backend-1.cjs', 'scripts/harnesses.json'])
    const commits = git('log', '--format=%H', `${BASE}..HEAD`, '--grep', '^inbox-2').split('\n').filter(Boolean)
    const touched = new Set(commits.flatMap(c => git('show', '--name-only', '--format=', c).split('\n').filter(Boolean)))
    for (const f of MINE) if (git('diff', '--name-only', 'HEAD', '--', f).trim() || git('ls-files', '--others', '--exclude-standard', '--', f).trim()) touched.add(f)
    const isProtected = f => PROTECTED.some(p => f === p || f.startsWith(p + '/'))
    t(`🔴 ${PROTECTED.length} protected paths (every app screen, every API route but admin, every component, every lib file but the enquiry / inbox / poll / accounts ones, the contact form, the landing, every customer page and word): not one touched by this work`,
      [...touched].filter(isProtected).length === 0, [...touched].filter(isProtected))
    t('this work changed only its own files (docs aside)', [...touched].filter(f => !f.startsWith('docs/')).every(f => MINE.has(f)), [...touched].filter(f => !f.startsWith('docs/') && !MINE.has(f)))
    const named = new RegExp(['gus', 'to|chur', 'rasco'].join(''), 'i')   // NAMED_NOWHERE
    t('Pizzeria Gusto and Le Roi du Churrasco: named in no fixture of this harness', !named.test(read('scripts/inbox-2.cjs').split('\n').filter(l => !/NAMED_NOWHERE/.test(l)).join('\n'))) // NAMED_NOWHERE
  }
}
