#!/usr/bin/env node
// scripts/outreach-workspace.cjs — the prospect workspace: what is next, what a row says, and the queue.
//   node scripts/outreach-workspace.cjs   (≈ 6 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    the Next line naming a chase while somebody is waiting on an answer, so the person is ignored and
//    the machine's suggestion is followed; a second derivation of the step appearing on this page, so
//    the header and the table disagree about what is due; the page navigating BY ITSELF after an
//    action, so the result of what was just done is never seen; a snoozed reply that no screen lists,
//    so it is indistinguishable from a lost one; a shortcut firing while somebody is typing an email;
//    a row wearing a badge that means nothing, which is how the badges that DO mean something stopped
//    being read; or mailbox HTML rendered anywhere but the sandboxed iframe.
//
// HOW: the REAL libs compiled from lib/, plus a source census over the page and the list.
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
  'lib/outreach-workspace.ts', 'lib/outreach-queue.ts', 'lib/outreach-attention.ts',
  'lib/outreach-timeline.ts', 'lib/outreach-step.ts', 'lib/outreach-today.ts',
]
function build(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return {
    W: req('lib/outreach-workspace.js'),
    Q: req('lib/outreach-queue.js'),
    A: req('lib/outreach-attention.js'),
    T: req('lib/outreach-timeline.js'),
    D: req('lib/outreach-today.js'),
  }
}

const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const readStripped = f => stripComments(read(f))
const exists = f => fs.existsSync(path.join(REPO, f))

