#!/usr/bin/env node
// scripts/outreach-workspace-v4-fixes.cjs — the six v4 fixes: the page scrolls, the attach buttons
// are on the toolbar, the edited banner tells the truth, the ambiguous day pairs by its words, the
// contact name is the headline, and the reading panel shows the email once.
//   node scripts/outreach-workspace-v4-fixes.cjs        (≈ 4 s: one compile, NO NETWORK, NO MAILBOX,
//   NO DATABASE. HG_RENDER=1 adds the Chromium + WebKit measurement.)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    the page not scrolling at all — the history is the reason the page exists and none of it could
//    be read past the fold, on production, in the browser Dominic uses;
//    a hand-logged note HIDDEN by a pairing that guessed — the second rule here pairs by WORDS, and
//    a wrong pair removes a record;
//    the reading panel printing the whole email as plain text above the formatted one;
//    two buttons parked on top of the text of the email being written;
//    and a banner that says "you have edited this" to somebody who has typed nothing.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const FILES = ['lib/outreach-timeline.ts']
function buildLib(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return req('lib/outreach-timeline.js')
}

const msg = (over = {}) => ({
  id: 'm1', direction: 'outbound', status: 'sent', is_test: false,
  subject: 'Ordering costs for Pig-Casso\'s', message_date: '2026-09-15T13:29:00Z', preview: null, ...over,
})
const contact = (over = {}) => ({
  id: 'c1', channel: 'email', direction: 'outbound', kind: '1_first_contact',
  contacted_at: '2026-09-15', message: null, email_message_id: null, ...over,
})

// 🧪 THE REAL CASE, as Dominic reported it: two outbound emails on 15 September and one hand-logged
// first contact whose text is the opening of the first of them.
const HAND = 'Hi Stephen,\n\nHi, I run villagefoodie.co.uk and I have been looking at how you take orders.'
const EMAIL_A = 'Hi Stephen,\nHi, I run villagefoodie.co.uk and I have been looking at how you take orders — a few thoughts.'
const EMAIL_B = 'Hi Stephen,\nWhen is a good time to speak? Free now if you like.'

function runPairingSuite(T) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const pair = (messages, contacts) => T.pairHandLoggedEmails({ messages, contacts })

  // ── RULE 1, UNCHANGED ────────────────────────────────────────────────────────────────────────
  {
    const r = pair([msg()], [contact({ message: 'sent the plans' })])
    t('🔴 one email and one hand log on a day are still one event', r.pairs.get('m1')?.id === 'c1' && r.hidden.has('c1'))
  }
  // ── RULE 2 · THE SAME OPENING WORDS ──────────────────────────────────────────────────────────
  {
    const r = pair(
      [msg({ id: 'mA', preview: EMAIL_A }), msg({ id: 'mB', preview: EMAIL_B })],
      [contact({ id: 'cA', message: HAND })])
    t('🔴 🧪 Pig-Casso\'s 15 Sept: two emails, one hand log — the WORDS pair it with the right email',
      r.pairs.get('mA')?.id === 'cA' && !r.pairs.has('mB') && r.hidden.has('cA'))
  }
  {
    const r = pair(
      [msg({ id: 'mA', preview: EMAIL_A }), msg({ id: 'mB', preview: EMAIL_A })],
      [contact({ id: 'cA', message: HAND })])
    t('🔴 two emails that open with the SAME words pair NOTHING — a guess here hides a record',
      r.pairs.size === 0 && r.hidden.size === 0)
  }
  {
    const r = pair(
      [msg({ id: 'mA', preview: EMAIL_A }), msg({ id: 'mB', preview: EMAIL_B })],
      [contact({ id: 'cA', message: 'rang him, no answer, will try Friday' })])
    t('🔴 a hand log that matches neither email pairs nothing', r.pairs.size === 0)
  }
  {
    const r = pair(
      [msg({ id: 'mA', preview: EMAIL_A }), msg({ id: 'mB', preview: EMAIL_B })],
      [contact({ id: 'cA', message: HAND }), contact({ id: 'cB', message: EMAIL_B })])
    t('⚠️ two hand logs, each matching a different email, pair separately',
      r.pairs.get('mA')?.id === 'cA' && r.pairs.get('mB')?.id === 'cB')
  }
  {
    const r = pair(
      [msg({ id: 'mA', preview: EMAIL_A }), msg({ id: 'mB', preview: EMAIL_B })],
      [contact({ id: 'cA', message: HAND }), contact({ id: 'cB', message: HAND })])
    t('🔴 two hand logs matching the SAME email pair only once — an email is never claimed twice',
      [...r.pairs.values()].length === 1)
  }
  {
    const r = pair(
      [msg({ id: 'mA', direction: 'outbound', preview: EMAIL_A }), msg({ id: 'mB', direction: 'inbound', preview: EMAIL_A })],
      [contact({ id: 'cA', direction: 'inbound', message: HAND })])
    t('🔴 direction still separates them: an inbound log cannot take an outbound email',
      r.pairs.get('mB')?.id === 'cA' && !r.pairs.has('mA'))
  }
  {
    const r = pair(
      [msg({ id: 'mA', is_test: true, preview: EMAIL_A }), msg({ id: 'mB', preview: EMAIL_B })],
      [contact({ id: 'cA', message: HAND })])
    t('⚠️ a TEST send can never be the email somebody logged', !r.pairs.has('mA'))
  }

  // ── THE KEY ITSELF ───────────────────────────────────────────────────────────────────────────
  t('🔴 case, whitespace, line breaks and curly quotes are all normalised',
    T.openingKey("Hi there,\r\n\r\nIt's   a\nGOOD day") === T.openingKey('Hi there,\nIt’s a good day'))
  t('🔴 the greeting is skipped on both sides, so "Hi Stephen," never matches "Hi George,"',
    T.openingKey('Hi Stephen,\nThe rate is £29.') === T.openingKey('Hi George,\nThe rate is £29.'))
  t('⚠️ only the first 60 characters are compared', T.OPENING_CHARS === 60)
  t('🔴 …and a longer email that merely BEGINS the same is cut to the same length before comparing',
    T.openingKey('one two three') === T.openingKey('one two three'))
  t('🔴 a wordless log has an empty key, and an empty key pairs nothing',
    T.openingKey('   ') === '' && T.openingKey(null) === '')
  return { ok, bad }
}

