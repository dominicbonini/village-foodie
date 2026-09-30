#!/usr/bin/env node
// scripts/outreach-workspace-v3.cjs — the v3 corrections: a bare composer, notes that are always
// there, a Call button that calls, one row per event, and a queue that says its own name.
//   node scripts/outreach-workspace-v3.cjs   (≈ 5 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    a Call button that does not call — the one thing on the card with a phone number on it; a
//    display de-duplication that HIDES a record, which is worse than showing two; a composer whose
//    chrome pushes the history off the screen, which is the complaint this build exists to answer;
//    a preview that shows "Hi Stephen," on every row and therefore says nothing; and a queue
//    counter naming a list that does not exist.
//
// HOW: the REAL libs compiled from lib/, plus a source census over the page, the composer and the
// timeline.
const fs = require('fs'); const path = require('path'); const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const eq = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`  ${ok ? '✓' : '🔴'} ${label}`)
  if (!ok) { console.log(`      want: ${JSON.stringify(want)}`); console.log(`      got:  ${JSON.stringify(got)}`); fails++ }
}

const FILES = ['lib/outreach-timeline.ts', 'lib/outreach-workspace.ts', 'lib/outreach-queue.ts']
function build(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return {
    T: req('lib/outreach-timeline.js'),
    W: req('lib/outreach-workspace.js'),
    Q: req('lib/outreach-queue.js'),
  }
}

const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const readStripped = f => stripComments(read(f))

