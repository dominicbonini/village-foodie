#!/usr/bin/env node
// scripts/outreach-instant-send.cjs — Send is instant (held 5 s with Undo), and the SERVER still decides.
// docs/outreach-instant-send-report.md, 15 October 2026.
//
//   node scripts/outreach-instant-send.cjs      (no network, no database, no mailbox, no email)
//
// 🔴 THE METHOD. The outbox (lib/outreach-outbox.ts) runs on a fake clock. The REAL send route and the REAL
// Today route are bundled (scripts/_render-kit.cjs) and run against an in-memory database with real unique
// keys (scripts/_fake-pg.cjs). Only the edges are fakes: SMTP (a counter that can refuse or drop), IMAP (a
// mailbox that can be down), the admin check, and `runAfter` (collected so the after-send work can be awaited).
// Every guard, the contact log and the refusal recording are the code that runs in production.
// Each case passes on the real code AND FAILS on a broken variant with one plausible mistake patched in.

const path = require('path'); const fs = require('fs')
const kit = require('./_render-kit.cjs')({ cacheTag: 'outreach-instant-send' })
const { REPO } = kit
const { makeFakePg } = require('./_fake-pg.cjs')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const codeOf = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

process.env.SUPABASE_URL = 'http://127.0.0.1:9'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
process.env.OUTREACH_PRIMARY_USER = 'harness@hatchgrab.example'
process.env.OUTREACH_PRIMARY_PASSWORD = 'harness-password'
process.env.OUTREACH_TEST_RECIPIENT = 'me@hatchgrab.example'

// The real nodemailer, handed to the stub: composing the bytes (streamTransport) stays real.
globalThis.__realNodemailer = require(require.resolve('nodemailer', { paths: [REPO] }))
const STUBS = {
  '@/lib/auth/admin': `export async function verifyAdmin() { return true }`,
  // SMTP is a counter; composing the bytes (streamTransport) is the real nodemailer.
  'nodemailer': `const real = globalThis.__realNodemailer
const createTransport = (opts) => {
  if (opts && opts.streamTransport) return real.createTransport(opts)
  return {
    sendMail: async (m) => {
      const g = globalThis.__smtp
      if (g.fail) { const e = new Error(g.fail.message); e.responseCode = g.fail.code; e.code = g.fail.errno; throw e }
      g.sent.push(m)
      return { messageId: 'x' }
    },
    close() {},
  }
}
export default { createTransport }
export { createTransport }`,
  '@/lib/outreach-mail-box': `
export function sanitiseMailError(err) { return String((err && err.message) || err || 'error') }
export function makeImapClient() {
  return { connect: async () => { if (globalThis.__imap.down) throw new Error('IMAP is down') }, logout: async () => {} }
}
export async function findInSent() { return globalThis.__imap.filed ? { uid: 7, uidValidity: '1' } : null }
export async function appendToSent() { return { ok: true, uid: 8 } }
export async function fetchBodiesByUid() { return { html: null, text: null } }
export async function fetchMessageForView() { return { ok: false, error: 'not in harness' } }`,
  '@/lib/outreach-attachment-store': `export async function loadAttachments() { return { ok: true, attachments: [] } }`,
  '@/lib/outreach-after': `export function runAfter(label, work) { (globalThis.__after = globalThis.__after || []).push(work()) }`,
}

/* ─────────────────────────── A MADE-UP WORLD ─────────────────────────── */
const truck = (id, extra = {}) => ({ name: `Fixture ${id}`, contact_email: `owner@${id}.example`, hatchgrab_truck_id: null, show_on_vf: false, excluded: false, ...extra })
const prospect = (id, t, extra = {}) => ({ id, stage: 'not_contacted', do_not_contact: null, lead_type_at_first_contact: null, discovery_truck_id: `t-${id}`, hu_ordering: null, hu_map: null, discovery_trucks: t, ...extra })
const YESTERDAY = new Date(Date.now() - 86400000).toISOString()
function world() {
  const pg = makeFakePg({
    outreach_prospects: [
      prospect('p-ok', truck('ok')),
      prospect('p-dnc', truck('dnc'), { do_not_contact: true }),
      prospect('p-linked', truck('linked', { hatchgrab_truck_id: 'hg-1' })),
      prospect('p-noaddr', truck('noaddr', { contact_email: null })),
      prospect('p-again', truck('again'), { stage: 'contacted' }),
    ],
    discovery_trucks: [],
    outreach_contacts: [
      { id: 'c-1', prospect_id: 'p-again', contacted_at: YESTERDAY, created_at: YESTERDAY, direction: 'outbound', kind: '1_first_contact', channel: 'email', message: 'Hello again' },
    ],
    outreach_messages: [
      { id: 'm-1', prospect_id: 'p-again', direction: 'outbound', status: 'sent', is_test: false, source: 'system', message_id: '<m1@fixture>', in_reply_to: null, references: null,
        subject: 'Hello', from_address: 'dominic@hatchgrab.com', to_address: 'owner@again.example', message_date: YESTERDAY, created_at: YESTERDAY,
        html_body: '<div>Hello again</div>', text_body: 'Hello again', contact_id: 'c-1', sent_copy: 'server_filed', attempts: 1, idempotency_key: 'k-old', handled_at: null },
    ],
    outreach_settings: [], outreach_events: [],
  }, { keys: { outreach_messages: [['idempotency_key'], ['message_id']] } })
  globalThis.__harnessDb = pg
  globalThis.__smtp = { sent: [], fail: null }
  globalThis.__imap = { down: false, filed: true }
  globalThis.__after = []
  return pg
}

