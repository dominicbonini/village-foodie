#!/usr/bin/env node
// scripts/partners-1.cjs — Admin › Partners (partners-1, 5 November 2026): the proof.
//   node scripts/partners-1.cjs        (≈ 20 s: one compile, a fake database, one WebKit page; NO NETWORK, NO MAILBOX)
//
// 🔴 WHAT A FAILURE WOULD MEAN, worst first:
//   • a partner's reply filed to a PROSPECT (or a prospect's to a partner), or an address that is both guessed;
//   • a partner email showing up in truck Today or truck counts;
//   • an email sent to an address on the do-not-contact list;
//   • the free-form composer offering templates, snippets, a sequence step, the plans PDF — or sending to the truck route;
//   • a status that moved by itself other than the two allowed moves, or a status change that left no trace;
//   • partners-add.cjs inserting a duplicate.
// 🔴 NO REAL EMAIL, NO REAL ROW. The libs run against an in-memory table; the composer's fetch is stubbed (a POST is
// captured, never sent); the Today route runs against fixtures with its Supabase client replaced.
//
//   A · add / edit                 B · status changes are logged        C · the two automatic moves
//   D · the Due filter and sort    E · reply matching (prospect / partner / both / neither) and the poll's handling
//   F · do-not-contact             G · free-form compose (rendered)     H · partners-add dedupe
//   I · truck outreach unchanged (Today before/after with fixtures, counts, a census of every outreach_messages read)
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, headWorktree, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const check = (ok, label, detail) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) { fails++; if (detail !== undefined) console.log(`      ${JSON.stringify(detail).slice(0, 500)}`) } }
const eq = (got, want, label) => check(JSON.stringify(got) === JSON.stringify(want), label, { want, got })
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

/** The commit before partners-1 — "before" for every before/after comparison. */
const BEFORE = 'b5a43927'

const { out, req } = compile(REPO, ['lib/partners.ts', 'lib/outreach-mail-poll-rules.ts', 'lib/partner-mail-poll.ts'], 'partners-1')
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
const P = req('lib/partners.js')
const R = req('lib/outreach-mail-poll-rules.js')
const PM = req('lib/partner-mail-poll.js')

// ── A FAKE SUPABASE: tables in memory, the query-builder surface the code uses, real uniqueness on message_id ──
function fakeDb(seed = {}) {
  const tables = {}
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map(r => ({ ...r }))
  let n = 0
  const T = t => (tables[t] = tables[t] || [])
  const match = (row, f) => {
    const [op, c, v] = f
    if (op === 'eq') return row[c] === v
    if (op === 'neq') return row[c] !== v
    if (op === 'is') return v === null ? row[c] == null : row[c] === v
    if (op === 'notnull') return row[c] != null
    if (op === 'in') return v.includes(row[c])
    if (op === 'lt') return row[c] < v
    return true
  }
  const db = {
    tables,
    from(table) {
      const q = { op: 'select', filters: [], payload: null, cols: null, ignoreDup: false, lim: null, order: null, one: null, ret: false }
      const b = {
        select(cols) { if (q.op === 'select') q.cols = cols; else q.ret = true; return b },
        insert(v) { q.op = 'insert'; q.payload = v; return b },
        upsert(v, o) { q.op = 'upsert'; q.payload = v; q.ignoreDup = !!(o && o.ignoreDuplicates); return b },
        update(v) { q.op = 'update'; q.payload = v; return b },
        eq(c, v) { q.filters.push(['eq', c, v]); return b },
        neq(c, v) { q.filters.push(['neq', c, v]); return b },
        is(c, v) { q.filters.push(['is', c, v]); return b },
        not(c, o, v) { if (o === 'is' && v === null) q.filters.push(['notnull', c]); return b },
        in(c, v) { q.filters.push(['in', c, v]); return b },
        lt(c, v) { q.filters.push(['lt', c, v]); return b },
        order(c, o) { q.order = [c, !(o && o.ascending === false)]; return b },
        limit(k) { q.lim = k; return b },
        maybeSingle() { q.one = 'maybe'; return b },
        single() { q.one = 'single'; return b },
        then(res, rej) { return Promise.resolve(run()).then(res, rej) },
      }
      const run = () => {
        const rows = T(table)
        if (q.op === 'insert' || q.op === 'upsert') {
          const list = Array.isArray(q.payload) ? q.payload : [q.payload]
          const made = []
          for (const r of list) {
            if (r.message_id && rows.some(x => x.message_id === r.message_id)) {
              if (q.op === 'upsert' && q.ignoreDup) continue
              return { data: null, error: { code: '23505', message: 'duplicate message_id' } }
            }
            const row = { id: `${table}-${++n}`, created_at: new Date(Date.now() + n).toISOString(), ...r }
            rows.push(row); made.push(row)
          }
          const data = q.one ? made[0] ?? null : made
          return { data, error: null }
        }
        let hit = rows.filter(r => q.filters.every(f => match(r, f)))
        if (q.op === 'update') {
          for (const r of hit) Object.assign(r, q.payload)
          return { data: q.ret ? hit.map(r => ({ ...r })) : null, error: null }
        }
        if (q.order) { const [c, asc] = q.order; hit = [...hit].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : 1) * (asc ? 1 : -1)) }
        if (q.lim != null) hit = hit.slice(0, q.lim)
        if (q.one) return { data: hit[0] ? { ...hit[0] } : null, error: null }
        return { data: hit.map(r => ({ ...r })), error: null }
      }
      return b
    },
  }
  return db
}

