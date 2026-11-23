#!/usr/bin/env node
// scripts/inbox-1.cjs — inbox-1 (23 November 2026, docs/inbox-1-report.md): ADMIN › INBOX — ONE PLACE FOR EVERY INCOMING EMAIL. Swept.
//   node scripts/inbox-1.cjs            (NO NETWORK, NO DATABASE, NO MAILBOX, NO MODEL, NO .env FILE: fixtures, a fake transport, a stand-in model)
//   node scripts/inbox-1.cjs --no-screens   (everything but the browser screenshots)
//
//   1 · the read model: enquiries, prospect replies, partner replies and customer mail, once each, with the right type, address, language
//       and waiting state (closed, snoozed, answered, a linked truck's outreach mail, a test reply: not waiting)
//   2 · Today: its "Replies waiting" count (the REAL Today route, compiled) equals the Inbox's prospect count; "Open in Inbox" links select
//       the right conversation; the reply buttons it replaces
//   3 · 🔴 From addresses: prospect / partner → their own routes (dominic@); an enquiry → hello@; 'enquiries_reply_from_alias' true → the
//       alias they wrote to; the Sent copy in hello@'s Sent; a sent reply leaves the waiting list (every type)
//   4 · the loop filter: mail from any of the 36 aliases is never taken in
//   5 · Update reply: an empty comment refuses; no model → "Drafting isn't switched on yet."; with the stand-in: rewritten, comment stored
//   6 · 🔴 hand-edited English is translated again before Send; no model → a non-English reply cannot be sent, an English one can
//   7 · 🔴 comments become SUGGESTED knowledge lines only after Send (source 'note', the ENQ ref); a hand edit a suggested fact
//   8 · retention: only enquiry conversations whose last message is older than 24 months are deleted
//   9 · the numbers check (decision 6): numbers in the customer's own message are allowed
//  10 · 🔴 outreach unchanged: the envelope composes an outreach row byte-identical to HEAD-before-inbox-1
//  11 · 🔴 the source census: the only send path is the Send button's route, behind admin auth; nothing scheduled; canAutoSend false
//  12 · 🔴 byte-identical protected paths (ordering … legal pages): no inbox-1 commit or working-tree file of this work touches one
//  13 · screenshots of /admin/inbox with fixture data at 1512×982 and 2560×1440 in WebKit AND Chromium, and 390px phones; the words
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
require('./_disk-guard.cjs').guard(__filename)
require('./_harness-tmp.cjs') // tmp-cleanup-1: temp goes under $TMPDIR/hatchgrab-harness/ and is removed on exit ("Disk space")
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const Module = require('module')
const { execFileSync } = require('child_process')
const { compile, headWorktree, REPO } = require('./_slot-interval-compile.cjs')

/** The commit inbox-1 was built on (HEAD when it started: france-vat-1's last commit). */
const BASE = '12e9a770'
const SCREENS = !process.argv.includes('--no-screens')
/** inbox-1's code commit: the "this work changed nothing else" checks are about it, not about later work in the same files. */
const INBOX1 = 'fbc98a34'
const OUT_DIR = path.join(REPO, 'docs/inbox-1')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// 🔴 No model, no mail login, no database login in this process — whatever the shell has.
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC_|OUTREACH_|SUPABASE_|BREVO_)/.test(k)) delete process.env[k]

// ── ids (uuid-shaped: the conversation keys are checked) ─────────────────────────────────────────────────────────────
const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ID = {
  pr1: U(101), pr2: U(102), d1: U(201), d2: U(202), org1: U(301), org2: U(302),
  e1: U(401), e2: U(402), e3: U(403), e4: U(404), e5: U(405), e6: U(406),
  m: n => U(500 + n), c2: U(601),
}

// ── the fake database (supabase-js's query surface: filters incl. not/is, one embed, unique keys) ───────────────────
let DB = null
function fakeDb(seed) {
  const T = new Map(Object.entries(JSON.parse(JSON.stringify(seed))))
  const writes = []
  let seq = 0
  const UNIQUE = {
    outreach_settings: [['key']], outreach_messages: [['message_id']], enquiries: [['contact_message_id'], ['ref']],
    enquiry_messages: [['mailbox', 'mail_message_id'], ['idempotency_key']], enquiry_spend: [['month']], inbox_drafts: [['conversation_key', 'source_message_id']],
  }
  const rowsOf = t => { if (!T.has(t)) T.set(t, []); return T.get(t) }
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
  const matches = (r, filters) => filters.every(([op, c, v, w]) => op === 'not' ? !ok(v, r[c], w) : ok(op, r[c], v))
  const conflict = (table, row, rows) => {
    for (const key of UNIQUE[table] || []) {
      if (key.some(c => row[c] == null)) continue
      if (rows.find(r => r !== row && key.every(c => String(r[c]) === String(row[c])))) return true
    }
    return false
  }
  const withDefaults = (table, r) => {
    const now = new Date().toISOString()
    const out = { id: r.id || U(9000 + ++seq), ...r }
    if (['enquiry_messages', 'enquiry_drafts', 'inbox_drafts', 'inbox_comments', 'inbox_sent', 'reply_knowledge', 'enquiries'].includes(table)) out.created_at = out.created_at || now
    if (table === 'enquiry_messages') { out.received_at = out.received_at || now; out.send_status = out.send_status ?? null }
    if (table === 'enquiries') { out.status = out.status || 'new'; out.updated_at = out.updated_at || out.created_at }
    return out
  }
  function embed(q, list) {
    const m = /(\w+)\(([^)]*)\)/.exec(q.cols || '')
    if (!m) return list
    const [, rel] = m
    return list.map(r => {
      const fk = { discovery_trucks: 'discovery_truck_id', enquiries: 'enquiry_id' }[rel] || `${rel.replace(/s$/, '')}_id`
      const hit = rowsOf(rel).find(x => String(x.id) === String(r[fk]))
      return { ...r, [rel]: hit ? { ...hit } : null }
    })
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
      let list = rows.filter(r => matches(r, q.filters))
      if (q.order) list = [...list].sort((a, b) => (String(a[q.order[0]] ?? '') < String(b[q.order[0]] ?? '') ? -1 : String(a[q.order[0]] ?? '') > String(b[q.order[0]] ?? '') ? 1 : 0) * (q.order[1] ? 1 : -1))
      if (q.limit != null) list = list.slice(0, q.limit)
      return finish(embed(q, list.map(r => ({ ...r }))))
    }
    if (q.op === 'insert') {
      const items = (Array.isArray(q.payload) ? q.payload : [q.payload]).map(r => withDefaults(q.table, r))
      for (const r of items) if (conflict(q.table, r, [...rows, ...items.filter(x => x !== r)])) return finish(null, { code: '23505', message: 'duplicate key value violates unique constraint' })
      rows.push(...items); writes.push({ op: 'insert', table: q.table, payload: q.payload })
      if (q.table === 'enquiry_messages') for (const r of items) { const e = rowsOf('enquiries').find(x => x.id === r.enquiry_id); if (e && (!e.last_message_at || e.last_message_at < r.received_at)) e.last_message_at = r.received_at }   // the trigger
      return finish(q.returning ? items : [])
    }
    if (q.op === 'upsert') {
      const on = (q.opts.onConflict || 'id').split(',').map(s => s.trim())
      const back = []
      for (const r of (Array.isArray(q.payload) ? q.payload : [q.payload])) {
        const ex = rows.find(x => on.every(c => String(x[c]) === String(r[c])))
        if (ex) { Object.assign(ex, r); back.push(ex) } else { const n = withDefaults(q.table, r); rows.push(n); back.push(n) }
      }
      writes.push({ op: 'upsert', table: q.table, payload: q.payload })
      return finish(q.returning ? back : [])
    }
    if (q.op === 'update') {
      const list = rows.filter(r => matches(r, q.filters))
      for (const r of list) Object.assign(r, q.payload)
      writes.push({ op: 'update', table: q.table, payload: q.payload, n: list.length })
      return finish(q.returning ? list : [])
    }
    if (q.op === 'delete') {
      const list = rows.filter(r => matches(r, q.filters))
      T.set(q.table, rows.filter(r => !list.includes(r)))
      writes.push({ op: 'delete', table: q.table, n: list.length })
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
  return { from, T, writes, rpc: async () => ({ data: 0, error: null }), storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'no storage in this harness' } }) }) } }
}

// ── module stand-ins: Supabase (the fake above), admin auth, the mail transport and mailbox (fakes that record) ───────
const SENT = []          // every SMTP send any code tried (there must be none outside the fake transport hand-ins)
const IMAP_WRITES = []
{
  const stub = path.join(os.tmpdir(), `inbox1-server-only-${process.pid}.js`)
  fs.writeFileSync(stub, 'module.exports = {}\n')
  const OUTS = []
  global.__INBOX_OUTS = OUTS
  const real = Module._resolveFilename
  Module._resolveFilename = function (r, parent, ...rest) {
    if (r === 'server-only') return stub
    if (r.startsWith('@/messages/')) return real.call(this, path.join(REPO, r.slice(2)), parent, ...rest)
    const tree = r.startsWith('@/') && parent && parent.filename ? OUTS.find(o => parent.filename.startsWith(o + path.sep)) : null
    if (tree) return real.call(this, path.join(tree, r.slice(2)), parent, ...rest)
    return real.call(this, r, parent, ...rest)
  }
  const realLoad = Module._load
  Module._load = function (r, ...rest) {
    if (r === '@supabase/supabase-js') return new Proxy({}, { get: () => () => new Proxy({}, { get: (_, k) => (DB ? DB[k] : () => { throw new Error('no database') }) }) })
    if (/lib[\\/]auth[\\/]admin(\.js)?$/.test(r) || r === '@/lib/auth/admin') return { verifyAdmin: async () => global.__ADMIN !== false, adminUser: async () => (global.__ADMIN !== false ? { id: 'admin', email: null } : null) }
    if (r === 'nodemailer') {
      // 🔴 ONLY the stream transport (composeRaw: builds the bytes in memory, no socket) is real; any other transport records and refuses.
      const real = realLoad.call(this, r, ...rest)
      const createTransport = o => (o && o.streamTransport ? real.createTransport(o) : { sendMail: async m => { SENT.push(m); throw new Error('the harness refuses a real send') }, close() {} })
      return { ...real, createTransport, default: { ...real, createTransport } }
    }
    if (r === 'imapflow') return { ImapFlow: function () { return new Proxy({}, { get: (_, k) => async () => { IMAP_WRITES.push(String(k)); throw new Error('no mailbox in this harness') } }) } }
    return realLoad.call(this, r, ...rest)
  }
}

// ══ compile ══════════════════════════════════════════════════════════════════════════════════════════════════════════
const TSC = { resolveJsonModule: true, strict: true, target: 'es2022', lib: ['es2022', 'dom', 'dom.iterable'] }
const FILES = ['lib/inbox/read-model.ts', 'lib/inbox/drafting.ts', 'lib/inbox/send.ts', 'lib/inbox/open.ts', 'lib/inbox/aliases.ts', 'lib/inbox/language.ts', 'lib/inbox/types.ts',
  'lib/order-retention.ts', 'lib/enquiries/run.ts', 'lib/enquiries/rules.ts', 'lib/outreach-mail-envelope.ts', 'app/api/admin/outreach/today/route.ts', 'app/api/admin/inbox/route.ts', 'app/(app)/admin/inbox/page.tsx']
