#!/usr/bin/env node
// scripts/outreach-crm-today.cjs — the CRM rules: what is waiting, what the timeline shows, and what
// a stage change records.
//   node scripts/outreach-crm-today.cjs      (≈ 6 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    a reply that IS waiting never appears on Today, so a real business is ignored while the screen
//    says "Nothing waiting. Nice."; a reply marked handled by an outbound contact that came BEFORE it,
//    so answering yesterday's email silently clears today's; a stage change recorded that never
//    happened, or a real one not recorded, so the timeline lies about the record; the same email shown
//    twice because the contact row it wrote was not de-duplicated; a test send read as correspondence;
//    or any of these screens opening an IMAP connection, which is what the last build removed.
//
// HOW: the REAL libs compiled from lib/, plus a source census over the routes and the panel.
const fs = require('fs'); const path = require('path'); const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const eq = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`  ${ok ? '✓' : '🔴'} ${label}`)
  if (!ok) { console.log(`      want: ${JSON.stringify(want)}`); console.log(`      got:  ${JSON.stringify(got)}`); fails++ }
}

const FILES = [
  'lib/outreach-attention.ts', 'lib/outreach-timeline.ts', 'lib/outreach-today.ts',
  // ⚠️ COMPILED BUT NOT CALLED: `lib/outreach-today.ts` imports `Step` as a TYPE, and the compiler
  // needs the file to typecheck it. Today derives no step — that is the point of the census below.
  'lib/outreach-step.ts',
]
function build(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return {
    A: req('lib/outreach-attention.js'),
    T: req('lib/outreach-timeline.js'),
    D: req('lib/outreach-today.js'),
  }
}

/** 🔴 THE CENSUS READS CODE, NOT COMMENTS. A file whose header explains a rule would otherwise match
 *  its own explanation — the mistake `scripts/outreach-mail-poll.cjs` records. */
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const readStripped = f => stripComments(read(f))