const DOC = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
let keyN = 0
const req = (prospectId, extra = {}) => ({
  action: 'send', prospect_id: prospectId, subject: 'Hello from the harness', kind: '1_first_contact',
  document: DOC('Hello there, this is a made-up email.'), is_test: false, idempotency_key: `k-${++keyN}`, include_quote: true, ...extra,
})

/* ─────────────────────────── THE ROUTES, AND THEIR BROKEN VARIANTS ─────────────────────────── */
const SEND_ENTRY = `export { POST, GET } from '@/app/api/admin/outreach/mail-send/route'`
const TODAY_ENTRY = `export { GET } from '@/app/api/admin/outreach/today/route'`
const ROUTE_F = 'app/api/admin/outreach/mail-send/route.ts'
const DELIVER_F = 'lib/outreach-mail-deliver.ts'
const VARIANTS = {
  // the idempotency key is neither checked nor stored — the double-click that sends twice
  noIdempotency: [
    { file: ROUTE_F, from: "  if (idempotencyKey) {\n    const { data: prior } = await supabase", to: "  if (false) {\n    const { data: prior } = await supabase" },
    { file: ROUTE_F, from: "    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),\n    ...(canStoreOverride", to: "    ...(canStoreOverride" },
  ],
  // a refusal answered but not recorded — the prospect is never flagged
  noRecord: [{ file: ROUTE_F, from: "    if (!(await messagesHaveRefusal())) {\n      // Before the migration", to: "    if (true) {\n      // Before the migration" }],
  // a guard skipped — do-not-contact no longer stops the send
  guardSkipped: [{ file: ROUTE_F, from: '  if (blocked) return await flagged(blocked.refusal)', to: '  if (false) return await flagged(blocked.refusal)' }],
  // a provider failure recorded as sent — nothing reaches Today
  failureAsSent: [{ file: DELIVER_F, from: '    const outcome = classifySendFailure(err)', to: "    const outcome = 'sent' as const" }],
  // a missing Sent copy treated as a failed send — the email no longer counts as sent
  copyFailsTheSend: [{ file: DELIVER_F, from: "    sent_copy: copy.sentCopy, mailbox: copy.mailbox, uid: copy.uid, uidvalidity: copy.uidvalidity,\n    // 🔴 A MISSING COPY NOW SAYS WHY.", to: "    ...(copy.sentCopy === 'absent' ? { status: 'failed' } : {}),\n    sent_copy: copy.sentCopy, mailbox: copy.mailbox, uid: copy.uid, uidvalidity: copy.uidvalidity,\n    // 🔴 A MISSING COPY NOW SAYS WHY." }],
  // the Sent copy back on the critical path — the answer waits for IMAP again
  copyBeforeAnswer: [{ file: ROUTE_F, from: "  runAfter('Sent copy and contact log', async () => {", to: "  await (async (f) => f())(async () => {" }],
}
const bundles = {}
async function sendRoute(v = 'real') {
  bundles[`send-${v}`] ??= await kit.bundle(`send-${v}`, SEND_ENTRY, { stubs: STUBS, patches: v === 'real' ? [] : VARIANTS[v] })
  return bundles[`send-${v}`]
}
async function todayRoute() { bundles.today ??= await kit.bundle('today', TODAY_ENTRY, { stubs: STUBS }); return bundles.today }