const msg = (over = {}) => ({
  id: 'm1', direction: 'outbound', status: 'sent', is_test: false,
  subject: 'Taking orders online', message_date: '2026-09-16T13:29:00Z', ...over,
})
const contact = (over = {}) => ({
  id: 'c1', channel: 'email', direction: 'outbound', kind: '1_first_contact',
  contacted_at: '2026-09-16', message: 'sent the plans', email_message_id: null, ...over,
})

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, file, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `w3-${tag}-`))
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
    /* V1 — THE PAIRING STOPS REFUSING AMBIGUITY. Two emails and one hand log on one day: whichever
     * email it picks, it HIDES a row, and the hidden one is the record somebody went looking for.
     * ⚠️ RE-ANCHORED (30 September 2026, v4 fixes) AND THE REASON IS WORTH KEEPING: the day rule's
     * line changed shape when the SECOND rule was added beside it — ambiguity now falls through to
     * a comparison of the opening WORDS rather than straight to `continue`. The rule this variant
     * breaks is the same one, and the fixtures below still carry no matching text, so the words
     * rule cannot pair them either: what is asserted is still "ambiguity pairs nothing". */
    const v = variant('v1', 'lib/outreach-timeline.ts', src => src.replace(
      '    if (ms.length === 1 && cs.length === 1) {',
      '    if (ms.length >= 1 && cs.length === 1) {'))
    const out = v.T.pairHandLoggedEmails({
      messages: [msg(), msg({ id: 'm2', subject: 'Second one' })],
      contacts: [contact()],
    })
    variantFails('V1', out.hidden.size === 1,
      'two emails and one hand log on one day are paired anyway — a guess that hides a row')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V2 — THE PAIRING IGNORES DIRECTION. An email OUT and a call-back logged IN on the same day
    // would collapse into one row, which is two different events reported as one.
    const v = variant('v2', 'lib/outreach-timeline.ts', src => src.replace(
      "    `${day}|${String(direction ?? '').toLowerCase()}`", '    `${day}`'))
    const out = v.T.pairHandLoggedEmails({
      messages: [msg({ direction: 'outbound' })],
      contacts: [contact({ direction: 'inbound' })],
    })
    variantFails('V2', out.hidden.size === 1, 'an outbound email absorbs an INBOUND hand-logged contact')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V3 — THE PAIRING TAKES A LINKED CONTACT TOO. Those are already de-duplicated by
    // `buildTimeline`; pairing them again would mark a system send "also logged by hand" when
    // nobody logged anything.
    const v = variant('v3', 'lib/outreach-timeline.ts', src => src.replace(
      "  !c.email_message_id && String(c.channel ?? '').toLowerCase() === 'email'",
      "  String(c.channel ?? '').toLowerCase() === 'email'"))
    const out = v.T.pairHandLoggedEmails({
      messages: [msg()], contacts: [contact({ email_message_id: 'm1' })],
    })
    variantFails('V3', out.pairs.size === 1, 'a contact already linked to its message is paired again')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V4 — THE PREVIEW STOPS SKIPPING GREETINGS. Every row reads "Hi Stephen," and the column
    // becomes decoration.
    const v = variant('v4', 'lib/outreach-timeline.ts', src => src.replace(
      '    if (!line || isGreetingLine(line)) continue', '    if (!line) continue'))
    const out = v.T.meaningfulPreview('Hi Stephen,\n\nAre you still taking orders by phone?', 'Subject')
    variantFails('V4', out === 'Hi Stephen,', 'the preview is the greeting, on every single row')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V5 — THE PREVIEW STOPS FALLING BACK. A message that is only a greeting shows an empty row,
    // which reads as "they sent nothing".
    const v = variant('v5', 'lib/outreach-timeline.ts', src => src.replace(
      "  return String(subject ?? '').trim()", "  return ''"))
    variantFails('V5', v.T.meaningfulPreview('Hi Stephen,', 'Taking orders online') === '',
      'a greeting-only email shows a blank row instead of its subject')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V6 — THE LEFT COLUMN GOES BACK TO 300px. It holds prose — an address, a paragraph about the
    // truck — and 300px wraps every email address onto two lines.
    const v = variant('v6', 'lib/outreach-workspace.ts', src => src.replace(
      'export const COL_LEFT_PX = 380', 'export const COL_LEFT_PX = 300'))
    variantFails('V6', v.W.COL_LEFT_PX === 300, 'the notes column is narrower than the buttons column')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  const { T, W, Q } = build(REPO, 'w3Real')

  console.log('\n── ONE ROW PER EVENT, AND NOTHING HIDDEN ON A GUESS ─────────────────────────────────────')
  {
    // 🔴 THE ORDINARY CASE: one email out, one hand-logged email contact, same day, same direction.
    const one = T.pairHandLoggedEmails({ messages: [msg()], contacts: [contact()] })
    eq([...one.pairs.keys()], ['m1'], '🔴 the email and the hand log are one event…')
    eq([...one.hidden], ['c1'], '…and the thin row is the one that stands down')
    eq(one.pairs.get('m1').message, 'sent the plans', '⚠️ …with its text kept, to show under the email')

    // 🔴 AMBIGUITY PAIRS NOTHING. Both of these show every row.
    const twoMails = T.pairHandLoggedEmails({
      messages: [msg(), msg({ id: 'm2' })], contacts: [contact()],
    })
    eq([twoMails.pairs.size, twoMails.hidden.size], [0, 0],
      '🔴 two emails and one hand log that day ⇒ pair NOTHING, show all three')
    const twoLogs = T.pairHandLoggedEmails({
      messages: [msg()], contacts: [contact(), contact({ id: 'c2' })],
    })
    eq([twoLogs.pairs.size, twoLogs.hidden.size], [0, 0], '…and so does one email with two hand logs')

    // ⚠️ THE THINGS THAT ARE NOT THE SAME EVENT.
    const otherDay = T.pairHandLoggedEmails({ messages: [msg()], contacts: [contact({ contacted_at: '2026-09-17' })] })
    eq(otherDay.hidden.size, 0, 'a different day is a different event')
    const otherDir = T.pairHandLoggedEmails({ messages: [msg()], contacts: [contact({ direction: 'inbound' })] })
    eq(otherDir.hidden.size, 0, '🔴 a different direction is a different event')
    const phone = T.pairHandLoggedEmails({ messages: [msg()], contacts: [contact({ channel: 'phone' })] })
    eq(phone.hidden.size, 0, '🔴 a CALL logged the same day is not the email — only email contacts pair')
    const linked = T.pairHandLoggedEmails({ messages: [msg()], contacts: [contact({ email_message_id: 'm1' })] })
    eq(linked.hidden.size, 0, '…and one already linked to its message is left to the existing rule')
    const test = T.pairHandLoggedEmails({ messages: [msg({ is_test: true })], contacts: [contact()] })
    eq(test.hidden.size, 0, '⚠️ a TEST send is not correspondence and can never be the logged email')

    // 🔴 DISPLAY ONLY. The pairing is a Map handed to the builder; nothing deletes.
    const LIB = readStripped('lib/outreach-timeline.ts')
    check(!/\.delete\(|DELETE|\.remove\(/.test(LIB), '🔴 nothing in the timeline lib deletes anything')
    const built = T.buildTimeline({
      messages: [msg()], contacts: [contact()], events: [], pairing: one,
    })
    eq(built.map(i => i.id), ['m1'], '…and the built timeline shows the email alone')
    const unpaired = T.buildTimeline({ messages: [msg()], contacts: [contact()], events: [] })
    eq(unpaired.length, 2, '⚠️ …while WITHOUT the pairing it still shows both, exactly as before')

    // ⚠️ THE SAME DAY MEANS THE LONDON DAY.
    eq(T.londonDay('2026-09-16T23:30:00Z'), '2026-09-17',
      '🔴 23:30Z in September is the NEXT day in London — BST, and the dates on screen say so')
    eq(T.londonDay('2026-09-16'), '2026-09-16', '⚠️ a date-only value is already a day and is not shifted')
    eq(T.londonDay(null), '', 'and nothing in is nothing out')

    const TL = readStripped('components/admin/ProspectTimeline.tsx')
    check(/pairHandLoggedEmails\(\{/.test(TL), 'the timeline component asks for the pairing…')
    check(/also logged by hand/.test(TL), '…marks the row it produced…')
    /* ⚠️ RESTATED TWICE. (v4): the row does not open any more — an email opens in the reading panel,
     * and the hand-logged sentence went with the body it belongs under. (v4 fixes): it is no longer
     * printed above the body at all, because for the Between Buns email that "sentence" was the
     * whole email as plain text and the panel showed it twice. THE RULE IS STILL THE SAME ONE:
     * hiding the contact row must never hide what it carried. So the marker is always shown, and
     * the text is one click away whenever it says something the email does not. */
    check(/Also logged by hand/.test(readStripped('components/admin/EmailReadingPanel.tsx'))
      && /Show what was logged by hand/.test(readStripped('components/admin/EmailReadingPanel.tsx')),
      '…and the logged text is still reachable from the reading panel when it differs')
  }

  console.log('\n── A PREVIEW THAT SAYS SOMETHING ────────────────────────────────────────────────────────')
  {
    const p = (t, s) => T.meaningfulPreview(t, s)
    eq(p('Hi Stephen,\n\nAre you still taking orders by phone?', 'Subject'),
      'Are you still taking orders by phone?', '🔴 the greeting is skipped and the first real line shows')
    for (const g of ['Hi,', 'Hello,', 'Hello', 'Hey Sam', 'Dear Sir', 'Dear Mr Bonini,', 'Morning Stephen',
      'Good morning,', 'Good afternoon Sam,', 'Greetings,']) {
      eq(p(`${g}\nThe real line.`, 'Subject'), 'The real line.', `…"${g}" is a greeting`)
    }
    eq(p('Hi Stephen,', 'Taking orders online'), 'Taking orders online',
      '🔴 a greeting-only email falls back to its SUBJECT, never to a blank row')
    eq(p('', 'Taking orders online'), 'Taking orders online', '…and so does an empty one')
    eq(p(null, null), '', 'nothing at all is empty, which is the only honest answer')
    eq(p('Thanks — that works.', 'Subject'), 'Thanks — that works.',
      '⚠️ a message with no greeting is untouched')
    eq(p('Hi there, can you send the plans?', 'Subject'), 'Hi there, can you send the plans?',
      '🔴 a greeting with the sentence ON THE SAME LINE is NOT skipped — that line carries the words')
    check(p('x'.repeat(300), 'S').endsWith('…'), 'a very long line is cut with an ellipsis')
    check(T.isGreetingLine('Hi Stephen,') && !T.isGreetingLine('Hi Stephen, are you free?'),
      '⚠️ and the predicate itself draws that line')
  }

  console.log('\n── THE CALL BUTTON PLACES THE CALL ──────────────────────────────────────────────────────')
  {
    /* 🔴 v2 SAID "Call · copy" ON A DESKTOP AND THAT WAS THE WRONG ANSWER. Its reasoning — that a
     * `tel:` link hands off to a protocol handler and takes focus — was right about the symptom and
     * wrong about the remedy: a Mac hands `tel:` to FaceTime, which rings through the iPhone on the
     * same Apple ID, and that is exactly the thing the button is for.
     * ⚠️ THREE v2 CHECKS ARE REMOVED WITH IT, and they are named in the report:
     *   • "it asks whether this is a handset — the pointer, not the window width"
     *   • "…and on a desktop COPIES the number instead of yanking focus into FaceTime"
     *   • "…dials on a phone…" (which asserted `location.href`, now an anchor click)
     * What replaces them is below: one behaviour, every device, and no navigation. */
    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    check(/function CallButton\(/.test(PAGE), 'Call is a button, not a link in a sentence')
    check(!/matchMedia/.test(PAGE), '🔴 nothing branches on pointer type any more')
    check(!/clipboard/.test(PAGE.slice(PAGE.indexOf('function CallButton'), PAGE.indexOf('function CallButton') + 1600)),
      '🔴 …and it never copies the number instead of calling')
    check(/const a = document\.createElement\('a'\)/.test(PAGE) && /a\.href = `tel:\$\{number\}`/.test(PAGE),
      '🔴 it clicks a programmatically created tel: anchor')
    check(/a\.click\(\)/.test(PAGE) && /a\.remove\(\)/.test(PAGE), '…and takes it away again')
    check(!/a\.target/.test(PAGE), '🔴 with NO target, so no blank tab is left behind')
    // ⚠️ SCOPED TO THE BUTTON. `window.open` appears once more on this page — opening a signed
    // attachment URL in a new tab, which is what a download IS — and a page-wide census would have
    // banned a correct use to prove a point about a different control.
    const callFn = PAGE.slice(PAGE.indexOf('function CallButton'), PAGE.indexOf('function CallButton') + 1800)
    check(!/window\.open/.test(callFn), '…and no window.open in the Call button')
    const dial = PAGE.slice(PAGE.indexOf('const dial = ()'), PAGE.indexOf('const dial = ()') + 500)
    check(!/location\.href/.test(dial),
      '🔴 …and it does NOT navigate: assigning location.href starts unloading a page holding a draft')
    check(/e164 \? `\+\$\{e164\.replace\(\/\\D\/g, ''\)\}`/.test(PAGE),
      '⚠️ the number is dialled in E.164 — bare international digits would dial as a national number')
    check(/select-all/.test(PAGE), '⚠️ and the number itself is still plain selectable text')
  }

  console.log('\n── THE INLINE COMPOSER HAS NO WINDOW CHROME ─────────────────────────────────────────────')
  {
    const CW = read('components/admin/ComposeWindow.tsx')
    // 🔴 THE HEADING AND THE CLOSE BUTTON ARE BEHIND `!inline`. Both still exist for the portalled
    // window, which is a window and needs a way out.
    check(/\{!inline && \(\s*\n\s*<div className="flex items-center gap-3 px-5 py-3 border-b/.test(CW),
      '🔴 the "Compose — <name>" header and Close render only when NOT inline')
    const inlineClass = CW.slice(CW.indexOf('className={inline'), CW.indexOf('className={inline') + 700)
    check(/\? 'w-full flex flex-col'/.test(inlineClass),
      '🔴 …and inline there is no card, no border and no shadow — no box within a box')
    check(/inline \? 'space-y-2'/.test(CW), '⚠️ and the gaps are tighter, because 84px of nothing is three history rows')
    check(CW.includes("maxHeight={inline || expanded ? undefined : '75vh'}"),
      '🔴 the inline editor has NO ceiling and therefore no inner scrollbar — the page scrolls')

    const ED = read('components/admin/RichEmailEditor.tsx')
    check(/min-height: 8\.5rem/.test(ED), '🔴 the empty editor is ~6 lines, not sixteen')
    // ⚠️ STRIPPED: the comment beside it RECORDS that it used to be 22rem, which is exactly the
    // kind of self-matching census this harness family has had to fix once already.
    check(!/22rem/.test(stripComments(ED)), '…and the 22rem box is gone from the code entirely')
    check(/Write here, or pick a template/.test(ED), 'with a short placeholder…')
    check(/pointer-events-none absolute/.test(ED),
      '⚠️ …rendered as an overlay, so it can never be mistaken for text and can never be sent')

    const PAGE = read('components/admin/ProspectWorkspace.tsx')
    check(/<ComposeWindow\s+inline/.test(PAGE), 'the page mounts it inline…')
    check(/<ProspectTimeline/.test(PAGE), '…with the history under it on every tab')
    const tabsAt = PAGE.indexOf("(['email', 'call', 'whatsapp'] as const)")
    const timelineAt = PAGE.indexOf('<ProspectTimeline')
    check(tabsAt > 0 && timelineAt > tabsAt, '…and in that order: tabs, composer, then history')
  }

  console.log('\n── NOTES ARE ALWAYS THERE ───────────────────────────────────────────────────────────────')
  {
    const PAGE = read('components/admin/ProspectWorkspace.tsx')
    /* 🔴 SIX CHECKS WERE REMOVED HERE ON 30 SEPTEMBER 2026 (v3 fixes), AND THEY ARE NAMED RATHER
     * THAN QUIETLY DELETED, because what they asserted was a SHAPE that has been merged away:
     *   • 'the standing notes are a labelled "About this truck" box…'
     *   • '…of six rows…'
     *   • '…with a confirmation after Save'
     *   • 'and "Add a note" is always visible beneath it'   (`function AddNoteCard(`)
     *   • '…writing through the existing note path'          (`prospect_id: prospectId`)
     *   • '⚠️ …writing the SAME `notes` column — no new one'  (still true, moved)
     * v3 split the left column into two boxes — one over the `notes` COLUMN, one over the timeline
     * — and at the moment of writing "rang, he is at Boxpark on Fridays" the page asked which of
     * them the sentence was for. There is one box now, and it writes a dated note.
     * ⚠️ WHAT THOSE CHECKS PROTECTED IS RE-ASSERTED, AND HARDER, in
     * `scripts/outreach-workspace-v3-fixes.cjs`: the note box floors at TEN rows and grows, the
     * `notes` column survives in full as "Earlier notes", it is written in exactly ONE place on
     * the page, and nothing copies it into a note. Only the two names are gone.
     * ⚠️ THE TWO KEPT BELOW ARE THE ONES ABOUT THE ONE BOX, and they still hold. */
    /* 🔴 RESTATED (v4), AND THE OLD CHECK WAS ASSERTING THE BUG. It required
     * `fieldSizing: 'content'` on the page and called it "…that grows with what is in it". The
     * property does grow a box — and it also SHRINKS one, replacing `rows` entirely, so the
     * ten-row note box rendered as a single line in Safari and in Chrome. The growing is done in
     * JS now, by `GrowingTextarea`, and `rows` is left meaning what it means. */
    check(!/fieldSizing/.test(PAGE), '🔴 no box on the page depends on `field-sizing` any more…')
    check(/<GrowingTextarea /.test(PAGE) && !/<textarea /.test(PAGE),
      '…and every one of them grows through the one component')
    check(/action: 'add_note', prospect_id: p\.id/.test(PAGE),
      '…writing through the existing note path, into the history')
    // 🔴 THE NOTE TAB IS GONE.
    const stripped = stripComments(PAGE)
    check(/type Panel = 'email' \| 'call' \| 'whatsapp'/.test(stripped), '🔴 the Note TAB is gone…')
    check(!/'note'/.test(stripped.slice(stripped.indexOf('const tabs'), stripped.indexOf('const tabs') + 200)) &&
      /\(\['email', 'call', 'whatsapp'\] as const\)/.test(stripped),
      '…and the tab strip has three tabs')
    check(!/function NoteBox\(/.test(stripped) && !/function PinnedNotes\(/.test(stripped),
      '🔴 …and the components they replaced are deleted, not left beside them')
    check(/L\.focusNoteBox\(\)/.test(stripped) && /const ADD_NOTE_ID = 'hg-add-note'/.test(stripped),
      '⚠️ N now focuses the box rather than opening a tab')
    check(/onClick=\{focusNoteBox\}/.test(stripped), "…and so does the phone bar's Note button")
  }

  console.log('\n── COLUMN WIDTHS ───────────────────────────────────────────────────────────────────────')
  {
    eq([W.COL_LEFT_PX, W.COL_RIGHT_PX], [380, 280], '🔴 left 380, right 280 — the prose column is the wide one')
    eq([W.COL_LEFT_WIDE_PX, W.COL_RIGHT_WIDE_PX], [420, 320], '…420 / 320 on a 1920 monitor')
    eq(W.WIDE_AT_PX, 1920, '…which is where the step is')
    eq([W.THREE_COL_AT_PX, W.TWO_COL_AT_PX], [1024, 768], '⚠️ the column COUNT breakpoints are unchanged')
    /* 🔴 TWO CHECKS RESTATED HERE ON 30 SEPTEMBER 2026 (v3 fixes), with the reason:
     *   • '🔴 fixed sides, fluid centre, from those constants' — it matched the TEMPLATE STRING
     *     that the page built inline. The page no longer builds one: the whole decision is
     *     `gridTemplateFor(width)` in the lib, because a template assembled beside a
     *     `max-lg:grid-cols-1` class that could never beat it is how a phone was served a
     *     380/1fr/280 grid for two builds without any check noticing.
     *   • '…and the step is read from the window' — it pinned `window.innerWidth >= WIDE_AT_PX`.
     *     The page still reads `window.innerWidth`; what it does with it moved into the function.
     * ⚠️ BOTH ARE NOW ASSERTED AGAINST THE FUNCTION ITSELF, at seven widths, in
     * `scripts/outreach-workspace-v3-fixes.cjs` — which is a stronger statement than either
     * string was, and one a browser was then made to agree with. */
    const PAGE = read('components/admin/ProspectWorkspace.tsx')
    check(/gridTemplateFor\(vw\)/.test(PAGE), '🔴 fixed sides, fluid centre, from ONE function…')
    check(/window\.innerWidth/.test(PAGE), '…and the width is still read from the window')
  }

  console.log('\n── THE QUEUE SAYS ITS OWN NAME ──────────────────────────────────────────────────────────')
  {
    const PANEL = readStripped('components/admin/OutreachPanel.tsx')
    check(!/'the list'/.test(PANEL), "🔴 \"the list\" is gone from the list…")
    check(/label: 'All prospects', ids: visibleIdsRef\.current/.test(PANEL), '…replaced by "All prospects"')
    check(/label: 'Replies waiting'/.test(PANEL) && /label: 'Chasers due'/.test(PANEL)
      && /label: 'Follow-ups due'/.test(PANEL) && /label: 'Emails needing a look'/.test(PANEL),
      "…and Today's sections already carried their own names")
    eq(Q.readQueue({ getItem: () => JSON.stringify({ ids: ['a'], returnTo: '/x' }), setItem() {}, removeItem() {} }).label,
      'All prospects', '⚠️ a stored queue with no label falls back to the list\'s real name')

    const PAGE = read('components/admin/ProspectWorkspace.tsx')
    check(/\{pos && \(/.test(PAGE), '🔴 the ‹ n of m › control renders ONLY when there is a queue…')
    check(!/\{pos \? `\$\{pos\.index\} of \$\{pos\.total\}` : '—'\}/.test(PAGE),
      '…and the "—" placeholder with two dead arrows is gone')
    check(/<span className="text-xs text-slate-500 mr-1 max-md:hidden">\{queue\?\.label\}<\/span>/.test(PAGE),
      '…with the queue named beside it')
  }

  console.log('\n── WHAT v3 DID NOT CHANGE ───────────────────────────────────────────────────────────────')
  {
    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    eq((PAGE.match(/nextStep\(/g) || []).length, 1, '🔴 still one `nextStep` call on the page')
    check(/action: 'log_contact'/.test(PAGE) && !/outreach_contacts/.test(PAGE),
      '🔴 still one contact writer, and the page never touches the table')
    eq((PAGE.match(/next_action_at: /g) || []).length, 2,
      '🔴 still two assignments of `next_action_at` — the chosen date, and the delete-revert')
    check(/const applyFollowUp = useCallback/.test(PAGE), '…and the chosen one is still `applyFollowUp`')
    eq((PAGE.match(/OUTREACH_STAGES\.map/g) || []).length, 1, 'still exactly one stage control')
    const SHARED = readStripped('components/admin/outreach-shared.tsx')
    check(/sandbox=\{EMAIL_FRAME_SANDBOX\}/.test(SHARED) && !/allow-scripts/.test(SHARED),
      '🔴 EMAIL_FRAME_SANDBOX is unchanged, and scripts are still off')
    eq(W.EMAIL_FRAME_SANDBOX, 'allow-same-origin', '…still that one token')
    check(!/dangerouslySetInnerHTML/.test(PAGE + SHARED), 'no mailbox HTML is injected anywhere')
    check(/onChange=\{e => void onPatch\(\{ do_not_contact: e\.target\.checked \? true : null \}\)\}/.test(PAGE),
      '🔴 do_not_contact still moves only on a click')
  }

  console.log(`\n${fails === 0 ? '✅ ALL CHECKS PASSED' : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
