#!/usr/bin/env node
// scripts/outreach-workspace-v3-fixes.cjs — the three v3 fixes: a grid that is three columns and
// not four, one notes area, and a contact card that does not say "Call" twice.
//   node scripts/outreach-workspace-v3-fixes.cjs   (≈ 4 s: one compile, NO NETWORK, NO MAILBOX,
//   NO DATABASE. Set HG_RENDER=1 to add the headless-browser measurement — see the bottom.)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    the page pushed down again — an extra grid item moves the auto-placement cursor and the
//    centre column lands on row two, which is the bug this build exists to fix and which looked
//    like "a huge empty area" rather than like a layout error;
//    the `notes` COLUMN quietly lost — it is read by the outreach list too, and a build that
//    folded it into the timeline would blank a column another page shows;
//    the note box back to three rows, which is a box that says "one line is expected here";
//    the phone losing its 44px targets, or the laptop losing its only way to ring.
//
// ⚠️ WHY MOST OF THIS IS A CENSUS. What is being asserted is WHICH BREAKPOINT a control belongs to
// and WHICH CONTAINER a card sits in. The tracks themselves are now a pure function
// (`gridTemplateFor`) and are tested as one; the structure around them is class names and nesting,
// which is what the census reads.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0

/* 🔴 COMMENTS ARE STRIPPED BEFORE EVERY CENSUS. This harness family has been bitten twice by not
 * doing it: the comment that RECORDS a removal quotes the thing removed — this file's page
 * comments name `gridColumn: 1`, `max-lg:grid-cols-1`, `AboutCard` and `AddNoteCard`, all of which
 * are asserted GONE below. A raw-text search would find them in their own tombstones and call
 * correct source broken, which teaches whoever hits it to weaken the check. */
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const FILES = ['lib/outreach-workspace.ts']
function buildLib(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return req('lib/outreach-workspace.js')
}

const PAGE_FILE = 'components/admin/ProspectWorkspace.tsx'

/** The grid element and everything inside it, from the real source. */
function gridOf(page) {
  const i = page.indexOf('<div className="grid gap-4 items-start"')
  if (i < 0) return null
  // ⚠️ THE GRID CLOSES AT ITS OWN INDENT (6 spaces). Counting angle brackets would need a JSX
  // parser; the file is uniformly indented and the close is unambiguous.
  const j = page.indexOf('\n      </div>', i)
  return j < 0 ? null : page.slice(i, j)
}

/** Direct children of the grid = the `<div`s at the child indent (8 spaces). */
function directChildren(grid) {
  return (grid.match(/^ {8}<div /gm) || []).length
}

