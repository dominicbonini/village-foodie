#!/usr/bin/env node
// scripts/plan-feature-order.cjs
//
//   node scripts/plan-feature-order.cjs      (NO NETWORK, NO DATABASE, NO BROWSER, NO LIVE TRUCK)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS: THE ORDER OF THE PLAN FEATURE LIST, AND THE FACT THAT IT IS ONE LIST
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `FEATURE_SECTIONS` in lib/plan-features.ts is rendered by the landing page's comparison table, by
// Billing, by Admin and by the plans PDF. ⛔ NOTHING CHECKED ITS ORDER, so a row could be moved — or
// could drift while a section was edited — and the only way to find out was to look at four screens.
//
// 🔴 TWO ADJACENCIES WERE ASKED FOR BY NAME (6 October 2026, Dominic), and they are what this pins:
//     'Private events'                 directly after 'Branded QR code'
//     'Custom event types & pricing'    directly after 'Schedule page on your own website'
//
// ⛔ AND THE INVARIANT THAT MAKES "ORDER ONLY" TRUE: the same 31 rows, with the same names, the same
// details, the same per-tier cells and the same footnotes as before the move. A reorder that quietly
// changed a cell would be a plan change, not a layout one.
//
// ⚠️ IT LOADS THE REAL MODULE. `lib/plan-features.ts` is TypeScript with an `@/` alias, so it is
// compiled to a temp directory with the repo's own tsc and `require`d — the same technique
// scripts/whatsapp-golive-parity-harness.cjs uses on the same file. Reading the source with a regex
// would be checking the shape of the text that produces the list rather than the list.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const REPO = path.resolve(__dirname, '..')
let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))

// ── COMPILE AND LOAD THE REAL MODULE ──────────────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-plan-order-'))
const cfg = path.join(tmp, 'tsconfig.json')
fs.writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    module: 'commonjs', target: 'es2020', outDir: tmp, rootDir: REPO, skipLibCheck: true,
    esModuleInterop: true, moduleResolution: 'node', baseUrl: REPO, paths: { '@/*': ['./*'] },
    types: ['node'], typeRoots: [path.join(REPO, 'node_modules/@types')],
  },
  /* ⚠️ `whatsapp-live.ts` IS COMPILED TOO. One row in 'Online sales & automation' is a TERNARY on
   * `WHATSAPP_LIVE` — with the flag on the list carries 'WhatsApp auto-replies' as its own row, with it
   * off that row is absent and a merged one is rendered instead. A list pinned without reading the flag
   * would be pinned to one flag state and fail the moment the other is used. */
  files: [path.join(REPO, 'lib/plan-features.ts'), path.join(REPO, 'lib/whatsapp-live.ts')],
}))
try {
  execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', cfg], { stdio: 'pipe' })
} catch (e) {
  console.log('🔴 COMPILE FAILED:\n' + (e.stdout ? e.stdout.toString() : e.message))
  process.exit(1)
}
/* ⚠️ `@/` IS REWRITTEN AT RESOLVE TIME, because tsc emits the alias verbatim into the JavaScript. The
 * same shim the WhatsApp parity harness uses, for the same module. */
const Module = require('module')
const realResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) return realResolve.call(this, path.join(tmp, request.slice(2)), ...rest)
  return realResolve.call(this, request, ...rest)
}
const { FEATURE_SECTIONS } = require(path.join(tmp, 'lib/plan-features.js'))
const { WHATSAPP_LIVE } = require(path.join(tmp, 'lib/whatsapp-live.js'))
/* ⛔ `ROW_FEATURE_MAP` IS MODULE-PRIVATE — it is not exported, deliberately, so only
 * `findPlanParityViolations()` inside that file reads it. Its two entries are therefore checked
 * against the SOURCE TEXT below rather than by calling it, and this comment is here so the next reader
 * knows that is a limitation of the module's surface and not laziness. */
const PLAN_FEATURES_SRC = fs.readFileSync(path.join(REPO, 'lib/plan-features.ts'), 'utf8')

/** Every row, flattened, with the section it is in — document order. */
const flat = FEATURE_SECTIONS.flatMap(s => s.rows.map(r => ({ section: s.title, ...r })))
const names = flat.map(r => r.name)
const at = (name) => names.indexOf(name)
const sectionOf = (name) => flat[at(name)]?.section

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE TWO ADJACENCIES
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · the two rows sit directly after their anchors')