function runRedundancySuite(T) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const FULL = 'Hi George,\n\nApologies for the slow reply. The ordering costs are as follows, and I have attached the plans.'
  t('🔴 🧪 Between Buns 18 Sept: the hand log IS the email, so nothing of it is shown',
    T.handTextIsRedundant(FULL, FULL) === true)
  t('🔴 …and so is a hand log that is the opening of a longer email',
    T.handTextIsRedundant('Apologies for the slow reply.', FULL) === true)
  t('⚠️ …whatever the quotes and the line breaks did to it',
    T.handTextIsRedundant('Apologies for the slow reply.', 'Hi George,\r\nApologies for the slow reply.\r\nMore.') === true)
  t('🔴 a hand log that ADDS something is not redundant, and stays reachable',
    T.handTextIsRedundant('Rang him first; he asked for it in writing.', FULL) === false)
  t('🔴 "I cannot tell" is NOT redundant — a body that has not loaded must not hide what was typed',
    T.handTextIsRedundant('Rang him first.', null) === false)
  t('⚠️ an empty hand log is redundant: there is nothing to show', T.handTextIsRedundant('   ', FULL) === true)
  return { ok, bad }
}

function runCensus(srcOver = {}) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const CW = stripComments(srcOver.CW ?? read('components/admin/ComposeWindow.tsx'))
  const ED = stripComments(srcOver.ED ?? read('components/admin/RichEmailEditor.tsx'))
  const PAGE = stripComments(srcOver.PAGE ?? read('components/admin/ProspectWorkspace.tsx'))
  const PANEL = stripComments(srcOver.PANEL ?? read('components/admin/EmailReadingPanel.tsx'))
  const TL = stripComments(read('components/admin/ProspectTimeline.tsx'))
  const SHARED = stripComments(read('components/admin/outreach-shared.tsx'))

  // ── 1 · NOTHING LOCKS THE PAGE ───────────────────────────────────────────────────────────────
  t('🔴 the body scroll lock is gated: it runs for the window and the ⤢ view, never for the inline composer',
    /if \(inline && !expanded\) return\s*\n\s*const prev = document\.body\.style\.overflow/.test(CW))
  t('🔴 …and it still restores the PREVIOUS value rather than clearing it',
    /return \(\) => \{ document\.body\.style\.overflow = prev \}/.test(CW))
  t('🔴 the body is LOCKED in exactly one place, and released in the same one',
    (CW.match(/document\.body\.style\.overflow = 'hidden'/g) || []).length === 1
    && (CW.match(/document\.body\.style\.overflow = prev/g) || []).length === 1)
  t('⚠️ …and nowhere touches the documentElement\'s',
    !/documentElement\.style/.test(CW + PAGE + PANEL + TL + SHARED))
  // 🔴 THE WHEEL IS NOT SWALLOWED. The headless engines would not deliver a synthesised wheel, so
  // what is asserted is the structure that makes scroll chaining work.
  t('🔴 nothing in the outreach components listens for `wheel` at all',
    !/onWheel|addEventListener\('wheel'/.test(CW + ED + PAGE + PANEL + TL + SHARED))
  t('🔴 …and nothing contains the overscroll, so the editor hands the page the wheel at its own end',
    !/overscroll/.test(CW + ED + PAGE + PANEL + TL + SHARED))
  t('⚠️ the editor is still an `overflow-y: auto` box with a grip',
    /\{ height, overflowY: 'auto', resize: 'vertical' \}/.test(ED))

  // ── 2 · THE ATTACH CONTROLS ARE ON THE TOOLBAR ───────────────────────────────────────────────
  t('🔴 the attach buttons are passed to the editor toolbar…', /toolbarExtra=\{isEmail \? \(/.test(CW))
  t('…after a divider and before ⤢',
    /\{toolbarExtra && \(\s*\n\s*<>\s*\n\s*<span className="w-px h-4 bg-slate-200 mx-1" \/>\s*\n\s*\{toolbarExtra\}/.test(ED)
    && ED.indexOf('{toolbarExtra}') < ED.indexOf('aria-label="Expand the editor"'))
  t('🔴 …and NOTHING is pulled back inside the box with a negative margin',
    !/-mt-8/.test(CW))
  t('🔴 the chips render directly under the toolbar, inside the same border',
    /underToolbar=\{isEmail && files\.length > 0/.test(CW)
    && /\{underToolbar && \(\s*\n\s*<div className="border-b border-slate-200 px-2 py-1">/.test(ED))
  t('⚠️ …above the scroller, so they never move with the email',
    ED.indexOf('{underToolbar}') < ED.indexOf('ref={boxRef}'))
  t('⚠️ the attachment error line stays under the box it is about',
    /\{isEmail && \(fileError \|\| attachRefusal\) && \(/.test(CW))

  // ── 3 · THE EDITED BANNER ────────────────────────────────────────────────────────────────────
  t('🔴 an edit is a DIFFERENCE from the template render, not an onChange event',
    /if \(docPlainText\(d\)\.trim\(\) !== docPlainText\(templateDoc\)\.trim\(\)\) \{/.test(CW))
  t('🔴 …and the banner also needs a template to be about, so Blank never shows it',
    /\{edited && !!templateId && \(/.test(CW))

  // ── 5 · THE CONTACT NAME ─────────────────────────────────────────────────────────────────────
  t('🔴 the contact name is 18px, weight 800, with space under it',
    /className="text-\[18px\] font-extrabold leading-tight text-slate-900 mb-1"/.test(PAGE))
  t('⚠️ …on every screen, the phone included — there is no max-md variant of it',
    !/max-md:text-\[13px\]/.test(PAGE))
  t('⚠️ and the email and phone lines are untouched at 13px', /className="flex flex-col gap-1 text-\[13px\]"/.test(PAGE))

  // ── 6 · THE PANEL SHOWS THE EMAIL ONCE ───────────────────────────────────────────────────────
  t('🔴 the hand-logged text is never a block above the body',
    !/<span className="font-semibold">Logged by hand:<\/span>/.test(PANEL))
  t('🔴 the marker is a small line under the header', /Also logged by hand · \{fmtDay\(/.test(PANEL))
  t('🔴 …and the text is shown only when it ADDS something, behind one click',
    /!handTextIsRedundant\(handLogged\.message, emailText\)/.test(PANEL)
    && /Show what was logged by hand/.test(PANEL))
  t('🔴 …collapsed by default', /const showHand = handOpenFor === message\.id/.test(PANEL)
    && /useState<string \| null>\(null\)/.test(PANEL))
  t('⚠️ the comparison is made against the body this viewer loaded, keyed to this message',
    /onText=\{t => setLoaded\(\{ id: message\.id, text: t \}\)\}/.test(PANEL)
    && /loaded\?\.id === message\.id \? loaded\.text : null/.test(PANEL))
  t('⚠️ the history ROW keeps its marker', /also logged by hand/.test(TL))
  t('🔴 EMAIL_FRAME_SANDBOX is untouched and the panel still renders no markup of its own',
    !/dangerouslySetInnerHTML/.test(PANEL) && !/sandbox=/.test(PANEL))

  // ── WHAT NONE OF THIS MAY TOUCH ──────────────────────────────────────────────────────────────
  t('🔴 still one nextStep call on the page', (PAGE.match(/nextStep\(/g) || []).length === 1)
  t('🔴 still one contact writer', /action: 'log_contact'/.test(PAGE) && !/outreach_contacts/.test(PAGE))
  t('🔴 the sequence guards are still the composer\'s', /json\.needsConfirm === true/.test(CW))
  t('🔴 …and the step, not the template tag, is still what is logged',
    /const kindForSend = replyTo \? 'reply' : \(stepKind \?\? logFormKind\)/.test(CW))
  return { ok, bad }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const libVariant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `v4f-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/outreach-timeline.ts')
    const src = fs.readFileSync(f, 'utf8')
    const out = patch(src)
    if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return buildLib(tmp, tag)
  }
  const libVariants = [
    ['v1', 'V1 🔴 an ambiguous day is paired by guess — the first email wins', 'pair',
      s => s.replace('      if (matches.length !== 1) continue', '      if (matches.length === 0) continue')],
    ['v2', 'V2 the opening words are compared without normalising case or quotes', 'pair',
      s => s.replace("    .replace(/[’‘`]/g, \"'\")", '    .replace(/\\u0000/g, "")').replace('    .toLowerCase()', '')],
    ['v3', 'V3 🔴 the hand text is called redundant whenever the body has not loaded', 'red',
      s => s.replace('  if (!email) return false', '  if (!email) return true')],
  ]
  for (const [tag, label, which, patch] of libVariants) {
    const T = libVariant(tag, patch)
    const r = which === 'pair' ? runPairingSuite(T) : runRedundancySuite(T)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  const CW_SRC = read('components/admin/ComposeWindow.tsx')
  const PANEL_SRC = read('components/admin/EmailReadingPanel.tsx')
  const censusVariants = [
    ['V4 🔴 the scroll lock is left on for the inline composer — the page cannot scroll',
      { CW: CW_SRC.replace('    if (inline && !expanded) return\n', '') }],
    ['V5 🔴 the attach buttons are pulled back inside the editor box',
      { CW: CW_SRC.replace('toolbarExtra={isEmail ? (', 'toolbarExtraX={isEmail ? (')
        .replace("{isEmail && (fileError || attachRefusal) && (", "{isEmail && (\n<div className='-mt-8'>Attach file</div>) && (") }],
    ['V6 the edited banner is shown for Blank again',
      { CW: CW_SRC.replace('{edited && !!templateId && (', '{edited && (') }],
    ['V7 🔴 the hand-logged text is a block above the email again',
      { PANEL: PANEL_SRC.replace('<span>Also logged by hand · {fmtDay(',
        '<span className="font-semibold">Logged by hand:</span>{fmtDay(') }],
  ]
  for (const [label, over] of censusVariants) {
    const r = runCensus(over)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  const T = buildLib(REPO, 'real')
  const show = (title, r) => {
    console.log(`\n${title}`)
    for (const n of r.ok) console.log('  ✓ ' + n)
    for (const n of r.bad) console.log('  🔴 ' + n)
    fails += r.bad.length
    return r
  }
  const a = show('── 4 · ONE ROW PER EVENT, EVEN ON AN AMBIGUOUS DAY ─────────────────────────────────────', runPairingSuite(T))
  const b = show('── 6 · THE EMAIL, ONCE ────────────────────────────────────────────────────────────────', runRedundancySuite(T))
  const c = show('── 1, 2, 3, 5 · THE PAGE, THE TOOLBAR, THE BANNER, THE NAME ────────────────────────────', runCensus())

  /* 🔴 STALE ANCHORS, RESTATED IN PLACE (30 September 2026, v4 fixes):
   *   outreach-workspace-v4.cjs
   *     • "⚠️ the hand-logged sentence sits above the body" — it does not any more, and it must not:
   *       for the Between Buns email the "sentence" was the whole email as plain text, printed above
   *       the formatted copy of itself. The rule that replaced it is stronger and is asserted here —
   *       the marker always, the text only when it adds something, and never expanded by default.
   *     • the attach-row check, which pinned `-mt-8` as "the attach controls share the chips' row" —
   *       that negative margin is what put the buttons over the email text. */

  console.log('\n── A REAL BROWSER — CHROMIUM AND WEBKIT ────────────────────────────────────────────────')
  if (process.env.HG_RENDER !== '1') {
    console.log('  ⚠️ SKIPPED — set HG_RENDER=1. It needs a build and local browser builds; the run is in the report.')
  } else {
    const { measure } = require('./outreach-workspace-render.cjs')
    const res = await measure()
    for (const line of res.lines) console.log('  ' + line)
    fails += res.fails
  }

  const total = a.ok.length + b.ok.length + c.ok.length
  console.log(`\n${fails === 0 ? `✅ all ${total} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