const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const URL_ = 'http://127.0.0.1:3999/api/admin/outreach/mail-send'
async function post(M, body) {
  const res = await kit.quietAsync(() => M.POST(new NextRequest(URL_, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })))
  const json = await res.json()
  await Promise.all(globalThis.__after); globalThis.__after = []
  return json
}
async function today() {
  const T = await todayRoute()
  const res = await kit.quietAsync(() => T.GET(new NextRequest('http://127.0.0.1:3999/api/admin/outreach/today')))
  return res.json()
}
const rows = (pg, pid) => pg.tables.outreach_messages.filter(m => m.prospect_id === pid)

/* ─────────────────────────── THE OUTBOX, ON A FAKE CLOCK ─────────────────────────── */
function clock() {
  let t = 0; const q = []
  return {
    setTimer: (fn, ms) => { const h = { fn, at: t + ms, live: true }; q.push(h); return h },
    clearTimer: h => { if (h) h.live = false },
    now: () => t,
    async advance(ms) {
      const end = t + ms
      for (;;) {
        const due = q.filter(h => h.live && h.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        t = due.at; due.live = false; await due.fn(); await new Promise(r => setImmediate(r))
      }
      t = end
    },
  }
}
const OUTBOX_VARIANTS = {
  postsAtOnce: [{ file: 'lib/outreach-outbox.ts', from: "      timers.set(entry.key, deps.setTimer(() => { void fire(entry.key) }, delay))", to: "      void Promise.resolve().then(() => fire(entry.key))" }],
  undoForgets: [{ file: 'lib/outreach-outbox.ts', from: "      if (h !== undefined) deps.clearTimer(h)\n      timers.delete(key)\n      entries = entries.filter(x => x.key !== key)", to: "      timers.delete(key)" }],
}
async function outboxLib(v = 'real') {
  bundles[`ob-${v}`] ??= await kit.bundle(`ob-${v}`, `export * from '@/lib/outreach-outbox'`, { patches: v === 'real' ? [] : OUTBOX_VARIANTS[v] })
  return bundles[`ob-${v}`]
}
function makeBox(O, postImpl) {
  const c = clock(); const posts = []
  const box = O.createOutbox({ post: async b => { posts.push(b); return postImpl ? postImpl(b) : { ok: true, status: 'sent', id: 'r1' } }, setTimer: c.setTimer, clearTimer: c.clearTimer, now: c.now, checksMs: [] })
  return { box, c, posts }
}
const ENTRY = (k = 'key-1') => ({ key: k, prospectId: 'p-ok', prospectName: 'Fixture ok', test: false, subject: 'Hello', to: 'owner@ok.example', request: { idempotency_key: k }, snapshot: { compose: { body: 'exactly this' }, replyTo: null } })

/* ─────────────────────────── THE CASES ─────────────────────────── */
const CASES = [
  {
    name: 'Send closes at once: the message is HELD, nothing is posted for 5 s, then posted once with its key',
    broken: ['outbox', 'postsAtOnce'],
    async run(v) {
      const { box, c, posts } = makeBox(await outboxLib(v))
      const e = box.queue(ENTRY())
      await new Promise(r => setImmediate(r))
      const heldAtOnce = e.phase === 'waiting' && posts.length === 0
      await c.advance(4_900)
      const stillHeld = posts.length === 0
      await c.advance(200)
      return { heldAtOnce, stillHeld, postedOnce: posts.length === 1 && posts[0].idempotency_key === 'key-1', settled: box.list()[0]?.phase === 'sent' }
    },
  },
  {
    name: 'Undo within 5 s sends nothing, and hands back exactly what was in the window',
    broken: ['outbox', 'undoForgets'],
    async run(v) {
      const { box, c, posts } = makeBox(await outboxLib(v))
      let restored = null
      box.onRestore(e => { restored = e })
      box.queue(ENTRY())
      await c.advance(3_000)
      const undone = box.undo('key-1')
      await c.advance(30_000)
      return { undone, nothingPosted: posts.length === 0, gone: box.list().length === 0,
        handedBack: restored?.snapshot?.compose?.body === 'exactly this' && box.peekRestore('p-ok') !== null }
    },
  },
  {
    name: 'the same idempotency key twice sends ONCE — the server refuses the repeat',
    broken: ['send', 'noIdempotency'],
    async run(v) {
      const M = await sendRoute(v); const pg = world()
      const body = req('p-ok', { idempotency_key: 'same-key' })
      const a = await post(M, body), b = await post(M, body)
      return { firstSent: a.ok === true && a.status === 'sent', secondIsDuplicate: b.duplicate === true,
        oneEmail: globalThis.__smtp.sent.length === 1, oneRow: rows(pg, 'p-ok').length === 1 }
    },
  },
  {
    name: 'a guard refusal (do-not-contact) sends nothing, and flags the prospect with the reason on Today',
    broken: ['send', 'noRecord'],
    async run(v) {
      const M = await sendRoute(v); const pg = world()
      const j = await post(M, req('p-dnc'))
      const t = await today()
      const flag = (t.problems ?? []).find(p => p.prospect_id === 'p-dnc')
      return { refused: j.ok === false && /do-not-contact|do not contact/i.test(String(j.refusal)),
        nothingSent: globalThis.__smtp.sent.length === 0,
        recorded: rows(pg, 'p-dnc').some(r => r.status === 'refused' && r.refusal?.request?.document),
        flaggedOnToday: !!flag && flag.status === 'refused' && /do-not-contact|do not contact/i.test(flag.last_error ?? '') }
    },
  },
  {
    name: 'a guard that ASKS is recorded with its sentences; "Send anyway" re-runs every guard and writes the same override',
    broken: ['send', 'noRecord'],
    async run(v) {
      const M = await sendRoute(v); const pg = world()
      // the first contact went yesterday; sending the first contact again is the guard that asks
      const j = await post(M, req('p-again', { kind: '1_first_contact', reply_to_message_id: undefined }))
      const refusedRow = rows(pg, 'p-again').find(r => r.status === 'refused')
      const asked = j.needsConfirm === true && Array.isArray(j.guards) && j.guards.length > 0
        && !!refusedRow && (refusedRow.refusal?.guards ?? []).length === j.guards.length && globalThis.__smtp.sent.length === 0
      if (!refusedRow) return { asked }
      const ids = refusedRow.refusal.guards.map(g => g.id)
      const k = await post(M, { action: 'send_refused', message_row_id: refusedRow.id, override: ids })
      const sentRow = rows(pg, 'p-again').find(r => r.idempotency_key === `${refusedRow.id}:anyway`)
      return { asked, sentAnyway: k.ok === true && k.status === 'sent' && globalThis.__smtp.sent.length === 1,
        overrideWritten: Array.isArray(sentRow?.guard_override) && sentRow.guard_override.map(g => g.id).join() === ids.join(),
        flagCleared: !!pg.tables.outreach_messages.find(r => r.id === refusedRow.id)?.handled_at }
    },
  },
  {
    name: 'a provider failure is recorded as not sent and flags the prospect on Today',
    broken: ['send', 'failureAsSent'],
    async run(v) {
      const M = await sendRoute(v); const pg = world()
      globalThis.__smtp.fail = { message: '550 mailbox unavailable', code: 550 }
      const j = await post(M, req('p-ok'))
      const t = await today()
      const flag = (t.problems ?? []).find(p => p.prospect_id === 'p-ok')
      return { notOk: j.ok === false, rowFailed: rows(pg, 'p-ok').some(r => r.status === 'failed'), flaggedOnToday: !!flag && flag.status === 'failed' }
    },
  },
  {
    name: 'a Sent-folder failure: the email still COUNTS AS SENT, the answer did not wait for it, and a notice says which step',
    broken: ['send', 'copyFailsTheSend'],
    async run(v) {
      const M = await sendRoute(v); const pg = world()
      globalThis.__imap.down = true
      const j = await post(M, req('p-ok'))
      const row = rows(pg, 'p-ok')[0]
      const O = await outboxLib()
      const R = await kit.bundle('refusal', `export * from '@/lib/outreach-refusal'`)
      const st = R.postSendState(row)
      return { answeredSent: j.ok === true && j.status === 'sent' && j.post_steps === 'after',
        rowSent: row?.status === 'sent' && row?.sent_copy === 'absent', loggedAsContact: !!row?.contact_id,
        notice: st.done && /not in your Sent folder/.test(st.notice ?? ''), outboxKnowsIt: !!O.verdictOf }
    },
  },
  {
    name: 'the answer returns before the Sent copy — it is NOT on the critical path',
    broken: ['send', 'copyBeforeAnswer'],
    async run(v) {
      const M = await sendRoute(v); world()
      globalThis.__imap.down = false
      const res = await kit.quietAsync(() => M.POST(new NextRequest(URL_, { method: 'POST', body: JSON.stringify(req('p-ok')), headers: { 'content-type': 'application/json' } })))
      const j = await res.json()
      const pendingAfter = (globalThis.__after ?? []).length
      await Promise.all(globalThis.__after); globalThis.__after = []
      return { answered: j.ok === true && j.sent_copy === 'pending', copyRanAfter: pendingAfter === 1 }
    },
  },
  {
    name: 'every guard still runs before the provider: do-not-contact, linked truck, no address, literal {{plans_pdf}}, malformed token',
    broken: ['send', 'guardSkipped'],
    async run(v) {
      const M = await sendRoute(v); world()
      const cases = [
        await post(M, req('p-dnc')),
        await post(M, req('p-linked')),
        await post(M, req('p-noaddr')),
        await post(M, req('p-ok', { document: DOC('Here is our {{plans_pdf}} for you') })),
        await post(M, req('p-ok', { subject: 'Hi {{truck name}}' })),
      ]
      return { allRefused: cases.every(j => j.ok === false), nothingSent: globalThis.__smtp.sent.length === 0 }
    },
  },
]

/* ─────────────────────────── RUN ─────────────────────────── */
;(async () => {
  let pass = 0, fail = 0
  const line = (good, label, detail) => { if (good) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  🔴 ${label}${detail ? `\n      ${detail}` : ''}`) } }
  for (const c of CASES) {
    let got
    try { got = await c.run('real') } catch (e) { line(false, c.name, e.stack?.split('\n').slice(0, 3).join(' | ')); continue }
    const bad = Object.entries(got).filter(([, x]) => !x).map(([k]) => k)
    line(bad.length === 0, c.name, bad.length ? `failed: ${bad.join(', ')}` : '')
    let caught
    try { const b = await c.run(c.broken[1]); caught = Object.values(b).some(x => !x) } catch { caught = true }
    line(caught, `   broken variant "${c.broken[1]}" fails it`, caught ? '' : 'the variant passed — this check cannot fail')
  }

  // ── the route's ORDER: every refusal and every guard is written above the provider call ──
  {
    const R = codeOf(read('app/api/admin/outreach/mail-send/route.ts'))
    const sendAt = R.indexOf('await sendRow(')
    const refusals = [...R.matchAll(/return await flagged\(/g)].map(m => m.index)
    const guardsAt = R.indexOf('firedGuards = evaluateGuards(')
    line(sendAt > 0 && refusals.length >= 15 && refusals.every(i => i < sendAt) && guardsAt > 0 && guardsAt < sendAt,
      `every recorded refusal (${refusals.length}) and the sequence guards are above the provider call in the route`)
    line(R.indexOf("runAfter('Sent copy and contact log'") > sendAt && R.lastIndexOf('logOutreachContact(') > sendAt /* the send path's; the first is log_only's */,
      '…and the Sent copy and the contact log run after it')
  }

  // ── the screens: Send closes the window; Undo and the tab-close rule; the timeline's "Sending…" ──
  const CW = codeOf(read('components/admin/ComposeWindow.tsx'))
  const WS = codeOf(read('components/admin/ProspectWorkspace.tsx'))
  const send = CW.slice(CW.indexOf('const sendNow = useCallback('), CW.indexOf('\n  const ', CW.indexOf('const sendNow = useCallback(') + 10))
  line(/getOutbox\(\)\.queue\(/.test(send) && /onQueued\?\.\(snapshot/.test(send) && !/await|fetch\(/.test(send),
    'Send hands the message to the outbox and closes the window at once — no await, no request in the window')
  line(/const key = crypto\.randomUUID\(\)/.test(send) && /idempotency_key: key/.test(send), '…with the idempotency key made at the press')
  line(/onQueued=\{\(\) => \{ setDirty\(false\); setReplyTarget\(null\); setComposeRestore\(null\); setComposeKey\(k => k \+ 1\) \}\}/.test(WS),
    'the page drops the window on Send (a fresh one replaces it)')
  line(/getOutbox\(\)\.onRestore\(/.test(WS) && /setComposeRestore\(snap\.compose\)/.test(WS) && /restore=\{composeRestore\}/.test(WS),
    'Undo re-opens the window from the snapshot')
  line(/pending=\{pendingSends\}/.test(WS) && /data-sending/.test(read('components/admin/ProspectTimeline.tsx')), 'the history shows a held send as "Sending…"')
  line(/window\.setTimeout\(fn, ms\)/.test(read('components/admin/OutboxToasts.tsx')) && !/sendBeacon|keepalive/.test(read('components/admin/OutboxToasts.tsx')),
    'the hold is a page timer: closing the tab inside 5 s sends nothing (no beacon, no keepalive)')

  delete globalThis.__harnessDb
  console.log('')
  if (fail) { console.log(`🔴 ${fail} FAILED of ${pass + fail}`); process.exit(1) }
  console.log(`✅ all ${pass} passed`)
})().catch(e => { console.error(e); process.exit(1) })