async function main() {
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nA · add / edit a partner')
{
  const ok = P.validatePartnerPatch({ name: '  NCASS  ', type: 'association', country_code: 'gb', email: 'Hello@NCASS.org.uk ', priority: 'high', notes: 'met at the trade show' }, { creating: true })
  check(ok.ok && ok.patch.name === 'NCASS' && ok.patch.country_code === 'GB' && ok.patch.type === 'association' && ok.patch.priority === 'high', 'Add: name trimmed, country upper-cased, type and priority kept', ok)
  check(!P.validatePartnerPatch({ type: 'association' }, { creating: true }).ok, 'Add without a name is refused')
  check(!P.validatePartnerPatch({ name: 'X', email: 'not-an-email' }).ok, 'a bad email is refused, not saved')
  check(!P.validatePartnerPatch({ name: 'X', type: 'charity' }).ok, 'an unknown type is refused')
  check(!P.validatePartnerPatch({ country_code: 'GBR' }).ok, 'a three-letter country is refused')
  check(!P.validatePartnerPatch({ next_follow_up_on: '12/11/2026' }).ok, 'a follow-up that is not YYYY-MM-DD is refused')
  const edit = P.validatePartnerPatch({ contact_role: 'Events lead', website: '' })
  eq(edit.ok && edit.patch, { website: null, contact_role: 'Events lead' }, 'Edit: only the keys sent are written; a blank becomes null')
  check(!P.validatePartnerPatch({ status: 'partner' }).ok, 'Edit refuses a `status` key — a status change must go through the logged path')
  eq(Object.keys(P.validatePartnerPatch({ id: 'x', created_at: 'y', last_reply_at: 'z', name: 'Y' }).patch), ['name'], 'unknown and system columns are dropped')
  const route = read('app/api/admin/partners/route.ts')
  check(/action === 'create'[\s\S]*validatePartnerPatch\(fields, \{ creating: true \}\)[\s\S]*from\('partner_orgs'\)\.insert/.test(route), 'the route creates through validatePartnerPatch, into partner_orgs')
  check(/action === 'update'[\s\S]*validatePartnerPatch\(/.test(route) && /23505[\s\S]*already has that email/.test(route), 'the route edits through the same validation, and a duplicate email is answered in words')
}

console.log('\nB · every status change is logged')
{
  const sc = P.statusChange('contacted', 'in_talks')
  eq(sc.ok && sc.change, { to: 'in_talks', event: { kind: 'status', from_status: 'contacted', to_status: 'in_talks' } }, 'a manual change produces its partner_events row')
  eq(P.statusChange('partner', 'partner'), { ok: true, change: null }, 'choosing the same status changes nothing and logs nothing')
  check(!P.statusChange('partner', 'won').ok, 'an unknown status is refused')
  const route = read('app/api/admin/partners/route.ts')
  const block = route.slice(route.indexOf("action === 'status'"), route.indexOf("action === 'note'"))
  check(/\.eq\('status', from\)/.test(block) && /from\('partner_events'\)\.insert\(\{ partner_id: id, \.\.\.sc\.change\.event \}\)/.test(block), 'the status action updates only from the status it read, then inserts the event')
}


console.log('\nC · the two automatic moves, and only those')
{
  const S = P.PARTNER_STATUSES
  eq(S.map(s => P.autoStatusOnSend(s)), ['contacted', null, null, null, null, null], 'first email sent: to_contact → contacted; every other status stays')
  eq(S.map(s => P.autoStatusOnReply(s)), [null, 'replied', null, null, null, null], 'reply received: contacted → replied; every other status stays')
  const db = fakeDb({ partner_orgs: S.map(s => ({ id: `p-${s}`, status: s })) })
  for (const s of S) await PM.applyPartnerAutoStatus(db, `p-${s}`, 'send', { last_contacted_at: '2026-11-05T10:00:00Z' })
  eq(db.tables.partner_orgs.map(r => r.status), ['contacted', 'contacted', 'replied', 'in_talks', 'partner', 'not_now'], 'on a send (fake table): only to_contact moved')
  eq(db.tables.partner_events, [{ id: db.tables.partner_events[0]?.id, created_at: db.tables.partner_events[0]?.created_at, partner_id: 'p-to_contact', kind: 'status', from_status: 'to_contact', to_status: 'contacted' }],
    '…and exactly one partner_events row records it')
  check(db.tables.partner_orgs.every(r => r.last_contacted_at === '2026-11-05T10:00:00Z'), '…while last_contacted_at is set on every partner emailed, whatever its status')
  const db2 = fakeDb({ partner_orgs: S.map(s => ({ id: `p-${s}`, status: s })) })
  for (const s of S) await PM.applyPartnerAutoStatus(db2, `p-${s}`, 'reply', { last_reply_at: '2026-11-05T11:00:00Z' })
  eq(db2.tables.partner_orgs.map(r => r.status), ['to_contact', 'replied', 'replied', 'in_talks', 'partner', 'not_now'], 'on a reply: only contacted moved')
  eq((db2.tables.partner_events || []).map(e => `${e.from_status}→${e.to_status}`), ['contacted→replied'], '…logged once')
  const send = read('app/api/admin/partners/mail-send/route.ts')
  check(/if \(!isTest\) await applyPartnerAutoStatus\(supabase, partnerId, 'send'/.test(send), 'the send route moves the status only after a REAL (non-test) send the server accepted')
  check(send.indexOf("applyPartnerAutoStatus(supabase, partnerId, 'send'") > send.indexOf("if (sent.result.status !== 'sent' || !sent.raw) return"), '…placed after the not-sent early return')
}

console.log('\nD · the Due filter and the sort')
{
  const today = '2026-11-05'
  const mk = (id, d, pr, extra = {}) => ({ id, name: id, type: 'association', country_code: 'GB', status: 'to_contact', priority: pr, next_follow_up_on: d,
    region: null, website: null, contact_name: null, contact_role: null, email: null, phone: null, linkedin_url: null, source: null, offered: null, outcome: null, notes: null, ...extra })
  const rows = [mk('future', '2026-11-06', 'high'), mk('none', null, 'high'), mk('today-low', today, 'low'), mk('overdue', '2026-10-30', 'medium'),
    mk('today-high', today, 'high'), mk('ie', '2026-11-01', 'low', { country_code: 'IE', type: 'press', status: 'contacted' })]
  eq(rows.filter(r => P.isDue(r, today)).map(r => r.id), ['today-low', 'overdue', 'today-high', 'ie'], 'Due = follow-up today or overdue; a future date and no date are not due')
  eq(P.filterPartners(rows, {}, today).map(r => r.id), ['overdue', 'ie', 'today-high', 'today-low', 'future', 'none'], 'sorted by follow-up date, then priority (no date last)')
  eq(P.filterPartners(rows, { dueOnly: true }, today).map(r => r.id), ['overdue', 'ie', 'today-high', 'today-low'], 'the Due filter')
  eq(P.filterPartners(rows, { country: 'IE' }, today).map(r => r.id), ['ie'], 'the country filter')
  eq(P.filterPartners(rows, { type: 'press', status: 'contacted' }, today).map(r => r.id), ['ie'], 'the type and status filters together')
  eq(P.filterPartners(rows, { q: 'OVERDUE' }, today).map(r => r.id), ['overdue'], 'search is case-insensitive')
  eq(P.londonToday(new Date('2026-11-05T23:30:00Z')), '2026-11-05', '"today" is the London calendar date (23:30 UTC in November is still the 5th)')
  eq(P.londonToday(new Date('2026-07-05T23:30:00Z')), '2026-07-06', '…and in summer time 23:30 UTC is already the next day in London')
}

console.log('\nE · reply matching — prospect / partner / both / neither')
{
  const H = (from, irt = null) => ({ get: n => (n === 'in-reply-to' ? irt : null), fromAddress: from })
  const byMsg = new Map([['<p-msg@hg>', 'prospect-1']])
  const byAddr = new Map([['owner@truck.example', ['prospect-1']], ['shared@both.example', ['prospect-2']], ['chain@x.example', ['prospect-3', 'prospect-4']]])
  const partners = { byMessageId: new Map([['<partner-msg@hg>', 'partner-1']]), byAddress: new Map([['events@assoc.example', 'partner-1'], ['shared@both.example', 'partner-2'], ['chain@x.example', 'partner-3']]) }
  const m = (h) => R.matchIncomingWithPartners(h, byMsg, byAddr, partners)
  eq(m(H('Owner@Truck.example')), { kind: 'address', prospectId: 'prospect-1' }, "a reply from a prospect's address files to that prospect (as before)")
  eq(m(H('EVENTS@assoc.example')), { kind: 'partner', partnerId: 'partner-1', via: 'address' }, "a reply from a partner's address files to the partner (case-insensitive)")
  eq(m(H('shared@both.example')), { kind: 'both', partnerId: 'partner-2', address: 'shared@both.example' }, 'an address that is BOTH a prospect\'s and a partner\'s goes to neither — `both`, flagged')
  eq(m(H('chain@x.example')).kind, 'both', '…also when it is shared by two prospects and a partner')
  eq(m(H('stranger@nowhere.example')), { kind: 'none' }, 'an address that is neither: unmatched, as before')
  eq(m(H('shared@both.example', '<p-msg@hg>')), { kind: 'thread', prospectId: 'prospect-1' }, "a reply IN a prospect's thread still files to the prospect (thread ids are certain, and checked first, as before)")
  eq(m(H('someone@else.example', '<partner-msg@hg>')), { kind: 'partner', partnerId: 'partner-1', via: 'thread' }, "a reply in a partner's thread files to the partner")
  // 🔴 EQUIVALENCE: with no partners the answer is EXACTLY the old matchIncoming's, over a grid of cases.
  let same = 0, total = 0
  for (const from of ['owner@truck.example', 'chain@x.example', 'shared@both.example', 'nobody@x.example', '', null])
    for (const irt of [null, '<p-msg@hg>', '<unknown@x>']) {
      total++
      if (JSON.stringify(R.matchIncomingWithPartners(H(from, irt), byMsg, byAddr, R.EMPTY_PARTNERS)) === JSON.stringify(R.matchIncoming(H(from, irt), byMsg, byAddr))) same++
    }
  check(same === total, `with no partners, matchIncomingWithPartners === matchIncoming on all ${total} cases (truck matching unchanged)`, { same, total })
  let sameOut = 0, totalOut = 0
  for (const to of [['owner@truck.example'], ['chain@x.example'], ['nobody@x.example'], ['owner@truck.example', 'shared@both.example'], []]) {
    totalOut++
    if (JSON.stringify(R.matchOutgoingWithPartners(to, byAddr, R.EMPTY_PARTNERS)) === JSON.stringify(R.matchOutgoing(to, byAddr))) sameOut++
  }
  check(sameOut === totalOut, `…and matchOutgoingWithPartners === matchOutgoing on all ${totalOut} Outlook-sent cases`)
  eq(R.matchOutgoingWithPartners(['events@assoc.example'], byAddr, partners), { kind: 'partner', partnerId: 'partner-1', via: 'address' }, 'mail sent from Outlook to a partner is the partner\'s')
  eq(R.matchOutgoingWithPartners(['shared@both.example'], byAddr, partners).kind, 'both', '…and to an address in both: neither, flagged')

  // The poll's handling of each answer (source census over lib/outreach-mail-poll.ts).
  const poll = read('lib/outreach-mail-poll.ts')
  const inc = poll.slice(poll.indexOf('addPartnerMatch('), poll.indexOf("if (match.kind === 'none') { summary.unmatched++; return }"))
  check(/match\.kind === 'both'[\s\S]{0,400}summary\.prospectAndPartner\.push\([\s\S]{0,200}return/.test(inc) && !/insertMessageOnce|handleReply|recordPartner/.test(inc.slice(0, inc.indexOf("match.kind === 'partner'"))),
    'the poll: `both` is pushed onto the flagged list and returns before anything is written')
  check(/match\.kind === 'partner'[\s\S]{0,200}handlePartnerIncoming/.test(inc), 'the poll: `partner` goes to the partner handler (never to handleReply / logOutreachContact)')
  check(/prospectAndPartner\?\.length[\s\S]{0,300}data-flagged-both/.test(read('components/admin/OutreachPanel.tsx')), "the flagged list is shown where unmatched/ambiguous mail is reported (Check for replies now), only when non-empty")
  const hp = poll.slice(poll.indexOf('async function handlePartnerIncoming'), poll.indexOf('// ── ADOPTING'))
  check(!/logOutreachContact|outreach_contacts/.test(hp) && !/logOutreachContact|outreach_contacts|prospect_id/.test(read('lib/partner-mail-poll.ts').replace(/\/\/.*$/gm, '')), 'a partner message never writes the prospect ladder (no outreach_contacts, no prospect_id)')
  check(/row\.prospect_id && shouldAutoRetry\(row, now\)/.test(poll), 'housekeeping never auto-retries a partner send (Retry is manual)')

  // recordPartnerIncoming on the fake table: the row, the status move, idempotency, an auto-reply.
  const db = fakeDb({ partner_orgs: [{ id: 'partner-1', status: 'contacted' }], outreach_messages: [] })
  const dir = { byMessageId: new Map(), byAddress: new Map([['events@assoc.example', 'partner-1']]) }
  const seen = { uid: 7, messageId: '<reply-1@assoc>', subject: 'Re: hello', from: ['events@assoc.example'], to: ['dominic@hatchgrab.com'], date: '2026-11-05T09:00:00Z' }
  const r1 = await PM.recordPartnerIncoming(db, dir, seen, 'INBOX', 'dominic', 'partner-1', 'reply', { html: '<p>Yes please</p>', text: 'Yes please', attachments: [], truncated: false })
  const row = db.tables.outreach_messages[0]
  check(r1.created && row.partner_id === 'partner-1' && row.prospect_id === undefined && row.direction === 'inbound' && row.status === 'received' && !!row.handled_at,
    'a partner reply: one outreach_messages row with partner_id, no prospect_id, inbound/received, handled_at set (never truck Today work)', row)
  check(db.tables.partner_orgs[0].status === 'replied' && db.tables.partner_orgs[0].last_reply_at === '2026-11-05T09:00:00Z', '…the status moves contacted → replied and last_reply_at is set')
  const r2 = await PM.recordPartnerIncoming(db, dir, seen, 'INBOX', 'dominic', 'partner-1', 'reply', null)
  check(!r2.created && db.tables.outreach_messages.length === 1 && db.tables.partner_events.length === 1, 'the same reply seen again: nothing written, nothing logged twice')
  const db3 = fakeDb({ partner_orgs: [{ id: 'partner-1', status: 'contacted' }] })
  await PM.recordPartnerIncoming(db3, dir, { ...seen, messageId: '<ooo@assoc>' }, 'INBOX', 'dominic', 'partner-1', 'auto_reply', null)
  check(db3.tables.outreach_messages[0].status === 'auto_reply' && db3.tables.partner_orgs[0].status === 'contacted' && !db3.tables.partner_events, 'an out-of-office is recorded and moves nothing')
}

console.log('\nF · do-not-contact is honoured')
{
  const dnc = new Set(['blocked@truck.example'])
  check(P.partnerSendRefusal({ partner: { email: 'blocked@truck.example' }, to: 'Blocked@Truck.example', dncAddresses: dnc, isTest: false }) !== null, 'a partner whose address is on the do-not-contact list is refused (case-insensitive)')
  check(P.partnerSendRefusal({ partner: { email: 'events@assoc.example' }, to: 'blocked@truck.example', dncAddresses: dnc, isTest: false }) !== null, 'a reply to an address on the list is refused even when the partner\'s own address is fine')
  check(P.partnerSendRefusal({ partner: { email: 'blocked@truck.example' }, to: 'events@assoc.example', dncAddresses: dnc, isTest: false }) !== null, 'a partner whose own address is listed is refused whatever the To')
  check(P.partnerSendRefusal({ partner: { email: 'events@assoc.example' }, to: 'events@assoc.example', dncAddresses: dnc, isTest: false }) === null, 'an address not on the list may be emailed')
  check(P.partnerSendRefusal({ partner: { email: null }, to: '', dncAddresses: dnc, isTest: false }) !== null, 'no address: refused')
  const send = read('app/api/admin/partners/mail-send/route.ts')
  const sendBlock = send.slice(send.indexOf("if (action !== 'send')"))
  check(/from\('outreach_prospects'\)[\s\S]{0,120}\.eq\('do_not_contact', true\)/.test(send), 'the list is the existing one: outreach_prospects.do_not_contact, read server-side')
  check(sendBlock.indexOf('partnerSendRefusal(') > 0 && sendBlock.indexOf('partnerSendRefusal(') < sendBlock.indexOf(".from('outreach_messages').insert("), 'the refusal runs BEFORE the row is inserted and before the mail server is contacted')
  check(/if \(!dnc\.ok\) return refuse\('The do-not-contact list could not be read, so nothing was sent\.'\)/.test(sendBlock), 'an unreadable list refuses (it never sends on an empty read)')
}

console.log('\nG · free-form compose: no templates, snippets, sequences, screenshots, logo or demo links')
{
  const send = read('app/api/admin/partners/mail-send/route.ts')
  const imports = send.split('\n').filter(l => /^import /.test(l)).join('\n')
  check(!/outreach-template-render|outreach-snippets|outreach-sequence|outreach-step|outreach-contact-log|plans-pdf|demo|logo|screenshot/i.test(imports), 'the partner route imports no template, snippet, sequence, step, contact-log, plans-PDF, demo, logo or screenshot module')
  check(/from '@\/lib\/outreach-mail-deliver'/.test(imports) && /buildMessage/.test(imports) && /accountForSend/.test(imports) && /readFromName/.test(imports), '…and sends through the outreach machinery: the same builder, account, display name and deliver functions')
  check(read('components/admin/partner-outbox.ts').includes("fetch('/api/admin/partners/mail-send'") && !read('components/admin/partner-outbox.ts').includes('/api/admin/outreach/mail-send'), 'the partner outbox posts only to the partner route')
  await composeRender()
}

console.log('\nH · partners-add.cjs dedupes')
{
  const existing = [{ name: 'NCASS', country_code: 'GB', email: 'info@ncass.org.uk' }, { name: 'Street Food Ireland', country_code: 'IE', email: null }]
  const plan = P.planBulkAdd(existing, [
    { name: 'NCASS (dup by email)', country_code: 'GB', email: 'INFO@ncass.org.uk ' },
    { name: 'street food ireland', country_code: 'ie' },
    { name: 'Street Food Ireland', country_code: 'GB' },
    { name: 'New Assoc', country_code: 'GB', email: 'hello@new.example', type: 'association', status: 'partner' },
    { name: 'New Assoc again', email: 'hello@NEW.example' },
    { name: '', email: 'x@y.example' },
    { name: 'Bad', email: 'nope' },
  ])
  eq(plan.add.map(a => a.name), ['Street Food Ireland', 'New Assoc'], 'adds only rows whose email and name+country are both new')
  eq(plan.skipped.map(s => s.reason), ['email info@ncass.org.uk already present', 'street food ireland (IE) already present', 'email hello@new.example already present'],
    'skips a duplicate email (case-insensitive), a duplicate name+country, and a duplicate earlier in the same file')
  eq(plan.invalid.map(i => i.row), [6, 7], 'an invalid row (no name, a bad email) is listed, not inserted')
  check(!('status' in plan.add[1]), 'a `status` in the file is ignored — every new row starts at to_contact')
  const script = read('scripts/partners-add.cjs')
  check(/planBulkAdd/.test(script) && /--apply/.test(script) && /DRY RUN/.test(script), 'the script uses the same planBulkAdd, and writes only with --apply (a dry run by default)')
  check(!/\.update\(|\.delete\(|\.upsert\(/.test(script), '…and never updates, upserts or deletes')
}

console.log('\nI · truck outreach unchanged')
await truckUnchanged()
}

// ── G · the REAL ComposeWindow, bundled for WebKit, every fetch stubbed ─────────────────────────────────────
async function composeRender() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'partners-1-compose-'))
  fs.writeFileSync(path.join(tmp, 'entry.tsx'), `
import React from 'react'
import { createRoot } from 'react-dom/client'
import ComposeWindow from '@/components/admin/ComposeWindow'
const MODE = (window as unknown as { MODE: string }).MODE
const W = window as unknown as { POSTS: { url: string; body: unknown }[] }
W.POSTS = []
if (typeof crypto.randomUUID !== 'function') {
  (crypto as unknown as { randomUUID: () => string }).randomUUID = () => 'ffffffff-ffff-4fff-8fff-000000000001'
}
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === 'string' ? input : (input as Request).url ?? input)
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
  if (url.includes('/outreach/settings')) return json({ ok: true, signature: { lines: [{ text: 'Kind regards,' }, { text: '' }, { text: 'Dominic Bonini', bold: true }] }, optOut: { text: 'Reply no thanks and I will not contact you again.' } })
  if ((init?.method ?? 'GET').toUpperCase() === 'POST') { W.POSTS.push({ url, body: JSON.parse(String(init?.body ?? '{}')) }); return json({ ok: true, id: 'row-1', status: 'sent' }) }
  return json({ ok: true, thread: null, messages: [] })
}) as typeof window.fetch
const TPL = { id: 'fixture', label: 'Fixture template', channel: 'email' as const, subject: 'Hi', body: 'Hello {{signature}}', sortOrder: 1, active: true }
createRoot(document.getElementById('root')!).render(<div style={{ padding: 16, width: 900 }}>
  {MODE === 'partner'
    ? <ComposeWindow inline partner={{ id: 'partner-1' }} truckName="NCASS" prospectId="" toEmail="events@assoc.example" contactName="Sam"
        offerable={[]} suggestedId={null} ctx={{} as never} whatsappConfirmed templatesLoaded logFormKind="" hideCopyAndLog
        onClose={() => {}} onLog={async () => false} />
    : <ComposeWindow inline truckName="Fixture Burgers" prospectId="00000000-0000-0000-0000-000000000001" toEmail="george@example.invalid"
        offerable={[TPL] as never} suggestedId={null} ctx={{ truckName: 'Fixture Burgers' } as never} whatsappConfirmed={false}
        templatesLoaded logFormKind="1_first_contact" onClose={() => {}} onLog={async () => true} />}
</div>)
`)
  await esbuild.build({ entryPoints: [path.join(tmp, 'entry.tsx')], bundle: true, format: 'iife', jsx: 'automatic', outfile: path.join(tmp, 'bundle.js'),
    absWorkingDir: REPO, alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning', banner: { js: 'var process = { env: { NODE_ENV: "production" } };' } })
  const js = fs.readFileSync(path.join(tmp, 'bundle.js'), 'utf8')
  const page = mode => `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script>window.MODE=${JSON.stringify(mode)}</script><script>${js}</script></body></html>`
  const b = await webkit.launch()
  try {
    const open = async mode => {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } })
      const p = await ctx.newPage()
      const errors = []; p.on('pageerror', e => errors.push(e.message))
      await p.setContent(page(mode), { waitUntil: 'load' })
      await p.waitForFunction(() => /Dominic Bonini/.test(document.querySelector('.ProseMirror')?.innerHTML ?? '') || document.body.innerText.includes('Template'), undefined, { timeout: 15000 })
      await p.waitForTimeout(400)
      return { ctx, p, errors }
    }
    const scan = p => p.evaluate(() => {
      const btn = l => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === l)
      return { text: document.body.innerText, blank: !!btn('Blank'), plans: !!btn('Plans PDF'), attach: !!btn('Attach file'),
        send: btn('Send') ? btn('Send').disabled : null, sig: /Dominic Bonini/.test(document.querySelector('.ProseMirror')?.innerHTML ?? ''),
        subject: !!document.querySelector('input[type="text"]') }
    })
    // Default (truck) mode: unchanged — the template chips and Plans PDF are there.
    const t = await open('truck')
    const ts = await scan(t.p)
    check(ts.blank && /Template/.test(ts.text) && ts.plans, 'DEFAULT mode (no `partner`): the Template chips and the Plans PDF button are there, as before')
    await t.ctx.close()
    // Partner mode.
    const f = await open('partner')
    const fs1 = await scan(f.p)
    check(!fs1.blank && !/\bTemplate\b/.test(fs1.text) && !/snippet/i.test(fs1.text), 'FREE-FORM mode: no Template chips, no template/snippet wording')
    check(!fs1.plans && fs1.attach, '…no Plans PDF button; Attach file is there')
    check(!/demo link|screenshot|logo|Chase|First contact|sequence/i.test(fs1.text), '…no demo link, screenshot, logo or sequence-step wording', fs1.text.slice(0, 400))
    check(fs1.sig && fs1.subject && /events@assoc\.example|Sam/.test(fs1.text), '…To prefilled, a Subject box, and the normal signature already in the body')
    const OPT = JSON.parse(read('messages/en-GB.json')).outreach.optOut
    check(fs1.send === false && !fs1.text.includes(OPT.missing) && !fs1.text.includes(OPT.notSetUp), '…Send is enabled without an opt-out line, and no opt-out block is shown (a partner is not a prospect)', { send: fs1.send })
    // Type a subject and a line, press Send → confirm, wait out the 5-second Undo hold; the stub captures the POST.
    await f.p.fill('input[type="text"]', 'Partnership idea')
    await f.p.click('.ProseMirror'); await f.p.keyboard.press('Meta+ArrowUp'); await f.p.keyboard.type('Hi Sam, a quick idea for your members.')
    await f.p.locator('button', { hasText: /^Send$/ }).click()
    await f.p.locator('button', { hasText: /^Send it$/ }).click()
    await f.p.waitForFunction(() => (window.POSTS || []).length > 0, undefined, { timeout: 9000 })
    const posts = await f.p.evaluate(() => window.POSTS)
    const post = posts[0] || {}
    const keys = Object.keys(post.body || {}).sort()
    check(post.url === '/api/admin/partners/mail-send', 'Send posts to /api/admin/partners/mail-send (never the truck route)', post.url)
    check(post.body && post.body.partner_id === 'partner-1' && post.body.action === 'send' && post.body.is_test === false && post.body.subject === 'Partnership idea', '…with partner_id, the subject, and is_test false', post.body)
    check(!keys.some(k => ['prospect_id', 'kind', 'override', 'template_id', 'snippets'].includes(k)), '…and no prospect_id, kind (sequence step), override or template field', keys)
    check(JSON.stringify(post.body.document).includes('a quick idea for your members') && JSON.stringify(post.body.document).includes('Dominic Bonini'), '…the document carries what was typed AND the signature')
    check(!f.errors.length, 'no page error', f.errors)
    await f.ctx.close()
  } finally { await b.close(); fs.rmSync(tmp, { recursive: true, force: true }) }
}

// ── I · the Today route BEFORE (pre-partners commit) and AFTER, against fixtures ────────────────────────────
async function truckUnchanged() {
  const Module = require('module')
  const runRoute = async (root, tag, db) => {
    const { req: rq } = compile(root, ['app/api/admin/outreach/today/route.ts'], tag)
    const realLoad = Module._load
    Module._load = function (r, ...rest) {
      // The Supabase package is replaced WHOLESALE: every export is a factory returning the in-memory fake, so the
      // route under test cannot build a real client or reach the network (and this file names no client constructor).
      if (r === '@supabase/supabase-js') return new Proxy({}, { get: () => () => db })
      if (/lib[\\/]auth[\\/]admin(\.js)?$/.test(r) || r === '@/lib/auth/admin') return { verifyAdmin: async () => true }
      if (r === 'server-only') return {}
      return realLoad.call(this, r, ...rest)
    }
    try {
      const mod = rq('app/api/admin/outreach/today/route.js')
      const res = await mod.GET({ nextUrl: new URL('http://x/api/admin/outreach/today'), headers: new Headers() })
      return await res.json()
    } finally { Module._load = realLoad }
  }
  const prospects = [
    { id: 'pr-1', discovery_trucks: { name: 'Fixture Burgers', hatchgrab_truck_id: null } },
    { id: 'pr-2', discovery_trucks: { name: 'Fixture Pizza', hatchgrab_truck_id: null } },
  ]
  const truckRows = [
    { id: 'm1', prospect_id: 'pr-1', partner_id: null, direction: 'inbound', status: 'received', is_test: false, subject: 'Re: hello', from_address: 'owner@burgers.example', message_date: '2026-11-04T09:00:00Z', text_body: 'Yes please', handled_at: null, snoozed_until: null },
    { id: 'm2', prospect_id: 'pr-2', partner_id: null, direction: 'outbound', status: 'failed', is_test: false, subject: 'Hello', message_date: '2026-11-03T09:00:00Z', last_error: '550 no such user', handled_at: null },
    { id: 'm3', prospect_id: 'pr-2', partner_id: null, direction: 'inbound', status: 'received', is_test: false, subject: 'Re: later', from_address: 'pizza@x.example', message_date: '2026-11-02T09:00:00Z', text_body: 'Later', handled_at: null, snoozed_until: '2099-01-01T00:00:00Z' },
  ]
  // A partner's unhandled reply and failed send — the rows that must NEVER reach truck Today.
  const partnerRows = [
    { id: 'x1', prospect_id: null, partner_id: 'partner-1', direction: 'inbound', status: 'received', is_test: false, subject: 'Re: partnership', from_address: 'events@assoc.example', message_date: '2026-11-04T10:00:00Z', text_body: 'Interested', handled_at: null, snoozed_until: null },
    { id: 'x2', prospect_id: null, partner_id: 'partner-1', direction: 'outbound', status: 'failed', is_test: false, subject: 'Partnership', message_date: '2026-11-04T08:00:00Z', last_error: '421 try later', handled_at: null },
  ]
  const wt = headWorktree('partners-1-before', BEFORE)
  try {
    const before = await runRoute(wt.wt, 'partners-1-before', fakeDb({ outreach_messages: truckRows, outreach_prospects: prospects }))
    const after = await runRoute(REPO, 'partners-1-after', fakeDb({ outreach_messages: [...truckRows, ...partnerRows], outreach_prospects: prospects }))
    check(before.ok === true && before.waiting.length === 1 && before.problems.length === 1 && before.snoozed.length === 1, 'fixtures: truck Today (before) has 1 waiting, 1 problem, 1 snoozed', before)
    eq(after, before, 'Today AFTER partners-1, with a partner\'s unhandled reply and failed send added to the table, is IDENTICAL to Today before')
    const brokenAfter = await runRoute(wt.wt, 'partners-1-broken', fakeDb({ outreach_messages: [...truckRows, ...partnerRows], outreach_prospects: prospects }))
    check(JSON.stringify(brokenAfter) !== JSON.stringify(before), 'broken variant: the OLD route given the same partner rows WOULD show them — so the new filter is what keeps Today identical')
  } finally { wt.remove() }

  // The two global reads in the list route that feed counts and flags.
  const db = fakeDb({ outreach_messages: [
    { id: 'a', prospect_id: 'pr-1', direction: 'outbound', status: 'bounced', contact_id: 'c1' },
    { id: 'b', prospect_id: 'pr-2', direction: 'outbound', status: 'sent', contact_id: 'c2' },
    { id: 'c', prospect_id: null, partner_id: 'partner-1', direction: 'outbound', status: 'bounced', contact_id: null },
  ] })
  const { data: bounced } = await db.from('outreach_messages').select('prospect_id').eq('direction', 'outbound').eq('status', 'bounced').not('prospect_id', 'is', null)
  eq(bounced.map(b => b.prospect_id), ['pr-1'], 'list route: the bounced-prospect set ignores a partner\'s bounce (fixtures)')
  const { data: linked } = await db.from('outreach_messages').select('id, contact_id').not('contact_id', 'is', null)
  eq(linked.map(l => l.id), ['a', 'b'], 'list route: the contact → email map never contains a partner row (a partner email has no contact_id)')
  const list = read('app/api/admin/outreach/route.ts')
  check(list.includes(".eq('direction', 'outbound').eq('status', 'bounced').not('prospect_id', 'is', null)"), '…and the route carries that filter')

  // 🔴 A CENSUS: every outreach_messages read in truck code is keyed to a prospect / a row / a contact, or filtered,
  // or listed here with the reason a partner row is harmless to it.
  const files = ['app/api/admin/outreach/today/route.ts', 'app/api/admin/outreach/route.ts', 'app/api/admin/outreach/timeline/route.ts',
    'app/api/admin/outreach/mail-send/route.ts', 'app/api/admin/outreach/mail-import/route.ts', 'lib/outreach-mail-poll.ts', 'lib/outreach-poll-claims.ts',
    'lib/outreach-retry-rebuild.ts', 'lib/outreach-contact-log.ts', 'lib/outreach-mail-deliver.ts']
  const HARMLESS = [
    [/select\('id'\)\.limit\(1\)|select\('refusal'\)\.limit\(1\)|select\('guard_override'\)\.limit\(1\)/, 'a column/table probe'],
    [/\.update\(/, 'an update keyed by row id or message id'],
    [/\.upsert\(/, 'an insert'],
    [/\.insert\(/, 'an insert'],
    [/select\('message_id'\)\.not\('attachments'/, 'the importer\'s "bodies already read" set (by message id)'],
    [/select\('message_id, prospect_id, partner_id, direction, status, is_test'\)|select\('message_id, prospect_id, direction, status, is_test'\)/, 'the poll directory, which routes partner rows to the partner map'],
    [/\.select\('id, account, mailbox, uid'\)/, 'fillMissingBodies — stores bodies for any row, partner rows included (wanted)'],
    [/\.select\('id, contact_id, account, mailbox, uid, text_body'\)/, 'repairReplyTexts — contact_id rows only (a partner row has none)'],
    [/source', 'mailbox_import'|\.eq\('source', 'mailbox_import'\)/, 'adoption / backfill of imported rows (importer writes prospect rows only)'],
    [/\.in\('status', \['sending', 'failed', 'sent'\]\)/, 'housekeeping — stuck → uncertain and Sent-copy filing are row-generic; auto-retry skips partner rows'],
  ]
  const KEYED = /\.eq\('prospect_id'|\.in\('prospect_id'|\.eq\('id'|\.eq\('message_id'|\.eq\('idempotency_key'|\.not\('prospect_id', 'is', null\)|\.not\('contact_id', 'is', null\)|\.in\('message_id'/
  const unexplained = []
  let examined = 0
  for (const f of files) {
    const src = read(f)
    const re = /from\('outreach_messages'\)/g
    let m
    while ((m = re.exec(src)) !== null) {
      const chain = src.slice(m.index, m.index + 600).split(/\n\s*\n|;\n|\n\s*(const|let|if|for|return|await|try)\b/)[0]
      examined++
      if (KEYED.test(chain) || HARMLESS.some(([r]) => r.test(chain))) continue
      unexplained.push(`${f}:${src.slice(0, m.index).split('\n').length}: ${chain.replace(/\s+/g, ' ').slice(0, 140)}`)
    }
  }
  check(examined >= 40, `census: ${examined} outreach_messages reads examined across ${files.length} truck files (not vacuous)`)
  // Broken variant: an unkeyed global read of inbound mail must be caught.
  {
    const bad = "supabase.from('outreach_messages').select('id, subject').eq('direction', 'inbound')"
    const chain = bad.slice(bad.indexOf("from('outreach_messages')"))
    check(!(KEYED.test(chain) || HARMLESS.some(([r]) => r.test(chain))), 'broken variant: an unkeyed read of every inbound message would be flagged by the census')
  }
  check(unexplained.length === 0, 'census: every outreach_messages read in truck outreach is keyed to a prospect/row/contact, filtered, or harmless to a partner row', unexplained)
}

main()
  .catch(e => { console.log(`  🔴 ${e && e.stack || e}`); fails++ })
  .finally(() => {
    console.log(fails === 0 ? '\n✅ partners-1: partners are added, edited and logged; only the two automatic moves happen; Due works; replies file to the right side (or to neither, flagged); do-not-contact holds; the composer is free-form; partners-add dedupes; truck Today and counts are unchanged' : `\n🔴 ${fails} failure(s)`)
    process.exit(fails === 0 ? 0 : 1)
  })
