#!/usr/bin/env node
// scripts/outreach-templates-layout.cjs — the Templates tab's two views.
//   node scripts/outreach-templates-layout.cjs   (≈ 4 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    a STEP OR A TYPE MISSING FROM THE GRID — a box nobody can see is a box nobody fills, and the
//    composer then suggests nothing for a truck that was due one;
//    red on something that is not a gap, which teaches the eye to ignore red;
//    a second, hand-kept list of tokens — the one that shipped `{{truck name}}` on an active
//    template — instead of the resolver's own vocabulary;
//    and anything but the editor's Save writing `outreach_templates`: the wording is Dominic's.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const FILES = ['lib/outreach-sequence.ts', 'lib/outreach-template-render.ts']
function buildLib(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return { S: req('lib/outreach-sequence.js'), R: req('lib/outreach-template-render.js') }
}

function runLibSuite({ S, R }) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const DAYS = { '1_first_contact': 3, '2_chase_1': 7, '3_chase_2': 14, '4_final_chase': null }

  // ── THE COLUMN HEADINGS' "WHEN" ──────────────────────────────────────────────────────────────
  t('🔴 first contact is day 0', S.stepOffsetLabel('1_first_contact', DAYS) === 'day 0')
  t('🔴 …and each later step shows the interval that LEADS to it, from FOLLOW_UP_DAYS',
    S.stepOffsetLabel('2_chase_1', DAYS) === '+3 days'
    && S.stepOffsetLabel('3_chase_2', DAYS) === '+7 days'
    && S.stepOffsetLabel('4_final_chase', DAYS) === '+14 days')
  t('⚠️ a step whose predecessor has no interval shows nothing, never "+null days"',
    S.stepOffsetLabel('4_final_chase', { ...DAYS, '3_chase_2': null }) === '')
  t('🔴 the grid has FOUR steps and FIVE rows — the default plus the four types',
    S.SLOT_LEAD_TYPES.length === 5 && S.SLOT_LEAD_TYPES[0] === 'any')

  // ── THE TOKEN VOCABULARY IS THE RESOLVER'S ───────────────────────────────────────────────────
  const tokens = R.resolvedTokenReference()
  t('🔴 the token list comes from the resolver and is not empty', Array.isArray(tokens) && tokens.length > 5)
  t('⚠️ every entry has the syntax a person types and a line saying what it fills in',
    tokens.every(x => /^\{\{[a-z0-9_]+\}\}$/.test(x.syntax) && typeof x.description === 'string' && x.description.length > 0))
  t('⚠️ …including the ones the brief names', ['truck_name', 'demo_link'].every(n => tokens.some(x => x.name === n)))
  return { ok, bad }
}