const now = compile(REPO, FILES, 'inbox1-now', TSC)
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(now.out, 'node_modules')) } catch { /* already */ }
global.__INBOX_OUTS.push(now.out, fs.realpathSync(now.out))
const RM = now.req('lib/inbox/read-model.js')
const DR = now.req('lib/inbox/drafting.js')
const SD = now.req('lib/inbox/send.js')
const OPEN = now.req('lib/inbox/open.js')
const AL = now.req('lib/inbox/aliases.js')
const LANG = now.req('lib/inbox/language.js')
const TY = now.req('lib/inbox/types.js')
const RET = now.req('lib/order-retention.js')
const RUN = now.req('lib/enquiries/run.js')
const RULES = now.req('lib/enquiries/rules.js')
const ENV = now.req('lib/outreach-mail-envelope.js')
const TODAY = now.req('app/api/admin/outreach/today/route.js')
const ROUTE = now.req('app/api/admin/inbox/route.js')
const { NextRequest } = require(require.resolve('next/server', { paths: [REPO] }))

// ══ fixtures ═════════════════════════════════════════════════════════════════════════════════════════════════════════
const MIGRATION = read('supabase/migrations/20261123_inbox_1.sql')
const ALIASES = JSON.parse(/\('mail_aliases', '(\[[^']*\])'::jsonb\)/.exec(MIGRATION)[1])
const BRIEF_ALIASES = 'admin ahoj annyeong billing bok bonjour buna ciao czesc hallo halo hei hej hola jambo konnichiwa kumusta labas marhaba merhaba namaste nihao ola privacy privet sawasdee shalom support sveiki szia tere tester xinchao yassou zdravei zdravo'.split(' ')
const days = n => new Date(Date.now() - n * 86400000).toISOString()
const FR_TEXT = 'Bonjour Dominic,\nNous avons un food truck à Lyon. Combien coûte le plan Pro par mois ? Nous ouvrons de 11h30 à 14h, 5 jours par semaine.\nMerci, Claire'
const FR_EN = 'Hello Dominic,\nWe have a food truck in Lyon. How much is the Pro plan a month? We open from 11:30 to 14:00, 5 days a week.\nThanks, Claire'
function seed() {
  return {
    outreach_settings: [
      { key: 'mail_aliases', value: ALIASES, updated_at: days(0) }, { key: 'enquiries_reply_from_alias', value: false, updated_at: days(0) },
      { key: 'enquiries_intake_enabled', value: false, updated_at: days(0) }, { key: 'from_name', value: { name: '' } },
    ],
    outreach_prospects: [
      { id: ID.pr1, contact_name: 'Marie Dupont', contact_first_name: 'Marie', platform: 'Square', discovery_truck_id: ID.d1 },
      { id: ID.pr2, contact_name: null, contact_first_name: null, platform: null, discovery_truck_id: ID.d2 },
    ],
    discovery_trucks: [
      { id: ID.d1, name: 'Crêpes de Marie', country: 'FR', contact_email: 'marie@crepes.example', hatchgrab_truck_id: null },
      { id: ID.d2, name: 'Linked Tacos', country: 'GB', contact_email: 'owner@tacos.example', hatchgrab_truck_id: 'linked-tacos' },
    ],
    outreach_messages: [
      { id: ID.m(1), prospect_id: ID.pr1, partner_id: null, direction: 'outbound', status: 'sent', is_test: false, message_id: '<o1@hatchgrab.com>', subject: 'Votre food truck', from_address: 'dominic@hatchgrab.com', to_address: 'marie@crepes.example', message_date: days(5), text_body: 'Bonjour Marie, …', html_body: '<div>Bonjour Marie</div>', handled_at: null, snoozed_until: null },
      { id: ID.m(2), prospect_id: ID.pr1, partner_id: null, direction: 'inbound', status: 'received', is_test: false, message_id: '<r1@crepes.example>', references: '<o1@hatchgrab.com>', subject: 'Re: Votre food truck', from_address: 'marie@crepes.example', to_address: 'dominic@hatchgrab.com', message_date: days(2), text_body: 'Bonjour, ça nous intéresse. Est-ce que la tablette marche sans internet ? Merci, Marie', html_body: '<div>Bonjour, ça nous intéresse.</div>', handled_at: null, snoozed_until: null },
      // a linked HatchGrab truck's mail through outreach: a customer, NOT a prospect reply (Today leaves it out; so does the Inbox's prospect list)
      { id: ID.m(3), prospect_id: ID.pr2, partner_id: null, direction: 'inbound', status: 'received', is_test: false, message_id: '<r2@tacos.example>', subject: 'Re: hi', from_address: 'owner@tacos.example', to_address: 'dominic@hatchgrab.com', message_date: days(1), text_body: 'Printer question', handled_at: null, snoozed_until: null },
      // a reply to a TEST send: never waiting
      { id: ID.m(4), prospect_id: ID.pr1, partner_id: null, direction: 'inbound', status: 'received', is_test: true, message_id: '<t1@x.example>', subject: 'Re: test', from_address: 'me@x.example', to_address: 'dominic@hatchgrab.com', message_date: days(1), text_body: 'test', handled_at: null, snoozed_until: null },
      // partner 1: we wrote, they answered (waiting)
      { id: ID.m(5), prospect_id: null, partner_id: ID.org1, direction: 'outbound', status: 'sent', is_test: false, message_id: '<o2@hatchgrab.com>', subject: 'Partnership', from_address: 'dominic@hatchgrab.com', to_address: 'sam@guild.example', message_date: days(4), text_body: 'Hi Sam', html_body: '<div>Hi Sam</div>', handled_at: null, snoozed_until: null },
      { id: ID.m(6), prospect_id: null, partner_id: ID.org1, direction: 'inbound', status: 'received', is_test: false, message_id: '<r3@guild.example>', references: '<o2@hatchgrab.com>', subject: 'Re: Partnership', from_address: 'sam@guild.example', to_address: 'dominic@hatchgrab.com', message_date: new Date(Date.now() - 3600000).toISOString(), text_body: 'Hi Dominic,\nHappy to share it with our 40 members. What would they get?\nSam', html_body: '<div>Hi Dominic</div>', handled_at: null, snoozed_until: null },
      // partner 2: they wrote, we answered after (not waiting)
      { id: ID.m(7), prospect_id: null, partner_id: ID.org2, direction: 'inbound', status: 'received', is_test: false, message_id: '<r4@fair.example>', subject: 'Stand', from_address: 'info@fair.example', to_address: 'dominic@hatchgrab.com', message_date: days(6), text_body: 'Do you have a stand?', handled_at: null, snoozed_until: null },
      { id: ID.m(8), prospect_id: null, partner_id: ID.org2, direction: 'outbound', status: 'sent', is_test: false, message_id: '<o3@hatchgrab.com>', subject: 'Re: Stand', from_address: 'dominic@hatchgrab.com', to_address: 'info@fair.example', message_date: days(5), text_body: 'Not this year', handled_at: null, snoozed_until: null },
    ],
    partner_orgs: [
      { id: ID.org1, name: 'Street Food Guild', contact_name: 'Sam Lee', email: 'sam@guild.example', language: 'en', country_code: 'GB' },
      { id: ID.org2, name: 'Fair Org', contact_name: null, email: 'info@fair.example', language: 'en', country_code: 'GB' },
    ],
    enquiries: [
      { id: ID.e1, ref: 'ENQ-0001', source: 'email', name: 'Claire Martin', email: 'claire@lyon.example', country: 'FR', language: 'fr', truck_id: null, contact_message_id: null, status: 'drafted', created_at: days(3), updated_at: days(3), snoozed_until: null, last_message_at: days(3) },
      { id: ID.e2, ref: 'ENQ-0002', source: 'form', name: 'Tom Baker', email: 'tom@bigbao.example', country: 'GB', language: 'en-GB', truck_id: null, contact_message_id: ID.c2, status: 'new', created_at: new Date(Date.now() - 7200000).toISOString(), updated_at: days(0), snoozed_until: null, last_message_at: new Date(Date.now() - 7200000).toISOString() },
      { id: ID.e3, ref: 'ENQ-0003', source: 'email', name: 'Linked Tacos owner', email: 'owner@tacos.example', country: 'GB', language: 'en', truck_id: 'linked-tacos', contact_message_id: null, status: 'new', created_at: days(1), updated_at: days(1), snoozed_until: null, last_message_at: days(1) },
      { id: ID.e4, ref: 'ENQ-0004', source: 'email', name: 'Closed', email: 'closed@x.example', country: 'GB', language: 'en', truck_id: null, contact_message_id: null, status: 'closed', created_at: days(9), updated_at: days(9), snoozed_until: null, last_message_at: days(9) },
      { id: ID.e5, ref: 'ENQ-0005', source: 'email', name: 'Snoozed', email: 'later@x.example', country: 'GB', language: 'en', truck_id: null, contact_message_id: null, status: 'new', created_at: days(8), updated_at: days(8), snoozed_until: '2099-01-01T08:00:00Z', last_message_at: days(8) },
      { id: ID.e6, ref: 'ENQ-0006', source: 'email', name: 'Answered', email: 'done@x.example', country: 'GB', language: 'en', truck_id: null, contact_message_id: null, status: 'answered', created_at: days(7), updated_at: days(6), snoozed_until: null, last_message_at: days(6) },
    ],
    enquiry_messages: [
      { id: ID.m(11), enquiry_id: ID.e1, direction: 'in', original_text: FR_TEXT, original_language: 'fr', english_text: FR_EN, subject: 'Question sur HatchGrab', mail_message_id: '<q1@lyon.example>', in_reply_to: null, references: null, mailbox: 'hello/INBOX', uid: 11, received_at: days(3), to_address: 'bonjour@hatchgrab.com', send_status: null },
      { id: ID.m(12), enquiry_id: ID.e2, direction: 'in', original_text: 'Hi, can I take pre-orders for Saturday markets? We do about 200 bao a day.', original_language: 'en-GB', english_text: null, subject: null, mail_message_id: null, in_reply_to: null, references: null, mailbox: null, uid: null, received_at: new Date(Date.now() - 7200000).toISOString(), to_address: null, send_status: null },
      { id: ID.m(13), enquiry_id: ID.e3, direction: 'in', original_text: 'Hello, my receipt printer stopped printing last night. Can you help?', original_language: 'en', english_text: null, subject: 'Printer', mail_message_id: '<q3@tacos.example>', in_reply_to: null, references: null, mailbox: 'hello/INBOX', uid: 13, received_at: days(1), to_address: 'support@hatchgrab.com', send_status: null },
      { id: ID.m(14), enquiry_id: ID.e4, direction: 'in', original_text: 'Thanks!', original_language: 'en', subject: 'Thanks', mail_message_id: '<q4@x.example>', mailbox: 'hello/INBOX', uid: 14, received_at: days(9), to_address: 'hello@hatchgrab.com', send_status: null },
      { id: ID.m(15), enquiry_id: ID.e5, direction: 'in', original_text: 'Ask me in January', original_language: 'en', subject: 'Later', mail_message_id: '<q5@x.example>', mailbox: 'hello/INBOX', uid: 15, received_at: days(8), to_address: 'hello@hatchgrab.com', send_status: null },
      { id: ID.m(16), enquiry_id: ID.e6, direction: 'in', original_text: 'What does it cost?', original_language: 'en', subject: 'Cost', mail_message_id: '<q6@x.example>', mailbox: 'hello/INBOX', uid: 16, received_at: days(7), to_address: 'hello@hatchgrab.com', send_status: null },
      { id: ID.m(17), enquiry_id: ID.e6, direction: 'out', original_text: 'Hi, here are the prices…', original_language: 'en', english_text: 'Hi, here are the prices…', subject: 'Re: Cost', mail_message_id: '<a6@hatchgrab.com>', mailbox: 'hello/Sent', uid: null, received_at: days(6), to_address: 'done@x.example', from_address: 'hello@hatchgrab.com', send_status: 'sent' },
    ],
    enquiry_drafts: [
      { id: U(701), enquiry_id: ID.e1, message_id: ID.m(11), english_draft: 'Hi Claire,\nThanks for your message. The Pro plan is €19 a month. Card fees on online card orders (1.5% + €0.25) are separate.\nDominic', customer_draft: 'Bonjour Claire,\nMerci pour votre message. Le plan Pro coûte 19 € par mois. Les frais de carte des commandes en ligne (1,5 % + 0,25 €) sont à part.\nDominic', asks: [{ ask: 'price of Pro', topics: ['prices'] }], flags: [], numbers_check: 'pass', model: 'stand-in', cost_usd: 0, created_at: days(3) },
    ],
    contact_messages: [{ id: ID.c2, business_name: 'Big Bao', created_at: days(0) }],
    trucks: [{ id: 'linked-tacos', name: 'Linked Tacos', contact_email: 'owner@tacos.example', country: 'GB' }],
    reply_knowledge: [
      { id: U(801), kind: 'fact', topics: ['e-reporting', 'accounting'], wording: 'E-reporting (France): HatchGrab will provide the sales records they need to send to their approved e-reporting platform.', customer_safe: true, countries: ['FR'], status: 'approved', source: 'dominic', source_ref: '23 Nov 2026' },
      { id: U(802), kind: 'guidance', topics: ['payments'], wording: 'Never mention Pay at Hatch (trial only).', customer_safe: false, countries: [], status: 'approved', source: 'dominic', source_ref: '23 Nov 2026' },
    ],
    enquiry_spend: [],
    inbox_drafts: [], inbox_comments: [], inbox_sent: [], competitor_check_settings: [],
  }
}
const PACK = { country: 'FR', countryName: 'France', language: 'fr-FR', plans: [{ name: 'Pro', monthly: '€19', includedOnline: '€1,000', feePercent: '0.99%' }], trial: { months: 3, planName: 'Pro' }, cardFeeOnline: '1.5% + €0.25', features: [{ name: 'Pre-orders', comingSoon: false, plans: ['Pro'] }], faq: [] }