const NOW = new Date('2026-09-29T21:00:00Z')
const reply = (over = {}) => ({ status: 'received', is_test: false, direction: 'inbound', handled_at: null, snoozed_until: null, ...over })

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, file, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `crm-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, file); const src = fs.readFileSync(f, 'utf8')
    const out = patch(src); if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return { tmp, ...build(tmp, tag) }
  }
  const variantFails = (tag, bad, label) => {
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${tag} ${label}`)
    if (!bad) process.exit(1)
  }
  {
    // V1 — A TEST SEND'S REPLY BECOMES WORK. Dominic replies to his own test; Today then tells him a
    // business is waiting on an answer, and the one it names never wrote to him.
    const v = variant('v1', 'lib/outreach-attention.ts', src => src.replace(
      '  if (row.is_test === true) return false', '  // removed'))
    variantFails('V1', v.A.needsAttention(reply({ is_test: true }), { now: NOW }) === true,
      'the test exclusion removed: a reply to a test send is presented as a business waiting')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V2 — HANDLED IS IGNORED. Every reply ever answered comes back on the screen, so the list is a
    // history and not a queue — which is the "231 rows in no order" problem it was built to end.
    const v = variant('v2', 'lib/outreach-attention.ts', src => src.replace(
      '  if (row.handled_at) return false', '  // removed'))
    variantFails('V2', v.A.needsAttention(reply({ handled_at: '2026-09-01T09:00:00Z' }), { now: NOW }) === true,
      'the handled test removed: a reply dealt with weeks ago is still "waiting for me"')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V3 — A SNOOZE STOPS HIDING ANYTHING. "Not now" would mean nothing at all: the row returns on
    // the very next render, and the button reads as broken.
    const v = variant('v3', 'lib/outreach-attention.ts', src => src.replace(
      '  if (row.snoozed_until && new Date(row.snoozed_until).getTime() > opts.now.getTime()) return false',
      '  // removed'))
    variantFails('V3', v.A.needsAttention(reply({ snoozed_until: '2026-10-06T07:00:00Z' }), { now: NOW }) === true,
      'the snooze test removed: a reply snoozed until next week is on the list now')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V4 — A LINKED HATCHGRAB TRUCK IS TREATED AS A PROSPECT. It is a customer, a demo or the test
    // truck; the send route refuses it, the poll skips it, and Today would put it back in the queue.
    const v = variant('v4', 'lib/outreach-attention.ts', src => src.replace(
      '  if (opts.linkedTruck) return false', '  // removed'))
    variantFails('V4', v.A.needsAttention(reply(), { now: NOW, linkedTruck: true }) === true,
      "a customer's email is queued as outreach work")
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V5 — AN AUTO-REPLY COUNTS AS A REPLY. An out-of-office would appear as a business waiting for
    // an answer, which is the distinction the whole reply poll exists to draw.
    const v = variant('v5', 'lib/outreach-attention.ts', src => src.replace(
      "  if (row.status !== 'received') return false", '  // removed'))
    variantFails('V5', v.A.needsAttention(reply({ status: 'auto_reply' }), { now: NOW }) === true,
      "the status test removed: an out-of-office is presented as a reply needing an answer")
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V6 — THE SNOOZE IS COMPUTED IN UTC. 08:00 London is 07:00Z through the summer, so every snooze
    // taken between late March and late October comes back an hour late — right half the year, which
    // is the hardest kind of wrong to notice.
    const v = variant('v6', 'lib/outreach-attention.ts', src => src.replace(
      '  return wallClockToUtc(ymd, SNOOZE_HOUR, OUTREACH_TIMEZONE)',
      '  return new Date(`${ymd}T${SNOOZE_HOUR}:00Z`)'))
    const bst = v.A.snoozeUntil('tomorrow', new Date('2026-07-01T12:00:00Z'))
    variantFails('V6', bst.toISOString() === '2026-07-02T08:00:00.000Z',
      'the timezone conversion removed: a summer snooze returns at 09:00 London, not 08:00')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V7 — THE TIMELINE STOPS DE-DUPLICATING. Every email that was logged appears twice: once as the
    // email and once as the rung it wrote, which is the two-list problem this build removed.
    const v = variant('v7', 'lib/outreach-timeline.ts', src => src.replace(
      '    if (c.email_message_id) continue', '    // removed'))
    const out = v.T.buildTimeline({
      messages: [{ id: 'm1', direction: 'outbound', status: 'sent', message_date: '2026-09-20T10:00:00Z' }],
      contacts: [{ id: 'c1', contacted_at: '2026-09-20', email_message_id: 'm1' }],
      events: [],
    })
    variantFails('V7', out.length === 2, 'one email appears twice — once as itself and once as its rung')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V8 — TEST SENDS ARE SHOWN BY DEFAULT. A test is Dominic emailing himself; in the timeline it
    // reads as correspondence with the truck, and the toggle that exists to reveal them means nothing.
    const v = variant('v8', 'lib/outreach-timeline.ts', src => src.replace(
      '    if (m.is_test === true && !input.showTests) continue', '    // removed'))
    const out = v.T.buildTimeline({
      messages: [{ id: 'm1', direction: 'outbound', status: 'sent', is_test: true, message_date: '2026-09-20T10:00:00Z' }],
      contacts: [], events: [],
    })
    variantFails('V8', out.length === 1, 'a test send is part of the conversation by default')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V9 — FOLLOW-UPS STOP EXCLUDING WHAT IS ALREADY ON SCREEN. The same truck appears twice, as two
    // jobs, and the count at the top of the tab counts it twice too.
    const v = variant('v9', 'lib/outreach-today.ts', src => src.replace(
      '    .filter(p => !already.has(p.id) && !!p.next_action_at && p.next_action_at <= input.today)',
      '    .filter(p => !!p.next_action_at && p.next_action_at <= input.today)'))
    const step = { state: 'due', kind: '2_chase_1', dueOn: '2026-09-20', label: 'Chase 1', channel: null, leadType: 'not_listed', leadTypeFrozen: false, stopReason: null, rungsDone: 1, blindRows: 0 }
    const out = v.D.buildToday({
      waiting: [], problems: [], today: '2026-09-29',
      prospects: [{ id: 'p1', name: 'Truck', step, channel: 'email', next_action_at: '2026-09-25' }],
    })
    variantFails('V9', out.chasers.length === 1 && out.followUps.length === 1,
      'one truck is listed as two separate jobs — a chase AND a follow-up')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V10 — THE CHASER LIST STOPS GATING ON A CHANNEL. §57.2: 155 of 231 prospects have no email and
    // no confirmed WhatsApp number, so "send the next message" is not an instruction that can be
    // followed. They belong on Needs details, not on the morning's work.
    const v = variant('v10', 'lib/outreach-today.ts', src => src.replace(
      "    .filter(p => p.step.state === 'due' && p.channel !== null)",
      "    .filter(p => p.step.state === 'due')"))
    const step = { state: 'due', kind: '1_first_contact', dueOn: null, label: 'First contact', channel: null, leadType: 'not_listed', leadTypeFrozen: false, stopReason: null, rungsDone: 0, blindRows: 0 }
    const out = v.D.buildToday({
      waiting: [], problems: [], today: '2026-09-29',
      prospects: [{ id: 'p1', name: 'No way to reach them', step, channel: null, next_action_at: null }],
    })
    variantFails('V10', out.chasers.length === 1,
      'a prospect with no email and no WhatsApp number is listed as a chase to send today')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  {
    // V11 — A DATE-ONLY CONTACT IS READ AS MIDNIGHT. This is the shape of the live data, not an edge
    // case: the Log-a-contact form stores 'YYYY-MM-DD'. Read as midnight, logging a call TODAY marks
    // nothing — every reply that arrived during the day is still "waiting for me" afterwards, and the
    // one feature this build promises ("log a call and the reply is handled") silently does nothing.
    const v = variant('v11', 'lib/outreach-attention.ts', src => src.replace(
      "  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) return new Date(raw).toISOString()",
      '  return new Date(raw).toISOString()'))
    const boundary = v.A.handledBoundary('2026-09-29', new Date('2026-09-29T21:00:00Z'))
    variantFails('V11', boundary === '2026-09-28T23:00:00.000Z' || boundary.endsWith('T00:00:00.000Z')
      || new Date(boundary).getTime() < Date.parse('2026-09-29T20:57:00Z'),
      "a call logged today counts as midnight: this evening's reply is not marked handled")
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  const { A, T, D } = build(REPO, 'crmReal')

  console.log('\n── WHICH REPLIES ARE WAITING ────────────────────────────────────────────────────────────')
  {
    eq(A.needsAttention(reply(), { now: NOW }), true, '🔴 a real, unhandled, unsnoozed reply is waiting')
    eq(A.needsAttention(reply({ is_test: true }), { now: NOW }), false, '…a reply to a TEST send is not')
    eq(A.needsAttention(reply({ status: 'auto_reply' }), { now: NOW }), false, '…an auto-reply is not')
    eq(A.needsAttention(reply({ status: 'bounce' }), { now: NOW }), false, '…a bounce report is not')
    eq(A.needsAttention(reply({ handled_at: '2026-09-29T20:00:00Z' }), { now: NOW }), false, '…one already handled is not')
    eq(A.needsAttention(reply(), { now: NOW, linkedTruck: true }), false,
      '🔴 …and a prospect linked to a HatchGrab truck is never queued: it is a customer, not a lead')
    // ⚠️ THE SNOOZE EXPIRES ON ITS OWN. Both sides of the instant, on the same row.
    eq(A.needsAttention(reply({ snoozed_until: '2026-09-30T07:00:00Z' }), { now: NOW }), false,
      'a snooze into the future hides it…')
    eq(A.needsAttention(reply({ snoozed_until: '2026-09-29T07:00:00Z' }), { now: NOW }), true,
      '🔴 …and an EXPIRED snooze brings it back with nobody pressing anything')
    eq(A.needsAttention({ status: 'sent', direction: 'outbound' }, { now: NOW }), false,
      '⚠️ an outbound row is never "waiting for me" whatever its status')
  }

  console.log('\n── WHEN A SNOOZE COMES BACK ─────────────────────────────────────────────────────────────')
  {
    // 🔴 BST AND GMT, BOTH. The offset is resolved at the TARGET instant, not today's.
    eq(A.snoozeUntil('tomorrow', new Date('2026-07-01T12:00:00Z')).toISOString(), '2026-07-02T07:00:00.000Z',
      '🔴 in summer, 08:00 London is 07:00Z')
    eq(A.snoozeUntil('tomorrow', new Date('2026-12-01T12:00:00Z')).toISOString(), '2026-12-02T08:00:00.000Z',
      '…in winter it is 08:00Z')
    eq(A.snoozeUntil('3_days', new Date('2026-09-29T21:00:00Z')).toISOString(), '2026-10-02T07:00:00.000Z',
      'three days lands on a morning, not 72 hours later')
    eq(A.snoozeUntil('1_week', new Date('2026-09-29T21:00:00Z')).toISOString(), '2026-10-06T07:00:00.000Z',
      'a week lands on a morning too')
    // ⚠️ ACROSS THE CLOCK CHANGE: 25 October 2026 is when BST ends. A week from 22 October is after it.
    eq(A.snoozeUntil('1_week', new Date('2026-10-22T12:00:00Z')).toISOString(), '2026-10-29T08:00:00.000Z',
      '🔴 a snooze taken before the clocks change still comes back at eight in the morning')
    eq(A.isSnoozeOption('next_year'), false, 'an unknown option is refused rather than stored')
    for (const o of A.SNOOZE_OPTIONS) check(A.isSnoozeOption(o), `…and \`${o}\` is offered`)
  }

  console.log('\n── AN OUTBOUND CONTACT HANDLES ONLY WHAT CAME BEFORE IT ─────────────────────────────────')
  {
    // 🔴 THIS RULE LIVES IN ONE FUNCTION. Written in the send route instead, a logged phone call or a
    // WhatsApp would leave the reply sitting in Today for ever — and the operator would learn not to
    // trust the list, which is worse than not having it.
    const LOG = readStripped('lib/outreach-contact-log.ts')
    check(/async function markEarlierRepliesHandled\(/.test(LOG), 'the sweep is a function in the single contact writer')
    check(/\.lt\('message_date', happenedAt\)/.test(LOG),
      "🔴 EARLIER ONLY — `.lt`, not `.lte` and not unfiltered: a reply that lands while he is typing has not been answered")
    check(/\.is\('handled_at', null\)/.test(LOG),
      '⚠️ …and only rows not already handled, so re-logging cannot rewrite WHEN a reply was dealt with')
    check(/\.eq\('direction', 'inbound'\)/.test(LOG), '…inbound rows only')
    const outboundBlock = LOG.slice(LOG.indexOf("if (input.direction === 'outbound')"), LOG.indexOf("} else if (input.direction === 'inbound')"))
    check(/markEarlierRepliesHandled\(supabase, input\.prospect_id, happenedAt, nowIso\)/.test(outboundBlock),
      '🔴 …and it runs on EVERY outbound log — a send, a call, a WhatsApp, an Outlook reply the poll finds')
    const inboundBlock = LOG.slice(LOG.indexOf("} else if (input.direction === 'inbound')"), LOG.indexOf('if (ladderSideEffects'))
    check(!/markEarlierRepliesHandled/.test(inboundBlock),
      '⚠️ …and never on an inbound one: a reply does not answer itself')

    // The census that matters: NOBODY ELSE writes `handled_at` except the four deliberate places.
    const writers = ['app/api/admin/outreach/mail-send/route.ts', 'lib/outreach-mail-poll.ts',
      'app/api/admin/outreach/route.ts', 'app/api/admin/outreach/today/route.ts']
    for (const f of writers) {
      check(!/handled_at:/.test(readStripped(f)), `🔴 ${f} does not write handled_at`)
    }
    const TLROUTE = readStripped('app/api/admin/outreach/timeline/route.ts')
    check(/handled_at: nowIso/.test(TLROUTE) && /handled_at: null/.test(TLROUTE),
      'the only other writer is the timeline route, where the three buttons are')

    // 🔴 AND THE IMPORTER, WHICH RECORDS HISTORY AND MUST NOT QUEUE IT. Everything it writes is
    // before the account's POLL_SINCE; left unhandled, one import would drop months of old replies
    // into the morning's work — the thing the migration's one-off backfill had to undo by hand.
    const IMPORT = readStripped('app/api/admin/outreach/mail-import/route.ts')
    const stampsHistory = src => /f\.direction === 'inbound' \? \{ handled_at: new Date\(\)\.toISOString\(\) \} : \{\}/.test(src)
    check(stampsHistory(IMPORT),
      '🔴 imported INBOUND mail is recorded already handled — it is history, not work')
    check(!stampsHistory(IMPORT.replace(/\.\.\.\(f\.direction === 'inbound'[^\n]*\n/, '')),
      '⚠️ …and the same census FAILS on a version without it')
    check(/withinFirstLook\(msg\.internalDate, since\)/.test(IMPORT),
      '…which is only safe BECAUSE the importer leaves new mail to reply pickup')
  }

  console.log('\n── WHAT "AFTER" MEANS WHEN A PERSON TYPES A DATE ────────────────────────────────────────')
  {
    const now = new Date('2026-09-29T21:00:00Z')
    // 🔴 LOGGED TODAY ⇒ NOW. Everything that arrived earlier today is before it.
    eq(A.handledBoundary('2026-09-29', now), '2026-09-29T21:00:00.000Z',
      "🔴 a call logged with TODAY's date counts as now, not as midnight")
    check(Date.parse(A.handledBoundary('2026-09-29', now)) > Date.parse('2026-09-29T20:57:00Z'),
      "…so this evening's 20:57 reply IS marked handled by it")
    // 🔴 BACK-DATED ⇒ THE END OF THAT DAY, so later days are untouched.
    const back = A.handledBoundary('2026-09-25', now)
    check(Date.parse(back) < Date.parse('2026-09-26T00:00:00Z'),
      '🔴 a back-dated call counts as the end of ITS day…')
    check(Date.parse(back) > Date.parse('2026-09-25T12:00:00Z'),
      '…and not as its midnight, so a reply earlier that day is answered by it')
    // ⚠️ A REAL TIMESTAMP IS EXACT. The poll and the send path both write one.
    eq(A.handledBoundary('2026-09-29T19:00:00Z', now), '2026-09-29T19:00:00.000Z',
      '⚠️ a full timestamp is used exactly as it stands')
    eq(A.handledBoundary(null, now), '2026-09-29T21:00:00.000Z', 'no date at all means now')
  }

  console.log('\n── EVERY STAGE WRITER RECORDS WHAT IT DID ───────────────────────────────────────────────')
  {
    // 🔴 THE CENSUS OF WRITERS, NOT A LIST IN A COMMENT. Three files write
    // `outreach_prospects` with a `stage:` in the payload; each one must record an event, and only
    // when a row actually changed.
    const SOURCES = ['lib/outreach-contact-log.ts', 'app/api/admin/outreach/route.ts',
      'app/api/admin/outreach/mail-send/route.ts', 'lib/outreach-mail-poll.ts',
      'app/api/admin/outreach/mail-import/route.ts', 'app/api/admin/outreach/today/route.ts',
      'app/api/admin/outreach/timeline/route.ts']
    // ⚠️ TWO SHAPES OF WRITE, BOTH COUNTED. One builds the object inline (`update({ stage: … })`),
    // the other accumulates an allow-listed patch (`patch.stage = …`) and passes it. A census that
    // knew only the first shape would have declared the hand-set stage a non-writer — which is the
    // one a person uses most.
    const writesStage = src => /update\(\{[^}]*\bstage:/.test(src.replace(/\n/g, ' ')) || /patch\.stage = /.test(src)
    const writers = SOURCES.filter(f => writesStage(readStripped(f)))
    eq(writers.sort(), ['app/api/admin/outreach/route.ts', 'lib/outreach-contact-log.ts'],
      '🔴 exactly two files write a stage, and they are the two that record events')

    const LOG = readStripped('lib/outreach-contact-log.ts')
    // ⚠️ THE GUARD IS `if (stage)`, and `stage` is non-null ONLY when the conditional update returned
    // a row. An event on every log would fill the timeline with changes that never happened.
    const moves = (LOG.match(/await recordStageChange\(/g) || []).length
    eq(moves, 2, 'both conditional moves record one')
    check(/if \(stage\) \{\s*const ev = await recordStageChange/.test(LOG),
      '🔴 …only when the update actually returned a row')
    check(/from_stage: DEFAULT_STAGE/.test(LOG),
      "⚠️ the outbound move's from_stage is the filter's own value, not a second read that could race")
    check(/body: STAGE_CAUSE\.replyReceived/.test(LOG), 'a reply says what caused it')

    const ROUTE = readStripped('app/api/admin/outreach/route.ts')
    check(/if \('stage' in patch && String\(patch\.stage\) !== String\(priorStage \?\? ''\)\)/.test(ROUTE),
      "🔴 the hand-set stage records one ONLY when the value actually changed — no 'contacted → contacted'")
    check(/body: STAGE_CAUSE\.byHand/.test(ROUTE), '…and says it was set by hand')
    check(/select\('stage'\)\.eq\('id', id\)\.maybeSingle\(\)/.test(ROUTE),
      '…reading the previous value first, and only when a stage is being written')

    // 🔴 ONE WRITER OF THE EVENT TABLE, for the reason `logOutreachContact` is one writer of a rung.
    const EV = readStripped('lib/outreach-events.ts')
    check(/from\('outreach_events'\)\s*\.insert/.test(EV.replace(/\s+/g, ' ').replace(/ \./g, '\n.')) ||
      /from\('outreach_events'\)/.test(EV), 'lib/outreach-events.ts owns the table')
    for (const f of ['lib/outreach-mail-poll.ts', 'app/api/admin/outreach/mail-send/route.ts']) {
      check(!/outreach_events/.test(readStripped(f)), `…${f} never writes it directly`)
    }
    check(/kind: 'stage_change'/.test(EV) && /kind: 'note'/.test(EV), 'and it writes exactly two kinds')
  }

  console.log('\n── THE TIMELINE ─────────────────────────────────────────────────────────────────────────')
  {
    const messages = [
      { id: 'm1', direction: 'outbound', status: 'sent', message_date: '2026-09-20T10:00:00Z' },
      { id: 'm2', direction: 'inbound', status: 'received', message_date: '2026-09-29T20:57:00Z' },
      { id: 'm3', direction: 'outbound', status: 'sent', is_test: true, message_date: '2026-09-28T09:00:00Z' },
    ]
    const contacts = [
      { id: 'c1', contacted_at: '2026-09-20T10:00:00Z', email_message_id: 'm1', kind: '1_first_contact' },
      { id: 'c2', contacted_at: '2026-09-22T11:00:00Z', channel: 'phone', kind: '2_chase_1' },
    ]
    const events = [{ id: 'e1', kind: 'note', body: 'Rang, no answer', created_at: '2026-09-23T09:00:00Z' }]

    const out = T.buildTimeline({ messages, contacts, events })
    eq(out.map(i => i.id), ['m2', 'e1', 'c2', 'm1'], '🔴 newest first, across all three sources')
    check(!out.some(i => i.id === 'c1'),
      '🔴 the contact row written BY an email is not shown — the email is')
    check(!out.some(i => i.id === 'm3'), '⚠️ and a test send is out of the story by default')
    eq(out.filter(i => i.id === 'm1').length, 1, '…the email itself appears exactly once')

    const withTests = T.buildTimeline({ messages, contacts, events, showTests: true })
    eq(withTests.map(i => i.id), ['m2', 'm3', 'e1', 'c2', 'm1'], 'the toggle puts the test back, in order')
    check(!withTests.some(i => i.id === 'c1'),
      '⚠️ …and showing tests does NOT promote a de-duplicated rung into view')

    eq(T.buildTimeline({ messages: [], contacts: [], events: [] }), [], 'an empty prospect has an empty timeline')
    eq(T.previewOf('one\n\ntwo\nthree\nfour'), 'one\ntwo\nthree', 'the preview is the first three non-blank lines')
    eq(T.previewOf(null), '', '…and nothing at all when there is no text')
    eq(A.replySnippet('  hello   there  ', 140), 'hello there', 'a snippet is one line')
    eq(A.replySnippet('x'.repeat(200)).length, 141, '…capped, with an ellipsis')
    eq(A.replySnippet(''), '(no text was recorded with this reply)',
      '🔴 …and never empty: a blank line reads as "they said nothing"')
  }

  console.log('\n── TODAY ────────────────────────────────────────────────────────────────────────────────')
  {
    const step = (over) => ({ state: 'due', kind: '2_chase_1', dueOn: null, label: 'Chase 1', channel: null,
      leadType: 'not_listed', leadTypeFrozen: false, stopReason: null, rungsDone: 1, blindRows: 0, ...over })
    const view = D.buildToday({
      today: '2026-09-29',
      waiting: [
        { id: 'w2', prospect_id: 'p2', prospect_name: 'Later', snippet: 'b', message_date: '2026-09-29T20:00:00Z' },
        { id: 'w1', prospect_id: 'p1', prospect_name: 'Older', snippet: 'a', message_date: '2026-09-26T08:00:00Z' },
      ],
      prospects: [
        // ⚠️ p1 HAS A WAITING REPLY, so its step is STOPPED — `nextStep` exits the sequence on any
        // inbound contact (§57.1). It must therefore appear ONCE, under Replies waiting, and its
        // overdue follow-up date must not put it on a second list.
        { id: 'p1', name: 'Older', step: step({ state: 'stopped', stopReason: 'replied' }), channel: 'email', next_action_at: '2026-09-02' },
        { id: 'p3', name: 'Overdue', step: step({ dueOn: '2026-09-20' }), channel: 'email', next_action_at: null },
        { id: 'p4', name: 'Due today', step: step({ dueOn: '2026-09-29' }), channel: 'whatsapp', next_action_at: null },
        { id: 'p5', name: 'Scheduled', step: step({ state: 'scheduled', dueOn: '2026-10-10' }), channel: 'email', next_action_at: null },
        { id: 'p6', name: 'Unreachable', step: step({ dueOn: '2026-08-01' }), channel: null, next_action_at: null },
        { id: 'p7', name: 'Follow up', step: step({ state: 'stopped' }), channel: 'email', next_action_at: '2026-09-28' },
        { id: 'p8', name: 'Later date', step: step({ state: 'stopped' }), channel: 'email', next_action_at: '2026-10-20' },
      ],
      problems: [
        { id: 'x1', prospect_id: 'p9', prospect_name: 'Bounced', status: 'bounced', subject: 's', message_date: '2026-09-10T00:00:00Z', last_error: null },
        { id: 'x2', prospect_id: 'p9', prospect_name: 'Failed', status: 'failed', subject: 's', message_date: '2026-09-27T00:00:00Z', last_error: null },
      ],
    })
    eq(view.replies.map(r => r.id), ['w1', 'w2'], '🔴 replies OLDEST first — longest wait, first answer')
    eq(view.chasers.map(c => c.prospect_id), ['p3', 'p4'],
      '🔴 only DUE and reachable, most overdue first; a scheduled step and an unreachable prospect are out')
    eq(view.chasers[0].daysOverdue, 9, '…and it says how many days late it is')
    eq(view.chasers[1].daysOverdue, 0, '…due today is not overdue')
    eq(view.followUps.map(f => f.prospect_id), ['p7'],
      '🔴 follow-ups exclude anyone already listed above, and anything not yet due')
    eq(view.problems.map(p => p.id), ['x2', 'x1'], 'problem emails newest first')
    eq(view.total, 2 + 2 + 1 + 2, '⚠️ the tab counts every row across the four sections')

    const empty = D.buildToday({ today: '2026-09-29', waiting: [], prospects: [], problems: [] })
    eq(empty.total, 0, 'nothing waiting is a total of zero…')
    check(/Nothing waiting\. Nice\./.test(read('components/admin/OutreachPanel.tsx')),
      '…and the screen says so in words')
    eq(D.daysBetween('2026-09-29', '2026-09-20'), 0, '⚠️ "overdue" is never negative')
    eq(D.PROBLEM_STATUSES.slice(), ['failed', 'uncertain', 'bounced'], 'the three statuses that need a person')
    check(/check the address/.test(D.PROBLEM_LABEL.bounced), "🔴 a bounce says what to DO about it")
  }

  console.log('\n── ONE DERIVATION, AND NO MAILBOX ───────────────────────────────────────────────────────')
  {
    // 🔴 §57.1: `nextStep` is the one derivation. Today SORTS and BUCKETS; it must not compute a step.
    const TODAY_LIB = readStripped('lib/outreach-today.ts')
    const derives = src => /nextStep\(|followUpDateFor\(|CONTACT_KINDS/.test(src)
    check(!derives(TODAY_LIB), '🔴 lib/outreach-today.ts derives no step of its own…')
    check(derives(TODAY_LIB + '\nconst s = nextStep(p, c)'),
      '⚠️ …and the same census FAILS on a version that does, so it is testing the rule')
    check(/import type \{ Step \} from '@\/lib\/outreach-step'/.test(read('lib/outreach-today.ts')),
      '…it takes the step as an input, by type')
    const TODAY_ROUTE = readStripped('app/api/admin/outreach/today/route.ts')
    check(!derives(TODAY_ROUTE), '…and neither does the route')
    const UI = readStripped('components/admin/OutreachPanel.tsx')
    eq((UI.match(/nextStep\(/g) || []).length, 1,
      '🔴 the panel calls `nextStep` EXACTLY ONCE — the map the table, the counts and Today all read')
    check(/channel: channels\.get\(p\.id\) \?\? null/.test(UI),
      "⚠️ and contactability comes from `channelFor`'s map, never from `step.channel` (§57.2)")

    // 🔴 NO IMAP ON ANY OF THIS. The bodies are stored; opening a prospect connects to nothing.
    for (const f of ['app/api/admin/outreach/today/route.ts', 'app/api/admin/outreach/timeline/route.ts',
      'lib/outreach-today.ts', 'lib/outreach-timeline.ts', 'lib/outreach-attention.ts', 'lib/outreach-events.ts']) {
      const src = readStripped(f)
      check(!/imapflow|ImapFlow|makeImapClient|fetchMessageForView|withReadOnlyMailbox/.test(src),
        `🔴 ${f} opens no mailbox`)
      check(!/nodemailer|createTransport|sendMail/.test(src), `…and sends nothing`)
    }
    const TLROUTE = readStripped('app/api/admin/outreach/timeline/route.ts')
    check(!/html_body/.test(TLROUTE),
      '⚠️ the timeline payload carries previews, not megabytes of stored HTML')
    check(/outreach_contacts/.test(TLROUTE) && !/from\('outreach_contacts'\)\s*\.insert/.test(TLROUTE.replace(/\s+/g, ' ')),
      '🔴 …and the CRM buttons write no contact row: marking a reply done is not a rung on the ladder')
  }

  console.log('\n── WHAT THE SCREEN DOES ─────────────────────────────────────────────────────────────────')
  {
    /* 🔴 STALE ANCHORS, RESTATED RATHER THAN SILENTLY RE-POINTED (30 September 2026, CRM workspace).
     * Everything this block asserted about the PROSPECT VIEW used to live in
     * `components/admin/OutreachPanel.tsx`, because the prospect view was a modal inside it. It is a
     * full page now — `components/admin/ProspectWorkspace.tsx` and `ProspectTimeline.tsx`, at
     * `/admin/outreach/p/[prospectId]` — and the shared pieces (the sandboxed email viewer, the
     * attachment list, the contact popout) moved to `outreach-shared.tsx`. The RULES are unchanged
     * and are what is re-asserted here, each against the file that now owns it. What genuinely
     * changed is recorded where it changed: the timeline's row no longer carries a status label,
     * and its Open button is gone because the row itself is the control. */
    const UI = read('components/admin/OutreachPanel.tsx')
    const PAGE = read('components/admin/ProspectWorkspace.tsx')
    const TL = read('components/admin/ProspectTimeline.tsx')
    const SHARED = read('components/admin/outreach-shared.tsx')

    check(/useState<'today' \| 'all'>\(\(\) => \{/.test(UI),
      "🔴 Today is still the DEFAULT tab — now via a lazy initialiser, so coming back from a prospect lands on the tab it was opened from")
    check(/return r\?\.tab === 'all' \? 'all' : 'today'/.test(UI), '…restoring it from the return state')
    check(/Today\$\{todayView\.total \? ` \(\$\{todayView\.total\}\)` : ''\}/.test(UI),
      '…and the tab still carries the count')
    check(/<TodayScreen/.test(UI), 'Today is still mounted by the list…')
    check(/<ProspectTimeline/.test(PAGE), '…and the timeline by the prospect PAGE')
    check(/sandbox=""/.test(SHARED), '⚠️ mailbox HTML still renders only in the shared sandboxed iframe')
    // ⚠️ THE CENSUS READS CODE, NOT COMMENTS — the timeline's comment mentions `sandbox=""` while
    // explaining that it does not render one itself, which is exactly the trap this harness family
    // already records once.
    check(!/sandbox=""/.test(stripComments(TL)) && /<EmailBody/.test(TL),
      '…which the timeline opens rather than rendering markup of its own')
    check(/Show test sends/.test(TL), 'the timeline has its test toggle')
    check(/needsAttention\(m, \{ now, linkedTruck \}\)/.test(TL), '…and says which inbound rows are waiting')
    check(/Mark as needing reply/.test(TL), '…with the undo for a mistake')
    /* 🔴 RESTATED ON 30 SEPTEMBER 2026 (v3 fixes), WITH ITS HISTORY, BECAUSE IT WAS PASSING ON A
     * COMMENT. It read `/Pinned notes/` against the RAW page. v3 renamed that field to "About this
     * truck" and left a tombstone quoting the old label — so the check went on passing against a
     * comment about the thing it was meant to find. v3-fixes then merged both boxes into one
     * "Notes" card and rewrote the tombstone, which is when it finally failed.
     * ⚠️ WHAT IT WAS FOR IS KEPT AND MADE EXACT: there is still a place on the page for the
     * standing prose (the `notes` COLUMN this list also reads), and it is still written through
     * the page's one prospect patch. The name has changed twice; the column has not. */
    const PAGE_CODE = stripComments(PAGE)
    check(/Earlier notes/.test(PAGE_CODE) && /onPatch\(\{ notes: text \|\| null \}\)/.test(PAGE_CODE),
      'the standing `notes` column still has a field on the page, now labelled "Earlier notes"')
    check(/action: 'add_note'/.test(PAGE_CODE), 'and a note can be added from the page')
    check(/migrationApplied === false/.test(TL), '…the timeline still says when the migration is missing')
    check(/Today cannot be built yet\./.test(UI) && /migrationApplied=\{todayData\?\.migrationApplied !== false\}/.test(UI),
      '🔴 …and Today says so rather than reporting an empty queue')
    for (const s of ['Replies waiting', 'Chasers due', 'Follow-ups due', 'Emails needing a look']) {
      check(UI.includes(s), `Today has its "${s}" section`)
    }
    // 🔴 THE THREE ACTIONS THE EMAILS LIST CARRIED ARE STILL ON THE ROWS THAT NEED THEM.
    for (const a of ["'retry'", "'save_to_sent'", "'log_only'"]) {
      check(TL.includes(a), `…and the timeline kept ${a}`)
    }
    check(/const onSend = action === 'retry' \|\| action === 'save_to_sent' \|\| action === 'log_only'/.test(PAGE),
      '…routed to the send route, as they always were')
    check(/const reloadAll = useCallback\(async \(\) => \{ await Promise\.all\(\[load\(\), reloadTimeline\(\)\]\) \}/.test(PAGE),
      '🔴 every write refreshes BOTH the prospect and its timeline, through one function')
  }

  console.log(`\n${fails === 0 ? '✅ ALL CHECKS PASSED' : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
