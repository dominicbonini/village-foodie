#!/usr/bin/env node
// scripts/enquiries-backend-1.cjs — enquiries-backend-1 (23 November 2026, docs/enquiries-backend-1-report.md): THE ENQUIRY BACKEND —
// LOG, TRANSLATE, DRAFT — AND NOTHING SENT. Swept.
//   node scripts/enquiries-backend-1.cjs      (NO NETWORK, NO DATABASE, NO MAILBOX, NO MODEL, NO .env FILE: fixtures and a stand-in model)
//
//   1 · rules: what is never stored (contact-form copy, own mail, bounce, auto-reply, no-reply, a diner's order mail), threading, refs
//   2 · the answer pack: approved lines only, topics and country, guidance under DO NOT MENTION, nothing else
//   3 · drafting with the STAND-IN model: the French enquiry (deadline gap, demo with full access, card fees apart, numbers pass), the
//       French follow-up (the FR e-reporting gap), an English enquiry fully covered (drafted, no flags), an invented price (numbers
//       fail), the spend cap (no call), canAutoSend
//   4 · learning: suggestFromEdit, "Note:" lines
//   5 · 🔴 THE REPLY POLL END TO END, compiled from HEAD (BASE) and from this tree, on a fake read-only mailbox and a fake database:
//       switch off (false or absent) → summary and every write identical to BASE; switch on → the outreach part identical, the enquiry
//       part stores exactly the two real messages and the form message, and the six that must store nothing store nothing
//   6 · 🔴 the source census: no enquiry module reaches a send path or a mailbox write; the mailbox stays read-only
//   7 · 🔴 byte-identical to BASE: ordering, checkout, payments, KDS, dashboard, Add order, heartbeat, auth, Manage, admin, the contact form,
//       every customer page and word, the landing, the four shared readers, the outreach / partner matching; and only this work's files
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
require('./_disk-guard.cjs').guard(__filename)
require('./_harness-tmp.cjs') // tmp-cleanup-1: temp goes under $TMPDIR/hatchgrab-harness/ and is removed on exit ("Disk space")
const fs = require('fs')
const path = require('path')
const Module = require('module')
const { execFileSync } = require('child_process')
const { compile, headWorktree, REPO } = require('./_slot-interval-compile.cjs')

/** The commit before enquiries-backend-1. */
const BASE = '5df925d8'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// 🔴 No model, no mail login, no database login in this process — whatever the shell has.
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC_|OUTREACH_|SUPABASE_|BREVO_)/.test(k)) delete process.env[k]

/** The compiled trees (this one, BASE's). */
const OUTS = []
// The message catalogues' lazy server loads (`require('@/messages/…')`) resolve from the repo, whichever compiled tree asks; and
// Next's `server-only` marker (bundled by Next, not installed — lib/outreach-retry-rebuild.ts imports it at BASE too) is an empty stub.
{
  const stub = path.join(require('os').tmpdir(), `enq-server-only-${process.pid}.js`)
  fs.writeFileSync(stub, 'module.exports = {}\n')
  const real = Module._resolveFilename
  Module._resolveFilename = function (r, parent, ...rest) {
    if (r === 'server-only') return stub
    if (r.startsWith('@/messages/')) return real.call(this, path.join(REPO, r.slice(2)), parent, ...rest)
    // A lazy `import('@/…')` runs after compile()'s alias is gone: resolve it in the compiled tree that asked.
    const tree = r.startsWith('@/') && parent && parent.filename ? OUTS.find(o => parent.filename.startsWith(o + path.sep)) : null
    if (tree) return real.call(this, path.join(tree, r.slice(2)), parent, ...rest)
    return real.call(this, r, parent, ...rest)
  }
}