/** The stand-in model: no network, every call recorded. */
function standIn() {
  const calls = []
  const usd = 0.01
  return {
    calls, model: 'stand-in',
    understand: async req => { calls.push(['understand', req]); const fr = /bonjour|merci|ça|nous/i.test(req.text); return { value: { language: fr ? 'fr' : 'en', english_text: fr ? (req.text === FR_TEXT ? FR_EN : `[en] ${req.text}`) : req.text, asks: [{ ask: 'the question', topics: ['prices'] }], country_guess: '' }, usd } },
    draft: async req => { calls.push(['draft', req]); const en = `Hi,\nThanks for writing. The Pro plan is €19 a month.\nDominic`; return { value: { asks: [{ ask: 'the question', topics: ['prices'], status: 'available', sources: ['plans'], note: '' }], english_draft: en, customer_draft: req.customerLanguage.startsWith('en') ? en : `[${req.customerLanguage}] ${en}` }, usd } },
    backTranslate: async req => { calls.push(['back', req]); return { value: { english: req.text.replace(/^\[\w+(-\w+)?\] /, '') }, usd } },
    revise: async req => { calls.push(['revise', req]); const en = `${req.english}\nP.S. ${req.comment}`; return { value: { english_draft: en, customer_draft: req.customerLanguage.startsWith('en') ? en : `[${req.customerLanguage}] ${en}` }, usd } },
    translate: async req => { calls.push(['translate', req]); return { value: { text: `[${req.toLanguage}] ${req.text}` }, usd } },
  }
}

const adminReq = (url, init) => new NextRequest(new URL(url, 'http://localhost'), init)
/** The REAL Today route's "Replies waiting", against the current fake database. */
async function todayWaiting() {
  const r = await TODAY.GET(adminReq('/api/admin/outreach/today'))
  const j = await r.json()
  return j.migrationApplied ? j.waiting : []
}