function runCensus(over = {}) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const GRID = stripComments(over.GRID ?? read('components/admin/SequenceGrid.tsx'))
  const TAB = stripComments(over.TAB ?? read('components/admin/TemplatesPanel.tsx'))

  // ── 1 · TWO VIEWS, REMEMBERED ────────────────────────────────────────────────────────────────
  t('🔴 there are two views, and only two in the switch',
    /\[\['sequence', 'Sequence'\], \['templates', 'Templates'\]\] as const/.test(TAB))
  t('🔴 …the last one is remembered, in try/catch',
    /window\.localStorage\.getItem\(TEMPLATES_VIEW_KEY\)/.test(TAB)
    && /window\.localStorage\.setItem\(TEMPLATES_VIEW_KEY, v\)/.test(TAB)
    && (TAB.match(/try \{[^}]*localStorage[^}]*\} catch/g) || []).length >= 2)
  t('⚠️ …and a stored value that is neither is ignored',
    /if \(saved === 'sequence' \|\| saved === 'templates'\) setView\(saved\)/.test(TAB))
  t('🔴 a grid cell opens its template in the Templates view',
    /onOpenTemplate=\{uuid => \{ setHighlightBox\(null\); requestSelect\(uuid\); chooseView\('templates'\) \}\}/.test(TAB))
  t('🔴 …and a "Used in" chip opens the Sequence view with that box outlined',
    /const openBox = \(chipLabel: string\)/.test(TAB) && /setHighlightBox\(slotKey\(/.test(TAB)
    && /highlight=\{highlightBox\}/.test(TAB) && /highlight === key/.test(GRID))

  // ── 2 · THE SEQUENCE VIEW ────────────────────────────────────────────────────────────────────
  t('🔴 columns are the STEPS, all four of them, from CONTACT_KINDS',
    /<thead>[\s\S]{0,400}CONTACT_KINDS\.map\(step =>/.test(GRID))
  t('🔴 rows are the default and the four types, from SLOT_LEAD_TYPES',
    /<tbody>[\s\S]{0,200}SLOT_LEAD_TYPES\.map\(lt =>/.test(GRID))
  t('🔴 …and each column says WHEN, from FOLLOW_UP_DAYS', /stepOffsetLabel\(step, FOLLOW_UP_DAYS\)/.test(GRID))
  t('⚠️ …and each type row says how many trucks it has', /typeCounts\.get\(lt\) \?\? 0\} truck/.test(GRID))
  t('🔴 NO CELL IS AN ALWAYS-OPEN DROPDOWN — there is no <select> in the grid at all',
    !/<select/.test(GRID))
  t('🔴 a cell is a label until it is clicked', /<button type="button" onClick=\{onOpen\}/.test(GRID)
    && /\{open && \(/.test(GRID))
  t('⚠️ …and the one being edited is outlined', /outlined \? 'ring-2 ring-slate-800'/.test(GRID))
  t('⚠️ Esc closes it, and so does a click away',
    /if \(e\.key !== 'Escape'\) return/.test(GRID) && /className="fixed inset-0 z-20" onClick=\{onClose\}/.test(GRID))
  t('🔴 the picker offers "Same as default", the channel\'s templates, and a new one',
    /isDefaultRow \? 'No template' : 'Same as default'/.test(GRID)
    && /\+ Write a new one for this box/.test(GRID))
  t('⚠️ …and the new one CREATES NOTHING until Save: it opens the form',
    /onNewTemplate=\{channel => \{ chooseView\('templates'\); void createTemplate\(channel\) \}\}/.test(TAB))
  t('🔴 a filled cell carries the ↗ that opens its template', /onOpenTemplate\(template\.uuid\)/.test(GRID))
  t('⚠️ …and the name wraps rather than being cut off', /break-words/.test(GRID) && !/truncate/.test(GRID))

  // ── THE DUE PILL AND THE RED ─────────────────────────────────────────────────────────────────
  t('🔴 the due pill renders ONLY above zero — "0 due" appears nowhere',
    /\{due > 0 && \(/.test(GRID) && !/0 due/.test(GRID))
  t('🔴 red is for a gap, and a gap is a box that would suggest nothing',
    /const gap = \(!own && !inherited\) \|\| broken/.test(GRID))
  t('🔴 …and an empty DEFAULT cell that every type covers is not one — it is grey "None"',
    /const matters = gap && \(lt !== ANY_LEAD \|\| due > 0\)/.test(GRID)
    && /text-slate-400">None</.test(GRID))
  t('⚠️ the pill is red only when the box it sits on is a gap',
    /matters \? 'bg-red-100 border-red-300 text-red-800' : 'bg-slate-100/.test(GRID))
  t('⚠️ an inherited cell is dashed and grey, never red',
    /inherited \? 'border-dashed border-slate-300 bg-slate-50'/.test(GRID))
  t('🔴 there is a key under the grid saying what all of that means',
    /red = nothing will be suggested/.test(GRID) && /trucks due at that box now/.test(GRID))

  // ── THE TWO PANELS THAT WENT ─────────────────────────────────────────────────────────────────
  t('🔴 the standing truck-types panel is gone', !/<span className=\{LABEL\}>Truck types<\/span>/.test(GRID)
    && !/Truck types/.test(GRID))
  t('🔴 …its definitions are behind an ⓘ on the row they define, with Rename',
    /aria-label=\{`How \$\{name\(lt as LeadType\)\} is decided`\}/.test(GRID)
    && /function TypePopover/.test(GRID) && /onRename\(type, text\.trim\(\)\)/.test(GRID))
  t('🔴 the changed-type panel is one amber line, and nothing when there is nothing to say',
    /\{changed\.length > 0 && \(/.test(GRID) && /changed type since/.test(GRID))
  t('⚠️ …with the list behind Review', /setReviewOpen\(v => !v\)/.test(GRID))

  // ── 3 · THE TEMPLATES VIEW ───────────────────────────────────────────────────────────────────
  t('🔴 three panes, at the asked-for widths', /gridTemplateColumns: '270px minmax\(0, 1fr\) minmax\(0, 30%\)'/.test(TAB))
  t('🔴 …full height below the switcher, and each pane scrolls on its own',
    /height: 'calc\(100vh - 12rem\)'/.test(TAB)
    && (TAB.match(/flex-1 min-h-0 overflow-y-auto/g) || []).length >= 2)
  t('🔴 …and NOTHING here locks the page — the v4-fixes bug is not reintroduced',
    !/document\.body\.style/.test(TAB) && !/documentElement\.style/.test(TAB))
  t('🔴 the left pane has New template, a search, and the two libraries at the bottom',
    /\+ New template/.test(TAB) && /placeholder="Search templates…"/.test(TAB)
    && /setView\('snippets'\)/.test(TAB) && /setView\('signature'\)/.test(TAB))
  t('🔴 …templates grouped by channel', /\(\['email', 'whatsapp'\] as const\)\.map\(ch =>/.test(TAB))
  t('🔴 …each saying where it is used', /Used in \$\{usedIn\.length\} box/.test(TAB) && /Not in sequence/.test(TAB))
  t('🔴 …and retired ones collapsed', /Retired \(\{listRows\.filter\(r => !r\.active\)\.length\}\)/.test(TAB))
  t('⚠️ the reorder and retire controls survived the move', /title="Move up"/.test(TAB) && /Retire \(kept/.test(TAB))
  t('🔴 the editor no longer carries the "When to use it" controls',
    !/When to use it/.test(TAB) && !/At which stage/.test(TAB) && !/For which trucks/.test(TAB))
  t('⚠️ …and the older tags are still SHOWN, read-only', /Older tags on this row, no longer used to choose/.test(TAB))

  // ── THE INSERT TOKEN MENU ────────────────────────────────────────────────────────────────────
  t('🔴 the menu reads the RESOLVER\'s vocabulary', /<TokenMenu tokens=\{tokenRef\}/.test(TAB)
    && /const tokenRef = useMemo\(\(\) => resolvedTokenReference\(\), \[\]\)/.test(TAB))
  /* ⚠️ THE BAN IS ON A HAND-WRITTEN ENTRY, NOT ON THE CHARACTERS. The tab legitimately PRINTS
   * `{{truck_name}}` in the sentence that explains why `{{truck name}}` is unreadable — an example
   * in an error message is not a second vocabulary. What must never appear is an entry of the
   * resolver's own shape (`syntax:` / `description:`) written out here. */
  t('🔴 …and there is no second, hand-kept list of token names in the tab',
    !/syntax: '/.test(TAB) && !/const TOKENS = \[/.test(TAB))
  t('🔴 it inserts at the cursor, through the existing caret helper',
    /onInsert=\{syntax => insertAtCaret\(syntax\)\}/.test(TAB) && /function TokenMenu/.test(TAB))
  t('⚠️ …and is disabled until a field has been focused, with the reason',
    /disabled=\{!lastFocus\}/.test(TAB) && /Click into the subject or body first/.test(TAB))
  t('⚠️ the conditional PAIRS keep their own control — one click writes both halves',
    /function CondMenu/.test(TAB) && /ownLines: true/.test(TAB))
  t('🔴 the malformed-token guard is untouched', /malformedTokensIn/.test(TAB))
  t('🔴 the Tokens RAIL is gone, and the right pane is the preview',
    !/RAIL_TABS/.test(TAB) && !/rail === 'tokens'/.test(TAB) && /Preview<\/p>/.test(TAB))
  t('⚠️ the preview still names the prospect it renders against, and what did not fill',
    /pick a prospect/.test(TAB) && /Unresolved:/.test(TAB))

  // ── 4 · THE PHONE ────────────────────────────────────────────────────────────────────────────
  t('⚠️ the grid scrolls sideways in its own box, with the row labels pinned',
    /overflow-x-auto/.test(GRID) && (GRID.match(/sticky left-0/g) || []).length === 2)
  t('⚠️ …and the three panes stack', /max-md:grid-cols-1 max-md:h-auto/.test(TAB))

  // ── WHAT MAY NOT CHANGE ──────────────────────────────────────────────────────────────────────
  t('🔴 the only writer of `outreach_templates` is still the editor\'s Save', (() => {
    const writers = []
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        const f = path.join(dir, e.name)
        if (e.isDirectory()) { walk(f); continue }
        if (!/\.(ts|tsx)$/.test(e.name)) continue
        const src = stripComments(fs.readFileSync(f, 'utf8'))
        const re = /from\('outreach_templates'\)\s*\.\s*(insert|update|delete|upsert)/g
        let m
        while ((m = re.exec(src))) writers.push(`${path.relative(REPO, f)}:${m[1]}`)
      }
    }
    for (const d of ['app', 'lib', 'components']) walk(path.join(REPO, d))
    return writers.every(w => w === 'app/api/admin/outreach-templates/route.ts:insert'
      || w === 'app/api/admin/outreach-templates/route.ts:update')
  })())
  t('🔴 the grid still saves a box through the same two actions',
    /action: 'set_slot'/.test(TAB) && /action: 'clear_slot'/.test(TAB))
  t('⚠️ …with "saved" and an Undo', /say\('saved'\)/.test(GRID) && /setUndo\(\{/.test(GRID))
  return { ok, bad }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const GRID_SRC = read('components/admin/SequenceGrid.tsx')
  const TAB_SRC = read('components/admin/TemplatesPanel.tsx')
  /* 🔴 A VARIANT THAT DID NOT APPLY PROVES NOTHING AND LOOKS LIKE A PASS — `String.replace` returns
   * the same string when it finds nothing. Every mutation is checked for having changed something. */
  const changed = (before, after, label) => {
    if (before === after) { console.log(`🔴 ${label}: THE PATCH DID NOT APPLY — its anchor has drifted`); process.exit(1) }
    return after
  }
  for (const [label, over] of [
    ['V1 🔴 the Final chase column is dropped from the grid',
      { GRID: changed(GRID_SRC, GRID_SRC.replace('{CONTACT_KINDS.map(step => (\n                  <th key={step}',
        "{CONTACT_KINDS.filter(k => k !== '4_final_chase').map(step => (\n                  <th key={step}"), 'V1') }],
    ['V2 🔴 a red pill on a filled cell — red stops meaning "a gap"',
      { GRID: changed(GRID_SRC, GRID_SRC.replace(
        "matters ? 'bg-red-100 border-red-300 text-red-800' : 'bg-slate-100 border-slate-300 text-slate-600'",
        "'bg-red-100 border-red-300 text-red-800'"), 'V2') }],
    ['V3 🔴 "0 due" is printed on every empty box',
      { GRID: changed(GRID_SRC, GRID_SRC.replace('{due > 0 && (', '{true && ('), 'V3') }],
    ['V4 🔴 the token list is hard-coded beside the resolver instead of read from it',
      { TAB: changed(TAB_SRC, TAB_SRC.replace('<TokenMenu tokens={tokenRef}',
        "<TokenMenu tokens={[{ syntax: '{{truck_name}}', name: 'truck_name', description: 'the name' }]}"), 'V4') }],
    ['V5 🔴 a cell goes back to an always-open dropdown',
      { GRID: changed(GRID_SRC, GRID_SRC.replace('<button type="button" onClick={onOpen}',
        '<select onChange={e => onChoose(e.target.value)} /><button type="button" onClick={onOpen}'), 'V5') }],
    ['V6 🔴 the truck-types panel comes back as a standing block',
      { GRID: changed(GRID_SRC, GRID_SRC.replace('const CARD = ', 'const PANEL_TITLE = "Truck types"\nconst CARD = '), 'V6') }],
    ['V7 🔴 the Templates view scrolls as one page again',
      { TAB: changed(TAB_SRC, TAB_SRC.replace("height: 'calc(100vh - 12rem)'", "minHeight: '10rem'"), 'V7') }],
  ]) {
    const r = runCensus(over)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    for (const f of r.bad) console.log(`        caught: ${f}`)
    if (!caught) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
  }

  const libVariant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tl-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/outreach-sequence.ts')
    const src = fs.readFileSync(f, 'utf8')
    const out = patch(src)
    if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return buildLib(tmp, tag)
  }
  {
    const libs = libVariant('v8', s => s.replace('  const days = followUpDays[before]', '  const days = 5'))
    const r = runLibSuite(libs)
    const caught = r.bad.length > 0
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V8 🔴 the column headings invent their own cadence`)
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
  const a = show('── THE NUMBERS AND THE VOCABULARY ──────────────────────────────────────────────────────', runLibSuite(libs))
  const b = show('── THE TWO VIEWS ───────────────────────────────────────────────────────────────────────', runCensus())

  console.log('\n── A REAL BROWSER — CHROMIUM AND WEBKIT ────────────────────────────────────────────────')
  if (process.env.HG_RENDER !== '1') {
    console.log('  ⚠️ SKIPPED — set HG_RENDER=1. It needs a build and local browser builds, and the sweep')
    console.log('     must not depend on either. The run, with its numbers, is in the report.')
  } else {
    const { measure } = require('./outreach-templates-render.cjs')
    const res = await measure()
    for (const line of res.lines) console.log('  ' + line)
    fails += res.fails
  }

  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
