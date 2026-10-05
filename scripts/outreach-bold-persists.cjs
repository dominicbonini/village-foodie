#!/usr/bin/env node
// scripts/outreach-bold-persists.cjs — formatting a selection STAYS formatted.
//   node scripts/outreach-bold-persists.cjs               (fast: source invariants only, NO BROWSER)
//   HG_RENDER=1 node scripts/outreach-bold-persists.cjs   (adds Chromium + WebKit; needs esbuild)
//
// ── 🔴 THE BUG THIS EXISTS FOR (reported 5 October 2026, fixed the same day) ───────────────────────
// "Select all the text and press B — it all goes bold. Select it again and press B — it goes
//  not-bold. Click to deselect — the text switches BACK TO BOLD on its own."
// And, separately: "when I click on the message body the B button still turns on and off."
// 🔴 THE CAUSE WAS NOT IN THE EDITOR. ComposeWindow wrapped the whole message field — the toolbar
// included — in a `<label>`. A `<label>` forwards a click anywhere inside it to its labeled control,
// which is its FIRST labelable descendant, and `<button>` is labelable: the B button. So every
// mousedown in the message body dispatched a real activation click to Bold, which ran `toggleBold()`
// against the selection ProseMirror still held — the whole document. Italic was reported as working,
// and that is the clue that found it: a label activates exactly ONE control, and B is first.
//
// ⚠️ THE SOURCE CHECKS BELOW ARE THE CHEAP HALF AND THEY ARE NOT THE PROOF. The proof is
// scripts/outreach-bold-persists-render.cjs, which drives the real window in two engines. These exist
// so the invariant is re-checked in every sweep, on a machine with no browser.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
/** 🔴 CODE, NOT PROSE. Every count in this repo that was taken over a whole file has eventually been
 *  satisfied by a comment quoting the string it was looking for. */
const codeOf = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const ok = [], bad = []
const t = (n, c) => (c ? ok : bad).push(n)

function source() {
  const CW = codeOf(read('components/admin/ComposeWindow.tsx'))
  const ED = codeOf(read('components/admin/RichEmailEditor.tsx'))

  // ── 1 · NO `<label>` MAY ENCLOSE THE EDITOR ────────────────────────────────────────────────────
  /* 🔴 ASSERTED AS "THE MOUNT IS NOT INSIDE A label", not as "the file contains no label": the
   * Subject field's `<label>` is correct and must stay. The test takes the text from the last `<label`
   * before the mount to the first `</label>` after it, and asks whether that span contains the mount. */
  const mount = CW.indexOf('<RichEmailEditor')
  t('🔴 the editor is mounted in ComposeWindow at all (the anchor has not drifted)', mount > 0)
  if (mount > 0) {
    const openAt = CW.lastIndexOf('<label', mount)
    const closeAt = openAt < 0 ? -1 : CW.indexOf('</label>', openAt)
    const enclosed = openAt >= 0 && closeAt > mount
    t('🔴 NO <label> ENCLOSES THE RICH EDITOR — a label forwards body clicks to the B button', !enclosed)
  }
  // And the toolbar's own buttons, wherever they end up, must not be inside one either.
  const EDopen = ED.indexOf('<label')
  t('🔴 …and the editor file itself wraps nothing in a <label>', EDopen < 0)

  // ── 2 · THE LABEL TEXT SURVIVED THE CHANGE, FOR BOTH BOXES ─────────────────────────────────────
  /* ⚠️ REMOVING A `<label>` REMOVES AN ACCESSIBLE NAME unless something replaces it. The editor
   * carries `aria-label="Message"`; the WhatsApp textarea gets the same sentence the label showed. */
  t('⚠️ one constant holds the message label, so the visible text and the aria-label cannot diverge',
    /const MESSAGE_LABEL = /.test(CW))
  t('⚠️ the WhatsApp textarea carries that label as `aria-label` now the <label> is gone',
    /aria-label=\{MESSAGE_LABEL\(/.test(CW))
  t('⚠️ the rich editor still names its contenteditable for a screen reader',
    /'aria-label': 'Message'/.test(ED))

  // ── 3 · A MARK-ONLY CHANGE REACHES THE PARENT ──────────────────────────────────────────────────
  /* 🔴 `onChange` STORES THE DOCUMENT UNCONDITIONALLY and only the "you have edited this" FLAG is
   * conditional on the text differing. If `setEditedDoc` were ever moved inside that `if`, a mark-only
   * change would never reach the parent and the content effect would re-set a stale document — which
   * is what this bug was first diagnosed as. It was not the cause, and it would be a real one. */
  const onChange = CW.slice(CW.indexOf('onChange={d => {', mount), CW.indexOf('signatureLines=', mount))
  t('🔴 the editor\'s onChange stores the document BEFORE any "is this an edit" test',
    onChange.indexOf('setEditedDoc(d)') >= 0 && onChange.indexOf('setEditedDoc(d)') < onChange.indexOf('if ('))

  // ── 4 · UNDO EXISTS ────────────────────────────────────────────────────────────────────────────
  /* 🔴 IT DID NOT. This editor builds its extension list by hand and `StarterKit` is deliberately not
   * installed, so nothing brought `prosemirror-history` along: every Cmd+Z in the compose box had
   * silently done nothing since it shipped. Proved absent in both engines before it was added. */
  t('🔴 a History extension is loaded, so Cmd+Z works — including on a mark-only change',
    /from '@tiptap\/pm\/history'/.test(ED) && /^\s*History,$/m.test(ED))
  t('⚠️ …and it comes from the pinned @tiptap/pm, not a new dependency',
    !/@tiptap\/extension-history/.test(read('package.json')))

  // ── 5 · THE TOOLBAR STILL KEEPS THE SELECTION ──────────────────────────────────────────────────
  // ⚠️ UNRELATED TO THE LABEL AND STILL REQUIRED: without it, Chromium collapses the selection on
  // mousedown and B applies to nothing. Both fixes are needed; neither replaces the other.
  const presses = (ED.match(/onMouseDown=\{keepSelection\}/g) || []).length
  t(`⚠️ every toolbar button that acts on the selection still prevents the mousedown default (${presses})`,
    presses >= 7)
  return { ok, bad }
}

;(async () => {
  let fails = 0
  const r = source()
  console.log('── THE WIRING, IN THE SOURCE ───────────────────────────────────────────────────────────')
  for (const n of r.ok) console.log('  ✓ ' + n)
  for (const n of r.bad) console.log('  🔴 ' + n)
  fails += r.bad.length

  let browserPassed = 0
  console.log('\n── THE OPERATOR\'S THREE STEPS, IN A REAL BROWSER — CHROMIUM AND WEBKIT ─────────────────')
  if (process.env.HG_RENDER !== '1') {
    console.log('  ⚠️ SKIPPED — set HG_RENDER=1. It bundles the real ComposeWindow with esbuild and needs')
    console.log('     local Chromium and WebKit builds; the sweep must not depend on either. The run, with')
    console.log('     its numbers, is in docs/fixes-and-gating-report.md.')
  } else {
    const { measure } = require('./outreach-bold-persists-render.cjs')
    const res = await measure()
    for (const line of res.lines) console.log('  ' + line)
    fails += res.fails
    browserPassed = res.lines.filter(l => l.startsWith('✓')).length
  }
  const total = r.ok.length + browserPassed
  console.log(`\n${fails === 0
    ? `✅ all ${total} passed${browserPassed ? ` (${browserPassed} of them in a real browser)` : ''}`
    : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
