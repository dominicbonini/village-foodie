#!/usr/bin/env node
// scripts/outreach-workspace-v4.cjs — the reading panel, the email box, and the Safari fixes.
//   node scripts/outreach-workspace-v4.cjs          (≈ 4 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//   HG_RENDER=1 node scripts/outreach-workspace-v4.cjs   (adds the Chromium + WebKit measurement)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    the Email tab rendering its NON-EMAIL branch again — no To line, no Send row, no rich editor,
//    which is what production has been doing since reply mode landed and what nobody caught because
//    every check asked the source whether the blocks EXIST rather than whether they RENDER;
//    a box whose height depends on `field-sizing`, which replaces `rows` and collapsed a ten-row
//    note box to one line in Safari;
//    a stored editor height used unvalidated — "999999" is a Send button nobody can reach;
//    an email that opens in the list again, five lines above the fold;
//    and the panel stepping with a wrap, so the same email is read twice as though it were two.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const FILES = ['lib/outreach-workspace.ts']
function buildLib(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return req('lib/outreach-workspace.js')
}

const CW_FILE = 'components/admin/ComposeWindow.tsx'
const ED_FILE = 'components/admin/RichEmailEditor.tsx'
const TL_FILE = 'components/admin/ProspectTimeline.tsx'
const PANEL_FILE = 'components/admin/EmailReadingPanel.tsx'
const PAGE_FILE = 'components/admin/ProspectWorkspace.tsx'
const SHARED_FILE = 'components/admin/outreach-shared.tsx'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 0 · THE EMAIL TAB IS THE EMAIL TAB
// ════════════════════════════════════════════════════════════════════════════════════════════════
function runComposerSuite(rawCW, rawED) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const CW = stripComments(rawCW)
  const ED = stripComments(rawED)

  // 🔴 THE CAUSE, PINNED. `selected?.channel === 'email'` is false when nothing is selected.
  t("🔴 the channel falls back to email when no template is chosen — Blank is an EMAIL",
    /const isEmailChannel = \(selected\?\.channel \?\? 'email'\) === 'email'/.test(CW))
  t('…and the old form, which made Blank a non-email, is gone',
    !/const isEmailChannel = selected\?\.channel === 'email'/.test(CW))
  t('🔴 the To line is not behind `isEmail` any more',
    !/\{isEmail && \(\s*\n\s*<div className="flex flex-wrap items-baseline gap-x-3/.test(CW))
  t('🔴 …and neither is the Send row', !/\{isEmail && !sendingOff && \(/.test(CW))
  t('🔴 Send says why it is off, in a sentence, on hover',
    /title=\{sendBlock/.test(CW) && /const sendBlock: string \| null =/.test(CW))
  t('…and so does Send test to me', /title=\{testBlock/.test(CW) && /const testBlock: string \| null =/.test(CW))
  t('⚠️ the reasons are in priority order and name the missing thing',
    /'This prospect has no email address'/.test(CW) && /'Write something, or pick a template, first'/.test(CW))
  t('🔴 "is there anything to send" reads the DOCUMENT, not the template body',
    /const hasText = plainForHumans\.trim\(\)\.length > 0/.test(CW))
  t('⚠️ the plain textarea is now the WhatsApp box only, and it is 8 rows inline',
    /<GrowingTextarea rows=\{inline \? 8 : 18\}/.test(CW))

  // ── 1 · THE EMAIL BOX ────────────────────────────────────────────────────────────────────────
  t('🔴 the inline editor is given a FIXED height', /height=\{inline && !expanded \? boxHeight : undefined\}/.test(CW))
  t('…and reports a drag back', /onHeightChange=\{inline && !expanded \? rememberHeight : undefined\}/.test(CW))
  t('🔴 the stored height is validated against this window, never used raw',
    /validComposeHeight\(window\.localStorage\.getItem\(COMPOSE_BOX_HEIGHT_KEY\), window\.innerHeight\)/.test(CW))
  t('🔴 …and what is written back is clamped first',
    /const clamped = clampComposeHeight\(px, /.test(CW) && /setItem\(COMPOSE_BOX_HEIGHT_KEY, String\(clamped\)\)/.test(CW))
  t('⚠️ every storage call is wrapped — a private window must not break the composer',
    (CW.match(/try \{[^}]*localStorage[^}]*\} catch/g) || []).length >= 2)
  t('⚠️ …and it is read in a microtask after mount, not during render',
    /void Promise\.resolve\(\)\.then\(\(\) => \{[\s\S]{0,400}COMPOSE_BOX_HEIGHT_KEY/.test(CW))
  t('🔴 the editor scrolls inside itself and carries the grip',
    /\{ height, overflowY: 'auto', resize: 'vertical' \}/.test(ED))
  t('🔴 …and only a drag reports a height — never a click or a keystroke',
    /if \(from != null && now !== from\) onHeightChange\?\.\(now\)/.test(ED))
  t('⚠️ the empty space below the text still focuses the editor',
    /editor\.commands\.focus\('end'\)/.test(ED))
  t('⚠️ the ⤢ writing view survives, and is uncapped', /onExpand/.test(ED) && /expanded/.test(ED))
  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · TEN ROWS MEANS TEN ROWS
// ════════════════════════════════════════════════════════════════════════════════════════════════
function runTextareaSuite(rawPage, rawShared, rawCW) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const PAGE = stripComments(rawPage)
  const SHARED = stripComments(rawShared)
  const CW = stripComments(rawCW)

  t('🔴 nothing on the page depends on `field-sizing` any more',
    !/fieldSizing/.test(PAGE) && !/field-sizing/.test(PAGE))
  t('🔴 …and no raw <textarea> is left on the page to regress',
    !/<textarea /.test(PAGE))
  t('…every one of them is the one component', (PAGE.match(/<GrowingTextarea /g) || []).length >= 3)
  t('…including the composer\'s WhatsApp box', /<GrowingTextarea /.test(CW))
  t('🔴 the component measures its floor from the element\'s OWN line-height and padding',
    /parseFloat\(cs\.lineHeight\)/.test(SHARED) && /line \* rows \+ extra/.test(SHARED))
  t('🔴 …and resets to `auto` first, or scrollHeight only ever ratchets upward',
    /el\.style\.height = 'auto'/.test(SHARED))
  t('⚠️ a dragged height wins over the auto-growing from then on',
    /dragged\.current = true/.test(SHARED) && /if \(!el \|\| dragged\.current\) return/.test(SHARED))
  t('⚠️ it re-measures when the value changes from outside', /useEffect\(\(\) => \{ grow\(\) \}, \[grow, value\]\)/.test(SHARED))
  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE READING PANEL
// ════════════════════════════════════════════════════════════════════════════════════════════════
function runPanelSuite(rawTL, rawPanel, rawShared) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const TL = stripComments(rawTL)
  const P = stripComments(rawPanel)

  t('🔴 an EMAIL row opens the panel…', /<EmailReadingPanel/.test(TL))
  /* ⚠️ SCOPED TO THE EMAIL BRANCH. The CONTACT branch still carries `{open && (` and still should:
   * a call's one recorded sentence belongs under the row it happened on. A page-wide search for
   * that string would have banned the behaviour being kept in order to assert the one being
   * removed — the same mistake the v3 `window.open` census made once. */
  const emailBranch = TL.slice(TL.indexOf('const m = item.message'))
  t('🔴 …and nothing expands under an email row any more', !/\{open && \(/.test(emailBranch))
  t('🔴 a CONTACT row still expands in place', /const open = expandAll \|\| expandedId === item\.id/.test(TL))
  t('⚠️ …and a note or a stage change is still one line that does not open at all',
    /A NOTE OR A STAGE CHANGE: ONE LINE/.test(rawTL))
  t('🔴 one id drives both: the page\'s `expandedId`',
    /const openEmail = useMemo\(/.test(TL) && /onOpen=\{onExpand\}/.test(TL))
  t('…so Escape (the page\'s) closes the panel', /onClose=\{\(\) => onExpand\(null\)\}/.test(TL))
  t('🔴 the arrows walk the emails ON SCREEN, in screen order',
    /const emailIds = useMemo\(\(\) => shown\.filter\(i => i\.type === 'email'\)\.map\(i => i\.id\)/.test(TL))
  t('🔴 the open row is highlighted…', /ring-2 ring-inset ring-slate-400/.test(TL))
  t('…carries the `tl-<id>` the Files card and the panel both use', /id=\{`tl-\$\{item\.id\}`\}/.test(TL))
  t('…and says so to a screen reader', /aria-expanded=\{open\}/.test(TL))

  t('🔴 the panel is fixed to the right, below the page header',
    /className="fixed right-0 bg-white border-l/.test(P) && /PAGE_HEADER_ID/.test(P))
  t('…full height, with its own scroll', /style=\{\{ top, bottom: 0, width, zIndex: 80 \}\}/.test(P)
    && /flex-1 min-h-0 overflow-y-auto/.test(P))
  t('🔴 ↑ and ↓ step, and only when there is somewhere to step',
    /e\.key === 'ArrowUp' && L\.prev/.test(P) && /e\.key === 'ArrowDown' && L\.next/.test(P))
  t('⚠️ …and never while something is being typed into',
    /t\.isContentEditable \|\| \/\^\(input\|textarea\|select\)\$\/i\.test\(t\.tagName\)/.test(P))
  t('🔴 focus goes back to the row it came from', /document\.getElementById\(`tl-\$\{message\.id\}`\)\?\.focus\(\)/.test(P))
  t('🔴 the body is the ONE viewer, keyed by id so stepping refetches',
    /<EmailBody key=\{message\.id\} rowId=\{message\.id\} hideMeta/.test(P))
  t('🔴 …and the panel renders no mailbox markup of its own',
    !/dangerouslySetInnerHTML/.test(P) && !/sandbox=/.test(P))
  /* 🔴 RESTATED (30 September 2026, v4 fixes), AND THE OLD CHECK WAS PINNING A BUG. It required
   * "Logged by hand:" above the body. For the Between Buns email of 18 September that "sentence"
   * was the ENTIRE EMAIL as plain text, printed above the formatted copy of itself — the panel
   * showed the same words twice, the worse copy first. What it was protecting is kept and is
   * asserted harder in `outreach-workspace-v4-fixes.cjs`: the fact that it was also logged by hand
   * is ALWAYS said, and the text itself is one click away whenever it adds something the email does
   * not. Nothing that was written down can be lost; it simply is not printed twice. */
  t('⚠️ the hand log is marked, and its text is reachable when it differs',
    /Also logged by hand · \{fmtDay\(/.test(P) && /Show what was logged by hand/.test(P))
  t('⚠️ the header carries direction, from, to, date and subject',
    /Received' : 'Sent'/.test(P) && /From<\/span>/.test(P) && /To<\/span>/.test(P) && /fmtWhen\(message\.message_date/.test(P))
  t('🔴 Reply closes the panel first, then calls the page\'s existing reply',
    /onClick=\{\(\) => \{ onClose\(\); actions\.onReply\(m\) \}\}/.test(TL))
  /* 🔴 RESTATED (30 September 2026, reply-to-any): Reply is offered on a SENT email too, which is
   * the whole of that build's item 1 — following up on my own email with it quoted underneath, the
   * way Outlook does it. WHAT THE CHECK WAS PROTECTING IS UNCHANGED and is asserted here: a TEST
   * send is never replyable, because it went to Dominic's own address and there is nobody at the
   * other end of it. */
  t('⚠️ …never for a test send, and only for a message that actually went or arrived',
    /!m\.is_test && \(m\.status === 'received' \|\| m\.status === 'sent'\)/.test(TL))
  t('⚠️ a phone gets a sheet with a Back button', /\{phone \? '← Back' : '×'\}/.test(P))
  t('🔴 the attachments come from the viewer, with their download links',
    /<AttachmentList attachments=\{data\.attachments\}/.test(stripComments(rawShared)))
  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
function runLibSuite(W) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)

  // ── THE EMAIL BOX'S BAND ─────────────────────────────────────────────────────────────────────
  t('🔴 the box opens at about twelve lines', W.COMPOSE_DEFAULT_LINES === 12 && W.COMPOSE_DEFAULT_PX === 300)
  t('⚠️ the floor is six lines', W.COMPOSE_MIN_LINES === 6 && W.composeHeightForLines(6) === 156)
  t('🔴 the ceiling is 80% of the WINDOW, not a constant',
    W.composeHeightBounds(800).max === 640 && W.composeHeightBounds(1440).max === 1152)
  t('⚠️ …and a short window still gets six lines rather than something too small to write in',
    W.composeHeightBounds(180).max === 156)
  t('🔴 a height saved on a monitor is CLAMPED to this laptop, not thrown away',
    W.clampComposeHeight(1100, 800) === 640)
  t('…and one below the floor comes back up to it', W.clampComposeHeight(40, 800) === 156)
  t('🔴 junk in storage reads as nothing at all',
    W.validComposeHeight('abc', 800) === null && W.validComposeHeight('', 800) === null
    && W.validComposeHeight(null, 800) === null && W.validComposeHeight('300px', 800) === null)
  t('🔴 …and so does a zero or negative height', W.validComposeHeight('0', 800) === null && W.validComposeHeight('-9', 800) === null)
  t('🔴 a hostile "999999" becomes 80% of the window, not a Send button off the screen',
    W.validComposeHeight('999999', 800) === 640)
  t('✓ an ordinary drag survives exactly', W.validComposeHeight('420', 800) === 420)
  t('⚠️ one key, per browser, versioned', W.COMPOSE_BOX_HEIGHT_KEY === 'hg.outreach.composeHeight.v1')

  // ── THE PANEL ────────────────────────────────────────────────────────────────────────────────
  t('🔴 the panel is 55% of the window…', W.readingPanelWidth(1440) === 792)
  t('…capped at 960, so a 27" monitor does not get a 1400px line length',
    W.readingPanelWidth(2560) === 960 && W.readingPanelWidth(1920) === 960)
  t('🔴 …and a phone gets the whole screen', W.readingPanelWidth(390) === 390 && W.readingPanelWidth(767) === 767)
  t('⚠️ 768 is the first width that gets a panel rather than a sheet', W.readingPanelWidth(768) === 422)

  const ids = ['a', 'b', 'c']
  t('🔴 ↑ is the row above and ↓ is the row below', W.stepEmailId(ids, 'b', -1) === 'a' && W.stepEmailId(ids, 'b', 1) === 'c')
  t('🔴 it CLAMPS, it does not wrap — reading the same email twice is worse than stopping',
    W.stepEmailId(ids, 'a', -1) === null && W.stepEmailId(ids, 'c', 1) === null)
  t('⚠️ an id that is not on screen steps nowhere', W.stepEmailId(ids, 'zz', 1) === null)
  t('⚠️ …and nothing open steps nowhere', W.stepEmailId(ids, null, 1) === null)
  t('🔴 EMAIL_FRAME_SANDBOX is untouched', W.EMAIL_FRAME_SANDBOX === 'allow-same-origin')
  t('⚠️ …and the note box is still ten rows', W.NOTE_BOX_ROWS === 10)
  return { ok, bad }
}

const CW_SRC = read(CW_FILE), ED_SRC = read(ED_FILE), TL_SRC = read(TL_FILE)
const PANEL_SRC = read(PANEL_FILE), PAGE_SRC = read(PAGE_FILE), SHARED_SRC = read(SHARED_FILE)

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variants = [
    ['V1 🔴 the Email tab renders its non-email branch again (the production bug)',
      () => [runComposerSuite(CW_SRC.replace("const isEmailChannel = (selected?.channel ?? 'email') === 'email'",
        "const isEmailChannel = selected?.channel === 'email'"), ED_SRC)]],
    ['V2 the Send row is hidden again instead of saying why it is off',
      () => [runComposerSuite(CW_SRC.replace('              {(\n                <>\n                  <button onClick={() => askSend(true)}',
        '              {isEmail && !sendingOff && (\n                <>\n                  <button onClick={() => askSend(true)}'), ED_SRC)]],
    ['V3 🔴 the editor grows with its content again — the Send row and the history go below the fold',
      () => [runComposerSuite(CW_SRC.replace('height={inline && !expanded ? boxHeight : undefined}', ''), ED_SRC)]],
    ['V4 🔴 the stored height is used raw — "999999" is obeyed',
      () => [runComposerSuite(CW_SRC.replace(
        'validComposeHeight(window.localStorage.getItem(COMPOSE_BOX_HEIGHT_KEY), window.innerHeight)',
        'Number(window.localStorage.getItem(COMPOSE_BOX_HEIGHT_KEY))'), ED_SRC)]],
    ['V5 🔴 `field-sizing` comes back to the note box — one line in Safari',
      () => [runTextareaSuite(PAGE_SRC.replace('<GrowingTextarea id={ADD_NOTE_ID} rows={NOTE_BOX_ROWS}',
        "<textarea style={{ fieldSizing: 'content' }} id={ADD_NOTE_ID} rows={NOTE_BOX_ROWS}"), SHARED_SRC, CW_SRC)]],
    ['V6 the auto-size forgets to reset to `auto` and the box only ever grows',
      () => [runTextareaSuite(PAGE_SRC, SHARED_SRC.replace("    el.style.height = 'auto'\n", ''), CW_SRC)]],
    ['V7 🔴 an email expands in the list again instead of opening the panel',
      () => [runPanelSuite(TL_SRC.replace('<EmailReadingPanel', '<NothingAtAll'), PANEL_SRC, SHARED_SRC)]],
    ['V8 🔴 the panel renders the mailbox HTML itself instead of going through the one viewer',
      () => [runPanelSuite(TL_SRC, PANEL_SRC.replace('<EmailBody key={message.id} rowId={message.id} hideMeta',
        '<div dangerouslySetInnerHTML={{ __html: html }} data-x={1} hideMeta'), SHARED_SRC)]],
    ['V9 the panel keeps focus when it closes, instead of handing it back to the row',
      () => [runPanelSuite(TL_SRC, PANEL_SRC.replace('document.getElementById(`tl-${message.id}`)?.focus()', 'void 0'), SHARED_SRC)]],
  ]
  for (const [label, run] of variants) {
    const results = run()
    const bad = results.flatMap(r => r.bad)
    const caught = bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED — check the patch applied.'); process.exit(1) }
  }

  const libVariant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `v4-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/outreach-workspace.ts')
    const src = fs.readFileSync(f, 'utf8')
    const out = patch(src)
    if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return buildLib(tmp, tag)
  }
  for (const [tag, label, patch] of [
    ['v10', 'V10 🔴 the panel stepping WRAPS — the same email read twice as though it were two',
      s => s.replace('  if (next < 0 || next >= ids.length) return null\n  return ids[next]',
        '  return ids[(next + ids.length) % ids.length]')],
    ['v11', 'V11 🔴 the editor height is no longer clamped to the window',
      s => s.replace('  return Math.min(max, Math.max(min, Math.round(px)))', '  return Math.round(px)')],
    ['v12', 'V12 the panel is a fixed 55% even on a phone — a 214px column',
      s => s.replace('  if (viewportWidth < TWO_COL_AT_PX) return viewportWidth\n', '')],
  ]) {
    const r = runLibSuite(libVariant(tag, patch))
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  const show = (title, r) => {
    console.log(`\n${title}`)
    for (const n of r.ok) console.log('  ✓ ' + n)
    for (const n of r.bad) console.log('  🔴 ' + n)
    fails += r.bad.length
    return r
  }
  const W = buildLib(REPO, 'real')
  const lib = show('── THE NUMBERS ─────────────────────────────────────────────────────────────────────────', runLibSuite(W))
  const comp = show('── 0–1 · THE EMAIL TAB AND ITS BOX ─────────────────────────────────────────────────────', runComposerSuite(CW_SRC, ED_SRC))
  const ta = show('── 2 · TEN ROWS MEANS TEN ROWS ─────────────────────────────────────────────────────────', runTextareaSuite(PAGE_SRC, SHARED_SRC, CW_SRC))
  const panel = show('── 3 · THE READING PANEL ───────────────────────────────────────────────────────────────', runPanelSuite(TL_SRC, PANEL_SRC, SHARED_SRC))

  /* 🔴 STALE ANCHORS, RESTATED IN PLACE (30 September 2026, v4). Each is restated in the file that
   * owns it, with its reason, not deleted here:
   *   outreach-workspace-v3.cjs
   *     • "🔴 the inline editor has NO ceiling and therefore no inner scrollbar — the page scrolls"
   *       — REVERSED BY THIS BUILD, at Dominic's instruction. v3 made the box grow without limit so
   *       a long email never scrolled inside itself; what that produced was a Send button and a
   *       whole history pushed below the fold on a 1440×800 laptop. The box is now a fixed height
   *       with its own scrollbar, dragged and remembered.
   *     • "…that grows with what is in it" (`fieldSizing: 'content'`) — that check was ASSERTING
   *       THE BUG: the property replaces `rows` where it is supported, so the ten-row note box
   *       rendered as one line in Safari and in Chrome.
   *     • "…and shows the logged text when the row is opened" — the row does not open; the panel does.
   *   outreach-workspace.cjs
   *     • "…and the timeline opens an email through that viewer" — `EmailBody` moved into the panel.
   *   outreach-crm-today.cjs
   *     • "…which the timeline opens rather than rendering markup of its own" — same move; the rule
   *       is now asserted across both files.
   *   outreach-workspace-v3-fixes.cjs
   *     • "the box floors at NOTE_BOX_ROWS rows and grows" — same floor, different grower. */

  console.log('\n── A REAL BROWSER — CHROMIUM AND WEBKIT ────────────────────────────────────────────────')
  if (process.env.HG_RENDER !== '1') {
    console.log('  ⚠️ SKIPPED — set HG_RENDER=1 to run it. It needs `.next/static` from a build and local')
    console.log('     browser builds, and the sweep must not depend on either. The run is in the report.')
  } else {
    const { measure } = require('./outreach-workspace-render.cjs')
    const res = await measure()
    for (const line of res.lines) console.log('  ' + line)
    fails += res.fails
  }

  const total = lib.ok.length + comp.ok.length + ta.ok.length + panel.ok.length
  console.log(`\n${fails === 0 ? `✅ all ${total} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
