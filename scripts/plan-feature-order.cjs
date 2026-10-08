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
  /* ⚠️ `whatsapp-live.ts` IS COMPILED TOO. One row in 'Pro' is a TERNARY on
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
/* ⚠️ `findPlanParityViolations` IS IMPORTED NOW, not merely mentioned. The 'Social media posts' row is
 * mapped at launch, and the claim about it is that the guard REPORTS CLEAN — which can only be said by
 * calling it. ⛔ It is the same function four product surfaces call at module load. */
const { FEATURE_SECTIONS, findPlanParityViolations } = require(path.join(tmp, 'lib/plan-features.js'))
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
  /* ⚠️ AND 'Private events' IS WHERE IT WAS PUT: out of 'Max'. It is `pro: true`, and a Pro row
   * under a heading that says "Max tier" is the thing the move was for. */
  /* ⚠️ THE SECTION TITLES LOST THE WORD "tier" ON 7 October 2026 — they are now exactly the plan
   * names, then gained the word "plan". These two compare against the live titles, so they move with
   * them. */
  t("⚠️ 'Private events' is not in the 'Max plan' section", sectionOf('Private events') !== 'Max plan')
  t("⚠️ …and 'Custom event types & pricing' still is", sectionOf('Custom event types & pricing') === 'Max plan')
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
    /* ⚠️ RENAMED 'Core operations' → 'Starter tier' on 7 October 2026 — wording only, and it completes
     * the set with 'Pro plan' and 'Max plan'. The word "tier" was dropped from all three the same day
     * and "plan" settled on, so each heading names a plan without colliding with the column headers. All nine rows below are `starter: true`, which is
     * what makes the heading accurate rather than merely tidier. */
    ['Starter plan', [
      'Discovery map listing', 'Universal web dashboard', 'QR code', 'Automatic schedule import',
      'Meal deals & upsells', 'Walk-up order processing', 'Instant sold out toggle',
      'Online ordering — Pay at Hatch', 'iPhone, iPad and Android kitchen app',
    ]],
    ['Pro plan', [
      'Offline Order Protection', 'Online payments', 'Advance pre-ordering', 'Pre-order deadline',
      'Customer time slot selection', 'Kitchen capacity management', 'Automated stock countdown',
      'Auto-accept online orders',
      'Branded QR code',
      'Private events',                 // ← moved here, 6 October 2026
      /* ⛔ `true` WITH NO `ROW_FEATURE_MAP` ENTRY, on an explicit instruction — see the long note beside
       * the row itself. It sits here, immediately after Private events, rather than in the coming-soon
       * block at the end of this section, BECAUSE it is no longer coming soon. */
      'Social media posts',
      /* ⚠️ ONE ROW OR TWO, DEPENDING ON THE FLAG — see the note at the compile step. With the flag on,
       * WhatsApp has its own row above the Messenger/Instagram one; with it off there is a single
       * merged row and the Messenger one is hidden by `visibleRows` on the landing. */
      ...(WHATSAPP_LIVE ? ['WhatsApp auto-replies'] : []),
      'Messenger & Instagram auto-replies',
      'Take payment on your phone', 'Advanced reporting',
      'SMS order alerts',
    ]],
    ['Max plan', [
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
  /* ══ 🔴 FLIPPED TO `true` ON 6 October 2026, ON AN EXPLICIT INSTRUCTION ═══════════════════════════
   * Dominic asked for it, was told in terms what it means — `canAccess` is FALSE for every plan on
   * `places_posts_preview`, which is held only through `trucks.feature_overrides` and granted to one
   * truck — and chose it over adding the key to PRO_FEATURES/MAX_FEATURES.
   * ⛔ SO THIS CHECK NO LONGER GUARDS "it is honestly unbuilt". It guards the EXCEPTION, which is the
   * thing now worth pinning: `true` cells, no map entry, and sitting with the built rows rather than in
   * the coming-soon block. If any one of those three drifts the row becomes a different claim. */
  t("🔴 'Social media posts' is Pro ✓ and Max ✓, absent from Starter, and NOT in the coming-soon block", (() => {
    const r = row('Social media posts')
    const sec = FEATURE_SECTIONS.find(s => s.rows.some(x => x.name === 'Social media posts'))
    const i = sec ? sec.rows.findIndex(x => x.name === 'Social media posts') : -1
    /* ⚠️ AND IT IS BEFORE EVERY `coming_soon` ROW IN ITS SECTION. The data order IS the render order —
     * §3 proves nobody re-sorts — so a `true` row sitting among the coming-soon ones would read as one. */
    const firstSoon = sec ? sec.rows.findIndex(x => x.pro === 'coming_soon' || x.max === 'coming_soon') : -1
    return !!r && r.starter === false && r.pro === true && r.max === true
      && i >= 0 && firstSoon >= 0 && i < firstSoon
  })())
  /* ⛔ AND IT IS DIRECTLY AFTER 'Private events', which is where it was asked to go. */
  t("⛔ …directly after 'Private events'", (() => {
    const sec = FEATURE_SECTIONS.find(s => s.rows.some(x => x.name === 'Social media posts'))
    if (!sec) return false
    const names = sec.rows.map(x => x.name)
    return names.indexOf('Social media posts') === names.indexOf('Private events') + 1
  })())
  t('⚠️ …so the Trial column follows Max, with no entry of its own', (() => {
    /* ⚠️ `trialFeatureValue()` RETURNS `row.max` for every row but two, and this is not one of them —
     * so Trial follows Max here. Asserted by naming the two exceptions rather than trusting the rule. */
    const src = fs.readFileSync(path.join(REPO, 'lib/landing-table.ts'), 'utf8')
    return /return row\.max/.test(src)
      && /row\.name === 'Online ordering — Pay at Hatch'/.test(src)
      && /row\.name === 'SMS order alerts'/.test(src)
  })())
  /* ══ 🔴 THE EXCEPTION IS CLOSED — 10 OCTOBER 2026, AT LAUNCH ════════════════════════════════════
   * ⛔ **THIS CHECK USED TO ASSERT THE OPPOSITE, AND ITS OWN NOTE SAID WHEN TO DELETE IT**: *"if the
   * key is ever added to PRO_FEATURES/MAX_FEATURES, the map entry goes in TOO and this check is
   * deleted."* That is what happened, so it is replaced rather than removed quietly.
   * 🔴 THE HISTORY, BECAUSE IT IS THE WHOLE POINT OF THE REPLACEMENT. The absence of a
   * `ROW_FEATURE_MAP` entry was honest while the cells said `coming_soon` — a key would have made an
   * unbuildable promise enforceable. When the cells were flipped to `true` on 6 October the absence
   * became the thing STOPPING the guard from checking them: `findPlanParityViolations()` `continue`s
   * past an unmapped row, so a public, indexed pricing page promised what no plan granted. And adding
   * the entry alone would have thrown at module load, taking out four surfaces in dev, because
   * `canAccess('pro', 'places_posts_preview')` was false.
   * ⚠️ BOTH HALVES MOVED IN ONE EDIT: `schedule_graphics` into `PRO_FEATURES`, and the map entry in. */
  t('🔴 the row is MAPPED now, and the guard checks the promise it makes', (() => {
    const at = PLAN_FEATURES_SRC.indexOf('const ROW_FEATURE_MAP: Record<string, Feature> = {')
    const map = at < 0 ? '' : PLAN_FEATURES_SRC.slice(at)
    return at > 0
      && /'Social media posts': 'schedule_graphics',/.test(map)
      /* ⛔ AND THE GUARD IS **RUN**, not read. It is what the landing, /features, Billing and Admin
       * depend on at module load, so a violation here is four broken surfaces. */
      && Array.isArray(findPlanParityViolations()) && findPlanParityViolations().length === 0
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
  /* ══ ⛔ `app/landing/page.tsx` LEFT THIS LIST — 6 October 2026, AND IT WAS PASSING FALSELY ════════
   * The comparison table moved to /features; the landing has not rendered a row since. **This check
   * went on passing anyway**, because the tombstone comment left in the landing page names both
   * `@/lib/plan-features` and `FEATURE_SECTIONS` — so a regex on raw source found the prose, not the
   * code. Ninth time in this build that a comment has decided a claim about code, and the first to
   * survive a full green sweep. `codeOf` below is the fix, and the entry is re-aimed at the component
   * that actually renders it. */
  const RENDERERS = [
    'components/landing/FeatureComparison.tsx',   // the public comparison table (/features)
    'app/manage/[token]/page.tsx',   // Billing
    'app/admin/page.tsx',            // the admin view
    'lib/plans-pdf.ts',              // the plans PDF
  ]
  /** 🔴 COMMENTS STRIPPED BEFORE EVERY SOURCE ASSERTION BELOW — see the note on RENDERERS. */
  const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const f of RENDERERS) {
    const code = codeOf(read(f))
    t(`🔴 ${f} renders FEATURE_SECTIONS from the shared module`,
      /* ⚠️ `.map` OR `.flatMap` — ADMIN USES `flatMap`, and a bare `/FEATURE_SECTIONS/` is what let the
       * landing's tombstone comment pass this check in the first place. The claim is that the file
       * ITERATES the shared list, so the call is what to look for, not the name. */
      /from '@\/lib\/plan-features'/.test(code) && /FEATURE_SECTIONS\.(map|flatMap)\(/.test(code))
  }
  /* ⛔ AND THE LANDING PAGE NO LONGER DOES, asserted as the absence it now is — so the table coming
   * back to that page without this list being updated fails here rather than passing quietly. */
  t('⛔ …and app/landing/page.tsx no longer renders the table itself', (() => {
    const code = codeOf(read('app/landing/page.tsx'))
    return !/FEATURE_SECTIONS/.test(code)
      /* ⚠️ BUT IT MUST STILL IMPORT THE MODULE: that import is what fires
       * `findPlanParityViolations()` on the landing route. A positive claim beside the absence. */
      && /from '@\/lib\/plan-features'/.test(code)
  })())
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
