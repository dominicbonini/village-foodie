#!/usr/bin/env node
// scripts/outreach-reply-any-notes.cjs — replying to my own email, recording an Outlook send as a
// step, and the only two rows in the timeline that can be changed.
//   node scripts/outreach-reply-any-notes.cjs   (≈ 4 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    a follow-up to my own email addressed to MYSELF — `from_address` on an outbound row is our own
//    mailbox, so the obvious reading of "reply to this" emails the wrong person;
//    a chaser logged as `reply` — `reply` is not a rung, so the ladder would stand still and the
//    same chase could go out again, past every guard, for ever;
//    an Outlook send recorded twice, which puts two rungs on the ladder for one email;
//    and a stage change that can be edited or deleted, which turns a history into a story.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const FILES = ['lib/outreach-reply-rules.ts', 'lib/outreach-sequence.ts', 'lib/outreach-mail-message.ts']
function buildLib(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return {
    R: req('lib/outreach-reply-rules.js'),
    S: req('lib/outreach-sequence.js'),
    M: req('lib/outreach-mail-message.js'),
  }
}

const OURS = 'dominic@hatchgrab.com'
const THEIRS = 'info@pigcassoscatering.co.uk'

function runReplySuite({ R, S, M }) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)

  // ── 1 · WHO IT GOES BACK TO ──────────────────────────────────────────────────────────────────
  const inbound = { direction: 'inbound', from_address: THEIRS, to_address: OURS }
  const outbound = { direction: 'outbound', from_address: OURS, to_address: THEIRS }
  t('🔴 answering THEIR email goes to whoever wrote it', R.replyRecipientFor(inbound) === THEIRS)
  t('🔴 following up on MY OWN goes to whoever I sent it to — never to my own mailbox',
    R.replyRecipientFor(outbound) === THEIRS)
  t('⚠️ a row with neither address yields nothing rather than an empty string',
    R.replyRecipientFor({ direction: 'outbound', to_address: '  ' }) === null
    && R.replyRecipientFor(null) === null)
  t('⚠️ …and the address is still checked against the closed set afterwards',
    R.replyRecipientRefusal({ to: 'someone@else.com', contactEmail: THEIRS, knownInboundFroms: [] }) !== null
    && R.replyRecipientRefusal({ to: THEIRS, contactEmail: THEIRS, knownInboundFroms: [] }) === null)
  t('🔴 a TEST send can never be replied to', !!R.replyParentRefusal(
    { id: 'm1', prospect_id: 'p1', is_test: true, message_id: '<a>' }, 'p1'))
  t('🔴 …nor a message belonging to another prospect', !!R.replyParentRefusal(
    { id: 'm1', prospect_id: 'other', is_test: false, message_id: '<a>' }, 'p1'))
  t('⚠️ …nor one with no Message-ID, which could not be threaded', !!R.replyParentRefusal(
    { id: 'm1', prospect_id: 'p1', is_test: false, message_id: null }, 'p1'))
  t('✓ a SENT email with a Message-ID can be replied to — which is what this build adds',
    R.replyParentRefusal({ id: 'm1', prospect_id: 'p1', is_test: false, direction: 'outbound', message_id: '<a>' }, 'p1') === null)

  // ── 1b · WHAT THE SEND IS ────────────────────────────────────────────────────────────────────
  t('🔴 a reply to somebody who WROTE TO US is `reply`',
    S.loggedKindFor({ hasParent: true, inConversation: true, stepKind: '2_chase_1' }) === 'reply')
  t('🔴 a follow-up on MY OWN email is the STEP, not a reply',
    S.loggedKindFor({ hasParent: true, inConversation: false, stepKind: '2_chase_1' }) === '2_chase_1')
  t('🔴 an ordinary chase is the step', S.loggedKindFor({ hasParent: false, inConversation: false, stepKind: '2_chase_1' }) === '2_chase_1')
  t('⚠️ the client\'s kind is the LAST resort, never preferred over the server\'s',
    S.loggedKindFor({ hasParent: false, inConversation: false, stepKind: '1_first_contact', clientKind: '4_final_chase' }) === '1_first_contact'
    && S.loggedKindFor({ hasParent: false, inConversation: false, stepKind: null, clientKind: '4_final_chase' }) === '4_final_chase')
  t('⚠️ nothing at all yields null rather than a guess',
    S.loggedKindFor({ hasParent: false, inConversation: false, stepKind: null }) === null)
  /* ══ ⛔ REVERSED: THE BUTTON ALWAYS SAYS "Send" (5 October 2026, Dominic's instruction) ══════════
   * It named the step — "Send · Chase 1" — and a reply said "Send reply". Three labels for one
   * button, changing width whenever the ladder moved, telling the operator nothing they could act on.
   * 🔴 WHAT THIS SECTION IS ACTUALLY ABOUT IS UNTOUCHED: a chaser must still be LOGGED as its step
   * and not as `reply`, which is `loggedKindFor` and is asserted on the next lines. The label was
   * never an input to that. */
  t('⛔ the button says "Send" for a rung, and for a reply', S.sendButtonLabel({ isReply: false, step: '2_chase_1' }) === 'Send'
    && S.sendButtonLabel({ isReply: true, step: '2_chase_1' }) === 'Send')

  // ── 1c · THREADING WITHOUT QUOTING ───────────────────────────────────────────────────────────
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Just following up.' }] }] }
  const quoted = {
    fromAddress: OURS, fromName: 'Dominic', toAddress: THEIRS, toName: null,
    subject: 'Ordering costs', date: new Date('2026-09-15T13:29:00Z'),
    html: '<p>the first email</p>', text: 'the first email',
  }
  const withQuote = M.buildMessage({ doc, subject: 'x', messageId: '<new>', parent: { messageId: '<old>', references: null, quoted } })
  const without = M.buildMessage({ doc, subject: 'x', messageId: '<new>', parent: { messageId: '<old>', references: null, quoted, quote: false } })
  t('🔴 the quote is in the email by default', /the first email/.test(withQuote.html))
  t('🔴 unticking removes the quote…', !/the first email/.test(without.html) && !/the first email/.test(without.text))
  t('🔴 …and leaves the THREADING alone, or the chase arrives as a new conversation',
    without.inReplyTo === '<old>' && without.inReplyTo === withQuote.inReplyTo)
  t('⚠️ …and the subject still says Re:', without.subject === withQuote.subject && /^Re: /.test(without.subject))
  t('⚠️ no double "Re:" on a subject that already has one',
    M.replySubject('Re: Ordering costs') === 'Re: Ordering costs')
  return { ok, bad }
}