;(async () => {
  try {
    await main()
  } catch (e) { fail++; console.log('🔴 harness crashed: ' + (e && e.stack || e)) }
  console.log(`\n${fail ? '🔴' : '✅'} inbox-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()

async function main() {
  // ── 1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('1 · the read model: every type once, the right type, address, language and waiting state')
  DB = fakeDb(seed())
  const inbox = await RM.loadInbox(DB, new Date(), todayWaiting)
  const byKey = Object.fromEntries(inbox.conversations.map(c => [c.key, c]))
  const K = { pr1: `prospect:${ID.pr1}`, org1: `partner:${ID.org1}`, e1: `enquiry:${ID.e1}`, e2: `enquiry:${ID.e2}`, e3: `enquiry:${ID.e3}` }
  t('exactly five conversations: the prospect reply, the partner reply, two enquiries and the customer — each once', inbox.conversations.length === 5 && Object.values(K).every(k => byKey[k]) && new Set(inbox.conversations.map(c => c.key)).size === 5, inbox.conversations.map(c => c.key))
  t('types: Prospect, Partner, Enquiry, Enquiry, Customer (mail from a linked HatchGrab truck = Customer)',
    byKey[K.pr1]?.type === 'prospect' && byKey[K.org1]?.type === 'partner' && byKey[K.e1]?.type === 'enquiry' && byKey[K.e2]?.type === 'enquiry' && byKey[K.e3]?.type === 'customer')
  t('the address each wrote to: dominic@ (prospect, partner), bonjour@ (enquiry), the contact form (no address), support@ (customer)',
    byKey[K.pr1].wroteTo === 'dominic@hatchgrab.com' && byKey[K.org1].wroteTo === 'dominic@hatchgrab.com' && byKey[K.e1].wroteTo === 'bonjour@hatchgrab.com' && byKey[K.e2].wroteTo === null && byKey[K.e2].viaForm === true && byKey[K.e3].wroteTo === 'support@hatchgrab.com',
    inbox.conversations.map(c => [c.key, c.wroteTo, c.viaForm]))
  t('names with the organisation where known: Marie Dupont (Crêpes de Marie), Sam Lee (Street Food Guild), Tom Baker (Big Bao), the customer (Linked Tacos)',
    byKey[K.pr1].name === 'Marie Dupont' && byKey[K.pr1].organisation === 'Crêpes de Marie' && byKey[K.org1].organisation === 'Street Food Guild' && byKey[K.e2].organisation === 'Big Bao' && byKey[K.e3].organisation === 'Linked Tacos')
  t('languages: the French enquiry fr (stored), the French prospect fr (detected without a model), the partner en', byKey[K.e1].language === 'fr' && byKey[K.pr1].language === 'fr' && byKey[K.org1].language === 'en', inbox.conversations.map(c => [c.key, c.language]))
  t('not waiting, so not listed: a closed enquiry (Mark done), a snoozed one, an answered one, a linked truck\'s outreach reply, a reply to a test send, an answered partner',
    !inbox.conversations.some(c => [ID.e4, ID.e5, ID.e6, ID.pr2, ID.org2].some(id => c.key.endsWith(id))))
  t('the counts are EMAILS waiting per type, and All is their sum', inbox.counts.all === 5 && inbox.counts.prospects === 1 && inbox.counts.partners === 1 && inbox.counts.enquiries === 2 && inbox.counts.customers === 1, inbox.counts)
  t('oldest unanswered first (as Today)', inbox.conversations.map(c => c.waitingSince).every((w, i, a) => i === 0 || String(a[i - 1]) <= String(w)))
  t('the preview is one line of their latest email', byKey[K.org1].preview.startsWith('Hi Dominic, Happy to share') && !/\n/.test(byKey[K.org1].preview))

  {
    // the route itself (compiled, verifyAdmin stood in): 404 for anyone else; the list through the real Today GET
    global.__ADMIN = false
    const denied = await ROUTE.GET(adminReq('/api/admin/inbox?view=list'))
    const deniedPost = await ROUTE.POST(adminReq('/api/admin/inbox', { method: 'POST', body: JSON.stringify({ action: 'send', key: K.e1, english: 'Hi' }) }))
    global.__ADMIN = true
    t('🔴 the Inbox route answers 404 to anyone not an admin — GET and POST (a Send included)', denied.status === 404 && deniedPost.status === 404)
    const viaRoute = await (await ROUTE.GET(adminReq('/api/admin/inbox?view=list'))).json()
    const count = await (await ROUTE.GET(adminReq('/api/admin/inbox?view=count'))).json()
    t('the route\'s list is the read model\'s (five conversations, the Prospects count from the Today route called in-process); ?view=count says 5', viaRoute.ok === true && viaRoute.conversations.length === 5 && viaRoute.counts.prospects === 1 && viaRoute.drafting === false && count.waiting === 5, { ok: viaRoute.ok, refusal: viaRoute.refusal, n: viaRoute.conversations && viaRoute.conversations.length, count })
  }
  const th = await RM.loadThread(DB, new Date(), K.e1, todayWaiting)
  t('a thread: the French enquiry in English (translated), the poll\'s draft, from hello@ (the alias setting is false)', th.thread.translated === true && th.thread.theirEnglish === FR_EN && th.thread.draft && /€19/.test(th.thread.draft.english) && th.thread.from === 'hello@hatchgrab.com', { translated: th.thread.translated, from: th.thread.from })
  const thp = await RM.loadThread(DB, new Date(), K.pr1, todayWaiting)
  t('a prospect thread: both directions, newest last, the latest incoming email is the one answered; from dominic@', thp.thread.messages.map(m => m.direction).join(',') === 'out,in' && thp.thread.latest.id === ID.m(2) && thp.thread.from === 'dominic@hatchgrab.com')

  // ── 2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('2 · Today: the same count, and "Open in Inbox" selects the right conversation')
  const today = await todayWaiting()
  t('🔴 Today\'s "Replies waiting" (the real route) counts what the Inbox counts for prospects', today.length === inbox.counts.prospects && today.length === 1, { today: today.length, inbox: inbox.counts.prospects })
  // a second waiting reply from the same prospect: Today lists two rows; the Inbox one conversation counting two
  DB.T.get('outreach_messages').push({ id: ID.m(9), prospect_id: ID.pr1, partner_id: null, direction: 'inbound', status: 'received', is_test: false, message_id: '<r1b@crepes.example>', subject: 'Re: Votre food truck', from_address: 'marie@crepes.example', to_address: 'dominic@hatchgrab.com', message_date: days(1), text_body: 'Et aussi : combien de tablettes ?', handled_at: null, snoozed_until: null })
  const two = await RM.loadInbox(DB, new Date(), todayWaiting)
  const today2 = await todayWaiting()
  t('…with two replies waiting from one prospect: Today 2 rows, the Inbox one conversation counting 2', today2.length === 2 && two.counts.prospects === 2 && two.conversations.filter(c => c.type === 'prospect').length === 1)
  DB.T.set('outreach_messages', DB.T.get('outreach_messages').filter(r => r.id !== ID.m(9)))
  t('"Open in Inbox" for a prospect: /admin/inbox?c=prospect:<id>', OPEN.inboxHref(OPEN.prospectInboxKey(ID.pr1)) === `/admin/inbox?c=${encodeURIComponent(K.pr1)}` && OPEN.partnerInboxKey(ID.org1) === K.org1)
  {
    let to = null
    const page = now.req('app/(app)/admin/inbox/page.js')
    const nav = require(require.resolve('next/navigation', { paths: [REPO] }))
    try { await page.default({ searchParams: Promise.resolve({ c: K.pr1 }) }) } catch (e) { to = String(e && e.digest || '') }
    t('…and /admin/inbox redirects to the Inbox tab with that conversation selected', /\/admin\?tab=inbox&c=prospect%3A/.test(to || ''), to)
    let bad = null
    try { await page.default({ searchParams: Promise.resolve({ c: 'javascript:alert(1)' }) }) } catch (e) { bad = String(e && e.digest || '') }
    t('…a malformed key just opens the Inbox', (bad || '').split(';')[2] === '/admin?tab=inbox', bad); void nav
  }
  {
    const P = read('components/admin/OutreachPanel.tsx')
    const replies = P.slice(P.indexOf('title="Replies waiting"'), P.indexOf('{/* (b) 🔴 THE DERIVED QUEUE'))
    t('Today\'s "Replies waiting" rows: "Open in Inbox" (openInInbox of that prospect), no Reply composer button — Mark done and Snooze kept',
      /openInInbox\(prospectInboxKey\(r\.prospect_id\)\)/.test(replies) && /Open in Inbox/.test(replies) && !/onReply\(/.test(replies) && /Mark done/.test(replies) && /Snooze/.test(replies))
    t('…Chasers due keeps Compose (outbound first contact and chasers stay where they are)', /title="Chasers due"[\s\S]{0,3000}Compose/.test(P))
    const TL = read('components/admin/ProspectTimeline.tsx')
    t('the prospect timeline: an incoming email offers "Open in Inbox"; "Follow up on this" (my own email) stays', /actions\.onOpenInInbox\(m\)/.test(TL) && /Open in Inbox/.test(TL) && /'Follow up on this'/.test(TL))
    const WS = read('components/admin/ProspectWorkspace.tsx')
    t('…the R key opens the Inbox for this prospect', /openInInbox\(prospectInboxKey\(L\.prospectId\)\)/.test(WS))
    const PT = read('components/admin/PartnersTab.tsx')
    t('a partner\'s drawer: their email offers "Open in Inbox" (no Reply composer); Write email (first contact) stays', /openInInbox\(partnerInboxKey\(p\.id\)\)/.test(PT) && !/>Reply<\/button>/.test(PT) && /Write email/.test(PT))
  }

  // ── 3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('3 · 🔴 From addresses, the Sent copy, and a sent reply leaving the waiting list')
  const HELLO = { user: 'hello-login', pass: 'x' }
  const mkDeps = (o = {}) => {
    const smtp = [], copies = [], routed = []
    return {
      smtp, copies, routed,
      deps: {
        db: DB, model: o.model === undefined ? null : o.model, packInputs: async () => PACK, now: () => new Date(),
        sendProspect: async b => { routed.push(['prospect', b]); if (o.onProspect) o.onProspect(b); return { ok: true, id: U(990), status: 'sent' } },
        sendPartner: async b => { routed.push(['partner', b]); if (o.onPartner) o.onPartner(b); return { ok: true, id: U(991), status: 'sent' } },
        hello: o.noHello ? null : HELLO, fromName: async () => null,
        transport: async (raw, mail, login) => { smtp.push({ raw: raw.toString('utf8'), mail, login }) },
        fileCopy: async (row, raw, date, login) => { copies.push({ login, id: row.message_id }); return { sentCopy: 'appended', mailbox: 'Sent', uid: 77, uidvalidity: null, reason: '' } },
      },
    }
  }
  const flat = raw => String(raw || '').replace(/=\r?\n/g, '')
  const headerOf = (raw, name) => (new RegExp(`^${name}: (.*)$`, 'mi').exec(raw.split(/\r?\n\r?\n/)[0]) || [])[1] || ''
  {
    // a prospect: through the outreach send route; the Today rule then drops it
    const ctx = await RM.loadThread(DB, new Date(), K.pr1, todayWaiting)
    const { deps, routed, smtp } = mkDeps({ onProspect: () => { for (const r of DB.T.get('outreach_messages')) if (r.prospect_id === ID.pr1 && r.direction === 'inbound') r.handled_at = new Date().toISOString() } })
    const r = await SD.sendReply(deps, ctx, { english: 'Hi Marie,\nYes — it works offline.\nDominic', attachments: [], idempotencyKey: 'k-pr1' })
    // (no model + French → refused; the brief: Send stays usable only for English)
    t('a French prospect with no model: Send refuses with "Translation isn\'t switched on yet." and nothing is routed', r.ok === false && r.refusal === TY.INBOX_WORDS.translationOff && routed.length === 0, r)
    const model = standIn()
    const m2 = mkDeps({ model, onProspect: () => { for (const x of DB.T.get('outreach_messages')) if (x.prospect_id === ID.pr1 && x.direction === 'inbound') x.handled_at = new Date().toISOString() } })
    const r2 = await SD.sendReply(m2.deps, ctx, { english: 'Hi Marie,\nYes — it works offline.\nDominic', attachments: [], idempotencyKey: 'k-pr1' })
    const b = (m2.routed[0] || [])[1] || {}
    t('🔴 with a model: the prospect reply goes to the OUTREACH send route (prospect_id, replying to their email, to their address), translated', r2.ok === true && m2.routed.length === 1 && m2.routed[0][0] === 'prospect' && b.prospect_id === ID.pr1 && b.reply_to_message_id === ID.m(2) && b.to === 'marie@crepes.example' && /\[fr\] Hi Marie/.test(JSON.stringify(b.document)), { r2, b })
    t('…carrying no From of its own (the outreach route sends from dominic@) and no partner_id', !('send_from_address' in b) && !('partner_id' in b) && r2.sentFrom === 'dominic@hatchgrab.com')
    t('…and nothing left this process on a socket (the route is the one that sends)', smtp.length === 0 && m2.smtp.length === 0 && SENT.length === 0)
    const after = await RM.loadInbox(DB, new Date(), todayWaiting)
    t('🔴 once sent (the outreach send marks earlier replies done), it leaves Today and the Inbox together', !after.conversations.some(c => c.key === K.pr1) && (await todayWaiting()).length === 0)
    t('the English beside the version sent is recorded (inbox_sent)', DB.T.get('inbox_sent').some(x => x.conversation_key === K.pr1 && /^Hi Marie/.test(x.english_text) && /^\[fr\] Hi Marie/.test(x.sent_text) && x.from_address === 'dominic@hatchgrab.com'))
  }
  {
    // a partner: through the partner send route; a later outbound takes it off the list
    const ctx = await RM.loadThread(DB, new Date(), K.org1, todayWaiting)
    const m = mkDeps({ onPartner: () => DB.T.get('outreach_messages').push({ id: U(992), prospect_id: null, partner_id: ID.org1, direction: 'outbound', status: 'sent', is_test: false, message_id: '<p-sent@hatchgrab.com>', message_date: new Date().toISOString() }) })
    const r = await SD.sendReply(m.deps, ctx, { english: 'Hi Sam,\nThanks — they would get the first 3 months free.\nDominic', attachments: [], idempotencyKey: 'k-org1' })
    const b = (m.routed[0] || [])[1] || {}
    t('an English partner reply needs no model: it goes to the PARTNER send route (partner_id, their email), as written', r.ok === true && m.routed[0] && m.routed[0][0] === 'partner' && b.partner_id === ID.org1 && b.reply_to_message_id === ID.m(6) && /Hi Sam/.test(JSON.stringify(b.document)) && !('prospect_id' in b), { r, b })
    t('…the green note: "Sent from dominic@hatchgrab.com. It\'s in the conversation history."', r.message === "Sent from dominic@hatchgrab.com. It's in the conversation history.", r.message)
    t('…and it leaves the waiting list (a later email from us)', !(await RM.loadInbox(DB, new Date(), todayWaiting)).conversations.some(c => c.key === K.org1))
  }
  {
    // an enquiry: from hello@, threaded, filed in hello@'s Sent
    const ctx = await RM.loadThread(DB, new Date(), K.e1, todayWaiting)
    const m = mkDeps()
    const draft = ctx.thread.draft
    const r = await SD.sendReply(m.deps, ctx, { english: draft.english, attachments: [], idempotencyKey: 'k-e1' })
    const raw = (m.smtp[0] || {}).raw || ''
    const sentRow = DB.T.get('enquiry_messages').find(x => x.enquiry_id === ID.e1 && x.direction === 'out')
    t('🔴 the French enquiry, the English unchanged since translation: sent with NO model at all, in the draft\'s own French', r.ok === true && m.deps.model === null && sentRow && sentRow.original_text === ctx.thread.draft.customer && /Bonjour Claire/.test(flat(raw)), r)
    t('🔴 From: hello@hatchgrab.com (the alias setting is false) — header and envelope — logged in as hello@', /hello@hatchgrab\.com/.test(headerOf(raw, 'From')) && m.smtp[0].mail.envelope.from === 'hello@hatchgrab.com' && m.smtp[0].login.user === 'hello-login', { from: headerOf(raw, 'From'), env: m.smtp[0] && m.smtp[0].mail.envelope })
    t('…To the customer, In-Reply-To their email, Subject Re: theirs, a Message-ID of ours', headerOf(raw, 'To').includes('claire@lyon.example') && headerOf(raw, 'In-Reply-To') === '<q1@lyon.example>' && /^Re: Question sur HatchGrab/.test(headerOf(raw, 'Subject')) && /@hatchgrab\.com>$/.test(headerOf(raw, 'Message-ID')))
    t('…the Sent copy filed with hello@\'s own login (hello@\'s Sent)', m.copies.length === 1 && m.copies[0].login.user === 'hello-login')
    const out = DB.T.get('enquiry_messages').find(x => x.enquiry_id === ID.e1 && x.direction === 'out')
    t('…the conversation history holds the English AND the version sent, from hello@, sent, the copy appended', out && out.send_status === 'sent' && out.from_address === 'hello@hatchgrab.com' && /^Hi Claire/.test(out.english_text) && /^Bonjour Claire/.test(out.original_text) && out.sent_copy === 'appended' && out.mailbox === 'hello/Sent', out)
    t('…"Sent in French from hello@hatchgrab.com. It\'s in the conversation history."', r.message === "Sent in French from hello@hatchgrab.com. It's in the conversation history.", r.message)
    t('🔴 …and it leaves the waiting list', !(await RM.loadInbox(DB, new Date(), todayWaiting)).conversations.some(c => c.key === K.e1))
    const again = await SD.sendReply(m.deps, ctx, { english: draft.english, attachments: [], idempotencyKey: 'k-e1' })
    t('a second press with the same key sends nothing more', again.ok === true && m.smtp.length === 1)
  }
  {
    // the alias setting
    DB = fakeDb(seed())
    DB.T.get('outreach_settings').find(r => r.key === 'enquiries_reply_from_alias').value = true
    const ctx = await RM.loadThread(DB, new Date(), K.e1, todayWaiting)
    const m = mkDeps()
    const r = await SD.sendReply(m.deps, ctx, { english: ctx.thread.draft.english, attachments: [], idempotencyKey: 'k-e1b' })
    const raw = (m.smtp[0] || {}).raw || ''
    t('🔴 enquiries_reply_from_alias true: the reply comes FROM the alias they wrote to (bonjour@), header and envelope', r.ok === true && /bonjour@hatchgrab\.com/.test(headerOf(raw, 'From')) && m.smtp[0].mail.envelope.from === 'bonjour@hatchgrab.com' && ctx.thread.from === 'bonjour@hatchgrab.com', headerOf(raw, 'From'))
    t('…still logged in as hello@ (the aliases are delivered into it)', m.smtp[0].login.user === 'hello-login')
    const ctx2 = await RM.loadThread(DB, new Date(), K.e2, todayWaiting)
    t('…a contact-form enquiry (no alias written to) still comes from hello@', ctx2.thread.from === 'hello@hatchgrab.com')
    const ctx3 = await RM.loadThread(DB, new Date(), K.e3, todayWaiting)
    t('…the customer who wrote to support@ (an alias) gets support@', ctx3.thread.from === 'support@hatchgrab.com')
    const m3 = mkDeps()
    const r3 = await SD.sendReply(m3.deps, ctx2, { english: 'Hi Tom,\nYes, pre-orders can open up to 7 days before a market.\nDominic', attachments: [], idempotencyKey: 'k-e2' })
    const raw3 = (m3.smtp[0] || {}).raw || ''
    t('a contact-form enquiry starts a new thread whose subject carries its ref (HatchGrab — ENQ-0002), no In-Reply-To', r3.ok === true && /ENQ-0002/.test(headerOf(raw3, 'Subject')) && !headerOf(raw3, 'In-Reply-To'), headerOf(raw3, 'Subject'))
    t('no hello@ login here → refused before anything is written or sent', (await SD.sendReply(mkDeps({ noHello: true }).deps, ctx3, { english: 'Hi', attachments: [], idempotencyKey: 'k-e3' })).refusal === 'The hello@ mailbox credentials are not set on this environment, so nothing can be sent.')
    t('an attachment outside the conversation\'s own folder is refused', (await SD.sendReply(mkDeps().deps, ctx3, { english: 'Hi', attachments: [{ filename: 'a.pdf', contentType: 'application/pdf', size: 10, storagePath: `prospects/${ID.pr1}/x-a.pdf` }], idempotencyKey: 'k-e3b' })).ok === false)
  }

  // ── 4 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('4 · the loop filter: the 36 aliases are our own addresses')
  t('the stored list is the brief\'s 36, all @hatchgrab.com', ALIASES.length === 36 && JSON.stringify(ALIASES) === JSON.stringify(BRIEF_ALIASES.map(a => `${a}@hatchgrab.com`)), ALIASES.length)
  const H = from => ({ fromAddress: from, subject: 'hello', to: ['hello@hatchgrab.com'], get: () => null })
  t('🔴 mail FROM any of the 36 is never taken in (own_address), by the stored list as well as the domain', ALIASES.every(a => RULES.skipReason(H(a), [], AL.parseAliases(ALIASES)) === 'own_address'))
  t('…and a person writing TO an alias is taken in, the alias recorded as the address they wrote to', RULES.skipReason({ ...H('claire@lyon.example'), to: ['hola@hatchgrab.com'] }, [], ALIASES) === null && AL.wroteTo(['someone@else.example', 'Hola@HatchGrab.com'], ALIASES) === 'hola@hatchgrab.com')
  t('the alias written to is the language hint when detection is unsure (bonjour → fr, hola → es, support → none)', AL.aliasLanguage('bonjour@hatchgrab.com') === 'fr' && AL.aliasLanguage('hola@hatchgrab.com') === 'es' && AL.aliasLanguage('support@hatchgrab.com') === null
    && LANG.settleLanguage({ text: 'Ok', hints: [AL.aliasLanguage('hola@hatchgrab.com')] }).language === 'es' && LANG.settleLanguage({ text: FR_TEXT, hints: ['es'] }).language === 'fr')
  {
    // the intake itself, through runEnquiries: a message from hola@ is counted, never stored; one to hola@ is stored with its address
    DB = fakeDb({ ...seed(), enquiries: [], enquiry_messages: [], contact_messages: [] })
    DB.T.get('outreach_settings').find(r => r.key === 'enquiries_intake_enabled').value = true
    const store = now.req('lib/enquiries/store.js').supabaseEnquiryStore(DB)
    const mk = (uid, from, to, text) => ({ mailbox: 'hello/INBOX', uid, messageId: `<m${uid}@x.example>`, headers: { fromAddress: from, subject: 'Question', to, get: () => null }, fromName: null, date: new Date().toISOString(), readText: async () => text })
    const s = await RUN.runEnquiries({ store, mail: { walk: async (h) => { for (const c of [mk(1, 'hola@hatchgrab.com', ['hello@hatchgrab.com'], 'loop'), mk(2, 'ana@madrid.example', ['hola@hatchgrab.com'], '¿Cuánto cuesta?')]) await h(c); return { examined: 2, outreach: 0 } } },
      model: null, packInputs: async () => PACK, orderSubjects: [], now: () => new Date(), deadline: Date.now() + 60000 })
    const msgs = DB.T.get('enquiry_messages')
    t('🔴 the poll\'s intake: the message from hola@ is skipped (own_address, nothing stored); the one to hola@ is stored with to_address hola@', s.skipped.own_address === 1 && msgs.length === 1 && msgs[0].to_address === 'hola@hatchgrab.com' && !JSON.stringify(DB.T.get('enquiries')).includes('hola@hatchgrab.com"'), { skipped: s.skipped, msgs })
  }

  // ── 5 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('5 · Update reply')
  DB = fakeDb(seed())
  {
    const ctx = await RM.loadThread(DB, new Date(), K.e2, todayWaiting)
    const r0 = await DR.reviseDraft({ db: DB, model: standIn(), packInputs: async () => PACK, now: () => new Date() }, ctx, { english: 'Hi Tom', comment: '   ' })
    t('an empty comment: "Add a comment first." — and nothing stored', r0.ok === false && r0.refusal === 'Add a comment first.' && DB.T.get('inbox_comments').length === 0)
    const r1 = await DR.reviseDraft({ db: DB, model: null, packInputs: async () => PACK, now: () => new Date() }, ctx, { english: 'Hi Tom', comment: 'mention markets' })
    t('no model: "Drafting isn\'t switched on yet."', r1.ok === false && r1.refusal === "Drafting isn't switched on yet.")
    const ens = await DR.ensureDraft({ db: DB, model: null, packInputs: async () => PACK, now: () => new Date() }, ctx)
    t('…and no draft is made without one (the page still reads and takes a hand-typed reply)', ens.ok === false && ens.held === 'no_model')
    const model = standIn()
    const r2 = await DR.reviseDraft({ db: DB, model, packInputs: async () => PACK, now: () => new Date() }, ctx, { english: 'Hi Tom,\nYes.\nDominic', comment: 'say pre-orders open 7 days before' })
    t('with the stand-in: the current English and the comment go to the model; "Reply rewritten with your comments."', r2.ok === true && r2.message === 'Reply rewritten with your comments.' && /P\.S\. say pre-orders/.test(r2.draft.english) && model.calls.some(c => c[0] === 'revise' && c[1].english === 'Hi Tom,\nYes.\nDominic'))
    t('…the comment is stored (inbox_comments, before and after) and NOT yet a knowledge line', DB.T.get('inbox_comments').length === 1 && DB.T.get('inbox_comments')[0].english_after && DB.T.get('reply_knowledge').length === 2)
    const ctxD = await RM.loadThread(DB, new Date(), K.org1, todayWaiting)
    const mD = standIn()
    const d = await DR.ensureDraft({ db: DB, model: mD, packInputs: async () => PACK, now: () => new Date() }, ctxD)
    const saved = DB.T.get('inbox_drafts').find(x => x.conversation_key === K.org1)
    const pd = (mD.calls.find(c => c[0] === 'draft') || [])[1] || {}
    t('a partner draft: the same drafting core, the pack plus their own section (the organisation, no code yet → none offered, the thread); English, no translation',
      d.ok === true && saved && saved.customer_draft === null && /THIS CONVERSATION\nA partner organisation: Street Food Guild/.test(pd.packText || '') && /No partner code has been created for them yet: do not offer one\./.test(pd.packText) && /Dominic wrote/.test(pd.packText), (pd.packText || '').slice(-500))
    const model2 = standIn()
    await DR.ensureDraft({ db: DB, model: model2, packInputs: async () => PACK, now: () => new Date() }, await RM.loadThread(DB, new Date(), K.pr1, todayWaiting))
    const dcall = model2.calls.find(c => c[0] === 'draft')
    t('…a prospect draft carries their platform and the thread ("THIS CONVERSATION": Square, Dominic wrote …)', dcall && /THIS CONVERSATION[\s\S]*Square[\s\S]*Dominic wrote/.test(dcall[1].packText), dcall && dcall[1].packText.slice(-400))
    const model3 = standIn()
    await DR.ensureDraft({ db: DB, model: model3, packInputs: async () => PACK, now: () => new Date() }, await RM.loadThread(DB, new Date(), K.e3, todayWaiting))
    t('…an English conversation skips translation (no back-translation call, no customer-language version)', !model3.calls.some(c => c[0] === 'back' || c[0] === 'translate'))
  }

  // ── 6 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('6 · 🔴 hand-edited English is translated again before Send')
  DB = fakeDb(seed())
  {
    const ctx = await RM.loadThread(DB, new Date(), K.e1, todayWaiting)
    const model = standIn()
    const m = mkDeps({ model })
    const edited = ctx.thread.draft.english.replace('Thanks for your message.', 'Thanks for your message — and welcome to Lyon\'s markets.')
    const r = await SD.sendReply(m.deps, ctx, { english: edited, attachments: [], idempotencyKey: 'k-edit' })
    const tr = model.calls.filter(c => c[0] === 'translate')
    const out = DB.T.get('enquiry_messages').find(x => x.enquiry_id === ID.e1 && x.direction === 'out')
    t('the English was edited by hand after the last translation → translated again (the FINAL English) before sending', r.ok === true && tr.length === 1 && tr[0][1].text === edited && tr[0][1].toLanguage === 'fr' && out && out.original_text === `[fr] ${edited}` && out.english_text === edited, { r, tr: tr.length })
    t('…and the SMTP bytes carry the new translation, not the old draft', /\[fr\] Hi Claire/.test(flat((m.smtp[0] || {}).raw)) && !/Le plan Pro/.test(flat((m.smtp[0] || {}).raw)))
    DB = fakeDb(seed())
    const ctxN = await RM.loadThread(DB, new Date(), K.e1, todayWaiting)
    const mN = mkDeps()
    const rN = await SD.sendReply(mN.deps, ctxN, { english: `${ctxN.thread.draft.english} edited`, attachments: [], idempotencyKey: 'k-n' })
    t('no model, French, edited: refused — "Translation isn\'t switched on yet." — nothing sent', rN.ok === false && rN.refusal === "Translation isn't switched on yet." && mN.smtp.length === 0)
    const ctxE = await RM.loadThread(DB, new Date(), K.e3, todayWaiting)
    const rE = await SD.sendReply(mN.deps, ctxE, { english: 'Hi,\nTry switching the printer off and on.\nDominic', attachments: [], idempotencyKey: 'k-e' })
    t('no model, English: Send works (typed by hand) — the customer wrote to support@, the alias setting is false → from hello@', rE.ok === true && rE.message === "Sent from hello@hatchgrab.com. It's in the conversation history.", rE)
    t('"Note:" lines never reach the customer', (await SD.sendReply(mkDeps().deps, await RM.loadThread(DB, new Date(), K.e2, todayWaiting), { english: 'Hi Tom,\nYes.\nNote: check the bao count\nDominic', attachments: [], idempotencyKey: 'k-note' })).ok === true
      && !DB.T.get('enquiry_messages').some(x => x.direction === 'out' && /check the bao/.test(x.original_text)))
  }

  // ── 7 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('7 · 🔴 comments become SUGGESTED lines only after Send')
  DB = fakeDb(seed())
  {
    const deps = { db: DB, model: standIn(), packInputs: async () => PACK, now: () => new Date() }
    let ctx = await RM.loadThread(DB, new Date(), K.e2, todayWaiting)
    await DR.reviseDraft(deps, ctx, { english: 'Hi Tom,\nYes.\nDominic', comment: 'Always say pre-orders close by a rule, not a typed date' })
    await DR.reviseDraft(deps, ctx, { english: 'Hi Tom,\nYes.\nDominic', comment: 'shorter' })
    t('two comments stored; reply_knowledge unchanged (2 rows)', DB.T.get('inbox_comments').length === 2 && DB.T.get('reply_knowledge').length === 2)
    ctx = await RM.loadThread(DB, new Date(), K.e2, todayWaiting)
    const m = mkDeps({ model: standIn() })
    await SD.sendReply(m.deps, ctx, { english: `${ctx.thread.draft.english}\nWe also do a free demo for markets like yours.`, attachments: [], idempotencyKey: 'k-learn' })
    const kn = DB.T.get('reply_knowledge').filter(x => x.status === 'suggested')
    const notes = kn.filter(x => x.source === 'note'), edits = kn.filter(x => x.source === 'edit')
    t('🔴 after Send: each comment is ONE suggested guidance line, source \'note\', source_ref the ENQ ref, never customer-safe', notes.length === 2 && notes.every(x => x.kind === 'guidance' && x.customer_safe === false && x.source_ref === 'ENQ-0002') && notes.some(x => /pre-orders close by a rule/.test(x.wording)), notes)
    t('…and the hand edit a suggested fact (source \'edit\'); nothing approved', edits.length === 1 && /free demo/.test(edits[0].wording) && !DB.T.get('reply_knowledge').some(x => x.status === 'approved' && x.source !== 'dominic'))
    t('…the comments are marked sent and linked to their line', DB.T.get('inbox_comments').every(c => c.sent_at && c.knowledge_id))
    const P = read('lib/inbox/drafting.ts') + read('components/admin/InboxTab.tsx')
    t('suggested lines are never shown on the Inbox page and nothing there approves', !/reply_knowledge/.test(noComments(read('components/admin/InboxTab.tsx'))) && !/status: 'approved'|approved_at/.test(noComments(P)))
  }

  // ── 8 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('8 · retention: enquiry conversations 24 months after their last message')
  {
    const mo = n => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString() }
    DB = fakeDb({ enquiries: [
      { id: 'old-last', last_message_at: mo(25), created_at: mo(30) },
      { id: 'recent-last', last_message_at: mo(23), created_at: mo(30) },     // created long ago, but written to recently: kept
      { id: 'no-msg-old', last_message_at: null, created_at: mo(26) },
      { id: 'no-msg-new', last_message_at: null, created_at: mo(1) },
      { id: 'just-past', last_message_at: mo(25), created_at: mo(25) },
    ] })
    const failures = []
    const n = await RET.deleteOldEnquiries(DB, RET.retentionCutoff(new Date(), RET.ENQUIRY_RETENTION_MONTHS).toISOString(), failures)
    const left = DB.T.get('enquiries').map(e => e.id).sort()
    t('only the conversations older than 24 months go (by their LAST message; by creation when they have none)', n === 3 && JSON.stringify(left) === JSON.stringify(['no-msg-new', 'recent-last']) && !failures.length, { n, left, failures })
    t('the same 24 months as contact_messages', RET.ENQUIRY_RETENTION_MONTHS === RET.CONTACT_RETENTION_MONTHS && RET.CONTACT_RETENTION_MONTHS === 24)
    DB = fakeDb({ enquiries: [{ id: 'x', last_message_at: mo(30), created_at: mo(30) }] })
    const res = await RET.runOrderRetention(DB, new Date())
    t('the daily retention run does it and reports enquiriesDeleted', res.enquiriesDeleted === 1, res)
    t('the migration keeps last_message_at at the newest message (a trigger on enquiry_messages insert) and the child tables cascade', /create trigger enquiry_messages_touch_last after insert on public\.enquiry_messages/.test(MIGRATION)
      && /greatest\(coalesce\(last_message_at, new\.received_at\), new\.received_at\)/.test(MIGRATION) && /enquiry_id\s+uuid references public\.enquiries\(id\) on delete cascade/.test(MIGRATION)
      && /enquiry_id\s+uuid not null references public\.enquiries\(id\) on delete cascade/.test(read('supabase/migrations/20261123_enquiries_backend_1.sql')))
  }

  // ── 9 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('9 · the numbers check (decision 6): the customer\'s own numbers are allowed')
  {
    const ledger = { canStart: () => true, add: async () => {} }
    const m = standIn()
    m.draft = async () => ({ value: { asks: [], english_draft: 'Hi,\nWith 200 bao a day the Pro plan at €19 suits you.\nDominic', customer_draft: 'x' }, usd: 0 })
    const ok = await RUN.composeDraft({ text: 'We do about 200 bao a day.', subject: null, knownLanguage: 'en', languageHint: null, name: null, country: 'FR' }, [], async () => PACK, m, ledger)
    t('a number from their own message (200) and one from the pack (€19): pass', ok.numbers.result === 'pass', ok.numbers)
    m.draft = async () => ({ value: { asks: [], english_draft: 'Hi,\nThe Pro plan is €12.\nDominic', customer_draft: 'x' }, usd: 0 })
    const bad = await RUN.composeDraft({ text: 'We do about 200 bao a day.', subject: null, knownLanguage: 'en', languageHint: null, name: null, country: 'FR' }, [], async () => PACK, m, ledger)
    t('an invented price (€12): fail, flagged (stored, not shown on the page)', bad.numbers.result === 'fail' && bad.flags.some(f => f.kind === 'numbers'), bad.numbers)
  }

  // ── 10 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('10 · 🔴 outreach unchanged: the same bytes for an outreach row')
  {
    const wt = headWorktree('inbox1-base', BASE)
    try {
      const was = compile(wt.wt, ['lib/outreach-mail-envelope.ts'], 'inbox1-base', TSC)
      const OLD = was.req('lib/outreach-mail-envelope.js')
      const row = { message_id: '<fixed@hatchgrab.com>', from_name: null, in_reply_to: '<p@x.example>', references: '<a@x.example> <p@x.example>', subject: 'Re: Hello', to_address: 'prospect@x.example', message_date: '2026-11-23T10:00:00Z', html_body: '<div>Hi</div>', text_body: 'Hi\n', attachments: null }
      const norm = s => s.toString('utf8').replace(/--_NmP-[0-9a-f-]+-Part_\d+/g, 'BOUNDARY').replace(/boundary="[^"]+"/g, 'boundary="B"')
      const a = norm(await OLD.composeRaw(row)), b = norm(await ENV.composeRaw(row))
      t('🔴 composeRaw of an outreach row (no send_from_address): byte-identical to before inbox-1 (boundaries aside), From dominic@', a === b && /^From: dominic@hatchgrab\.com$/m.test(b), { a: a.slice(0, 300), b: b.slice(0, 300) })
      t('…and the envelope sender too (rawMailFor)', JSON.stringify(OLD.rawMailFor(Buffer.from('x'), row).envelope) === JSON.stringify(ENV.rawMailFor(Buffer.from('x'), row).envelope))
      t('…an outreach_messages row carrying from_address (an inbound row\'s sender) still sends from dominic@ — the Inbox field is a different name', /^From: dominic@hatchgrab\.com$/m.test(norm(await ENV.composeRaw({ ...row, from_address: 'someone@else.example' }))))
      t('lib/outreach-mail-deliver.ts, the poll\'s outreach walk, sequences, templates and the partner send/cron paths: unchanged since BASE',
        // inbox-2: pinned to inbox-1's own code commit (later work — inbox-2's dominic@ customers — changes the poll on purpose)
        git('diff', '--name-only', BASE, INBOX1, '--', 'lib/outreach-mail-deliver.ts', 'lib/outreach-sequence.ts', 'lib/outreach-template-render.ts', 'lib/partner-send.ts', 'lib/partner-offers.ts', 'lib/partner-codes-server.ts', 'app/api/admin/outreach/mail-send', 'app/api/admin/partners', 'app/api/admin/outreach/today', 'app/api/admin/outreach/timeline', 'app/api/admin/outreach-templates', 'app/api/cron', 'lib/outreach-mail-poll.ts').trim() === '')
      t('no outreach_templates row is created, edited, seeded or deactivated (no file of this work names the table)', ![...mine()].filter(f => /\.(ts|tsx|sql)$/.test(f)).some(f => /outreach_templates/.test(read(f))))
    } finally { wt.remove() }
  }

  // ── 11 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('11 · 🔴 the source census: one send path, behind admin auth, pressed by hand')
  census()

  // ── 12 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('12 · 🔴 byte-identical protected paths')
  identity()

  // ── 13 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (SCREENS) { head('13 · screenshots: WebKit and Chromium, 1512×982 and 2560×1440, and 390px phones'); await screens() }
  else console.log('\n(13 · screenshots skipped: --no-screens)')
}

// ── the files of this work ───────────────────────────────────────────────────────────────────────────────────────────
function mine() {
  const NEW = ['lib/inbox', 'components/admin/InboxTab.tsx', 'app/api/admin/inbox/route.ts', 'app/(app)/admin/inbox/page.tsx', 'scripts/inbox-1.cjs', 'supabase/migrations/20261123_inbox_1.sql']
  const out = new Set()
  for (const p of NEW) {
    const abs = path.join(REPO, p)
    if (!fs.existsSync(abs)) continue
    if (fs.statSync(abs).isDirectory()) for (const f of fs.readdirSync(abs)) out.add(`${p}/${f}`); else out.add(p)
  }
  return out
}
const CHANGED_OLD = ['app/(app)/admin/page.tsx', 'components/admin/OutreachPanel.tsx', 'components/admin/ProspectTimeline.tsx', 'components/admin/ProspectWorkspace.tsx', 'components/admin/PartnersTab.tsx',
  'lib/enquiries/run.ts', 'lib/enquiries/model.ts', 'lib/enquiries/rules.ts', 'lib/enquiries/store.ts', 'lib/enquiries/learning.ts', 'lib/outreach-mail-envelope.ts', 'lib/outreach-mail-accounts.ts', 'lib/order-retention.ts',
  'scripts/harnesses.json', 'scripts/enquiries-backend-1.cjs', 'scripts/outreach-reply-any-notes.cjs', 'scripts/outreach-reply-attach.cjs', 'scripts/outreach-workspace-v4.cjs']

function census() {
  const ALL = git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'app', 'lib', 'components', 'scripts').split('\n').filter(f => /\.(ts|tsx)$/.test(f) && fs.existsSync(path.join(REPO, f)))
  const importers = spec => ALL.filter(f => new RegExp(`from ['"]@/${spec.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}['"]|import\\(['"]@/${spec.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}['"]\\)`).test(read(f)))
  t('🔴 lib/inbox/send.ts (the Inbox\'s only send) is imported by ONE file: app/api/admin/inbox/route.ts', JSON.stringify(importers('lib/inbox/send')) === JSON.stringify(['app/api/admin/inbox/route.ts']), importers('lib/inbox/send'))
  const route = noComments(read('app/api/admin/inbox/route.ts'))
  const post = route.slice(route.indexOf('export async function POST('))
  t('🔴 …whose POST answers 404 to anyone not an admin, FIRST', /^export async function POST\(req: NextRequest\) \{\n  if \(!\(await verifyAdmin\(req\)\)\) return NextResponse\.json\(\{ error: 'Unauthorised' \}, \{ status: 404 \}\)/.test(post))
  t('🔴 …and calls sendReply in exactly one place: the action \'send\' branch', (post.match(/sendReply\(/g) || []).length === 1 && /if \(action === 'send'\) \{[\s\S]{0,900}sendReply\(deps, ctx/.test(post))
  t('…the GET answers 404 to a non-admin too', /export async function GET\(req: NextRequest\) \{\n  if \(!\(await verifyAdmin\(req\)\)\) return NextResponse\.json\(\{ error: 'Unauthorised' \}, \{ status: 404 \}\)/.test(route))
  t('hello@ as a send account (accountForInboxReply) is used by that route alone', JSON.stringify(ALL.filter(f => /accountForInboxReply\(/.test(read(f))).sort()) === JSON.stringify(['app/api/admin/inbox/route.ts', 'lib/outreach-mail-accounts.ts']))
  t('send_from_address is set by lib/inbox/send.ts alone (and read by the envelope)', JSON.stringify(ALL.filter(f => /send_from_address/.test(noComments(read(f)))).sort()) === JSON.stringify(['lib/inbox/send.ts', 'lib/outreach-mail-envelope.ts']))
  const crons = ALL.filter(f => f.startsWith('app/api/cron/') || f === 'lib/outreach-mail-poll.ts' || /scheduler|schedule/.test(f))
  t('🔴 nothing scheduled reaches it: no cron route, the reply poll or a scheduler imports lib/inbox (drafting or send) or the Inbox route', crons.every(f => !/@\/lib\/inbox\/(send|drafting|read-model|model-server)|api\/admin\/inbox/.test(read(f))), crons.filter(f => /@\/lib\/inbox/.test(read(f))))
  t('no new Vercel cron (vercel.json unchanged since BASE)', git('show', `${BASE}:vercel.json`) === read('vercel.json'))
  const SEND_PKG = /from ['"](nodemailer|imapflow)['"]|@\/lib\/outreach-mail-deliver|@\/lib\/outreach-mail-box|createTransport|sendMail\(|appendToSent/
  const others = [...mine()].filter(f => /\.(ts|tsx)$/.test(f) && f !== 'lib/inbox/send.ts')
  t('every other file of this work (read model, drafting, the page, the route\'s other actions) names no mail transport, mailbox or deliver', others.every(f => !SEND_PKG.test(noComments(read(f)))), others.filter(f => SEND_PKG.test(noComments(read(f)))))
  t('the enquiry modules still reach no send path (the enquiries-backend-1 rule): lib/enquiries imports lib/inbox/aliases only', fs.readdirSync(path.join(REPO, 'lib/enquiries')).every(f => !/@\/lib\/inbox\/(?!aliases')/.test(read(`lib/enquiries/${f}`)) && !SEND_PKG.test(noComments(read(`lib/enquiries/${f}`)))))
  const R = now.req('lib/enquiries/rules.js')
  t('🔴 canAutoSend is still false (AUTO_SEND_BUILT false), for a flagless draft too', R.AUTO_SEND_BUILT === false && R.canAutoSend({ flags: [], numbers_check: 'pass', asks: [{ status: 'available' }] }) === false)
  const tab = noComments(read('components/admin/InboxTab.tsx'))
  t('🔴 the page posts action \'send\' from one function, wired to the Send button\'s click alone', (tab.match(/action: 'send'/g) || []).length === 1 && (tab.match(/void send\(\)/g) || []).length === 1 && /data-send onClick=\{\(\) => void send\(\)\}/.test(tab))
  t('the page shows no review flags, gaps or back-translation (it reads none of them)', !/\bflags\b|back_?[tT]ranslation|\basks\b|numbers_check|ask_gap/.test(tab))
  t('no real send happened anywhere in this run (the mail package is a fake that refuses) and no mailbox was touched', SENT.length === 0 && IMAP_WRITES.length === 0, { SENT: SENT.length, IMAP_WRITES })
  t('no .env file is read by any file of this work', [...mine()].filter(f => f !== 'scripts/inbox-1.cjs').every(f => !/\.env/.test(noComments(read(f)).replace(/process\.env\.[A-Z_]+/g, ''))))
  const named = new RegExp(['gus', 'to|chur', 'rasco'].join(''), 'i')   // NAMED_NOWHERE
  t('Pizzeria Gusto and Le Roi du Churrasco: named in no file of this work and in no fixture', [...mine()].every(f => !named.test(read(f).split('\n').filter(l => !/NAMED_NOWHERE/.test(l)).join('\n')))) // NAMED_NOWHERE
}

function identity() {
  const PROTECTED = [
    // ordering, checkout, payments, KDS, dashboard, Add order, heartbeat, auth, Manage — every operator / customer screen (app/(app) minus admin)
    ...fs.readdirSync(path.join(REPO, 'app/(app)')).filter(d => d !== 'admin').map(d => `app/(app)/${d}`),
    // inbox-2: every app/api route folder but admin, read from the tree — a superset of the 16 it named (the payment routes included)
    ...fs.readdirSync(path.join(REPO, 'app/api')).filter(d => d !== 'admin').map(d => `app/api/${d}`),
    ...fs.readdirSync(path.join(REPO, 'components')).filter(d => d !== 'admin').map(d => `components/${d}`),
    // …and every lib entry but the ones inbox-1 (and inbox-2) work in — a superset of the lib paths it named
    ...fs.readdirSync(path.join(REPO, 'lib')).map(f => `lib/${f}`).filter(p => !['lib/inbox', 'lib/enquiries', 'lib/outreach-mail-envelope.ts', 'lib/outreach-mail-accounts.ts', 'lib/order-retention.ts'].includes(p)),
    'lib/menu-loader.ts', 'lib/order-calculations.ts', 'lib/order-charges.ts', 'lib/preorder.ts', 'proxy.ts', 'next.config.ts', 'vercel.json',
    // the contact form, the landing page, every customer-facing page and word, the legal pages
    'app/contact', 'app/api/contact', 'lib/contact.ts', 'lib/contact-server.ts', 'app/(public)', 'app/page.tsx', 'app/layout.tsx', 'messages', 'content', 'lib/i18n', 'public',
  ].filter(p => fs.existsSync(path.join(REPO, p)))
  const inboxCommits = git('log', '--format=%H', `${BASE}..HEAD`, '--grep', '^inbox-1').split('\n').filter(Boolean)
  const touched = new Set(inboxCommits.flatMap(c => git('show', '--name-only', '--format=', c).split('\n').filter(Boolean)))
  const isProtected = f => PROTECTED.some(p => f === p || f.startsWith(p + '/'))
  const hit = [...touched].filter(isProtected)
  t(`🔴 ${PROTECTED.length} protected paths: no inbox-1 commit (${inboxCommits.length}) touches one`, hit.length === 0, hit)
  const mineNow = [...mine(), ...CHANGED_OLD]
  t('…nor any file of this work in the working tree (the new files and the admin / outreach / enquiry files it changed)', mineNow.filter(isProtected).length === 0, mineNow.filter(isProtected))
  const committedMine = [...touched].filter(f => !f.startsWith('docs/'))
  const allowed = new Set([...mine(), ...CHANGED_OLD])
  t('the inbox-1 commits changed only this work\'s files (docs aside)', committedMine.every(f => allowed.has(f) || [...mine()].some(m => f.startsWith(m + '/'))), committedMine.filter(f => !allowed.has(f)))
  t('the admin changes are the Inbox tab and "Open in Inbox" only: Inbox first, the other tabs in their order after it', /const ADMIN_TABS = \{\n[^\n]*\n  inbox:\s+[^\n]*\n  trucks:\s/.test(read('app/(app)/admin/page.tsx')))
}

// ══ 13 · screenshots ═════════════════════════════════════════════════════════════════════════════════════════════════
async function appCss() {
  const postcss = require(require.resolve('postcss', { paths: [REPO] }))
  const tw = require(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))
  const src = fs.readFileSync(path.join(REPO, 'app/(app)/globals.css'), 'utf8').replace(/@import "leaflet[^"]*";\n?/, '')
  return (await postcss([tw({ base: REPO })]).process(src, { from: path.join(REPO, 'app/(app)/globals.css') })).css
}
const STUBS = {
  'next/navigation': "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} }); export const usePathname = () => '/admin'; export const useSearchParams = () => new URLSearchParams(location.search); export const redirect = () => {}; export const notFound = () => {}",
  'next/link': "import React from 'react'; export default function Link(p) { const { href, children, prefetch, replace, scroll, ...rest } = p; return React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children) }",
  'next/image': "import React from 'react'; export default function Image(p) { const { src, alt, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest } = p; return React.createElement('img', { src: typeof src === 'string' ? src : '', alt, ...rest }) }",
}
async function bundle(entrySrc) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-inbox1-'))
  const entry = path.join(dir, 'entry.tsx'); fs.writeFileSync(entry, entrySrc)
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: path.join(dir, 'bundle.js'), format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2020', logLevel: 'error',
    alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')], banner: { js: 'window.process = window.process || { env: {} };' }, loader: { '.svg': 'text', '.png': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"http://127.0.0.1:9"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"harness"', 'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': '"true"' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, a => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js', resolveDir: REPO }))
    } }],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

async function screens() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  // the page's data: the read model's OWN answers over the fixtures (with a model "configured", so the drafts and translations show)
  DB = fakeDb(seed())
  // a prospect draft and translation the Inbox made, so its thread shows them as it would with the key in
  await DR.ensureDraft({ db: DB, model: standIn(), packInputs: async () => PACK, now: () => new Date() }, await RM.loadThread(DB, new Date(), `prospect:${ID.pr1}`, todayWaiting))
  const list = await RM.loadInbox(DB, new Date(), todayWaiting)
  const threads = {}
  for (const c of list.conversations) threads[c.key] = (await RM.loadThread(DB, new Date(), c.key, todayWaiting)).thread
  const css = await appCss()
  const js = await bundle(`import { createRoot } from 'react-dom/client'\nimport AdminPage from '@/app/(app)/admin/page'\ncreateRoot(document.getElementById('root')).render(<AdminPage />)\n`)
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="bg-white"><div id="root"></div><script src="/admin.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    const u = req.url.split('?')[0]
    if (u === '/admin.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
    const pub = path.join(REPO, 'public', decodeURIComponent(u))
    if (pub.startsWith(path.join(REPO, 'public') + path.sep) && fs.existsSync(pub) && fs.statSync(pub).isFile()) {
      const type = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(pub)] || 'application/octet-stream'
      res.writeHead(200, { 'content-type': type }); return res.end(fs.readFileSync(pub))
    }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const posts = []
  const route = (page, o = {}) => page.route('**/*', r => {
    const u = new URL(r.request().url())
    if (!u.pathname.startsWith('/api/')) return r.continue()
    const json = body => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (u.pathname === '/api/admin/inbox') {
      if (r.request().method() === 'POST') {
        const b = JSON.parse(r.request().postData() || '{}'); posts.push(b)
        if (b.action === 'send') { const th = threads[b.key]; const l = th.theirLanguage; return json({ ok: true, message: TY.sentNote(LANG.languageName(l), th.from, LANG.isEnglish(l)), sentFrom: th.from }) }
        if (b.action === 'update_reply') return json(o.drafting === false ? { ok: false, refusal: TY.INBOX_WORDS.draftingOff } : { ok: true, draft: { ...threads[b.key].draft, english: `${b.english}\nP.S. ${b.comment}` }, message: TY.INBOX_WORDS.rewritten })
        if (b.action === 'draft') return json({ ok: false, refusal: TY.INBOX_WORDS.draftingOff, held: 'no_model' })
        return json({ ok: true, message: 'Done.' })
      }
      const v = u.searchParams.get('view')
      const conv = o.empty ? [] : list.conversations
      const counts = o.empty ? { all: 0, enquiries: 0, prospects: 0, partners: 0, customers: 0 } : list.counts
      if (v === 'count') return json({ ok: true, waiting: counts.all, counts })
      if (v === 'thread') { const th = threads[u.searchParams.get('key')]; return json(th ? { ...th, ...(o.drafting === false ? { draft: null } : {}), drafting: o.drafting !== false, draftHeld: null } : { ok: false, refusal: 'gone' }) }
      return json({ ok: true, conversations: conv, counts, drafting: o.drafting !== false })
    }
    if (u.pathname === '/api/admin') {
      const s = u.searchParams.get('section')
      if (s === 'discovery') return json({ discoveryTrucks: [] })
      if (s === 'demo_cleanup') return json({ lastRun: null })
      return json({ trucks: [], operators: [], countrySettings: {}, plans: { plans: [], prices: [], features: [] } })
    }
    if (u.pathname === '/api/auth/me') return json({ first_name: 'Dominic' })
    return json({})
  })
  const { webkit, chromium } = require(require.resolve('playwright', { paths: [REPO] }))
  const K1 = `enquiry:${ID.e1}`, KP = `prospect:${ID.pr1}`
  try {
    for (const [engineName, engine] of [['webkit', webkit], ['chromium', chromium]]) {
      const browser = await engine.launch()
      try {
        for (const [w, h, tag] of [[1512, 982, 'laptop'], [2560, 1440, '4k']]) {
          const page = await browser.newPage({ viewport: { width: w, height: h } })
          const errors = []; page.on('pageerror', e => errors.push(String(e)))
          await route(page)
          await page.goto(`${base}/admin?tab=inbox&c=${encodeURIComponent(K1)}`)
          await page.waitForSelector('[data-latest]', { timeout: 30000 })
          await page.waitForTimeout(400)
          const shot = `inbox-${tag}-${engineName}.png`
          await page.screenshot({ path: path.join(OUT_DIR, shot) })
          const m = await page.evaluate(() => {
            const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null }
            const tabs = [...document.querySelectorAll('.sticky.top-\\[51px\\] button')].map(b => b.textContent.trim())
            const sel = document.querySelector('[aria-current="true"]')
            const bar = sel && sel.querySelector('span[aria-hidden="true"]')
            const latest = document.querySelector('[data-latest]')
            return {
              sideways: document.documentElement.scrollWidth > window.innerWidth, vw: window.innerWidth, vh: window.innerHeight,
              list: r('[data-inbox-list]'), msg: r('[data-inbox-message]'), reply: r('[data-inbox-reply]'), inbox: r('[data-inbox]'),
              firstTab: tabs[0], inboxCount: (document.querySelector('[data-inbox-count]') || {}).textContent,
              counts: Object.fromEntries([...document.querySelectorAll('[data-count]')].map(e => [e.dataset.count, e.textContent])),
              selKey: sel && sel.dataset.row, selCls: sel && sel.className, bar: bar && getComputedStyle(bar).backgroundColor,
              topGap: (() => { const e = document.querySelector('[data-inbox]'); return e ? e.getBoundingClientRect().top : null })(), docH: document.documentElement.scrollHeight,
              latestFont: latest && getComputedStyle(latest).fontSize, latestLine: latest && getComputedStyle(latest).lineHeight, latestText: latest && latest.textContent,
              englishMin: (() => { const e = document.querySelector('[data-english]'); return e && getComputedStyle(e).minHeight })(),
              heading: (document.querySelector('[data-inbox-reply] h2') || {}).textContent, from: (document.querySelector('[data-from]') || {}).textContent,
              send: (document.querySelector('[data-send]') || {}).textContent, sub: (document.querySelector('[data-inbox-message] h2 + p') || {}).textContent,
              listScroll: document.querySelector('[data-inbox-list]') && getComputedStyle(document.querySelector('[data-inbox-list]')).overflowY,
              chips: [...document.querySelectorAll('[data-row] span.rounded.border')].map(e => [e.textContent, e.className]),
            }
          })
          const label = `${engineName} ${w}×${h}`
          t(`${label}: no page errors; the page never scrolls sideways`, errors.length === 0 && !m.sideways, errors.slice(0, 3))
          t(`${label}: Inbox is the FIRST admin tab, with its count (5)`, /Inbox/.test(m.firstTab || '') && m.inboxCount === '5', { first: m.firstTab, n: m.inboxCount })
          t(`${label}: filters All 5 · Enquiries 2 · Prospects 1 · Partners 1 · Customers 1`, m.counts.all === '5' && m.counts.enquiries === '2' && m.counts.prospects === '1' && m.counts.partners === '1' && m.counts.customers === '1', m.counts)
          t(`${label}: three columns side by side, full width, the list ~300px, each scrolling on its own, filling the height`, m.list && Math.abs(m.list.width - 300) < 2 && m.msg.left >= m.list.right - 1 && m.reply.left >= m.msg.right - 1 && Math.abs(m.reply.right - m.vw) < 2 && Math.abs(m.inbox.width - m.vw) < 2 && m.listScroll === 'auto' && Math.abs(m.inbox.bottom - m.vh) < 3 && m.docH <= m.vh + 1, { list: m.list && m.list.width, inboxTop: m.topGap, inboxBottom: m.inbox && m.inbox.bottom, vh: m.vh, docH: m.docH })
          t(`${label}: the deep link selected the French enquiry — pale orange (bg-orange-50) with the #EF8B2C bar`, m.selKey === K1 && /\bbg-orange-50\b/.test(m.selCls) && m.bar === 'rgb(239, 139, 44)', { key: m.selKey, cls: m.selCls, bar: m.bar })
          t(`${label}: "in English, translated from French", the latest message in full at 15px / ~1.65`, m.sub === 'in English, translated from French' && m.latestFont === '15px' && Math.abs(parseFloat(m.latestLine) / 15 - 1.65) < 0.02 && m.latestText === FR_EN, { sub: m.sub, f: m.latestFont, l: m.latestLine })
          t(`${label}: "Your reply · in English · you can type in it", the box ≥330px, from hello@, "Send in French"`, m.heading === 'Your reply · in English · you can type in it' && m.englishMin === '330px' && m.from === 'from hello@hatchgrab.com' && m.send === 'Send in French', { h: m.heading, min: m.englishMin, from: m.from, send: m.send })
          const chip = l => (m.chips.find(c => c[0] === l) || [])[1] || ''
          t(`${label}: type labels Enquiry blue, Prospect violet, Partner teal, Customer amber`, /bg-blue-100/.test(chip('Enquiry')) && /bg-violet-100/.test(chip('Prospect')) && /bg-teal-100/.test(chip('Partner')) && /bg-amber-100/.test(chip('Customer')), m.chips)
          // the toggles
          await page.click('[data-toggle-original]'); await page.waitForTimeout(100)
          t(`${label}: "Show original" shows their French, then "Show English"`, (await page.textContent('[data-latest]')) === FR_TEXT && (await page.textContent('[data-toggle-original]')).trim() === 'Show English')
          await page.click('[data-toggle-original]')
          await page.click('[data-toggle-customer]'); await page.waitForTimeout(100)
          t(`${label}: "Show French" shows what they will receive, read-only`, /Bonjour Claire/.test(await page.textContent('[data-customer-version]')))
          if (tag === 'laptop') await page.screenshot({ path: path.join(OUT_DIR, `inbox-${tag}-${engineName}-show-french.png`) })
          await page.click('[data-toggle-customer]')
          // Update reply with an empty comment, then with one
          await page.click('[data-update]'); await page.waitForTimeout(100)
          t(`${label}: Update reply with an empty comment → "Add a comment first."`, (await page.textContent('[data-note]')) === 'Add a comment first.')
          await page.fill('[data-comment]', 'mention the free demo'); await page.click('[data-update]'); await page.waitForTimeout(200)
          t(`${label}: after Update reply → "Reply rewritten with your comments." and the English rewritten`, (await page.textContent('[data-note]')) === 'Reply rewritten with your comments.' && /P\.S\. mention the free demo/.test(await page.inputValue('[data-english]')))
          // Send
          await page.click('[data-send]'); await page.waitForTimeout(300)
          const note = await page.textContent('[data-note="sent"]')
          const sentRow = await page.$(`[data-row="${K1}"] [data-sent]`)
          const counts2 = await page.evaluate(() => [document.querySelector('[data-count="all"]').textContent, document.querySelector('[data-inbox-count]').textContent])
          t(`${label}: after Send — the green note, the row says "Sent", it drops out of the waiting count (5 → 4, tab too)`, note === "Sent in French from hello@hatchgrab.com. It's in the conversation history." && !!sentRow && counts2[0] === '4' && counts2[1] === '4', { note, counts2 })
          await page.screenshot({ path: path.join(OUT_DIR, `inbox-${tag}-${engineName}-sent.png`) })
          await page.close()
        }
        // the prospect, the empty state and the no-model page (laptop size)
        {
          const page = await browser.newPage({ viewport: { width: 1512, height: 982 } })
          await route(page)
          await page.goto(`${base}/admin?tab=inbox&c=${encodeURIComponent(KP)}`)
          await page.waitForSelector('[data-latest]', { timeout: 30000 }); await page.waitForTimeout(300)
          await page.click('[data-earlier]'); await page.waitForTimeout(100)
          t(`${engineName}: a prospect — "Show 1 earlier message" opens the thread (our first email); from dominic@`, (await page.$$('[data-earlier-list] li')).length === 1 && (await page.textContent('[data-from]')) === 'from dominic@hatchgrab.com')
          await page.screenshot({ path: path.join(OUT_DIR, `inbox-laptop-${engineName}-prospect.png`) })
          await page.close()
        }
        {
          const page = await browser.newPage({ viewport: { width: 1512, height: 982 } })
          await route(page, { empty: true })
          await page.goto(`${base}/admin?tab=inbox`)
          await page.waitForSelector('[data-inbox-empty]', { timeout: 30000 })
          t(`${engineName}: empty — "No customer emails waiting."`, (await page.textContent('[data-inbox-empty]')).trim() === 'No customer emails waiting.')
          await page.screenshot({ path: path.join(OUT_DIR, `inbox-laptop-${engineName}-empty.png`) })
          await page.close()
        }
        {
          const page = await browser.newPage({ viewport: { width: 1512, height: 982 } })
          await route(page, { drafting: false })
          await page.goto(`${base}/admin?tab=inbox&c=${encodeURIComponent(K1)}`)
          await page.waitForSelector('[data-latest]', { timeout: 30000 }); await page.waitForTimeout(300)
          const offWords = await page.textContent('[data-translation-off]')
          const disabled = await page.$eval('[data-send]', b => b.disabled)
          await page.fill('[data-comment]', 'shorter'); await page.click('[data-update]'); await page.waitForTimeout(100)
          t(`${engineName}: no model — a French email: "Translation isn't switched on yet.", Send disabled; Update reply → "Drafting isn't switched on yet."`, offWords === "Translation isn't switched on yet." && disabled === true && (await page.textContent('[data-note]')) === "Drafting isn't switched on yet.")
          await page.screenshot({ path: path.join(OUT_DIR, `inbox-laptop-${engineName}-no-model.png`) })
          await page.click(`[data-row="enquiry:${ID.e2}"]`); await page.waitForTimeout(400)
          await page.fill('[data-english]', 'Hi Tom,\nYes.\nDominic')
          t(`${engineName}: no model — an English email can still be answered by hand ("Send" enabled)`, (await page.$eval('[data-send]', b => !b.disabled)) && (await page.textContent('[data-send]')) === 'Send')
          await page.close()
        }
        {
          const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
          const errors = []; page.on('pageerror', e => errors.push(String(e)))
          await route(page)
          await page.goto(`${base}/admin?tab=inbox&c=${encodeURIComponent(K1)}`)
          await page.waitForSelector('[data-latest]', { timeout: 30000 }); await page.waitForTimeout(300)
          const m = await page.evaluate(() => {
            const r = s => document.querySelector(s).getBoundingClientRect()
            return { sideways: document.documentElement.scrollWidth > window.innerWidth, list: r('[data-inbox-list]'), msg: r('[data-inbox-message]'), reply: r('[data-inbox-reply]') }
          })
          t(`${engineName} 390px phone: stacked (list, their message, your reply), nothing wider than the screen`, !m.sideways && m.msg.top >= m.list.bottom - 1 && m.reply.top >= m.msg.bottom - 1 && m.list.width <= 391 && errors.length === 0, m)
          await page.screenshot({ path: path.join(OUT_DIR, `inbox-phone-${engineName}.png`), fullPage: true })
          await page.close()
        }
      } finally { await browser.close() }
    }
    t('the Send presses posted the reply\'s English, its files and an idempotency key — and nothing posted \'send\' on its own', posts.filter(p => p.action === 'send').every(p => typeof p.english === 'string' && Array.isArray(p.attachments) && /^inbox:/.test(p.idempotency_key)) && posts.filter(p => p.action === 'send').length === 4)
  } finally { server.close() }
}
