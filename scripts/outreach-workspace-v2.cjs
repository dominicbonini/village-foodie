#!/usr/bin/env node
// scripts/outreach-workspace-v2.cjs — the three-column workspace: what opens, what one click writes,
// what a follow-up chip means, and how an email is sized and framed.
//   node scripts/outreach-workspace-v2.cjs   (≈ 6 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    a one-click log writing a LADDER RUNG on a prospect who has already replied — the live bug this
//    build fixes, because §57 derives the next step from exactly that column; a second follow-up
//    rule, so the chip says one date and the database holds another; a composer that opens on a
//    chase while the banner says somebody is waiting; an email frame carrying `allow-scripts`, which
//    would let a prospect's markup run inside an authenticated admin page; a quoted-history split
//    that hides something they actually wrote; or a fixed-height editor, which is the complaint this
//    whole redesign started from.
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

const FILES = [
  'lib/outreach-workspace.ts', 'lib/outreach-quote-split.ts', 'lib/outreach-step.ts',
  'lib/outreach-attention.ts', 'lib/outreach.ts',
]
function build(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return {
    W: req('lib/outreach-workspace.js'),
    Q: req('lib/outreach-quote-split.js'),
    S: req('lib/outreach-step.js'),
    O: req('lib/outreach.js'),
  }
}

const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const readStripped = f => stripComments(read(f))