function runCensus(over = {}) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const SEND = stripComments(over.SEND ?? read('app/api/admin/outreach/mail-send/route.ts'))
  const TLROUTE = stripComments(over.TLROUTE ?? read('app/api/admin/outreach/timeline/route.ts'))
  const EVENTS = stripComments(over.EVENTS ?? read('lib/outreach-events.ts'))
  const TL = stripComments(over.TL ?? read('components/admin/ProspectTimeline.tsx'))
  const PAGE = stripComments(over.PAGE ?? read('components/admin/ProspectWorkspace.tsx'))
  const CW = stripComments(over.CW ?? read('components/admin/ComposeWindow.tsx'))
  const SHARED = stripComments(over.SHARED ?? read('components/admin/outreach-shared.tsx'))

  // ── 1 · REPLY TO A SENT EMAIL ────────────────────────────────────────────────────────────────
  t('🔴 Reply is offered on a sent email as well as a received one',
    /!m\.is_test && \(m\.status === 'received' \|\| m\.status === 'sent'\)/.test(TL))
  t('…and it says which it is', /\{inbound \? 'Reply' : 'Follow up on this'\}/.test(TL))
  t('🔴 the page picks the recipient with the ONE rule, not a second copy',
    /const back = replyRecipientFor\(m\)/.test(PAGE))
  t('🔴 …and so does the route', /replyRecipientFor\(replyParent\) \?\? ''/.test(SEND))
  t('🔴 the logged kind comes from the ONE rule', /const sendKind = loggedKindFor\(\{/.test(SEND))
  t('🔴 …and the guards use "has the prospect written back", not "is this a reply button"',
    /isReply: inConversation, step, priors, lastEmailAt,/.test(SEND))
  t('⚠️ …which is derived from the rows, not from the request',
    /inConversation = contacts\.some\(c => c\.direction === 'inbound'\) \|\| step\.stopReason === 'replied'/.test(SEND))
  t('🔴 the tickbox only ever removes the quote', /const includeQuote = body\.include_quote !== false/.test(SEND)
    && /quote: includeQuote,/.test(SEND))
  t('⚠️ …and a missing stored body stops refusing the send when no quote was wanted',
    /if \(!quotedHtml && includeQuote\) \{/.test(SEND))
  t('🔴 the quote is NEVER in the box I type in: the editor holds the document and the server appends',
    !/quoted/.test(CW.slice(CW.indexOf('<RichEmailEditor'), CW.indexOf('toolbarExtra='))))
  // ⚠️ THE COMMENT THAT EXPLAINED THE `false` IS STRIPPED BEFORE THIS CENSUS, so the assertion is on
  // the declaration and the label, not on the prose between them.
  t('⚠️ and it opens collapsed, labelled for what it is',
    /const \[quotedOpen, setQuotedOpen\] = useState\(false\)/.test(CW) && /'Previous email'/.test(CW))

  // ── 2 · RECORD AN OUTLOOK SEND ───────────────────────────────────────────────────────────────
  /* ── 🔴 THREE CHECKS RESTATED IN PLACE (1 October 2026) — NOT SILENTLY RE-POINTED ──────────────
   * All three FAILED FOR REAL on this build, and each was asserting the thing that had just been
   * found wrong. They are kept here, next to each other, with what they used to require:
   *
   * ① `an unrecorded outbound email offers its step` pinned `Record as {STEP_LABELS[stepKind`.
   *    🔴 THAT PATTERN WAS THE DEFECT. `stepKind` is the PROSPECT'S CURRENT STEP, so the same email
   *    was offered as "Record as Chase 1" before a chase went out and "Record as Chase 2" after it —
   *    the button never read the email in front of it. A check that requires it would require the bug.
   * ② `…and a picker when the ladder cannot say which` pinned the four-button fallback, which
   *    appeared ONLY when the ladder could not name a step. The list is now always the four steps,
   *    so there is nothing left to fall back TO and the branch is gone.
   * ③ `"unrecorded" is the CONTACT LINK, not a guess` pinned
   *    `!m.contact_id` as the whole test. 🔴 THAT IS THE GUERRILLA KITCHEN BUG EXACTLY: the 15
   *    September email has no `contact_id`, and it is still a recorded first contact, because it
   *    pairs with a hand-logged one. The link is still NECESSARY and is still asserted below — what
   *    changed is that it is no longer SUFFICIENT.
   * ⚠️ WHAT ALL THREE PROTECTED SURVIVES: the offer is never automatic, never for a test send, never
   *    for an inbound row, and never for an email already recorded. Each is pinned below. */
  t('🔴 the offer is a LIST of the four steps, not the prospect\'s current step',
    /<RecordAsMenu busy=/.test(TL) && /function RecordAsMenu/.test(TL)
    && /Record as ▾/.test(TL)
    && !/Record as \{STEP_LABELS\[stepKind/.test(TL))
  t('⚠️ …and the ladder\'s own answer is marked "suggested", not pressed on his behalf',
    /suggested=\{stepKind\}/.test(TL) && /k === suggested && <span[^>]*>suggested</.test(TL))
  t('🔴 "unrecorded" is the CONTACT LINK **AND** THE SHARED RULE — the link alone was the bug',
    /const unrecorded = !inbound && !m\.is_test && m\.status === 'sent' && !m\.contact_id && !recorded/.test(TL))
  t('🔴 recording goes through the one contact writer and the one follow-up writer',
    /action: 'log_only', message_row_id: messageId, kind/.test(PAGE) && /await applyFollowUp\(kind\)/.test(PAGE))
  t('🔴 …and the route refuses a message that is already logged — it can never be counted twice',
    /if \(row\.contact_id\) return refuse\('That message is already logged\.'\)/.test(SEND))
  t('🔴 …refuses a test send', /if \(row\.is_test\) return refuse/.test(SEND))
  t('🔴 …and refuses a kind that is not a step, which would blind the whole ladder',
    /if \(recordKind !== null && !\(CONTACT_KINDS as readonly string\[\]\)\.includes\(recordKind\)\)/.test(SEND))
  t('⚠️ it is never automatic — the poll still logs nothing of its own',
    !/log_only/.test(stripComments(read('lib/outreach-mail-poll.ts'))))

  // ── 3 · NOTES ────────────────────────────────────────────────────────────────────────────────
  t('🔴 a note is edited and deleted through ONE writer each',
    /export async function editNote\(/.test(EVENTS) && /export async function deleteNote\(/.test(EVENTS))
  t('🔴 …and BOTH carry `.eq(\'kind\', \'note\')` IN THE STATEMENT, so a stage change cannot be touched',
    (EVENTS.match(/\.eq\('kind', 'note'\)/g) || []).length === 2)
  t('🔴 …and both report how many rows they actually changed',
    /select\('id'\)/.test(EVENTS) && /select\('body, created_at'\)/.test(EVENTS))
  t('🔴 Undo restores the words AND the day', /if \(createdAt && !Number\.isNaN\(new Date\(createdAt\)\.getTime\(\)\)\) row\.created_at = createdAt/.test(EVENTS))
  t('⚠️ …for eight seconds', /window\.setTimeout\(\(\) => setUndo\(null\), 8000\)/.test(SHARED))
  t('🔴 delete asks first, through the same dialog the contact delete uses',
    /<ConfirmDeleteDialog\s*\n\s*title="Delete this note\?"/.test(SHARED))
  t('🔴 an edited note says so, and when', /edited \{fmtDate\(note\.updated_at/.test(SHARED))
  t('⚠️ …only where the column exists, which is a probe and not a crash',
    /const eventsHaveUpdatedAt = async/.test(TLROUTE) && /if \(hasUpdatedAt\) patch\.updated_at/.test(EVENTS))
  t('🔴 the three note actions are the only ones that write `outreach_events` from this route',
    /action === 'edit_note'/.test(TLROUTE) && /action === 'delete_note'/.test(TLROUTE)
    && /action === 'restore_note'/.test(TLROUTE))
  t('🔴 the same row component serves the Notes card and the history row — one set of rules',
    /export function NoteRow\(/.test(SHARED) && /<NoteRow note=\{e\}/.test(TL)
    && /<NoteRow key=\{n\.id\} note=\{n\}/.test(PAGE))
  t('🔴 a stage change renders no controls at all',
    /e\.kind === 'stage_change'\s*\n\s*\? <span className="text-slate-600">/.test(TL))

  // ── WHAT NONE OF THIS MAY TOUCH ──────────────────────────────────────────────────────────────
  t('🔴 still one nextStep call in the route', (SEND.match(/nextStep\(/g) || []).length === 1)
  t('🔴 still two logOutreachContact calls, and both are the one writer',
    (SEND.match(/logOutreachContact\(/g) || []).length === 2)
  /* ── 🔴 RESTATED (1 October 2026) — NOT SILENTLY RE-POINTED ────────────────────────────────────
   * This required `recordSendOverride` in the send route. That function is GONE: a waved guard used
   * to be written into the history as a `note` reading "Sent anyway: [already_sent] …", and a note is
   * the wrong shape for a fact about one email — it sits in the timeline as though a person typed it,
   * `NoteRow` offers Edit and Delete on it, and it names no email. The override lives on the sent
   * message's own row now. 🔴 WHAT THIS CHECK PROTECTED — that the guards still RUN and that waving
   * one through is still RECORDED SOMEWHERE — is asserted in both halves below, against the new
   * location. ⚠️ Existing "Sent anyway:" notes are untouched data; nothing migrates or deletes them. */
  t('🔴 the sequence guards still run', /evaluateGuards\(\{/.test(SEND))
  t('🔴 …and a waved guard is still recorded — on the message row, never as a note',
    /guard_override: wavedGuards\.map\(g => \(\{ id: g\.id, message: g\.message \}\)\)/.test(SEND)
    && !/recordSendOverride/.test(SEND) && !/'Sent anyway/.test(SEND))
  t('🔴 EMAIL_FRAME_SANDBOX is unchanged',
    /sandbox=\{EMAIL_FRAME_SANDBOX\}/.test(SHARED) && !/allow-scripts/.test(SHARED))
  return { ok, bad }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const libVariant = (tag, file, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ran-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, file)
    const src = fs.readFileSync(f, 'utf8')
    const out = patch(src)
    if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return buildLib(tmp, tag)
  }
  for (const [tag, label, file, patch] of [
    ['v1', 'V1 🔴 a follow-up to my own email is addressed to ME instead of the recipient',
      'lib/outreach-reply-rules.ts',
      s => s.replace("  const back = parent.direction === 'inbound' ? parent.from_address : parent.to_address",
        '  const back = parent.from_address')],
    ['v2', 'V2 🔴 a chaser is logged as `reply` — the ladder stands still and the chase can go twice',
      'lib/outreach-sequence.ts',
      s => s.replace("  if (input.hasParent && input.inConversation) return 'reply'", "  if (input.hasParent) return 'reply'")],
    ['v3', 'V3 unticking "Include previous email" also drops the threading headers',
      'lib/outreach-mail-message.ts',
      s => s.replace('    inReplyTo: input.parent.messageId,', '    inReplyTo: withQuote ? input.parent.messageId : null,')],
  ]) {
    const libs = libVariant(tag, file, patch)
    const r = runReplySuite(libs)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  const SEND_SRC = read('app/api/admin/outreach/mail-send/route.ts')
  const EVENTS_SRC = read('lib/outreach-events.ts')
  for (const [label, over] of [
    ['V4 🔴 an Outlook send can be recorded twice — two rungs for one email',
      { SEND: SEND_SRC.replace("if (row.contact_id) return refuse('That message is already logged.')", '') }],
    ['V5 🔴 a test send can be recorded as a step',
      { SEND: SEND_SRC.replace("if (row.is_test) return refuse('A test send is not a contact, so it is never logged.')", '') }],
    ['V6 🔴 a stage_change can be deleted',
      { EVENTS: EVENTS_SRC.replace(".delete().eq('id', id).eq('kind', 'note')", ".delete().eq('id', id)") }],
    ['V7 🔴 …or edited',
      { EVENTS: EVENTS_SRC.replace(".update(patch).eq('id', id).eq('kind', 'note')", ".update(patch).eq('id', id)") }],
  ]) {
    const r = runCensus(over)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  const libs = buildLib(REPO, 'real')
  const show = (title, r) => {
    console.log(`\n${title}`)
    for (const n of r.ok) console.log('  ✓ ' + n)
    for (const n of r.bad) console.log('  🔴 ' + n)
    fails += r.bad.length
    return r
  }
  const a = show('── 1 · REPLYING TO ANY EMAIL ───────────────────────────────────────────────────────────', runReplySuite(libs))
  const b = show('── 1–3 · THE SCREENS AND THE WRITERS ───────────────────────────────────────────────────', runCensus())

  /* 🔴 STALE ANCHORS, RESTATED IN PLACE (30 September 2026):
   *   outreach-crm-reply-attach.cjs
   *     • "Reply is offered on a real inbound message and nowhere else" — it is offered on a SENT
   *       email too now, which is the whole of item 1. What that check protected is unchanged and is
   *       asserted here: a TEST send is still never replyable, and the recipient is still drawn from
   *       a closed set. */

  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