/** One named component's body, so a control elsewhere on the page cannot answer for it. */
function fnOf(page, name) {
  const i = page.indexOf(`function ${name}(`)
  if (i < 0) return null
  const j = page.indexOf('\nfunction ', i + 10)
  return page.slice(i, j > 0 ? j : page.length)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
function runPageSuite(rawPage) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const page = stripComments(rawPage)
  const grid = gridOf(page)
  t('the grid element was found', !!grid)
  if (!grid) return { ok, bad }

  // ── 1 · THREE CONTAINERS, TOP ALIGNED ────────────────────────────────────────────────────────
  t('🔴 the grid has EXACTLY three direct children — left, centre, right', directChildren(grid) === 3)
  t('🔴 …and nothing is explicitly placed: no `gridColumn` anywhere on the page',
    !/gridColumn/.test(page))
  t('🔴 every container is aligned to the top', /className="grid gap-4 items-start"/.test(page))
  t('🔴 no `order` is active at 768px or above — the tablet flip is gone',
    !/max-lg:order-/.test(page))
  t('⚠️ the dead `max-lg:grid-cols-1` is gone — an inline style beat it, so it never applied',
    !/max-lg:grid-cols-1/.test(page))

  // ── 1b · THE LEFT COLUMN HOLDS ALL OF ITS OWN CARDS ──────────────────────────────────────────
  const leftStart = grid.indexOf('<div className="flex flex-col gap-3 min-w-0 max-md:contents">')
  const left = leftStart < 0 ? '' : grid.slice(leftStart, grid.indexOf('\n        <div', leftStart + 10))
  t('🔴 the left column is one container…', leftStart >= 0)
  for (const card of ['<ContactCard ', '<NotesCard ', '<DemoCard ', '<FilesCard ']) {
    t(`…and ${card.trim().slice(1)} is inside it`, left.includes(card))
  }
  t('🔴 the phone order is `max-md:contents` — grid items ONLY below 768px',
    /min-w-0 max-md:contents/.test(page))
  t('…contact, notes, centre, then demo and files',
    /max-md:order-1/.test(left) && /max-md:order-2/.test(left) &&
    /max-md:order-3/.test(grid) && /max-md:order-4/.test(left))

  // ── 2 · ONE NOTES AREA ───────────────────────────────────────────────────────────────────────
  t('🔴 "About this truck" is gone from the page', !/About this truck/.test(page))
  t('🔴 …and so are both components it was made of',
    !/function AboutCard\(/.test(page) && !/function AddNoteCard\(/.test(page))
  const notes = fnOf(page, 'NotesCard')
  t('🔴 there is one Notes card', !!notes)
  if (notes) {
    t('…titled "Notes"', /<span className=\{LABEL_CLS\}>Notes<\/span>/.test(notes))
    /* 🔴 RESTATED (v4): the floor is still `NOTE_BOX_ROWS`, but the growing is no longer
     * `field-sizing: content` — that property REPLACED `rows` where it is supported and rendered
     * this ten-row box as one line in Safari. `GrowingTextarea` does it in JS. */
    t('🔴 the box floors at NOTE_BOX_ROWS rows and grows',
      /<GrowingTextarea id=\{ADD_NOTE_ID\} rows=\{NOTE_BOX_ROWS\}/.test(notes) && !/fieldSizing/.test(notes))
    t('…full column width', /w-full resize-y/.test(notes))
    t('…with the placeholder "Add a note…"', /placeholder="Add a note…"/.test(notes))
    t('…and a Save note button', /'Save note'/.test(notes))
    t('🔴 it is the SAME `add_note` path, into the history',
      /action: 'add_note', prospect_id: p\.id/.test(notes))
    t('⚠️ the box keeps the one id the shortcut and the phone bar focus',
      /id=\{ADD_NOTE_ID\}/.test(notes))
    t('🔴 the saved notes stand under it, newest first…',
      /e\.kind === 'note'/.test(notes) && /localeCompare/.test(notes))
    t('…each in full, with no truncation',
      /whitespace-pre-wrap/.test(notes) && !/line-clamp|truncate/.test(notes))
    t('…NOTES_SHOWN of them, then "Show all"',
      /notes\.slice\(0, NOTES_SHOWN\)/.test(notes) && /Show all \$\{notes\.length\}/.test(notes))
    t('⚠️ …it is a VIEW over the timeline already loaded, not a second fetch',
      /timeline\?\.events/.test(notes) && (notes.match(/fetch\(/g) || []).length === 1)
  }
  const earlier = fnOf(page, 'EarlierNotes')
  t('🔴 the `notes` column is kept, as the last entry', !!earlier)
  if (earlier) {
    t('…labelled "Earlier notes"', /Earlier notes/.test(earlier))
    t('🔴 …invisible when the column is empty', /if \(!current && !editing\) return null/.test(earlier))
    t('🔴 …shown in full, not truncated', /whitespace-pre-wrap/.test(earlier) && !/line-clamp|truncate/.test(earlier))
    t("🔴 …and written the SAME way, through the page's one prospect patch",
      /await onPatch\(\{ notes: text \|\| null \}\)/.test(earlier))
    t('…behind its own Edit', /onClick=\{\(\) => setEditing\(true\)\}/.test(earlier))
  }
  t('🔴 the `notes` column is written in exactly ONE place on the page',
    (page.match(/notes: text \|\| null/g) || []).length === 1)
  t('🔴 …and nothing copies it into a note: `add_note` never carries p.notes',
    !/body: p\.notes/.test(page))
  t('⚠️ N still focuses the one box', /const ADD_NOTE_ID = 'hg-add-note'/.test(page) && /L\.focusNoteBox\(\)/.test(page))
  t("⚠️ …and so does the phone bar's Note button", /onClick=\{focusNoteBox\}/.test(page))

  // ── 3 · THE CONTACT CARD ─────────────────────────────────────────────────────────────────────
  const card = fnOf(page, 'ContactCard')
  t('ContactCard was found', !!card)
  if (card) {
    t('🔴 the compact Call button is still beside the number',
      /<CallButton phone=\{p\.phone\} e164=\{waPhone\} compact \/>/.test(card))
    t('🔴 …and it is the same component, so it places the call exactly as v3 does',
      /a\.href = `tel:\$\{number\}`/.test(page) && !/matchMedia/.test(page) &&
      !/clipboard/.test(fnOf(page, 'CallButton') || ''))
    t('🔴 the row of LARGE Call and WhatsApp buttons renders only below 768px',
      /className="hidden max-md:flex items-center gap-2 mt-1"/.test(card))
    const row = card.slice(card.indexOf('max-md:flex items-center gap-2 mt-1'))
    t('🔴 …and it is hidden, not deleted: the phone keeps all three 44px targets',
      /<CallButton phone=\{p\.phone\} e164=\{waPhone\} \/>/.test(row) &&
      /https:\/\/wa\.me\//.test(row) && />\s*Email\s*</.test(row) &&
      (row.match(/min-h-11/g) || []).length >= 2)
    t('🔴 the Email button no longer carries a second gate of its own',
      !/hidden max-md:block/.test(card))
    t('🔴 no second WhatsApp button: exactly one wa.me on the page…',
      (page.match(/https:\/\/wa\.me\//g) || []).length === 1)
    t("…and it is that row's", /https:\/\/wa\.me\//.test(row))
    t('⚠️ WhatsApp is still reachable two other ways: the tab…',
      /\(\['email', 'call', 'whatsapp'\] as const\)/.test(page))
    t('…and the one-click log', /label: 'WhatsApp sent'/.test(read('lib/outreach-workspace.ts')))
  }

  // ── WHAT NONE OF THIS MAY TOUCH ──────────────────────────────────────────────────────────────
  t('🔴 still one `nextStep` call on the page', (page.match(/nextStep\(/g) || []).length === 1)
  t('🔴 still one contact writer, and the page never touches the table',
    /action: 'log_contact'/.test(page) && !/outreach_contacts/.test(page))
  t('🔴 still one `applyFollowUp`', /const applyFollowUp = useCallback/.test(page))
  t('🔴 still exactly one stage control', (page.match(/OUTREACH_STAGES\.map/g) || []).length === 1)
  t('🔴 do_not_contact still moves only on a click',
    /onChange=\{e => void onPatch\(\{ do_not_contact: e\.target\.checked \? true : null \}\)\}/.test(page))
  t("🔴 the phone's sticky log bar is untouched", /hidden max-md:flex fixed bottom-0/.test(page))
  return { ok, bad }
}

function runLibSuite(W) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const at = w => W.gridTemplateFor(w)
  t('🔴 a phone (390) gets ONE track, and nothing on it is a fixed width',
    at(390) === 'minmax(0, 1fr)')
  t('…and 767 is still a phone', at(767) === 'minmax(0, 1fr)')
  t('🔴 768 is two columns: the left one fixed, the centre fluid',
    at(768) === '380px minmax(0, 1fr)')
  t('…and 1023 still is', at(1023) === '380px minmax(0, 1fr)')
  t('🔴 1024 is three columns', at(1024) === '380px minmax(0, 1fr) 280px')
  t('…and a 16" MacBook Pro (1440) is the same three', at(1440) === '380px minmax(0, 1fr) 280px')
  t('⚠️ the sides step up at 1920, and only there',
    at(1919) === '380px minmax(0, 1fr) 280px' && at(2560) === '420px minmax(0, 1fr) 320px')
  t('🔴 the note box floors at ten rows', W.NOTE_BOX_ROWS >= 10)
  t('…and five notes stand under it before "Show all"', W.NOTES_SHOWN === 5)
  t('⚠️ the approved breakpoints are unchanged',
    W.THREE_COL_AT_PX === 1024 && W.TWO_COL_AT_PX === 768 && W.WIDE_AT_PX === 1920)
  t('⚠️ …and so are the approved widths',
    W.COL_LEFT_PX === 380 && W.COL_RIGHT_PX === 280 && W.COL_LEFT_WIDE_PX === 420 && W.COL_RIGHT_WIDE_PX === 320)
  t('🔴 EMAIL_FRAME_SANDBOX is untouched', W.EMAIL_FRAME_SANDBOX === 'allow-same-origin')
  return { ok, bad }
}

const SRC = read(PAGE_FILE)

;(async () => {
  // ── BROKEN VARIANTS ───────────────────────────────────────────────────────────────────────────
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')

  const pageVariants = [
    ['V1 🔴 the Demo/Files cards are their own grid item again — the bug this build fixes',
      s => s.replace('          <div className="flex flex-col gap-3 min-w-0 max-md:order-4">',
        '        </div>\n        <div style={{ gridColumn: 1 }} className="flex flex-col gap-3 min-w-0 max-md:order-4">')],
    ['V2 the tablet order flip comes back, and is active at 768–1023',
      s => s.replace('className="flex flex-col gap-3 min-w-0 max-md:order-3"',
        'className="flex flex-col gap-3 min-w-0 max-lg:order-1 max-md:order-3"')],
    ['V3 🔴 the `notes` column is CLEARED by its own Save instead of written',
      s => s.replace('await onPatch({ notes: text || null })', 'await onPatch({ notes: null })')],
    ['V4 🔴 "Earlier notes" renders an empty box when the column is empty',
      s => s.replace('if (!current && !editing) return null', 'if (false) return null')],
    ['V5 the saved notes are truncated to one line each',
      s => s.replace('<p className="whitespace-pre-wrap break-words text-slate-700">{n.body}</p>',
        '<p className="truncate text-slate-700">{n.body}</p>')],
    ['V6 the large Call and WhatsApp buttons are back on every screen',
      s => s.replace('className="hidden max-md:flex items-center gap-2 mt-1"', 'className="flex items-center gap-2 mt-1"')],
    ['V7 🔴 the row is hidden EVERYWHERE — the iPhone loses its three thumb targets',
      s => s.replace('className="hidden max-md:flex items-center gap-2 mt-1"', 'className="hidden items-center gap-2 mt-1"')],
    ['V8 🔴 the compact button went with the big one — a laptop cannot ring anybody',
      s => s.replace('<CallButton phone={p.phone} e164={waPhone} compact />', '')],
  ]
  for (const [label, patch] of pageVariants) {
    const mutated = patch(SRC)
    if (mutated === SRC) { console.log(`🔴 ${label}: THE PATCH DID NOT APPLY — the census would prove nothing`); process.exit(1) }
    const r = runPageSuite(mutated)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  const libVariant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `v3f-${tag}-`))
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
    ['v9', 'V9 🔴 a phone is handed the three-column grid — which is what the dead class allowed',
      s => s.replace("if (width < TWO_COL_AT_PX) return 'minmax(0, 1fr)'", '')],
    ['v10', 'V10 the note box is three rows again',
      s => s.replace('export const NOTE_BOX_ROWS = 10', 'export const NOTE_BOX_ROWS = 3')],
  ]) {
    const r = runLibSuite(libVariant(tag, patch))
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  // ── THE REAL SOURCE ───────────────────────────────────────────────────────────────────────────
  console.log('\n── 1 · THE TRACKS, FROM ONE FUNCTION ───────────────────────────────────────────────────')
  const W = buildLib(REPO, 'real')
  const lib = runLibSuite(W)
  for (const n of lib.ok) console.log('  ✓ ' + n)
  for (const n of lib.bad) console.log('  🔴 ' + n)
  fails += lib.bad.length

  console.log('\n── 1–3 · THE PAGE ──────────────────────────────────────────────────────────────────────')
  const r = runPageSuite(SRC)
  for (const n of r.ok) console.log('  ✓ ' + n)
  for (const n of r.bad) console.log('  🔴 ' + n)
  fails += r.bad.length

  /* 🔴 STALE ANCHORS, RESTATED RATHER THAN SILENTLY RE-POINTED (30 September 2026, v3 fixes).
   * Checks in the two earlier workspace harnesses that these three changes made stale, each named
   * with its reason. They are restated in place, in those files, not deleted here:
   *   outreach-workspace-v2.cjs
   *     • "below 1024px it is one grid column…" — it asserted `max-lg:grid-cols-1` was IN THE FILE.
   *       It was, and it never applied: the inline `gridTemplateColumns` on the same element beats
   *       any class. The check passed for two builds while a phone got a 380/1fr/280 grid. This is
   *       the whole reason the decision moved into `gridTemplateFor`.
   *     • "…with the centre column FIRST and the reference column second" — the tablet order flip
   *       is gone; at 768–1023 the two columns are side by side and there is nothing to reorder.
   *     • "fixed sides, fluid centre" — still true, but `minmax(0, 1fr)` is now in the lib, not in
   *       the page, so the page half of that check had to move.
   *   outreach-workspace-v3.cjs
   *     • the "About this truck" checks (the label, `rows={6}`, the confirmation, `AddNoteCard`,
   *       `prospect_id: prospectId`) — both components are gone, replaced by one Notes card. The
   *       rules they protected are re-asserted above and are STRONGER: the column must survive, be
   *       shown in full, and be written in exactly one place. */

  // ── THE HEADLESS MEASUREMENT ──────────────────────────────────────────────────────────────────
  console.log('\n── A REAL BROWSER, AT 1440×800 AND 390×844 ─────────────────────────────────────────────')
  if (process.env.HG_RENDER !== '1') {
    console.log('  ⚠️ SKIPPED — set HG_RENDER=1 to run it. It needs `.next/static/css` from a build and')
    console.log("     a Chromium download, and the sweep must not depend on either. It renders this")
    console.log("     page's own class names against this build's stylesheet and asserts that the")
    console.log('     three containers share a top edge. The run is recorded in the report.')
  } else {
    const { measure } = require('./outreach-workspace-render.cjs')
    const res = await measure()
    for (const line of res.lines) console.log('  ' + line)
    fails += res.fails
  }

  console.log(`\n${fails === 0 ? `✅ all ${lib.ok.length + r.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