{
  /* 🔴 ASSERTED AS `index + 1`, NOT AS "somewhere after". "Directly after" was the instruction, and a
   * row that drifted one place down would still satisfy a `>` test — which is the version of this
   * check that would quietly stop meaning anything. */
  for (const [row, anchor] of [
    ['Private events', 'Branded QR code'],
    ['Custom event types & pricing', 'Schedule page on your own website'],
  ]) {
    t(`🔴 '${row}' is directly after '${anchor}'`, at(anchor) >= 0 && at(row) === at(anchor) + 1)
    /* ⛔ AND IN THE SAME SECTION AS IT. The first of these two moves crossed a section boundary on
     * purpose, which is why this is worth stating: after the move they are in one section, and a later
     * edit that split them again would pass the index test for exactly one render. */
    t(`⛔ …and in the same section ('${sectionOf(row)}')`, sectionOf(row) === sectionOf(anchor))
  }
  /* ⚠️ AND 'Private events' IS WHERE IT WAS PUT: out of 'Max tier'. It is `pro: true`, and a Pro row
   * under a heading that says "Max tier" is the thing the move was for. */
  t("⚠️ 'Private events' is not in the 'Max tier' section", sectionOf('Private events') !== 'Max tier')
  t("⚠️ …and 'Custom event types & pricing' still is", sectionOf('Custom event types & pricing') === 'Max tier')
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · ORDER ONLY — NOTHING ELSE ABOUT ANY ROW CHANGED
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · order only — the same rows, the same cells, the same keys')

{
  /* 🔴 THE FULL LIST, PINNED. ⛔ NOT A COUNT: a count is satisfied by swapping two rows for two others.
   * This is the names, in order, so ANY future reorder is a deliberate edit to this file.
   * ⚠️ WHICH IS THE POINT — it is not here to forbid reordering, it is here so that reordering cannot
   * happen by accident while somebody is editing a detail three lines away. */
  const EXPECTED = [
    ['Core operations', [
      'Discovery map listing', 'Universal web dashboard', 'QR code', 'Automatic schedule import',
      'Meal deals & upsells', 'Walk-up order processing', 'Instant sold out toggle',
      'Online ordering — Pay at Hatch', 'iPhone, iPad and Android kitchen app',
    ]],
    ['Online sales & automation', [
      'Offline Order Protection', 'Online payments', 'Advance pre-ordering', 'Pre-order deadline',
      'Customer time slot selection', 'Smart Slot Management', 'Automated stock countdown',
      'Auto-accept online orders',
      'Branded QR code',
      'Private events',                 // ← moved here, 6 October 2026
      /* ⚠️ ONE ROW OR TWO, DEPENDING ON THE FLAG — see the note at the compile step. With the flag on,
       * WhatsApp has its own row above the Messenger/Instagram one; with it off there is a single
       * merged row and the Messenger one is hidden by `visibleRows` on the landing. */
      ...(WHATSAPP_LIVE ? ['WhatsApp auto-replies'] : []),
      'Messenger & Instagram auto-replies',
      'Social media posts',             // ← added 6 October 2026, directly above Take payment
      'Take payment on your phone', 'Advanced reporting',
      'SMS order alerts',
    ]],
    ['Max tier', [
      'Multi-device kitchen sync', 'Multi-user access', 'Schedule page on your own website',
      'Custom event types & pricing',   // ← moved here, 6 October 2026
      'Buzzer tracking', 'Kitchen ticket printing', 'Customer-facing display',
      'Digital loyalty stamp cards',
    ]],
  ]
  const actual = FEATURE_SECTIONS.map(s => [s.title, s.rows.map(r => r.name)])
  t('🔴 every section, and every row in it, is where it is expected to be',
    JSON.stringify(actual) === JSON.stringify(EXPECTED))
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED)) {
    console.log('      GOT:\n' + actual.map(([s, rs]) => `      ── ${s}\n` + rs.map(r => `         ${r}`).join('\n')).join('\n'))
  }

  /* ⛔ AND THE TWO MOVED ROWS CARRY EXACTLY THE CELLS THEY CARRIED. The instruction was "order only";
   * these are the two values a reorder is most likely to disturb, so they are stated outright. */
  const row = (n) => flat[at(n)]
  t("⛔ 'Private events' is still Pro ✓ and Max ✓, Starter ✗",
    row('Private events').starter === false && row('Private events').pro === true
    && row('Private events').max === true)
  t("⛔ 'Custom event types & pricing' is still Max only",
    row('Custom event types & pricing').starter === false
    && row('Custom event types & pricing').pro === false
    && row('Custom event types & pricing').max === true)
  /* ⚠️ AND BOTH STILL POINT AT THEIR REAL FEATURE KEYS, which is what `findPlanParityViolations()`
   * walks. A row whose map entry went missing would stop being checked against `canAccess` at all —
   * the guard `continue`s past an unmapped row rather than failing, which is the quiet way for a table
   * to start promising Pro a Max feature. ⛔ READ FROM THE SOURCE because the map is not exported. */
  t('⚠️ …and both still map to their feature keys',
    /'Private events': 'private_events',/.test(PLAN_FEATURES_SRC)
    && /'Custom event types & pricing': 'event_types',/.test(PLAN_FEATURES_SRC))
  /* ══ 🔴 'Social media posts' SAYS "COMING SOON" THE WAY EVERY OTHER UNBUILT ROW DOES ═════════════
   * ⛔ `'coming_soon'` CELLS, NOT `true` CELLS WITH A BADGE. The first attempt at this row ticked Pro
   * and Max and put a new badge beside the name; it was corrected on the grounds that matter here:
   *   • one table should not describe one state in two languages, and
   *   • a hard `true` on a row with no `ROW_FEATURE_MAP` entry is SKIPPED by
   *     `findPlanParityViolations()` — the guard `continue`s past an unmapped row rather than failing —
   *     so the ticks would have been checked by nothing.
   * 🔴 THIS IS THE CHECK THAT WOULD CATCH IT COMING BACK. If somebody "promotes" this row to `true`
   * without also giving it a feature key, that is an unchecked promise and this fails. */
  t("🔴 'Social media posts' is Coming soon on Pro and Max, and absent from Starter", (() => {
    const r = row('Social media posts')
    return !!r && r.starter === false && r.pro === 'coming_soon' && r.max === 'coming_soon'
  })())
  t('⚠️ …so the Trial column says Coming soon too, with no entry of its own', (() => {
    /* ⚠️ `trialFeatureValue()` RETURNS `row.max` for every row but two, and this is not one of them —
     * so Trial follows Max here. Asserted by naming the two exceptions rather than trusting the rule. */
    const src = fs.readFileSync(path.join(REPO, 'lib/landing-table.ts'), 'utf8')
    return /return row\.max/.test(src)
      && /row\.name === 'Online ordering — Pay at Hatch'/.test(src)
      && /row\.name === 'SMS order alerts'/.test(src)
  })())
  t('⛔ …and it has no feature key, because it is not built', (() => {
    /* ⚠️ ASSERTED AS AN ABSENCE ON PURPOSE. A key here would make the row's cells enforceable — and the
     * cells say "coming soon", which is not something `canAccess` can grant. The day it ships, the key
     * and the `true` cells arrive together or not at all. */
    /* ⛔ ANCHORED ON THE DECLARATION, NOT ON THE NAME. `ROW_FEATURE_MAP` is first MENTIONED in a
     * comment at the top of the file, so slicing from `indexOf('ROW_FEATURE_MAP')` covered almost the
     * whole file — including the row itself — and the absence test failed on correct code. Fifth time
     * this project has met a slice whose anchor was not where it looked. */
    const at = PLAN_FEATURES_SRC.indexOf('const ROW_FEATURE_MAP: Record<string, Feature> = {')
    const map = at < 0 ? '' : PLAN_FEATURES_SRC.slice(at)
    return at > 0 && !/'Social media posts'/.test(map)
  })())
  /* ⛔ AND NO ROW CARRIES A SECOND, NAME-SIDE "coming soon" TREATMENT. `'coming_soon'` in a cell is the
   * ONE way this table says it — which is what makes all four renderers agree with no render-site code
   * at all. A `comingSoon` flag on a row would be a second mechanism to keep in step. */
  t('⛔ there is exactly ONE coming-soon mechanism — the cell value',
    !/comingSoon/.test(PLAN_FEATURES_SRC))

  /* 🔴 NO ROW WAS LOST OR GAINED, and the count follows the flag for the reason above. */
  const EXPECTED_ROWS = WHATSAPP_LIVE ? 33 : 32
  t(`🔴 the list is still ${EXPECTED_ROWS} rows, with no duplicate name`,
    flat.length === EXPECTED_ROWS && new Set(names).size === names.length)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · IT IS ONE LIST, AND EVERY SURFACE READS IT
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · one source, and nobody re-sorts it on the way to a screen')