const NOW = new Date('2026-09-30T09:00:00Z')
const TODAY = '2026-09-30'
const reply = (over = {}) => ({
  id: 'm1', status: 'received', is_test: false, direction: 'inbound',
  handled_at: null, snoozed_until: null, from_address: 'sam@truck.test',
  message_date: '2026-09-15T10:00:00Z', ...over,
})
const step = (over = {}) => ({
  state: 'due', kind: '2_chase_1', dueOn: '2026-09-18', label: 'Chase 1', channel: null,
  leadType: 'not_listed', leadTypeFrozen: false, stopReason: null, rungsDone: 1, blindRows: 0, ...over,
})
/** A Map-backed `sessionStorage`, so the queue can be exercised with no browser. */
const fakeStore = () => {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, file, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ws-${tag}-`))
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
    // V1 — THE WAITING REPLY STOPS COMING FIRST. A person who wrote two weeks ago is ignored while the
    // page tells Dominic to send them a chase — the worst thing this line can say.
    const v = variant('v1', 'lib/outreach-workspace.ts', src => src.replace(
      '  if (waiting) {', '  if (false) {'))
    const a = v.W.nextAction({
      messages: [reply()], step: step(), channel: 'email', nextActionAt: null,
      linkedTruck: false, now: NOW, today: TODAY,
    })
    variantFails('V1', a.kind === 'chase', 'a chase is suggested while somebody is waiting for an answer')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V2 — THE CHASE STOPS OUTRANKING THE FOLLOW-UP DATE. §57's derived ladder is the instruction;
    // `next_action_at` is a reminder. Inverted, the page names the weaker of the two every time.
    const v = variant('v2', 'lib/outreach-workspace.ts', src => src.replace(
      "  if (input.step && input.step.state === 'due' && input.channel) {", '  if (false) {'))
    const a = v.W.nextAction({
      messages: [], step: step(), channel: 'email', nextActionAt: '2026-09-16',
      linkedTruck: false, now: NOW, today: TODAY,
    })
    variantFails('V2', a.kind === 'follow_up', 'the follow-up date is named while a chase is overdue')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V3 — THE CHANNEL GATE GOES (§57.2). 155 of 231 prospects have no email and no confirmed
    // WhatsApp number; "Send Chase 1" is not an instruction that can be followed for any of them.
    const v = variant('v3', 'lib/outreach-workspace.ts', src => src.replace(
      "  if (input.step && input.step.state === 'due' && input.channel) {",
      "  if (input.step && input.step.state === 'due') {"))
    const a = v.W.nextAction({
      messages: [], step: step(), channel: null, nextActionAt: null,
      linkedTruck: false, now: NOW, today: TODAY,
    })
    variantFails('V3', a.kind === 'chase', 'a prospect with no way to reach them is told to send a chase')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V4 — A ROW WEARS A STATUS BADGE AGAIN. Every line carrying "Sent" or "Reply" is how the badges
    // that mean something — Waiting, Bounced — stopped being read at all.
    const v = variant('v4', 'lib/outreach-workspace.ts', src => src.replace(
      "  const out: RowBadge[] = []",
      "  const out: RowBadge[] = []\n  if (m.status === 'sent') out.push('auto_reply')"))
    const badges = v.W.rowBadges({ status: 'sent', direction: 'outbound' }, { now: NOW, linkedTruck: false, showTests: false })
    variantFails('V4', badges.length > 0, 'an ordinary sent email carries a badge')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V5 — THE FILTER STOPS SPLITTING THE TWO STREAMS. "Conversation" would then include stage
    // changes and notes, which is the merged list the chips exist to separate.
    const v = variant('v5', 'lib/outreach-workspace.ts', src => src.replace(
      "  return item.type === 'event' ? 'notes' : 'conversation'", "  return 'conversation'"))
    const ok = v.W.matchesTimelineQuery({ type: 'event', event: { body: 'x' } }, 'conversation', '')
    variantFails('V5', ok === true, 'a note shows under Conversation')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V6 — SHORTCUTS FIRE WHILE TYPING. "n" in the middle of a note opens another note; "e" in an
    // email address opens the composer over what is being written.
    const v = variant('v6', 'lib/outreach-workspace.ts', src => src.replace(
      "  if (el.isContentEditable === true) return true", '  // removed'))
    variantFails('V6', v.W.isTypingTarget({ isContentEditable: true, tagName: 'DIV' }) === false,
      'a shortcut fires inside the email editor, which is a contenteditable div')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V7 — THE QUEUE WRAPS. `neighbours` returning the first id after the last turns "next" into an
    // endless loop, and "That's everything in Replies waiting" never appears.
    const v = variant('v7', 'lib/outreach-queue.ts', src => src.replace(
      '  return { prev: i > 0 ? ids[i - 1] : null, next: i < ids.length - 1 ? ids[i + 1] : null }',
      '  return { prev: ids[(i - 1 + ids.length) % ids.length], next: ids[(i + 1) % ids.length] }'))
    const n = v.Q.neighbours(['a', 'b', 'c'], 'c')
    variantFails('V7', n.next === 'a', 'the end of the queue wraps round to the start')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V8 — A MALFORMED QUEUE IS TRUSTED. sessionStorage is a string somebody could have edited; a
    // bad value must read as "no queue" rather than crash the page it was meant to help.
    const v = variant('v8', 'lib/outreach-queue.ts', src => src.replace(
      "  if (!q || !Array.isArray(q.ids) || typeof q.returnTo !== 'string') return null",
      '  if (!q) return null'))
    const store = fakeStore()
    store.setItem('hg.outreach.queue.v1', JSON.stringify({ ids: 'not-an-array' }))
    let threw = false
    try { v.Q.readQueue(store) } catch { threw = true }
    const got = threw ? 'threw' : v.Q.readQueue(store)
    variantFails('V8', threw || (got && got.ids === 'not-an-array'),
      'a malformed stored queue is handed back as though it were real')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V9 — SNOOZED REPLIES ARE COUNTED AS WORK. The tab's number would include things deliberately
    // put off, so "3 waiting" could mean nothing is waiting at all.
    const v = variant('v9', 'lib/outreach-today.ts', src => src.replace(
      '    total: replies.length + chasers.length + followUps.length + problems.length,',
      '    total: replies.length + chasers.length + followUps.length + problems.length + snoozed.length,'))
    const view = v.D.buildToday({
      today: TODAY, waiting: [], prospects: [], problems: [],
      snoozed: [{ id: 's1', prospect_id: 'p1', prospect_name: 'X', snippet: 'a', message_date: null, snoozed_until: '2026-10-02T07:00:00Z' }],
    })
    variantFails('V9', view.total === 1, 'a snoozed reply is counted as work waiting now')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  const { W, Q, A, T, D } = build(REPO, 'wsReal')

  console.log('\n── THE NEXT LINE: ONE THING, IN ONE ORDER ───────────────────────────────────────────────')
  {
    const base = { linkedTruck: false, now: NOW, today: TODAY }
    // 🔴 (1) SOMEBODY IS WAITING. It beats everything, including an overdue chase and a follow-up.
    const a = W.nextAction({ ...base, messages: [reply()], step: step(), channel: 'email', nextActionAt: '2026-09-16', contactName: 'Stephen' })
    eq(a.kind, 'reply', '🔴 a waiting reply comes first')
    // ⚠️ "Sept", NOT "Sep" — en-GB's own abbreviation for September, which is what `fmtDate` prints
    // in the list's date columns too. The expectation matches the formatter rather than the prose in
    // the brief; two spellings of one month across one screen would be the drift worth avoiding.
    eq(a.label, 'Stephen replied 15 Sept — waiting for you', '…named, dated, and in words')
    eq(a.cta, 'Reply →', '…with the action it needs')
    eq(a.messageId, 'm1', '…and it knows WHICH message to answer')
    eq(W.nextAction({ ...base, messages: [reply()], step: null, channel: null, nextActionAt: null }).label,
      'sam@truck.test replied 15 Sept — waiting for you',
      '⚠️ with no contact name it uses the address rather than a blank')

    // ⚠️ A REPLY THAT IS NOT WAITING DOES NOT COUNT — the shared predicate decides, not this line.
    for (const [over, why] of [
      [{ handled_at: '2026-09-16T09:00:00Z' }, 'already handled'],
      [{ snoozed_until: '2026-10-05T07:00:00Z' }, 'snoozed into the future'],
      [{ is_test: true }, 'a reply to a test send'],
      [{ status: 'auto_reply' }, 'an out-of-office'],
    ]) {
      eq(W.nextAction({ ...base, messages: [reply(over)], step: step(), channel: 'email', nextActionAt: null }).kind,
        'chase', `…${why} is not "waiting", so the chase is named instead`)
    }
    eq(W.nextAction({ ...base, linkedTruck: true, messages: [reply()], step: step({ state: 'stopped', stopReason: 'converted' }), channel: 'email', nextActionAt: null }).kind,
      'none', '🔴 …and a linked HatchGrab truck is never queued at all')

    // 🔴 (2) THE DERIVED CHASE, with the overdue count.
    const c = W.nextAction({ ...base, messages: [], step: step(), channel: 'email', nextActionAt: '2026-09-16' })
    eq(c.kind, 'chase', 'a due chase comes next')
    eq(c.label, 'Chase 1 due 18 Sept · 12 days overdue', '…with its rung, its date and how late it is')
    eq(c.cta, 'Send Chase 1 →', '…and a button that says what it will send')
    eq(W.nextAction({ ...base, messages: [], step: step({ dueOn: TODAY }), channel: 'email', nextActionAt: null }).label,
      'Chase 1 due 30 Sept', '⚠️ due today is not "overdue" and does not say so')
    eq(W.nextAction({ ...base, messages: [], step: step({ state: 'scheduled', dueOn: '2026-10-10' }), channel: 'email', nextActionAt: null }).kind,
      'none', 'a SCHEDULED step is not due, so it is not the next thing')

    // 🔴 (3) THE DATE HE WROTE DOWN HIMSELF.
    const f = W.nextAction({ ...base, messages: [], step: step({ state: 'stopped', stopReason: 'replied' }), channel: 'email', nextActionAt: '2026-09-16' })
    eq(f.kind, 'follow_up', 'a due follow-up comes third')
    eq(f.label, 'Follow up due 16 Sept · 14 days overdue', '…also with its lateness')
    eq(W.nextAction({ ...base, messages: [], step: null, channel: null, nextActionAt: '2026-10-20' }).kind,
      'none', '…and a FUTURE follow-up date is not due')

    // 🔴 (4) NOTHING — AND WHY.
    for (const [reason, word] of [['sequence_complete', 'Sequence finished'], ['replied', 'Replied'], ['do_not_contact', 'Do not contact']]) {
      const n = W.nextAction({ ...base, messages: [], step: step({ state: 'stopped', stopReason: reason }), channel: 'email', nextActionAt: null })
      eq([n.kind, n.label, n.reason], ['none', 'No next step', word], `🔴 stopped (${reason}) says so: "${word}"`)
    }
    eq(W.nextAction({ ...base, messages: [], step: null, channel: null, nextActionAt: null }).reason, null,
      '⚠️ and with no step at all there is no reason to invent')
  }

  console.log('\n── IT DERIVES NOTHING OF ITS OWN ────────────────────────────────────────────────────────')
  {
    // 🔴 §57.1: `nextStep` is the one derivation. The page passes it IN.
    /* 🔴 A STALE ANCHOR, RESTATED RATHER THAN SILENTLY RE-POINTED (30 September 2026, workspace v2).
     * This matched `followUpDateFor(` anywhere in the module and required it to be absent. The
     * module now has `defaultFollowUpChoice`, which takes that function AS A PARAMETER — it is
     * injected by the page precisely so this module cannot own a second copy of the interval rule.
     * A name in a parameter list is the opposite of the thing the census was written to catch, so
     * the census is now what it always meant: the module IMPORTS no derivation and CALLS none of
     * its own. `nextStep` and `CONTACT_KINDS` remain absolutely forbidden. */
    const LIB = readStripped('lib/outreach-workspace.ts')
    const derives = src => /\bnextStep\(|CONTACT_KINDS/.test(src)
    check(!derives(LIB), '🔴 lib/outreach-workspace.ts computes no step of its own…')
    check(derives(LIB + '\nconst s = nextStep(p, c)'),
      '⚠️ …and the same census FAILS on a version that does, so it is testing the rule')
    check(!/from '@\/lib\/outreach'/.test(LIB),
      "🔴 …and it imports nothing from lib/outreach: `followUpDateFor` is HANDED IN, so there is no second interval table")
    check(/followUpDateFor: \(kind: string, from: string\) => string \| null/.test(LIB),
      '…as a parameter, which is what makes that true by construction')
    check(/needsAttention\(m, \{ now: opts\.now, linkedTruck: opts\.linkedTruck \}\)/.test(LIB)
      || /needsAttention\(/.test(LIB),
      '…and "is this waiting" is the SHARED predicate, not a second set of conditions')

    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    eq((PAGE.match(/nextStep\(/g) || []).length, 1,
      '🔴 the page calls `nextStep` EXACTLY ONCE — the header, the composer and the log form read that one answer')
    check(/channelFor\(\{ \.\.\.prospect, waPhone \}\)/.test(PAGE),
      '⚠️ and contactability is `channelFor`, never `step.channel` (§57.2)')
    check(/templateForStep\(step, offerable\)\.slug/.test(PAGE),
      'the composer still pre-selects through `templateForStep` — one pre-selection rule')
    check(/const lead = step\?\.leadType \?\? leadTypeOf\(p\)/.test(PAGE),
      "🔴 …and the card shows the STEP's lead type, so it cannot disagree with the email that gets sent")
  }

  console.log('\n── THE ROW SAYS ONLY WHAT NEEDS SAYING ──────────────────────────────────────────────────')
  {
    const opts = { now: NOW, linkedTruck: false, showTests: false }
    eq(W.rowBadges({ status: 'sent', direction: 'outbound' }, opts), [],
      '🔴 an ordinary sent email carries NO badge — not "Sent", not "from Outlook"')
    eq(W.rowBadges({ status: 'received', direction: 'inbound', handled_at: '2026-09-16T09:00:00Z' }, opts), [],
      '🔴 …and an answered reply carries none either')
    eq(W.rowBadges(reply(), opts), ['waiting'], '🔴 an unanswered reply says Waiting, and only that')
    eq(W.rowBadges({ status: 'bounced', direction: 'outbound' }, opts), ['bounced'], 'a bounce says Bounced')
    eq(W.rowBadges({ status: 'failed', direction: 'outbound' }, opts), ['failed'], 'a failure says Failed')
    eq(W.rowBadges({ status: 'uncertain', direction: 'outbound' }, opts), ['uncertain'], '…and an uncertain send says so')
    eq(W.BADGE_LABEL.uncertain, 'May have been sent', '…in those words, because that is what it means')
    eq(W.rowBadges({ status: 'auto_reply', direction: 'inbound' }, opts), ['auto_reply'],
      'an out-of-office is marked — it is NOT a reply, and the row must not read as one')
    eq(W.rowBadges({ status: 'sent', direction: 'outbound', is_test: true }, opts), [],
      '⚠️ a test send is unmarked while tests are hidden — there is no row to mark')
    eq(W.rowBadges({ status: 'sent', direction: 'outbound', is_test: true }, { ...opts, showTests: true }), ['test'],
      '…and marked as soon as they are shown')

    const UI = readStripped('components/admin/ProspectTimeline.tsx')
    for (const gone of ['MAIL_STATUS_LABEL', 'imported</span>', 'from Outlook</span>']) {
      check(!UI.includes(gone), `🔴 the row no longer renders ${gone}`)
    }
    check(/imported/.test(UI) && /from Outlook/.test(UI),
      '⚠️ …but the provenance is still SHOWN — in the expanded row, where it is wanted')
    check(!/>\s*Open\s*</.test(UI), '🔴 there is no Open button: the row itself is the control')
    check(/onClick=\{\(\) => onExpand\(open \? null : item\.id\)\}/.test(UI), '…and clicking it expands in place')
  }

  console.log('\n── FILTERS AND SEARCH ───────────────────────────────────────────────────────────────────')
  {
    const email = { type: 'email', message: { subject: 'Taking orders online', preview: 'Thanks — how do I sign up?' } }
    const call = { type: 'contact', contact: { kind: '2_chase_1', channel: 'phone', message: 'rang, no answer' } }
    const note = { type: 'event', event: { body: 'Wants a call after 3pm' } }
    const stage = { type: 'event', event: { body: 'Reply received', from_stage: 'contacted', to_stage: 'replied' } }

    eq([email, call, note, stage].map(i => W.matchesTimelineQuery(i, 'all', '')), [true, true, true, true],
      'All shows everything')
    eq([email, call, note, stage].map(i => W.matchesTimelineQuery(i, 'conversation', '')), [true, true, false, false],
      '🔴 Conversation is emails, calls and WhatsApp — what was SAID')
    eq([email, call, note, stage].map(i => W.matchesTimelineQuery(i, 'notes', '')), [false, false, true, true],
      '🔴 Notes & changes is what was RECORDED')

    check(W.matchesTimelineQuery(email, 'all', 'orders'), '🔴 search matches the subject…')
    check(W.matchesTimelineQuery(email, 'all', 'sign up'), '…and the stored text')
    check(W.matchesTimelineQuery(email, 'all', 'ORDERS'), '…case-insensitively')
    check(!W.matchesTimelineQuery(email, 'all', 'invoice'), '…and does not match what is not there')
    check(W.matchesTimelineQuery(call, 'all', 'no answer'), 'a contact row matches on its message')
    check(W.matchesTimelineQuery(note, 'all', '3pm'), 'a note matches on its body')
    check(W.matchesTimelineQuery(stage, 'all', 'replied'), 'a stage change matches on the stage it moved to')
    check(!W.matchesTimelineQuery(note, 'conversation', '3pm'),
      '⚠️ the filter and the search are ANDed — a note is still hidden under Conversation')
  }

  console.log('\n── THE QUEUE, AND THE WAY BACK ──────────────────────────────────────────────────────────')
  {
    const store = fakeStore()
    Q.saveQueue(store, { label: 'Replies waiting', ids: ['a', 'b', 'c'], returnTo: '/admin?tab=outreach' })
    const q = Q.readQueue(store)
    eq(q.ids, ['a', 'b', 'c'], 'the queue round-trips')
    eq(q.label, 'Replies waiting', '…with the label the end-of-queue line uses')
    eq(Q.queuePosition(q.ids, 'b'), { index: 2, total: 3 }, '🔴 "2 of 3", one-based, as a person counts')
    eq(Q.queuePosition(q.ids, 'zzz'), null, '⚠️ a prospect not in the queue has no position — no counter, rather than a wrong one')
    eq(Q.neighbours(q.ids, 'a'), { prev: null, next: 'b' }, '🔴 the first has no previous…')
    eq(Q.neighbours(q.ids, 'c'), { prev: 'b', next: null }, '…and the last has no next: the queue does not wrap')
    eq(Q.neighbours(q.ids, 'zzz'), { prev: null, next: null }, 'and one that is not in it goes nowhere')
    eq(Q.readQueue(fakeStore()), null, 'no queue stored ⇒ no queue')
    eq(Q.readQueue(null), null, '⚠️ …and no storage at all degrades to the same, rather than throwing')

    const bad = fakeStore()
    bad.setItem('hg.outreach.queue.v1', '{ not json')
    eq(Q.readQueue(bad), null, '🔴 a corrupted value reads as no queue')
    bad.setItem('hg.outreach.queue.v1', JSON.stringify({ ids: 'nope', returnTo: 3 }))
    eq(Q.readQueue(bad), null, '…and so does a well-formed value of the wrong shape')

    Q.saveReturn(store, { tab: 'all', scrollY: 1840 })
    eq(Q.readReturn(store), { tab: 'all', scrollY: 1840 }, '🔴 Back restores the tab AND the scroll position')
    eq(Q.prospectPath('a5beca7f'), '/admin/outreach/p/a5beca7f', 'one definition of where a prospect lives')

    const PANEL = readStripped('components/admin/OutreachPanel.tsx')
    check(/saveQueue\(store, \{/.test(PANEL) && /saveReturn\(store, \{ tab: tabRef\.current, scrollY:/.test(PANEL),
      '🔴 the list writes both on the way out — it is the only surface that knows what was on screen')
    check(/window\.scrollTo\(\{ top: r\.scrollY \}\)/.test(PANEL), '…and restores the scroll when it comes back')
    check(/readReturn\(window\.sessionStorage\)/.test(PANEL), '…and the tab')
    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    check(/neighbours\(queue\.ids, prospectId\)/.test(PAGE), '‹ › walk the queue the page was opened from')
    /* 🔴 A STALE ANCHOR, RESTATED (v3). The counter used to render "—" with two dead arrows when
     * the page had no queue; it is now not rendered at all, because a one-of-one counter on a page
     * opened by URL is furniture. The rule — the header says where you are in the queue — holds
     * whenever there IS a queue, which is what is asserted now. */
    check(/\{pos\.index\} of \{pos\.total\}/.test(PAGE), '…and the header says "3 of 12"')
    check(/\{pos && \(/.test(PAGE), '⚠️ …only when there is a queue to be somewhere in')
  }

  console.log('\n── WORKING THROUGH A QUEUE ──────────────────────────────────────────────────────────────')
  {
    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    // 🔴 THE BAR APPEARS ONLY AFTER SOMETHING WAS RESOLVED, AND NEVER NAVIGATES BY ITSELF.
    check(/const RESOLVING = new Set\(\['mark_handled', 'snooze'\]\)/.test(PAGE),
      '🔴 only a resolving action arms the "Done. Next" bar')
    check(/if \(j\.ok === true && RESOLVING\.has\(action\)\) setResolved\(true\)/.test(PAGE),
      '…and only when the server said it worked')
    check(/onSent=\{async \(\) => \{ await reloadAll\(\); setResolved\(true\) \}\}/.test(PAGE),
      '…a send arms it too')
    check(/onLogged=\{async \(\) => \{[^}]*setResolved\(true\)/.test(PAGE.replace(/\n/g, ' ')),
      '…and so does a log')
    const navigateCalls = (PAGE.match(/goTo\(nav\.next\)/g) || []).length
    check(navigateCalls >= 1, 'Enter and the bar both go to the next one…')
    check(!/useEffect\([^)]*goTo\(nav\.next\)/.test(PAGE.replace(/\n/g, ' ')),
      "🔴 …and NOTHING navigates on its own: there is no effect that calls it")
    check(/That&rsquo;s everything in \{queue\?\.label/.test(PAGE),
      '⚠️ at the end of the queue it says which queue is finished')
  }

  console.log('\n── SNOOZED IS LISTED, NEVER COUNTED ─────────────────────────────────────────────────────')
  {
    const view = D.buildToday({
      today: TODAY, waiting: [], prospects: [], problems: [],
      snoozed: [
        { id: 's2', prospect_id: 'p2', prospect_name: 'Later', snippet: 'b', message_date: null, snoozed_until: '2026-10-07T07:00:00Z' },
        { id: 's1', prospect_id: 'p1', prospect_name: 'Sooner', snippet: 'a', message_date: null, snoozed_until: '2026-10-02T07:00:00Z' },
      ],
    })
    eq(view.snoozed.map(s => s.id), ['s1', 's2'], '🔴 soonest to return first')
    eq(view.total, 0, '🔴 …and NOT counted as work waiting now')
    const UI = readStripped('components/admin/OutreachPanel.tsx')
    check(/Snoozed <span className="text-slate-400">\(\{view\.snoozed\.length\}\)<\/span>/.test(UI),
      'the screen lists them under their own heading with a count')
    check(/back \{fmtDate\(r\.snoozed_until\)\}/.test(UI), '…saying when each one comes back')
    check(/action: 'needs_reply', message_id: r\.id/.test(UI),
      '🔴 …and Unsnooze is the SAME action the timeline offers, not a second way to clear the columns')
    const ROUTE = readStripped('app/api/admin/outreach/today/route.ts')
    check(/new Date\(r\.snoozed_until\)\.getTime\(\) > now\.getTime\(\)/.test(ROUTE),
      'the route lists exactly the rows the predicate hid for that reason')
  }

  console.log('\n── SHORTCUTS ────────────────────────────────────────────────────────────────────────────')
  {
    check(W.isTypingTarget({ tagName: 'INPUT' }), '🔴 ignored in an <input>')
    check(W.isTypingTarget({ tagName: 'TEXTAREA' }), '…a <textarea>')
    check(W.isTypingTarget({ tagName: 'SELECT' }), '…a <select>')
    check(W.isTypingTarget({ tagName: 'DIV', isContentEditable: true }),
      '🔴 …and a contenteditable div, which is what the email editor IS')
    check(!W.isTypingTarget({ tagName: 'BUTTON' }), 'but not on a button')
    check(!W.isTypingTarget(null), 'and a missing target is not a typing target')
    eq(W.SHORTCUTS.map(s => s.keys), ['J / K', 'E', 'R', 'N', 'C', 'Enter', 'Esc', '?'],
      'the list `?` shows is declared in one place')
    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    check(/if \(isTypingTarget\(e\.target\) \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey\) return/.test(PAGE),
      '🔴 …and the page asks that predicate before every shortcut')
    for (const [k, what] of [['j', 'next'], ['k', 'previous'], ['e', 'email'], ['n', 'note'], ['c', 'call'], ['r', 'reply']]) {
      check(new RegExp(`k === '${k}'`).test(PAGE), `${k} is bound (${what})`)
    }
    /* ⚠️ A STALE ANCHOR, RESTATED (workspace v2): the action bar's four buttons became the
     * composer's four TABS, so "Compose an email (E)" is now "Write an email (E)" on a tab. The
     * rule — every shortcut appears in the tooltip of the control it duplicates — is unchanged. */
    check(/title="Next in this queue \(J\)"/.test(PAGE) && /Write an email \(E\)/.test(PAGE),
      '⚠️ and the shortcut is in the tooltip of the control it duplicates')
    /* ⚠️ A STALE ANCHOR, RESTATED (v3): the Note TAB is gone — a note is a box in the left column
     * now, always visible, so `N` focuses it rather than opening a tab. The rule is unchanged and
     * the remaining tabs still carry their shortcuts. */
    check(/Log a call \(C\)/.test(PAGE), '…on each of them')
    check(!/Add a note \(N\)/.test(PAGE) && /focusNoteBox/.test(PAGE),
      '🔴 …and N now focuses the always-visible note box instead of opening a tab')
  }

  console.log('\n── WHAT THE PAGE KEEPS ──────────────────────────────────────────────────────────────────')
  {
    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    const TL = readStripped('components/admin/ProspectTimeline.tsx')
    const SHARED = readStripped('components/admin/outreach-shared.tsx')
    // 🔴 MAILBOX HTML, IN THE SANDBOXED IFRAME AND NOWHERE ELSE.
    /* 🔴 A STALE ANCHOR, AND A DELIBERATE CHANGE, RESTATED IN FULL (workspace v2). The viewer's
     * frame was `sandbox=""` — every capability withheld. It is `allow-same-origin` now, and that
     * ONE token was added for one reason: the frame has to be sized to the email inside it, and a
     * frame with an opaque origin cannot expose `document.body.scrollHeight`. There is still no
     * `allow-scripts`, so nothing in the document can RUN, and a document that cannot run code
     * cannot use the origin it has been handed — the pair is what is dangerous, not the token.
     * The census therefore asserts the stronger property: the forbidden tokens are absent. */
    check(/sandbox=\{EMAIL_FRAME_SANDBOX\}/.test(SHARED), 'the one email viewer frames the body…')
    check(!/allow-scripts|allow-forms|allow-popups/.test(SHARED),
      '🔴 …with no allow-scripts, allow-forms or allow-popups anywhere in it')
    for (const [f, src] of [['the page', PAGE], ['the timeline', TL], ['the shared module', SHARED]]) {
      check(!/dangerouslySetInnerHTML/.test(src), `🔴 ${f} never injects HTML into the admin page`)
    }
    /* ⚠️ A STALE ANCHOR, RESTATED TWICE NOW. (v2): `EmailBody` gained `onOpenFull`, so the row
     * could hand the same email to a full-window view. (v4, 30 September 2026): an email no longer
     * opens IN the row at all — it opens in the reading panel, so the `<EmailBody rowId={m.id}>`
     * this matched has moved to `EmailReadingPanel.tsx`. THE RULE IS UNCHANGED and is what is
     * checked here: mailbox HTML is rendered by ONE viewer, and the timeline and the panel both go
     * through it rather than emitting markup of their own. */
    const PANEL = read('components/admin/EmailReadingPanel.tsx')
    check(/<EmailBody key=\{message\.id\} rowId=\{message\.id\}/.test(PANEL),
      '…and the reading panel opens an email through that viewer')
    check(!/dangerouslySetInnerHTML/.test(PANEL) && !/sandbox=/.test(stripComments(PANEL)),
      '…and renders no mailbox markup of its own')
    check(/onOpenFull=\{\(html, subject\) => setFullScreen\(\{ html, subject \}\)\}/.test(TL),
      '…including the full-window one, which is the same frame with a larger cap')
    // 🔴 THE SINGLE CONTACT WRITER, THROUGH THE SAME ROUTE ACTION.
    check(/action: 'log_contact'/.test(PAGE), 'every log goes through `log_contact`…')
    check(!/outreach_contacts/.test(PAGE), '…and the page never touches the table itself')
    check(/action: 'update_prospect'/.test(PAGE), 'the stage and the fields go through `update_prospect`…')
    check(/Changing the stage records a stage change in the timeline/.test(read('components/admin/ProspectWorkspace.tsx')),
      '…which is what records the stage change')
    // 🔴 do_not_contact IS NEVER SET AUTOMATICALLY.
    check(/onChange=\{e => void onPatch\(\{ do_not_contact: e\.target\.checked \? true : null \}\)\}/.test(PAGE),
      '🔴 do_not_contact moves only on a click, and clears to null rather than false')
    const auto = PAGE.replace(/onChange=\{e => void onPatch\(\{ do_not_contact[^}]*\}\)\}/g, '')
    check(!/do_not_contact: true/.test(auto), '…and nothing else in the page sets it')
    check(/Do not contact — outreach is blocked for this truck/.test(PAGE), 'and the banner says what it means')
    // ⚠️ THE COMPOSE WINDOW IS THE SAME COMPONENT, INLINE.
    check(/<ComposeWindow\s+inline/.test(read('components/admin/ProspectWorkspace.tsx')),
      '🔴 the composer is the SAME component, rendered inline — not a second one')
    const CW = readStripped('components/admin/ComposeWindow.tsx')
    check(/if \(inline\) return panel/.test(CW), '…and `inline` changes only where it paints')
    check(/createPortal\(/.test(CW), '…the portalled version is still there for a caller that wants one')
  }

  console.log('\n── THE OLD MODAL IS GONE ────────────────────────────────────────────────────────────────')
  {
    const PANEL = read('components/admin/OutreachPanel.tsx')
    const stripped = stripComments(PANEL)
    for (const gone of ['modalProspect', 'function Detail(', 'ProspectMetaFacts', 'setModalId', 'gotoNext']) {
      check(!stripped.includes(gone), `🔴 \`${gone}\` is gone from the list — no dead duplicate of the prospect view`)
    }
    check(/THE PROSPECT MODAL WAS HERE AND IS GONE/.test(PANEL),
      '⚠️ …and the file says where it went, rather than leaving a hole')
    check(exists('app/admin/outreach/p/[prospectId]/page.tsx'), 'the prospect has its own route')
    check(exists('components/admin/ProspectWorkspace.tsx') && exists('components/admin/ProspectTimeline.tsx'),
      '…rendered by the workspace and its timeline')
    check(/router\.push\(`\$\{prospectPath\(id\)\}/.test(stripped), '🔴 opening a row navigates there')
    const ROUTE = read('app/admin/outreach/p/[prospectId]/page.tsx')
    check(/verifyAdmin/.test(ROUTE) || /admin/i.test(ROUTE),
      'and the route documents the same admin gate the other admin pages use')
  }

  console.log(`\n${fails === 0 ? '✅ ALL CHECKS PASSED' : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