const TODAY = '2026-09-30'
const step = (over = {}) => ({
  state: 'due', kind: '2_chase_1', dueOn: '2026-09-18', label: 'Chase 1', channel: null,
  leadType: 'not_listed', leadTypeFrozen: false, stopReason: null, rungsDone: 1, blindRows: 0, ...over,
})

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, file, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `w2-${tag}-`))
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
    // V1 — THE ONE-CLICK KIND FALLS BACK TO THE FIRST RUNG. This IS the live bug: a call to a
    // prospect who has replied is recorded as a first contact, and §57 reads that column.
    const v = variant('v1', 'lib/outreach-workspace.ts', src => src.replace(
      "  if (hasReplied) return 'reply'", "  if (hasReplied) return '1_first_contact'"))
    variantFails('V1', v.W.oneClickKind(step({ state: 'stopped', stopReason: 'replied' }), true) === '1_first_contact',
      'a call to a prospect who has replied is logged as a FIRST CONTACT')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V2 — THE KIND IS TAKEN FROM A STOPPED STEP. `nextStep` returns `kind: null` for every stop, so
    // the log would carry an empty kind — a blind row, which is what makes a step 'unknown'.
    const v = variant('v2', 'lib/outreach-workspace.ts', src => src.replace(
      "  if (step && (step.state === 'due' || step.state === 'scheduled') && step.kind) return step.kind",
      '  if (step) return step.kind as string'))
    const got = v.W.oneClickKind(step({ state: 'complete', kind: null }), false)
    variantFails('V2', got === null || got === undefined,
      'a stopped step yields a null kind — an unreadable contact row')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V3 — THE COMPOSER STOPS FOLLOWING THE NEXT LINE. The banner says "reply to Stephen" and the
    // box opens a chase template: two answers to one question, on one screen.
    const v = variant('v3', 'lib/outreach-workspace.ts', src => src.replace(
      "  if (next?.kind === 'reply') return { mode: 'reply', replyToMessageId: next.messageId, templateKind: null }",
      '  // removed'))
    const m = v.W.composerDefault({ kind: 'reply', messageId: 'm1', label: '', cta: '', waitingDays: 2 }, { everEmailed: true })
    variantFails('V3', m.mode !== 'reply', 'a waiting reply does not open the composer in reply mode')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V4 — THE FOLLOW-UP DEFAULT STOPS ASKING `followUpDateFor`. A second interval table is the
    // drift that cannot be seen: the chip says one date and the server stores another.
    const v = variant('v4', 'lib/outreach-workspace.ts', src => src.replace(
      '  const due = kind ? followUpDateFor(kind, today) : null',
      "  const due = kind ? addDays(today, 5) : null"))
    const got = v.W.defaultFollowUpChoice('1_first_contact', TODAY, () => '2026-10-03')
    variantFails('V4', got.date === '2026-10-05',
      'the chip ignores the one interval rule and invents its own')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V5 — THE FRAME GETS `allow-scripts`. With `allow-same-origin` beside it, a prospect's markup
    // could run inside an authenticated admin page AND remove its own sandbox.
    const v = variant('v5', 'lib/outreach-workspace.ts', src => src.replace(
      "export const EMAIL_FRAME_SANDBOX = 'allow-same-origin'",
      "export const EMAIL_FRAME_SANDBOX = 'allow-same-origin allow-scripts'"))
    variantFails('V5', v.W.sandboxIsSafe(v.W.EMAIL_FRAME_SANDBOX) === false,
      'the email frame is given allow-scripts alongside allow-same-origin')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V6 — THE FRAME STOPS BEING CAPPED. An email taller than the window makes the PAGE scroll past
    // the row it belongs to, and the row's own buttons go with it.
    const v = variant('v6', 'lib/outreach-workspace.ts', src => src.replace(
      '  return Math.min(cap, Math.max(FRAME_MIN_PX, Math.ceil(contentPx)))',
      '  return Math.max(FRAME_MIN_PX, Math.ceil(contentPx))'))
    variantFails('V6', v.W.frameHeight(9000, 900) === 9000, 'a 9000px email gets a 9000px frame')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V7 — THE QUOTE SPLIT STOPS FALLING BACK. An email with no recognisable quote marker would be
    // shown as nothing at all, with everything behind "Show quoted text".
    const v = variant('v7', 'lib/outreach-quote-split.ts', src => src.replace(
      '  if (bestAt <= 0 || !bestMarker) return { main: s, quoted: null, marker: null }',
      "  if (bestAt <= 0 || !bestMarker) return { main: '', quoted: s, marker: null }"))
    const out = v.Q.splitQuotedHtml('<p>Just a plain reply with no quote at all.</p>')
    variantFails('V7', out.main === '', 'an email with no quote marker is hidden behind Show quoted text')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V8 — THE SPLIT ACCEPTS AN EMPTY NEW PART. An email that is nothing but a quote would show an
    // empty box, which reads as "they sent nothing".
    const v = variant('v8', 'lib/outreach-quote-split.ts', src => src.replace(
      '  if (!textOf(main).trim()) return { main: s, quoted: null, marker: null }', '  // removed'))
    const out = v.Q.splitQuotedHtml('<div> </div><div id="divRplyFwdMsg">quoted only</div>')
    variantFails('V8', out.quoted !== null && !out.main.includes('quoted only'),
      'an email that is nothing but a quote is shown as an empty message')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  const { W, Q, S, O } = build(REPO, 'w2Real')

  console.log('\n── THE COMPOSER OPENS ON WHAT THE NEXT LINE SAYS ────────────────────────────────────────')
  {
    const reply = { kind: 'reply', messageId: 'm7', label: 'x', cta: 'Reply →', waitingDays: 2 }
    const chase = { kind: 'chase', rung: '2_chase_1', label: 'Chase 1 due 18 Sept', cta: 'Send Chase 1 →', dueOn: '2026-09-18', daysOverdue: 12 }
    const follow = { kind: 'follow_up', due: '2026-09-16', label: 'x', cta: 'Follow up →', daysOverdue: 14 }
    const none = { kind: 'none', label: 'No next step', reason: 'Replied', cta: null }

    eq(W.composerDefault(reply, { everEmailed: true }), { mode: 'reply', replyToMessageId: 'm7', templateKind: null },
      '🔴 a waiting reply ⇒ reply mode, on THAT message')
    eq(W.composerDefault(chase, { everEmailed: true }), { mode: 'chase', replyToMessageId: null, templateKind: '2_chase_1' },
      "🔴 a due chase ⇒ that step's rung, which `templateForStep` turns into a template")
    eq(W.composerDefault(follow, { everEmailed: true }), { mode: 'thread', replyToMessageId: null, templateKind: null },
      '🔴 a follow-up ⇒ the existing thread, no template')
    eq(W.composerDefault(none, { everEmailed: true }), { mode: 'thread', replyToMessageId: null, templateKind: null },
      '…and so does a prospect who has replied')
    eq(W.composerDefault(none, { everEmailed: false }), { mode: 'first', replyToMessageId: null, templateKind: '1_first_contact' },
      '🔴 nobody emailed yet ⇒ a new thread on the first-contact template')
    eq(W.composerDefault(null, { everEmailed: false }).mode, 'first', 'no Next line at all behaves the same')
    eq(W.FIRST_CONTACT_KIND, O.CONTACT_KINDS[0], "⚠️ and the first rung is the LADDER's first rung, not a string typed twice")

    // 🔴 IT READS THE NEXT LINE AND DERIVES NOTHING. Census with the same predicate shown failing.
    const LIB = readStripped('lib/outreach-workspace.ts')
    const fn = LIB.slice(LIB.indexOf('export function composerDefault'), LIB.indexOf('export const ONE_CLICK_LOGS'))
    const derives = src => /nextStep\(|needsAttention\(|followUpDateFor\(/.test(src)
    check(!derives(fn), '🔴 `composerDefault` calls no derivation of its own…')
    check(derives(fn + '\nnextStep(p, c)'), '⚠️ …and the same census FAILS on a version that does')
    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    check(/composerDefault\(focus, \{ everEmailed \}\)/.test(PAGE),
      '…and the page feeds it the SAME `focus` the banner renders')
    check(/templateForStep\(step, offerable\)\.slug/.test(PAGE),
      '…with `templateForStep` still the one rule that turns a rung into a template')
  }

  console.log('\n── ONE CLICK WRITES ONE CONTACT, WITH THE RIGHT KIND ────────────────────────────────────')
  {
    eq(W.oneClickKind(step({ state: 'stopped', stopReason: 'replied', kind: null }), true), 'reply',
      '🔴 they have replied ⇒ `reply` — NOT a rung, so the sequence is not restarted')
    eq(W.oneClickKind(step({ kind: '2_chase_1' }), false), '2_chase_1',
      '🔴 mid-sequence ⇒ the rung `nextStep` says is next')
    eq(W.oneClickKind(step({ state: 'scheduled', kind: '3_chase_2' }), false), '3_chase_2',
      '…including one that is scheduled rather than due')
    eq(W.oneClickKind(step({ state: 'complete', kind: null }), false), 'reply',
      '⚠️ a finished sequence ⇒ `reply`, which records the call without moving a ladder that has ended')
    eq(W.oneClickKind(step({ state: 'unknown', kind: null, blindRows: 2 }), false), 'reply',
      '⚠️ …and so does an unreadable history, rather than guessing a rung')
    eq(W.oneClickKind(null, false), 'reply', 'no step at all behaves the same')

    // 🔴 EVERY KIND IT CAN RETURN IS ONE `nextStep` RECOGNISES — that is what stops it writing a
    // blind row, which is the thing that makes a step 'unknown' in the first place.
    for (const st of [step(), step({ kind: '1_first_contact' }), step({ state: 'complete', kind: null }), null]) {
      for (const replied of [true, false]) {
        const k = W.oneClickKind(st, replied)
        check(O.isKind(k), `🔴 \`${k}\` is a recognised kind`)
      }
    }
    eq(W.ONE_CLICK_LOGS.map(l => l.label),
      ['Called — no answer', 'Called — spoke', 'Left voicemail', 'WhatsApp sent'],
      'the four buttons, in the words they write')
    eq(W.ONE_CLICK_LOGS.map(l => l.channel), ['phone', 'phone', 'phone', 'whatsapp'],
      '…each on the channel it happened on')
    check(W.ONE_CLICK_LOGS.every(l => l.message === l.label),
      "⚠️ the logged message IS the button's words — no invented prose in the ladder")

    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    check(/action: 'log_contact', prospect_id: prospectId,\s*\n\s*channel: spec\.channel, direction: 'outbound', kind: oneClick,/.test(PAGE),
      '🔴 one click writes through the SAME `log_contact` path as everything else')
    check(/const contactId = typeof j\.id === 'string' \? j\.id : null/.test(PAGE)
      && /action: 'delete_contact', id: undoable\.id/.test(PAGE),
      '🔴 Undo deletes EXACTLY the contact just written, by the id the write returned')
    check(/setTimeout\(\(\) => setUndoable\(null\), 8000\)/.test(PAGE),
      '…and the offer lasts 8 seconds — the offer, not the contact')
  }

  console.log('\n── ONE FOLLOW-UP CONTROL ────────────────────────────────────────────────────────────────')
  {
    eq(W.followUpDateForChoice('tomorrow', TODAY), '2026-10-01', 'Tomorrow is tomorrow')
    eq(W.followUpDateForChoice('3_days', TODAY), '2026-10-03', '+3 days is three days')
    eq(W.followUpDateForChoice('1_week', TODAY), '2026-10-07', '+1 week is seven')
    eq(W.followUpDateForChoice('none', TODAY), null, 'None is no date')
    eq(W.addDays('2026-10-24', 7), '2026-10-31', '⚠️ and the arithmetic crosses the clock change intact')

    // 🔴 THE DEFAULT IS `followUpDateFor`'s ANSWER, and that function is handed in.
    const real = O.followUpDateFor
    eq(W.defaultFollowUpChoice('1_first_contact', TODAY, real), { choice: '3_days', date: '2026-10-03' },
      '🔴 a first contact defaults to the chip matching the ladder\'s own +3')
    eq(W.defaultFollowUpChoice('2_chase_1', TODAY, real), { choice: '1_week', date: '2026-10-07' },
      '…a chase to its +7')
    eq(W.defaultFollowUpChoice('reply', TODAY, real).choice, 'none',
      '⚠️ a reply schedules nothing, because `followUpDateFor` gives it no date')
    eq(W.defaultFollowUpChoice('1_first_contact', TODAY, () => '2026-11-11'),
      { choice: 'pick', date: '2026-11-11' },
      '🔴 a date no chip matches selects Pick HOLDING that date — never a chip that rounds it')

    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    check(/defaultFollowUpChoice\(oneClick, today, followUpDateFor\)/.test(PAGE),
      '…and the page seeds it from that same function')
    /* 🔴 THE FOLLOW-UP DATE HAS ONE WRITER, AND THE CENSUS NAMES THE SECOND WRITE RATHER THAN
     * PRETENDING IT IS NOT THERE. Two places on the page assign `next_action_at`:
     *   • `applyFollowUp` — the chosen date, from the single control. Send, the one-click buttons
     *     and the Call/WhatsApp tabs all reach it and nothing else writes the operator's choice.
     *   • the delete-contact path — which REVERTS the date a deleted rung implied, and only when
     *     the stored value still equals exactly that. It is an undo of an earlier write, not a
     *     second control, and it predates this build. Removing it would leave a future date on the
     *     queue pointing at a contact that no longer exists.
     * ⚠️ A THIRD WOULD FAIL THIS. */
    const writes = (PAGE.match(/next_action_at: /g) || []).length
    eq(writes, 2, '🔴 exactly two assignments of `next_action_at`, and both are accounted for')
    check(/const applyFollowUp = useCallback\(async \(kind: string\) => \{[\s\S]{0,400}?next_action_at: followUpDate/.test(PAGE),
      '🔴 …the chosen date is written ONLY by `applyFollowUp`, from the one control')
    check(/if \(revertTo !== pr\.next_action_at\) await post\(\{ action: 'update_prospect', id: pr\.id, next_action_at: revertTo \}\)/.test(PAGE),
      '⚠️ …and the other is the delete-contact revert, which undoes a date rather than choosing one')
    for (const caller of ['afterOneClick', 'onLog', 'applyFollowUp={applyFollowUp}']) {
      check(PAGE.includes(caller), `…which Send, one-click and the tabs all reach (${caller})`)
    }
    check(!/setNext\(|quickCls|Tomorrow<\/button>/.test(PAGE),
      '🔴 and the old per-form follow-up pickers are gone — no second control over one column')
  }

  console.log('\n── THE EMAIL IS READABLE AT FULL LENGTH ─────────────────────────────────────────────────')
  {
    eq(W.EMAIL_FRAME_SANDBOX, 'allow-same-origin', '🔴 one token, and it is not allow-scripts')
    check(W.sandboxIsSafe(W.EMAIL_FRAME_SANDBOX), '…which the safety test accepts')
    for (const bad of ['allow-scripts', 'allow-forms', 'allow-popups', 'allow-top-navigation']) {
      check(!W.sandboxIsSafe(`allow-same-origin ${bad}`), `🔴 …and rejects ${bad}`)
    }
    eq(W.frameHeight(400, 1000), 400, 'a short email gets exactly its own height')
    eq(W.frameHeight(9000, 1000), 800, '🔴 a long one is capped at 80% of the window, then scrolls inside')
    eq(W.frameHeight(0, 1000), W.FRAME_MIN_PX, '⚠️ a frame that reports nothing is still visibly a frame')

    const SHARED = readStripped('components/admin/outreach-shared.tsx')
    check(/sandbox=\{EMAIL_FRAME_SANDBOX\}/.test(SHARED), 'the frame reads the constant, not a literal')
    check(!/allow-scripts|allow-forms|allow-popups/.test(SHARED), '🔴 …and those tokens appear nowhere in it')
    check(/onLoad=\{measure\}/.test(SHARED) && /doc\.body\.scrollHeight/.test(SHARED),
      '…it measures the document it is showing')
    check(!/className="[^"]*\bh-80\b/.test(SHARED), '🔴 and the fixed 320px box is gone')

    // 🔴 THE EDITOR GROWS. No fixed height anywhere in its styles.
    /* 🔴 STALE ANCHORS, RESTATED RATHER THAN SILENTLY RE-POINTED (30 September 2026, v3). Two
     * numbers changed and both are corrections to this build, not drift:
     *   • the floor went 11rem → 8.5rem (~8 lines → ~6). An EMPTY box was still taking most of the
     *     space below the header on a 1440x800 screen and pushing History off the bottom.
     *   • the ceiling is gone INLINE. `75vh` was still a box you could lose the bottom of, and its
     *     scrollbar fought the page's. The floating window keeps the cap, because it is
     *     `position: fixed` and something has to scroll.
     * The RULE both checks exist for is unchanged and is what is re-asserted: a minimum, no fixed
     * height, and no inner scrollbar on the surface Dominic actually writes in. */
    const ED = readStripped('components/admin/RichEmailEditor.tsx')
    check(/min-height: 8\.5rem/.test(ED), 'the editor has a MINIMUM…')
    check(!/(?<!min-)height: 22rem|h-\[22rem\]/.test(ED), '🔴 …and no fixed height at all')
    check(/maxHeight && !expanded \? \{ maxHeight, overflowY: 'auto' \}/.test(ED),
      '…the only ceiling is the one the page passes')
    const CW = readStripped('components/admin/ComposeWindow.tsx')
    check(CW.includes("maxHeight={inline || expanded ? undefined : '75vh'}"),
      '🔴 …and INLINE there is none at all, so no email ever scrolls inside the box')
    check(/onExpand=\{expanded \? undefined : \(\) => setExpanded\(true\)\}/.test(CW), 'and ⤢ opens the writing view')
    check(/if \(expanded\) \{\s*\n\s*return createPortal\(/.test(CW), '…which is the same panel, full window')
    check(/e\.key !== 'Escape'/.test(CW) && /setExpanded\(false\)/.test(CW), '…and Esc returns')
  }

  console.log('\n── THE NEW PART OF AN EMAIL, FIRST ──────────────────────────────────────────────────────')
  {
    const body = '<p>Yes please — how do I sign up?</p>'
    for (const [wrap, name] of [
      [`<div id="divRplyFwdMsg">old</div>`, 'Outlook’s divRplyFwdMsg'],
      [`<div id="mail-editor-reference-message-container">old</div>`, 'our own reference block'],
      [`<div class="gmail_quote">old</div>`, 'Gmail’s gmail_quote'],
      [`<blockquote type="cite">old</blockquote>`, 'Apple Mail’s blockquote[type=cite]'],
      [`<div style="border-top:1pt solid #b5c4df"><b>From: </b>Dominic</div>`, 'Outlook’s rule line + From: block'],
    ]) {
      const out = Q.splitQuotedHtml(body + wrap)
      check(out.quoted !== null && out.main.includes('sign up') && !out.main.includes('old'),
        `🔴 ${name} splits the quote off`)
    }
    const plain = Q.splitQuotedHtml('<p>No quote here at all.</p>')
    eq([plain.quoted, plain.marker], [null, null], '🔴 no marker ⇒ no split…')
    check(plain.main.includes('No quote here at all.'), '…and the WHOLE email is shown')
    const quoteOnly = Q.splitQuotedHtml('<div> </div><div id="divRplyFwdMsg">only a quote</div>')
    check(quoteOnly.quoted === null && quoteOnly.main.includes('only a quote'),
      '🔴 an email that is nothing but a quote is shown whole, not as an empty message')
    const two = Q.splitQuotedHtml(`${body}<div class="gmail_quote">g</div><div id="divRplyFwdMsg">o</div>`)
    check(two.marker === 'gmail_quote', '⚠️ with two markers the EARLIEST wins — the new text ends at the first')
    // ⚠️ A BORDER ALONE IS NOT A QUOTE. Ordinary dividers and signatures use one.
    const divider = Q.splitQuotedHtml(`${body}<div style="border-top:1pt solid #ccc">Dominic Bonini</div>`)
    eq(divider.quoted, null, '🔴 a bordered signature is NOT mistaken for a quote block')
  }

  console.log('\n── THE LAYOUT ───────────────────────────────────────────────────────────────────────────')
  {
    /* 🔴 STALE ANCHORS, RESTATED (v3): the columns were 300/300 and are 380/280, stepping at 1920
     * rather than 1800. The left column holds PROSE — an address, a paragraph about the truck, a
     * note being written — and 300px wrapped every email address; the right holds buttons and did
     * not need the same. The rule this block asserts is unchanged: fixed sides, fluid centre, one
     * layout for a laptop and a monitor. */
    eq([W.COL_LEFT_PX, W.COL_RIGHT_PX], [380, 280], 'the side columns are fixed, and the prose one is wider…')
    eq([W.COL_LEFT_WIDE_PX, W.COL_RIGHT_WIDE_PX], [420, 320], '…420/320 past 1920px, and no wider')
    eq([W.THREE_COL_AT_PX, W.TWO_COL_AT_PX], [1024, 768],
      '⚠️ and the column COUNT breakpoints are untouched: three from 1024, two from 768')
    eq(W.TOUCH_TARGET_PX, 44, "⚠️ and a touch target is Apple's own 44px")

    /* 🔴 THREE CHECKS WERE REMOVED HERE ON 30 SEPTEMBER 2026 (v3 fixes), AND THEY ARE NAMED
     * RATHER THAN QUIETLY DELETED — one of them because IT WAS WRONG, not merely stale:
     *   • 'below 1024px it is one grid column…' (`max-lg:grid-cols-1`). The class WAS in the file
     *     and NEVER APPLIED: an inline `gridTemplateColumns` on the same element beats any
     *     selector-based rule that is not `!important`, and Tailwind emits none. This check passed
     *     for two builds while a phone was handed a 380px / 1fr / 280px grid. ⚠️ It also read the
     *     RAW source, so after the class was deleted it went on passing against the comment that
     *     records its deletion — the exact self-matching census this family has fixed twice.
     *   • '…with the centre column FIRST and the reference column second' (`max-lg:order-*`). The
     *     tablet flip is gone: at 768–1023 the two columns are side by side, so there is nothing
     *     left to reorder, and an `order` rule that is live from 0 to 1023 is a rule that fights
     *     the phone's own ordering below 768.
     *   • 'fixed sides, fluid centre — an inline style…' — still the design, but `minmax(0, 1fr)`
     *     now lives in `gridTemplateFor`, not in this file's page.
     * ⚠️ ALL THREE RULES ARE RE-ASSERTED IN `scripts/outreach-workspace-v3-fixes.cjs`, against the
     * function at seven widths and against a real browser at four — including that a phone gets
     * ONE track, which is the thing the deleted check claimed to be proving. */
    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    check(/gridTemplateColumns: columns/.test(PAGE) && /gridTemplateFor\(vw\)/.test(PAGE),
      '🔴 fixed sides, fluid centre — an inline style, because an arbitrary Tailwind track value may have no generated rule')
    check(!/max-lg:grid-cols-1/.test(PAGE) && !/max-lg:order-/.test(PAGE),
      '⚠️ …and no class is left trying to fight it')
    check(/hidden max-lg:flex max-md:hidden/.test(PAGE),
      "🔴 …and the right column's cards move to the top of the left one between 768 and 1023")
    check(/hidden max-md:flex fixed bottom-0/.test(PAGE), '🔴 the phone gets a sticky log bar…')
    check((PAGE.match(/min-h-11/g) || []).length >= 10, '…and its targets are 44px (min-h-11)')

    // 🔴 ORANGE IS RESERVED. Only the Send button and the Next banner may carry it.
    const orangeButtons = (PAGE.match(/className="[^"]*bg-orange-600[^"]*"/g) || [])
    eq(orangeButtons, [], '🔴 no orange BUTTON on the page itself…')
    const CW = read('components/admin/ComposeWindow.tsx')
    check(/bg-orange-600 text-white/.test(CW), '…the one orange button is Send, in the composer')
    check(/bg-amber-50/.test(PAGE) && /Next<\/span>/.test(PAGE), '…and the amber is the Next banner')
    const TL = read('components/admin/ProspectTimeline.tsx')
    check(!/orange/.test(TL), '🔴 …and nothing in the timeline is orange either')
  }

  console.log('\n── WHAT THE PAGE STILL KEEPS ────────────────────────────────────────────────────────────')
  {
    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    const TL = readStripped('components/admin/ProspectTimeline.tsx')
    const SHARED = readStripped('components/admin/outreach-shared.tsx')
    eq((PAGE.match(/nextStep\(/g) || []).length, 1, '🔴 `nextStep` is still called exactly once')
    check(/channelFor\(\{ \.\.\.prospect, waPhone \}\)/.test(PAGE), '…and contactability is still `channelFor`')
    check(/action: 'log_contact'/.test(PAGE) && !/outreach_contacts/.test(PAGE),
      '🔴 every contact still goes through the one writer, and the page never touches the table')
    check(/needsAttention\(m, \{ now, linkedTruck \}\)/.test(TL), 'the needs-attention predicate is unchanged')
    check(!/dangerouslySetInnerHTML/.test(PAGE + TL + SHARED),
      '🔴 no mailbox HTML is injected into the admin page anywhere')
    check(/onChange=\{e => void onPatch\(\{ do_not_contact: e\.target\.checked \? true : null \}\)\}/.test(PAGE),
      '🔴 do_not_contact still moves only on a click')
    eq((PAGE.match(/do_not_contact: e\.target\.checked/g) || []).length, 2,
      '…from the ⋯ menu and the right column, which are the same action')
    check(/storagePath/.test(PAGE), 'attachments are still addressed by storage path')
    // ⚠️ ONE STAGE CONTROL.
    eq((PAGE.match(/OUTREACH_STAGES\.map/g) || []).length, 1,
      '🔴 there is exactly ONE stage control on the page')
    check(/action: 'update_prospect', id: prospectId, \.\.\.p/.test(PAGE) || /update_prospect/.test(PAGE),
      '…and it writes through `update_prospect`, which records the stage change')
  }

  console.log('\n── THE CALL BUTTON ──────────────────────────────────────────────────────────────────────')
  {
    /* 🔴 THREE CHECKS WERE REMOVED HERE ON 30 SEPTEMBER 2026 (v3), AND THEY ARE NAMED RATHER THAN
     * QUIETLY DELETED, because what they asserted was a DECISION that has been reversed:
     *   • "it asks whether this is a handset — the pointer, not the window width"
     *   • "…dials on a phone…"  (which pinned `location.href = 'tel:…'`)
     *   • "…and on a desktop COPIES the number instead of yanking focus into FaceTime"
     * v2 refused to place the call on a laptop because `tel:` hands off to a protocol handler and
     * takes focus off the page. That was right about the symptom and wrong about the remedy: a Mac
     * hands `tel:` to FaceTime, which rings through the iPhone on the same Apple ID — which is the
     * thing the button is for. Dominic asked for it to call, everywhere.
     * ⚠️ WHAT SURVIVES IS THE PART THAT WAS ALWAYS RIGHT: it is a BUTTON, not a link wrapped round
     * the number, and the number stays selectable text. `scripts/outreach-workspace-v3.cjs` owns
     * the new behaviour in full — one path, every device, and no navigation. */
    const PAGE = readStripped('components/admin/ProspectWorkspace.tsx')
    check(/function CallButton\(/.test(PAGE), 'Call is a component, not a link in a sentence')
    check(!/href=\{p\.phone \? `tel:/.test(PAGE), '🔴 …and there is no `tel:` anchor in the markup')
    check(/select-all/.test(PAGE), '⚠️ and the number itself is selectable text, not a link')
  }

  console.log(`\n${fails === 0 ? '✅ ALL CHECKS PASSED' : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