{
  const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')
  /* ══ 🔴 ALL FOUR TABLES AGREE BECAUSE NONE OF THEM WAS TOUCHED (DRY) ═════════════════════════════
   * Adding this row changed ONE file. Every renderer already understood `'coming_soon'`, so the landing
   * table, Billing, Admin and the PDF all print it without a line of render-site code — which is the
   * whole argument for using the existing cell value instead of a new badge. ⚠️ ASSERTED AS "each one
   * can draw a coming-soon cell", so a renderer that quietly stopped handling it would fail here. */
  t('🔴 every renderer already knows how to draw a `coming_soon` cell', (() => {
    const landing = /if \(value === 'coming_soon'\) return 'Coming soon'/.test(read('lib/landing-table.ts'))
    const billing = /val === 'coming_soon' && \(/.test(read('app/manage/[token]/page.tsx'))
    const admin = /val === 'coming_soon' && <span/.test(read('app/admin/page.tsx'))
    const pdf = /label === 'Coming soon' \? 'soon'/.test(read('lib/plans-pdf.ts'))
    return landing && billing && admin && pdf
  })())

  /* 🔴 THE FOUR RENDERERS, BY NAME. ⛔ A fifth that built its own array would be the thing this
   * section exists to catch — "shown on Billing and on the landing page" is only true while both are
   * reading the same export. */
  const RENDERERS = [
    'app/landing/page.tsx',          // the public comparison table
    'app/manage/[token]/page.tsx',   // Billing
    'app/admin/page.tsx',            // the admin view
    'lib/plans-pdf.ts',              // the plans PDF
  ]
  for (const f of RENDERERS) {
    t(`🔴 ${f} renders FEATURE_SECTIONS from the shared module`,
      /from '@\/lib\/plan-features'/.test(read(f)) && /FEATURE_SECTIONS/.test(read(f)))
  }
  /* ⛔ AND NONE OF THEM SORTS IT. A `.sort()` anywhere on the way to a screen would make the order in
   * lib/plan-features.ts a suggestion rather than the answer — and this file's claim meaningless. */
  for (const f of RENDERERS.concat(['lib/landing-table.ts'])) {
    const src = read(f)
    t(`⛔ …and does not re-sort the rows (${f})`,
      !/FEATURE_SECTIONS[\s\S]{0,200}?\.sort\(/.test(src)
      && !/section\.rows[\s\S]{0,80}?\.sort\(/.test(src))
  }
  /* ⚠️ THE LANDING FILTERS, AND THAT IS ALL IT DOES. `visibleRows` drops a row while a flag is off; a
   * filter preserves order, which is why it is allowed where a sort is not. */
  t('⚠️ the landing\'s `visibleRows` filters and does not reorder',
    /export function visibleRows\(section: FeatureSection\): FeatureRow\[\] \{\s*\n\s*return section\.rows\.filter\(row => !HIDDEN_ROWS\.has\(row\.name\)\)\s*\n\}/
      .test(read('lib/landing-table.ts')))
  /* ⚠️ BILLING DOES NOT EVEN FILTER — it maps `section.rows` straight through, so if the landing page
   * renders this order (it does; see docs/feature-order-report.md) Billing necessarily does too. */
  t('⚠️ Billing maps `section.rows` with no filter and no sort',
    /\{FEATURE_SECTIONS\.map\(section => \([\s\S]{0,900}?\{section\.rows\.map\(row => \(/
      .test(read('app/manage/[token]/page.tsx')))
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────────
console.log('')
if (fail === 0) console.log(`✅ all ${pass} passed`)
else console.log(`🔴 ${fail} CHECK(S) FAILED  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