// ── the fake mailbox: imapflow, READ-ONLY by construction ─────────────────────────────────────────────────────────────
/** Every IMAP call any run made, and any attempt at a write (there must be none). */
const IMAP = { calls: [], writes: [], locks: [], logins: [] }
let MAILBOX = { INBOX: [] }
const READ_METHODS = new Set(['connect', 'logout', 'status', 'getMailboxLock', 'fetch', 'fetchOne', 'search', 'on', 'once', 'off', 'close', 'mailbox', 'usable', 'authenticated'])
class FakeImapBase {
  constructor(opts) { IMAP.logins.push(opts.auth.user); this.mailbox = false }
  async connect() { IMAP.calls.push('connect') }
  async logout() { IMAP.calls.push('logout') }
  async status(p) { IMAP.calls.push(`status ${p}`); const box = MAILBOX[p] || []; return { messages: box.length, uidValidity: 7 } }
  async getMailboxLock(p, o) {
    IMAP.locks.push({ path: p, readOnly: !!(o && o.readOnly) })
    const box = MAILBOX[p] || []
    this.mailbox = { path: p, uidValidity: 7, uidNext: box.reduce((m, x) => Math.max(m, x.uid), 0) + 1, readOnly: !!(o && o.readOnly) }
    return { release: () => { this.mailbox = false } }
  }
  async *fetch(query, opts) {
    IMAP.calls.push(`fetch ${typeof query === 'string' ? query : 'since'}${opts && opts.bodyParts ? ' bodyParts' : ''}`)
    const box = MAILBOX[this.mailbox.path] || []
    let list = box
    if (typeof query === 'string') { const from = Number(query.split(':')[0]); list = box.filter(m => m.uid >= from) }
    else if (query && query.since) list = box.filter(m => new Date(m.internalDate) >= new Date(new Date(query.since).toISOString().slice(0, 10)))
    for (const m of list) yield { uid: m.uid, envelope: m.envelope, headers: Buffer.from(m.headers), internalDate: new Date(m.internalDate) }
  }
  async fetchOne(uid, opts) {
    IMAP.calls.push(`fetchOne ${uid} ${Object.keys(opts).filter(k => k !== 'uid').join(',')}`)
    const m = (MAILBOX[this.mailbox.path] || []).find(x => String(x.uid) === String(uid))
    if (!m) return false
    if (opts.bodyStructure) return { uid: m.uid, bodyStructure: { type: 'text/plain', encoding: '8bit', parameters: { charset: 'utf-8' }, size: m.text.length } }
    if (opts.bodyParts) return { uid: m.uid, bodyParts: new Map([['1', Buffer.from(m.text)]]) }
    return { uid: m.uid }
  }
}
/** Any method that is not a read is recorded as a WRITE and refused. */
function FakeImapFlow(opts) {
  const inner = new FakeImapBase(opts)
  return new Proxy(inner, {
    get(target, k) {
      if (typeof k === 'string' && !(k in target) && !READ_METHODS.has(k) && typeof k === 'string' && !k.startsWith('_') && k !== 'then') {
        return () => { IMAP.writes.push(k); throw new Error(`mailbox write refused: ${k}`) }
      }
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

// ── the fake database (supabase-js's query surface, with the real tables' unique keys) ───────────────────────────────
function fakeDb(seed) {
  const T = new Map(Object.entries(JSON.parse(JSON.stringify(seed))))
  const writes = [], reads = []
  let seq = 0, refSeq = 0
  const UNIQUE = { outreach_settings: [['key']], outreach_messages: [['message_id']], enquiries: [['contact_message_id'], ['ref']], enquiry_messages: [['mailbox', 'mail_message_id']], enquiry_spend: [['month']] }
  const rowsOf = t => { if (!T.has(t)) T.set(t, []); return T.get(t) }
  const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/
  const norm = v => JSON.parse(JSON.stringify(v ?? null, (k, x) => (typeof x === 'string' && iso.test(x) ? '<ts>' : x)))
  const ilike = p => new RegExp('^' + p.replace(/\\([\\%_])|([%_])|([.*+?^${}()|[\]])/g, (m, esc, wild, sp) => esc ? '\\' + esc : wild ? (wild === '%' ? '.*' : '.') : '\\' + sp) + '$', 'i')
  function matches(r, filters) {
    return filters.every(([op, c, v]) => {
      const x = r[c]
      switch (op) {
        case 'eq': return x === v || (x != null && v != null && String(x) === String(v))
        case 'neq': return String(x) !== String(v)
        case 'lt': return x != null && String(x) < String(v)
        case 'lte': return x != null && String(x) <= String(v)
        case 'gt': return x != null && String(x) > String(v)
        case 'gte': return x != null && String(x) >= String(v)
        case 'in': return v.map(String).includes(String(x))
        case 'is': return v === null ? x == null : x === v
        case 'ilike': return x != null && ilike(String(v)).test(String(x))
        default: return true
      }
    })
  }
  function conflict(table, row, rows) {
    for (const key of UNIQUE[table] || []) {
      if (key.some(c => row[c] == null)) continue
      const hit = rows.find(r => r !== row && key.every(c => String(r[c]) === String(row[c])))
      if (hit) return hit
    }
    return null
  }
  function withDefaults(table, r) {
    const out = { id: `${table}-${++seq}`, ...r }
    if (table === 'enquiries') { out.ref = out.ref || `ENQ-${String(++refSeq).padStart(4, '0')}`; out.status = out.status || 'new'; out.created_at = out.created_at || new Date().toISOString(); out.updated_at = out.updated_at || out.created_at }
    if (table === 'enquiry_messages') out.created_at = new Date().toISOString()
    if (table === 'enquiry_drafts') out.created_at = new Date().toISOString()
    return out
  }
  async function exec(q) {
    const rows = rowsOf(q.table)
    const hit = () => {
      let list = rows.filter(r => matches(r, q.filters))
      if (q.order) list = [...list].sort((a, b) => (String(a[q.order[0]]) < String(b[q.order[0]]) ? -1 : String(a[q.order[0]]) > String(b[q.order[0]]) ? 1 : 0) * (q.order[1] ? 1 : -1))
      if (q.limit != null) list = list.slice(0, q.limit)
      return list
    }
    const shape = list => list.map(r => {
      const o = { ...r }
      if (q.table === 'enquiry_messages' && /enquiries\(/.test(q.cols || '')) { const e = rowsOf('enquiries').find(x => x.id === r.enquiry_id); o.enquiries = e ? { email: e.email } : null }
      return o
    })
    const finish = (list, error = null) => {
      if (error) return { data: null, error }
      if (q.single === 'single') return list.length ? { data: list[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      if (q.single === 'maybe') return { data: list[0] ?? null, error: null }
      return { data: list, error: null }
    }
    if (q.op === 'select') { reads.push({ table: q.table, filters: norm(q.filters) }); return finish(shape(hit())) }
    if (q.op === 'insert') {
      const items = (Array.isArray(q.payload) ? q.payload : [q.payload]).map(r => withDefaults(q.table, r))
      for (const r of items) if (conflict(q.table, r, [...rows, ...items.filter(x => x !== r)])) { writes.push({ op: 'insert-refused', table: q.table, payload: norm(q.payload) }); return finish(null, { code: '23505', message: 'duplicate key value violates unique constraint' }) }
      rows.push(...items); writes.push({ op: 'insert', table: q.table, payload: norm(q.payload) })
      return finish(q.returning ? items : [])
    }
    if (q.op === 'upsert') {
      const items = Array.isArray(q.payload) ? q.payload : [q.payload]
      const on = (q.opts.onConflict || (q.table === 'outreach_settings' ? 'key' : 'id')).split(',').map(s => s.trim())
      const back = []
      for (const r of items) {
        const ex = rows.find(x => on.every(c => String(x[c]) === String(r[c])))
        if (ex) { if (!q.opts.ignoreDuplicates) { Object.assign(ex, r); back.push(ex) } }
        else { const n = withDefaults(q.table, r); rows.push(n); back.push(n) }
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
  const FILTERS = new Set(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'is', 'ilike', 'like', 'not', 'or', 'filter', 'match', 'contains'])
  function from(table) {
    const q = { table, op: 'select', filters: [], cols: '*', payload: null, opts: {}, order: null, limit: null, single: null, returning: false }
    const b = new Proxy({}, {
      get(_, k) {
        if (k === 'then') return (res, rej) => exec(q).then(res, rej)
        return (...a) => {
          if (k === 'select') { if (q.op === 'select') q.cols = a[0] || '*'; else { q.returning = true; q.cols = a[0] || '*' } }
          else if (k === 'insert' || k === 'upsert' || k === 'update') { q.op = k; q.payload = a[0]; q.opts = a[1] || {} }
          else if (k === 'delete') q.op = 'delete'
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
/** The project's own strictness and library (tsconfig.json), so a narrowing the app relies on compiles here too. */
const TSC = { resolveJsonModule: true, strict: true, target: 'es2022', lib: ['es2022', 'dom', 'dom.iterable'] }
const ENQ_FILES = ['lib/enquiries/rules.ts', 'lib/enquiries/answer-pack.ts', 'lib/enquiries/model.ts', 'lib/enquiries/learning.ts', 'lib/enquiries/run.ts', 'lib/enquiries/store.ts', 'lib/enquiries/order-subjects.ts']
const now = compile(REPO, [...ENQ_FILES, 'lib/outreach-mail-poll.ts'], 'enq-now', TSC)
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(now.out, 'node_modules')) } catch { /* already */ }
OUTS.push(now.out, fs.realpathSync(now.out))
const R = now.req('lib/enquiries/rules.js')
const P = now.req('lib/enquiries/answer-pack.js')
const RUN = now.req('lib/enquiries/run.js')
const L = now.req('lib/enquiries/learning.js')
const S = now.req('lib/enquiries/store.js')
const OS = now.req('lib/enquiries/order-subjects.js')
const M = now.req('lib/enquiries/model.js')

// ══ 1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · rules: what is never stored, threading, the ref')
const orderSubjects = OS.orderSubjectPatterns()
t(`order-mail subjects built from the email catalogue in every language: ${orderSubjects.length} patterns`, orderSubjects.length > 100)
const H = (o) => {
  const hdr = Object.fromEntries(Object.entries(o.headers || {}).map(([k, v]) => [k.toLowerCase(), v]))
  return { get: n => (n in hdr ? hdr[n] : null), subject: o.subject ?? null, fromAddress: o.from ?? null, contentType: hdr['content-type'] ?? null, to: o.to || ['hello@hatchgrab.com'] }
}
const cases = [
  ['the Brevo contact-form copy', H({ from: 'hello@hatchgrab.com', subject: '[HatchGrab contact] A question about HatchGrab — Claire (France, French)' }), 'contact_form_copy'],
  ['a bounce (mailer-daemon)', H({ from: 'MAILER-DAEMON@mx.example.net', subject: 'Undelivered Mail Returned to Sender' }), 'bounce'],
  ['a bounce (Return-Path <>, a delivery report)', H({ from: 'reports@mx.example.net', subject: 'Delivery Status Notification', headers: { 'Return-Path': '<>' } }), 'bounce'],
  ['an auto-reply (Auto-Submitted)', H({ from: 'someone@example.de', subject: 'Abwesenheitsnotiz', headers: { 'Auto-Submitted': 'auto-replied' } }), 'auto_reply'],
  ['a no-reply sender', H({ from: 'no-reply@payments.example.com', subject: 'Your receipt' }), 'noreply'],
  ['a noreply sender (no hyphen)', H({ from: 'noreply@app.example.com', subject: 'Welcome' }), 'noreply'],
  ["Dominic's own address", H({ from: 'dominic@hatchgrab.com', subject: 'test' }), 'own_address'],
  ['another address on our domain (no loops)', H({ from: 'alerts@hatchgrab.com', subject: 'x' }), 'own_address'],
  ['a Village Foodie address', H({ from: 'hello@villagefoodie.co.uk', subject: 'x' }), 'own_address'],
  ["a diner's reply to their French order email", H({ from: 'diner@example.fr', subject: 'RE: Votre commande #12 est prête — Chez Paul' }), 'order_mail'],
  ["a diner's reply to their English refund email", H({ from: 'diner@example.co.uk', subject: 'Re: Your order #41 has been refunded — Taco Van' }), 'order_mail'],
  ["a diner's reply to a review request (German)", H({ from: 'diner@example.de', subject: 'AW: ' + (() => { try { return require(path.join(REPO, 'messages/ns/de-DE/emailReview.json')).subject.replace('{truck}', 'Wurstwagen') } catch { return 'x' } })() }), 'order_mail'],
  ['mail sent to the order-mail address', H({ from: 'diner@example.fr', subject: 'Question', to: ['donotreply@hatchgrab.com'] }), 'order_mail'],
  ['a real enquiry (French)', H({ from: 'marc@crepes-example.fr', subject: 'Question sur HatchGrab' }), null],
  ['a real enquiry asking about online ORDERS as a feature (not order mail)', H({ from: 'ana@example.es', subject: 'How do online orders work?' }), null],
  ['a visitor replying to Dominic\'s answer to their form message ("Re: [HatchGrab contact]")', H({ from: 'claire@example.fr', subject: 'Re: [HatchGrab contact] A question about HatchGrab — Claire (France, French)' }), null],
]
for (const [label, h, want] of cases) t(`${label} → ${want ?? 'an enquiry'}`, R.skipReason(h, orderSubjects) === want, R.skipReason(h, orderSubjects))
t('the model hook is named and not called today (ORDER_MAIL_MODEL_HOOK = "classifyOrderMail"; the poll passes no such dependency)',
  R.ORDER_MAIL_MODEL_HOOK === 'classifyOrderMail' && !/classifyOrderMail/.test(read('lib/outreach-mail-poll.ts')))
t('refInSubject: "Re: Votre question [ENQ-0042]" → ENQ-0042; none → null', R.refInSubject('Re: Votre question [ENQ-0042]') === 'ENQ-0042' && R.refInSubject('Bonjour') === null)
{
  const k = { byMailId: new Map([['<a1@crepes-example.fr>', { enquiryId: 'e1', email: 'marc@crepes-example.fr' }]]), byRef: new Map([['ENQ-0007', { enquiryId: 'e7', email: 'marc@crepes-example.fr' }]]), latestFormFor: e => (e === 'claire@example.fr' ? { enquiryId: 'e9', email: e } : null) }
  const d1 = R.threadFor({ from: 'Marc@Crepes-Example.fr', subject: 'Re: Question', inReplyTo: '<a1@crepes-example.fr>', references: null }, k)
  const d2 = R.threadFor({ from: 'eve@other.example', subject: 'Re: Question', inReplyTo: '<a1@crepes-example.fr>', references: null }, k)
  const d3 = R.threadFor({ from: 'marc@crepes-example.fr', subject: 'Suite [ENQ-0007]', inReplyTo: null, references: null }, k)
  const d4 = R.threadFor({ from: 'claire@example.fr', subject: 'Re: [HatchGrab contact] A question', inReplyTo: '<brevo-1@smtp-relay.example>', references: null }, k)
  const d5 = R.threadFor({ from: 'marc@crepes-example.fr', subject: 'Autre question', inReplyTo: null, references: null }, k)
  t('threading: In-Reply-To from the same person → joins (case aside)', d1.kind === 'join' && d1.enquiryId === 'e1' && d1.by === 'headers', d1)
  t('threading: the same thread id from a DIFFERENT person → a new enquiry (never someone else\'s)', d2.kind === 'new', d2)
  t('threading: the ENQ ref in the subject, same person → joins', d3.kind === 'join' && d3.enquiryId === 'e7', d3)
  t('threading: a reply to the contact-form copy → joins their form enquiry', d4.kind === 'join' && d4.enquiryId === 'e9' && d4.by === 'form_copy_reply', d4)
  t('threading: a fresh email with no thread and no ref → new', d5.kind === 'new', d5)
}
{
  const n = R.numbersCheck(['Le prix est de 1,5 % + 0,25 € et 7 jours.'], 'currently 1.5% + €0.25 … up to 7 days')
  const m = R.numbersCheck(['Only 29 € a month.'], 'Pro: €19 a month')
  const a = R.numbersCheck(['٧ أيام'], 'up to 7 days')
  t('numbers check: French decimal commas and euro signs match the pack\'s English forms → pass', n.result === 'pass' && n.checked === 3, n)
  t('numbers check: an amount the pack does not state → fail, naming it', m.result === 'fail' && m.unknown.includes('29'), m)
  t('numbers check: Arabic-Indic digits read as digits (٧ = 7) → pass', a.result === 'pass', a)
}
t('canAutoSend: false with a flag; false with a failed numbers check; false with an ask not available; and false with none (no send path: AUTO_SEND_BUILT false)',
  R.canAutoSend({ flags: [{ kind: 'ask_gap', detail: '' }], numbers_check: 'pass', asks: [] }) === false
  && R.canAutoSend({ flags: [], numbers_check: 'fail', asks: [] }) === false
  && R.canAutoSend({ flags: [], numbers_check: 'pass', asks: [{ status: 'limited' }] }) === false
  && R.canAutoSend({ flags: [], numbers_check: 'pass', asks: [{ status: 'available' }] }) === false && R.AUTO_SEND_BUILT === false)

// ══ 2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · the answer pack')
/** The seed, exactly as the migration writes it (ids added). */
function seedKnowledge() {
  const sql = read('supabase/migrations/20261123_enquiries_backend_1.sql')
  const block = sql.slice(sql.indexOf('from (values'), sql.indexOf(') as v(kind'))
  const rows = []
  for (const line of block.split('\n')) {
    const m = /^\s*\('(fact|guidance|gap)', array\[([^\]]*)\], '((?:[^']|'')*)', (true|false), array\[([^\]]*)\](?:::text\[\])?, '(approved|suggested)'\)/.exec(line)
    if (!m) continue
    const list = s => s.split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean)
    rows.push({ id: `k${rows.length + 1}`, kind: m[1], topics: list(m[2]), wording: m[3].replace(/''/g, "'"), customer_safe: m[4] === 'true', countries: list(m[5]), status: m[6], source: 'dominic', source_ref: '23 Nov 2026' })
  }
  return rows
}
const KNOW = seedKnowledge()
t('the seed: 8 lines — 7 approved (2 guidance, 3 facts, 2 gaps), 1 suggested (the till line), all source dominic / 23 Nov 2026',
  KNOW.length === 8 && KNOW.filter(k => k.status === 'approved').length === 7 && KNOW.filter(k => k.kind === 'guidance').length === 2
  && KNOW.filter(k => k.kind === 'gap').length === 2 && KNOW.find(k => k.status === 'suggested').topics.includes('till') && KNOW.every(k => k.source === 'dominic'), KNOW.map(k => [k.kind, k.status, k.topics.join('|')]))
t('the seed: the e-reporting gap is FR only; guidance is never customer-safe', KNOW.find(k => k.topics.includes('e-reporting')).countries.join() === 'FR' && KNOW.filter(k => k.kind === 'guidance').every(k => !k.customer_safe))
const PACK_FR = {
  country: 'FR', countryName: 'France', language: 'fr-FR',
  plans: [{ name: 'Pay as you go', monthly: '0 €', includedOnline: null, feePercent: '0.99%', extraVan: null }, { name: 'Pro', monthly: '19 €', includedOnline: '4 000 €', feePercent: '0.99%', extraVan: '9 €' }, { name: 'Unlimited', monthly: '39 €', includedOnline: 'unlimited', feePercent: null, extraVan: '9 €' }],
  trial: { months: 3, planName: 'Trial' }, cardFeeOnline: '1,5% + 0,25 €',
  features: [{ name: 'Advance pre-ordering', comingSoon: false, plans: ['Pro', 'Unlimited'] }, { name: 'Pre-order deadline', comingSoon: false, plans: ['Pro', 'Unlimited'] }, { name: 'Loyalty stamp cards', comingSoon: true, plans: [] }],
  faq: [{ q: 'Puis-je essayer HatchGrab gratuitement ?', a: "Oui, 3 mois d'essai, sans carte." }],
}
const PACK_GB = { ...PACK_FR, country: 'GB', countryName: 'United Kingdom', language: 'en-GB', plans: [{ name: 'Pro', monthly: '£19', includedOnline: '£4,000', feePercent: '0.99%', extraVan: '£9' }], cardFeeOnline: '1.5% + 20p', faq: [{ q: 'Can I try HatchGrab for free?', a: 'Yes — 3 months, no card needed.' }] }
{
  const pack = P.buildAnswerPack(PACK_FR, KNOW, ['preorders', 'deadline', 'demo', 'prices', 'till', 'e-reporting'])
  const ids = pack.knowledge.map(k => k.id)
  t('FR pack: the pre-orders fact, the deadline gap, the demo fact and the FR e-reporting gap are in "may be said"',
    ['preorders', 'deadline', 'demo', 'e-reporting'].every(tp => pack.knowledge.some(k => KNOW.find(x => x.id === k.id).topics.includes(tp))), ids)
  t('FR pack: the suggested till line is NOT in it (only approved lines ever reach the pack)', !pack.text.includes("doesn't connect to other till software"))
  t('FR pack: the card-fee guidance is under DO NOT MENTION only, never in "may be said"',
    pack.doNotMention.some(g => /Card fees for online card orders/.test(g.wording)) && !pack.knowledge.some(k => /Card fees for online card orders/.test(k.wording))
    && pack.text.indexOf('Card fees for online card orders (Stripe') > pack.text.indexOf('DO NOT MENTION'))
  t('FR pack: plans, the trial, Stripe\'s card fee stated on its own line, the features list and the French FAQ are in it',
    /Pro: 19 € a month/.test(pack.text) && /Free trial: 3 months/.test(pack.text) && /Card fees on online card orders are Stripe's, charged separately and never free: currently 1,5% \+ 0,25 €/.test(pack.text)
    && /Loyalty stamp cards — coming soon/.test(pack.text) && /Puis-je essayer/.test(pack.text))
  const gb = P.buildAnswerPack(PACK_GB, KNOW, ['e-reporting', 'accounting', 'demo'])
  t('GB pack asked about e-reporting: the FR-only gap is NOT in it (another country\'s line never passes)', !gb.text.includes('E-reporting (France)') && gb.knowledge.some(k => /Demo requests/.test(k.wording)))
  const none = P.buildAnswerPack(PACK_GB, KNOW, ['languages'])
  t('a topic no line has → "nothing for these topics", and no guidance', /\(nothing for these topics\)/.test(none.text) && none.doNotMention.length === 0)
  const retired = P.selectKnowledge([{ ...KNOW[1], status: 'retired' }, { ...KNOW[1], id: 'x', status: 'suggested' }], ['demo'], 'GB')
  t('selectKnowledge: retired and suggested lines never pass', retired.length === 0)
  const src = noComments(read('lib/enquiries/answer-pack-server.ts'))
  t('the pack\'s inputs come from the pages\' own readers (getCountrySettings, getPlanCatalog, faqPage, offerPlans, FEATURE_TABLE) and nothing else is read',
    /getCountrySettings\(country\)/.test(src) && /getPlanCatalog\(\)/.test(src) && /faqPage\(settings\)/.test(src) && /offerPlans\(catalog, country\)/.test(src) && /FEATURE_TABLE\.map/.test(src)
    && !/from\(['"]/.test(src) && !/docs\/|reference-manual|readFileSync|\.env/.test(src))
  t('the store reads only APPROVED knowledge (the query filters status = approved, and filters again)', /from\('reply_knowledge'\)[^\n]*\.eq\('status', 'approved'\)/.test(read('lib/enquiries/store.ts')))
}

// ══ 3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · drafting with the stand-in model')
/**
 * 🔴 THE STAND-IN MODEL. No network. It writes ONLY from the pack it is handed: for each ask it looks for an approved line in the pack
 * text (by a keyword the test names), cites it, and copies its words; prices and the card fee are copied from the pack's own lines. So
 * what it drafts proves what the PIPELINE gave it — a line missing from the pack makes the ask "unknown".
 */
function standIn(script, o = {}) {
  const calls = []
  const usd = o.usd ?? 0.01
  const lineFor = (packText, kw) => {
    for (const l of packText.split('\n')) { const m = /^- \[k:([^\]]+)\] (FACT|GAP): (.*)$/.exec(l); if (m && m[3].toLowerCase().includes(kw.toLowerCase())) return { id: m[1], kind: m[2], wording: m[3] } }
    return null
  }
  const fr = s => `[fr] ${s}`
  return {
    calls, model: 'stand-in',
    async understand(req) {
      calls.push('understand')
      const s = script.find(x => req.text.includes(x.marker))
      if (!s) throw new Error('stand-in: no script for this message')
      for (const a of s.asks) for (const tp of a.topics) if (!req.topics.includes(tp)) throw new Error(`stand-in: topic "${tp}" is not in the vocabulary`)
      return { value: { language: s.language, english_text: s.english, asks: s.asks.map(a => ({ ask: a.ask, topics: a.topics })), country_guess: s.countryGuess || '' }, usd }
    },
    async draft(req) {
      calls.push('draft')
      const s = script.find(x => req.englishText === x.english)
      const lines = [`Hi${req.name ? ` ${req.name.split(' ')[0]}` : ''},`]
      const asks = []
      for (const a of s.asks) {
        if (a.kind === 'prices') {
          const plan = /^- (Pro): ([^;\n]+) a month/m.exec(req.packText)
          const fee = /currently ([^\n]+?) per online card order/.exec(req.packText)
          const trial = /Free trial: (\d+) months/.exec(req.packText)
          if (trial) lines.push(`You can try everything free for ${trial[1]} months — free covers the plan and HatchGrab's own fees.`)
          if (plan) lines.push(`After that, ${plan[1]} is ${plan[2]} a month.`)
          if (fee) lines.push(`Card fees on online card orders are Stripe's and are charged separately: currently ${fee[1]} per order.`)
          asks.push({ ask: a.ask, topics: a.topics, status: plan ? 'available' : 'unknown', sources: plan ? ['plans'] : [], note: '' })
          continue
        }
        const k = lineFor(req.packText, a.kw)
        if (!k) { lines.push(`About ${a.ask.toLowerCase()}: I'll come back to you on that.`); asks.push({ ask: a.ask, topics: a.topics, status: 'unknown', sources: [], note: 'not in the pack' }); continue }
        lines.push(k.wording.replace(/; flag for review\.?$/, '.').replace(/ — describe the rule$/, ''))
        asks.push({ ask: a.ask, topics: a.topics, status: k.kind === 'GAP' ? 'gap' : 'available', sources: [`k:${k.id}`], note: k.kind === 'GAP' ? 'approved gap' : '' })
      }
      if (o.invent) lines.push(o.invent)
      if (o.noteLine) lines.push(o.noteLine)
      lines.push('Dominic')
      const english = lines.join('\n')
      return { value: { asks, english_draft: english, customer_draft: req.customerLanguage.startsWith('en') ? english : fr(english) }, usd }
    },
    async backTranslate(req) { calls.push('back'); return { value: { english: req.text.replace(/^\[fr\] /, '') }, usd } },
  }
}
/** An in-memory EnquiryStore over the fake database — the REAL lib/enquiries/store.ts. */
const memStore = db => S.supabaseEnquiryStore(db)
const FR_TEXT = "Bonjour, je tiens une crêperie ambulante à Valmont-sur-Loire (marchés le mercredi et le samedi). Combien coûte HatchGrab après l'essai gratuit ? Est-ce que je peux fixer pour chaque marché une date et une heure limite précises pour les précommandes ? J'aimerais aussi voir une démo. Et est-ce que ça se connecte à ma caisse actuelle ? Merci, Marc Lenoir, Crêpes du Coin"
const FR_FOLLOW = "Merci ! Autre question : est-ce que HatchGrab envoie la facturation électronique (e-reporting) aux impôts ? Marc"
const EN_TEXT = "Hello, could I see a demo of HatchGrab? And how far ahead can customers pre-order before a market? Thanks, Sam (Sam's Bao Bus)"
const SCRIPT = [
  { marker: 'crêperie ambulante', language: 'fr', english: "Hello, I run a mobile crêperie in Valmont-sur-Loire (markets on Wednesday and Saturday). How much does HatchGrab cost after the free trial? Can I set a precise deadline date and time for pre-orders for each market? I'd also like to see a demo. And does it connect to my current till? Thanks, Marc Lenoir, Crêpes du Coin",
    asks: [{ ask: 'Price after the free trial', topics: ['prices', 'trial'], kind: 'prices' }, { ask: 'A deadline date and time for pre-orders per market', topics: ['preorders', 'deadline'], kw: 'deadline typed in' }, { ask: 'See a demo', topics: ['demo'], kw: 'full access' }, { ask: 'Connect to the current till', topics: ['till'], kw: 'till software' }] },
  { marker: 'e-reporting', language: 'fr', english: 'Thanks! Another question: does HatchGrab send e-invoicing (e-reporting) to the tax office? Marc',
    asks: [{ ask: 'Does HatchGrab send e-reporting', topics: ['e-reporting', 'accounting'], kw: 'e-reporting (france)' }] },
  { marker: 'pre-order before a market', language: 'en', english: EN_TEXT,
    asks: [{ ask: 'See a demo', topics: ['demo'], kw: 'full access' }, { ask: 'How far ahead pre-orders open', topics: ['preorders'], kw: 'up to 7 days' }] },
]
const SWITCH_ON = { key: 'enquiries_intake_enabled', value: true, updated_at: '2026-11-23T08:00:00.000Z' }
function baseSeed(extra = {}) {
  return {
    outreach_settings: [SWITCH_ON], reply_knowledge: KNOW, enquiries: [], enquiry_messages: [], enquiry_drafts: [], enquiry_spend: [],
    contact_messages: [
      { id: 'c-before', created_at: '2026-11-22T10:00:00.000Z', topic: 'question', name: 'Old Visitor', email: 'old@example.com', business_name: null, message: 'Sent before the switch was on.', country: 'GB', locale: 'en-GB' },
      { id: 'c-fr', created_at: '2026-11-23T09:15:00.000Z', topic: 'question', name: 'Marc Lenoir', email: 'Marc@Crepes-Example.fr', business_name: 'Crêpes du Coin', message: FR_TEXT, country: 'FR', locale: 'fr-FR' },
    ],
    trucks: [{ id: 'bao-bus-fixture', contact_email: 'sam@baobus.example', country: 'GB' }],
    ...extra,
  }
}
async function runOnce(db, model, mail = null, deps = {}) {
  return RUN.runEnquiries({
    store: memStore(db), mail, model, packInputs: async c => (c === 'FR' ? PACK_FR : c === 'GB' ? PACK_GB : { ...PACK_GB, country: c, plans: [], cardFeeOnline: null, faq: [] }),
    orderSubjects, now: () => new Date('2026-11-23T10:00:00.000Z'), deadline: Date.now() + 60_000, ...deps,
  })
}
/** A mail source over plain fixtures (the poll's real one is section 5). */
const fixtureMail = list => ({ async walk(handle, limit) { let examined = 0; for (const c of list.slice(0, limit)) { examined++; await handle(c) } return { examined, outreach: 0 } } })
const mailOf = (o) => ({ mailbox: 'hello/INBOX', uid: o.uid, messageId: o.id, headers: H(o), fromName: o.name || null, date: '2026-11-23T09:30:00.000Z', readText: async () => o.text })
;(async () => {
  // ── the French enquiry (the contact form), then its follow-up by email ───────────────────────────────────────────────
  const db = fakeDb(baseSeed())
  const model = standIn(SCRIPT)
  const s1 = await runOnce(db, model)
  const enq = db.T.get('enquiries')
  t('the switch on: the contact-form message saved after switch-on became an enquiry (source form, FR, fr-FR, email lower-cased); the one saved before did not',
    s1.formsLogged === 1 && enq.length === 1 && enq[0].source === 'form' && enq[0].country === 'FR' && enq[0].language === 'fr-FR' && enq[0].email === 'marc@crepes-example.fr' && enq[0].contact_message_id === 'c-fr' && enq[0].ref === 'ENQ-0001', { s1, enq })
  const d1 = db.T.get('enquiry_drafts')[0]
  const flags1 = d1 ? d1.flags.map(f => f.kind) : []
  t('French enquiry → needs_review', enq[0].status === 'needs_review', enq[0].status)
  t('…the deadline ask is a GAP, flagged, citing the approved gap line', !!d1 && d1.asks.find(a => /deadline/i.test(a.ask)).status === 'gap' && flags1.includes('ask_gap')
    && d1.asks.find(a => /deadline/i.test(a.ask)).knowledge_ids.length === 1, d1 && d1.asks)
  t('…the demo is answered with full access (available, from the approved demo line)', /full access to look around everything/.test(d1.english_draft) && d1.asks.find(a => /demo/i.test(a.ask)).status === 'available')
  t('…card fees stated separately: their own sentence, never in the sentence that says "free"; no card-fee flag',
    /Card fees on online card orders are Stripe's and are charged separately: currently 1,5% \+ 0,25 €/.test(d1.english_draft)
    && d1.english_draft.split(/(?<=[.!?])\s+|\n/).filter(x => /free/i.test(x)).every(x => !/card/i.test(x)) && !flags1.includes('card_fees_not_stated'), d1.english_draft)
  t('…numbers check pass (19 €, 3 months, 1,5% + 0,25 € are all in the pack)', d1.numbers_check === 'pass' && d1.numbers_details.checked >= 4, d1.numbers_details)
  t('…the till ask is UNKNOWN (the till line is only suggested, so it never reached the pack) and flagged', d1.asks.find(a => /till/i.test(a.ask)).status === 'unknown' && flags1.includes('ask_unknown'))
  t('…French customer draft and an English back-translation by a separate call; model and cost recorded',
    d1.customer_draft.startsWith('[fr] ') && d1.back_translation === d1.english_draft && d1.model === 'stand-in' && Math.abs(d1.cost_usd - 0.03) < 1e-9 && model.calls.join() === 'understand,draft,back', { calls: model.calls, cost: d1.cost_usd })
  t('…the message got its English text and language; the spend ledger has $0.03 for 2026-11',
    db.T.get('enquiry_messages')[0].english_text.startsWith('Hello, I run a mobile crêperie') && Number(db.T.get('enquiry_spend')[0].usd_spent) === 0.03 && db.T.get('enquiry_spend')[0].month === '2026-11')
  t('…canAutoSend is false for it', R.canAutoSend(d1) === false)

  // the follow-up: a reply to Dominic's answer to the form copy, about e-reporting
  const model2 = standIn(SCRIPT)
  const s2 = await runOnce(db, model2, fixtureMail([mailOf({ uid: 21, id: '<m21@crepes-example.fr>', from: 'marc@crepes-example.fr', name: 'Marc Lenoir', subject: 'RE: [HatchGrab contact] A question about HatchGrab — Marc Lenoir (France, French)', text: FR_FOLLOW, headers: { 'In-Reply-To': '<dominic-reply-1@hatchgrab.com>' } })]))
  const d2 = db.T.get('enquiry_drafts')[1]
  t('French follow-up → joins ENQ-0001 (a reply to the form copy), reopened, then drafted: needs_review with the FR e-reporting GAP flagged',
    s2.mailLogged === 1 && s2.joinedExisting === 1 && db.T.get('enquiries').length === 1 && db.T.get('enquiry_messages').length === 2
    && !!d2 && d2.asks[0].status === 'gap' && d2.flags.some(f => f.kind === 'ask_gap') && db.T.get('enquiries')[0].status === 'needs_review', { s2, d2: d2 && d2.asks })

  // a second email from the same sender, threaded by headers → the same enquiry
  const s3 = await runOnce(db, standIn(SCRIPT), fixtureMail([mailOf({ uid: 22, id: '<m22@crepes-example.fr>', from: 'marc@crepes-example.fr', subject: 'Re: Re: Question', text: 'Et pour e-reporting, merci de confirmer. Marc', headers: { 'In-Reply-To': '<m21@crepes-example.fr>', References: '<dominic-reply-1@hatchgrab.com> <m21@crepes-example.fr>' } })]))
  t('threading: a second message from the same sender (In-Reply-To his last one) joins the same enquiry', s3.joinedExisting === 1 && db.T.get('enquiries').length === 1 && db.T.get('enquiry_messages').length === 3, s3)
  const s4 = await runOnce(db, null, fixtureMail([mailOf({ uid: 22, id: '<m22@crepes-example.fr>', from: 'marc@crepes-example.fr', subject: 'Re: Re: Question', text: 'again', headers: {} })]))
  t('a re-poll of the same Message-ID stores nothing new (counted as a duplicate)', s4.skipped.duplicate === 1 && db.T.get('enquiry_messages').length === 3 && s4.draftingHeld === 'no_model', s4)

  // ── an English enquiry fully covered by approved lines ─────────────────────────────────────────────────────────────
  const dbEn = fakeDb(baseSeed({ contact_messages: [] }))
  const sEn = await runOnce(dbEn, standIn(SCRIPT), fixtureMail([mailOf({ uid: 30, id: '<s30@baobus.example>', from: 'sam@baobus.example', name: 'Sam Lee', subject: 'Demo?', text: EN_TEXT })]))
  const eEn = dbEn.T.get('enquiries')[0], dEn = dbEn.T.get('enquiry_drafts')[0]
  t('English enquiry fully covered → drafted, no flags, numbers pass, no back-translation call', sEn.drafted === 1 && eEn.status === 'drafted' && dEn.flags.length === 0 && dEn.numbers_check === 'pass' && dEn.back_translation === null && dEn.asks.every(a => a.status === 'available'), { sEn, flags: dEn && dEn.flags, asks: dEn && dEn.asks })
  t('…linked to the ONE truck with that contact address, with its country (GB)', eEn.truck_id === 'bao-bus-fixture' && eEn.country === 'GB' && eEn.source === 'email' && eEn.name === 'Sam Lee')
  t('…and canAutoSend is STILL false (no send path exists)', R.canAutoSend(dEn) === false)

  // ── an invented price ────────────────────────────────────────────────────────────────────────────────────────────
  const dbX = fakeDb(baseSeed({ contact_messages: [] }))
  await runOnce(dbX, standIn(SCRIPT, { invent: 'Unlimited is only 29 € a month this week.' }), fixtureMail([mailOf({ uid: 31, id: '<s31@baobus.example>', from: 'sam@baobus.example', subject: 'Demo?', text: EN_TEXT })]))
  const dX = dbX.T.get('enquiry_drafts')[0]
  t('an invented price in the stand-in draft → numbers check FAIL, flagged, needs_review', dX.numbers_check === 'fail' && dX.numbers_details.unknown.includes('29') && dX.flags.some(f => f.kind === 'numbers') && dbX.T.get('enquiries')[0].status === 'needs_review', dX.numbers_details)

  // ── "Note:" lines never reach a customer draft ──────────────────────────────────────────────────────────────────
  const dbN = fakeDb(baseSeed({ contact_messages: [] }))
  await runOnce(dbN, standIn(SCRIPT, { noteLine: 'Note: never promise dates' }), fixtureMail([mailOf({ uid: 32, id: '<s32@baobus.example>', from: 'sam@baobus.example', subject: 'Demo?', text: EN_TEXT })]))
  const dN = dbN.T.get('enquiry_drafts')[0]
  t('a "Note:" line in a draft is removed from both drafts and flagged', !/Note:/i.test(dN.english_draft + dN.customer_draft) && dN.flags.some(f => f.kind === 'note_lines_removed'))

  // ── the spend cap ─────────────────────────────────────────────────────────────────────────────────────────────────
  const dbC = fakeDb(baseSeed({ contact_messages: [], enquiry_spend: [{ month: '2026-11', usd_spent: 5 }] }))
  const mC = standIn(SCRIPT)
  const sC = await runOnce(dbC, mC, fixtureMail([mailOf({ uid: 33, id: '<s33@baobus.example>', from: 'sam@baobus.example', subject: 'Demo?', text: EN_TEXT })]))
  t('spend cap reached ($5 of $5 this month) → NO model call, the enquiry logged and left "new"', mC.calls.length === 0 && sC.draftingHeld === 'cap_reached' && dbC.T.get('enquiries')[0].status === 'new' && dbC.T.get('enquiry_drafts').length === 0, { calls: mC.calls, sC })
  const dbC2 = fakeDb(baseSeed({ contact_messages: [], enquiry_spend: [{ month: '2026-11', usd_spent: 4.995 }] }))
  const mC2 = standIn(SCRIPT)
  const sC2 = await runOnce(dbC2, mC2, fixtureMail([mailOf({ uid: 34, id: '<s34@baobus.example>', from: 'sam@baobus.example', subject: 'Demo?', text: EN_TEXT })]))
  t('the cap reached DURING a draft → the next call never starts; no draft, the first call\'s cost recorded', mC2.calls.join() === 'understand' && sC2.draftingHeld === 'cap_reached' && dbC2.T.get('enquiry_drafts').length === 0 && Math.abs(Number(dbC2.T.get('enquiry_spend')[0].usd_spent) - 5.005) < 1e-9, { calls: mC2.calls, sC2 })
  const dbP = fakeDb(baseSeed({ contact_messages: [] }))
  const mP = standIn(SCRIPT)
  const five = [35, 36, 37, 38, 39].map(u => mailOf({ uid: u, id: `<s${u}@x${u}.example>`, from: `p${u}@x${u}.example`, subject: 'Demo?', text: EN_TEXT }))
  const sP = await runOnce(dbP, mP, fixtureMail(five))
  t(`at most ${RUN.DRAFTS_PER_RUN} drafts per run: 5 enquiries → 3 drafted, 2 left "new"`, sP.mailLogged === 5 && dbP.T.get('enquiry_drafts').length === 3 && dbP.T.get('enquiries').filter(e => e.status === 'new').length === 2, sP)
  t('the cap is $5 a month, separate from the FAQ translator (its own ledger table enquiry_spend)', RUN.MONTHLY_CAP_USD === 5 && /from\('enquiry_spend'\)/.test(read('lib/enquiries/store.ts')) && !/faq/i.test(noComments(read('lib/enquiries/store.ts'))))
  const dbOff = fakeDb(baseSeed({ outreach_settings: [{ key: 'enquiries_intake_enabled', value: false, updated_at: '2026-11-23T08:00:00.000Z' }] }))
  const mOff = standIn(SCRIPT)
  const sOff = await runOnce(dbOff, mOff, fixtureMail([mailOf({ uid: 40, id: '<x@y.example>', from: 'a@b.example', subject: 'x', text: 'hello there' })]))
  t('switched off → null, no write, no model call', sOff === null && dbOff.writes.length === 0 && mOff.calls.length === 0)

  // ── the model adapter's validators (what a live call must return) ────────────────────────────────────────────────
  t('the live adapter validates each step\'s tool input (a bad status, a missing draft, a bad language are refused)',
    M.validateDrafted({ asks: [{ ask: 'a', topics: [], status: 'maybe', sources: [], note: '' }], english_draft: 'x', customer_draft: 'y' }).ok === false
    && M.validateDrafted({ asks: [], english_draft: '', customer_draft: 'y' }).ok === false && M.validateUnderstood({ language: 'French', english_text: 'x', asks: [], country_guess: '' }).ok === false
    && M.validateUnderstood({ language: 'fr', english_text: 'x', asks: [{ ask: 'a', topics: ['demo'] }], country_guess: 'fr' }).ok === true)
  t('the draft prompt carries Dominic\'s style and the card-fee rule', /friendly, short/.test(M.DRAFT_SYSTEM) && /never inside "free"/.test(M.DRAFT_SYSTEM) && /ONLY the ANSWER PACK/.test(M.DRAFT_SYSTEM))

  // ══ 4 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · learning')
  const ai = 'Hi Sam,\nThe menu demo shows only a small part of HatchGrab.\nDominic'
  const sent = 'Hi Sam,\nThe menu demo shows only a small part of HatchGrab.\nYou can also import your menu from a photo of the board.\nNote: always offer the photo import to market traders\nDominic'
  const sug = L.suggestFromEdit(ai, sent, { topics: ['demo'], ref: 'ENQ-0002', country: 'GB' })
  t('suggestFromEdit: what Dominic added → ONE suggested fact (source edit, ref, topics), the Note line not part of it',
    sug && sug.kind === 'fact' && sug.status === 'suggested' && sug.source === 'edit' && sug.source_ref === 'ENQ-0002' && sug.wording === 'You can also import your menu from a photo of the board.' && sug.topics.join() === 'demo', sug)
  t('suggestFromEdit: nothing added (or only a greeting) → null', L.suggestFromEdit(ai, ai.replace('Hi Sam', 'Hello Sam')) === null)
  const notes = L.suggestFromNotes(sent, { ref: 'ENQ-0002' })
  t('"Note:" lines → suggested GUIDANCE lines (never customer-safe, source note)', notes.length === 1 && notes[0].kind === 'guidance' && notes[0].customer_safe === false && notes[0].status === 'suggested' && notes[0].source === 'note' && notes[0].wording === 'always offer the photo import to market traders')
  t('…and are stripped from anything that could go to a customer', !/Note:/i.test(L.customerTextOf(sent)) && /photo of the board/.test(L.customerTextOf(sent)))
  t('nothing in learning approves: every line it makes is "suggested"', !/'approved'/.test(noComments(read('lib/enquiries/learning.ts'))))

  // ══ 5 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · 🔴 the reply poll end to end — HEAD vs this tree, fake read-only mailbox, fake database')
  await pollEndToEnd()

  // ══ 6 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · 🔴 the source census: no send path, no mailbox write')
  census()

  // ══ 7 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · 🔴 byte-identical to BASE where it must be; this work changed only its own files')
  identity()

  console.log(`\n${fail ? '🔴' : '✅'} enquiries-backend-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.log('🔴 CRASHED: ' + (e && e.stack || e)); process.exit(1) })

// ── 5 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function inboxFixture() {
  const m = (uid, o) => {
    const hdr = [`From: ${o.name ? `"${o.name}" ` : ''}<${o.from}>`, `To: ${(o.to || ['hello@hatchgrab.com']).join(', ')}`, `Subject: ${o.subject}`, `Message-ID: ${o.id}`, `Date: Mon, 23 Nov 2026 09:${String(uid).padStart(2, '0')}:00 +0000`]
    for (const [k, v] of Object.entries(o.headers || {})) hdr.push(`${k}: ${v}`)
    return {
      uid, internalDate: `2026-11-23T09:${String(uid).padStart(2, '0')}:00.000Z`, text: o.text,
      headers: hdr.join('\r\n') + '\r\n\r\n',
      envelope: { messageId: o.id, subject: o.subject, from: [{ address: o.from, name: o.name || '' }], to: (o.to || ['hello@hatchgrab.com']).map(a => ({ address: a })), cc: [], date: new Date(`2026-11-23T09:${String(uid).padStart(2, '0')}:00.000Z`) },
    }
  }
  return [
    m(1, { from: 'alice@bakery.example', name: 'Alice', subject: 'Re: A quick idea for Alice Bakery', id: '<r1@bakery.example>', text: 'Yes please, tell me more.', headers: { 'In-Reply-To': '<out-1@hatchgrab.com>' } }),
    m(2, { from: 'hello@hatchgrab.com', subject: '[HatchGrab contact] A question about HatchGrab — Marc Lenoir (France, French)', id: '<brevo-2@smtp-relay.example>', text: 'Topic: …' }),
    m(3, { from: 'MAILER-DAEMON@mx.example.net', subject: 'Undelivered Mail Returned to Sender', id: '<b3@mx.example.net>', text: 'delivery failed', headers: { 'Content-Type': 'multipart/report; report-type=delivery-status' } }),
    m(4, { from: 'no-reply@payments.example.com', subject: 'Your receipt', id: '<n4@payments.example.com>', text: 'receipt' }),
    m(5, { from: 'dominic@hatchgrab.com', subject: 'test', id: '<d5@hatchgrab.com>', text: 'test' }),
    m(6, { from: 'diner@example.fr', subject: 'RE: Votre commande #12 est prête — Chez Paul', id: '<o6@example.fr>', text: 'Je suis en retard, gardez-la svp' }),
    m(7, { from: 'diner2@example.fr', subject: 'Commande', to: ['donotreply@hatchgrab.com'], id: '<o7@example.fr>', text: 'Où est ma commande ?' }),
    m(8, { from: 'auto@example.de', subject: 'Abwesenheitsnotiz', id: '<a8@example.de>', text: 'Ich bin nicht da', headers: { 'Auto-Submitted': 'auto-replied' } }),
    m(9, { from: 'sam@baobus.example', name: 'Sam Lee', subject: 'Demo?', id: '<s9@baobus.example>', text: EN_TEXT }),
    m(10, { from: 'sam@baobus.example', name: 'Sam Lee', subject: 'Re: Demo?', id: '<s10@baobus.example>', text: 'Also — do you print kitchen tickets?', headers: { 'In-Reply-To': '<s9@baobus.example>' } }),
  ]
}
function pollSeed(switchRow) {
  return {
    outreach_settings: switchRow === undefined ? [] : [switchRow],
    outreach_prospects: [{ id: 'p-alice', discovery_trucks: { contact_email: 'alice@bakery.example', hatchgrab_truck_id: null } }],
    outreach_messages: [{ id: 'om-1', message_id: '<out-1@hatchgrab.com>', prospect_id: 'p-alice', partner_id: null, direction: 'outbound', status: 'sent', is_test: false, account: 'hello' }],
    partners: [], outreach_contacts: [],
    contact_messages: [{ id: 'c-fr', created_at: '2026-11-23T09:15:00.000Z', topic: 'question', name: 'Marc Lenoir', email: 'marc@crepes-example.fr', business_name: 'Crêpes du Coin', message: FR_TEXT, country: 'FR', locale: 'fr-FR' }],
    trucks: [{ id: 'bao-bus-fixture', contact_email: 'sam@baobus.example', country: 'GB' }],
    reply_knowledge: KNOW, enquiries: [], enquiry_messages: [], enquiry_drafts: [], enquiry_spend: [],
  }
}
const ENQ_TABLES = new Set(['enquiries', 'enquiry_messages', 'enquiry_drafts', 'enquiry_spend', 'reply_knowledge'])
async function pollEndToEnd() {
  const wt = headWorktree('enq-base', BASE)
  let base
  try {
    base = compile(wt.wt, ['lib/outreach-mail-poll.ts'], 'enq-base', TSC)
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(base.out, 'node_modules')) } catch { /* already */ }
    OUTS.push(base.out, fs.realpathSync(base.out))
  } finally { wt.remove() }
  const POLL_BASE = base.req('lib/outreach-mail-poll.js')
  const POLL_NOW = now.req('lib/outreach-mail-poll.js')
  process.env.OUTREACH_MAIL_USER = 'hello-fixture'; process.env.OUTREACH_MAIL_PASSWORD = 'not-a-password'
  const strip = s => JSON.parse(JSON.stringify(s))
  async function run(POLL, switchRow) {
    MAILBOX = { INBOX: inboxFixture(), Spam: [], Archive: [], Sent: [] }
    IMAP.calls = []; IMAP.writes = []; IMAP.locks = []; IMAP.logins = []
    const db = fakeDb(pollSeed(switchRow))
    const summary = strip(await POLL.runReplyPoll(db))
    return { summary, db, imap: { calls: [...IMAP.calls], writes: [...IMAP.writes], locks: [...IMAP.locks], logins: [...IMAP.logins] } }
  }
  const OFF = { key: 'enquiries_intake_enabled', value: false, updated_at: '2026-11-23T08:00:00.000Z' }
  const ON = { ...OFF, value: true }
  const A = await run(POLL_BASE, OFF)
  const B = await run(POLL_NOW, OFF)
  const C = await run(POLL_NOW, undefined)
  const A0 = await run(POLL_BASE, undefined)
  t(`BASE run sanity: the outreach reply logged (repliesLogged ${A.summary.repliesLogged}), the other mail unmatched (${A.summary.unmatched}), no error`, A.summary.repliesLogged === 1 && A.summary.unmatched >= 1 && A.summary.errors.length === 0, A.summary)
  t('🔴 switch OFF (false): the summary is IDENTICAL to BASE', JSON.stringify(B.summary) === JSON.stringify(A.summary), { base: A.summary, now: B.summary })
  t('🔴 switch OFF (false): every database write IDENTICAL to BASE, in order', JSON.stringify(B.db.writes) === JSON.stringify(A.db.writes), { base: A.db.writes.slice(0, 6), now: B.db.writes.slice(0, 6) })
  t('🔴 switch OFF (false): every IMAP call IDENTICAL to BASE (no second login, no extra fetch)', JSON.stringify(B.imap) === JSON.stringify(A.imap), { base: A.imap.calls, now: B.imap.calls })
  {
    const extra = B.db.reads.length - A.db.reads.length
    const only = B.db.reads.filter(r => r.table === 'outreach_settings' && JSON.stringify(r.filters) === JSON.stringify([['eq', 'key', 'enquiries_intake_enabled']]))
    t('switch OFF: the ONLY extra database read is the switch itself (one select of outreach_settings key enquiries_intake_enabled)', extra === 1 && only.length === 1, { extra, only })
  }
  t('🔴 switch ABSENT (no row — before the migration): summary, writes and IMAP identical to BASE',
    JSON.stringify(C.summary) === JSON.stringify(A0.summary) && JSON.stringify(C.db.writes) === JSON.stringify(A0.db.writes) && JSON.stringify(C.imap) === JSON.stringify(A0.imap))
  const D = await run(POLL_NOW, ON)
  const { enquiries: E, ...rest } = D.summary
  t('switch ON: the run reports the enquiry step, with no error', !!E && D.summary.errors.length === 0 && E.errors.length === 0, { errors: D.summary.errors, enquiryErrors: E && E.errors })
  if (!E) return
  t('switch ON: the outreach part of the summary is identical to BASE (the outreach reply still handled by outreach, as today)', JSON.stringify(rest) === JSON.stringify(A.summary), { base: A.summary, now: rest })
  {
    const outreachWrites = w => w.filter(x => !ENQ_TABLES.has(x.table) && !(x.table === 'outreach_settings' && JSON.stringify(x.payload || {}).includes('enquiries_intake_state')))
    t('switch ON: every outreach database write identical to BASE (the enquiry tables and the enquiry watermark aside)', JSON.stringify(outreachWrites(D.db.writes)) === JSON.stringify(A.db.writes),
      { base: A.db.writes.map(w => w.table + ':' + w.op), now: outreachWrites(D.db.writes).map(w => w.table + ':' + w.op) })
  }
  const em = D.db.T.get('enquiry_messages'), en = D.db.T.get('enquiries')
  t('switch ON: the enquiry step reports counts only (no address, no subject, no text in the summary)', !!E && !JSON.stringify(E).match(/@|Demo\?|crêperie|commande/i), E)
  t('switch ON: exactly THREE enquiry messages stored — the form message and Sam\'s two emails (the second joined his enquiry)',
    em.length === 3 && en.length === 2 && E.formsLogged === 1 && E.mailLogged === 2 && E.joinedExisting === 1 && em.filter(x => x.mailbox === 'hello/INBOX').map(x => x.uid).join() === '9,10', { E, em: em.map(x => [x.mailbox, x.uid]) })
  t('🔴 stored NOTHING for: the outreach reply (left to outreach), the Brevo copy, the bounce, the no-reply sender, Dominic\'s own mail, both diner order emails, the auto-reply',
    E.mailLeftToOutreach === 1 && E.skipped.contact_form_copy === 1 && E.skipped.bounce === 1 && E.skipped.noreply === 1 && E.skipped.own_address === 1 && E.skipped.order_mail === 2 && E.skipped.auto_reply === 1
    && !em.some(x => [1, 2, 3, 4, 5, 6, 7, 8].includes(x.uid)), E.skipped)
  t('…and no text of a skipped message is anywhere in the fake database', !JSON.stringify([...D.db.T.values()]).match(/gardez-la|Où est ma commande|Ich bin nicht da|delivery failed|"receipt"/))
  t('switch ON: no Claude API login here → drafting held ("no_model"), enquiries left "new" for later', E.draftingHeld === 'no_model' && en.every(e => e.status === 'new'))
  t('switch ON: the enquiry watermark is its own key (enquiries_intake_state), the outreach one unchanged',
    D.db.T.get('outreach_settings').some(r => r.key === 'enquiries_intake_state' && r.value.INBOX && r.value.INBOX.lastUid === 10)
    && JSON.stringify(D.db.T.get('outreach_settings').find(r => r.key === 'mail_poll_state').value) === JSON.stringify(A.db.T.get('outreach_settings').find(r => r.key === 'mail_poll_state').value))
  t('🔴 the mailbox stayed READ-ONLY in every run: every lock read-only (EXAMINE), no write method called', [A, B, C, D].every(r => r.imap.writes.length === 0 && r.imap.locks.every(l => l.readOnly)), D.imap)
  t('switch ON: one extra login for the enquiry walk (hello@ only), and body reads only for the two kept messages',
    D.imap.logins.length === A.imap.logins.length + 1 && D.imap.logins.every(u => u === 'hello-fixture')
    && D.imap.calls.filter(c => /^fetchOne (9|10) bodyParts/.test(c)).length >= 2 && !D.imap.calls.slice(A.imap.calls.length).some(c => /^fetchOne [2-8] bodyParts/.test(c)), D.imap.calls.slice(A.imap.calls.length))
  const D2 = await (async () => { const before = D.db; MAILBOX = { INBOX: inboxFixture(), Spam: [], Archive: [], Sent: [] }; const s = strip(await POLL_NOW.runReplyPoll(before)); return { s, db: before } })()
  t('switch ON, a second run (re-poll): nothing duplicated', D2.db.T.get('enquiry_messages').length === 3 && D2.db.T.get('enquiries').length === 2, D2.s.enquiries)
}

// ── 6 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function census() {
  const resolve = (from, spec) => {
    const base = spec.startsWith('@/') ? path.join(REPO, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(path.join(REPO, from)), spec) : null
    if (!base) return { pkg: spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/') }
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}.js`]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return { file: path.relative(REPO, c) }
    return { missing: spec }
  }
  const importsOf = f => {
    const src = noComments(read(f))
    return [...src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1] || m[2] || m[3] || m[4])
  }
  const reach = (entries) => {
    const seen = new Set(), pkgs = new Set(), q = [...entries]
    while (q.length) {
      const f = q.shift()
      if (seen.has(f) || !/\.(ts|tsx)$/.test(f)) continue
      seen.add(f)
      for (const spec of importsOf(f)) { const r = resolve(f, spec); if (r.file) q.push(r.file); else if (r.pkg) pkgs.add(r.pkg) }
    }
    return { files: seen, pkgs }
  }
  const ENQ = fs.readdirSync(path.join(REPO, 'lib/enquiries')).filter(f => f.endsWith('.ts')).map(f => `lib/enquiries/${f}`)
  const SEND_FILES = ['lib/outreach-mail-deliver.ts', 'lib/outreach-mail-box.ts', 'lib/outreach-mail-envelope.ts', 'lib/outreach-retry-rebuild.ts', 'lib/outreach-mail-send.ts', 'lib/partner-send.ts',
    'lib/contact-server.ts', 'lib/email.ts', 'lib/email-signup.ts', 'lib/demo-link-email.ts', 'lib/billing/mailer.ts', 'lib/paperwork/email.ts', 'lib/reviews/email.ts', 'lib/outreach-mail-poll.ts']
  const SEND_PKGS = ['nodemailer', 'imapflow', '@getbrevo/brevo', 'sib-api-v3-sdk', 'resend', '@sendgrid/mail', 'twilio']
  const { files, pkgs } = reach(ENQ)
  const badFiles = [...files].filter(f => SEND_FILES.includes(f))
  const badPkgs = [...pkgs].filter(p => SEND_PKGS.includes(p))
  t(`🔴 every module the enquiry code can reach (${files.size}, dynamic imports included) — none is a send path or the mailbox module (outreach-mail-deliver, appendToSent's module, contact-server's brevoSend, any mailer)`, badFiles.length === 0, badFiles)
  t('🔴 …and no mail package (nodemailer, imapflow, Brevo, …) is reachable from it', badPkgs.length === 0, badPkgs)
  const sendText = [...files].filter(f => /api\.brevo\.com|smtp\.|createTransport|appendToSent\(|sendMail\(/.test(noComments(read(f))))
  t('🔴 …and no reachable file holds a send call (api.brevo.com, createTransport, sendMail, appendToSent)', sendText.length === 0, sendText)
  const enqSrc = ENQ.map(f => noComments(read(f))).join('\n')
  t('the enquiry modules name no mailbox write (messageFlagsAdd/Remove/Set, messageMove, messageCopy, messageDelete, expunge, append) and no .env file',
    !/messageFlags(Add|Remove|Set)|messageMove|messageCopy|messageDelete|expunge|\.append\(|['"`/]\.env/.test(enqSrc))
  const poll = read('lib/outreach-mail-poll.ts')
  const section = noComments(poll.slice(poll.indexOf('// ── ENQUIRIES (enquiries-backend-1')))
  t('🔴 the poll\'s enquiry section calls no send or write: no deliver, fileSentCopy, composeRaw, prepareRetry, appendToSent, insertMessageOnce, logOutreachContact',
    section.length > 1000 && !/\b(deliver|fileSentCopy|composeRaw|prepareRetry|appendToSent|insertMessageOnce|logOutreachContact|claimRetry|claimAdoption)\b/.test(section))
  t('🔴 …it reads through withReadOnlyMailbox (EXAMINE), the same header fetch, and readBodies (BODY.PEEK) — nothing else touches the mailbox',
    /withReadOnlyMailbox\(client, ENQUIRY_MAILBOX/.test(section) && /client\.fetch\(query as never, \{ uid: true, envelope: true, headers: true, internalDate: true \}/.test(section)
    && /readBodies\(client, m\.uid\)/.test(section) && !/client\.(fetchOne|search|messageFlags|mailboxOpen|append)/.test(section))
  t('🔴 the whole poll file still has no mailbox write call (the existing census, re-run)', !/messageFlags(Add|Remove|Set)\(|messageMove\(|messageCopy\(|messageDelete\(|expunge\(/.test(noComments(poll)))
  t('the enquiry step is called LAST in runReplyPoll — after housekeeping, inside the lock', /catch \(err\) \{ fail\('housekeeping', err\) \}\n[^\n]*\n    await enquiriesAfterPoll\(supabase, accounts, dir, now, summary\)\n  \} catch \(err\) \{/.test(poll))
  t('no new Vercel cron: vercel.json unchanged and still one /api/cron/outreach-replies entry', git('show', `${BASE}:vercel.json`) === read('vercel.json') && (read('vercel.json').match(/\/api\/cron\/outreach-replies/g) || []).length === 1)
  t('the enquiry code reads no file and no secret but the Claude key the poll checks (process.env.ANTHROPIC_API_KEY, only when switched on)',
    !/readFileSync|process\.env/.test(enqSrc) && (section.match(/process\.env\.[A-Z_]+/g) || []).every(x => x === 'process.env.ANTHROPIC_API_KEY'))
}

// ── 7 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function identity() {
  const PROTECTED = [
    // ordering, checkout, payments, KDS, dashboard, Add order, heartbeat, auth, Manage, admin, the app (vercel-cost-1's list)
    'app/(app)', 'app/api/orders', 'app/api/menu', 'app/api/events', 'app/api/slots', 'app/api/dashboard', 'app/api/heartbeat', 'app/api/stripe', 'app/api/webhooks', 'app/api/payments',
    'app/api/auth', 'app/api/manage', 'app/api/admin', 'app/api/native', 'app/api/printing', 'app/api/account', 'app/api/cron', 'app/api/ping', 'app/api/signup', 'app/api/setup',
    'components', 'lib/orders', 'lib/payments', 'lib/auth', 'lib/native', 'lib/printing', 'lib/admin', 'lib/billing', 'lib/stripe.ts', 'lib/slot-availability.ts', 'lib/slot-bookings.ts', 'lib/slot-capacity.ts',
    'lib/menu-loader.ts', 'lib/order-calculations.ts', 'lib/order-charges.ts', 'lib/preorder.ts', 'proxy.ts', 'vercel.json', 'next.config.ts', 'android', 'ios', 'capacitor.config.ts',
    // the contact form (page, form, route, rules, server, its email) and every customer-facing page and word
    'app/contact', 'app/api/contact', 'lib/contact.ts', 'lib/contact-server.ts', 'app/(public)', 'messages', 'content', 'lib/i18n', 'public',
    // the four shared readers, and the plan-feature readers the brief means by "lib/plan-features.ts" (no file of that name exists)
    'lib/plans-server.ts', 'lib/country-settings.ts', 'lib/faq/public.ts', 'lib/features.ts', 'lib/feature-table.ts', 'lib/plan-offer.ts', 'lib/plans.ts', 'lib/country-settings-types.ts',
    // the outreach / partner matching and mail paths
    'lib/outreach-mail-poll-rules.ts', 'lib/partner-mail-poll.ts', 'lib/outreach-mail-box.ts', 'lib/outreach-mail-deliver.ts', 'lib/outreach-poll-claims.ts', 'lib/outreach-mail-accounts.ts',
    'lib/outreach-contact-log.ts', 'lib/outreach-mail-format.ts', 'lib/outreach-mail-bodies.ts', 'lib/email.ts', 'lib/email-config.ts', 'lib/competitor-check', 'lib/faq',
  ].filter(p => fs.existsSync(path.join(REPO, p)))
  const changed = git('diff', '--name-only', BASE, '--', ...PROTECTED).trim()
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...PROTECTED).trim()
  t(`🔴 ${PROTECTED.length} protected paths (ordering … admin, the contact form, every customer page and word, the four shared readers, outreach / partner matching): byte-identical to ${BASE}, committed and working tree, no new file`,
    changed === '' && untracked === '', { changed, untracked })
  t('the brief\'s "lib/plan-features.ts" does not exist (flagged in the report); the plan-feature readers it means are in the protected list', !fs.existsSync(path.join(REPO, 'lib/plan-features.ts')))
  {
    const poll = read('lib/outreach-mail-poll.ts'), was = git('show', `${BASE}:lib/outreach-mail-poll.ts`)
    const fn = s => s.slice(s.indexOf('async function pollOneAccount('), s.indexOf('// ── THE THREE INCOMING OUTCOMES'))
    t('🔴 the outreach walk itself (pollOneAccount: matching, classifying, the linked-truck and own-address rules) is byte-identical to BASE', fn(poll) === fn(was) && fn(was).length > 2000)
    const diff = git('diff', '--unified=0', BASE, '--', 'lib/outreach-mail-poll.ts').split('\n').filter(l => /^-[^-]/.test(l))
    t('lib/outreach-mail-poll.ts: the only lines REMOVED are the two header lines of the old "unmatched mail is not stored" rule (everything else is added)',
      diff.length === 2 && diff.every(l => /UNMATCHED MAIL IS NOT STORED, LOGGED OR NAMED\. `hello@hatchgrab\.com` receives order and support$|^-\/\/ mail; most of what this reads is nothing to do with outreach\. It is counted and forgotten\.$/.test(l)), diff)
    t('the header says exactly what changed: the rule reversed for real people\'s enquiries only (Dominic approved, 23 Nov), outreach / partner unchanged',
      /THIS REVERSES THE "UNMATCHED MAIL IS NOT STORED" RULE\n\/\/ FOR REAL PEOPLE'S ENQUIRIES ONLY/.test(poll) && /The outreach and partner behaviour above is unchanged/.test(poll) && /Dominic approved/.test(poll))
  }
  const MINE = new Set(['lib/outreach-mail-poll.ts', 'supabase/migrations/20261123_enquiries_backend_1.sql', 'scripts/enquiries-backend-1.cjs', 'scripts/harnesses.json',
    ...fs.readdirSync(path.join(REPO, 'lib/enquiries')).map(f => `lib/enquiries/${f}`)])
  const committed = git('diff', '--name-only', BASE, 'HEAD').split('\n').filter(Boolean)
  const working = git('diff', '--name-only', 'HEAD').split('\n').filter(Boolean).concat(git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean))
  const extra = [...new Set([...committed, ...working])].filter(f => !f.startsWith('docs/') && !MINE.has(f))
  t('this work changed only its own files (lib/enquiries/*, the poll, the migration, this harness, the sweep list) — docs/ aside', extra.length === 0, extra)
  {
    // The new files only (the poll and the sweep list are older files that this work only added to).
    const NEW = [...MINE].filter(f => f.startsWith('lib/enquiries/') || f.startsWith('supabase/migrations/20261123'))
    const harness = read('scripts/enquiries-backend-1.cjs').split('\n').filter(l => !/NAMED_NOWHERE/.test(l)).join('\n')
    const named = new RegExp(['gus', 'to|chur', 'rasco'].join(''), 'i')   // NAMED_NOWHERE
    t('Pizzeria Gusto and Le Roi du Churrasco: named in no new file of this work, and never in a test fixture', NEW.every(f => !named.test(read(f))) && !named.test(harness)) // NAMED_NOWHERE
    const pollAdded = git('diff', '--unified=0', BASE, '--', 'lib/outreach-mail-poll.ts').split('\n').filter(l => /^\+[^+]/.test(l)).join('\n')
    t('…nor in any line this work added to the poll', !named.test(pollAdded)) // NAMED_NOWHERE
  }
}
